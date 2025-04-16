/**
 * OpenAI API Integration
 * 
 * Provides integration with OpenAI's models for the multi-model bridge,
 * handling API calls, error handling, and response parsing.
 */

import fetch from 'node-fetch';
import { ApiKeyMissingError, ModelError, NetworkError, RateLimitError } from './errors.js';
import { Logger } from './types.js';

/**
 * OpenAI model configuration
 */
export interface OpenAIModelConfig {
  id: string;                    // Model identifier for API calls
  displayName: string;           // Human-readable name for logs and messages
  maxInputTokens: number;        // Maximum tokens for input
  maxOutputTokens: number;       // Maximum tokens for response generation
  description: string;           // Brief description of the model's capabilities
  defaultTemp: number;           // Default temperature value
}

/**
 * OpenAI available models
 */
export const OPENAI_MODELS: Record<string, OpenAIModelConfig> = {
  'gpt-4o': {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    maxInputTokens: 128000, 
    maxOutputTokens: 4096,
    description: 'Most capable GPT-4 model with balanced intelligence, speed, and cost.',
    defaultTemp: 0.7
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    maxInputTokens: 128000, 
    maxOutputTokens: 4096,
    description: 'GPT-4 Turbo with improved capabilities.',
    defaultTemp: 0.7
  },
  'gpt-4': {
    id: 'gpt-4',
    displayName: 'GPT-4',
    maxInputTokens: 8192, 
    maxOutputTokens: 4096,
    description: 'Original GPT-4 model with strong reasoning capabilities.',
    defaultTemp: 0.7
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    maxInputTokens: 16385, 
    maxOutputTokens: 4096,
    description: 'Fast, efficient model for most tasks.',
    defaultTemp: 0.7
  }
};

/**
 * Default model to use
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

/**
 * Options for calling the OpenAI API
 */
export interface OpenAIOptions {
  maxTokens?: number;           // Maximum tokens for response
  temperature?: number;         // Temperature for response generation
  model?: string;               // OpenAI model to use
  systemPrompt?: string;        // System prompt
  tools?: any[];                // Tools for function calling
  logger?: Logger;              // Logger for API calls
}

/**
 * OpenAI API request for chat completion
 */
export interface OpenAIRequest {
  model: string;                // Model identifier
  messages: OpenAIMessage[];    // Messages for the conversation
  max_tokens?: number;          // Maximum tokens for response
  temperature?: number;         // Temperature for response generation
  tools?: any[];                // Tools for function calling
  tool_choice?: string | any;   // Tool choice configuration
}

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';  // Role of the message sender
  content: string | null;       // Content of the message
  name?: string;                // Name for the tool role
  tool_call_id?: string;        // ID of the tool call
  tool_calls?: any[];           // Tool calls made by the assistant
}

/**
 * OpenAI API response
 */
export interface OpenAIResponse {
  id: string;                   // Response identifier
  object: string;               // Object type
  created: number;              // Creation timestamp
  model: string;                // Model used
  choices: {
    index: number;              // Choice index
    message: OpenAIMessage;     // Response message
    logprobs: any;              // Log probabilities
    finish_reason: string;      // Reason for finishing
  }[];
  usage: {
    prompt_tokens: number;      // Tokens used for prompt
    completion_tokens: number;  // Tokens used for completion
    total_tokens: number;       // Total tokens used
  };
}

/**
 * Check if OpenAI API key is set
 */
function checkApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ApiKeyMissingError(
      'OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.'
    );
  }
  return apiKey;
}

/**
 * Parse error from OpenAI API response
 */
function parseOpenAIError(response: Response, body: any): Error {
  const statusCode = response.status;
  
  // Rate limiting
  if (statusCode === 429) {
    const retryAfter = response.headers.get('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    return new RateLimitError(
      `OpenAI API rate limit exceeded. ${body?.error?.message || ''}`,
      retrySeconds
    );
  }
  
  // Authentication error
  if (statusCode === 401) {
    return new ApiKeyMissingError(
      `OpenAI API authentication error: ${body?.error?.message || 'Invalid API key'}`
    );
  }
  
  // Other API errors
  if (statusCode >= 400) {
    return new ModelError(
      `OpenAI API error (${statusCode}): ${body?.error?.message || 'Unknown error'}`,
      body?.error?.type || 'unknown'
    );
  }
  
  // Default error
  return new Error(`OpenAI API error: ${body?.error?.message || 'Unknown error'}`);
}

/**
 * Call OpenAI API with retries
 */
export async function callOpenAI(
  prompt: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const {
    maxTokens = 1024,
    temperature = 0.7,
    model = DEFAULT_OPENAI_MODEL,
    systemPrompt = 'You are a helpful assistant specializing in code analysis and software development.',
    tools = [],
    logger = console
  } = options;

  const apiKey = checkApiKey();
  const modelConfig = OPENAI_MODELS[model] || OPENAI_MODELS[DEFAULT_OPENAI_MODEL];
  
  // Prepare request
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];
  
  const requestBody: OpenAIRequest = {
    model: modelConfig.id,
    messages,
    max_tokens: Math.min(maxTokens, modelConfig.maxOutputTokens),
    temperature
  };
  
  // Add tools if provided
  if (tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }
  
  // Maximum number of retries
  const maxRetries = 3;
  let retries = 0;
  let lastError: Error | null = null;
  
  while (retries < maxRetries) {
    try {
      logger.debug(`Calling OpenAI API (model: ${model}, retries: ${retries})`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      // Parse response
      const responseBody = await response.json();
      
      // Check for errors
      if (!response.ok) {
        throw parseOpenAIError(response, responseBody);
      }
      
      // Log usage
      if (responseBody.usage) {
        logger.debug(`OpenAI API usage: ${JSON.stringify(responseBody.usage)}`);
      }
      
      // Parse and return response
      if (responseBody.choices && responseBody.choices.length > 0) {
        if (responseBody.choices[0].message.tool_calls && responseBody.choices[0].message.tool_calls.length > 0) {
          // Handle tool calls (function calling)
          const toolCall = responseBody.choices[0].message.tool_calls[0];
          return JSON.stringify({
            type: 'tool_call',
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments)
          });
        } else {
          // Return normal text content
          return responseBody.choices[0].message.content || '';
        }
      }
      
      throw new ModelError(
        'OpenAI API returned an empty response',
        model
      );
    } catch (error) {
      lastError = error as Error;
      
      // Check if the error is retryable
      if (
        error instanceof NetworkError ||
        (error instanceof RateLimitError && error.retryAfterSeconds)
      ) {
        retries++;
        
        // Calculate backoff time (exponential with jitter)
        const backoffTime = error instanceof RateLimitError && error.retryAfterSeconds
          ? error.retryAfterSeconds * 1000
          : Math.min(Math.pow(2, retries) * 1000 + Math.random() * 1000, 10000);
        
        logger.warn(`OpenAI API call failed, retrying in ${backoffTime}ms...`, error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        // Non-retryable error
        throw error;
      }
    }
  }
  
  // If we've exhausted all retries
  throw lastError || new Error('OpenAI API call failed after multiple retries');
}

/**
 * Generate code analysis with OpenAI
 */
export async function analyzeCodeWithOpenAI(
  code: string,
  query: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const prompt = `
You are analyzing code to help understand its structure, patterns, and provide insights.

CODE:
\`\`\`
${code}
\`\`\`

QUERY: ${query}

Please provide a detailed analysis focusing on:
1. Overall structure and architecture
2. Key components and their relationships
3. Design patterns used
4. Potential issues or improvement areas
5. Specific answer to the query above

Format your response as markdown.
`;

  return callOpenAI(prompt, {
    ...options,
    systemPrompt: 'You are an expert software developer and code analyzer. Your task is to analyze code and provide insightful feedback and explanations.'
  });
}

/**
 * Generate code refactoring suggestions with OpenAI
 */
export async function suggestCodeRefactoring(
  code: string,
  goal: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const prompt = `
You are helping to refactor code according to best practices.

ORIGINAL CODE:
\`\`\`
${code}
\`\`\`

REFACTORING GOAL: ${goal}

Please suggest refactoring improvements focusing on:
1. Code structure and organization
2. Applying appropriate design patterns
3. Improving readability and maintainability
4. Reducing technical debt
5. Specific changes to achieve the stated goal

For each suggestion, include:
- Description of the change
- Rationale
- Code example of the refactored version
`;

  return callOpenAI(prompt, {
    ...options,
    systemPrompt: 'You are an expert software architect specializing in code refactoring and software design. Your task is to suggest thoughtful improvements to code while preserving functionality.'
  });
}

/**
 * Generate code documentation with OpenAI
 */
export async function generateCodeDocumentation(
  code: string,
  documentationType: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const prompt = `
You are generating documentation for the following code:

\`\`\`
${code}
\`\`\`

DOCUMENTATION TYPE: ${documentationType}

Please generate comprehensive documentation that covers:
1. Overview of the code's purpose
2. Detailed explanation of components and their interactions
3. Usage examples
4. API reference (if applicable)
5. Dependencies and requirements

Format the documentation in markdown.
`;

  return callOpenAI(prompt, {
    ...options,
    systemPrompt: 'You are an expert technical writer specializing in software documentation. Your task is to create clear, comprehensive, and useful documentation for code.'
  });
}

/**
 * Generate test cases with OpenAI
 */
export async function generateTestCases(
  code: string,
  testFramework: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const prompt = `
You are generating test cases for the following code:

\`\`\`
${code}
\`\`\`

TEST FRAMEWORK: ${testFramework}

Please generate comprehensive test cases that cover:
1. Unit tests for all public functions/methods
2. Edge cases and error handling
3. Integration tests if applicable
4. Mock objects or fixtures as needed

Format your response as test code using the specified framework.
`;

  return callOpenAI(prompt, {
    ...options,
    systemPrompt: 'You are an expert in software testing and test-driven development. Your task is to create comprehensive test cases for code to ensure its correctness and robustness.'
  });
}

/**
 * Generate architectural insights with OpenAI
 */
export async function generateArchitecturalInsights(
  repositoryAnalysis: any,
  query: string,
  options: OpenAIOptions = {}
): Promise<string> {
  const prompt = `
You are analyzing a software repository architecture based on the following analysis results:

\`\`\`json
${JSON.stringify(repositoryAnalysis, null, 2)}
\`\`\`

QUERY: ${query}

Please provide architectural insights focusing on:
1. Overall architecture evaluation
2. Component relationships and dependencies
3. Architectural patterns identified
4. Potential architectural improvements
5. Specific answer to the query

Format your response as markdown.
`;

  return callOpenAI(prompt, {
    ...options,
    systemPrompt: 'You are an expert software architect with deep knowledge of software design patterns, architecture styles, and system organization. Your task is to provide insightful architectural analysis and recommendations.'
  });
}
