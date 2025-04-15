/**
 * Direct CLI wrapper for Repomix
 * Updated to work with the latest Repomix CLI syntax
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './types.js';
import { RepositoryPackagingError } from './errors.js';

/**
 * Call Repomix CLI directly
 * This is a workaround for issues with the Repomix library
 */
export async function callRepomixCli(
  repoDir: string,
  outputFile: string,
  options: {
    include?: string[];
    exclude?: string[];
    maxTokens?: number;
    logger?: Logger;
  } = {}
): Promise<{ totalFiles: number; totalTokens: number }> {
  const logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  logger.info(`Calling Repomix CLI for repository: ${repoDir}`);
  
  try {
    // Check for .repomixignore file and pass it directly to CLI
    const repomixIgnorePath = path.join(repoDir, '.repomixignore');
    const hasRepomixIgnore = fs.existsSync(repomixIgnorePath);
    
    // First attempt: Use the repomix command with .repomixignore if it exists
    let command = `npx -y repomix ${repoDir} -o "${outputFile}"`;
    
    if (hasRepomixIgnore) {
      command += ` --ignorefile="${repomixIgnorePath}"`;
      logger.info(`Using .repomixignore file: ${repomixIgnorePath}`);
    }
    
    try {
      logger.debug(`Executing command: ${command}`);
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024 // 10 MB
      });
      
      if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        const fileSize = stats.size;
        logger.info(`Simplified command succeeded: created ${outputFile} (${fileSize} bytes)`);
        
        // Approximate the token count based on file size (rough estimate: 1 token ~ 4 characters)
        const totalTokens = Math.floor(fileSize / 4);
        
        // Count files in the output
        const fileContent = fs.readFileSync(outputFile, 'utf-8');
        const fileMatches = fileContent.match(/<file\s/g);
        const totalFiles = fileMatches ? fileMatches.length : 10; // Default to 10 if can't determine
        
        return { totalFiles, totalTokens };
      } else {
        throw new Error(`Output file was not created: ${outputFile}`);
      }
    } catch (simpleError) {
      logger.warn(`Simplified command failed: ${simpleError instanceof Error ? simpleError.message : String(simpleError)}`);
      
      // Second attempt: Try with more options but using the correct CLI syntax
      try {
        // Create command arguments with correct syntax
        const args: string[] = [];
        
        // Add output file - use -o for output file
        args.push(`-o "${outputFile}"`);
        
        // Add include patterns
        if (options.include && options.include.length > 0) {
          // For the current version of Repomix, we use --include
          args.push(`--include="${options.include.join(',')}"`);
        }
        
        // Add exclude patterns
        if (options.exclude && options.exclude.length > 0) {
          // For the current version of Repomix, we use --ignore
          args.push(`--ignore="${options.exclude.join(',')}"`);
        }
        
        // Add .repomixignore if it exists
        if (hasRepomixIgnore) {
          args.push(`--ignorefile="${repomixIgnorePath}"`);
        }
        
        // Add token limit
        if (options.maxTokens) {
          args.push(`--max-tokens=${options.maxTokens}`);
        }
        
        // Add style option
        args.push('--style="xml"');
        
        // Build the command
        const command = `npx -y repomix ${repoDir} ${args.join(' ')}`;
        logger.debug(`Executing command: ${command}`);
        
        // Execute the command
        const output = execSync(command, {
          encoding: 'utf-8',
          stdio: 'pipe',
          maxBuffer: 10 * 1024 * 1024 // 10 MB
        });
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const fileSize = stats.size;
          logger.info(`Repomix CLI succeeded: created ${outputFile} (${fileSize} bytes)`);
          
          // Approximate the token count
          const totalTokens = Math.floor(fileSize / 4);
          
          // Count files in the output
          const fileContent = fs.readFileSync(outputFile, 'utf-8');
          const fileMatches = fileContent.match(/<file\s/g);
          const totalFiles = fileMatches ? fileMatches.length : 10;
          
          return { totalFiles, totalTokens };
        } else {
          throw new Error(`Output file was not created: ${outputFile}`);
        }
      } catch (complexError) {
        // If both attempts fail, throw the error from the simple approach
        throw simpleError;
      }
    }
  } catch (error) {
    // Check if error is related to Repomix not being found
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('not found') || errorMessage.includes('command not found')) {
      throw new RepositoryPackagingError(`Repomix CLI not found. Error: ${errorMessage}`);
    }
    
    logger.error(`Error calling Repomix CLI: ${errorMessage}`);
    throw new RepositoryPackagingError(`Failed to call Repomix CLI: ${errorMessage}`);
  }
}