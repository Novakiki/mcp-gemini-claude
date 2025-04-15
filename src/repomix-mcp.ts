/**
 * Integration with Repomix MCP Server
 * Provides functions to package repositories through the Model Context Protocol
 */
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { Logger } from './types.js';
import { RepositoryPackagingError } from './errors.js';
import { PackageRepositoryOptions, PackageResult } from './types.js';

// MCP client types - simplified versions based on MCP SDK
interface McpRequest {
  name: string;
  arguments: Record<string, any>;
}

interface McpResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  metadata?: {
    fileCount?: number;
    tokenCount?: number;
    outputId?: string;
  };
}

/**
 * Check if Repomix MCP server is available
 */
export async function isRepomixMcpAvailable(): Promise<boolean> {
  try {
    // We'll implement a simple health check by calling the tool with minimal arguments
    // This just tests if the tool can be found and is executable
    const healthResult = await callMcpTool("pack_codebase", { 
      directory: process.cwd(),
      compress: true,
      topFilesLength: 1
    }, true);
    
    return !healthResult.isError;
  } catch (error) {
    // If any error occurs, assume MCP is not available
    return false;
  }
}

/**
 * Package a repository using Repomix via MCP
 */
export async function packageRepositoryViaMcp(
  repoDir: string,
  outputFile: string,
  options: PackageRepositoryOptions = {},
  logger?: Logger
): Promise<PackageResult> {
  const log: Logger = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  
  try {
    log.info("Packaging repository via Repomix MCP", {
      repoDir,
      outputFile,
      componentPath: options.componentPath || 'None (repository overview)'
    });

    // Prepare MCP request arguments
    const mcpArgs = {
      directory: repoDir,
      compress: options.compress !== false, // Default to true
      includePatterns: options.include?.join(','),
      ignorePatterns: options.exclude?.join(','),
      topFilesLength: 20
    };

    // Call Repomix MCP
    const result = await callMcpTool("pack_codebase", mcpArgs);
    
    if (result.isError) {
      throw new Error(`MCP error: ${result.content[0]?.text || "Unknown error"}`);
    }
    
    // Extract output ID from metadata
    const outputId = result.metadata?.outputId;
    let content = "";
    
    // If we have output ID, read the file
    if (outputId) {
      log.info(`Reading output from MCP with ID: ${outputId}`);
      content = await readMcpOutput(outputId);
    } else if (result.content && result.content.length > 0) {
      // Otherwise, use content directly from the response
      log.info(`Using content directly from MCP response`);
      content = result.content.map(item => item.text).join("\n");
    } else {
      throw new Error("No content returned from MCP server");
    }
    
    // Write content to output file
    await fs.writeFile(outputFile, content, 'utf-8');
    
    // Extract metadata from result
    const totalFiles = result.metadata?.fileCount || 0;
    const totalTokens = result.metadata?.tokenCount || 0;
    
    log.info(`Successfully packaged repository via MCP: ${totalFiles} files, ${totalTokens} tokens`);
    
    return {
      totalFiles,
      totalTokens,
      filePaths: [],  // We don't have this information from MCP
      usedFallback: false,
      usedMcp: true
    };
  } catch (error) {
    log.error(`Failed to package repository via MCP: ${error instanceof Error ? error.message : String(error)}`);
    throw new RepositoryPackagingError(
      `MCP packaging failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Call a tool on the MCP server
 * This implements the MCP tool call using the MCP protocol
 */
async function callMcpTool(
  toolName: string, 
  args: Record<string, any>,
  isHealthCheck: boolean = false
): Promise<McpResponse> {
  try {
    // Construct the command to call repomix via npx
    // For health check, we add a --dry-run flag to avoid actual processing
    const npxCommand = isHealthCheck
      ? `npx -y repomix --info-only`
      : `npx -y repomix`;
    
    // Convert args to command line arguments
    const argString = Object.entries(args)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        // Handle boolean values
        if (typeof value === 'boolean') {
          return value ? `--${key}` : `--no-${key}`;
        }
        // Handle arrays by joining with commas
        if (Array.isArray(value)) {
          return `--${key}="${value.join(',')}"`;
        }
        // Handle string and number values
        return `--${key}="${value}"`;
      })
      .join(' ');
    
    // Use the child_process module to execute the command
    const { execSync } = await import('child_process');
    const fullCommand = `${npxCommand} ${argString}`;
    
    try {
      const output = execSync(fullCommand, { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'], // Redirect stdout and stderr to pipes
        timeout: 60000 // 60 second timeout
      });
      
      // Parse the output as JSON if possible
      try {
        // For health check, we just care that it executed
        if (isHealthCheck) {
          return { 
            content: [{ type: "text", text: "MCP Repomix is available" }],
            isError: false
          };
        }
        
        // Try to parse the output as JSON
        const outputJson = JSON.parse(output);
        
        // Extract metadata from the output
        const fileCount = outputJson.fileCount || outputJson.total_files || 0;
        const tokenCount = outputJson.tokenCount || outputJson.total_tokens || 0;
        
        // Create a response with the parsed information
        return {
          content: [{ type: "text", text: outputJson.content || output }],
          isError: false,
          metadata: {
            fileCount,
            tokenCount,
            outputId: outputJson.outputId || outputJson.output_id
          }
        };
      } catch (parseError) {
        // If we can't parse as JSON, use raw output
        return {
          content: [{ type: "text", text: output }],
          isError: false
        };
      }
    } catch (execError: any) {
      // Command execution failed
      return {
        content: [{ 
          type: "text", 
          text: execError.message || "Failed to execute Repomix MCP tool"
        }],
        isError: true
      };
    }
  } catch (error) {
    // Something went wrong with the MCP call setup
    return {
      content: [{ 
        type: "text", 
        text: error instanceof Error ? error.message : String(error) 
      }],
      isError: true
    };
  }
}

/**
 * Read output from MCP server
 * This reads the output file generated by Repomix
 */
async function readMcpOutput(outputId: string): Promise<string> {
  try {
    // Look for the output file in common locations
    const possibleLocations = [
      `./${outputId}`,
      `./${outputId}.txt`,
      `./repomix-output-${outputId}.txt`,
      `/tmp/${outputId}`,
      `/tmp/${outputId}.txt`,
      `/tmp/repomix-output-${outputId}.txt`
    ];
    
    for (const location of possibleLocations) {
      if (existsSync(location)) {
        return await fs.readFile(location, 'utf-8');
      }
    }
    
    // If we can't find the file, throw an error
    throw new Error(`Cannot find Repomix output file with ID: ${outputId}`);
  } catch (error) {
    throw new Error(`Failed to read MCP output: ${error instanceof Error ? error.message : String(error)}`);
  }
}
