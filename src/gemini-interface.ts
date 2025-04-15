/**
 * Gemini Interface Module
 * 
 * This module handles communication with the Gemini API to generate responses
 * based on packaged code and analysis results.
 */

import * as fs from 'fs/promises';
import { Logger } from './types.js';
import { callGemini } from './gemini-api.js';
import { parseGeminiResponse, formatResponseForMCP } from './response-handler.js';
import { RepositoryAnalysisResult } from './repository-analysis.js';
import { TOKEN_LIMITS } from './token-management.js';

/**
 * Generate AI response based on packaged code and analysis results
 */
export async function generateResponse(
  packagedCodePath: string,
  analysisResults: RepositoryAnalysisResult,
  options: {
    query: string;
    analysisType?: string;
    outputFormat?: 'text' | 'json' | 'markdown';
    temperature?: number;
    maxTokens?: number;
    model?: string;
    logger?: Logger;
  }
): Promise<string> {
  const logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const outputFormat = options.outputFormat || 'markdown';
  
  logger.info(`Generating response for query: ${options.query}`);
  
  // Read the packaged code
  const packagedCode = await fs.readFile(packagedCodePath, 'utf-8');
  
  // Build the prompt with code and analysis results
  const prompt = buildPrompt(packagedCode, analysisResults, options);
  
  // Call Gemini API
  const geminiResponseText = await callGemini(prompt, {
    model: options.model || 'gemini-1.5-pro',
    maxTokens: options.maxTokens || TOKEN_LIMITS.MAX_RESPONSE_TOKENS,
    temperature: options.temperature || 0.2, // Lower temperature for more focused responses
    logger
  });
  
  logger.info(`Generated response with ${geminiResponseText.length} characters`);
  
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
  
  // Format the response based on the output format
  return formatResponse(geminiResponseText, outputFormat, analysisResults, options);
}

/**
 * Build a prompt that includes packaged code and analysis results
 */
function buildPrompt(
  packagedCode: string,
  analysisResults: RepositoryAnalysisResult,
  options: {
    query: string;
    analysisType?: string;
  }
): string {
  const { query, analysisType } = options;
  
  // Format the analysis results as a string
  const formattedAnalysis = formatAnalysisForPrompt(analysisResults);
  
  // Determine the focus based on analysis type
  let focus = 'the overall structure and functionality';
  if (analysisType) {
    switch (analysisType) {
      case 'architecture':
        focus = 'the architecture, design patterns, and code organization';
        break;
      case 'security':
        focus = 'security vulnerabilities, risks, and best practices';
        break;
      case 'performance':
        focus = 'performance issues, bottlenecks, and optimization opportunities';
        break;
      case 'documentation':
        focus = 'code documentation, readability, and maintainability';
        break;
      case 'testing':
        focus = 'test coverage, test strategies, and potential areas to improve testing';
        break;
      case 'bug':
        focus = 'potential bugs, edge cases, and error handling';
        break;
      case 'comprehensive':
        focus = 'all aspects of the codebase including architecture, security, performance, and best practices';
        break;
    }
  }
  
  // Build the prompt
  return `
You are an expert code analyst examining a software repository.

# Repository Content
${packagedCode}

# Code Analysis Results
${formattedAnalysis}

# Analysis Request
${query || 'Provide a comprehensive analysis of this repository'}

Focus on ${focus} of the codebase.
Use the code analysis results to guide your response, and reference specific parts of the code where relevant.
Provide specific, actionable insights rather than general observations.
If you identify issues, suggest concrete improvements or solutions.
`;
}

/**
 * Format analysis results for inclusion in the prompt
 */
function formatAnalysisForPrompt(analysisResults: RepositoryAnalysisResult): string {
  // Format architecture
  let output = `## Architecture\n`;
  output += `Type: ${analysisResults.architecture.type}\n`;
  output += `Layers: ${analysisResults.architecture.layers.join(', ')}\n`;
  output += `Main Modules: ${analysisResults.architecture.mainModules.join(', ')}\n\n`;
  
  // Format components (limit to top 10 for prompt size)
  output += `## Components\n`;
  analysisResults.components.slice(0, 10).forEach((component, index) => {
    output += `${index + 1}. ${component.name}: ${component.path}\n`;
    if (component.description) {
      output += `   Description: ${component.description}\n`;
    }
    if (component.responsibilities) {
      output += `   Responsibilities: ${component.responsibilities.join(', ')}\n`;
    }
    if (component.complexity) {
      output += `   Complexity: ${component.complexity}/10\n`;
    }
  });
  output += '\n';
  
  // Format dependencies (summarize to save tokens)
  output += `## Dependencies\n`;
  output += `Internal Dependencies: ${Object.keys(analysisResults.dependencies.internal).length}\n`;
  output += `External Dependencies: ${Object.keys(analysisResults.dependencies.external).length}\n\n`;
  
  // Format top 5 external dependencies
  const topExternalDeps = Object.entries(analysisResults.dependencies.external)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  
  if (topExternalDeps.length > 0) {
    output += `Top External Dependencies:\n`;
    topExternalDeps.forEach(([name, files]) => {
      output += `- ${name}: ${files.length} files\n`;
    });
    output += '\n';
  }
  
  // Format patterns
  output += `## Design Patterns\n`;
  analysisResults.patterns.forEach((pattern) => {
    output += `- ${pattern.name}: ${pattern.instances ? pattern.instances.length : 0} instances\n`;
    if (pattern.description) {
      output += `  ${pattern.description}\n`;
    }
  });
  output += '\n';
  
  // Format metrics
  output += `## Metrics\n`;
  Object.entries(analysisResults.metrics).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      output += `- ${key}: ${value}\n`;
    }
  });
  output += '\n';
  
  // Add specialized analysis if available
  if (analysisResults.securityIssues && analysisResults.securityIssues.length > 0) {
    output += `## Security Issues\n`;
    analysisResults.securityIssues.forEach((issue) => {
      output += `- ${issue.title} (Severity: ${issue.severity})\n`;
      output += `  ${issue.description}\n`;
      if (issue.location) {
        output += `  Location: ${issue.location}\n`;
      }
      if (issue.recommendation) {
        output += `  Recommendation: ${issue.recommendation}\n`;
      }
    });
    output += '\n';
  }
  
  if (analysisResults.performanceIssues && analysisResults.performanceIssues.length > 0) {
    output += `## Performance Issues\n`;
    analysisResults.performanceIssues.forEach((issue) => {
      output += `- ${issue.title} (Impact: ${issue.impact})\n`;
      output += `  ${issue.description}\n`;
      if (issue.location) {
        output += `  Location: ${issue.location}\n`;
      }
      if (issue.recommendation) {
        output += `  Recommendation: ${issue.recommendation}\n`;
      }
    });
    output += '\n';
  }
  
  return output;
}

/**
 * Format the final response
 */
function formatResponse(
  response: string,
  outputFormat: 'text' | 'json' | 'markdown',
  analysisResults: RepositoryAnalysisResult,
  options: {
    query: string;
    analysisType?: string;
  }
): string {
  // Add metadata about the analysis
  const metadataSection = `
Analysis performed with:
- Components identified: ${analysisResults.components.length}
- Design patterns detected: ${analysisResults.patterns.length}
- Metrics calculated: ${Object.keys(analysisResults.metrics).length}
${analysisResults.securityIssues ? `- Security issues found: ${analysisResults.securityIssues.length}` : ''}
${analysisResults.performanceIssues ? `- Performance issues found: ${analysisResults.performanceIssues.length}` : ''}
`;

  switch (outputFormat) {
    case 'json':
      return JSON.stringify({
        response,
        metadata: {
          components: analysisResults.components.length,
          patterns: analysisResults.patterns.length,
          metrics: Object.keys(analysisResults.metrics).length,
          securityIssues: analysisResults.securityIssues?.length || 0,
          performanceIssues: analysisResults.performanceIssues?.length || 0,
          analysisType: options.analysisType || 'general'
        }
      }, null, 2);
      
    case 'markdown':
      return `${response}\n\n---\n${metadataSection}`;
      
    default:
      return `${response}\n\n${metadataSection}`;
  }
}
