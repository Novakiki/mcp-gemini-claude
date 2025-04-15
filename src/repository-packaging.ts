/**
 * Repository Packaging Module
 * 
 * This module is responsible for handling the packaging of a repository using Repomix or fallback methods.
 * It provides a clear separation between the packaging functionality and the actual analysis.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { 
  enhancedPackageRepository,
  extractRepositoryStructure
} from './repomix-utils.js';
import { Logger } from './types.js';

/**
 * Handles the packaging of a repository using Repomix or fallback methods
 */
export async function packageRepository(
  repoDir: string,
  options: {
    outputFile?: string;
    query?: string;
    analysisType?: string;
    componentPath?: string;
    include?: string[];
    exclude?: string[]; 
    maxTokens?: number;
    logger?: Logger;
  } = {}
): Promise<{
  packagePath: string;
  fileCount: number;
  tokenCount: number;
  structure: string;
  packagingMethod: 'MCP' | 'CLI' | 'Fallback';
}> {
  const logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  logger.info(`Packaging repository: ${repoDir}`, {
    component: options.componentPath || 'None',
    analysisType: options.analysisType || 'general'
  });
  
  // Create a default output file if not provided
  const outputFile = options.outputFile || path.join(repoDir, `.repomix-output-${Date.now()}.txt`);
  
  // Use the CLI-prioritized approach for packaging
  const packageResult = await enhancedPackageRepository(repoDir, outputFile, {
    query: options.query,
    analysisType: options.analysisType,
    componentPath: options.componentPath,
    include: options.include,
    exclude: options.exclude,
    maxTokens: options.maxTokens,
    logger
  }, logger);
  
  // Generate structure visualization if not already included
  const structure = await extractRepositoryStructure(repoDir, { 
    logger,
    maxDepth: options.componentPath ? 3 : 5,  // Use smaller depth for component analysis
    maxEntries: options.componentPath ? 100 : 200
  });
  
  logger.info(`Repository packaged successfully with ${packageResult.totalFiles} files`);
  
  // Determine which method was used
  const packagingMethod = packageResult.usedMcp 
    ? 'MCP' 
    : packageResult.usedCliWrapper 
      ? 'CLI' 
      : 'Fallback';
  
  return {
    packagePath: outputFile,
    fileCount: packageResult.totalFiles,
    tokenCount: packageResult.totalTokens,
    structure,
    packagingMethod
  };
}
