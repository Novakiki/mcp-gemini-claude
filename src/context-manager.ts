/**
 * Context Manager for the Multi-Model Bridge
 * 
 * Manages the shared context between Claude, Gemini, and OpenAI models,
 * providing storage, retrieval, and update capabilities for bidirectional collaboration.
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { 
  SharedContext, 
  ContextUpdateOptions, 
  AnalysisContext,
  ReasoningContext,
  ArchitecturalContext,
  EvolutionContext,
  EvolutionOperation,
  Change,
  SecurityRisk,
  PerformanceIssue,
  ArchitecturalRecommendation,
  RefactoringProposal
} from './bridge-types.js';
import { Logger } from './types.js';
import { ContextError } from './errors.js';

// Maximum context size to prevent token limit issues
const MAX_CONTEXT_SIZES = {
  analysisResult: 100000,      // Characters limit for analysis result
  reasoningContext: 50000,     // Characters limit for reasoning context
  architecturalContext: 50000, // Characters limit for architectural context
  evolutionHistory: 20,        // Maximum number of operations in history
  suggestedChanges: 50,        // Maximum number of suggested changes
  interpretations: 20000,      // Characters limit for interpretations
  recommendations: 20          // Maximum number of recommendations
};

/**
 * Options for context manager initialization
 */
export interface ContextManagerOptions {
  contextDir?: string;           // Directory for storing contexts
  logger?: Logger;               // Logger for operations
  maxContextAge?: number;        // Maximum age in hours for auto-cleanup
}

/**
 * Context summary for quick reference
 */
export interface ContextSummary {
  id: string;                    // Context ID
  sessionId: string;             // Session ID
  repository: string;            // Repository path
  createdAt: string;             // Creation timestamp
  updatedAt: string;             // Update timestamp
  hasAnalysis: boolean;          // Whether context has analysis from Gemini
  hasReasoning: boolean;         // Whether context has reasoning from Claude
  hasArchitectural: boolean;     // Whether context has architectural analysis from OpenAI
  hasEvolution: boolean;         // Whether context has evolution
  operationCount: number;        // Number of evolution operations
  componentsAnalyzed: number;    // Number of components analyzed
  providers: string[];           // List of providers that contributed to this context
}

/**
 * Provider identification
 */
export type Provider = 'claude' | 'gemini' | 'openai';

/**
 * Manages shared context between models
 */
export class ContextManager {
  private contextDir: string;    // Directory for storing contexts
  private contexts: Map<string, SharedContext>;  // In-memory cache of contexts
  private logger: Logger;        // Logger for operations
  private maxContextAge: number; // Maximum age in hours for auto-cleanup

  /**
   * Create a new context manager
   */
  constructor(options: ContextManagerOptions = {}) {
    this.contextDir = options.contextDir || path.join(process.cwd(), '.contexts');
    this.logger = options.logger || { 
      info: console.log, 
      warn: console.warn, 
      error: console.error, 
      debug: console.debug 
    };
    this.maxContextAge = options.maxContextAge || 72; // Default 72 hours (3 days)
    this.contexts = new Map();
    this.ensureContextDir();
    
    // Run initial cleanup of old contexts
    this.cleanupOldContexts().catch(err => 
      this.logger.error('Failed to clean up old contexts during initialization', err)
    );
  }

  /**
   * Ensure the context directory exists
   */
  private ensureContextDir(): void {
    if (!existsSync(this.contextDir)) {
      try {
        mkdirSync(this.contextDir, { recursive: true });
        this.logger.info(`Created context directory: ${this.contextDir}`);
      } catch (error) {
        this.logger.error(`Failed to create context directory: ${this.contextDir}`, error);
        throw new ContextError(`Failed to create context directory: ${this.contextDir}`, undefined, error);
      }
    }
  }

  /**
   * Create a new shared context
   */
  async createContext(sessionId: string, repositoryPath: string): Promise<SharedContext> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const context: SharedContext = {
      id,
      sessionId,
      repositoryPath,
      createdAt: now,
      updatedAt: now
    };
    
    this.contexts.set(id, context);
    await this.persistContext(id);
    
    this.logger.info(`Created new context: ${id} for session: ${sessionId}`);
    return context;
  }

  /**
   * Get a shared context by ID
   */
  async getContext(id: string): Promise<SharedContext | null> {
    // Try from memory first
    if (this.contexts.has(id)) {
      return this.contexts.get(id)!;
    }
    
    // Try to load from disk
    try {
      const contextPath = path.join(this.contextDir, `${id}.json`);
      if (existsSync(contextPath)) {
        const contextData = await fs.readFile(contextPath, 'utf-8');
        const context = JSON.parse(contextData) as SharedContext;
        this.contexts.set(id, context);
        return context;
      }
    } catch (error) {
      this.logger.error(`Error loading context ${id}`, error);
    }
    
    return null;
  }

  /**
   * Update an existing shared context
   */
  async updateContext(
    id: string, 
    updates: Partial<SharedContext>, 
    options: ContextUpdateOptions = {}
  ): Promise<SharedContext | null> {
    const context = await this.getContext(id);
    if (!context) {
      this.logger.warn(`Cannot update context ${id}: not found`);
      return null;
    }
    
    const { 
      updateAnalysis = false, 
      updateReasoning = false,
      updateArchitectural = false,
      updateEvolution = false,
      mergeStrategy = 'replace' 
    } = options;
    
    // Update timestamp
    context.updatedAt = new Date().toISOString();
    
    // Handle analysis context updates from Gemini
    if (updateAnalysis && updates.analysisContext) {
      if (!context.analysisContext || mergeStrategy === 'replace') {
        context.analysisContext = this.limitAnalysisContextSize(updates.analysisContext);
      } else if (mergeStrategy === 'merge') {
        context.analysisContext = this.limitAnalysisContextSize({
          ...context.analysisContext,
          ...updates.analysisContext,
          // Ensure the result is properly merged if both exist
          analysisResult: updates.analysisContext.analysisResult || context.analysisContext.analysisResult
        });
      }
      this.logger.debug(`Updated analysis context for ${id} using ${mergeStrategy} strategy`);
    }
    
    // Handle reasoning context updates from Claude
    if (updateReasoning && updates.reasoningContext) {
      if (!context.reasoningContext || mergeStrategy === 'replace') {
        context.reasoningContext = this.limitReasoningContextSize(updates.reasoningContext);
      } else if (mergeStrategy === 'merge') {
        context.reasoningContext = this.limitReasoningContextSize(
          this.mergeReasoningContexts(
            context.reasoningContext,
            updates.reasoningContext,
            mergeStrategy
          )
        );
      }
      this.logger.debug(`Updated reasoning context for ${id} using ${mergeStrategy} strategy`);
    }
    
    // Handle architectural context updates from OpenAI
    if (updateArchitectural && updates.architecturalContext) {
      if (!context.architecturalContext || mergeStrategy === 'replace') {
        context.architecturalContext = this.limitArchitecturalContextSize(updates.architecturalContext);
      } else if (mergeStrategy === 'merge') {
        context.architecturalContext = this.limitArchitecturalContextSize(
          this.mergeArchitecturalContexts(
            context.architecturalContext,
            updates.architecturalContext,
            mergeStrategy
          )
        );
      }
      this.logger.debug(`Updated architectural context for ${id} using ${mergeStrategy} strategy`);
    }
    
    // Handle evolution context updates
    if (updateEvolution && updates.evolutionContext) {
      if (!context.evolutionContext || mergeStrategy === 'replace') {
        context.evolutionContext = this.limitEvolutionContextSize(updates.evolutionContext);
      } else if (mergeStrategy === 'merge') {
        context.evolutionContext = this.limitEvolutionContextSize(
          this.mergeEvolutionContexts(
            context.evolutionContext,
            updates.evolutionContext,
            mergeStrategy
          )
        );
      }
      this.logger.debug(`Updated evolution context for ${id} using ${mergeStrategy} strategy`);
    }
    
    // Update other fields if provided
    if (updates.sessionId) context.sessionId = updates.sessionId;
    if (updates.repositoryPath) context.repositoryPath = updates.repositoryPath;
    
    // Save the updated context
    this.contexts.set(id, context);
    await this.persistContext(id);
    
    return context;
  }

  /**
   * Limit analysis context size to prevent token limit issues
   */
  private limitAnalysisContextSize(analysisContext: AnalysisContext): AnalysisContext {
    const limited = { ...analysisContext };
    
    // Limit analysis result size
    if (limited.analysisResult) {
      // If it's a string, trim directly
      if (typeof limited.analysisResult === 'string' && 
          limited.analysisResult.length > MAX_CONTEXT_SIZES.analysisResult) {
        limited.analysisResult = limited.analysisResult.substring(0, MAX_CONTEXT_SIZES.analysisResult) + 
          '... [TRUNCATED]';
      } 
      // If it's an object, convert to string, trim, and convert back
      else if (typeof limited.analysisResult === 'object') {
        const resultString = JSON.stringify(limited.analysisResult);
        if (resultString.length > MAX_CONTEXT_SIZES.analysisResult) {
          limited.analysisResult = {
            _truncated: true,
            summary: 'Analysis result was truncated due to size',
            components: limited.analysisResult.components || [],
            architecture: limited.analysisResult.architecture || {}
          };
        }
      }
    }
    
    // Limit packaged code size if present
    if (limited.packagedCode && 
        typeof limited.packagedCode === 'string' && 
        limited.packagedCode.length > MAX_CONTEXT_SIZES.analysisResult) {
      limited.packagedCode = limited.packagedCode.substring(0, MAX_CONTEXT_SIZES.analysisResult) + 
        '... [TRUNCATED]';
    }
    
    return limited;
  }

  /**
   * Limit reasoning context size to prevent token limit issues
   */
  private limitReasoningContextSize(reasoningContext: ReasoningContext): ReasoningContext {
    const limited = { ...reasoningContext };
    
    // Limit interpretations
    if (limited.interpretations) {
      // Limit architectural insights
      if (limited.interpretations.architecturalInsights && 
          limited.interpretations.architecturalInsights.length > 10) {
        limited.interpretations.architecturalInsights = 
          limited.interpretations.architecturalInsights.slice(0, 10);
      }
      
      // Limit potential improvements
      if (limited.interpretations.potentialImprovements && 
          limited.interpretations.potentialImprovements.length > 10) {
        limited.interpretations.potentialImprovements = 
          limited.interpretations.potentialImprovements.slice(0, 10);
      }
      
      // Limit security risks
      if (limited.interpretations.securityRisks && 
          limited.interpretations.securityRisks.length > 10) {
        limited.interpretations.securityRisks = 
          limited.interpretations.securityRisks.slice(0, 10);
      }
      
      // Limit performance bottlenecks
      if (limited.interpretations.performanceBottlenecks && 
          limited.interpretations.performanceBottlenecks.length > 10) {
        limited.interpretations.performanceBottlenecks = 
          limited.interpretations.performanceBottlenecks.slice(0, 10);
      }
    }
    
    // Limit suggested changes
    if (limited.suggestedChanges && 
        limited.suggestedChanges.length > MAX_CONTEXT_SIZES.suggestedChanges) {
      limited.suggestedChanges = limited.suggestedChanges.slice(0, MAX_CONTEXT_SIZES.suggestedChanges);
    }
    
    return limited;
  }

  /**
   * Limit architectural context size to prevent token limit issues
   */
  private limitArchitecturalContextSize(architecturalContext: ArchitecturalContext): ArchitecturalContext {
    const limited = { ...architecturalContext };
    
    // Limit architectural recommendations
    if (limited.architecture && limited.architecture.recommendations && 
        limited.architecture.recommendations.length > MAX_CONTEXT_SIZES.recommendations) {
      limited.architecture.recommendations = 
        limited.architecture.recommendations.slice(0, MAX_CONTEXT_SIZES.recommendations);
    }
    
    // Limit architectural strengths and weaknesses
    if (limited.architecture) {
      if (limited.architecture.strengths && limited.architecture.strengths.length > 10) {
        limited.architecture.strengths = limited.architecture.strengths.slice(0, 10);
      }
      
      if (limited.architecture.weaknesses && limited.architecture.weaknesses.length > 10) {
        limited.architecture.weaknesses = limited.architecture.weaknesses.slice(0, 10);
      }
    }
    
    // Limit refactoring proposals
    if (limited.refactorings && limited.refactorings.length > 10) {
      limited.refactorings = limited.refactorings.slice(0, 10);
    }
    
    return limited;
  }

  /**
   * Limit evolution context size to prevent token limit issues
   */
  private limitEvolutionContextSize(evolutionContext: EvolutionContext): EvolutionContext {
    const limited = { ...evolutionContext };
    
    // Limit evolution history
    if (limited.history && 
        limited.history.length > MAX_CONTEXT_SIZES.evolutionHistory) {
      // Keep most recent operations
      limited.history = limited.history.slice(-MAX_CONTEXT_SIZES.evolutionHistory);
    }
    
    // Limit evolution plan
    if (limited.evolutionPlan && 
        limited.evolutionPlan.length > 20) {
      limited.evolutionPlan = limited.evolutionPlan.slice(0, 20);
    }
    
    // Limit steps
    if (limited.completedSteps && 
        limited.completedSteps.length > 20) {
      limited.completedSteps = limited.completedSteps.slice(0, 20);
    }
    
    if (limited.pendingSteps && 
        limited.pendingSteps.length > 20) {
      limited.pendingSteps = limited.pendingSteps.slice(0, 20);
    }
    
    return limited;
  }

  /**
   * Merge reasoning contexts with different strategies
   */
  private mergeReasoningContexts(
    existing: ReasoningContext,
    updates: ReasoningContext,
    mergeStrategy: 'replace' | 'append' | 'merge'
  ): ReasoningContext {
    const merged: ReasoningContext = {
      ...existing,
      ...updates,
      interpretations: {
        ...existing.interpretations,
        ...updates.interpretations
      },
      reasoningTimestamp: updates.reasoningTimestamp || existing.reasoningTimestamp,
      reasoningModel: updates.reasoningModel || existing.reasoningModel,
      reasoningProvider: 'claude'
    };
    
    // Handle componentRoles
    if (updates.interpretations.componentRoles && existing.interpretations.componentRoles) {
      merged.interpretations.componentRoles = {
        ...existing.interpretations.componentRoles,
        ...updates.interpretations.componentRoles
      };
    }
    
    // Handle arrays based on strategy
    if (updates.interpretations.architecturalInsights && existing.interpretations.architecturalInsights) {
      if (mergeStrategy === 'append') {
        // Deduplicate insights
        const existingInsights = new Set(existing.interpretations.architecturalInsights);
        const newInsights = updates.interpretations.architecturalInsights.filter(
          insight => !existingInsights.has(insight)
        );
        merged.interpretations.architecturalInsights = [
          ...existing.interpretations.architecturalInsights,
          ...newInsights
        ];
      } else {
        merged.interpretations.architecturalInsights = updates.interpretations.architecturalInsights;
      }
    }
    
    if (updates.interpretations.potentialImprovements && existing.interpretations.potentialImprovements) {
      if (mergeStrategy === 'append') {
        // Deduplicate improvements
        const existingImprovements = new Set(existing.interpretations.potentialImprovements);
        const newImprovements = updates.interpretations.potentialImprovements.filter(
          improvement => !existingImprovements.has(improvement)
        );
        merged.interpretations.potentialImprovements = [
          ...existing.interpretations.potentialImprovements,
          ...newImprovements
        ];
      } else {
        merged.interpretations.potentialImprovements = updates.interpretations.potentialImprovements;
      }
    }
    
    // Handle security risks and performance issues
    if (updates.interpretations.securityRisks && existing.interpretations.securityRisks) {
      if (mergeStrategy === 'append') {
        // Deduplicate by type and location
        const existingRiskKeys = new Set(
          existing.interpretations.securityRisks.map(
            risk => `${risk.type}-${risk.location?.filePath || ''}`
          )
        );
        const newRisks = updates.interpretations.securityRisks.filter(
          risk => !existingRiskKeys.has(`${risk.type}-${risk.location?.filePath || ''}`)
        );
        merged.interpretations.securityRisks = [
          ...existing.interpretations.securityRisks,
          ...newRisks
        ];
      } else {
        merged.interpretations.securityRisks = updates.interpretations.securityRisks;
      }
    }
    
    if (updates.interpretations.performanceBottlenecks && existing.interpretations.performanceBottlenecks) {
      if (mergeStrategy === 'append') {
        // Deduplicate by type and location
        const existingBottleneckKeys = new Set(
          existing.interpretations.performanceBottlenecks.map(
            bottleneck => `${bottleneck.type}-${bottleneck.location?.filePath || ''}`
          )
        );
        const newBottlenecks = updates.interpretations.performanceBottlenecks.filter(
          bottleneck => !existingBottleneckKeys.has(`${bottleneck.type}-${bottleneck.location?.filePath || ''}`)
        );
        merged.interpretations.performanceBottlenecks = [
          ...existing.interpretations.performanceBottlenecks,
          ...newBottlenecks
        ];
      } else {
        merged.interpretations.performanceBottlenecks = updates.interpretations.performanceBottlenecks;
      }
    }
    
    // Handle suggested changes
    if (updates.suggestedChanges && existing.suggestedChanges) {
      if (mergeStrategy === 'append') {
        // Deduplicate by ID
        const existingChangeIds = new Set(existing.suggestedChanges.map(change => change.id));
        const newChanges = updates.suggestedChanges.filter(change => !existingChangeIds.has(change.id));
        merged.suggestedChanges = [
          ...existing.suggestedChanges,
          ...newChanges
        ];
      } else {
        merged.suggestedChanges = updates.suggestedChanges;
      }
    }
    
    return merged;
  }

  /**
   * Merge architectural contexts with different strategies
   */
  private mergeArchitecturalContexts(
    existing: ArchitecturalContext,
    updates: ArchitecturalContext,
    mergeStrategy: 'replace' | 'append' | 'merge'
  ): ArchitecturalContext {
    const merged: ArchitecturalContext = {
      ...existing,
      ...updates,
      architecturalTimestamp: updates.architecturalTimestamp || existing.architecturalTimestamp,
      architecturalModel: updates.architecturalModel || existing.architecturalModel,
      architecturalProvider: 'openai'
    };
    
    // Merge architecture
    if (updates.architecture && existing.architecture) {
      merged.architecture = {
        ...existing.architecture,
        ...updates.architecture,
        overview: updates.architecture.overview || existing.architecture.overview
      };
      
      // Merge patterns
      if (updates.architecture.patterns && existing.architecture.patterns) {
        merged.architecture.patterns = {
          ...existing.architecture.patterns,
          ...updates.architecture.patterns
        };
      }
      
      // Merge strengths and weaknesses
      if (updates.architecture.strengths && existing.architecture.strengths) {
        if (mergeStrategy === 'append') {
          // Deduplicate strengths
          const existingStrengths = new Set(existing.architecture.strengths);
          const newStrengths = updates.architecture.strengths.filter(
            strength => !existingStrengths.has(strength)
          );
          merged.architecture.strengths = [
            ...existing.architecture.strengths,
            ...newStrengths
          ];
        } else {
          merged.architecture.strengths = updates.architecture.strengths;
        }
      }
      
      if (updates.architecture.weaknesses && existing.architecture.weaknesses) {
        if (mergeStrategy === 'append') {
          // Deduplicate weaknesses
          const existingWeaknesses = new Set(existing.architecture.weaknesses);
          const newWeaknesses = updates.architecture.weaknesses.filter(
            weakness => !existingWeaknesses.has(weakness)
          );
          merged.architecture.weaknesses = [
            ...existing.architecture.weaknesses,
            ...newWeaknesses
          ];
        } else {
          merged.architecture.weaknesses = updates.architecture.weaknesses;
        }
      }
      
      // Merge recommendations
      if (updates.architecture.recommendations && existing.architecture.recommendations) {
        if (mergeStrategy === 'append') {
          // Deduplicate by ID
          const existingRecommendationIds = new Set(
            existing.architecture.recommendations.map(rec => rec.id)
          );
          const newRecommendations = updates.architecture.recommendations.filter(
            rec => !existingRecommendationIds.has(rec.id)
          );
          merged.architecture.recommendations = [
            ...existing.architecture.recommendations,
            ...newRecommendations
          ];
        } else {
          merged.architecture.recommendations = updates.architecture.recommendations;
        }
      }
    }
    
    // Merge dependencies
    if (updates.dependencies && existing.dependencies) {
      merged.dependencies = {
        ...existing.dependencies,
        ...updates.dependencies
      };
      
      // Merge dependency graph
      if (updates.dependencies.graph && existing.dependencies.graph) {
        merged.dependencies.graph = {
          ...existing.dependencies.graph,
          ...updates.dependencies.graph
        };
      }
      
      // Merge external dependencies
      if (updates.dependencies.external && existing.dependencies.external) {
        merged.dependencies.external = {
          ...existing.dependencies.external,
          ...updates.dependencies.external
        };
      }
      
      // Merge critical dependencies
      if (updates.dependencies.critical && existing.dependencies.critical) {
        if (mergeStrategy === 'append') {
          // Deduplicate critical dependencies
          const existingCritical = new Set(existing.dependencies.critical);
          const newCritical = updates.dependencies.critical.filter(
            dep => !existingCritical.has(dep)
          );
          merged.dependencies.critical = [
            ...existing.dependencies.critical,
            ...newCritical
          ];
        } else {
          merged.dependencies.critical = updates.dependencies.critical;
        }
      }
      
      // Merge circular dependencies
      if (updates.dependencies.circular && existing.dependencies.circular) {
        if (mergeStrategy === 'append') {
          // Convert to string for comparison
          const existingCircular = new Set(
            existing.dependencies.circular.map(cycle => JSON.stringify(cycle))
          );
          const newCircular = updates.dependencies.circular.filter(
            cycle => !existingCircular.has(JSON.stringify(cycle))
          );
          merged.dependencies.circular = [
            ...existing.dependencies.circular,
            ...newCircular
          ];
        } else {
          merged.dependencies.circular = updates.dependencies.circular;
        }
      }
    }
    
    // Merge refactoring proposals
    if (updates.refactorings && existing.refactorings) {
      if (mergeStrategy === 'append') {
        // Deduplicate by ID
        const existingRefactoringIds = new Set(
          existing.refactorings.map(ref => ref.id)
        );
        const newRefactorings = updates.refactorings.filter(
          ref => !existingRefactoringIds.has(ref.id)
        );
        merged.refactorings = [
          ...existing.refactorings,
          ...newRefactorings
        ];
      } else {
        merged.refactorings = updates.refactorings;
      }
    }
    
    return merged;
  }

  /**
   * Merge evolution contexts with different strategies
   */
  private mergeEvolutionContexts(
    existing: EvolutionContext,
    updates: EvolutionContext,
    mergeStrategy: 'replace' | 'append' | 'merge'
  ): EvolutionContext {
    const merged: EvolutionContext = {
      ...existing,
      ...updates,
      currentState: updates.currentState || existing.currentState
    };
    
    // Handle history differently based on strategy
    if (updates.history && existing.history) {
      // For history, we need to deduplicate by ID
      if (mergeStrategy === 'append') {
        const existingIds = new Set(existing.history.map(op => op.id));
        const newOperations = updates.history.filter(op => !existingIds.has(op.id));
        merged.history = [...existing.history, ...newOperations];
      } else {
        merged.history = updates.history;
      }
    }
    
    // Merge plans and steps
    if (updates.evolutionPlan && existing.evolutionPlan) {
      if (mergeStrategy === 'append') {
        // Deduplicate steps
        const existingSteps = new Set(existing.evolutionPlan);
        const newSteps = updates.evolutionPlan.filter(step => !existingSteps.has(step));
        merged.evolutionPlan = [...existing.evolutionPlan, ...newSteps];
      } else {
        merged.evolutionPlan = updates.evolutionPlan;
      }
    }
    
    if (updates.completedSteps && existing.completedSteps) {
      if (mergeStrategy === 'append') {
        // Deduplicate steps
        const existingSteps = new Set(existing.completedSteps);
        const newSteps = updates.completedSteps.filter(step => !existingSteps.has(step));
        merged.completedSteps = [...existing.completedSteps, ...newSteps];
      } else {
        merged.completedSteps = updates.completedSteps;
      }
    }
    
    if (updates.pendingSteps && existing.pendingSteps) {
      if (mergeStrategy === 'append') {
        // Deduplicate steps and remove any that are now in completedSteps
        const existingSteps = new Set(existing.pendingSteps);
        const completedSteps = new Set(merged.completedSteps || []);
        const newSteps = updates.pendingSteps.filter(
          step => !existingSteps.has(step) && !completedSteps.has(step)
        );
        merged.pendingSteps = [
          ...existing.pendingSteps.filter(step => !completedSteps.has(step)),
          ...newSteps
        ];
      } else {
        merged.pendingSteps = updates.pendingSteps;
      }
    }
    
    if (updates.targetComponents && existing.targetComponents) {
      if (mergeStrategy === 'append') {
        // Deduplicate components
        const existingComponents = new Set(existing.targetComponents);
        const newComponents = updates.targetComponents.filter(comp => !existingComponents.has(comp));
        merged.targetComponents = [...existing.targetComponents, ...newComponents];
      } else {
        merged.targetComponents = updates.targetComponents;
      }
    }
    
    return merged;
  }

  /**
   * Delete a shared context
   */
  async deleteContext(id: string): Promise<boolean> {
    if (!this.contexts.has(id)) {
      const contextExists = existsSync(path.join(this.contextDir, `${id}.json`));
      if (!contextExists) {
        this.logger.warn(`Cannot delete context ${id}: not found`);
        return false;
      }
    }
    
    this.contexts.delete(id);
    
    try {
      const contextPath = path.join(this.contextDir, `${id}.json`);
      if (existsSync(contextPath)) {
        await fs.unlink(contextPath);
        this.logger.info(`Deleted context: ${id}`);
      }
      return true;
    } catch (error) {
      this.logger.error(`Error deleting context ${id}`, error);
      return false;
    }
  }

  /**
   * List all shared contexts, optionally filtered by session ID
   */
  async listContexts(sessionId?: string): Promise<SharedContext[]> {
    try {
      const contextFiles = await fs.readdir(this.contextDir);
      const contexts: SharedContext[] = [];
      
      for (const file of contextFiles) {
        if (file.endsWith('.json')) {
          try {
            const contextData = await fs.readFile(path.join(this.contextDir, file), 'utf-8');
            const context = JSON.parse(contextData) as SharedContext;
            
            // Filter by sessionId if provided
            if (!sessionId || context.sessionId === sessionId) {
              contexts.push(context);
              // Update in-memory cache
              this.contexts.set(context.id, context);
            }
          } catch (error) {
            this.logger.error(`Error parsing context file ${file}`, error);
          }
        }
      }
      
      this.logger.debug(`Listed ${contexts.length} contexts${sessionId ? ` for session ${sessionId}` : ''}`);
      return contexts;
    } catch (error) {
      this.logger.error('Error listing contexts', error);
      return Array.from(this.contexts.values()).filter(ctx => !sessionId || ctx.sessionId === sessionId);
    }
  }

  /**
   * Get summaries of all contexts, optionally filtered by session ID
   */
  async getContextSummaries(sessionId?: string): Promise<ContextSummary[]> {
    const contexts = await this.listContexts(sessionId);
    
    return contexts.map(context => {
      // Determine which providers contributed to this context
      const providers: string[] = [];
      if (context.analysisContext?.analysisProvider === 'gemini') {
        providers.push('gemini');
      }
      if (context.reasoningContext?.reasoningProvider === 'claude') {
        providers.push('claude');
      }
      if (context.architecturalContext?.architecturalProvider === 'openai') {
        providers.push('openai');
      }

      return {
        id: context.id,
        sessionId: context.sessionId,
        repository: path.basename(context.repositoryPath),
        createdAt: context.createdAt,
        updatedAt: context.updatedAt,
        hasAnalysis: !!context.analysisContext,
        hasReasoning: !!context.reasoningContext,
        hasArchitectural: !!context.architecturalContext,
        hasEvolution: !!context.evolutionContext,
        operationCount: context.evolutionContext?.history.length || 0,
        componentsAnalyzed: context.analysisContext?.analysisResult?.components?.length || 0,
        providers
      };
    });
  }

  /**
   * Find the most recent context for a repository
   */
  async findContextForRepository(repositoryPath: string): Promise<SharedContext | null> {
    try {
      const contexts = await this.listContexts();
      
      // Filter by repository path and sort by updated time (most recent first)
      const repoContexts = contexts
        .filter(ctx => ctx.repositoryPath === repositoryPath)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      if (repoContexts.length > 0) {
        this.logger.debug(`Found existing context ${repoContexts[0].id} for repository ${repositoryPath}`);
        return repoContexts[0];
      }
      
      this.logger.debug(`No existing context found for repository ${repositoryPath}`);
      return null;
    } catch (error) {
      this.logger.error(`Error finding context for repository ${repositoryPath}`, error);
      return null;
    }
  }

  /**
   * Create a lightweight context by extracting only the most relevant information from a full context
   * Useful for keeping context size manageable for model calls
   */
  async createLightweightContext(id: string, targetProvider?: Provider): Promise<SharedContext | null> {
    const context = await this.getContext(id);
    if (!context) {
      this.logger.warn(`Cannot create lightweight context: ${id} not found`);
      return null;
    }
    
    const lightweight: SharedContext = {
      id,
      sessionId: context.sessionId,
      repositoryPath: context.repositoryPath,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt
    };
    
    // Include only the most relevant analysis information
    if (context.analysisContext && (!targetProvider || targetProvider === 'gemini')) {
      lightweight.analysisContext = {
        analysisTimestamp: context.analysisContext.analysisTimestamp,
        analysisModel: context.analysisContext.analysisModel,
        analysisProvider: 'gemini',
        analysisType: context.analysisContext.analysisType,
        // Extract just essential parts of the analysis result
        analysisResult: context.analysisContext.analysisResult ? {
          architecture: context.analysisContext.analysisResult.architecture,
          components: context.analysisContext.analysisResult.components?.slice(0, 20),
          patterns: context.analysisContext.analysisResult.patterns?.slice(0, 10),
          // Include most critical issues
          securityIssues: context.analysisContext.analysisResult.securityIssues?.filter(
            issue => issue.severity === 'critical' || issue.severity === 'high'
          )?.slice(0, 5),
          performanceIssues: context.analysisContext.analysisResult.performanceIssues?.filter(
            issue => issue.impact === 'high'
          )?.slice(0, 5)
        } : undefined
      };
    }
    
    // Include only the most relevant reasoning information
    if (context.reasoningContext && (!targetProvider || targetProvider === 'claude')) {
      lightweight.reasoningContext = {
        reasoningTimestamp: context.reasoningContext.reasoningTimestamp,
        reasoningModel: context.reasoningContext.reasoningModel,
        reasoningProvider: 'claude',
        interpretations: {
          componentRoles: context.reasoningContext.interpretations.componentRoles,
          architecturalInsights: context.reasoningContext.interpretations.architecturalInsights?.slice(0, 5),
          potentialImprovements: context.reasoningContext.interpretations.potentialImprovements?.slice(0, 5),
          securityRisks: context.reasoningContext.interpretations.securityRisks?.filter(
            risk => risk.severity === 'critical' || risk.severity === 'high'
          )?.slice(0, 3),
          performanceBottlenecks: context.reasoningContext.interpretations.performanceBottlenecks?.filter(
            bottleneck => bottleneck.impact === 'high'
          )?.slice(0, 3)
        },
        suggestedChanges: context.reasoningContext.suggestedChanges?.slice(0, 5)
      };
    }
    
    // Include only the most relevant architectural information
    if (context.architecturalContext && (!targetProvider || targetProvider === 'openai')) {
      lightweight.architecturalContext = {
        architecturalTimestamp: context.architecturalContext.architecturalTimestamp,
        architecturalModel: context.architecturalContext.architecturalModel,
        architecturalProvider: 'openai',
        architecture: {
          overview: context.architecturalContext.architecture?.overview,
          patterns: context.architecturalContext.architecture?.patterns,
          strengths: context.architecturalContext.architecture?.strengths?.slice(0, 3),
          weaknesses: context.architecturalContext.architecture?.weaknesses?.slice(0, 3),
          recommendations: context.architecturalContext.architecture?.recommendations?.slice(0, 3)
        },
        dependencies: {
          critical: context.architecturalContext.dependencies?.critical?.slice(0, 5),
          circular: context.architecturalContext.dependencies?.circular?.slice(0, 3)
        },
        refactorings: context.architecturalContext.refactorings?.slice(0, 3)
      };
    }
    
    // Include evolution context regardless of provider
    if (context.evolutionContext) {
      lightweight.evolutionContext = {
        history: context.evolutionContext.history.slice(-3), // Only most recent operations
        currentState: context.evolutionContext.currentState,
        evolutionPlan: context.evolutionContext.evolutionPlan?.slice(0, 5),
        completedSteps: context.evolutionContext.completedSteps?.slice(0, 5),
        pendingSteps: context.evolutionContext.pendingSteps?.slice(0, 5),
        targetComponents: context.evolutionContext.targetComponents?.slice(0, 5)
      };
    }
    
    return lightweight;
  }

  /**
   * Clean up old contexts based on maxContextAge
   */
  async cleanupOldContexts(): Promise<number> {
    try {
      const contexts = await this.listContexts();
      const now = new Date();
      let cleanupCount = 0;
      
      for (const context of contexts) {
        const updatedAt = new Date(context.updatedAt);
        const ageHours = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > this.maxContextAge) {
          await this.deleteContext(context.id);
          cleanupCount++;
        }
      }
      
      if (cleanupCount > 0) {
        this.logger.info(`Cleaned up ${cleanupCount} old contexts`);
      }
      
      return cleanupCount;
    } catch (error) {
      this.logger.error('Error cleaning up old contexts', error);
      return 0;
    }
  }

  /**
   * Combine contexts from different providers into a single context
   * Useful for creating a unified context from specialized analyses
   */
  async combineContexts(
    contextIds: string[],
    options: {
      sessionId?: string;
      repositoryPath?: string;
    } = {}
  ): Promise<SharedContext | null> {
    if (contextIds.length === 0) {
      this.logger.warn('Cannot combine contexts: no context IDs provided');
      return null;
    }
    
    // Load all contexts
    const contexts: SharedContext[] = [];
    for (const id of contextIds) {
      const context = await this.getContext(id);
      if (context) {
        contexts.push(context);
      } else {
        this.logger.warn(`Context ${id} not found, skipping`);
      }
    }
    
    if (contexts.length === 0) {
      this.logger.warn('Cannot combine contexts: no valid contexts found');
      return null;
    }
    
    // Create a new context
    const sessionId = options.sessionId || contexts[0].sessionId;
    const repositoryPath = options.repositoryPath || contexts[0].repositoryPath;
    const combinedContext = await this.createContext(sessionId, repositoryPath);
    
    // Combine analysis contexts from Gemini
    const analysisContext = contexts.find(ctx => ctx.analysisContext)?.analysisContext;
    if (analysisContext) {
      combinedContext.analysisContext = { ...analysisContext };
    }
    
    // Combine reasoning contexts from Claude
    const reasoningContext = contexts.find(ctx => ctx.reasoningContext)?.reasoningContext;
    if (reasoningContext) {
      combinedContext.reasoningContext = { ...reasoningContext };
    }
    
    // Combine architectural contexts from OpenAI
    const architecturalContext = contexts.find(ctx => ctx.architecturalContext)?.architecturalContext;
    if (architecturalContext) {
      combinedContext.architecturalContext = { ...architecturalContext };
    }
    
    // Combine evolution contexts
    const evolutionContexts = contexts.filter(ctx => ctx.evolutionContext).map(ctx => ctx.evolutionContext!);
    if (evolutionContexts.length > 0) {
      combinedContext.evolutionContext = {
        history: [],
        currentState: evolutionContexts[evolutionContexts.length - 1].currentState
      };
      
      // Combine evolution history
      for (const evCtx of evolutionContexts) {
        if (evCtx.history) {
          const existingIds = new Set(combinedContext.evolutionContext.history.map(op => op.id));
          combinedContext.evolutionContext.history.push(
            ...evCtx.history.filter(op => !existingIds.has(op.id))
          );
        }
      }
      
      // Take latest evolution plan, completed steps, and pending steps
      const latestEvCtx = evolutionContexts[evolutionContexts.length - 1];
      if (latestEvCtx.evolutionPlan) {
        combinedContext.evolutionContext.evolutionPlan = latestEvCtx.evolutionPlan;
      }
      if (latestEvCtx.completedSteps) {
        combinedContext.evolutionContext.completedSteps = latestEvCtx.completedSteps;
      }
      if (latestEvCtx.pendingSteps) {
        combinedContext.evolutionContext.pendingSteps = latestEvCtx.pendingSteps;
      }
      if (latestEvCtx.targetComponents) {
        combinedContext.evolutionContext.targetComponents = latestEvCtx.targetComponents;
      }
    }
    
    // Save the combined context
    await this.persistContext(combinedContext.id);
    
    return combinedContext;
  }

  /**
   * Persist a shared context to disk
   */
  private async persistContext(id: string): Promise<void> {
    const context = this.contexts.get(id);
    if (!context) {
      throw new ContextError(`Context ${id} not found in memory cache`, id);
    }
    
    try {
      await this.ensureContextDir();
      const contextPath = path.join(this.contextDir, `${id}.json`);
      await fs.writeFile(contextPath, JSON.stringify(context, null, 2), 'utf-8');
      this.logger.debug(`Persisted context ${id} to disk`);
    } catch (error) {
      this.logger.error(`Error persisting context ${id}`, error);
      throw new ContextError(`Error persisting context ${id}`, id, error);
    }
  }
}

// Singleton instance for global access
let contextManagerInstance: ContextManager | null = null;

/**
 * Get the global context manager instance
 */
export function getContextManager(options: ContextManagerOptions = {}): ContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ContextManager(options);
  }
  return contextManagerInstance;
}
