/**
 * New MCP Tools for the revised architecture
 * 
 * These tools implement the clear separation between packaging, analysis, and AI response.
 * Import and add these tools to the main index.ts file.
 */

import { z } from "zod";
import { packageRepository } from './repository-packaging.js';
import { analyzeRepository } from './repository-analysis.js';
import { generateResponse } from './gemini-interface.js';
import { McpCallbackResponse, Logger } from './types.js';
import { createSecureTempDir, cleanupTempFiles } from './utils.js';
import { formatErrorForResponse, logErrorDetails } from './errors.js';
import { getConfigManager } from './config-manager.js';
import path from 'path';
import { existsSync } from 'fs';

/**
 * 1. Repository Packaging Tool
 * Handles code packaging using Repomix or fallback methods
 */
export const packageRepositoryTool = {
  name: "package-repository",
  schema: {
    directory: z.string().optional().describe("Path to the repository directory"),
    query: z.string().optional().describe("Query to help focus the packaging"),
    analysisType: z.enum(["general", "architecture", "security", "performance", "documentation", "testing", "comprehensive", "bug"]).optional().describe("Type of analysis to perform"),
    componentPath: z.string().optional().describe("Specific component path to focus on"),
    outputFile: z.string().optional().describe("Output file path for the packaged code")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { directory, query, analysisType, componentPath, outputFile } = args;
    const logger = createLogger();
    
    try {
      const repoDir = directory || process.cwd();
      
      // Package the repository
      const result = await packageRepository(repoDir, {
        outputFile,
        query,
        analysisType,
        componentPath,
        logger
      });
      
      return {
        content: [
          {
            type: "text",
            text: `Repository packaged successfully using ${result.packagingMethod} method.
Package contains ${result.fileCount} files with approximately ${result.tokenCount} tokens.
Output saved to: ${result.packagePath}

Repository Structure:
${result.structure}`
          }
        ]
      };
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * 2. Repository Analysis Tool
 * Performs custom analysis on packaged code
 */
export const analyzeRepositoryTool = {
  name: "analyze-repository",
  schema: {
    directory: z.string().optional().describe("Path to the repository directory"),
    packagedCodePath: z.string().optional().describe("Path to the packaged code file"),
    query: z.string().optional().describe("Query to help focus the analysis"),
    analysisType: z.enum(["general", "architecture", "security", "performance", "documentation", "testing", "comprehensive", "bug"]).optional().describe("Type of analysis to perform"),
    analysisDepth: z.enum(["basic", "comprehensive"]).optional().describe("Depth of analysis to perform"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response format")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { directory, packagedCodePath, query, analysisType, analysisDepth, outputFormat = "json" } = args;
    const logger = createLogger();
    
    try {
      const repoDir = directory || process.cwd();
      
      // If packaged code path not provided, package the repository first
      let packageResult;
      let actualPackagedCodePath = packagedCodePath;
      let tempDir, tempFile;
      
      if (!packagedCodePath) {
        // Create temporary file for packaging
        const tempResult = createSecureTempDir('analyze-repo-');
        tempDir = tempResult.tempDir;
        tempFile = tempResult.tempFile;
        
        try {
          logger.info("No packaged code provided. Packaging repository first...");
          packageResult = await packageRepository(repoDir, {
            outputFile: tempFile,
            query,
            analysisType,
            logger
          });
          actualPackagedCodePath = packageResult.packagePath;
        } catch (error) {
          await cleanupTempFiles(tempFile, tempDir, logger);
          throw error;
        }
      }
      
      try {
        // Analyze the repository
        const analysisResults = await analyzeRepository(repoDir, actualPackagedCodePath, {
          query,
          analysisType,
          analysisDepth,
          logger
        });
        
        // Format the response based on output format
        let responseText;
        if (outputFormat === 'json') {
          responseText = JSON.stringify(analysisResults, null, 2);
        } else if (outputFormat === 'markdown') {
          responseText = formatAnalysisResultsMarkdown(analysisResults);
        } else {
          responseText = formatAnalysisResultsText(analysisResults);
        }
        
        return {
          content: [
            {
              type: "text",
              text: responseText
            }
          ]
        };
      } finally {
        // Clean up temporary files if we created them
        if (tempFile && tempDir) {
          await cleanupTempFiles(tempFile, tempDir, logger);
        }
      }
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * 3. Repository Explanation Tool
 * Combines packaging, analysis, and response generation
 */
export const explainRepositoryTool = {
  name: "explain-repository",
  schema: {
    query: z.string().describe("Question or request about the repository"),
    directory: z.string().optional().describe("Path to the repository directory"),
    analysisType: z.enum(["general", "architecture", "security", "performance", "documentation", "testing", "comprehensive", "bug"]).optional().describe("Type of analysis to perform"),
    analysisDepth: z.enum(["basic", "comprehensive"]).optional().describe("Depth of analysis to perform"),
    outputFormat: z.enum(["text", "json", "markdown"]).optional().describe("Response format"),
    model: z.string().optional().describe("Gemini model to use"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { query, directory, analysisType, analysisDepth = "basic", outputFormat = "markdown", model, temperature } = args;
    const logger = createLogger();
    const configManager = getConfigManager(logger);
    
    try {
      const repoDir = directory || process.cwd();
      
      // Create temporary file for packaging
      const { tempDir, tempFile } = createSecureTempDir('explain-repo-');
      
      try {
        // Step 1: Package the repository
        logger.info("Step 1: Packaging repository...");
        const packageResult = await packageRepository(repoDir, {
          outputFile: tempFile,
          query,
          analysisType,
          logger
        });
        
        // Step 2: Analyze the repository
        logger.info("Step 2: Analyzing repository...");
        const analysisResults = await analyzeRepository(repoDir, packageResult.packagePath, {
          query,
          analysisType,
          analysisDepth,
          logger
        });
        
        // Step 3: Generate response using Gemini
        logger.info("Step 3: Generating AI response...");
        const response = await generateResponse(packageResult.packagePath, analysisResults, {
          query,
          analysisType,
          outputFormat,
          model: model || configManager.getDefaultModel(),
          temperature: temperature || configManager.getDefaultTemperature(),
          logger
        });
        
        return {
          content: [
            {
              type: "text",
              text: response
            }
          ]
        };
      } finally {
        // Clean up temporary files
        await cleanupTempFiles(tempFile, tempDir, logger);
      }
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * Helper function to create a logger
 */
function createLogger(): Logger {
  return {
    debug: (message: string, ...args: any[]) => {
      if (process.env.DEBUG) {
        console.error(`[DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      console.error(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.error(`[WARN] ${message}`, ...args);
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`, error);
    }
  };
}

/**
 * Helper function to format analysis results as markdown
 */
function formatAnalysisResultsMarkdown(analysisResults: any): string {
  let output = `# Repository Analysis Results\n\n`;
  
  // Architecture section
  output += `## Architecture\n\n`;
  output += `- **Type**: ${analysisResults.architecture.type}\n`;
  output += `- **Layers**: ${analysisResults.architecture.layers.join(', ')}\n`;
  output += `- **Main Modules**: ${analysisResults.architecture.mainModules.join(', ')}\n`;
  output += `- **Entry Points**: ${analysisResults.architecture.entryPoints.join(', ')}\n\n`;
  
  // Components section
  output += `## Components\n\n`;
  analysisResults.components.forEach((component: any) => {
    output += `### ${component.name}\n\n`;
    if (component.description) {
      output += `${component.description}\n\n`;
    }
    if (component.path) {
      output += `**Path**: ${component.path}\n\n`;
    }
    if (component.responsibilities) {
      output += `**Responsibilities**: ${component.responsibilities.join(', ')}\n\n`;
    }
    if (component.complexity) {
      output += `**Complexity**: ${component.complexity}/10\n\n`;
    }
  });
  
  // Dependencies section
  output += `## Dependencies\n\n`;
  output += `### Internal Dependencies\n\n`;
  output += `Total: ${Object.keys(analysisResults.dependencies.internal).length}\n\n`;
  
  output += `### External Dependencies\n\n`;
  const topExternalDeps = Object.entries(analysisResults.dependencies.external)
    .sort((a: any, b: any) => b[1].length - a[1].length)
    .slice(0, 10);
  
  if (topExternalDeps.length > 0) {
    topExternalDeps.forEach(([name, files]: [string, any]) => {
      output += `- **${name}**: ${files.length} files\n`;
    });
  } else {
    output += `No external dependencies found.\n`;
  }
  output += `\n`;
  
  // Design patterns section
  output += `## Design Patterns\n\n`;
  if (analysisResults.patterns.length > 0) {
    analysisResults.patterns.forEach((pattern: any) => {
      output += `### ${pattern.name}\n\n`;
      if (pattern.description) {
        output += `${pattern.description}\n\n`;
      }
      if (pattern.instances && pattern.instances.length > 0) {
        output += `**Instances**: ${pattern.instances.length}\n\n`;
        output += `**Found in**:\n`;
        pattern.instances.slice(0, 5).forEach((instance: string) => {
          output += `- ${instance}\n`;
        });
        if (pattern.instances.length > 5) {
          output += `- ... and ${pattern.instances.length - 5} more\n`;
        }
        output += '\n';
      }
    });
  } else {
    output += `No design patterns detected.\n\n`;
  }
  
  // Metrics section
  output += `## Metrics\n\n`;
  Object.entries(analysisResults.metrics).forEach(([key, value]) => {
    output += `- **${key}**: ${value}\n`;
  });
  
  // Security issues section
  if (analysisResults.securityIssues && analysisResults.securityIssues.length > 0) {
    output += `\n## Security Issues\n\n`;
    analysisResults.securityIssues.forEach((issue: any) => {
      output += `### ${issue.title}\n\n`;
      output += `- **Severity**: ${issue.severity}\n`;
      output += `- **Description**: ${issue.description}\n`;
      if (issue.location) {
        output += `- **Location**: ${issue.location}\n`;
      }
      if (issue.recommendation) {
        output += `- **Recommendation**: ${issue.recommendation}\n`;
      }
      output += '\n';
    });
  }
  
  // Performance issues section
  if (analysisResults.performanceIssues && analysisResults.performanceIssues.length > 0) {
    output += `\n## Performance Issues\n\n`;
    analysisResults.performanceIssues.forEach((issue: any) => {
      output += `### ${issue.title}\n\n`;
      output += `- **Impact**: ${issue.impact}\n`;
      output += `- **Description**: ${issue.description}\n`;
      if (issue.location) {
        output += `- **Location**: ${issue.location}\n`;
      }
      if (issue.recommendation) {
        output += `- **Recommendation**: ${issue.recommendation}\n`;
      }
      output += '\n';
    });
  }
  
  return output;
}

/**
 * Helper function to format analysis results as text
 */
function formatAnalysisResultsText(analysisResults: any): string {
  // Convert from markdown to plain text by removing markdown formatting
  const markdown = formatAnalysisResultsMarkdown(analysisResults);
  return markdown
    .replace(/###\s+/g, '')
    .replace(/##\s+/g, '')
    .replace(/#\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n\n/g, '\n')
    .replace(/\n\n/g, '\n');
}
