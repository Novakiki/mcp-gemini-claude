import { pack } from 'repomix';
import { RepositoryPackagingError } from './errors.js';
import { retryWithBackoff } from './utils.js';
import path from 'path';

/**
 * Safer configuration creator for Repomix
 */
export function createRepomixConfig(tempFile: string, options?: {
  include?: string[],
  exclude?: string[],
  allowReadOutsideBaseDirs?: boolean
}) {
  return {
    output: {
      filePath: tempFile,
      style: "plain",
      parsableStyle: false,
      fileSummary: true,
      directoryStructure: true,
      removeComments: false,
      removeEmptyLines: true,
      showLineNumbers: true
    },
    include: options?.include || ["**/*"],
    ignore: {
      patterns: options?.exclude || [
        "node_modules/**",
        ".git/**",
        "dist/**",
        "build/**",
        "**/node_modules/**"
      ]
    },
    security: {
      allowReadOutsideBaseDirs: options?.allowReadOutsideBaseDirs ?? false
    },
    tokenCount: {
      encoding: 'o200k_base'
    }
  };
}

/**
 * Create a prompt for repository analysis
 */
export function createPromptForRepoAnalysis(
  query: string,
  repoContext: string,
  reasoningEffort?: "low" | "medium" | "high"
): string {
  return `
You are an expert software developer analyzing a code repository.
Please help the user with the following query about the codebase.

USER QUERY: ${query}

REPOSITORY CONTENT:
${repoContext}

${reasoningEffort === 'high' 
  ? 'Please provide a very thorough and detailed analysis.'
  : reasoningEffort === 'low' 
  ? 'Please provide a concise analysis.' 
  : 'Please provide a balanced and thorough analysis that addresses the query.'
}

Important:
1. Focus specifically on answering the user's query.
2. Reference specific files and code snippets when relevant.
3. Provide actionable insights and explain the reasoning behind your analysis.
4. If code examples are needed, include them with proper context.
`;
}

/**
 * Safely package a repository with retry mechanism
 */
export async function packageRepository(
  repoDir: string, 
  tempFile: string,
  logger: any,
  options?: {
    include?: string[],
    exclude?: string[]
  }
) {
  try {
    const repomixConfig = createRepomixConfig(tempFile, {
      include: options?.include,
      exclude: options?.exclude,
      allowReadOutsideBaseDirs: false
    });
    
    // Wrap pack operation in retry mechanism
    const packResult = await retryWithBackoff(
      () => pack([repoDir], repomixConfig as any),
      3,
      1000,
      (error: unknown) => {
        if (error instanceof Error) {
          logger.warn(`Retrying package operation due to error: ${error.message}`);
        } else {
          logger.warn(`Retrying package operation due to unknown error: ${String(error)}`);
        }
        return true;
      },
      logger
    );
    
    logger.info(`Packed repository: ${packResult.totalFiles} files. Approximate size: ${packResult.totalTokens} tokens.`);
    
    return packResult;
  } catch (error) {
    logger.error(`Failed to package repository after multiple retries: ${error instanceof Error ? error.message : String(error)}`, error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new RepositoryPackagingError(`Failed to package repository: ${errorMessage}`, error);
  }
}
