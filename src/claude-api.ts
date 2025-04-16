/**
 * Claude API Client
 * 
 * Handles communication with Claude models via the Anthropic API.
 */

import fetch from 'node-fetch';
import { 
  ClaudeRequest, 
  ClaudeResponse, 
  ClaudeOptions, 
  ClaudeMessage
} from './bridge-types.js';
import { Logger } from './types.js';
import { ConfigManagerInterface } from './types.js';
import { getConfigManager } from './config-manager.js';

// API Constants
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-opus-20240229';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Error thrown when Claude API key is missing
 */
export class ClaudeApiKeyMissingError extends Error {
  constructor(message = 'CLAUDE_API_KEY is not defined') {
    super(message);
    this.name = 'ClaudeApiKeyMissingError';
  }
}

/**
 * Error thrown when Claude API returns an error
 */
export class ClaudeApiError extends Error {
  status: number;
  details: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Call the Claude API with retry logic
 */
export async function callClaude(
  messages: ClaudeMessage[] | string,
  options: ClaudeOptions = {}
): Promise<string> {
  const logger = options.logger || console;
  const configManager = getConfigManager();
  
  // Get API key from environment
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new ClaudeApiKeyMissingError();
  }

  // Normalize messages format
  let normalizedMessages: ClaudeMessage[];
  if (typeof messages === 'string') {
    normalizedMessages = [{ role: 'user', content: messages }];
  } else {
    normalizedMessages = messages;
  }

  // Prepare request
  const model = options.model || configManager.getClaudeModel?.() || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || configManager.getClaudeMaxTokens?.() || DEFAULT_MAX_TOKENS;
  const temperature = options.temperature || configManager.getClaudeTemperature?.() || DEFAULT_TEMPERATURE;
  
  const request: ClaudeRequest = {
    model,
    messages: normalizedMessages,
    max_tokens: maxTokens,
    temperature
  };
  
  // Add system prompt if specified
  if (options.systemPrompt) {
    request.system = options.systemPrompt;
  }
  
  logger.debug('Calling Claude API with model:', model);
  logger.debug('Request details:', { 
    model, 
    temperature, 
    maxTokens, 
    messageCount: normalizedMessages.length,
    hasSystemPrompt: !!options.systemPrompt 
  });

  // Set up retry logic
  const maxRetries = 3;
  const retryDelay = 1000; // Start with 1s delay
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify(request)
      });
      
      // Parse the response
      const responseData = await response.json() as any;
      
      // Check for errors
      if (!response.ok) {
        const errorMessage = responseData.error?.message || 'Unknown Claude API error';
        logger.error(`Claude API error (${response.status}): ${errorMessage}`);
        
        if (response.status === 429 && attempt < maxRetries - 1) {
          // Rate limit error, retry after delay
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          logger.info(`Rate limited, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new ClaudeApiError(errorMessage, response.status, responseData.error);
      }
      
      // Log token usage if available
      if (responseData.usage) {
        logger.debug('Claude API token usage:', responseData.usage);
      }
      
      // Extract the response text
      if (responseData.content && Array.isArray(responseData.content)) {
        const textContent = responseData.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('');
        
        return textContent;
      }
      
      // Return the full response for old API versions
      return responseData.completion || responseData.content;
      
    } catch (error) {
      // Don't retry on authentication errors
      if (error instanceof ClaudeApiError && error.status === 401) {
        throw error;
      }
      
      // Retry on network errors or 5xx server errors
      if (attempt < maxRetries - 1 && 
          (!(error instanceof ClaudeApiError) || error.status >= 500)) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        logger.warn(`Claude API request failed, retrying in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Max retries exceeded or non-retryable error
        throw error;
      }
    }
  }
  
  // This should never be reached due to the error handling above
  throw new Error('Max retries exceeded without resolution');
}

/**
 * Get the full Claude response object for more control
 */
export async function callClaudeRaw(
  messages: ClaudeMessage[] | string,
  options: ClaudeOptions = {}
): Promise<ClaudeResponse> {
  const logger = options.logger || console;
  const configManager = getConfigManager();
  
  // Get API key from environment
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new ClaudeApiKeyMissingError();
  }

  // Normalize messages format
  let normalizedMessages: ClaudeMessage[];
  if (typeof messages === 'string') {
    normalizedMessages = [{ role: 'user', content: messages }];
  } else {
    normalizedMessages = messages;
  }

  // Prepare request
  const model = options.model || configManager.getClaudeModel?.() || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || configManager.getClaudeMaxTokens?.() || DEFAULT_MAX_TOKENS;
  const temperature = options.temperature || configManager.getClaudeTemperature?.() || DEFAULT_TEMPERATURE;
  
  const request: ClaudeRequest = {
    model,
    messages: normalizedMessages,
    max_tokens: maxTokens,
    temperature
  };
  
  // Add system prompt if specified
  if (options.systemPrompt) {
    request.system = options.systemPrompt;
  }
  
  logger.debug('Calling Claude API with model:', model);

  // Make the API request
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(request)
  });
  
  // Check for errors
  if (!response.ok) {
    const responseData = await response.json() as any;
    const errorMessage = responseData.error?.message || 'Unknown Claude API error';
    logger.error(`Claude API error (${response.status}): ${errorMessage}`);
    throw new ClaudeApiError(errorMessage, response.status, responseData.error);
  }
  
  // Parse and return the full response
  const responseData = await response.json() as ClaudeResponse;
  return responseData;
}

/**
 * Call Claude with reasoning capabilities for code evolution
 */
export async function callClaudeForReasoning(
  analysisResult: any,
  query: string,
  options: ClaudeOptions = {}
): Promise<any> {
  const logger = options.logger || console;
  
  // Create reasoning-focused system prompt if not provided
  const systemPrompt = options.systemPrompt || `You are a code analysis assistant with expertise in software architecture, design patterns, and best practices. 
You have strong reasoning capabilities and can provide intelligent insights about code.
Your task is to analyze the provided code structure and architecture, then reason about potential improvements, transformations, or evolution paths.
Focus on identifying:
1. Component roles and responsibilities
2. Architectural insights and patterns
3. Potential improvements for code quality, maintainability, and performance
4. Security concerns and performance bottlenecks
5. Suggested code changes with clear rationale
Be specific in your reasoning and provide concrete suggestions.`;

  // Format the analysis result for the prompt
  const analysisResultStr = typeof analysisResult === 'string' 
    ? analysisResult 
    : JSON.stringify(analysisResult, null, 2);

  // Build the messages
  const messages: ClaudeMessage[] = [
    {
      role: 'user',
      content: `# Code Analysis Result
\`\`\`json
${analysisResultStr}
\`\`\`

# Query
${query}

Please analyze this code structure and provide your reasoning about:
1. What are the roles and responsibilities of each component?
2. What architectural insights can you derive from this analysis?
3. What are potential improvements that could be made?
4. Do you identify any security concerns or performance bottlenecks?
5. What specific code changes would you suggest?

Provide your reasoning in a structured format that can be parsed programmatically.`
    }
  ];

  // Call Claude with reasoning system prompt
  const response = await callClaude(messages, {
    ...options,
    systemPrompt
  });

  // Attempt to extract structured reasoning
  try {
    // Extract JSON from the response if present
    const jsonMatch = response.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        logger.warn('Failed to parse JSON from response, returning raw response');
      }
    }

    // Process the text response into structured format
    return processReasoningResponse(response);
  } catch (error) {
    logger.error('Error processing reasoning response', error);
    return { 
      interpretations: { 
        raw: response,
        error: (error instanceof Error) ? error.message : String(error)
      }
    };
  }
}

/**
 * Process a text reasoning response into structured format
 */
function processReasoningResponse(response: string): any {
  // Split the response into sections
  const sections: { [key: string]: string[] } = {
    componentRoles: [],
    architecturalInsights: [],
    potentialImprovements: [],
    securityConcerns: [],
    performanceBottlenecks: [],
    suggestedChanges: []
  };
  
  // Process component roles
  const componentRolesMatch = response.match(/Component Roles[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (componentRolesMatch && componentRolesMatch[1]) {
    sections.componentRoles = componentRolesMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Process architectural insights
  const architecturalInsightsMatch = response.match(/Architectural Insights[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (architecturalInsightsMatch && architecturalInsightsMatch[1]) {
    sections.architecturalInsights = architecturalInsightsMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Process potential improvements
  const potentialImprovementsMatch = response.match(/Potential Improvements[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (potentialImprovementsMatch && potentialImprovementsMatch[1]) {
    sections.potentialImprovements = potentialImprovementsMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Process security concerns
  const securityConcernsMatch = response.match(/Security Concerns[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (securityConcernsMatch && securityConcernsMatch[1]) {
    sections.securityConcerns = securityConcernsMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Process performance bottlenecks
  const performanceBottlenecksMatch = response.match(/Performance Bottlenecks[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (performanceBottlenecksMatch && performanceBottlenecksMatch[1]) {
    sections.performanceBottlenecks = performanceBottlenecksMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Process suggested changes
  const suggestedChangesMatch = response.match(/Suggested Changes[:\s]+([\s\S]+?)(?=\n#|\n##|$)/i);
  if (suggestedChangesMatch && suggestedChangesMatch[1]) {
    sections.suggestedChanges = suggestedChangesMatch[1]
      .trim()
      .split(/\n+/)
      .filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  }
  
  // Convert to structured format
  return {
    interpretations: {
      componentRoles: processComponentRoles(sections.componentRoles),
      architecturalInsights: sections.architecturalInsights.map(cleanBulletPoint),
      potentialImprovements: sections.potentialImprovements.map(cleanBulletPoint),
      securityConcerns: processSecurityConcerns(sections.securityConcerns),
      performanceBottlenecks: processPerformanceBottlenecks(sections.performanceBottlenecks)
    },
    suggestedChanges: processSuggestedChanges(sections.suggestedChanges)
  };
}

/**
 * Process component role descriptions into a map
 */
function processComponentRoles(lines: string[]): Record<string, string> {
  const roles: Record<string, string> = {};
  
  for (const line of lines) {
    const match = line.match(/^-?\s*(?:\*\*)?([^:]+)(?:\*\*)?[:]?\s*(.*)/);
    if (match) {
      const component = match[1].trim();
      const description = match[2].trim();
      if (component && description) {
        roles[component] = description;
      }
    }
  }
  
  return roles;
}

/**
 * Process security concerns into structured format
 */
function processSecurityConcerns(lines: string[]): any[] {
  const concerns: any[] = [];
  let currentConcern: any = null;
  
  for (const line of lines) {
    const titleMatch = line.match(/^-?\s*(?:\*\*)?([^:]+)(?:\*\*)?:\s*(.*)/);
    if (titleMatch) {
      if (currentConcern) {
        concerns.push(currentConcern);
      }
      currentConcern = {
        type: titleMatch[1].trim(),
        description: titleMatch[2].trim(),
        severity: determineSeverity(titleMatch[1])
      };
    } else if (currentConcern && line.trim()) {
      currentConcern.description += ' ' + line.trim();
    }
  }
  
  if (currentConcern) {
    concerns.push(currentConcern);
  }
  
  return concerns;
}

/**
 * Process performance bottlenecks into structured format
 */
function processPerformanceBottlenecks(lines: string[]): any[] {
  const bottlenecks: any[] = [];
  let currentBottleneck: any = null;
  
  for (const line of lines) {
    const titleMatch = line.match(/^-?\s*(?:\*\*)?([^:]+)(?:\*\*)?:\s*(.*)/);
    if (titleMatch) {
      if (currentBottleneck) {
        bottlenecks.push(currentBottleneck);
      }
      currentBottleneck = {
        type: titleMatch[1].trim(),
        description: titleMatch[2].trim(),
        impact: determineImpact(titleMatch[1])
      };
    } else if (currentBottleneck && line.trim()) {
      currentBottleneck.description += ' ' + line.trim();
    }
  }
  
  if (currentBottleneck) {
    bottlenecks.push(currentBottleneck);
  }
  
  return bottlenecks;
}

/**
 * Process suggested changes into structured format
 */
function processSuggestedChanges(lines: string[]): any[] {
  const changes: any[] = [];
  let currentChange: any = null;
  
  for (const line of lines) {
    const titleMatch = line.match(/^-?\s*(?:\*\*)?([^:]+)(?:\*\*)?:\s*(.*)/);
    if (titleMatch) {
      if (currentChange) {
        changes.push(currentChange);
      }
      currentChange = {
        id: `change-${changes.length + 1}`,
        type: determineChangeType(titleMatch[1].trim()),
        description: titleMatch[2].trim(),
        filePath: extractFilePath(titleMatch[1].trim() + ' ' + titleMatch[2].trim())
      };
    } else if (currentChange && line.trim()) {
      currentChange.description += ' ' + line.trim();
      
      // Try to extract file path if not already set
      if (!currentChange.filePath) {
        const extractedPath = extractFilePath(line);
        if (extractedPath) {
          currentChange.filePath = extractedPath;
        }
      }
    }
  }
  
  if (currentChange) {
    changes.push(currentChange);
  }
  
  return changes;
}

/**
 * Helper function to clean bullet points
 */
function cleanBulletPoint(line: string): string {
  return line.replace(/^[-*•]\s*/, '').trim();
}

/**
 * Helper function to determine severity of security issues
 */
function determineSeverity(title: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowTerms = ['minor', 'low', 'small'];
  const mediumTerms = ['medium', 'moderate', 'potential'];
  const highTerms = ['high', 'severe', 'important', 'major'];
  const criticalTerms = ['critical', 'urgent', 'immediate', 'vulnerability'];
  
  const lowerTitle = title.toLowerCase();
  
  if (criticalTerms.some(term => lowerTitle.includes(term))) {
    return 'critical';
  } else if (highTerms.some(term => lowerTitle.includes(term))) {
    return 'high';
  } else if (mediumTerms.some(term => lowerTitle.includes(term))) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Helper function to determine impact of performance issues
 */
function determineImpact(title: string): 'low' | 'medium' | 'high' {
  const lowTerms = ['minor', 'low', 'small'];
  const mediumTerms = ['medium', 'moderate', 'potential'];
  const highTerms = ['high', 'severe', 'important', 'major', 'critical'];
  
  const lowerTitle = title.toLowerCase();
  
  if (highTerms.some(term => lowerTitle.includes(term))) {
    return 'high';
  } else if (mediumTerms.some(term => lowerTitle.includes(term))) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Helper function to determine change type
 */
function determineChangeType(title: string): 'create' | 'update' | 'delete' | 'move' {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('creat') || lowerTitle.includes('add') || lowerTitle.includes('new')) {
    return 'create';
  } else if (lowerTitle.includes('delet') || lowerTitle.includes('remov')) {
    return 'delete';
  } else if (lowerTitle.includes('mov') || lowerTitle.includes('relocat')) {
    return 'move';
  } else {
    return 'update';
  }
}

/**
 * Helper function to extract file path from text
 */
function extractFilePath(text: string): string | null {
  // Look for file paths like src/file.ts or /path/to/file.ext
  const patterns = [
    /(?:in|at|from|to|file|path)\s+['"]?([/\w.-]+\.\w+)['"]?/i,
    /['"]([/\w.-]+\.\w+)['"]/,
    /\b((?:\.{0,2}\/)?[\w.-]+\/[\w.-]+\.\w+)\b/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Get available Claude models
 */
export function getAvailableClaudeModels(): { id: string; displayName: string; description: string }[] {
  return [
    {
      id: 'claude-3-opus-20240229',
      displayName: 'Claude 3 Opus',
      description: 'Most powerful model for complex tasks requiring careful reasoning'
    },
    {
      id: 'claude-3-sonnet-20240229',
      displayName: 'Claude 3 Sonnet',
      description: 'Balanced model with strong performance and faster response times'
    },
    {
      id: 'claude-3-haiku-20240307',
      displayName: 'Claude 3 Haiku',
      description: 'Fastest and most compact model for quick responses and high throughput'
    }
  ];
}
