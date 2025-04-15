/**
 * Fallback repository packaging solution when Repomix fails
 * This provides a simplified alternative to the Repomix package
 */
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
// Removed minimatch dependency and implemented a simple matcher instead
import { Logger } from './types.js';
import { SIZE_LIMITS } from './validation.js';
import { RepositoryPackagingError } from './errors.js';

/**
 * Simple pattern matching function to replace minimatch
 * Supports basic glob patterns with * and **
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')     // Escape dots
    .replace(/\*\*/g, '.*')    // ** matches anything
    .replace(/\*/g, '[^/]*');  // * matches anything except path separator
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Options for the simplified package repository function
 */
export interface SimplifiedPackageOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxTokens?: number;
  maxFileSize?: number;
  componentPath?: string;
  query?: string;
  analysisType?: string;
  logger?: Logger;
  extractImports?: boolean;
  allowReadOutsideBaseDirs?: boolean;
}

/**
 * Result of the simplified package repository operation
 */
export interface SimplifiedPackageResult {
  text: string;
  fileCount: number;
  totalSize: number;
  estimatedTokens: number;
}

/**
 * File information structure
 */
interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  relevance?: number;
}

/**
 * Simplified repository packaging function that works as a fallback when Repomix fails
 * 
 * @param repoDir Repository directory path
 * @param outputFile Output file path
 * @param options Packaging options
 * @returns Promise with packaging results
 */
export async function simplifiedPackageRepository(
  repoDir: string,
  outputFile: string,
  options: SimplifiedPackageOptions = {}
): Promise<SimplifiedPackageResult> {
  const {
    includePatterns = ['**/*.{js,ts,jsx,tsx,py,java,rb,go,rs,c,cpp,h,hpp,md,json,yml,yaml}'],
    excludePatterns = [
      '**/node_modules/**', 
      '**/dist/**', 
      '**/.git/**', 
      '**/build/**',
      '**/*.min.js',
      '**/*.lock',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
      '**/.DS_Store'
    ],
    maxTokens = 100000,
    maxFileSize = SIZE_LIMITS.MAX_FILE_SIZE_BYTES,
    componentPath,
    logger
  } = options;

  // Create a logger if not provided
  const log: Logger = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

  log.info(`Fallback packaging of repository: ${repoDir}`, {
    componentPath: componentPath || 'None (repository overview)',
    maxTokens,
    maxFileSize: Math.round(maxFileSize / 1024) + 'KB'
  });

  try {
    // Determine base directory for component-level analysis
    const baseDir = componentPath ? path.join(repoDir, componentPath) : repoDir;
    
    if (!existsSync(baseDir)) {
      throw new RepositoryPackagingError(`Directory does not exist: ${baseDir}`);
    }

    // Find and collect all files matching the patterns
    log.info(`Scanning directory: ${baseDir}`);
    const files = await scanDirectory(baseDir, repoDir, includePatterns, excludePatterns, maxFileSize, log);
    log.info(`Found ${files.length} files for processing`);

    // Assign relevance scores based on filepath and query if provided
    if (options.query) {
      assignRelevanceScores(files, options.query, options.analysisType);
      files.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
      log.info(`Sorted files by relevance to query: "${options.query.substring(0, 30)}..."`);
    } else {
      // Default sort by path for consistent output
      files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    }

    // Generate the repository content
    const { text, fileCount, totalSize, tokenCount } = await packageFiles(
      files, 
      repoDir, 
      maxTokens,
      componentPath,
      log
    );

    // Write output to file
    await fs.writeFile(outputFile, text, 'utf-8');
    log.info(`Wrote ${fileCount} files (${Math.round(tokenCount / 1000)}K tokens) to ${outputFile}`);

    // Return result
    return {
      text,
      fileCount,
      totalSize,
      estimatedTokens: tokenCount
    };
  } catch (error) {
    log.error(`Error in fallback packaging: ${error instanceof Error ? error.message : String(error)}`);
    throw new RepositoryPackagingError(
      `Fallback packaging failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Scan a directory recursively to find files matching the patterns
 */
async function scanDirectory(
  dirPath: string,
  rootDir: string,
  includePatterns: string[],
  excludePatterns: string[],
  maxFileSize: number,
  logger: Logger
): Promise<FileInfo[]> {
  const result: FileInfo[] = [];
  
  // Queue for breadth-first directory traversal
  const queue: string[] = [dirPath];
  
  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);
        
        // Skip excluded paths
        if (excludePatterns.some(pattern => matchesPattern(relativePath, pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (entry.isFile()) {
          // Check if the file matches any include pattern
          const shouldInclude = includePatterns.some(pattern => matchesPattern(relativePath, pattern));
          
          if (shouldInclude) {
            try {
              const stats = await fs.stat(fullPath);
              
              // Skip files larger than the limit
              if (stats.size <= maxFileSize) {
                result.push({
                  path: fullPath,
                  relativePath,
                  size: stats.size
                });
                logger.debug(`Added file: ${relativePath} (${Math.round(stats.size / 1024)}KB)`);
              } else {
                logger.debug(`Skipping large file: ${relativePath} (${Math.round(stats.size / 1024)}KB)`);
              }
            } catch (error) {
              logger.debug(`Error getting stats for file ${fullPath}`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`Error reading directory ${currentDir}`, error);
    }
  }
  
  return result;
}

/**
 * Assign relevance scores to files based on query
 */
function assignRelevanceScores(files: FileInfo[], query: string, analysisType?: string): void {
  // Extract keywords from query
  const keywords = extractKeywords(query);
  
  // Special paths that should always be included
  const criticalPaths = [
    /package\.json$/i,
    /readme\.md$/i,
    /\.env\.example$/i,
    /tsconfig\.json$/i,
    /manifest\.json$/i,
    /config\.js$/i,
    /config\.ts$/i,
    /index\.js$/i,
    /index\.ts$/i,
    /main\.js$/i,
    /main\.ts$/i
  ];
  
  // Adjust scores based on analysis type
  const typePatterns: Record<string, RegExp[]> = {
    security: [
      /auth/i, /login/i, /password/i, /crypt/i, /secure/i,
      /token/i, /permission/i, /access/i, /validate/i
    ],
    performance: [
      /performance/i, /optimize/i, /cache/i, /speed/i, /benchmark/i,
      /profile/i, /time/i, /memory/i, /cpu/i, /efficient/i
    ],
    architecture: [
      /component/i, /service/i, /model/i, /controller/i, /router/i,
      /manager/i, /factory/i, /provider/i, /config/i, /setup/i
    ],
    documentation: [
      /doc/i, /readme/i, /manual/i, /guide/i, /tutorial/i,
      /example/i, /sample/i, /demo/i, /usage/i, /api/i
    ],
    testing: [
      /test/i, /spec/i, /mock/i, /stub/i, /fixture/i,
      /assert/i, /expect/i, /should/i, /case/i, /scenario/i
    ]
  };
  
  // Calculate relevance for each file
  for (const file of files) {
    let score = 0;
    const lowerPath = file.relativePath.toLowerCase();
    
    // Critical files get a baseline score
    if (criticalPaths.some(pattern => pattern.test(lowerPath))) {
      score += 50;
    }
    
    // Boost for paths containing keywords
    for (const keyword of keywords) {
      if (lowerPath.includes(keyword.toLowerCase())) {
        score += 30;
      }
    }
    
    // Analysis type specific boosts
    if (analysisType && typePatterns[analysisType]) {
      if (typePatterns[analysisType].some(pattern => pattern.test(lowerPath))) {
        score += 40;
      }
    }
    
    // File type boosts - source code is generally more important
    if (/\.(js|ts|jsx|tsx|py|java|rb|go|rs|c|cpp)$/i.test(lowerPath)) {
      score += 20;
    } else if (/\.(json|yaml|yml|md)$/i.test(lowerPath)) {
      score += 15;
    }
    
    // Penalty for deeply nested files
    const nestingLevel = file.relativePath.split('/').length;
    score -= nestingLevel * 2;
    
    // Penalty for very large files, inversely proportional to file size
    // Smaller files are often more essential (config, constants, etc.)
    score -= Math.min(30, Math.floor(file.size / 10000));
    
    file.relevance = Math.max(0, score);
  }
}

/**
 * Extract relevant keywords from a query string
 */
function extractKeywords(query: string): string[] {
  // Common words to exclude
  const stopWords = [
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'on', 'at', 'to', 'from', 
    'by', 'about', 'in', 'of', 'with', 'this', 'that', 'these', 'those', 'is', 
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 
    'does', 'did', 'can', 'could', 'would', 'should', 'will', 'shall', 'may', 
    'might', 'must', 'how', 'what', 'when', 'where', 'who', 'which', 'why',
    'code', 'file', 'files', 'repository', 'repo', 'project', 'codebase',
    'implementation', 'function', 'class', 'method', 'show', 'find', 'get',
    'explain', 'analysis', 'analyze', 'system', 'please', 'help', 'need'
  ];
  
  // Extract words from query
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => !stopWords.includes(word) && word.length > 2);
  
  // Add multi-word terms (phrases)
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]}${words[i+1]}`);
  }
  
  return [...new Set([...words, ...phrases])];
}

/**
 * Package files into a single text file
 */
async function packageFiles(
  files: FileInfo[],
  rootDir: string,
  maxTokens: number,
  componentPath?: string,
  logger?: Logger
): Promise<{ text: string; fileCount: number; totalSize: number; tokenCount: number }> {
  const log: Logger = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  // Estimate tokens per character (rough approximation)
  const CHARS_PER_TOKEN = 4;
  
  // Start with the header
  let outputText = `# Repository Content\n\n`;
  outputText += `This file is a merged representation of the repository content, structured for AI analysis.\n\n`;
  
  if (componentPath) {
    outputText += `## Component: ${componentPath}\n\n`;
  }
  
  // Add directory structure
  outputText += generateDirectoryStructure(files, rootDir);
  
  // Track token usage
  let totalTokens = Math.ceil(outputText.length / CHARS_PER_TOKEN);
  let includedFiles = 0;
  let totalSize = 0;
  
  // Sort files by relevance (if available) or path
  const sortedFiles = [...files].sort((a, b) => {
    if (a.relevance !== undefined && b.relevance !== undefined) {
      return b.relevance - a.relevance;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
  
  // Process files within token limit
  for (const file of sortedFiles) {
    try {
      // Estimate tokens for this file
      const estimatedFileTokens = Math.ceil(file.size / CHARS_PER_TOKEN) + 100; // Add buffer for formatting
      
      // Check if adding this file would exceed token limit
      if (totalTokens + estimatedFileTokens > maxTokens) {
        log.info(`Stopping file inclusion at ${includedFiles} files to stay within token limit of ${maxTokens}`);
        break;
      }
      
      // Read file content
      const content = await fs.readFile(file.path, 'utf-8');
      
      // Add file to output with XML-like tags (similar to Repomix format)
      const fileOutput = `\n<file path="${file.relativePath}">\n${content}\n</file>\n`;
      
      outputText += fileOutput;
      totalTokens += Math.ceil(fileOutput.length / CHARS_PER_TOKEN);
      includedFiles++;
      totalSize += file.size;
    } catch (error) {
      log.debug(`Error reading file ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Add summary
  const summary = `\n# Summary\n\nIncluded ${includedFiles} files out of ${files.length} total files. Estimated token count: ${totalTokens}.\n`;
  outputText += summary;
  totalTokens += Math.ceil(summary.length / CHARS_PER_TOKEN);
  
  return {
    text: outputText,
    fileCount: includedFiles,
    totalSize,
    tokenCount: totalTokens
  };
}

/**
 * Generate a directory structure visualization
 */
function generateDirectoryStructure(files: FileInfo[], rootDir: string): string {
  // Create a tree structure
  const tree: Record<string, any> = {};
  
  // Add all directories and files to the tree
  for (const file of files) {
    const parts = file.relativePath.split(/[\/\\]/);
    let current = tree;
    
    // Build directory structure
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      
      current[part] = current[part] || {};
      current = current[part];
    }
    
    // Add the file (leaf node)
    const fileName = parts[parts.length - 1];
    if (fileName) {
      current[fileName] = null;
    }
  }
  
  // Build text output
  let result = '## Directory Structure\n\n```\n';
  
  function formatNode(node: Record<string, any>, name: string, indent: number = 0): void {
    const indentStr = '  '.repeat(indent);
    
    if (node === null) {
      // File
      result += `${indentStr}├── ${name}\n`;
    } else {
      // Directory
      if (indent > 0) {
        result += `${indentStr}├── ${name}/\n`;
      } else {
        result += `${name}/\n`;
      }
      
      // Sort entries: directories first, then files
      const keys = Object.keys(node).sort((a, b) => {
        const aIsDir = node[a] !== null;
        const bIsDir = node[b] !== null;
        
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
      
      // Process children
      for (const key of keys) {
        formatNode(node[key], key, indent + 1);
      }
    }
  }
  
  // Process root directories
  for (const rootDir of Object.keys(tree).sort()) {
    formatNode(tree[rootDir], rootDir);
  }
  
  result += '```\n\n';
  return result;
}