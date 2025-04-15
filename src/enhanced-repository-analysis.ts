/**
 * Adapter module to provide backward compatibility with the old enhancedRepositoryAnalysis API
 * while leveraging the new modular architecture.
 */

import { packageRepository } from './repository-packaging.js';
import { analyzeRepository } from './repository-analysis.js';
import { performHierarchicalAnalysis } from './hierarchical-analysis.js';
import { 
  parseGeminiResponse, 
  formatResponseForMCP, 
  buildResponseFromAnalysis 
} from './response-handler.js';
import { 
  RepositoryAnalysisOptions, 
  FileAnalysisOptions, 
  McpCallbackResponse, 
  McpContentItem,
  Logger 
} from './types.js';
import { callGemini } from './gemini-api.js';
import { selectBestTemplate, buildPrompt } from './prompt-templates.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Legacy enhancedRepositoryAnalysis function that adapts to the new architecture
 * This maintains backward compatibility with existing code
 */
export async function enhancedRepositoryAnalysis(
  options: RepositoryAnalysisOptions
): Promise<McpCallbackResponse> {
  const { 
    query, 
    directory, 
    model, 
    maxTokens, 
    temperature, 
    reasoningEffort, 
    outputFormat, 
    analysisType, 
    analysisLevel, 
    component, 
    previousAnalysis,
    logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  } = options;
  
  try {
    const repoDir = directory || process.cwd();
    logger.info(`Enhanced repository analysis for: ${repoDir}`, { 
      analysisType, 
      analysisLevel
    });
    
    // Step 1: Package the repository
    const packageResult = await packageRepository(repoDir, {
      query, 
      analysisType,
      componentPath: component,
      maxTokens,
      logger
    });
    
    // If using hierarchical analysis
    if (analysisLevel) {
      // Read the packaged content
      const repoContent = await fs.readFile(packageResult.packagePath, 'utf-8');
      
      // Perform hierarchical analysis
      const result = await performHierarchicalAnalysis({
        repoContent,
        repoStructure: packageResult.structure,
        query,
        component,
        level: analysisLevel,
        previousAnalysis,
        model: model || 'gemini-1.5-pro', // Provide default values to satisfy type requirements
        maxTokens: maxTokens || 4096,
        temperature: temperature || 0.7,
        reasoningEffort,
        analysisType,
        logger
      });
      
      // Return the MCP response directly from hierarchical analysis
      return result.mcpResponse;
    }
    
    // Step 2: Analyze the repository
    const analysisResult = await analyzeRepository(
      repoDir,
      packageResult.packagePath,
      {
        query,
        analysisType,
        analysisDepth: reasoningEffort === 'high' ? 'comprehensive' : 'basic',
        extractImports: true,
        logger
      }
    );
    
    // Step 3: Generate prompt and call Gemini with the results
    const templateKey = selectBestTemplate(query, analysisType);
    
    // Read the packaged repository content
    const repoContent = await fs.readFile(packageResult.packagePath, 'utf-8');
    
    // Build the prompt
    const prompt = buildPrompt(templateKey, {
      query,
      repoStructure: packageResult.structure,
      repoContent,
      analysisResult: JSON.stringify(analysisResult, null, 2)
    }, {
      reasoningEffort
    });
    
    // Call Gemini
    logger.info("Calling Gemini with repository analysis prompt");
    const geminiResponseText = await callGemini(prompt, {
      model,
      maxTokens,
      temperature,
      logger
    });
    
    // Parse the response
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
    
    // Return MCP response
    // Convert to correct MCP format
    const responseData = buildResponseFromAnalysis(
      parsedResponse, 
      analysisResult, 
      {
        includeMetadata: true,
        includeAnalysisDetails: true,
        logger
      }
    );

    // Create proper McpCallbackResponse
    return {
      content: responseData.content.map(item => {
        // Ensure the item matches the McpContentItem type
        return {
          type: item.type,
          text: item.text
        } as McpContentItem;
      })
    };
    
  } catch (error) {
    logger.error(`Enhanced repository analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      content: [
        {
          type: "text",
          text: `Error performing repository analysis: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  } finally {
    // Clean up if needed
  }
}

/**
 * Legacy enhancedFileAnalysis function that adapts to the new architecture
 */
export async function enhancedFileAnalysis(
  options: FileAnalysisOptions
): Promise<McpCallbackResponse> {
  const { 
    query, 
    files, 
    directory, 
    model, 
    maxTokens, 
    temperature, 
    reasoningEffort, 
    outputFormat,
    logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  } = options;
  
  try {
    const baseDir = directory || process.cwd();
    logger.info(`Enhanced file analysis for ${files.length} files`);
    
    // Read file contents
    const fileContents: Record<string, string> = {};
    
    for (const filePath of files) {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(baseDir, filePath);
      
      if (existsSync(fullPath)) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          fileContents[filePath] = content;
        } catch (error) {
          logger.error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        logger.warn(`File not found: ${fullPath}`);
      }
    }
    
    // If no files were successfully read
    if (Object.keys(fileContents).length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Error: None of the specified files could be read."
          }
        ],
        isError: true
      };
    }
    
    // Build content for Gemini prompt
    let fileContent = '';
    
    for (const [filePath, content] of Object.entries(fileContents)) {
      fileContent += `<file path="${filePath}">\n${content}\n</file>\n\n`;
    }
    
    // Select template
    const templateKey = "FILE_ANALYSIS";
    
    // Build the prompt
    const prompt = buildPrompt(templateKey, {
      query,
      fileContent
    }, {
      reasoningEffort
    });
    
    // Call Gemini
    logger.info("Calling Gemini with file analysis prompt");
    const geminiResponseText = await callGemini(prompt, {
      model,
      maxTokens,
      temperature,
      logger
    });
    
    // Parse the response
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
    
    // Create proper MCP response
    const responseData = formatResponseForMCP(parsedResponse, {
      includeMetadata: true,
      logger
    });

    // Return with the correct type
    return {
      content: responseData.content.map(item => {
        // Ensure the item matches the McpContentItem type
        return {
          type: item.type,
          text: item.text
        } as McpContentItem;
      })
    };
    
  } catch (error) {
    logger.error(`Enhanced file analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      content: [
        {
          type: "text",
          text: `Error performing file analysis: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}
