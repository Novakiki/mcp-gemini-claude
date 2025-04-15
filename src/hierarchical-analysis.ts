import { z } from "zod";
import { Logger, AnalysisLevel, AnalysisType, ReasoningEffort } from "./types.js";
import { buildPrompt, selectBestTemplate } from "./prompt-templates.js";
import { callGemini } from "./gemini-api.js";
import { parseGeminiResponse, formatResponseForMCP } from "./response-handler.js";
import { McpCallbackResponse } from "./types.js";
import { enhancedPackageRepository } from "./repomix-utils.js";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

/**
 * Package a specific component from a repository for component-level analysis
 */
export async function packageRepositoryComponent(
  repoDir: string,
  component: string,
  options: {
    query?: string;
    analysisType?: AnalysisType;
    maxTokens?: number;
    maxFileSize?: number;
    extractStructure?: boolean;
    extractImports?: boolean;
    logger?: Logger;
  } = {}
): Promise<{ content: string; structure: string; totalFiles: number; totalTokens: number }> {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  logger.info(`Packaging component: ${component} from repository: ${repoDir}`, {
    analysisType: options.analysisType || 'general',
    maxTokens: options.maxTokens || 'default'
  });
  
  // Validate the component path exists
  const componentPath = path.join(repoDir, component);
  if (!existsSync(componentPath)) {
    throw new Error(`Component path does not exist: ${componentPath}`);
  }
  
  // Create a temporary output file for this component
  const outputFile = path.join(repoDir, `.repomix-component-${Date.now()}.txt`);
  
  try {
    // Package just this component
    const result = await enhancedPackageRepository(
      repoDir,
      outputFile,
      {
        query: options.query,
        analysisType: options.analysisType,
        maxTokens: options.maxTokens,
        maxFileSize: options.maxFileSize,
        componentPath: component,
        extractStructure: options.extractStructure !== false,
        extractImports: options.extractImports,
        logger
      },
      logger
    );
    
    // Read the output file
    const content = await fs.readFile(outputFile, 'utf-8');
    
    logger.info(`Successfully packaged component ${component} with ${result.totalFiles} files`);
    
    return {
      content,
      structure: result.structure || '',
      totalFiles: result.totalFiles,
      totalTokens: result.totalTokens
    };
  } catch (error) {
    logger.error(`Failed to package component ${component}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    // Clean up temporary file
    try {
      if (existsSync(outputFile)) {
        await fs.unlink(outputFile);
      }
    } catch (cleanupError) {
      logger.warn(`Failed to clean up temporary component package file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
  }
}

/**
 * Extract component suggestions from an overview analysis response
 */
export function extractComponentSuggestions(
  analysis: string
): Record<string, string> {
  const componentMap: Record<string, string> = {};
  
  // Different potential formats for component sections in the response
  const componentSectionPatterns = [
    /(?:Key Components|Main Components|Core Components|Important Components)[\s\S]*?((?:\d+\.\s+.*?:\s+.*?(?:\n|$))+)/i,
    /(?:Components|Modules|Services|Key Files)[\s\S]*?((?:(?:\d+\.|[*\-•])\s+.*?:\s+.*?(?:\n|$))+)/i,
    /(?:Architecture Overview|Codebase Structure)[\s\S]*?((?:(?:\d+\.|[*\-•])\s+.*?:\s+.*?(?:\n|$))+)/i
  ];
  
  // Try each pattern
  for (const pattern of componentSectionPatterns) {
    const componentMatch = analysis.match(pattern);
    
    if (componentMatch && componentMatch[1]) {
      const componentLines = componentMatch[1].split('\n').filter(line => line.trim() !== '');
      
      // Extract component name and path
      for (const line of componentLines) {
        // Handle different list formats:
        // 1. Component Name: src/path
        // - Component Name: src/path
        // * Component Name: src/path
        const componentRegex = /(?:\d+\.|[*\-•])?\s+(.*?):\s+(.*?)$/;
        const match = line.match(componentRegex);
        
        if (match) {
          const [_, componentName, componentPath] = match;
          // Clean up the component path (remove trailing comments and spaces)
          const cleanPath = componentPath.trim().split(/\s+/)[0].replace(/['"]/g, '');
          componentMap[componentName.trim()] = cleanPath;
        }
      }
      
      // If we found components, no need to try other patterns
      if (Object.keys(componentMap).length > 0) {
        break;
      }
    }
  }
  
  return componentMap;
}

/**
 * Performs hierarchical analysis on a repository, starting with an overview and then drilling down.
 */
export async function performHierarchicalAnalysis({
  repoContent,
  repoStructure,
  query,
  component = null,
  level = "overview",
  previousAnalysis = null,
  model,
  maxTokens,
  temperature,
  reasoningEffort,
  analysisType,
  logger
}: {
  repoContent: string;
  repoStructure: string;
  query: string;
  component?: string | null;
  level?: AnalysisLevel;
  previousAnalysis?: string | null;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: ReasoningEffort;
  analysisType?: AnalysisType;
  logger: Logger;
}): Promise<{
  analysis: string;
  componentMap: Record<string, string>;
  mcpResponse: McpCallbackResponse;
}> {
  logger.info(`Performing ${level} level analysis${component ? ` on component: ${component}` : ''}`, {
    model,
    temperature,
    reasoningEffort: reasoningEffort || 'default',
    analysisType: analysisType || 'general',
  });
  
  // Select template based on level and analysis type
  const templateKey = selectHierarchicalTemplate(level, analysisType);
  logger.info(`Selected template: ${templateKey}`);
  
  // Build context for the prompt
  const contextData: Record<string, string> = {
    query,
    repoStructure,
    repoContent: component ? extractComponentContent(repoContent, component) : repoContent,
  };
  
  // Add previous analysis if available for context
  if (previousAnalysis) {
    contextData.previousAnalysis = previousAnalysis;
  }
  
  // Add component name if doing component-level analysis
  if (component) {
    contextData.component = component;
  }
  
  // Build the prompt
  const prompt = buildPrompt(templateKey, contextData, {
    reasoningEffort,
    analysisLevel: level
  });
  
  // Call Gemini
  logger.info(`Calling Gemini for ${level} analysis`);
  const geminiResponseText = await callGemini(prompt, {
    model,
    maxTokens,
    temperature,
    logger
  });
  
  // Parse response
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
  
  // Extract component recommendations if overview analysis
  const componentMap: Record<string, string> = {};
  if (level === "overview") {
    const extractedComponents = extractComponentSuggestions(geminiResponseText);
    Object.assign(componentMap, extractedComponents);
    logger.info(`Extracted ${Object.keys(componentMap).length} components from overview analysis`);
  }
  
  // Format response for MCP
  const mcpResponse = formatResponseForMCP(parsedResponse, {
    includeMetadata: true,
    logger
  }) as McpCallbackResponse;
  
  return {
    analysis: geminiResponseText,
    componentMap,
    mcpResponse
  };
}

/**
 * Selects the appropriate template based on analysis level and type.
 */
function selectHierarchicalTemplate(level: AnalysisLevel, analysisType?: AnalysisType): string {
  if (level === "overview") {
    // For overview, prioritize analysis type specific templates
    if (analysisType) {
      const specificTemplate = `OVERVIEW_${analysisType.toUpperCase()}`;
      return specificTemplate;
    }
    return "OVERVIEW_ARCHITECTURE";
  } else if (level === "component") {
    // For component level, use specialized component templates
    if (analysisType) {
      const specificTemplate = `COMPONENT_${analysisType.toUpperCase()}`;
      return specificTemplate;
    }
    return "COMPONENT_ANALYSIS";
  } else {
    // For detail level, use detail templates
    if (analysisType) {
      const specificTemplate = `DETAIL_${analysisType.toUpperCase()}`;
      return specificTemplate;
    }
    return "DETAIL_ANALYSIS";
  }
}

/**
 * Extracts the content relevant to a specific component.
 */
function extractComponentContent(repoContent: string, component: string): string {
  // Extract files that belong to the specified component
  
  // For XML-style repository content (used by both Repomix and our fallback solution)
  if (component.includes('/')) {
    // Normalize component path - ensure it has a trailing slash for proper matching
    const normalizedComponent = component.endsWith('/') ? component : `${component}/`;
    
    // Split content by file tags and filter for matching paths
    const fileBlocks = repoContent.split('<file');
    const headerBlock = fileBlocks[0]; // Everything before the first <file> tag
    
    const relevantFiles = fileBlocks.slice(1).filter(file => {
      const pathMatch = file.match(/path="([^"]+)"/);
      if (!pathMatch) return false;
      
      const filePath = pathMatch[1];
      // Match files that are directly in the component or in subdirectories
      return filePath.startsWith(normalizedComponent) || 
             filePath === component || 
             // Match subdirectories properly
             (component.endsWith('/') ? filePath.startsWith(component) : filePath.startsWith(`${component}/`));
    });
    
    if (relevantFiles.length > 0) {
      // Rebuild the content with only relevant files
      return `${headerBlock}<file${relevantFiles.join('<file')}`;
    }
  }
  
  // If we can't extract component-specific content, return the full content
  // This should rarely happen with our improved component packaging
  return repoContent;
}