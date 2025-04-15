/**
 * Enhanced repository packaging utilities with CLI-prioritized approach
 * This uses the CLI approach as the primary method since it works reliably
 */

import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { callRepomixCli } from './repomix-cli-wrapper.js';
import { simplifiedPackageRepository } from './fallback-packaging.js';
import { isRepomixMcpAvailable, packageRepositoryViaMcp } from './repomix-mcp.js';
import { 
  DEFAULT_IGNORE_PATTERNS,
  prioritizeFiles,
  loadRepomixIgnoreFile
} from './repomix-config.js';
import { RepositoryPackagingError } from './errors.js';
import { SIZE_LIMITS } from './validation.js';
import {
  PackageRepositoryOptions,
  PackageResult,
  Logger
} from './types.js';

/**
 * Interface for repository scanning results
 */
export interface RepoScanResult {
  files: Array<{ path: string; size: number }>;
  directories: string[];
  totalSizeBytes: number;
  fileCount: number;
}

/**
 * Enhanced repository packaging with CLI-first approach
 * This function has been optimized to use the CLI approach as the primary method
 * since the direct library approach is not working with Repomix 0.3.1
 */
export async function enhancedPackageRepository(
  repoDir: string,
  outputFile: string,
  options: PackageRepositoryOptions = {},
  logger?: Logger
): Promise<PackageResult> {
  // Ensure logger is available
  const log: Logger = logger || options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  // Validate required parameters
  if (!repoDir) {
    throw new Error("Repository directory path is undefined");
  }
  
  if (!outputFile) {
    throw new Error("Output file path is undefined");
  }

  log.info("Enhanced repository packaging started", {
    repoDir,
    outputFile,
    analysisType: options.analysisType || 'general'
  });
  
  try {
    // First attempt: Try using Repomix via MCP if available
    if (await isRepomixMcpAvailable()) {
      try {
        log.info("Attempting to package repository via Repomix MCP...");
        const mcpResult = await packageRepositoryViaMcp(repoDir, outputFile, options, log);
        
        log.info(`Successfully packaged repository via MCP: ${mcpResult.totalFiles} files, ${mcpResult.totalTokens} tokens`);
        
        return {
          ...mcpResult,
          usedMcp: true,
          usedFallback: false
        };
      } catch (mcpError) {
        // MCP approach failed, log and continue to other methods
        log.warn(`Repomix MCP packaging failed: ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`);
        log.info("Falling back to CLI wrapper...");
      }
    }
    
    // Look for .repomixignore file
    let ignorePatterns = options.exclude || DEFAULT_IGNORE_PATTERNS;
    try {
      const repomixIgnorePatterns = await loadRepomixIgnoreFile(repoDir, log);
      if (repomixIgnorePatterns && repomixIgnorePatterns.length > 0) {
        // Combine with existing patterns, but prioritize .repomixignore
        ignorePatterns = [...repomixIgnorePatterns, ...DEFAULT_IGNORE_PATTERNS];
        log.info(`Using ${repomixIgnorePatterns.length} patterns from .repomixignore file`);
      }
    } catch (ignoreError) {
      log.warn(`Error loading .repomixignore file: ${ignoreError instanceof Error ? ignoreError.message : String(ignoreError)}`);
    }
    
    // Second attempt: Use CLI wrapper directly (skipping library attempt)
    try {
      log.info("Using Repomix CLI wrapper...");
      
      // Determine include patterns
      let includePatterns: string[] = [];
      
      if (options.include && options.include.length > 0) {
        // Use explicitly provided include patterns
        includePatterns = options.include;
        log.info(`Using ${includePatterns.length} explicitly included files/patterns`);
      } else if (options.componentPath) {
        // If a component path is specified, focus on that directory
        includePatterns = [`${options.componentPath}/**/*`];
        log.info(`Focusing on component path: ${options.componentPath}`);
      } else {
        // Default include patterns
        includePatterns = [
          '**/*.js',
          '**/*.ts',
          '**/*.tsx',
          '**/*.jsx',
          '**/*.json',
          '**/*.md',
          'src/**'
        ];
        log.info(`Using default include patterns`);
      }
      
      // Call CLI wrapper
      const cliResult = await callRepomixCli(repoDir, outputFile, {
        include: includePatterns,
        exclude: ignorePatterns, // Use combined patterns including .repomixignore
        maxTokens: options.maxTokens,
        logger: log
      });
      
      log.info(`Successfully packaged repository with Repomix CLI: ${cliResult.totalFiles} files, ${cliResult.totalTokens} tokens`);
      
      return {
        totalFiles: cliResult.totalFiles,
        totalTokens: cliResult.totalTokens,
        filePaths: includePatterns,
        usedMcp: false,
        usedCliWrapper: true,
        usedFallback: false
      };
    } catch (cliError) {
      // CLI wrapper failed, try fallback solution
      log.warn(`Repomix CLI wrapper failed: ${cliError instanceof Error ? cliError.message : String(cliError)}`);
      log.info("Falling back to simplified packaging solution...");
      
      // Third attempt: Use custom fallback solution
      try {
        const fallbackResult = await simplifiedPackageRepository(
          repoDir,
          outputFile,
          {
            includePatterns: options.include,
            excludePatterns: ignorePatterns, // Use combined patterns including .repomixignore
            maxTokens: options.maxTokens || SIZE_LIMITS.MAX_TOKEN_COUNT,
            componentPath: options.componentPath,
            query: options.query,
            analysisType: options.analysisType,
            logger: log
          }
        );
        
        log.info(`Successfully packaged repository with fallback solution: ${fallbackResult.fileCount} files, ${fallbackResult.estimatedTokens} estimated tokens`);
        
        return {
          totalFiles: fallbackResult.fileCount,
          totalTokens: fallbackResult.estimatedTokens,
          filePaths: options.include || [],
          usedMcp: false,
          usedCliWrapper: false,
          usedFallback: true,
          fallbackError: cliError instanceof Error ? cliError.message : String(cliError)
        };
      } catch (fallbackError) {
        // All methods failed
        log.error(`Fallback packaging also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        throw new RepositoryPackagingError(
          `Repository packaging failed with all available methods. Original error: ${cliError instanceof Error ? cliError.message : String(cliError)}`,
          fallbackError
        );
      }
    }
  } catch (error) {
    log.error(`Failed to package repository: ${error instanceof Error ? error.message : String(error)}`, error);
    throw new RepositoryPackagingError(`Failed to package repository: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}

/**
 * Scan repository to get file and directory information
 * This is a simplified version that only scans the repository and doesn't involve Repomix
 */
export async function scanRepository(
  repoDir: string,
  options: {
    exclude?: string[];
    maxDepth?: number;
    maxFiles?: number;
    logger?: Logger;
  } = {}
): Promise<RepoScanResult> {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const maxDepth = options.maxDepth || 10;
  const maxFiles = options.maxFiles || SIZE_LIMITS.MAX_FILE_COUNT;
  
  // Try to load .repomixignore file
  let ignorePatterns = [
    ...(options.exclude || []),
    ...DEFAULT_IGNORE_PATTERNS,
    ...SIZE_LIMITS.ALWAYS_EXCLUDE_PATTERNS
  ];
  
  try {
    const repomixIgnorePatterns = await loadRepomixIgnoreFile(repoDir, logger);
    if (repomixIgnorePatterns && repomixIgnorePatterns.length > 0) {
      // Add patterns from .repomixignore
      ignorePatterns = [...repomixIgnorePatterns, ...ignorePatterns];
      logger.debug(`Added ${repomixIgnorePatterns.length} patterns from .repomixignore file for scanning`);
    }
  } catch (ignoreError) {
    logger.debug(`Error loading .repomixignore file for scanning: ${ignoreError instanceof Error ? ignoreError.message : String(ignoreError)}`);
  }
  
  logger.debug(`Scanning repository: ${repoDir}`, { maxDepth, maxFiles });
  
  const files: Array<{ path: string; size: number }> = [];
  const directories: string[] = [];
  let totalSizeBytes = 0;
  
  // Helper function to check if a path should be excluded
  function shouldExclude(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    return ignorePatterns.some(pattern => {
      // Simple glob-like pattern matching
      if (pattern.includes('*')) {
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(normalizedPath);
      }
      
      return normalizedPath.includes(pattern);
    });
  }
  
  // Recursive scan function
  async function scan(dir: string, currentDepth: number = 0): Promise<void> {
    if (currentDepth > maxDepth || files.length >= maxFiles) {
      return;
    }
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoDir, fullPath);
        
        // Skip excluded paths
        if (shouldExclude(relativePath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          directories.push(relativePath);
          await scan(fullPath, currentDepth + 1);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            // Skip files larger than the max size
            if (stats.size <= SIZE_LIMITS.MAX_FILE_SIZE_BYTES) {
              files.push({
                path: relativePath,
                size: stats.size
              });
              totalSizeBytes += stats.size;
            }
            
            // Exit early if we hit the max file count
            if (files.length >= maxFiles) {
              return;
            }
          } catch (error) {
            logger.debug(`Error getting stats for file ${fullPath}`, error);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error reading directory ${dir}`, error);
    }
  }
  
  await scan(repoDir);
  
  logger.info(`Repository scan complete - found ${files.length} files`, {
    totalSizeBytes,
    directoryCount: directories.length
  });
  
  return {
    files,
    directories,
    totalSizeBytes,
    fileCount: files.length
  };
}

/**
 * Extract directory structure as formatted text
 */
export function formatDirectoryStructure(
  repoScanResult: RepoScanResult,
  options: {
    maxDepth?: number;
    maxEntries?: number;
  } = {}
): string {
  const maxDepth = options.maxDepth || 5;
  const maxEntries = options.maxEntries || 100;
  
  // Create a tree structure
  const tree: Record<string, any> = {};
  
  // Add directories first
  for (const dir of repoScanResult.directories) {
    const parts = dir.split(/[/\\]/);
    if (parts.length <= maxDepth) {
      let current = tree;
      for (const part of parts) {
        if (!part) continue;
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }
  
  // Add files (leaf nodes)
  for (const file of repoScanResult.files.slice(0, maxEntries)) {
    const parts = file.path.split(/[/\\]/);
    if (parts.length <= maxDepth) {
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) continue;
        current[part] = current[part] || {};
        current = current[part];
      }
      const fileName = parts[parts.length - 1];
      if (fileName) {
        current[fileName] = null; // Leaf node
      }
    }
  }
  
  // Format as text with indentation
  let result = 'Directory Structure:\n';
  
  function formatNode(node: Record<string, any>, name: string, indent: number = 0): void {
    const indentStr = '  '.repeat(indent);
    if (node === null) {
      result += `${indentStr}├── ${name}\n`;
    } else {
      if (indent > 0) {
        result += `${indentStr}├── ${name}/\n`;
      } else {
        result += `${name}/\n`;
      }
      
      const keys = Object.keys(node).sort((a, b) => {
        // Directories first, then files
        const aIsDir = node[a] !== null;
        const bIsDir = node[b] !== null;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
      
      for (const key of keys) {
        formatNode(node[key], key, indent + 1);
      }
    }
  }
  
  for (const rootDir of Object.keys(tree).sort()) {
    formatNode(tree[rootDir], rootDir);
  }
  
  // Add summary
  result += `\nTotal files: ${repoScanResult.fileCount}, Total directories: ${repoScanResult.directories.length}\n`;
  
  return result;
}

/**
 * Extract imports and dependencies from source files
 */
export async function extractImports(
  repoDir: string,
  files: Array<{ path: string; size: number }>,
  logger: Logger
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  
  const importPatterns = [
    // JavaScript/TypeScript
    { regex: /\b(?:import|require)\s*\(?['"]([@\w\d\-_./\\]+)['"]\)?/g, language: ['js', 'ts', 'jsx', 'tsx'] },
    // Python
    { regex: /\b(?:import|from)\s+([\w\d\-_./\\]+)/g, language: ['py'] },
    // Java
    { regex: /\bimport\s+([\w\d\-_.]+\*?);/g, language: ['java'] },
    // Go
    { regex: /\bimport\s+(?:\(\s*)?"([\w\d\-_./\\]+)"/g, language: ['go'] },
    // Rust
    { regex: /\buse\s+([\w\d\-_:]+)/g, language: ['rs'] },
  ];
  
  for (const file of files) {
    try {
      const ext = path.extname(file.path).toLowerCase().slice(1);
      const filePath = path.join(repoDir, file.path);
      
      // Skip large files
      if (file.size > 100000) {
        continue;
      }
      
      // Find applicable patterns based on file extension
      const applicablePatterns = importPatterns.filter(pattern => 
        pattern.language.some(lang => ext.endsWith(lang))
      );
      
      if (applicablePatterns.length === 0) {
        continue;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const imports = new Set<string>();
      
      for (const pattern of applicablePatterns) {
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          if (match[1]) {
            imports.add(match[1]);
          }
        }
      }
      
      if (imports.size > 0) {
        result[file.path] = Array.from(imports);
      }
    } catch (error) {
      logger.debug(`Error extracting imports from ${file.path}`, error);
    }
  }
  
  return result;
}

/**
 * Create a comprehensive prompt for repository analysis
 */
export function extractRepositoryStructure(
  repoDir: string,
  options: {
    maxDepth?: number;
    maxEntries?: number;
    exclude?: string[];
    logger?: Logger;
  } = {}
): Promise<string> {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  return scanRepository(repoDir, {
    exclude: options.exclude,
    maxDepth: options.maxDepth,
    logger
  }).then(result => {
    return formatDirectoryStructure(result, {
      maxDepth: options.maxDepth,
      maxEntries: options.maxEntries
    });
  });
}
