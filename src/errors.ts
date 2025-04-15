/**
 * Enhanced error classes with better error handling capabilities
 */

/**
 * Base error class with cause tracking
 */
export class BaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    
    // Properly format error message with cause information
    if (cause) {
      const causeString = cause instanceof Error 
        ? `${cause.name}: ${cause.message}` 
        : String(cause);
        
      // Don't add cause to message as it makes for verbose error logs
      // Instead, preserve it in the 'cause' property for logging/debugging
    }
    
    // Capture stack trace correctly
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Format error for user-facing message with optional cause inclusion
   */
  formatUserMessage(includeDetails: boolean = false): string {
    let message = this.message;
    
    if (includeDetails && this.cause) {
      if (this.cause instanceof Error) {
        message += `\nCause: ${this.cause.message}`;
      } else {
        message += `\nCause: ${String(this.cause)}`;
      }
    }
    
    return message;
  }
}

/**
 * Error related to API key issues
 */
export class ApiKeyMissingError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `API Key Error: ${this.message}\n\nPlease check your GEMINI_API_KEY environment variable.`;
  }
}

/**
 * Error related to network/API calls
 */
export class NetworkError extends BaseError {
  constructor(message: string, cause?: unknown, public readonly statusCode?: number) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const baseMessage = `Network Error: ${this.message}`;
    const status = this.statusCode ? ` (Status: ${this.statusCode})` : '';
    
    return `${baseMessage}${status}\n\nPlease check your internet connection and try again.`;
  }
}

/**
 * Error related to file system access
 */
export class FileError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `File Error: ${this.message}\n\nPlease check that the path exists and is accessible.`;
  }
}

/**
 * Error related to path access security
 */
export class PathAccessError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `Path Access Error: ${this.message}\n\nPlease ensure you are requesting a path within the allowed directories.`;
  }
}

/**
 * Error related to repository packaging
 */
export class RepositoryPackagingError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `Repository Packaging Error: ${this.message}\n\nThere was a problem analyzing the repository. Please check the repository structure and try again.`;
  }
}

/**
 * Error related to token limits
 */
export class TokenLimitError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `Token Limit Error: ${this.message}\n\nThe content exceeds the maximum token limit. Consider reducing the scope of analysis or using a different approach.`;
  }
}

/**
 * Error related to rate limiting
 */
export class RateLimitError extends BaseError {
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
  
  readonly retryAfterSeconds?: number;
  
  formatUserMessage(): string {
    const retryMessage = this.retryAfterSeconds 
      ? `\n\nPlease try again after ${this.retryAfterSeconds} seconds.` 
      : '\n\nPlease try again later.';
      
    return `Rate Limit Error: ${this.message}${retryMessage}`;
  }
}

/**
 * Error related to unexpected model behavior
 */
export class ModelError extends BaseError {
  constructor(message: string, public readonly modelId?: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const model = this.modelId ? ` with model ${this.modelId}` : '';
    return `Model Error: ${this.message}\n\nThere was a problem${model}. Please try again or use a different model.`;
  }
}

/**
 * Error related to failed model fallback
 */
export class ModelFallbackError extends BaseError {
  constructor(message: string, public readonly attemptedModels: string[], cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const models = this.attemptedModels.join(', ');
    return `Model Fallback Error: ${this.message}\n\nAttempted models: ${models}. Please try again later or check your API key permissions.`;
  }
}

/**
 * Error for invalid configuration
 */
export class ConfigurationError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    return `Configuration Error: ${this.message}\n\nPlease check your configuration settings and try again.`;
  }
}

/**
 * Error for request validation failures
 */
export class ValidationError extends BaseError {
  constructor(message: string, public readonly fieldErrors?: Record<string, string>, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    let message = `Validation Error: ${this.message}\n`;
    
    if (this.fieldErrors && Object.keys(this.fieldErrors).length > 0) {
      message += '\nField errors:';
      for (const [field, error] of Object.entries(this.fieldErrors)) {
        message += `\n- ${field}: ${error}`;
      }
    }
    
    return message;
  }
}

/**
 * Error related to GitHub API issues
 */
export class GitHubApiError extends BaseError {
  constructor(message: string, public readonly statusCode?: number, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const statusInfo = this.statusCode ? ` (Status: ${this.statusCode})` : '';
    return `GitHub API Error: ${this.message}${statusInfo}\n\nThere was a problem accessing the GitHub API. Please check your authentication settings or try again later.`;
  }
}

/**
 * Error related to GitHub repository parsing
 */
export class GitHubRepositoryParsingError extends BaseError {
  constructor(message: string, public readonly repositoryString?: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const repoInfo = this.repositoryString ? ` ("${this.repositoryString}")` : '';
    return `GitHub Repository Parsing Error: ${this.message}${repoInfo}\n\nPlease provide a valid GitHub repository URL or owner/repo format.`;
  }
}

/**
 * Error related to GitHub repository cloning
 */
export class GitHubCloneError extends BaseError {
  constructor(message: string, public readonly repository?: string, cause?: unknown) {
    super(message, cause);
  }
  
  formatUserMessage(): string {
    const repoInfo = this.repository ? ` for repository "${this.repository}"` : '';
    return `GitHub Cloning Error: ${this.message}${repoInfo}\n\nPlease check that the repository exists and is accessible with your current authentication.`;
  }
}

/**
 * Create an appropriate error from any error type
 */
export function createAppropriateError(error: any): BaseError {
  if (error instanceof BaseError) {
    return error;
  }
  
  // Try to detect error type based on error properties and message
  const message = error?.message || String(error);
  
  if (message.includes('API key') || message.includes('authentication') || message.includes('auth')) {
    return new ApiKeyMissingError(message, error);
  }
  
  if (message.includes('ENOENT') || message.includes('file not found') || message.includes('no such file')) {
    return new FileError(message, error);
  }
  
  if (message.includes('permission') || message.includes('access') || message.includes('forbidden')) {
    return new PathAccessError(message, error);
  }
  
  if (message.includes('network') || message.includes('connection') || 
      message.includes('ETIMEDOUT') || message.includes('ECONNRESET') ||
      message.includes('fetch') || message.includes('status code')) {
    return new NetworkError(message, error);
  }
  
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
    return new RateLimitError(message);
  }
  
  if (message.includes('token') || message.includes('limit exceeded')) {
    return new TokenLimitError(message, error);
  }
  
  if (message.includes('GitHub') || message.includes('github.com')) {
    if (message.includes('clone') || message.includes('repository not found')) {
      return new GitHubCloneError(message, '', error);
    }
    if (message.includes('parsing') || message.includes('invalid format')) {
      return new GitHubRepositoryParsingError(message, '', error);
    }
    return new GitHubApiError(message, undefined, error);
  }
  
  // Default to base error
  return new BaseError(message, error);
}

/**
 * Enhanced error logging and formatting
 */
export function logErrorDetails(
  error: unknown, 
  logger: { error: (message: string, details?: any) => void }
): void {
  if (!error) {
    logger.error('Unknown error (undefined or null error object)');
    return;
  }
  
  if (error instanceof BaseError) {
    logger.error(`${error.name}: ${error.message}`, {
      cause: error.cause,
      stack: error.stack,
      ...(error instanceof ModelError ? { modelId: error.modelId } : {}),
      ...(error instanceof RateLimitError ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(error instanceof ValidationError ? { fieldErrors: error.fieldErrors } : {})
    });
  } else if (error instanceof Error) {
    logger.error(`Error: ${error.message}`, {
      name: error.name,
      stack: error.stack
    });
  } else {
    logger.error(`Unknown error: ${String(error)}`);
  }
}

/**
 * Define McpContentItem locally to match the definition in index.ts
 * This ensures the error response format is consistent.
 */
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

/**
 * Format any error for API response
 */
export function formatErrorForResponse(
  error: unknown, 
  includeDetails: boolean = false
): { 
  content: McpContentItem[];
  isError: true;
} {
  let errorMessage: string;
  
  if (error instanceof BaseError) {
    errorMessage = error.formatUserMessage(includeDetails);
  } else if (error instanceof Error) {
    errorMessage = `Error: ${error.message}`;
  } else {
    errorMessage = `Unexpected error: ${String(error)}`;
  }
  
  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true
  };
}