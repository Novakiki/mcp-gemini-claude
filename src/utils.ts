import { FileError, PathAccessError, ApiKeyMissingError, NetworkError } from './errors.js';
import { Logger } from './types.js';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { execSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

// Configuration for allowed directories
// By default, only allow access to the current working directory
export const ALLOWED_DIRS = [
  process.cwd(),
  // Add other allowed directories here if needed
];

/**
 * Validates a file or directory path for security and accessibility
 * @param inputPath Path to validate
 * @param options Options for validation
 * @returns Normalized path if valid
 */
export function validatePath(
  inputPath: string, 
  options?: { allowAbsolute?: boolean }
): string {
  // Default to disallowing absolute paths for safety
  const allowAbsolute = options?.allowAbsolute ?? false;
  
  // Normalize path to prevent path traversal attacks
  const normalizedPath = path.normalize(inputPath);
  
  // Check if path is absolute
  if (path.isAbsolute(normalizedPath) && !allowAbsolute) {
    throw new PathAccessError(`Absolute paths are not allowed: ${normalizedPath}`);
  }
  
  // Validate that the path exists
  if (!fs.existsSync(normalizedPath)) {
    throw new FileError(`Path does not exist: ${normalizedPath}`);
  }
  
  return normalizedPath;
}

/**
 * Checks if a path is within allowed directories
 */
export function isInAllowedDirectory(filePath: string): boolean {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.resolve(process.cwd(), filePath);
    
  return ALLOWED_DIRS.some(dir => absolutePath.startsWith(dir));
}

/**
 * Creates a secure temporary directory for files
 */
export function createSecureTempDir(prefix: string = 'gemini-bridge-'): { tempDir: string, tempFile: string } {
  const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
  const tempFile = path.join(tempDir, `repomix-output-${Date.now()}.txt`);
  return { tempDir, tempFile };
}

/**
 * Safely clean up temporary files
 */
export async function cleanupTempFiles(tempFile: string, tempDir: string, logger: Logger): Promise<void> {
  try {
    if (fs.existsSync(tempFile)) {
      await fsPromises.unlink(tempFile);
      logger.debug("Temporary file deleted", { path: tempFile });
    }
    if (fs.existsSync(tempDir)) {
      await fsPromises.rmdir(tempDir);
      logger.debug("Temporary directory deleted", { path: tempDir });
    }
  } catch (error) {
    logger.error('Failed to clean up temporary files', error);
  }
}

/**
 * Retry function with exponential backoff
 * @template T The return type of the operation
 * @param operation The async operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in milliseconds before first retry
 * @param shouldRetry Function that determines if a particular error should trigger a retry
 * @param logger Optional logger for retry messages
 * @returns Result of the operation if successful
 * @throws The last error encountered if all retries fail
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  shouldRetry: (error: unknown) => boolean = () => true,
  logger?: Logger
): Promise<T> {
  let attempt = 1;
  let lastError: unknown;
  
  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (logger) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.info(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms due to: ${errorMessage}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
  
  // At this point, all retries have failed
  if (lastError instanceof Error) {
    throw lastError;
  } else {
    throw new Error(`Operation failed after ${maxRetries} attempts: ${String(lastError)}`);
  }
}

/**
 * Enhanced error logging with detailed information
 */
export function logErrorDetails(error: any, logger: Logger): void {
  if (error instanceof Error) {
    logger.error(`${error.name}: ${error.message}`);
    
    // Log stack trace in debug mode
    if (process.env.DEBUG) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    
    // Log cause if available
    if ('cause' in error && error.cause) {
      logger.error('Caused by:', error.cause);
    }
  } else {
    logger.error('Unknown error:', error);
  }
}

/**
 * Validates Gemini API key with better error handling
 */
export function validateGeminiAPIKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new ApiKeyMissingError('GEMINI_API_KEY environment variable is required');
  }
  
  // Check if it's a service account JSON file
  if (fs.existsSync(apiKey)) {
    if (path.extname(apiKey).toLowerCase() === '.json') {
      try {
        const jsonContent = JSON.parse(fs.readFileSync(apiKey, 'utf-8'));
        if (jsonContent.project_id && jsonContent.private_key && jsonContent.client_email) {
          return apiKey;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ApiKeyMissingError(`Invalid service account JSON file: ${errorMessage}`);
      }
    } else {
      // Check if it's ADC
      if (apiKey.toLowerCase() === 'adc') {
        try {
          // Test ADC credentials
          const adcTest = execSync('gcloud auth application-default print-access-token', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          if (!adcTest || adcTest.trim().length === 0) {
            throw new Error('Failed to get ADC token');
          }
        } catch (error) {
          throw new ApiKeyMissingError(
            'Failed to use Application Default Credentials (ADC). ' +
            'Please run "gcloud auth application-default login" and ensure you have the necessary permissions.'
          );
        }
        
        return apiKey;
      }
      
      // For direct API key, validate format (simple check)
      if (apiKey.length < 20) {
        throw new ApiKeyMissingError('Gemini API key appears to be invalid (too short)');
      }
      
      return apiKey;
    }
  }
  
  throw new ApiKeyMissingError(`Gemini service account JSON file not found: ${apiKey}`);
}

/**
 * Handle Gemini API errors with better guidance
 */
export function handleGeminiAPIError(error: any): Error {
  const errorMessage = error?.message || String(error);
  
  // API key issues
  if (errorMessage.includes('API key not valid') || errorMessage.includes('invalid key')) {
    return new ApiKeyMissingError(
      'The provided Gemini API key is invalid. Please check your GEMINI_API_KEY environment variable.'
    );
  }
  
  // Permission issues
  if (errorMessage.includes('permission') || errorMessage.includes('ACCESS_DENIED')) {
    return new ApiKeyMissingError(
      'The provided Gemini API key or service account does not have sufficient permissions. ' +
      'Please ensure you have enabled the Generative Language API in your Google Cloud Console.'
    );
  }
  
  // Quota issues
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
    return new NetworkError(
      'Gemini API quota exceeded or rate limit reached. ' +
      'Please try again later or check your quota settings in Google Cloud Console.'
    );
  }
  
  return new NetworkError(`Gemini API error: ${errorMessage}`);
}
