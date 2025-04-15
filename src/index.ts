#!/usr/bin/env node

// Make sure all imports have explicit .js extensions
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import os from 'os';

// Import Gemini configuration
import { getAvailableModels, getModelConfig, DEFAULT_MODEL } from './gemini-config.js';

// Import configuration manager
import { getConfigManager } from './config-manager.js';

// Import our utility modules
import { FileError, PathAccessError, ApiKeyMissingError, NetworkError } from './errors.js';
import { 
  validatePath, 
  isInAllowedDirectory, 
  createSecureTempDir, 
  cleanupTempFiles, 
  logErrorDetails 
} from './utils.js';
import { callGemini } from './gemini-api.js';
import { 
  packageRepository, 
  createPromptForRepoAnalysis 
} from './repomix-utils.js';

// Import our new modules
import {
  validatePathWithSizeCheck,
  checkRateLimit,
  releaseRateLimit,
  SIZE_LIMITS,
  validateDirectorySize
} from './validation.js';
import {
  parseGeminiResponse,
  formatResponseForMCP,
  createStructuredOutput,
  ResponseFormat
} from './response-handler.js';

// Load environment variables from .env file
dotenv.config();

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Version info
const VERSION = "1.0.0";

// Create the MCP server
const server = new McpServer({
  name: "gemini-bridge",
  version: VERSION
});

// Logger function that writes to stderr (not stdout which is used for protocol)
const logger = {
  info: (message: string, ...args: any[]) => {
    console.error(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.error(`[WARN] ${message}`, ...args);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }
};

// Initialize configuration manager
const configManager = getConfigManager(logger);

// Check for Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  logger.error("GEMINI_API_KEY environment variable is required. Please set it in your environment or .env file.");
  process.exit(1);
}

// Define the expected response type locally
type McpContentItem = 
  | { type: "text"; text: string; [key: string]: unknown }
  | { type: "image"; data: string; mimeType: string; [key: string]: unknown }
  | { type: "audio"; data: string; mimeType: string; [key: string]: unknown }
  | { 
      type: "resource"; 
      resource: 
        | { text: string; uri: string; mimeType?: string; [key: string]: unknown } 
        | { uri: string; blob: string; mimeType?: string; [key: string]: unknown }; 
      [key: string]: unknown 
    };

type McpCallbackResponse = { 
  content: McpContentItem[]; 
  isError?: boolean; 
  [key: string]: unknown; 
};

// Configuration resource to access model settings
server.resource(
  "config",
  "config://gemini/models", 
  async (uri) => {
    try {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            defaultModel: configManager.getDefaultModel(),
            defaultTemperature: configManager.getDefaultTemperature(),
            defaultMaxTokens: configManager.getDefaultMaxTokens(),
            availableModels: getAvailableModels(),
            currentSettings: {
              model: configManager.getDefaultModel(),
              temperature: configManager.getDefaultTemperature(),
              maxTokens: configManager.getDefaultMaxTokens()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error("Error retrieving configuration", error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving configuration: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }
);

// Main repository analysis tool with enhanced security and error handling
server.tool(
  "analyze-repository",
  {
    query: z.string().describe("Question or request about the repository"),
    directory: z.string().optional().describe("Path to the repository directory (defaults to current directory)"),
    model: z.string().optional().describe("Gemini model to use: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, or gemini-1.0-pro-vision"),
    maxTokens: z.number().optional().describe("Maximum tokens for Gemini response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Depth of reasoning"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response output format")
  },
  async ({ query, directory, model, maxTokens, temperature, reasoningEffort, outputFormat }): Promise<McpCallbackResponse> => {
    // Check rate limit before processing
    if (!checkRateLimit()) {
      return {
        content: [{ 
          type: "text", 
          text: "Rate limit exceeded. Please try again later." 
        }],
        isError: true
      };
    }
    
    try {
      logger.info("Repository analysis requested", { query, directory });
      
      // Default to current directory if not specified, with enhanced validation
      const repoDir = directory 
        ? await validatePathWithSizeCheck(directory, { 
            allowAbsolute: true,
            isDirectory: true,
            maxSizeBytes: SIZE_LIMITS.MAX_REPO_SIZE_BYTES,
            maxFileCount: SIZE_LIMITS.MAX_FILE_COUNT,
            logger
          }) 
        : process.cwd();
      
      // Check if directory is allowed
      if (!isInAllowedDirectory(repoDir)) {
        throw new PathAccessError(`Access to directory outside of allowed paths: ${repoDir}`);
      }
      
      logger.info(`Analyzing repository at ${repoDir}`);
      
      // Validate repository size if not already done
      if (!directory) {
        const sizeValidation = await validateDirectorySize(repoDir, {
          maxSizeBytes: SIZE_LIMITS.MAX_REPO_SIZE_BYTES,
          maxFileCount: SIZE_LIMITS.MAX_FILE_COUNT,
          logger
        });
        
        if (!sizeValidation.valid) {
          throw new FileError(sizeValidation.error || 'Repository exceeds size limits');
        }
        
        if (sizeValidation.largeFiles && sizeValidation.largeFiles.length > 0) {
          logger.warn(`Repository contains ${sizeValidation.largeFiles.length} large files that may impact performance`);
        }
      }
      
      // Create a secure temporary directory and file for Repomix output
      const { tempDir, tempFile } = createSecureTempDir('gemini-bridge-');
      
      try {
        // Package repository with retry and better error handling
        const packResult = await packageRepository(repoDir, tempFile, logger);
        
        // Read packed content with explicit error handling
        let repoContext;
        try {
          repoContext = await fs.readFile(tempFile, 'utf-8');
        } catch (error) {
          if (error instanceof Error) {
            throw new FileError(`Failed to read repository context: ${error.message}`, error);
          }
          throw new FileError('Failed to read repository context: Unknown error');
        }
        
        // Create a well-formatted prompt
        const prompt = createPromptForRepoAnalysis(query, repoContext, reasoningEffort);
        
        // Call Gemini with better error handling
        const geminiResponseText = await callGemini(prompt, {
          model: model || configManager.getDefaultModel(),
          maxTokens: maxTokens,
          temperature: temperature,
          logger
        });
        
        logger.info("Received response from Gemini");
        
        // Parse the response for better handling
        const parsedResponse = parseGeminiResponse(
          { 
            candidates: [{ 
              content: { 
                parts: [{ text: geminiResponseText }] 
              },
              finishReason: "STOP"
            }],
            usage: {
              promptTokenCount: Math.ceil(prompt.length / 4),
              candidatesTokenCount: Math.ceil(geminiResponseText.length / 4),
              totalTokenCount: Math.ceil((prompt.length + geminiResponseText.length) / 4)
            }
          }, 
          {
            includeUsageInfo: true,
            logger
          }
        );
        
        // Clean up temporary files
        await cleanupTempFiles(tempFile, tempDir, logger);
        
        // Return structured output if requested
        if (outputFormat) {
          return createStructuredOutput(parsedResponse, query, {
            includePrompt: false,
            includeMetadata: true,
            outputFormat: outputFormat === 'json' ? 'json' : 'text',
            logger
          }) as McpCallbackResponse;
        }
        
        // Default format
        return formatResponseForMCP(parsedResponse, {
          includeMetadata: true,
          logger
        }) as McpCallbackResponse;
      } catch (error) {
        // Ensure cleanup happens even if there's an error
        await cleanupTempFiles(tempFile, tempDir, logger);
        throw error;
      }
    } catch (error: any) {
      // Enhanced error handling based on error type
      logErrorDetails(error, logger);
      
      if (error instanceof PathAccessError) {
        return {
          content: [{ 
            type: "text", 
            text: `Path Access Error: ${error.message}\n\nPlease ensure you are requesting a path within the allowed directories.` 
          }],
          isError: true
        };
      } else if (error instanceof FileError) {
        return {
          content: [{ 
            type: "text", 
            text: `File Error: ${error.message}\n\nPlease check that the path exists and is accessible.` 
          }],
          isError: true
        };
      } else if (error instanceof ApiKeyMissingError) {
        return {
          content: [{ 
            type: "text", 
            text: `API Key Error: ${error.message}\n\nPlease check your GEMINI_API_KEY environment variable.` 
          }],
          isError: true
        };
      } else if (error instanceof NetworkError) {
        return {
          content: [{ 
            type: "text", 
            text: `Network Error: ${error.message}\n\nPlease check your internet connection and try again.` 
          }],
          isError: true
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: `Error analyzing repository: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true
        };
      }
    } finally {
      // Always release the rate limit when done
      releaseRateLimit();
    }
  }
);

// Tool for analyzing specific files in a repository with enhanced security
server.tool(
  "analyze-files",
  {
    query: z.string().describe("Question or request about the files"),
    files: z.array(z.string()).describe("List of file paths to analyze"),
    directory: z.string().optional().describe("Base directory for the files (defaults to current directory)"),
    model: z.string().optional().describe("Gemini model to use: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, or gemini-1.0-pro-vision"),
    maxTokens: z.number().optional().describe("Maximum tokens for Gemini response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Depth of reasoning"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response output format")
  },
  async ({ query, files, directory, model, maxTokens, temperature, reasoningEffort, outputFormat }): Promise<McpCallbackResponse> => {
    // Check rate limit before processing
    if (!checkRateLimit()) {
      return {
        content: [{ 
          type: "text", 
          text: "Rate limit exceeded. Please try again later." 
        }],
        isError: true
      };
    }
    
    try {
      logger.info("File analysis requested", { query, files, directory });
      
      // Validate input parameters
      if (!files || files.length === 0) {
        throw new FileError("No files specified for analysis");
      }
      
      // Default to current directory if not specified, with validation
      const baseDir = directory 
        ? await validatePathWithSizeCheck(directory, { 
            allowAbsolute: true,
            isDirectory: true,
            logger
          }) 
        : process.cwd();
      
      // Check if directory is allowed
      if (!isInAllowedDirectory(baseDir)) {
        throw new PathAccessError(`Access to directory outside of allowed paths: ${baseDir}`);
      }
      
      // Validate each file path with enhanced checks
      const validatedFiles = await Promise.all(files.map(async file => {
        const filePath = path.isAbsolute(file) 
          ? file 
          : path.resolve(baseDir, file);
          
        await validatePathWithSizeCheck(filePath, {
          allowAbsolute: true,
          isDirectory: false,
          logger
        });
        
        if (!isInAllowedDirectory(filePath)) {
          throw new PathAccessError(`Access to file outside of allowed paths: ${filePath}`);
        }
        
        return file;
      }));
      
      logger.info(`Analyzing files with base directory: ${baseDir}`);
      
      // Create a secure temporary directory and file
      const { tempDir, tempFile } = createSecureTempDir('gemini-bridge-files-');
      
      try {
        // Package files with better configuration and error handling
        const packResult = await packageRepository(baseDir, tempFile, logger, {
          include: validatedFiles
        });
        
        // Read packed content with error handling
        let packedContent;
        try {
          packedContent = await fs.readFile(tempFile, 'utf-8');
        } catch (error) {
          if (error instanceof Error) {
            throw new FileError(`Failed to read packed file content: ${error.message}`, error);
          }
          throw new FileError('Failed to read packed file content: Unknown error');
        }
        
        // Create a well-formatted prompt
        const fileListText = validatedFiles.join(", ");
        const prompt = `
You are an expert software developer analyzing specific files from a code repository.
Please help the user with the following query about these files.

FILES ANALYZED: ${fileListText}

USER QUERY: ${query}

FILES CONTENT:
${packedContent}

${reasoningEffort === 'high' 
  ? 'Please provide a very thorough and detailed analysis.' 
  : reasoningEffort === 'low' 
  ? 'Please provide a concise analysis.' 
  : 'Please provide a balanced and thorough analysis that addresses the query.'
}

Important:
1. Focus specifically on answering the user's query.
2. Reference specific files and code snippets when relevant.
3. Provide actionable insights and explain the reasoning behind your analysis.
4. If code examples are needed, include them with proper context.
`;
        
        // Call Gemini with better error handling
        const geminiResponseText = await callGemini(prompt, {
          model: model || configManager.getDefaultModel(),
          maxTokens: maxTokens,
          temperature: temperature,
          logger
        });
        
        logger.info("Received response from Gemini");
        
        // Parse the response for better handling
        const parsedResponse = parseGeminiResponse(
          { 
            candidates: [{ 
              content: { 
                parts: [{ text: geminiResponseText }] 
              },
              finishReason: "STOP"
            }],
            usage: {
              promptTokenCount: Math.ceil(prompt.length / 4),
              candidatesTokenCount: Math.ceil(geminiResponseText.length / 4),
              totalTokenCount: Math.ceil((prompt.length + geminiResponseText.length) / 4)
            }
          }, 
          {
            includeUsageInfo: true,
            logger
          }
        );
        
        // Clean up temporary files
        await cleanupTempFiles(tempFile, tempDir, logger);
        
        // Return structured output if requested
        if (outputFormat) {
          return createStructuredOutput(parsedResponse, query, {
            includePrompt: false,
            includeMetadata: true,
            outputFormat: outputFormat === 'json' ? 'json' : 'text',
            logger
          }) as McpCallbackResponse;
        }
        
        // Default format
        return formatResponseForMCP(parsedResponse, {
          includeMetadata: true,
          logger
        }) as McpCallbackResponse;
      } catch (error) {
        // Ensure cleanup happens even if there's an error
        await cleanupTempFiles(tempFile, tempDir, logger);
        throw error;
      }
    } catch (error: any) {
      // Similar error handling pattern as in analyze-repository
      logErrorDetails(error, logger);
      
      if (error instanceof PathAccessError) {
        return {
          content: [{ 
            type: "text", 
            text: `Path Access Error: ${error.message}\n\nPlease ensure you are requesting files within the allowed directories.` 
          }],
          isError: true
        };
      } else if (error instanceof FileError) {
        return {
          content: [{ 
            type: "text", 
            text: `File Error: ${error.message}\n\nPlease check that the specified files exist and are accessible.` 
          }],
          isError: true
        };
      } else if (error instanceof ApiKeyMissingError) {
        return {
          content: [{ 
            type: "text", 
            text: `API Key Error: ${error.message}\n\nPlease check your GEMINI_API_KEY environment variable.` 
          }],
          isError: true
        };
      } else if (error instanceof NetworkError) {
        return {
          content: [{ 
            type: "text", 
            text: `Network Error: ${error.message}\n\nPlease check your internet connection and try again.` 
          }],
          isError: true
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: `Error analyzing files: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true
        };
      }
    } finally {
      // Always release the rate limit when done
      releaseRateLimit();
    }
  }
);

// Add health check method
server.tool(
  "health-check",
  {},
  async () => {
    logger.info("Health check called");
    
    // More comprehensive health check
    try {
      // Check file system access
      const tempTest = await fs.mkdtemp(path.join(os.tmpdir(), 'health-check-'));
      await fs.rmdir(tempTest);
      
      // Check if API key is available (but don't validate it completely for performance)
      if (!GEMINI_API_KEY) {
        return {
          content: [{ 
            type: "text", 
            text: "Warning: GEMINI_API_KEY is not set. The service will not be able to process requests." 
          }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: "Gemini Bridge is healthy and running! All systems operational." 
        }]
      };
    } catch (error) {
      logger.error("Health check failed", error);
      return {
        content: [{ 
          type: "text", 
          text: `Health check failed: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

// Tool for direct chat with Gemini
server.tool(
  "chat-with-gemini",
  {
    prompt: z.string().describe("The message or question to send to Gemini"),
    model: z.string().optional().describe("Gemini model to use: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, or gemini-1.0-pro-vision"),
    maxTokens: z.number().optional().describe("Maximum tokens for Gemini response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)")
  },
  async ({ prompt, model, maxTokens, temperature }): Promise<McpCallbackResponse> => {
    // Check rate limit before processing
    if (!checkRateLimit()) {
      return {
        content: [{
          type: "text",
          text: "Rate limit exceeded. Please try again later."
        }],
        isError: true
      };
    }

    try {
      // Normalize model selection
      const selectedModel = model || configManager.getDefaultModel();
      
      // Validate model selection
      try {
        const modelConfig = getModelConfig(selectedModel);
        logger.info(`Gemini chat requested using ${modelConfig.displayName}`, { promptLength: prompt.length });
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: Invalid model '${selectedModel}'. Available models: ${getAvailableModels().map(m => m.id).join(', ')}`
          }],
          isError: true
        };
      }

      // Call Gemini directly with the user's prompt
      const geminiResponseText = await callGemini(prompt, {
        model: selectedModel,
        maxTokens: maxTokens,
        temperature: temperature,
        logger
      });
      logger.info("Received chat response from Gemini");

      // Parse the response for better handling
      const parsedResponse = parseGeminiResponse(
        { 
          candidates: [{ 
            content: { 
              parts: [{ text: geminiResponseText }] 
            },
            finishReason: "STOP"
          }],
          usage: {
            promptTokenCount: Math.ceil(prompt.length / 4),
            candidatesTokenCount: Math.ceil(geminiResponseText.length / 4),
            totalTokenCount: Math.ceil((prompt.length + geminiResponseText.length) / 4)
          }
        }, 
        {
          includeUsageInfo: true,
          logger
        }
      );

      // Format for MCP
      return formatResponseForMCP(parsedResponse, {
        includeMetadata: true,
        logger
      }) as McpCallbackResponse;

    } catch (error: any) {
      logErrorDetails(error, logger);
      if (error instanceof ApiKeyMissingError) {
        return {
          content: [{
            type: "text",
            text: `API Key Error: ${error.message}\n\nPlease check your GEMINI_API_KEY environment variable.`
          }],
          isError: true
        };
      } else if (error instanceof NetworkError) {
        return {
          content: [{
            type: "text",
            text: `Network Error: ${error.message}\n\nPlease check your internet connection and try again.`
          }],
          isError: true
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `Error chatting with Gemini: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    } finally {
      // Always release the rate limit when done
      releaseRateLimit();
    }
  }
);

// Add tool to configure Gemini settings
server.tool(
  "configure-gemini",
  {
    defaultModel: z.string().optional()
      .describe("Set the default Gemini model to use for all operations"),
    defaultTemperature: z.number().min(0).max(1).optional()
      .describe("Set the default temperature for generation"),
    defaultMaxTokens: z.number().min(1).optional()
      .describe("Set the default maximum tokens for responses")
  },
  async ({ defaultModel, defaultTemperature, defaultMaxTokens }): Promise<McpCallbackResponse> => {
    try {
      let updated = false;
      const changes = [];
      
      if (defaultModel !== undefined) {
        try {
          // Validate the model
          getModelConfig(defaultModel);
          await configManager.setDefaultModel(defaultModel);
          updated = true;
          changes.push(`Default model set to ${defaultModel}`);
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error: Invalid model '${defaultModel}'. Available models: ${getAvailableModels().map(m => m.id).join(', ')}`
            }],
            isError: true
          };
        }
      }
      
      if (defaultTemperature !== undefined) {
        try {
          await configManager.setDefaultTemperature(defaultTemperature);
          updated = true;
          changes.push(`Default temperature set to ${defaultTemperature}`);
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error setting temperature: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
      
      if (defaultMaxTokens !== undefined) {
        try {
          await configManager.setDefaultMaxTokens(defaultMaxTokens);
          updated = true;
          changes.push(`Default maximum tokens set to ${defaultMaxTokens}`);
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error setting maximum tokens: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
      
      if (!updated) {
        return {
          content: [{
            type: "text",
            text: "No changes were made. Please specify at least one setting to update."
          }]
        };
      }
      
      return {
        content: [{
          type: "text",
          text: `Configuration updated successfully:\n${changes.join('\n')}`
        }]
      };
    } catch (error) {
      logger.error("Error updating configuration", error);
      return {
        content: [{
          type: "text",
          text: `Error updating configuration: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Add resources/list method to support MCP protocol
server.resource("schema", "schema://metadata", async () => {
  return {
    contents: [
      {
        uri: "schema://metadata",
        text: JSON.stringify({
          description: "Gemini Bridge for repository analysis and direct chat",
          version: VERSION,
          tools: [
            {
              name: "analyze-repository",
              description: "Analyze a code repository using Gemini AI"
            },
            {
              name: "analyze-files",
              description: "Analyze specific files using Gemini AI"
            },
            {
              name: "chat-with-gemini",
              description: "Send a direct message or question to Gemini",
              models: getAvailableModels().map(model => ({
                id: model.id,
                name: model.displayName,
                description: model.description
              })),
              configResource: "config://gemini/models"
            },
            {
              name: "health-check",
              description: "Check if the service is healthy"
            },
            {
              name: "configure-gemini",
              description: "Configure default settings for Gemini operations"
            }
          ]
        })
      }
    ]
  };
});

// Add prompts/list method to support MCP protocol
server.prompt("analyze", {
  query: z.string().describe("Question about repository or code")
}, ({ query }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Analyze the following code/repository: ${query}`
      }
    }
  ]
}));

// Start the server
async function runServer() {
  try {
    logger.info(`Starting Gemini Bridge MCP Server v${VERSION}`);
    
    // Log environment info
    logger.info(`Node.js version: ${process.version}`);
    logger.info(`Current directory: ${process.cwd()}`);
    logger.debug('Environment variables:', process.env);
    
    // Validate API key but don't use it yet
    if (!GEMINI_API_KEY) {
      throw new ApiKeyMissingError("GEMINI_API_KEY is not defined");
    }
    
    // Display key type without revealing the key
    const keyType = GEMINI_API_KEY.endsWith('.json') 
      ? 'JSON Service Account' 
      : GEMINI_API_KEY.toLowerCase() === 'adc'
      ? 'Application Default Credentials'
      : 'API Key';
    
    logger.info(`Using Gemini authentication type: ${keyType}`);
    
    // Create the transport and connect
    const transport = new StdioServerTransport();
    
    logger.info("Connecting to transport");
    await server.connect(transport);
    
    logger.info("Gemini Bridge MCP Server running on stdio");
    
    // Display all available options
    logger.info(`Available tools: analyze-repository, analyze-files, chat-with-gemini, configure-gemini, health-check`);
    logger.info(`Available Gemini models: ${getAvailableModels().map(m => m.id).join(', ')}`);
    logger.info(`Default model: ${configManager.getDefaultModel()}`);
    logger.debug("Server initialization complete");
  } catch (error: any) {
    logErrorDetails(error, logger);
    process.exit(1);
  }
}

// Set up graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Run the server
runServer();
