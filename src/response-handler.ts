import { NetworkError } from './errors.js';
import { Logger, OutputFormat } from './types.js';

/**
 * Types for Gemini API responses
 */
export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  index?: number;
  safetyRatings?: any[];
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  promptFeedback?: any;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Response format options
 */
export type ResponseFormat = 'text' | 'markdown' | 'code' | 'json';

/**
 * Options for parsing responses
 */
export interface ResponseParsingOptions {
  format?: ResponseFormat;
  includeSafetyInfo?: boolean;
  includeUsageInfo?: boolean;
  logger?: Logger;
}

/**
 * Parsed response with additional metadata
 */
export interface ParsedGeminiResponse {
  text: string;
  format: ResponseFormat;
  safety?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

/**
 * Parse raw Gemini API response into a more usable format
 */
export function parseGeminiResponse(
  rawResponse: any, 
  options: ResponseParsingOptions = {}
): ParsedGeminiResponse {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  logger.debug("Parsing Gemini response", {
    responseType: typeof rawResponse,
    hasData: !!rawResponse
  });
  
  try {
    const response = rawResponse as GeminiResponse;
    
    // Check if response has candidates
    if (!response.candidates || response.candidates.length === 0) {
      throw new NetworkError("No candidates returned from Gemini API");
    }
    
    const candidate = response.candidates[0];
    
    // Extract text content
    let text = '';
    if (candidate.content && candidate.content.parts) {
      text = candidate.content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('');
    }
    
    if (!text) {
      throw new NetworkError("Empty response from Gemini API");
    }
    
    // Detect format if not specified
    const format = options.format || detectResponseFormat(text);
    
    // Create parsed response
    const parsedResponse: ParsedGeminiResponse = {
      text,
      format,
      finishReason: candidate.finishReason
    };
    
    // Add safety info if requested and available
    if (options.includeSafetyInfo && candidate.safetyRatings) {
      parsedResponse.safety = candidate.safetyRatings;
    }
    
    // Add usage info if requested and available
    if (options.includeUsageInfo && response.usage) {
      parsedResponse.usage = {
        promptTokens: response.usage.promptTokenCount,
        completionTokens: response.usage.candidatesTokenCount,
        totalTokens: response.usage.totalTokenCount
      };
    }
    
    logger.debug("Successfully parsed Gemini response", {
      format: parsedResponse.format,
      textLength: parsedResponse.text.length,
      finishReason: parsedResponse.finishReason
    });
    
    return parsedResponse;
  } catch (error: any) {
    logger.error("Error parsing Gemini response", error);
    
    if (error instanceof NetworkError) {
      throw error;
    }
    
    throw new NetworkError(`Failed to parse Gemini response: ${error.message}`);
  }
}

/**
 * Attempt to detect the format of the response
 */
function detectResponseFormat(text: string): ResponseFormat {

  // Check if it's mostly JSON
  if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch (e) {
      // Not valid JSON
    }
  }
  
  // Check if it's primarily code
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = text.match(codeBlockRegex);
  
  if (codeBlocks && codeBlocks.join('').length > text.length * 0.5) {
    return 'code';
  }
  
  // Check for markdown features
  const markdownFeatures = [
    /^#+ /m,        // Headers
    /\*\*.*?\*\*/,  // Bold
    /\*.*?\*/,      // Italic
    /`.*?`/,        // Inline code
    /\[.*?\]\(.*?\)/, // Links
    /^\s*[-*+] /m,  // Lists
    /^\s*\d+\. /m   // Numbered lists
  ];
  
  const markdownScore = markdownFeatures.reduce(
    (score, regex) => score + (regex.test(text) ? 1 : 0), 
    0
  );
  
  if (markdownScore >= 2) {
    return 'markdown';
  }
  
  // Default to plain text
  return 'text';
}

/**
 * Format the response for MCP output
 */
export function formatResponseForMCP(
  parsedResponse: ParsedGeminiResponse,
  options: {
    includeMetadata?: boolean;
    logger?: Logger;
  } = {}
): { content: Array<{ type: string; text: string }> } {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  let responseText = parsedResponse.text;
  
  // Add metadata information if requested
  if (options.includeMetadata) {
    let metadata = '\n\n---\n';
    
    if (parsedResponse.finishReason) {
      metadata += `\nFinish reason: ${parsedResponse.finishReason}`;
    }
    
    if (parsedResponse.usage) {
      metadata += `\nToken usage: ${parsedResponse.usage.totalTokens} tokens`;
      metadata += ` (${parsedResponse.usage.promptTokens} prompt, ${parsedResponse.usage.completionTokens} completion)`;
    }
    
    responseText += metadata;
  }
  
  logger.debug("Formatted response for MCP", {
    format: parsedResponse.format,
    length: responseText.length,
    includesMetadata: options.includeMetadata
  });
  
  return {
    content: [{ type: "text", text: responseText }]
  };
}

/**
 * Create a structured output according to preferences
 */
export function createStructuredOutput(
  response: ParsedGeminiResponse,
  query: string,
  options: {
    includePrompt?: boolean;
    includeMetadata?: boolean;
    outputFormat?: OutputFormat;
    logger?: Logger;
  } = {}
): { content: Array<{ type: string; text: string }> } {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  if (options.outputFormat === 'json') {
    const output: any = {
      response: response.text,
      format: response.format
    };
    
    if (options.includePrompt) {
      output.query = query;
    }
    
    if (options.includeMetadata) {
      if (response.finishReason) {
        output.finishReason = response.finishReason;
      }
      
      if (response.usage) {
        output.usage = response.usage;
      }
    }
    
    logger.debug("Created JSON structured output");
    
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
    };
  }
  
  // Default text format
  let output = response.text;
  
  if (options.includePrompt) {
    output = `QUERY: ${query}\n\nRESPONSE:\n${output}`;
  }
  
  if (options.includeMetadata) {
    let metadata = '\n\n---\n';
    
    if (response.finishReason) {
      metadata += `\nFinish reason: ${response.finishReason}`;
    }
    
    if (response.usage) {
      metadata += `\nToken usage: ${response.usage.totalTokens} tokens`;
      metadata += ` (${response.usage.promptTokens} prompt, ${response.usage.completionTokens} completion)`;
    }
    
    output += metadata;
  }
  
  logger.debug("Created text structured output");
  
  return {
    content: [{ type: "text", text: output }]
  };
}

/**
 * Build a response that includes both AI text and analysis results
 */
export function buildResponseFromAnalysis(
  parsedResponse: ParsedGeminiResponse,
  analysisResult: any,
  options: {
    outputFormat?: OutputFormat;
    includeMetadata?: boolean;
    includeAnalysisDetails?: boolean;
    logger?: Logger;
  } = {}
): { content: Array<{ type: string; text: string }> } {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  // For JSON output, return a combined structure
  if (options.outputFormat === 'json') {
    const output: any = {
      response: parsedResponse.text,
      format: parsedResponse.format
    };
    
    // Add analysis data
    if (options.includeAnalysisDetails !== false) {
      output.analysis = {
        components: analysisResult.components.length,
        architecture: analysisResult.architecture.type,
        patterns: analysisResult.patterns.map((p: any) => p.name)
      };
    }
    
    // Add metadata if requested
    if (options.includeMetadata) {
      if (parsedResponse.finishReason) {
        output.finishReason = parsedResponse.finishReason;
      }
      
      if (parsedResponse.usage) {
        output.usage = parsedResponse.usage;
      }
    }
    
    logger.debug("Created JSON response with analysis data");
    
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
    };
  }
  
  // For text/markdown output, use the parsed response with additional sections
  let output = parsedResponse.text;
  
  // Add analysis summary if requested
  if (options.includeAnalysisDetails !== false) {
    output += '\n\n## Analysis Summary\n';
    output += `\n- Identified **${analysisResult.components.length}** components`;
    output += `\n- Architecture: **${analysisResult.architecture.type}**`;
    output += `\n- Detected design patterns: ${analysisResult.patterns.map((p: any) => p.name).join(', ')}`;
    
    if (analysisResult.metrics) {
      output += `\n- Code metrics: ${analysisResult.metrics.totalFiles} files`;
      if (analysisResult.metrics.cyclomaticComplexity) {
        output += `, avg. complexity: ${analysisResult.metrics.cyclomaticComplexity}`;
      }
    }
  }
  
  // Add metadata if requested
  if (options.includeMetadata) {
    let metadata = '\n\n---\n';
    
    if (parsedResponse.finishReason) {
      metadata += `\nFinish reason: ${parsedResponse.finishReason}`;
    }
    
    if (parsedResponse.usage) {
      metadata += `\nToken usage: ${parsedResponse.usage.totalTokens} tokens`;
      metadata += ` (${parsedResponse.usage.promptTokens} prompt, ${parsedResponse.usage.completionTokens} completion)`;
    }
    
    output += metadata;
  }
  
  logger.debug("Created text response with analysis data");
  
  return {
    content: [{ type: "text", text: output }]
  };
}
