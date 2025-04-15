/**
 * GitHub repository utilities for MCP-Gemini-Claude
 */
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { createGitHubClient } from './github-api.js';
import { enhancedPackageRepository } from './repomix-utils.js';
import { createSecureTempDir, cleanupTempFiles } from './utils.js';
import { SIZE_LIMITS } from './validation.js';
import { 
  GitHubRepositoryOptions,
  GitHubRepoInfo,
  GitHubRepositoryContext,
  PackageResult,
  Logger
} from './types.js';

/**
 * Clone and package a GitHub repository
 */
export async function processGitHubRepository(
  options: GitHubRepositoryOptions
): Promise<{
  repoPath: string;
  tempDir: string | null;
  tempFile: string;
  context: GitHubRepositoryContext;
  packResult: PackageResult;
}> {
  const logger: Logger = options.logger || {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error
  };
  
  logger.info(`Processing GitHub repository: ${options.owner}/${options.repo}`);
  
  // Create GitHub client
  const githubClient = createGitHubClient(logger);
  
  // Generate repository context
  const context = await githubClient.generateRepositoryContext(
    options.owner,
    options.repo,
    options.branch
  );
  
  // Create temporary directory for output
  const { tempDir, tempFile } = createSecureTempDir(`github-${options.owner}-${options.repo}-`);
  
  try {
    // Clone repository
    const repoPath = await githubClient.cloneRepository(
      options.owner,
      options.repo,
      {
        branch: options.branch,
        depth: options.depth || 1
      }
    );
    
    // Package repository
    const packResult = await enhancedPackageRepository(
      repoPath,
      tempFile,
      {
        query: options.query,
        analysisType: options.analysisType,
        maxTokens: options.maxTokens || SIZE_LIMITS.MAX_TOKEN_COUNT,
        smartFiltering: options.smartFiltering !== false
      },
      logger
    );
    
    return {
      repoPath,
      tempDir,
      tempFile,
      context,
      packResult
    };
  } catch (error) {
    // Clean up on error
    await cleanupTempFiles(tempFile, tempDir, logger);
    throw error;
  }
}

/**
 * Parse a GitHub URL or repository string
 */
export function parseGitHubRepository(repoString: string): GitHubRepoInfo {
  const githubClient = createGitHubClient();
  return githubClient.parseGitHubUrl(repoString);
}