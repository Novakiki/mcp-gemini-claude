/**
 * Integration Module
 * 
 * This module integrates the new tools with the existing MCP server.
 * It provides a function that adds the new tools to the server instance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { packageRepositoryTool, analyzeRepositoryTool, explainRepositoryTool } from './new-tools.js';
import { Logger } from './types.js';

/**
 * Add the new tools to the MCP server
 * @param server MCP server instance
 * @param logger Logger instance
 */
export function integrateNewTools(server: McpServer, logger: Logger): void {
  logger.info("Integrating new tools: package-repository, analyze-repository, explain-repository");
  
  // Register package-repository tool
  server.tool(
    packageRepositoryTool.name,
    packageRepositoryTool.schema,
    packageRepositoryTool.handler
  );
  
  // Register analyze-repository tool
  server.tool(
    analyzeRepositoryTool.name,
    analyzeRepositoryTool.schema,
    analyzeRepositoryTool.handler
  );
  
  // Register explain-repository tool
  server.tool(
    explainRepositoryTool.name,
    explainRepositoryTool.schema,
    explainRepositoryTool.handler
  );
  
  logger.info("New tools integrated successfully");
}

/**
 * Create a metadata resource that documents the new tools
 * @param server MCP server instance
 * @param logger Logger instance
 */
export function addToolsDocumentation(server: McpServer, logger: Logger): void {
  server.resource("docs", "docs://revised-architecture", async () => {
    return {
      contents: [{
        uri: "docs://revised-architecture",
        text: JSON.stringify({
          title: "Revised Architecture: Separating Packaging from Analysis",
          description: "Documentation for the revised architecture that properly separates repository packaging from the actual analysis.",
          version: "1.0.0",
          architecture: {
            description: "The architecture follows a pipeline approach where each component has a specific responsibility:",
            components: [
              {
                name: "Repomix (Packaging)",
                description: "Handles extracting and consolidating code from the repository",
                tool: "package-repository"
              },
              {
                name: "Custom Analysis",
                description: "Performs deep analysis on the packaged code to extract patterns, architecture, components, etc.",
                tool: "analyze-repository"
              },
              {
                name: "Gemini/Claude (Response)",
                description: "Generates natural language responses based on the packaged code and analysis results",
                tool: "explain-repository"
              }
            ]
          },
          tools: [
            {
              name: "package-repository",
              description: "Packages a repository using Repomix (or fallbacks)",
              usage: "Use when you only need to extract and consolidate code without analysis",
              examples: [
                "Package this repository so I can analyze it later",
                "Package only the authentication component of this repository"
              ]
            },
            {
              name: "analyze-repository",
              description: "Analyzes packaged code to extract architecture, components, patterns, and issues",
              usage: "Use to get raw analysis data without natural language explanation",
              examples: [
                "Analyze this repository for security vulnerabilities",
                "Analyze the repository I just packaged"
              ]
            },
            {
              name: "explain-repository",
              description: "Combines packaging, analysis, and AI response generation",
              usage: "Use for complete analysis workflow with natural language explanation",
              examples: [
                "Explain how authentication works in this repository",
                "Explain the architecture of this codebase"
              ]
            }
          ]
        }, null, 2)
      }]
    };
  });
  
  logger.info("Added documentation resource for the revised architecture");
}
