import path from 'path';
import fs from 'fs/promises';
import { FileError, PathAccessError } from './errors.js';
import { statSync, lstatSync, existsSync } from 'fs';

/**
 * Configuration constants for repository size limits
 */
export const SIZE_LIMITS = {
  // Maximum repository size in bytes
  MAX_REPO_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB
  
  // Maximum number of files in a repository
  MAX_FILE_COUNT: 5000,
  
  // Maximum size of a single file to analyze
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  
  // Maximum token count for repository content
  MAX_TOKEN_COUNT: 100000,
  
  // File patterns to always exclude (binary files, etc.)
  ALWAYS_EXCLUDE_PATTERNS: [
    '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.bmp', 
    '**/*.ico', '**/*.svg', '**/*.webp', '**/*.pdf', '**/*.zip',
    '**/*.tar', '**/*.gz', '**/*.rar', '**/*.7z', '**/*.mp3',
    '**/*.mp4', '**/*.avi', '**/*.mov', '**/*.wav', '**/*.flac',
    '**/*.o', '**/*.obj', '**/*.exe', '**/*.dll', '**/*.so',
    '**/*.class', '**/*.pyc', '**/*.pyo', '**/*.pyd',
    '**/*.min.js', '**/*.min.css',
    'node_modules/**', '.git/**', 'dist/**', 'build/**', 
    'out/**', 'target/**', 'bin/**', '.next/**',
    '.DS_Store', 'Thumbs.db'
  ]
};

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  // Requests per minute
  REQUESTS_PER_MINUTE: 10,
  
  // Maximum concurrent requests
  MAX_CONCURRENT_REQUESTS: 2
};

// Simple in-memory rate limiter store
const rateLimiter = {
  requestTimes: [] as number[],
  activeRequests: 0
};

/**
 * Check if a request is allowed by the rate limiter
 * @returns boolean indicating if the request is allowed
 */
export function checkRateLimit(): boolean {
  const now = Date.now();
  
  // Clean up old entries
  rateLimiter.requestTimes = rateLimiter.requestTimes.filter(
    time => now - time < 60000 // Keep entries from last minute
  );
  
  // Check limits
  if (
    rateLimiter.requestTimes.length >= RATE_LIMITS.REQUESTS_PER_MINUTE ||
    rateLimiter.activeRequests >= RATE_LIMITS.MAX_CONCURRENT_REQUESTS
  ) {
    return false;
  }
  
  // Record this request
  rateLimiter.requestTimes.push(now);
  rateLimiter.activeRequests++;
  
  return true;
}

/**
 * Release a request from the rate limiter
 */
export function releaseRateLimit(): void {
  rateLimiter.activeRequests = Math.max(0, rateLimiter.activeRequests - 1);
}

/**
 * Simple pattern matching for excluding files
 * Not as sophisticated as glob matching but doesn't require extra dependencies
 */
function simplePatternMatch(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')   // Escape dots
    .replace(/\*\*/g, '.*')  // ** matches any characters
    .replace(/\*/g, '[^/]*'); // * matches any characters except path separator
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Check if a path should be excluded based on patterns
 */
function shouldExclude(filePath: string, excludePatterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  return excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      return simplePatternMatch(normalizedPath, pattern);
    }
    return normalizedPath.includes(pattern);
  });
}

/**
 * Format size in bytes to a human-readable string
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Check if a directory is too large to be safely analyzed
 * @param dirPath Path to the directory to check
 * @param options Options for checking
 * @returns Object with validation results
 */
export async function validateDirectorySize(
  dirPath: string,
  options: {
    maxSizeBytes?: number;
    maxFileCount?: number;
    excludePatterns?: string[];
    logger?: any;
  } = {}
): Promise<{ 
  valid: boolean; 
  totalSizeBytes: number; 
  fileCount: number; 
  error?: string;
  largeFiles?: string[];
}> {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  const maxSizeBytes = options.maxSizeBytes || SIZE_LIMITS.MAX_REPO_SIZE_BYTES;
  const maxFileCount = options.maxFileCount || SIZE_LIMITS.MAX_FILE_COUNT;
  const excludePatterns = [
    ...(options.excludePatterns || []),
    ...SIZE_LIMITS.ALWAYS_EXCLUDE_PATTERNS
  ];
  
  logger.debug(`Validating directory size: ${dirPath}`, { maxSizeBytes, maxFileCount });
  
  let totalSizeBytes = 0;
  let fileCount = 0;
  const largeFiles: string[] = [];
  
  try {
    // Function to recursively process directories
    async function processDirectory(currentPath: string, isRoot: boolean = false): Promise<void> {
      // Don't descend into excluded directories
      if (!isRoot && shouldExclude(currentPath, excludePatterns)) {
        logger.debug(`Skipping excluded directory: ${currentPath}`);
        return;
      }
      
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        
        // Skip excluded files/paths
        if (shouldExclude(entryPath, excludePatterns)) {
          logger.debug(`Skipping excluded path: ${entryPath}`);
          continue;
        }
        
        if (entry.isDirectory()) {
          await processDirectory(entryPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(entryPath);
          totalSizeBytes += stats.size;
          fileCount++;
          
          if (stats.size > SIZE_LIMITS.MAX_FILE_SIZE_BYTES) {
            largeFiles.push(entryPath);
          }
          
          // Early termination if limits are exceeded
          if (totalSizeBytes > maxSizeBytes || fileCount > maxFileCount) {
            return;
          }
        }
      }
    }
    
    await processDirectory(dirPath, true);
    
    const valid = totalSizeBytes <= maxSizeBytes && fileCount <= maxFileCount;
    
    logger.info(`Directory validation result: ${valid ? 'Valid' : 'Invalid'}`, {
      totalSizeBytes,
      fileCount,
      largeFiles: largeFiles.length
    });
    
    return {
      valid,
      totalSizeBytes,
      fileCount,
      largeFiles,
      error: !valid
        ? `Repository exceeds size limits: ${fileCount} files, ${formatSize(totalSizeBytes)}`
        : undefined
    };
  } catch (error: any) {
    logger.error(`Error validating directory size: ${error.message}`, error);
    return {
      valid: false,
      totalSizeBytes: 0,
      fileCount: 0,
      error: `Failed to validate directory: ${error.message}`
    };
  }
}

/**
 * Enhanced path validation that includes size checks
 */
export async function validatePathWithSizeCheck(
  inputPath: string,
  options: {
    allowAbsolute?: boolean;
    maxSizeBytes?: number;
    maxFileCount?: number;
    isDirectory?: boolean;
    logger?: any;
  } = {}
): Promise<string> {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  
  // Basic path validation
  const normalizedPath = path.normalize(inputPath);
  
  // Check if path is absolute
  if (path.isAbsolute(normalizedPath) && !(options.allowAbsolute ?? false)) {
    throw new PathAccessError(`Absolute paths are not allowed: ${normalizedPath}`);
  }
  
  // Check if path exists
  try {
    if (!existsSync(normalizedPath)) {
      throw new FileError(`Path does not exist: ${normalizedPath}`);
    }
    
    const stats = await fs.stat(normalizedPath);
    
    // Check if it's a directory when expected
    if (options.isDirectory && !stats.isDirectory()) {
      throw new FileError(`Path is not a directory: ${normalizedPath}`);
    }
    
    // For directories, perform size validation
    if (stats.isDirectory() && (options.maxSizeBytes || options.maxFileCount)) {
      const sizeValidation = await validateDirectorySize(normalizedPath, {
        maxSizeBytes: options.maxSizeBytes,
        maxFileCount: options.maxFileCount,
        logger
      });
      
      if (!sizeValidation.valid) {
        throw new FileError(sizeValidation.error || 'Directory exceeds size limits');
      }
    }
    
    // For files, check individual file size
    if (!stats.isDirectory() && stats.size > SIZE_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new FileError(
        `File exceeds maximum size limit (${formatSize(stats.size)} > ${formatSize(SIZE_LIMITS.MAX_FILE_SIZE_BYTES)}): ${normalizedPath}`
      );
    }
    
    return normalizedPath;
  } catch (error) {
    if (error instanceof FileError || error instanceof PathAccessError) {
      throw error;
    }
    throw new FileError(`Path does not exist or is not accessible: ${normalizedPath}`);
  }
}
