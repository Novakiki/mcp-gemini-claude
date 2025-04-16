#!/usr/bin/env node

// Make sure all imports have explicit .js extensions
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import { existsSync } from 'fs';
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import os from 'os';

// Import Gemini configuration
import { getAvailableModels, getModelConfig, DEFAULT_MODEL } from './gemini-config.js';

// Import configuration and context managers
import { getConfigManager } from './config-manager.js';
import { getContextManager } from './context-manager.js';

// Import our new enhanced modules
import { 
  checkRateLimit, 
  releaseRateLimit, 
  SIZE_LIMITS 
} from './validation.js';

// Import bridge tools
import {
  chatWithClaudeTool,
  evolveCodeTool,
  manageContextTool,
  configureClaudeTool
} from './bridge-tools.js';
import { 
  callGemini 
} from './gemini-api.js';
import {
  enhancedRepositoryAnalysis,
  enhancedFileAnalysis
} from './enhanced-repository-analysis.js';
import {
  parseGitHubRepository,
  processGitHubRepository
} from './github-utils.js';
import {
  formatErrorForResponse,
  logErrorDetails,
  ApiKeyMissingError,
  NetworkError,
  FileError,
  PathAccessError
} from './errors.js';
import {
  parseGeminiResponse,
  formatResponseForMCP,
  createStructuredOutput
} from './response-handler.js';
import {
  cleanupTempFiles
} from './utils.js';
import {
  enhancedPackageRepository,
  extractRepositoryStructure
} from './repomix-utils.js';
import {
  selectBestTemplate,
  buildPrompt
} from './prompt-templates.js';

// Import shared types
import {
  McpContentItem,
  McpCallbackResponse,
  RepositoryAnalysisOptions, // For enhancedRepositoryAnalysis call
  FileAnalysisOptions, // For enhancedFileAnalysis call
  Logger,
  AnalysisType,
  ReasoningEffort,
  OutputFormat,
  ConfigManagerInterface
} from './types.js';

// Load environment variables with profile support
function loadEnvironmentVariables() {
  // Load .env file first
  dotenv.config();
  
  // Check for profile-specific .env file
  const envProfile = process.env.MCP_PROFILE;
  if (envProfile) {
    const profileEnvPath = path.join(process.cwd(), `.env.${envProfile}`);
    
    if (existsSync(profileEnvPath)) {
      console.error(`Loading profile-specific environment from ${profileEnvPath}`);
      dotenv.config({ path: profileEnvPath });
    }
  }
  
  // Allow overriding the active profile
  if (envProfile) {
    try {
      const configManager = getConfigManager();
      const profiles = configManager.getProfiles();
      
      if (profiles[envProfile]) {
        console.error(`Setting active profile to '${envProfile}' from environment`);
        configManager.switchProfile(envProfile);
      } else {
        console.error(`Profile '${envProfile}' from environment not found`);
      }
    } catch (error) {
      console.error(`Error switching to profile '${envProfile}'`, error);
    }
  }
}

// Call this function before checking API keys
loadEnvironmentVariables();

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Version info
const VERSION = "1.0.0";

// Create the MCP server
const server = new McpServer({
  name: "claude-gemini-bridge",
  version: VERSION
});

// Logger function that writes to stderr (not stdout which is used for protocol)
const logger: Logger = {
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

// Check for Claude API key (warning only - not all tools require it)
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
if (!CLAUDE_API_KEY) {
  logger.warn("CLAUDE_API_KEY environment variable is not set. Claude-specific tools will not be functional.");
}

// Configuration resource to access Gemini model settings
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

// Configuration resource to access Claude model settings
server.resource(
  "config",
  "config://claude/models", 
  async (uri) => {
    try {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            defaultModel: configManager.getClaudeModel(),
            defaultTemperature: configManager.getClaudeTemperature(),
            defaultMaxTokens: configManager.getClaudeMaxTokens(),
            defaultSystemPrompt: configManager.getClaudeSystemPrompt(),
            availableModels: [
              {
                id: "claude-3-opus-20240229",
                displayName: "Claude 3 Opus",
                description: "Most powerful model for complex tasks requiring careful reasoning"
              },
              {
                id: "claude-3-sonnet-20240229",
                displayName: "Claude 3 Sonnet",
                description: "Balanced model with strong performance and faster response times"
              },
              {
                id: "claude-3-haiku-20240307",
                displayName: "Claude 3 Haiku",
                description: "Fastest and most compact model for quick responses and high throughput"
              }
            ],
            currentSettings: {
              model: configManager.getClaudeModel(),
              temperature: configManager.getClaudeTemperature(),
              maxTokens: configManager.getClaudeMaxTokens(),
              systemPrompt: configManager.getClaudeSystemPrompt()
            },
            apiKeySet: !!process.env.CLAUDE_API_KEY
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error("Error retrieving Claude configuration", error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving Claude configuration: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }
);

// Configuration resource to access all settings
server.resource(
  "config",
  "config://gemini-claude", 
  async (uri) => {
    try {
      const configManager = getConfigManager(logger);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            config: configManager.getConfig(),
            profiles: configManager.getProfiles(),
            activeProfile: configManager.getActiveProfile()
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

// Context resource to access shared contexts
server.resource(
  "context",
  new ResourceTemplate(
    "context://{contextId}",
    {
      list: async () => {
        try {
          const contextManager = getContextManager(logger);
          const contexts = await contextManager.listContexts();
          
          return {
            resources: contexts.map(context => ({
              uri: `context://${context.id}`,
              text: `Context for ${context.repositoryPath}`,
              name: context.id
            }))
          };
        } catch (error) {
          logger.error("Error listing contexts", error);
          return { resources: [] };
        }
      }
    }
  ),
  async (uri, { contextId }) => {
    try {
      const contextManager = getContextManager(logger);
      
      // Handle parameter being an array
      const id = Array.isArray(contextId) ? contextId[0] : contextId as string;
      
      const context = await contextManager.getContext(id);
      
      if (!context) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: `Context '${id}' not found`
            }, null, 2)
          }]
        };
      }
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(context, null, 2)
        }]
      };
    } catch (error) {
      logger.error(`Error retrieving context`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving context: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }
);

// Configuration profile resource
server.resource(
  "config",
  new ResourceTemplate(
    "config://gemini-claude/profile/{profile}",
    {
      list: async () => {
        const configManager = getConfigManager(logger);
        const profiles = configManager.getProfiles();
        
        return {
          resources: Object.keys(profiles).map(profileName => ({
            uri: `config://gemini-claude/profile/${profileName}`,
            text: profiles[profileName].description || profileName,
            name: profileName
          }))
        };
      }
    }
  ),
  async (uri, { profile }) => {
    try {
      const configManager = getConfigManager(logger);
      const profiles = configManager.getProfiles();
      
      // Handle profile potentially being an array from ResourceTemplate
      const profileName = Array.isArray(profile) ? profile[0] : profile as string;

      if (!profiles[profileName]) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: `Profile '${profileName}' not found`
            }, null, 2)
          }]
        };
      }
      
      return {
        contents: [{
          uri: uri.href,
          // Handle profile potentially being an array from ResourceTemplate
          text: JSON.stringify(profiles[profileName], null, 2)
        }]
      };
    } catch (error) {
      // Handle potential error during profile lookup
      // Handle profile potentially being an array from ResourceTemplate
      const profileName = Array.isArray(profile) ? profile[0] : profile as string;
      logger.error(`Error retrieving profile '${profileName}'`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving profile: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }
);

// Shared function for GitHub Analysis Logic
async function _handleAnalyzeGithubRepository(
  { repository, query, branch, subdir, model, maxTokens, temperature, reasoningEffort, outputFormat, analysisType }: 
  { repository: string; query: string; branch?: string; subdir?: string; model?: string; maxTokens?: number; temperature?: number; reasoningEffort?: ReasoningEffort; outputFormat?: OutputFormat; analysisType?: AnalysisType },
  configManager: ConfigManagerInterface,
  logger: Logger
): Promise<McpCallbackResponse> {
  let tempFile: string | null = null;
  let tempDir: string | null = null;

  try {
    // Parse GitHub repository
    const repoInfo = parseGitHubRepository(repository);
    
    logger.info(`GitHub repository analysis requested for ${repoInfo.owner}/${repoInfo.repo}`, {
      branch: branch || repoInfo.branch,
      subdir: subdir || repoInfo.path,
      analysisType: analysisType || 'auto-detect'
    });
    
    // Process GitHub repository
    const processedRepo = await processGitHubRepository({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch: branch || repoInfo.branch,
      path: subdir || repoInfo.path,
      query,
      analysisType,
      maxTokens: maxTokens || configManager.getDefaultMaxTokens(),
      smartFiltering: true,
      logger
    });

    tempFile = processedRepo.tempFile;
    tempDir = processedRepo.tempDir;
    const { repoPath, context, packResult } = processedRepo;
    
    // Read packed content
    const repoContent = await fs.readFile(tempFile, 'utf-8');
    
    // Extract repository structure
    const repoStructure = await extractRepositoryStructure(repoPath, {
      maxDepth: 5,
      maxEntries: 200,
      logger
    });
    
    // Select appropriate template
    const templateKey = selectBestTemplate(query, analysisType);
    logger.info(`Selected analysis template: ${templateKey}`);
    
    // Add GitHub-specific context to the prompt
    const githubContext = `
GitHub Repository: ${repoInfo.owner}/${repoInfo.repo}
${context.repository.description ? `Description: ${context.repository.description}` : ''}
${context.repository.stars ? `Stars: ${context.repository.stars} | Forks: ${context.repository.forks} | Open Issues: ${context.repository.issues}` : ''}
${context.repository.language ? `Primary Language: ${context.repository.language}` : ''}
${context.repository.lastUpdated ? `Last Updated: ${context.repository.lastUpdated}` : ''}
Branch: ${context.repository.branch}
`.trim();
    
    // Build prompt with GitHub context
    const prompt = buildPrompt(templateKey, {
      query: query,
      repoStructure: repoStructure,
      repoContent: repoContent,
      githubContext: githubContext
    }, {
      reasoningEffort: reasoningEffort
    });
    
    // Call Gemini
    logger.info("Calling Gemini with GitHub repository analysis prompt");
    const geminiResponseText = await callGemini(prompt, {
      model: model || configManager.getDefaultModel(),
      maxTokens: maxTokens || configManager.getDefaultMaxTokens(),
      temperature: temperature || configManager.getDefaultTemperature(),
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
        }]
      }, 
      {
        includeUsageInfo: true,
        logger
      }
    );
    
    // Format response
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
    logErrorDetails(error, logger);
    return formatErrorForResponse(error);
  } finally {
    // Clean up temporary files safely
    if (tempFile && tempDir) {
      await cleanupTempFiles(tempFile, tempDir, logger);
    }
  }
}

// Enhanced repository analysis tool
server.tool(
  "analyze-repository",
  {
    query: z.string().describe("Question or request about the repository"),
    directory: z.string().optional().describe("Path to the repository directory or GitHub URL (owner/repo)"),
    model: z.string().optional().describe("Gemini model to use: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, or gemini-1.0-pro-vision"),
    maxTokens: z.number().optional().describe("Maximum tokens for Gemini response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Depth of reasoning"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response output format"),
    analysisType: z.enum(["architecture", "security", "performance", "documentation", "testing", "comprehensive", "bug"]).optional().describe("Type of analysis to perform"),
    analysisLevel: z.enum(["overview", "component", "detail"]).optional().describe("Level of analysis in hierarchical approach"),
    component: z.string().optional().describe("Specific component to analyze in component/detail level"),
    previousAnalysisId: z.string().optional().describe("ID of previous analysis to build upon for component/detail level"),
    branch: z.string().optional().describe("Branch to analyze when directory is a GitHub URL")
  },
  async (args): Promise<McpCallbackResponse> => {
    const { query, directory, model, maxTokens, temperature, reasoningEffort, outputFormat, analysisType, analysisLevel, component, previousAnalysisId, branch } = args;
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
      // Check if directory looks like a GitHub URL
      if (directory && (directory.includes('github.com') || (directory.includes('/') && !existsSync(directory)))) {
        try {
          // Attempt to parse as GitHub repo
          const repoInfo = parseGitHubRepository(directory);
          
          // If successful, delegate to the shared function
          logger.info(`Detected GitHub repository, delegating analysis: ${repoInfo.owner}/${repoInfo.repo}`);
          
          // Replace server.callInternalTool with direct function call
          return await _handleAnalyzeGithubRepository({
            repository: directory,
            query,
            branch: branch || repoInfo.branch,
            subdir: repoInfo.path,
            model,
            maxTokens,
            temperature,
            reasoningEffort,
            outputFormat,
            analysisType
          }, configManager, logger);

        } catch (error) {
          // Not a GitHub repo, continue with local analysis
          logger.debug(`Not a parseable GitHub repository, continuing with local analysis: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Use imported type for enhancedRepositoryAnalysis options
      // If previousAnalysisId is provided, retrieve the previous analysis
      let previousAnalysis: string | undefined;
      if (previousAnalysisId) {
        try {
          // TODO: Implement a mechanism to retrieve previous analysis from storage
          // For now, log a warning
          logger.warn(`Previous analysis retrieval not yet implemented, ignoring previousAnalysisId: ${previousAnalysisId}`);
        } catch (error) {
          logger.error(`Failed to retrieve previous analysis with ID: ${previousAnalysisId}`, error);
        }
      }

      return await enhancedRepositoryAnalysis({
        query,
        directory,
        model: model || configManager.getDefaultModel(),
        maxTokens: maxTokens || configManager.getDefaultMaxTokens(),
        temperature: temperature || configManager.getDefaultTemperature(),
        reasoningEffort,
        outputFormat,
        analysisType,
        analysisLevel,
        component,
        previousAnalysis,
        logger,
        includeStructure: true,
        includeImports: true,
        smartFiltering: true
      } as RepositoryAnalysisOptions);
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    } finally {
      // Always release the rate limit when done
      releaseRateLimit();
    }
  }
);

// Enhanced file analysis tool
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
      // Use imported type for enhancedFileAnalysis options
      return await enhancedFileAnalysis({
        query,
        files,
        directory,
        model: model || configManager.getDefaultModel(),
        maxTokens: maxTokens || configManager.getDefaultMaxTokens(),
        temperature: temperature || configManager.getDefaultTemperature(),
        reasoningEffort,
        outputFormat,
        logger
      } as FileAnalysisOptions);
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    } finally {
      // Always release the rate limit when done
      releaseRateLimit();
    }
  }
);

// GitHub repository analysis tool
server.tool(
  "analyze-github-repository",
  {
    repository: z.string().describe("GitHub repository URL or owner/repo format"),
    query: z.string().describe("Question or request about the repository"),
    branch: z.string().optional().describe("Repository branch to analyze (defaults to main branch)"),
    subdir: z.string().optional().describe("Subdirectory within the repository to focus analysis on"),
    model: z.string().optional().describe("Gemini model to use"),
    maxTokens: z.number().optional().describe("Maximum tokens for Gemini response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Depth of reasoning"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response output format"),
    analysisType: z.enum(["architecture", "security", "performance", "documentation", "testing", "comprehensive", "bug"]).optional().describe("Type of analysis to perform")
  },
  // Call the shared function directly
  async (args): Promise<McpCallbackResponse> => {
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
        return await _handleAnalyzeGithubRepository(args, configManager, logger);
    } finally {
        // Always release the rate limit when done
        releaseRateLimit();
    }    
  }
);

// Chat with Claude directly
server.tool(
  chatWithClaudeTool.name,
  chatWithClaudeTool.schema,
  chatWithClaudeTool.handler
);

// Evolve code using Claude and Gemini
server.tool(
  evolveCodeTool.name,
  evolveCodeTool.schema,
  evolveCodeTool.handler
);

// Manage shared context between models
server.tool(
  manageContextTool.name,
  manageContextTool.schema,
  manageContextTool.handler
);

// Configure Claude settings
server.tool(
  configureClaudeTool.name,
  configureClaudeTool.schema,
  configureClaudeTool.handler
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

// Direct chat with Gemini
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
        maxTokens: maxTokens || configManager.getDefaultMaxTokens(),
        temperature: temperature || configManager.getDefaultTemperature(),
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
          }]
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
      return formatErrorForResponse(error);
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
      return formatErrorForResponse(error);
    }
  }
);

// Add configuration management tool
server.tool(
  "manage-configuration",
  {
    action: z.enum([
      "get",
      "set",
      "create-profile",
      "update-profile",
      "delete-profile",
      "switch-profile",
      "list-profiles",
      "update-github"
    ]).describe("Configuration action to perform"),
    profile: z.string().optional().describe("Profile name for profile-related actions"),
    settings: z.record(z.any()).optional().describe("Settings to update"),
    format: z.enum(["json", "text"]).optional().default("text").describe("Response format")
  },
  async ({ action, profile, settings, format }): Promise<McpCallbackResponse> => {
    try {
      const configManager = getConfigManager(logger);
      let result: any;
      
      switch (action) {
        case "get":
          if (profile) {
            // Get specific profile
            const profiles = configManager.getProfiles();
            if (!profiles[profile]) {
              return {
                content: [{
                  type: "text",
                  text: `Error: Profile '${profile}' not found`
                }],
                isError: true
              };
            }
            result = profiles[profile];
          } else {
            // Get active configuration
            result = configManager.getConfig();
          }
          break;
          
        case "set":
          if (!settings) {
            return {
              content: [{
                type: "text",
                text: "Error: No settings provided"
              }],
              isError: true
            };
          }
          
          // Update each setting
          for (const [key, value] of Object.entries(settings)) {
            switch (key) {
              case "defaultModel":
                await configManager.setDefaultModel(value as string);
                break;
              case "defaultTemperature":
                await configManager.setDefaultTemperature(value as number);
                break;
              case "defaultMaxTokens":
                await configManager.setDefaultMaxTokens(value as number);
                break;
              default:
                logger.warn(`Unknown setting: ${key}`);
            }
          }
          
          result = {
            message: "Settings updated successfully",
            updatedSettings: settings
          };
          break;
          
        case "create-profile":
          if (!profile) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile name is required"
              }],
              isError: true
            };
          }
          
          if (!settings) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile configuration is required"
              }],
              isError: true
            };
          }
          
          await configManager.createProfile({
            name: profile,
            description: settings.description,
            extends: settings.extends,
            config: settings.config || {}
          });
          
          result = {
            message: `Profile '${profile}' created successfully`
          };
          break;
          
        case "update-profile":
          if (!profile) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile name is required"
              }],
              isError: true
            };
          }
          
          if (!settings) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile updates are required"
              }],
              isError: true
            };
          }
          
          await configManager.updateProfile(profile, {
            description: settings.description,
            extends: settings.extends,
            config: settings.config
          });
          
          result = {
            message: `Profile '${profile}' updated successfully`
          };
          break;
          
        case "delete-profile":
          if (!profile) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile name is required"
              }],
              isError: true
            };
          }
          
          await configManager.deleteProfile(profile);
          
          result = {
            message: `Profile '${profile}' deleted successfully`
          };
          break;
          
        case "switch-profile":
          if (!profile) {
            return {
              content: [{
                type: "text",
                text: "Error: Profile name is required"
              }],
              isError: true
            };
          }
          
          await configManager.switchProfile(profile);
          
          result = {
            message: `Switched to profile '${profile}'`,
            activeProfile: profile
          };
          break;
          
        case "list-profiles":
          result = {
            profiles: configManager.getProfiles(),
            activeProfile: configManager.getActiveProfile()
          };
          break;
          
        case "update-github":
          if (!settings) {
            return {
              content: [{
                type: "text",
                text: "Error: GitHub settings are required"
              }],
              isError: true
            };
          }
          
          await configManager.updateGitHubConfig(settings);
          
          result = {
            message: "GitHub configuration updated successfully"
          };
          break;
          
        default:
          return {
            content: [{
              type: "text",
              text: `Error: Unknown action '${action}'`
            }],
            isError: true
          };
      }
      
      // Format response
      if (format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } else {
        // Text format
        let responseText = "";
        
        if (action === "list-profiles") {
          responseText = `Available profiles:\n`;
          for (const [name, profileData] of Object.entries(result.profiles)) {
            const isActive = name === result.activeProfile;
            const description = profileData && typeof profileData === 'object' && 'description' in profileData 
              ? profileData.description 
              : '';
            responseText += `${isActive ? '* ' : '  '}${name}${description ? `: ${description}` : ''}\n`;
          }
        } else if (action === "get") {
          responseText = `Configuration:\n${JSON.stringify(result, null, 2)}`;
        } else {
          responseText = result.message || JSON.stringify(result, null, 2);
        }
        
        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      }
    } catch (error) {
      // Re-check profile type within the catch block for safety
      const profileName = typeof profile === 'string' ? profile : (Array.isArray(profile) ? profile[0] : 'unknown');
      logErrorDetails(error, logger);
      // Use the determined profileName in the error message
      return formatErrorForResponse(`Error performing action '${action}'${profileName !== 'unknown' ? ` on profile '${profileName}'` : ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

// Define tool descriptions separately so they can be used consistently
const TOOL_DESCRIPTIONS = {
  analyzeRepository: "Advanced code repository analysis that examines architecture, security, performance, and more using hierarchical analysis. Supports both local repositories and GitHub URLs, with ability to focus from high-level overview to detailed component inspection.",
  analyzeGithubRepository: "Directly analyze GitHub repositories by URL or owner/repo format. Provides detailed code insights with support for branch selection and subdirectory focusing. Includes repository metadata and contextual analysis.",
  analyzeFiles: "Analyze specific files with enhanced context understanding. Perfect for examining code snippets, configuration files, or documentation with precise insights about implementation, patterns, and relationships between files.",
  chatWithGemini: "Send messages directly to Gemini models with control over response generation. Supports multiple models with customizable parameters for temperature and token length.",
  chatWithClaude: "Send messages directly to Claude models with control over response generation. Supports system prompts and customizable parameters for temperature and token length.",
  evolveCode: "Collaborative code evolution using both Claude and Gemini. Analyzes code structure with Gemini and generates evolution plans with Claude for refactoring, improvements, transformations, testing, and documentation.",
  configureGemini: "Set default parameters for all Gemini operations. Configure model selection, response creativity (temperature), and maximum response length to customize your experience across all tools.",
  configureClaude: "Set default parameters for all Claude operations. Configure model selection, system prompts, temperature, and maximum token length to customize your experience.",
  manageConfiguration: "Comprehensive configuration management with reusable profiles. Create, update, switch between profiles, and manage GitHub integration settings for different use cases and environments.",
  manageContext: "Manage shared context between Claude and Gemini models. Create, retrieve, update, and delete context objects that contain analysis results, reasoning, and evolution history.",
  healthCheck: "Verify that the Gemini Bridge service is operational. Checks API connectivity, configuration, and system resources to ensure proper functioning."
};

// Add resources/list method to support MCP protocol
server.resource("schema", "schema://metadata", async () => {
  return {
    contents: [
      {
        uri: "schema://metadata",
        text: JSON.stringify({
          description: "Enhanced Claude-Gemini Bridge for collaborative code analysis and evolution",
          version: VERSION,
          tools: [
            {
              name: "analyze-repository",
              description: TOOL_DESCRIPTIONS.analyzeRepository,
              hierarchicalAnalysis: {
                levels: [
                  {
                    id: "overview",
                    name: "Overview",
                    description: "High-level architectural overview identifying key components"
                  },
                  {
                    id: "component",
                    name: "Component",
                    description: "Detailed analysis of a specific component",
                    requiresComponent: true,
                    requiresPreviousAnalysis: true
                  },
                  {
                    id: "detail",
                    name: "Detail",
                    description: "Fine-grained analysis of implementation details",
                    requiresComponent: true,
                    requiresPreviousAnalysis: true
                  }
                ],
                examples: [
                  "First, analyze the repository at overview level to identify key components",
                  "Now analyze the authentication component in more detail",
                  "Provide a detailed analysis of the error handling in the database component"
                ]
              }
            },
            {
              name: "analyze-github-repository",
              description: TOOL_DESCRIPTIONS.analyzeGithubRepository
            },
            {
              name: "analyze-files",
              description: TOOL_DESCRIPTIONS.analyzeFiles
            },
            {
              name: "chat-with-gemini",
              description: TOOL_DESCRIPTIONS.chatWithGemini,
              models: getAvailableModels().map(model => ({
                id: model.id,
                name: model.displayName,
                description: model.description
              })),
              configResource: "config://gemini/models"
            },
            {
              name: "chat-with-claude",
              description: TOOL_DESCRIPTIONS.chatWithClaude,
              models: [
                {
                  id: "claude-3-opus-20240229",
                  name: "Claude 3 Opus",
                  description: "Most powerful model for complex tasks requiring careful reasoning"
                },
                {
                  id: "claude-3-sonnet-20240229",
                  name: "Claude 3 Sonnet",
                  description: "Balanced model with strong performance and faster response times"
                },
                {
                  id: "claude-3-haiku-20240307",
                  name: "Claude 3 Haiku",
                  description: "Fastest and most compact model for quick responses and high throughput"
                }
              ],
              configResource: "config://claude/models"
            },
            {
              name: "evolve-code",
              description: TOOL_DESCRIPTIONS.evolveCode,
              evolutionTypes: [
                {
                  id: "refactor",
                  name: "Refactor",
                  description: "Restructure code without changing external behavior"
                },
                {
                  id: "improve",
                  name: "Improve",
                  description: "Enhance performance, security, or other aspects"
                },
                {
                  id: "transform",
                  name: "Transform",
                  description: "Convert to a different architecture or implementation"
                },
                {
                  id: "test",
                  name: "Test",
                  description: "Generate comprehensive test suites"
                },
                {
                  id: "document",
                  name: "Document",
                  description: "Create or improve documentation"
                }
              ]
            },
            {
              name: "configure-gemini",
              description: TOOL_DESCRIPTIONS.configureGemini
            },
            {
              name: "configure-claude",
              description: TOOL_DESCRIPTIONS.configureClaude
            },
            {
              name: "manage-configuration",
              description: TOOL_DESCRIPTIONS.manageConfiguration,
              configResource: "config://gemini-claude"
            },
            {
              name: "manage-context",
              description: TOOL_DESCRIPTIONS.manageContext
            },
            {
              name: "health-check",
              description: TOOL_DESCRIPTIONS.healthCheck
            }
          ],
          resources: [
            {
              name: "config://gemini/models",
              description: "Gemini model configuration"
            },
            {
              name: "config://claude/models",
              description: "Claude model configuration"
            },
            {
              name: "config://gemini-claude",
              description: "Full server configuration"
            },
            {
              name: "config://gemini-claude/profile/{profile}",
              description: "Configuration profiles"
            },
            {
              name: "context://{contextId}",
              description: "Shared context between Claude and Gemini"
            }
          ]
        })
      }
    ]
  };
});

// Add prompts/list method to support MCP protocol
server.prompt("analyze", {
  query: z.string().describe("Question about repository or code"),
  analysisType: z.enum(["architecture", "security", "performance", "documentation", "testing", "comprehensive"]).optional().describe("Type of analysis to perform")
}, ({ query, analysisType }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Analyze the following code/repository ${analysisType ? `focusing on ${analysisType}` : ""}:\n\n${query}`
      }
    }
  ]
}));

// Add code-explanation prompt
server.prompt("explain-code", {
  code: z.string().describe("Code snippet to explain"),
  language: z.string().optional().describe("Programming language of the code")
}, ({ code, language }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Explain the following ${language || "code"}:\n\n\`\`\`${language || ""}\n${code}\n\`\`\``
      }
    }
  ]
}));

// Start the server
async function runServer() {
  try {
    logger.info(`Starting Enhanced Gemini Bridge MCP Server v${VERSION}`);
    
    // Log environment info
    logger.info(`Node.js version: ${process.version}`);
    logger.info(`Current directory: ${process.cwd()}`);
    logger.debug('Environment variables:', process.env);
    
    // Load configuration
    await configManager.loadConfig();
    logger.info(`Active configuration profile: ${configManager.getActiveProfile()}`);
    
    // Validate API key but don't use it yet
    if (!GEMINI_API_KEY) {
      throw new ApiKeyMissingError("GEMINI_API_KEY is not defined");
    }
    
    // Check GitHub token if available
    const githubConfig = configManager.getGitHubConfig();
    if (githubConfig?.auth?.token) {
      logger.info('GitHub integration enabled');
    } else if (process.env.GITHUB_TOKEN) {
      logger.info('GitHub integration enabled via environment variable');
    } else {
      logger.info('GitHub integration available but not configured with authentication');
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
    
    logger.info("Enhanced Claude-Gemini Bridge MCP Server running on stdio");
    
    // Display all available options
    logger.info(`Available tools: analyze-repository, analyze-github-repository, analyze-files, chat-with-gemini, chat-with-claude, evolve-code, configure-gemini, configure-claude, manage-configuration, manage-context, health-check`);
    logger.info(`Available Gemini models: ${getAvailableModels().map(m => m.id).join(', ')}`);
    logger.info(`Default Gemini model: ${configManager.getDefaultModel()}`);
    logger.info(`Available Claude models: claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307`);
    logger.info(`Default Claude model: ${configManager.getClaudeModel()}`);
    logger.info(`Available configuration profiles: ${Object.keys(configManager.getProfiles()).join(', ')}`);
    logger.info(`Active profile: ${configManager.getActiveProfile()}`);
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