/**
 * Enhanced Repomix configuration for better code analysis
 */
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { SIZE_LIMITS } from './validation.js';
import { Logger, AnalysisType } from './types.js';
import { extractKeywords, calculateRelevanceScore } from './keyword-extraction.js';

/**
 * Priority score levels for file importance
 */
export enum PriorityLevel {
  CRITICAL = 100,     // Project configuration files (highest priority)
  VERY_HIGH = 95,     // Core configuration files
  HIGH = 90,          // Documentation and readme files
  MEDIUM_HIGH = 80,   // Core code directories
  MEDIUM = 75,        // Secondary code directories
  MEDIUM_LOW = 60,    // Test files
  LOW = 50,           // Examples and samples
  DEFAULT = 40        // Everything else
}

/**
 * Default patterns to ignore in repositories
 */
export const DEFAULT_IGNORE_PATTERNS = [
  // Dependencies and package management
  '**/node_modules/**',
  '**/.yarn/**',
  '**/vendor/**',
  '**/bower_components/**',
  '**/packages/**',
  
  // Build artifacts and output
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/target/**',
  '**/bin/**',
  '**/obj/**',
  '**/compile/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  
  // Version control
  '**/.git/**',
  '**/.hg/**',
  '**/.svn/**',
  '**/.terraform/**',
  
  // Test coverage and reports
  '**/coverage/**',
  '**/reports/**',
  
  // Cache files
  '**/.cache/**',
  '**/tmp/**',
  '**/temp/**',
  '**/.tmp/**',
  '**/.temp/**',
  
  // Lock files and local environment
  '**/*.lock',
  '**/*.lockb',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/*.env',
  '**/.env*',
  '**/*.env*',
  
  // Build metadata
  '**/*.tsbuildinfo',
  '**/*.pbxproj',
  '**/*.xcworkspace/**',
  
  // Editor and IDE files
  '**/.idea/**',
  '**/.vscode/**',
  '**/.vs/**',
  '**/.editorconfig',
  
  // System files
  '**/.DS_Store',
  '**/Thumbs.db',
  
  // Minified files
  '**/*.min.js',
  '**/*.min.css',
  
  // Binary and media files (already in SIZE_LIMITS.ALWAYS_EXCLUDE_PATTERNS)
];

/**
 * Default files and patterns to include
 */
export const DEFAULT_INCLUDE_PATTERNS = [
  '**/*', 
  '.cursor/rules/*', 
  '.cursorrules'
];

/**
 * Default Repomix output options
 */
export const DEFAULT_OUTPUT_OPTIONS = {
  style: "xml", // Use XML style for better structured output
  fileSummary: true, // Include file summaries
  directoryStructure: true, // Include directory structure
  removeComments: false, // Preserve comments for better understanding
  removeEmptyLines: true, // Remove empty lines to save tokens
  showLineNumbers: true, // Show line numbers for better referencing
  includeEmptyDirectories: false, // Skip empty directories
  parsableStyle: false, // Use human-readable style
  topFilesLength: 20, // Show top 20 files in summary
  git: { // Git-specific options
    sortByChanges: true,
    sortByChangesMaxCommits: 10,
  },
};

/**
 * Load ignore patterns from .repomixignore file if it exists
 */
export async function loadRepomixIgnoreFile(
  repoDir: string,
  logger: Logger
): Promise<string[] | null> {
  const repomixIgnorePath = path.join(repoDir, '.repomixignore');
  
  if (existsSync(repomixIgnorePath)) {
    try {
      const content = await fs.readFile(repomixIgnorePath, 'utf-8');
      const lines = content.split('\n');
      
      // Filter out comments and empty lines, and normalize patterns
      const patterns = lines
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(pattern => {
          // Convert directory/* to directory/**
          if (pattern.endsWith('/*')) {
            return pattern.replace(/\*$/, '**');
          }
          // Ensure directories end with /**
          if (pattern.endsWith('/')) {
            return `${pattern}**`;
          }
          return pattern;
        });
      
      logger.info(`Loaded ${patterns.length} ignore patterns from .repomixignore`);
      return patterns;
    } catch (error) {
      logger.warn(`Failed to parse .repomixignore file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return null;
}

/**
 * File prioritization scores for different file types and paths
 */
const PRIORITY_SCORES: Record<string, number> = {
  // Project configuration - highest priority
  'package.json': PriorityLevel.CRITICAL,
  'tsconfig.json': PriorityLevel.VERY_HIGH,
  'webpack.config.js': PriorityLevel.VERY_HIGH,
  'rollup.config.js': PriorityLevel.VERY_HIGH,
  'vite.config.js': PriorityLevel.VERY_HIGH,
  'jest.config.js': PriorityLevel.VERY_HIGH,
  'babel.config.js': PriorityLevel.VERY_HIGH,
  '.eslintrc': PriorityLevel.HIGH,
  
  // Documentation - high priority
  'README.md': PriorityLevel.HIGH,
  'CONTRIBUTING.md': PriorityLevel.HIGH,
  'ARCHITECTURE.md': PriorityLevel.HIGH,
  'API.md': PriorityLevel.HIGH,
  
  // Core code directories - high priority
  'src/': PriorityLevel.MEDIUM_HIGH,
  'app/': PriorityLevel.MEDIUM_HIGH,
  'lib/': PriorityLevel.MEDIUM_HIGH,
  'core/': PriorityLevel.MEDIUM_HIGH,
  'api/': PriorityLevel.MEDIUM,
  'services/': PriorityLevel.MEDIUM,
  'models/': PriorityLevel.MEDIUM,
  'controllers/': PriorityLevel.MEDIUM,
  
  // Test files - medium priority
  'tests/': PriorityLevel.MEDIUM_LOW,
  'test/': PriorityLevel.MEDIUM_LOW,
  '__tests__/': PriorityLevel.MEDIUM_LOW,
  '.spec.': PriorityLevel.MEDIUM_LOW,
  '.test.': PriorityLevel.MEDIUM_LOW,
  
  // Examples - lower priority
  'examples/': PriorityLevel.LOW,
  'example/': PriorityLevel.LOW,
  'samples/': PriorityLevel.LOW,
  'sample/': PriorityLevel.LOW,
  
  // Default for everything else
  'default': PriorityLevel.DEFAULT
};

/**
 * Calculate importance score for a file path
 * Higher score = more important
 */
export function calculateFileImportance(filePath: string): number {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check for exact matches (like package.json)
  const fileName = path.basename(normalizedPath);
  if (PRIORITY_SCORES[fileName]) {
    return PRIORITY_SCORES[fileName];
  }
  
  // Check for path prefixes
  for (const [pathSegment, score] of Object.entries(PRIORITY_SCORES)) {
    if (pathSegment.endsWith('/') && normalizedPath.includes(pathSegment)) {
      return score;
    }
    
    // Check for substrings like ".test." in "component.test.js"
    if (!pathSegment.endsWith('/') && !pathSegment.includes('.') && normalizedPath.includes(pathSegment)) {
      return score;
    }
  }
  
  // Check for file extensions
  const ext = path.extname(normalizedPath).toLowerCase();
  
  // Code files get priority over assets
  const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.php', '.rb'];
  if (codeExtensions.includes(ext)) {
    return PriorityLevel.DEFAULT + 10;
  }
  
  // Default score
  return PriorityLevel.DEFAULT;
}

/**
 * Function to prioritize files based on relevance to a query
 */
export function prioritizeFiles(
  files: Array<{ path: string; size: number }>,
  query: string = '',
  options: {
    maxTokens?: number;
    maxFiles?: number;
    analysisType?: AnalysisType;
    logger?: Logger;
  } = {}
): string[] {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  // Fallback to default max tokens if not specified
  const maxTokens = options.maxTokens || SIZE_LIMITS.MAX_TOKEN_COUNT;
  // Set a maximum character count (approximation for tokens)
  const maxChars = maxTokens * 4; // Rough estimate of 4 chars per token
  let totalChars = 0;
  
  // Use enhanced keyword extraction
  const keywords = extractKeywords(query, {
    minWordLength: 3,
    maxKeywords: 15,
    filterCommonTerms: true,
    logger
  });
  
  logger.info(`Enhanced keyword extraction for file prioritization found ${keywords.length} keywords: ${keywords.join(', ')}`);
  
  // Score each file based on importance and relevance to query
  const scoredFiles = files.map(file => {
    const normalizedPath = file.path.replace(/\\/g, '/');
    let score = calculateFileImportance(normalizedPath);
    
    // Add keyword relevance score if query and keywords exist
    if (query && keywords.length > 0) {
      // Use lightweight version of calculateRelevanceScore since we don't have file content yet
      let keywordScore = 0;
      
      // Score path matches (higher weight as path is more significant)
      keywords.forEach(keyword => {
        // Exact path component match gets highest score
        const pathComponents = normalizedPath.split('/');
        const isExactComponent = pathComponents.some(component => 
          component === keyword || component.startsWith(keyword + '.'));
          
        if (isExactComponent) {
          keywordScore += 30; // Higher weight for direct component match
        } else if (normalizedPath.toLowerCase().includes(keyword.toLowerCase())) {
          keywordScore += 15; // Basic path match
        }
      });
      
      score += keywordScore;
    }
    
    // Adjust score based on analysis type
    if (options.analysisType) {
      const type = options.analysisType.toLowerCase();
      
      if (type === 'security' && 
          (normalizedPath.includes('security') || 
           normalizedPath.includes('auth') || 
           normalizedPath.includes('login') ||
           normalizedPath.includes('permission') ||
           normalizedPath.includes('user') ||
           normalizedPath.includes('password') ||
           normalizedPath.includes('crypt'))) {
        score += 25;
      } else if (type === 'performance' && 
          (normalizedPath.includes('perf') || 
           normalizedPath.includes('benchmark') || 
           normalizedPath.includes('optimi') || 
           normalizedPath.includes('speed') ||
           normalizedPath.includes('cache') ||
           normalizedPath.includes('profil'))) {
        score += 25;
      } else if (type === 'architecture' && 
          (normalizedPath.includes('architect') || 
           normalizedPath.includes('structure') || 
           normalizedPath.includes('design') ||
           normalizedPath.includes('service') ||
           normalizedPath.includes('component') ||
           normalizedPath.includes('factory') ||
           normalizedPath.includes('provider'))) {
        score += 25;
      } else if (type === 'documentation' && 
          (normalizedPath.endsWith('.md') || 
           normalizedPath.includes('doc/') || 
           normalizedPath.includes('docs/') ||
           normalizedPath.includes('wiki/') ||
           normalizedPath.includes('guide'))) {
        score += 25;
      } else if (type === 'testing' && 
          (normalizedPath.includes('test') || 
           normalizedPath.includes('spec') || 
           normalizedPath.includes('mock') ||
           normalizedPath.includes('stub') ||
           normalizedPath.includes('fixture'))) {
        score += 25;
      } else if (type === 'bug' && 
          (normalizedPath.includes('fix') || 
           normalizedPath.includes('issue') || 
           normalizedPath.includes('bug') ||
           normalizedPath.includes('patch') ||
           normalizedPath.includes('error'))) {
        score += 25;
      }
    }
    
    // Size-based adjustments
    if (file.size < 5000) {
      score += 5; // Small files get a bonus to include more files
    } else if (file.size > 100000) {
      score -= 15; // Penalize very large files more aggressively
    } else if (file.size > 50000) {
      score -= 8; // Moderate penalty for large files
    }
    
    // Bonus for main/index files as they're often entry points
    if (normalizedPath.endsWith('/index.js') || 
        normalizedPath.endsWith('/index.ts') || 
        normalizedPath.endsWith('/main.js') || 
        normalizedPath.endsWith('/main.ts')) {
      score += 10;
    }
    
    return {
      ...file,
      score
    };
  });
  
  // Sort by score (descending)
  scoredFiles.sort((a, b) => b.score - a.score);
  
  // Log the top results for debugging
  logger.debug(`Top 10 files by prioritization score:`);
  scoredFiles.slice(0, 10).forEach(file => {
    logger.debug(`- ${file.path} (score: ${file.score.toFixed(2)})`);
  });
  
  // Track the total characters as we select files
  const selectedFiles = [];
  let currentCharCount = 0;
  const maxFilesToConsider = options.maxFiles || 1000;
  
  // Always include critical files (README, package.json, etc.) if present
  const criticalFiles = scoredFiles.filter(file => 
    file.score >= PriorityLevel.HIGH && 
    (currentCharCount + file.size) <= maxChars
  );
  
  for (const file of criticalFiles) {
    selectedFiles.push(file);
    currentCharCount += file.size;
    logger.debug(`Including critical file: ${file.path} (score: ${file.score.toFixed(2)})`);
  }
  
  // Add remaining files while staying under token limit
  for (const file of scoredFiles) {
    // Skip already included critical files
    if (criticalFiles.includes(file)) {
      continue;
    }
    
    if (selectedFiles.length >= maxFilesToConsider) {
      break;
    }
    
    // Rough estimate that file size in bytes ~= character count
    if (currentCharCount + file.size > maxChars) {
      // Skip this file if it would put us over the limit
      continue;
    }
    
    selectedFiles.push(file);
    currentCharCount += file.size;
  }
  
  logger.info(`Selected ${selectedFiles.length} files (approx. ${Math.floor(currentCharCount/1000)}K chars) out of ${files.length} total files`);
  
  // Return paths of selected files
  return selectedFiles.map(file => file.path);
}

/**
 * Create an optimized configuration for Repomix
 */
export function createEnhancedRepomixConfig(
  tempFile: string,
  options: {
    include?: string[];
    exclude?: string[];
    query?: string;
    analysisType?: AnalysisType;
    maxTokens?: number;
    allowReadOutsideBaseDirs?: boolean;
    logger?: Logger;
  } = {}
): any {
  const logger: Logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  logger.debug("Creating enhanced Repomix configuration", {
    analysisType: options.analysisType,
    hasQuery: !!options.query,
    includePatterns: options.include?.length || 'default'
  });
  
  return {
    output: {
      filePath: tempFile,
      ...DEFAULT_OUTPUT_OPTIONS
    },
    include: options.include || DEFAULT_INCLUDE_PATTERNS,
    ignore: {
      patterns: options.exclude || DEFAULT_IGNORE_PATTERNS
    },
    security: {
      allowReadOutsideBaseDirs: options.allowReadOutsideBaseDirs ?? false
    },
    tokenCount: {
      encoding: 'o200k_base',
      maxTokens: options.maxTokens || SIZE_LIMITS.MAX_TOKEN_COUNT
    }
  };
}

/**
 * Load configuration from .repomixrc.json if it exists
 */
export async function loadLocalRepomixConfig(
  repoDir: string,
  logger: Logger
): Promise<any | null> {
  const configPaths = [
    path.join(repoDir, '.repomixrc'),
    path.join(repoDir, '.repomixrc.json'),
    path.join(repoDir, '.repomixrc.js'),
    path.join(repoDir, '.config', 'repomixrc'),
    path.join(repoDir, '.config', 'repomixrc.json')
  ];
  
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        logger.info(`Loaded local Repomix configuration from ${configPath}`);
        return config;
      } catch (error) {
        logger.warn(`Failed to parse Repomix configuration at ${configPath}`, error);
      }
    }
  }
  
  return null;
}

/**
 * Merge configuration with overrides
 */
export function mergeConfigurations(
  baseConfig: any,
  overrides: any
): any {
  return {
    ...baseConfig,
    ...overrides,
    output: {
      ...(baseConfig.output || {}),
      ...(overrides.output || {})
    },
    ignore: {
      ...(baseConfig.ignore || {}),
      ...(overrides.ignore || {})
    },
    security: {
      ...(baseConfig.security || {}),
      ...(overrides.security || {})
    },
    tokenCount: {
      ...(baseConfig.tokenCount || {}),
      ...(overrides.tokenCount || {})
    }
  };
}