/**
 * Bridge Tools for Claude-Gemini Bridge
 * 
 * Implements MCP tools for bidirectional communication between Claude and Gemini.
 */

import { z } from "zod";
import { McpCallbackResponse, Logger } from './types.js';
import { 
  EvolutionType, 
  SharedContext,
  CachingOptions,
  ContextUpdateOptions
} from './bridge-types.js';
import { formatErrorForResponse, logErrorDetails } from './errors.js';
import { getConfigManager } from './config-manager.js';
import { getContextManager } from './context-manager.js';
import { callClaude } from './claude-api.js';
import { EvolutionEngine } from './evolution-engine.js';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Chat with Claude directly
 */
export const chatWithClaudeTool = {
  name: "chat-with-claude",
  schema: {
    prompt: z.string().describe("The message or question to send to Claude"),
    systemPrompt: z.string().optional().describe("Optional system prompt to guide Claude's behavior"),
    model: z.string().optional().describe("Claude model to use: claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307"),
    maxTokens: z.number().optional().describe("Maximum tokens for Claude response"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    sharedContext: z.record(z.any()).optional().describe("Shared context to use"),
    updateContext: z.boolean().optional().describe("Whether to update the shared context")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { prompt, systemPrompt, model, maxTokens, temperature, sharedContext, updateContext } = args;
    const logger = createLogger();
    const configManager = getConfigManager(logger);
    
    try {
      // Check if Claude API key is available
      const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
      if (!CLAUDE_API_KEY) {
        return {
          content: [{ 
            type: "text", 
            text: "CLAUDE_API_KEY environment variable is required but not set. Please add it to your .env file or environment." 
          }],
          isError: true
        };
      }
      
      logger.info("Claude chat requested", { promptLength: prompt.length });
      
      // Call Claude API
      const claudeResponse = await callClaude(prompt, {
        model: model || configManager.getClaudeModel?.() || 'claude-3-opus-20240229',
        maxTokens: maxTokens || configManager.getClaudeMaxTokens?.() || 4096,
        temperature: temperature || configManager.getClaudeTemperature?.() || 0.7,
        systemPrompt,
        logger
      });
      
      // Update context if requested
      if (updateContext && sharedContext && sharedContext.id) {
        const contextManager = getContextManager({ logger });
        
        try {
          const context = await contextManager.getContext(sharedContext.id);
          
          if (context) {
            await contextManager.updateContext(
              context.id,
              {
                reasoningContext: {
                  interpretations: {
                    raw: claudeResponse
                  },
                  reasoningTimestamp: new Date().toISOString(),
                  reasoningModel: model || configManager.getClaudeModel?.() || 'claude-3-opus-20240229',
                  reasoningPrompt: prompt
                }
              },
              {
                updateReasoning: true,
                mergeStrategy: 'replace'
              }
            );
            
            logger.info(`Updated context ${context.id} with Claude response`);
          }
        } catch (error) {
          logger.error("Error updating context with Claude response", error);
        }
      }
      
      // Return Claude's response
      return {
        content: [{ 
          type: "text", 
          text: claudeResponse 
        }]
      };
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * Evolve code using Claude and Gemini
 */
export const evolveCodeTool = {
  name: "evolve-code",
  schema: {
    query: z.string().describe("Question or request about how to evolve the code"),
    directory: z.string().describe("Path to the repository directory"),
    evolutionType: z.enum(["refactor", "improve", "transform", "test", "document"]).describe("Type of evolution to perform"),
    targetComponent: z.string().optional().describe("Specific component to focus on"),
    analysisType: z.string().optional().describe("Type of analysis to perform"),
    contextFiles: z.array(z.string()).optional().describe("Files providing context for the evolution"),
    filesToModify: z.array(z.string()).optional().describe("Files to be modified by the evolution"),
    codeSpecification: z.string().optional().describe("Detailed specifications for the evolution"),
    previousEvolutionId: z.string().optional().describe("ID of a previous evolution to build upon"),
    geminiModel: z.string().optional().describe("Gemini model to use for analysis"),
    claudeModel: z.string().optional().describe("Claude model to use for reasoning"),
    maxTokens: z.number().optional().describe("Maximum tokens for model responses"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature for generation (0.0 to 1.0)"),
    sharedContextId: z.string().optional().describe("ID of shared context to use"),
    updateContext: z.boolean().optional().default(true).describe("Whether to update the shared context")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { 
      query, 
      directory, 
      evolutionType, 
      targetComponent, 
      analysisType, 
      contextFiles, 
      filesToModify, 
      codeSpecification, 
      previousEvolutionId,
      geminiModel,
      claudeModel,
      maxTokens,
      temperature,
      sharedContextId,
      updateContext = true
    } = args;
    
    const logger = createLogger();
    
    try {
      // Verify the directory exists
      if (!existsSync(directory)) {
        return {
          content: [{ 
            type: "text", 
            text: `Directory not found: ${directory}` 
          }],
          isError: true
        };
      }
      
      // Check if Claude API key is available
      const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
      if (!CLAUDE_API_KEY) {
        return {
          content: [{ 
            type: "text", 
            text: "CLAUDE_API_KEY environment variable is required but not set. Please add it to your .env file or environment." 
          }],
          isError: true
        };
      }
      
      // Get or create context
      const contextManager = getContextManager({ logger });
      let context: SharedContext;
      
      if (sharedContextId) {
        // Use existing context
        const existingContext = await contextManager.getContext(sharedContextId);
        if (!existingContext) {
          return {
            content: [{ 
              type: "text", 
              text: `Context not found with ID: ${sharedContextId}` 
            }],
            isError: true
          };
        }
        context = existingContext;
        logger.info(`Using existing context: ${context.id}`);
      } else if (previousEvolutionId) {
        // Try to find context with previous evolution
        const contexts = await contextManager.listContexts();
        const matchingContext = contexts.find(ctx => 
          ctx.evolutionContext?.history.some(op => op.id === previousEvolutionId)
        );
        
        if (matchingContext) {
          context = matchingContext;
          logger.info(`Found context with previous evolution: ${context.id}`);
        } else {
          // Create new context
          context = await contextManager.createContext("evolution-session", directory);
          logger.info(`Created new context: ${context.id}`);
        }
      } else {
        // Try to find context for this repository
        const existingContext = await contextManager.findContextForRepository(directory);
        
        if (existingContext) {
          context = existingContext;
          logger.info(`Found existing context for repository: ${context.id}`);
        } else {
          // Create new context
          context = await contextManager.createContext("evolution-session", directory);
          logger.info(`Created new context: ${context.id}`);
        }
      }
      
      // Execute the evolution operation
      const evolutionEngine = new EvolutionEngine({
        contextManager,
        logger
      });
      
      logger.info(`Executing ${evolutionType} operation for ${directory}`);
      
      const evolutionResponse = await evolutionEngine.execute({
        query,
        evolutionType: evolutionType as EvolutionType,
        directory,
        targetComponent,
        analysisType,
        contextFiles,
        filesToModify,
        codeSpecification,
        previousEvolutionId,
        geminiModel,
        claudeModel,
        maxTokens,
        temperature,
        context
      });
      
      // Format the response
      return {
        content: [{ 
          type: "text", 
          text: `# ${formatEvolutionTitle(evolutionType)}

${evolutionResponse.explanation}

## Changes

${formatChanges(evolutionResponse.evolutionOperation)}

## Recommendations

${formatRecommendations(evolutionResponse.recommendations)}

*Context ID: ${context.id}*`
        }]
      };
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * Manage shared context between models
 */
export const manageContextTool = {
  name: "manage-context",
  schema: {
    action: z.enum(["create", "get", "update", "delete", "list"]).describe("Action to perform on the context"),
    contextId: z.string().optional().describe("ID of the context to operate on"),
    repositoryPath: z.string().optional().describe("Repository path for creating a new context"),
    sessionId: z.string().optional().describe("Session ID for creating or updating a context"),
    analysisContext: z.record(z.any()).optional().describe("Analysis context data for update"),
    reasoningContext: z.record(z.any()).optional().describe("Reasoning context data for update"),
    evolutionContext: z.record(z.any()).optional().describe("Evolution context data for update"),
    updateOptions: z.record(z.any()).optional().describe("Options for context update"),
    format: z.enum(["json", "text"]).optional().default("text").describe("Response format")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const {
      action,
      contextId,
      repositoryPath,
      sessionId,
      analysisContext,
      reasoningContext,
      evolutionContext,
      updateOptions,
      format = "text"
    } = args;
    
    const logger = createLogger();
    const contextManager = getContextManager({ logger });
    
    try {
      let result: any;
      
      switch (action) {
        case "create":
          if (!repositoryPath) {
            return {
              content: [{ 
                type: "text", 
                text: "repositoryPath is required for creating a new context" 
              }],
              isError: true
            };
          }
          
          const newContext = await contextManager.createContext(
            sessionId || "default-session",
            repositoryPath
          );
          
          result = {
            message: `Context created with ID: ${newContext.id}`,
            context: newContext
          };
          break;
          
        case "get":
          if (!contextId) {
            return {
              content: [{ 
                type: "text", 
                text: "contextId is required for getting a context" 
              }],
              isError: true
            };
          }
          
          const context = await contextManager.getContext(contextId);
          if (!context) {
            return {
              content: [{ 
                type: "text", 
                text: `Context not found with ID: ${contextId}` 
              }],
              isError: true
            };
          }
          
          result = context;
          break;
          
        case "update":
          if (!contextId) {
            return {
              content: [{ 
                type: "text", 
                text: "contextId is required for updating a context" 
              }],
              isError: true
            };
          }
          
          const updateContext: Partial<SharedContext> = {};
          if (sessionId) updateContext.sessionId = sessionId;
          if (analysisContext) updateContext.analysisContext = analysisContext;
          if (reasoningContext) updateContext.reasoningContext = reasoningContext;
          if (evolutionContext) updateContext.evolutionContext = evolutionContext;
          
          const updatedContext = await contextManager.updateContext(
            contextId,
            updateContext,
            updateOptions as ContextUpdateOptions
          );
          
          if (!updatedContext) {
            return {
              content: [{ 
                type: "text", 
                text: `Failed to update context with ID: ${contextId}` 
              }],
              isError: true
            };
          }
          
          result = {
            message: `Context updated with ID: ${contextId}`,
            context: updatedContext
          };
          break;
          
        case "delete":
          if (!contextId) {
            return {
              content: [{ 
                type: "text", 
                text: "contextId is required for deleting a context" 
              }],
              isError: true
            };
          }
          
          const deleted = await contextManager.deleteContext(contextId);
          
          result = {
            message: deleted 
              ? `Context deleted with ID: ${contextId}` 
              : `Context not found with ID: ${contextId}`,
            success: deleted
          };
          break;
          
        case "list":
          const contexts = await contextManager.listContexts(sessionId);
          
          result = {
            message: `Found ${contexts.length} contexts${sessionId ? ` for session ${sessionId}` : ''}`,
            contexts: contexts.map(ctx => ({
              id: ctx.id,
              sessionId: ctx.sessionId,
              repositoryPath: ctx.repositoryPath,
              createdAt: ctx.createdAt,
              updatedAt: ctx.updatedAt,
              hasAnalysis: !!ctx.analysisContext,
              hasReasoning: !!ctx.reasoningContext,
              hasEvolution: !!ctx.evolutionContext
            }))
          };
          break;
          
        default:
          return {
            content: [{ 
              type: "text", 
              text: `Unknown action: ${action}` 
            }],
            isError: true
          };
      }
      
      // Format the response
      if (format === "json") {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2) 
          }]
        };
      } else {
        // Text format
        let responseText = "";
        
        if (action === "list") {
          responseText = `${result.message}:\n\n`;
          
          for (const ctx of result.contexts) {
            responseText += `ID: ${ctx.id}\n`;
            responseText += `Session: ${ctx.sessionId}\n`;
            responseText += `Repository: ${ctx.repositoryPath}\n`;
            responseText += `Created: ${ctx.createdAt}\n`;
            responseText += `Updated: ${ctx.updatedAt}\n`;
            responseText += `Analysis: ${ctx.hasAnalysis ? 'Yes' : 'No'}\n`;
            responseText += `Reasoning: ${ctx.hasReasoning ? 'Yes' : 'No'}\n`;
            responseText += `Evolution: ${ctx.hasEvolution ? 'Yes' : 'No'}\n\n`;
          }
        } else if (action === "get") {
          responseText = `Context ID: ${result.id}\n`;
          responseText += `Session: ${result.sessionId}\n`;
          responseText += `Repository: ${result.repositoryPath}\n`;
          responseText += `Created: ${result.createdAt}\n`;
          responseText += `Updated: ${result.updatedAt}\n\n`;
          
          if (result.analysisContext) {
            responseText += `Analysis: Yes (Model: ${result.analysisContext.analysisModel}, Time: ${result.analysisContext.analysisTimestamp})\n`;
          } else {
            responseText += `Analysis: No\n`;
          }
          
          if (result.reasoningContext) {
            responseText += `Reasoning: Yes (Model: ${result.reasoningContext.reasoningModel}, Time: ${result.reasoningContext.reasoningTimestamp})\n`;
          } else {
            responseText += `Reasoning: No\n`;
          }
          
          if (result.evolutionContext) {
            responseText += `Evolution: Yes (State: ${result.evolutionContext.currentState}, Operations: ${result.evolutionContext.history?.length || 0})\n`;
          } else {
            responseText += `Evolution: No\n`;
          }
        } else {
          responseText = result.message;
        }
        
        return {
          content: [{ 
            type: "text", 
            text: responseText 
          }]
        };
      }
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * Configure Claude settings
 */
export const configureClaudeTool = {
  name: "configure-claude",
  schema: {
    defaultModel: z.string().optional()
      .describe("Set the default Claude model to use for all operations"),
    defaultTemperature: z.number().min(0).max(1).optional()
      .describe("Set the default temperature for generation"),
    defaultMaxTokens: z.number().min(1).optional()
      .describe("Set the default maximum tokens for responses"),
    defaultSystemPrompt: z.string().optional()
      .describe("Set the default system prompt for Claude interactions")
  },
  handler: async (args: any): Promise<McpCallbackResponse> => {
    const { defaultModel, defaultTemperature, defaultMaxTokens, defaultSystemPrompt } = args;
    const logger = createLogger();
    const configManager = getConfigManager(logger);
    
    try {
      let updated = false;
      const changes = [];
      
      if (defaultModel !== undefined) {
        // Check if Claude API key is available before setting model
        const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
        if (!CLAUDE_API_KEY) {
          return {
            content: [{ 
              type: "text", 
              text: "CLAUDE_API_KEY environment variable is required but not set. Please add it to your .env file or environment." 
            }],
            isError: true
          };
        }
        
        // Validate the model (basic check - we should add a more comprehensive validation)
        const validModels = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
        if (!validModels.includes(defaultModel)) {
          return {
            content: [{ 
              type: "text", 
              text: `Invalid Claude model: ${defaultModel}. Valid models are: ${validModels.join(', ')}` 
            }],
            isError: true
          };
        }
        
        // Update config (add method if it doesn't exist)
        if (typeof configManager.setClaudeModel === 'function') {
          await configManager.setClaudeModel(defaultModel);
        } else {
          // Fall back to updating active profile
          const profile = configManager.getProfiles()[configManager.getActiveProfile()];
          if (profile) {
            const updatedProfile = {
              ...profile,
              config: {
                ...profile.config,
                claude: {
                  ...profile.config.claude,
                  defaultModel
                }
              }
            };
            await configManager.updateProfile(configManager.getActiveProfile(), updatedProfile);
          }
        }
        
        updated = true;
        changes.push(`Default Claude model set to ${defaultModel}`);
      }
      
      if (defaultTemperature !== undefined) {
        // Update config (add method if it doesn't exist)
        if (typeof configManager.setClaudeTemperature === 'function') {
          await configManager.setClaudeTemperature(defaultTemperature);
        } else {
          // Fall back to updating active profile
          const profile = configManager.getProfiles()[configManager.getActiveProfile()];
          if (profile) {
            const updatedProfile = {
              ...profile,
              config: {
                ...profile.config,
                claude: {
                  ...profile.config.claude,
                  defaultTemperature
                }
              }
            };
            await configManager.updateProfile(configManager.getActiveProfile(), updatedProfile);
          }
        }
        
        updated = true;
        changes.push(`Default Claude temperature set to ${defaultTemperature}`);
      }
      
      if (defaultMaxTokens !== undefined) {
        // Update config (add method if it doesn't exist)
        if (typeof configManager.setClaudeMaxTokens === 'function') {
          await configManager.setClaudeMaxTokens(defaultMaxTokens);
        } else {
          // Fall back to updating active profile
          const profile = configManager.getProfiles()[configManager.getActiveProfile()];
          if (profile) {
            const updatedProfile = {
              ...profile,
              config: {
                ...profile.config,
                claude: {
                  ...profile.config.claude,
                  defaultMaxTokens
                }
              }
            };
            await configManager.updateProfile(configManager.getActiveProfile(), updatedProfile);
          }
        }
        
        updated = true;
        changes.push(`Default Claude maximum tokens set to ${defaultMaxTokens}`);
      }
      
      if (defaultSystemPrompt !== undefined) {
        // Update config (add method if it doesn't exist)
        if (typeof configManager.setClaudeSystemPrompt === 'function') {
          await configManager.setClaudeSystemPrompt(defaultSystemPrompt);
        } else {
          // Fall back to updating active profile
          const profile = configManager.getProfiles()[configManager.getActiveProfile()];
          if (profile) {
            const updatedProfile = {
              ...profile,
              config: {
                ...profile.config,
                claude: {
                  ...profile.config.claude,
                  defaultSystemPrompt
                }
              }
            };
            await configManager.updateProfile(configManager.getActiveProfile(), updatedProfile);
          }
        }
        
        updated = true;
        changes.push(`Default Claude system prompt updated`);
      }
      
      if (!updated) {
        return {
          content: [{ 
            type: "text", 
            text: "No changes were made. Please specify at least one setting to update." 
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Claude configuration updated successfully:\n${changes.join('\n')}` 
        }]
      };
    } catch (error) {
      logErrorDetails(error, logger);
      return formatErrorForResponse(error);
    }
  }
};

/**
 * Helper function to create a logger
 */
function createLogger(): Logger {
  return {
    debug: (message: string, ...args: any[]) => {
      if (process.env.DEBUG) {
        console.error(`[DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      console.error(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.error(`[WARN] ${message}`, ...args);
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`, error);
    }
  };
}

/**
 * Helper function to format evolution title
 */
function formatEvolutionTitle(evolutionType: string): string {
  switch (evolutionType) {
    case 'refactor': return 'Code Refactoring Plan';
    case 'improve': return 'Code Improvement Plan';
    case 'transform': return 'Code Transformation Plan';
    case 'test': return 'Test Generation Plan';
    case 'document': return 'Documentation Generation Plan';
    default: return 'Code Evolution Plan';
  }
}

/**
 * Helper function to format changes
 */
function formatChanges(operation: any): string {
  if (!operation || !operation.details) {
    return 'No changes were proposed.';
  }
  
  let changesText = '';
  const details = operation.details;
  
  // Add operation-specific details
  switch (operation.type) {
    case 'refactor':
      changesText += `**Goal:** ${details.goal}\n\n`;
      changesText += `**Strategy:** ${details.strategy}\n\n`;
      
      if (details.codeSmellsAddressed && details.codeSmellsAddressed.length > 0) {
        changesText += '**Code Smells Addressed:**\n';
        for (const smell of details.codeSmellsAddressed) {
          changesText += `- ${smell}\n`;
        }
        changesText += '\n';
      }
      
      if (details.patternsApplied && details.patternsApplied.length > 0) {
        changesText += '**Design Patterns Applied:**\n';
        for (const pattern of details.patternsApplied) {
          changesText += `- ${pattern}\n`;
        }
        changesText += '\n';
      }
      break;
      
    case 'improve':
      changesText += `**Goal:** ${details.goal}\n\n`;
      changesText += `**Aspect:** ${details.improvedAspect}\n\n`;
      
      if (details.measurableMetrics && details.measurableMetrics.length > 0) {
        changesText += '**Measurable Metrics:**\n';
        for (const metric of details.measurableMetrics) {
          changesText += `- ${metric}\n`;
        }
        changesText += '\n';
      }
      break;
      
    case 'transform':
      changesText += `**Goal:** ${details.goal}\n\n`;
      
      if (details.fromArchitecture && details.toArchitecture) {
        changesText += `**Architecture Change:** ${details.fromArchitecture} → ${details.toArchitecture}\n\n`;
      }
      
      if (details.transformationSteps && details.transformationSteps.length > 0) {
        changesText += '**Transformation Steps:**\n';
        for (const step of details.transformationSteps) {
          changesText += `- ${step}\n`;
        }
        changesText += '\n';
      }
      break;
      
    case 'test':
      changesText += `**Goal:** ${details.goal}\n\n`;
      changesText += `**Test Framework:** ${details.testFramework}\n\n`;
      
      if (details.testTypes && details.testTypes.length > 0) {
        changesText += `**Test Types:** ${details.testTypes.join(', ')}\n\n`;
      }
      
      if (details.coverageTargets && details.coverageTargets.length > 0) {
        changesText += '**Coverage Targets:**\n';
        for (const target of details.coverageTargets) {
          changesText += `- ${target}\n`;
        }
        changesText += '\n';
      }
      
      if (details.generatedTests && details.generatedTests.length > 0) {
        changesText += '**Generated Tests:**\n';
        for (const test of details.generatedTests) {
          changesText += `- ${test.filePath}: ${test.description}\n`;
        }
        changesText += '\n';
      }
      return changesText;
      
    case 'document':
      changesText += `**Goal:** ${details.goal}\n\n`;
      changesText += `**Documentation Type:** ${details.documentationType}\n\n`;
      
      if (details.generatedDocs && details.generatedDocs.length > 0) {
        changesText += '**Generated Documentation:**\n';
        for (const doc of details.generatedDocs) {
          changesText += `- ${doc.filePath}: ${doc.description}\n`;
        }
        changesText += '\n';
      }
      return changesText;
  }
  
  // Add file changes for refactor, improve, and transform
  if ('changes' in details && details.changes && details.changes.length > 0) {
    changesText += '### File Changes\n\n';
    
    for (const change of details.changes) {
      changesText += `#### ${change.filePath} (${change.type})\n\n`;
      changesText += `${change.description}\n\n`;
      
      if (change.before && change.after) {
        changesText += '```diff\n';
        changesText += `- ${change.before.split('\n').join('\n- ')}\n`;
        changesText += `+ ${change.after.split('\n').join('\n+ ')}\n`;
        changesText += '```\n\n';
      } else if (change.after && !change.before) {
        changesText += '```\n';
        changesText += change.after + '\n';
        changesText += '```\n\n';
      }
      
      if (change.impacts) {
        changesText += '**Impacts:**\n';
        if (change.impacts.components && change.impacts.components.length > 0) {
          changesText += `- Components: ${change.impacts.components.join(', ')}\n`;
        }
        if (change.impacts.files && change.impacts.files.length > 0) {
          changesText += `- Files: ${change.impacts.files.join(', ')}\n`;
        }
        if (change.impacts.description) {
          changesText += `- Details: ${change.impacts.description}\n`;
        }
        changesText += '\n';
      }
    }
  }
  
  return changesText;
}

/**
 * Helper function to format recommendations
 */
function formatRecommendations(recommendations: string[]): string {
  if (!recommendations || recommendations.length === 0) {
    return 'No specific recommendations.';
  }
  
  return recommendations.map(rec => `- ${rec}`).join('\n');
}
