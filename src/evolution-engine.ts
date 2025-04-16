/**
 * Evolution Engine
 * 
 * Orchestrates code evolution operations using Gemini for analysis
 * and Claude for reasoning and transformation planning.
 */

import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { 
  SharedContext,
  EvolutionRequest,
  EvolutionResponse,
  EvolutionOperation,
  EvolutionType,
  EvolutionDetails,
  RefactorDetails,
  ImprovementDetails,
  TransformationDetails,
  TestGenerationDetails,
  DocumentationDetails,
  Change
} from './bridge-types.js';

import { Logger } from './types.js';
import { ContextManager } from './context-manager.js';
import { callClaude, callClaudeForReasoning } from './claude-api.js';
import { analyzeRepository } from './repository-analysis.js';
import { packageRepository } from './repository-packaging.js';
import { createSecureTempDir, cleanupTempFiles } from './utils.js';

// Evolution prompts
const EVOLUTION_PROMPTS: Record<EvolutionType, string> = {
  refactor: `You are a software architecture expert specializing in code refactoring.
Analyze the provided code and propose a comprehensive refactoring plan that:
1. Identifies code smells and architectural weaknesses
2. Recommends specific design patterns to apply
3. Provides precise file-by-file changes with clear before/after examples
4. Prioritizes maintainability, readability, and adherence to best practices

Focus on high-impact changes that will significantly improve the codebase without changing its external behavior.`,

  improve: `You are a software optimization expert specializing in performance, security, and reliability improvements.
Analyze the provided code and propose a comprehensive improvement plan that:
1. Identifies performance bottlenecks, security vulnerabilities, or reliability issues
2. Recommends specific techniques to address each issue
3. Provides precise file-by-file changes with clear before/after examples
4. Prioritizes measurable improvements in efficiency, security, or reliability

Focus on high-impact changes that will significantly improve the {{aspect}} of the codebase.`,

  transform: `You are a software architecture expert specializing in codebase transformations.
Analyze the provided code and propose a comprehensive transformation plan that:
1. Maps the current architecture to the target architecture
2. Outlines a step-by-step migration strategy
3. Identifies key structural changes needed
4. Provides precise file-by-file changes with before/after examples

Focus on maintaining functionality while transforming the codebase to the new architecture.`,

  test: `You are a test engineering expert specializing in comprehensive test coverage.
Analyze the provided code and propose a comprehensive test generation plan that:
1. Identifies untested or under-tested components
2. Recommends appropriate test strategies for each component
3. Provides example test cases with clear setup, execution, and assertions
4. Balances unit, integration, and end-to-end tests appropriately

Focus on achieving high test coverage while maintaining test readability and maintainability.`,

  document: `You are a technical documentation expert specializing in software documentation.
Analyze the provided code and propose a comprehensive documentation plan that:
1. Identifies components requiring documentation
2. Recommends appropriate documentation formats (API docs, architecture overviews, etc.)
3. Provides example documentation with clear explanations and examples
4. Balances detail with readability

Focus on creating documentation that helps developers understand and maintain the codebase.`
};

/**
 * Options for the Evolution Engine
 */
export interface EvolutionEngineOptions {
  contextManager: ContextManager;
  logger?: Logger;
}

/**
 * Manages code evolution operations
 */
export class EvolutionEngine {
  private contextManager: ContextManager;
  private logger: Logger;

  /**
   * Create a new evolution engine
   */
  constructor(options: EvolutionEngineOptions) {
    this.contextManager = options.contextManager;
    this.logger = options.logger || console;
  }

  /**
   * Execute an evolution operation
   */
  async execute(request: EvolutionRequest & { context: SharedContext }): Promise<EvolutionResponse> {
    const { query, evolutionType, directory, context } = request;
    
    this.logger.info(`Starting ${evolutionType} operation for ${directory}`);
    
    // Create a unique operation ID
    const operationId = uuidv4();
    
    try {
      // Step 1: Package the repository if not already done
      const { packagedCode, repoStructure } = await this.getOrCreatePackagedCode(directory, context);
      
      // Step 2: Analyze repository if not already done
      const analysisResult = await this.getOrPerformAnalysis(
        directory, 
        packagedCode, 
        context, 
        request.analysisType
      );
      
      // Step 3: Get Claude reasoning about the code
      const reasoningResult = await this.getOrPerformReasoning(
        analysisResult, 
        query, 
        context, 
        request.claudeModel
      );
      
      // Step 4: Generate evolution plan
      const evolutionPlan = await this.generateEvolutionPlan(
        evolutionType,
        query,
        packagedCode,
        analysisResult,
        reasoningResult,
        request
      );
      
      // Step 5: Create evolution operation
      const evolutionOperation = await this.createEvolutionOperation(
        operationId,
        evolutionType,
        query,
        evolutionPlan,
        request
      );
      
      // Step 6: Generate detailed explanation
      const explanation = await this.generateExplanation(
        evolutionOperation,
        analysisResult,
        reasoningResult,
        request.claudeModel
      );
      
      // Return the evolution response
      return {
        id: operationId,
        evolutionOperation,
        explanation,
        recommendations: this.generateRecommendations(evolutionOperation, evolutionType)
      };
    } catch (error) {
      this.logger.error(`Error executing ${evolutionType} operation:`, error);
      throw error;
    }
  }

  /**
   * Get packaged code from context or create new packaging
   */
  private async getOrCreatePackagedCode(
    directory: string,
    context: SharedContext
  ): Promise<{ packagedCode: string; repoStructure: string }> {
    // Check if we already have analysis with packaged code
    if (context.analysisContext?.packagedCode && context.analysisContext?.repositoryStructure) {
      this.logger.info('Using existing packaged code from context');
      return {
        packagedCode: context.analysisContext.packagedCode,
        repoStructure: context.analysisContext.repositoryStructure
      };
    }
    
    // Create temporary file for packaging
    const { tempDir, tempFile } = createSecureTempDir('evolve-package-');
    
    try {
      // Package the repository
      this.logger.info(`Packaging repository: ${directory}`);
      const packResult = await packageRepository(directory, {
        outputFile: tempFile,
        logger: this.logger
      });
      
      // Read the packaged code
      const packagedCode = await fs.readFile(packResult.packagePath, 'utf-8');
      
      // Get repository structure
      const repoStructure = packResult.structure || '';
      
      return { packagedCode, repoStructure };
    } finally {
      // Clean up temporary files
      await cleanupTempFiles(tempFile, tempDir, this.logger);
    }
  }

  /**
   * Get analysis from context or perform new analysis
   */
  private async getOrPerformAnalysis(
    directory: string,
    packagedCode: string,
    context: SharedContext,
    analysisType?: string
  ): Promise<any> {
    // Check if we already have analysis in the context
    if (context.analysisContext?.analysisResult) {
      this.logger.info('Using existing analysis from context');
      return context.analysisContext.analysisResult;
    }
    
    // Create temporary file for analysis
    const { tempDir, tempFile } = createSecureTempDir('evolve-analysis-');
    
    try {
      // Write packaged code to temporary file
      await fs.writeFile(tempFile, packagedCode, 'utf-8');
      
      // Analyze the repository
      this.logger.info(`Analyzing repository: ${directory}`);
      const analysisResults = await analyzeRepository(directory, tempFile, {
        analysisType: analysisType || 'comprehensive',
        analysisDepth: 'comprehensive',
        logger: this.logger
      });
      
      // Update the context with the new analysis
      await this.contextManager.updateContext(
        context.id,
        {
          analysisContext: {
            analysisResult: analysisResults,
            analysisTimestamp: new Date().toISOString(),
            analysisModel: 'internal',
            analysisType: analysisType || 'comprehensive',
            packagedCode,
            repositoryStructure: analysisResults.structure || ''
          }
        },
        {
          updateAnalysis: true,
          mergeStrategy: 'replace'
        }
      );
      
      return analysisResults;
    } finally {
      // Clean up temporary files
      await cleanupTempFiles(tempFile, tempDir, this.logger);
    }
  }

  /**
   * Get reasoning from context or perform new reasoning
   */
  private async getOrPerformReasoning(
    analysisResult: any,
    query: string,
    context: SharedContext,
    claudeModel?: string
  ): Promise<any> {
    // Check if we already have reasoning in the context
    if (context.reasoningContext) {
      this.logger.info('Using existing reasoning from context');
      return context.reasoningContext;
    }
    
    // Perform reasoning with Claude
    this.logger.info('Generating reasoning with Claude');
    const reasoningResult = await callClaudeForReasoning(analysisResult, query, {
      model: claudeModel,
      logger: this.logger
    });
    
    // Update the context with the new reasoning
    await this.contextManager.updateContext(
      context.id,
      {
        reasoningContext: {
          ...reasoningResult,
          reasoningTimestamp: new Date().toISOString(),
          reasoningModel: claudeModel || 'claude-3-opus-20240229'
        }
      },
      {
        updateReasoning: true,
        mergeStrategy: 'replace'
      }
    );
    
    return reasoningResult;
  }

  /**
   * Generate an evolution plan based on the type of evolution
   */
  private async generateEvolutionPlan(
    evolutionType: EvolutionType,
    query: string,
    packagedCode: string,
    analysisResult: any,
    reasoningResult: any,
    request: EvolutionRequest
  ): Promise<any> {
    // Get the appropriate prompt for the evolution type
    let prompt = EVOLUTION_PROMPTS[evolutionType];
    
    // Customize the prompt based on evolution type
    if (evolutionType === 'improve' && request.codeSpecification) {
      const aspect = request.codeSpecification.toLowerCase().includes('security') ? 'security' :
                     request.codeSpecification.toLowerCase().includes('performance') ? 'performance' :
                     'quality';
      prompt = prompt.replace('{{aspect}}', aspect);
    } else if (evolutionType === 'transform' && request.codeSpecification) {
      prompt += `\n\nTarget architecture: ${request.codeSpecification}`;
    }
    
    // Build the context for Claude
    const analysisJson = JSON.stringify(analysisResult, null, 2);
    const reasoningJson = JSON.stringify(reasoningResult, null, 2);
    
    // Create the evolution plan message
    const messages = [
      {
        role: 'user' as const,
        content: `# Evolution Request: ${query}

## Repository Analysis
\`\`\`json
${analysisJson}
\`\`\`

## Reasoning Results
\`\`\`json
${reasoningJson}
\`\`\`

## Target Files
${request.filesToModify ? request.filesToModify.join(', ') : 'All relevant files'}

## Target Component
${request.targetComponent || 'No specific component, analyze the entire codebase'}

Based on the analysis and reasoning above, generate a detailed ${evolutionType} plan. 
Return your plan as a JSON object with the following structure based on the evolution type:

${this.getJsonStructureExample(evolutionType)}

Make sure all file paths are accurate and reference files that actually exist in the codebase.
Provide specific code changes with "before" and "after" snippets when appropriate.`
      }
    ];
    
    // Call Claude to generate the evolution plan
    this.logger.info(`Generating ${evolutionType} plan with Claude`);
    const response = await callClaude(messages, {
      model: request.claudeModel,
      systemPrompt: prompt,
      logger: this.logger
    });
    
    // Extract JSON from the response
    try {
      const jsonMatch = response.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try finding any JSON-like structure
      const blockMatch = response.match(/{[\s\S]*}/);
      if (blockMatch) {
        return JSON.parse(blockMatch[0]);
      }
      
      // If no JSON found, return the raw response
      return { raw: response };
    } catch (error) {
      this.logger.warn('Failed to parse JSON from evolution plan response', error);
      return { raw: response };
    }
  }

  /**
   * Create an evolution operation from the plan
   */
  private async createEvolutionOperation(
    id: string,
    evolutionType: EvolutionType,
    query: string,
    evolutionPlan: any,
    request: EvolutionRequest
  ): Promise<EvolutionOperation> {
    const now = new Date().toISOString();
    
    // Create operation details based on evolution type
    const details = this.createEvolutionDetails(evolutionType, evolutionPlan);
    
    // Create the evolution operation
    const operation: EvolutionOperation = {
      id,
      type: evolutionType,
      status: 'proposed',
      query,
      targetComponent: request.targetComponent,
      contextFiles: request.contextFiles,
      filesToModify: request.filesToModify,
      createdAt: now,
      details
    };
    
    // Update the context with the new operation
    await this.contextManager.updateContext(
      request.context.id,
      {
        evolutionContext: {
          history: [operation],
          currentState: 'proposed',
          targetComponents: request.targetComponent ? [request.targetComponent] : undefined
        }
      },
      {
        updateEvolution: true,
        mergeStrategy: 'append'
      }
    );
    
    return operation;
  }

  /**
   * Create evolution details based on the type
   */
  private createEvolutionDetails(
    evolutionType: EvolutionType,
    evolutionPlan: any
  ): EvolutionDetails {
    switch (evolutionType) {
      case 'refactor':
        return {
          goal: evolutionPlan.goal || 'Improve code quality and maintainability',
          strategy: evolutionPlan.strategy || 'Apply design patterns and best practices',
          codeSmellsAddressed: evolutionPlan.codeSmellsAddressed || [],
          patternsApplied: evolutionPlan.patternsApplied || [],
          changes: this.normalizeChanges(evolutionPlan.changes || [])
        } as RefactorDetails;
        
      case 'improve':
        return {
          goal: evolutionPlan.goal || 'Enhance performance, security, or reliability',
          improvedAspect: evolutionPlan.improvedAspect || 'performance',
          measurableMetrics: evolutionPlan.measurableMetrics || [],
          changes: this.normalizeChanges(evolutionPlan.changes || [])
        } as ImprovementDetails;
        
      case 'transform':
        return {
          goal: evolutionPlan.goal || 'Transform the codebase architecture',
          fromArchitecture: evolutionPlan.fromArchitecture,
          toArchitecture: evolutionPlan.toArchitecture,
          transformationSteps: evolutionPlan.transformationSteps || [],
          changes: this.normalizeChanges(evolutionPlan.changes || [])
        } as TransformationDetails;
        
      case 'test':
        return {
          goal: evolutionPlan.goal || 'Improve test coverage and quality',
          testFramework: evolutionPlan.testFramework || 'jest',
          coverageTargets: evolutionPlan.coverageTargets || [],
          testTypes: evolutionPlan.testTypes || ['unit'],
          generatedTests: evolutionPlan.generatedTests || []
        } as TestGenerationDetails;
        
      case 'document':
        return {
          goal: evolutionPlan.goal || 'Improve documentation coverage and quality',
          documentationType: evolutionPlan.documentationType || 'api',
          generatedDocs: evolutionPlan.generatedDocs || []
        } as DocumentationDetails;
        
      default:
        throw new Error(`Unknown evolution type: ${evolutionType}`);
    }
  }

  /**
   * Normalize changes to ensure they have all required fields
   */
  private normalizeChanges(changes: any[]): Change[] {
    return changes.map((change, index) => ({
      id: change.id || `change-${index + 1}`,
      type: change.type || 'update',
      filePath: change.filePath || '',
      description: change.description || '',
      before: change.before,
      after: change.after,
      codeLocations: change.codeLocations,
      impacts: change.impacts
    }));
  }

  /**
   * Generate an explanation for the evolution operation
   */
  private async generateExplanation(
    operation: EvolutionOperation,
    analysisResult: any,
    reasoningResult: any,
    claudeModel?: string
  ): Promise<string> {
    // Create a prompt for Claude to explain the evolution
    const messages = [
      {
        role: 'user' as const,
        content: `# Evolution Operation

## Operation Type
${operation.type}

## Query
${operation.query}

## Details
\`\`\`json
${JSON.stringify(operation.details, null, 2)}
\`\`\`

Please provide a clear, concise explanation of this ${operation.type} operation. 
Explain the reasoning behind the suggested changes, the expected benefits, and any potential challenges in implementation.
Keep your response between 300-500 words and focus on making the explanation accessible to developers.`
      }
    ];
    
    // Call Claude to generate the explanation
    this.logger.info('Generating explanation with Claude');
    const response = await callClaude(messages, {
      model: claudeModel,
      logger: this.logger
    });
    
    return response;
  }

  /**
   * Generate recommendations based on the evolution operation
   */
  private generateRecommendations(
    operation: EvolutionOperation,
    evolutionType: EvolutionType
  ): string[] {
    const recommendations: string[] = [];
    
    // Add operation-specific recommendations
    switch (evolutionType) {
      case 'refactor':
        const refactorDetails = operation.details as RefactorDetails;
        if (refactorDetails.changes.length > 5) {
          recommendations.push('Consider breaking this refactoring into smaller, incremental changes to reduce risk.');
        }
        if (refactorDetails.patternsApplied && refactorDetails.patternsApplied.length > 0) {
          recommendations.push(`Review the application of the ${refactorDetails.patternsApplied.join(', ')} pattern(s) to ensure they fit your project's specific needs.`);
        }
        break;
        
      case 'improve':
        const improveDetails = operation.details as ImprovementDetails;
        recommendations.push(`Measure ${improveDetails.improvedAspect} metrics before and after implementing changes to quantify improvements.`);
        if (improveDetails.improvedAspect === 'security') {
          recommendations.push('Consider a security audit or penetration testing after implementing these changes.');
        } else if (improveDetails.improvedAspect === 'performance') {
          recommendations.push('Profile the application under realistic load conditions to validate performance improvements.');
        }
        break;
        
      case 'transform':
        const transformDetails = operation.details as TransformationDetails;
        recommendations.push('Implement the architectural transformation in stages, validating each step before proceeding.');
        recommendations.push('Create a comprehensive test suite before beginning the transformation to catch regressions.');
        break;
        
      case 'test':
        const testDetails = operation.details as TestGenerationDetails;
        recommendations.push('Set up continuous integration to run tests automatically on code changes.');
        recommendations.push(`Consider code coverage tools to track progress toward your ${testDetails.coverageTargets ? testDetails.coverageTargets.join(', ') : 'coverage'} targets.`);
        break;
        
      case 'document':
        recommendations.push('Establish documentation standards for the team to ensure consistency.');
        recommendations.push('Consider documentation generation tools to automate updates as the codebase evolves.');
        break;
    }
    
    // Add general recommendations
    recommendations.push('Create a dedicated branch for implementing these changes to isolate their impact.');
    recommendations.push('Review changes with team members to gather feedback and share knowledge.');
    
    return recommendations;
  }

  /**
   * Get JSON structure example for evolution plans
   */
  private getJsonStructureExample(evolutionType: EvolutionType): string {
    switch (evolutionType) {
      case 'refactor':
        return `{
  "goal": "A clear statement of the refactoring goal",
  "strategy": "Overall strategy for the refactoring",
  "codeSmellsAddressed": ["Duplicate Code", "Long Method", "God Class"],
  "patternsApplied": ["Factory", "Strategy", "Observer"],
  "changes": [
    {
      "id": "change-1",
      "type": "update",
      "filePath": "src/example.ts",
      "description": "Extract method to improve readability",
      "before": "// Code before change",
      "after": "// Code after change",
      "codeLocations": [{"filePath": "src/example.ts", "startLine": 10, "endLine": 20}],
      "impacts": {
        "components": ["Authentication"],
        "files": ["src/auth.ts"],
        "description": "Impact on other components"
      }
    }
  ]
}`;
      
      case 'improve':
        return `{
  "goal": "A clear statement of the improvement goal",
  "improvedAspect": "performance", // or "security" or "reliability"
  "measurableMetrics": ["Response time", "Memory usage"],
  "changes": [
    {
      "id": "change-1",
      "type": "update",
      "filePath": "src/example.ts",
      "description": "Optimize database query",
      "before": "// Inefficient code",
      "after": "// Optimized code",
      "impacts": {
        "components": ["Database"],
        "files": ["src/db.ts"],
        "description": "Impact on performance"
      }
    }
  ]
}`;
      
      case 'transform':
        return `{
  "goal": "A clear statement of the transformation goal",
  "fromArchitecture": "Monolithic",
  "toArchitecture": "Microservices",
  "transformationSteps": [
    "Identify service boundaries",
    "Extract shared libraries",
    "Create separate repositories"
  ],
  "changes": [
    {
      "id": "change-1",
      "type": "create",
      "filePath": "services/auth/index.ts",
      "description": "Create authentication service",
      "after": "// New service code",
      "impacts": {
        "components": ["Authentication"],
        "files": ["src/auth.ts"],
        "description": "Impact on architecture"
      }
    }
  ]
}`;
      
      case 'test':
        return `{
  "goal": "A clear statement of the test generation goal",
  "testFramework": "jest",
  "coverageTargets": ["80% line coverage", "70% branch coverage"],
  "testTypes": ["unit", "integration"],
  "generatedTests": [
    {
      "filePath": "tests/auth.test.ts",
      "description": "Tests for authentication module",
      "content": "// Test code"
    }
  ]
}`;
      
      case 'document':
        return `{
  "goal": "A clear statement of the documentation goal",
  "documentationType": "api", // or "architecture", "component", "usage"
  "generatedDocs": [
    {
      "filePath": "docs/api.md",
      "description": "API documentation",
      "content": "# API Documentation"
    }
  ]
}`;
      
      default:
        return '{}';
    }
  }
}
