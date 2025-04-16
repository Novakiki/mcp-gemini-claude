/**
 * Bridge Types - Shared type definitions for Multi-Model Bridge
 * 
 * These types enable bidirectional communication and context sharing between
 * Claude, Gemini, and OpenAI models for collaborative code analysis and evolution.
 */

import { AnalysisType, OutputFormat } from './types.js';

// === Shared Context Types ===

/**
 * Shared context between models
 */
export interface SharedContext {
  id: string;                    // Unique identifier for this context
  sessionId: string;             // Session identifier for grouping related contexts
  repositoryPath: string;        // Path to the repository being analyzed
  createdAt: string;             // ISO timestamp of creation
  updatedAt: string;             // ISO timestamp of last update
  
  // Gemini analysis context
  analysisContext?: AnalysisContext;
  
  // Claude reasoning context
  reasoningContext?: ReasoningContext;
  
  // OpenAI architectural context
  architecturalContext?: ArchitecturalContext;
  
  // Evolution context
  evolutionContext?: EvolutionContext;
}

/**
 * Analysis context from Gemini
 */
export interface AnalysisContext {
  analysisResult: any;            // Repository analysis results
  analysisTimestamp: string;      // When the analysis was performed
  analysisModel: string;          // Which model performed the analysis
  analysisProvider: 'gemini';     // Provider of the analysis
  analysisType?: AnalysisType;    // Type of analysis performed
  analysisPrompt?: string;        // Prompt used for analysis
  packagedCode?: string;          // Reference to packaged code used for analysis
  repositoryStructure?: string;   // Structure of the repository
}

/**
 * Reasoning context from Claude
 */
export interface ReasoningContext {
  interpretations: {
    componentRoles?: Record<string, string>;       // Understanding of component purposes
    architecturalInsights?: string[];              // Insights about the architecture
    potentialImprovements?: string[];              // Suggested improvements
    codePatterns?: Record<string, string[]>;       // Detected code patterns
    securityRisks?: SecurityRisk[];                // Identified security risks
    performanceBottlenecks?: PerformanceIssue[];   // Identified performance issues
  };
  suggestedChanges?: Change[];                     // Suggested code changes
  reasoningTimestamp: string;                      // When the reasoning was performed
  reasoningModel: string;                          // Which model performed the reasoning
  reasoningProvider: 'claude';                     // Provider of the reasoning
  reasoningPrompt?: string;                        // Prompt used for reasoning
}

/**
 * Architectural context from OpenAI
 */
export interface ArchitecturalContext {
  architecture: {
    overview?: string;                            // Overall architectural description
    patterns?: Record<string, string>;            // Architectural patterns identified
    strengths?: string[];                         // Architecture strengths
    weaknesses?: string[];                        // Architecture weaknesses
    recommendations?: ArchitecturalRecommendation[]; // Recommendations for improvement
  };
  dependencies: {
    graph?: Record<string, string[]>;             // Dependency graph
    critical?: string[];                          // Critical dependencies
    circular?: string[][];                        // Circular dependency chains
    external?: Record<string, string[]>;          // External dependencies
  };
  refactorings?: RefactoringProposal[];           // Proposed refactorings
  architecturalTimestamp: string;                 // When the architectural analysis was performed
  architecturalModel: string;                     // Which model performed the analysis
  architecturalProvider: 'openai';                // Provider of the analysis
  architecturalPrompt?: string;                   // Prompt used for analysis
}

/**
 * Evolution context for tracking code changes
 */
export interface EvolutionContext {
  history: EvolutionOperation[];         // History of evolution operations
  currentState: string;                  // Current state of evolution
  evolutionPlan?: string[];              // Plan for evolution steps
  completedSteps?: string[];             // Completed evolution steps
  pendingSteps?: string[];               // Pending evolution steps
  targetComponents?: string[];           // Components targeted for evolution
}

/**
 * Options for updating the shared context
 */
export interface ContextUpdateOptions {
  updateAnalysis?: boolean;               // Whether to update analysis context
  updateReasoning?: boolean;              // Whether to update reasoning context
  updateArchitectural?: boolean;          // Whether to update architectural context
  updateEvolution?: boolean;              // Whether to update evolution context
  mergeStrategy?: 'replace' | 'append' | 'merge';  // How to merge updates
}

/**
 * Architectural recommendation from OpenAI
 */
export interface ArchitecturalRecommendation {
  id: string;                           // Unique identifier
  title: string;                        // Title of the recommendation
  description: string;                  // Detailed description
  impact: 'low' | 'medium' | 'high';    // Impact of implementing the recommendation
  effort: 'low' | 'medium' | 'high';    // Effort required to implement
  components: string[];                 // Components affected
  implementation?: string;              // Implementation guidelines
}

/**
 * Refactoring proposal from OpenAI
 */
export interface RefactoringProposal {
  id: string;                           // Unique identifier
  title: string;                        // Title of the proposal
  description: string;                  // Detailed description
  target: string;                       // Target component or area
  benefits: string[];                   // Benefits of the refactoring
  risks: string[];                      // Potential risks
  effort: 'low' | 'medium' | 'high';    // Effort required to implement
  changes: Change[];                    // Proposed changes
  code?: {
    before: string;                     // Code before refactoring
    after: string;                      // Code after refactoring
  };
}

// === Claude API Types ===

/**
 * Claude model configuration
 */
export interface ClaudeModelConfig {
  id: string;                    // Model identifier for API calls
  displayName: string;           // Human-readable name for logs and messages
  maxInputTokens: number;        // Maximum tokens for input
  maxOutputTokens: number;       // Maximum tokens for response generation
  description: string;           // Brief description of the model's capabilities
  defaultTemp: number;           // Default temperature value
}

/**
 * Options for calling the Claude API
 */
export interface ClaudeOptions {
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for response generation
  model?: string;                // Claude model to use
  systemPrompt?: string;         // System prompt for Claude
  logger?: any;                  // Logger for API calls
}

/**
 * Claude API request structure
 */
export interface ClaudeRequest {
  model: string;                 // Model identifier
  messages: ClaudeMessage[];     // Messages for the conversation
  system?: string;               // System prompt
  max_tokens?: number;           // Maximum tokens for response
  temperature?: number;          // Temperature for response generation
  top_p?: number;                // Top-p sampling parameter
  top_k?: number;                // Top-k sampling parameter
  stop_sequences?: string[];     // Sequences that will stop generation
}

/**
 * Claude message format
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';    // Role of the message sender
  content: string | ClaudeContent[];  // Content of the message
}

/**
 * Claude content format
 */
export type ClaudeContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string }};

/**
 * Claude API response structure
 */
export interface ClaudeResponse {
  id: string;                    // Response identifier
  type: string;                  // Response type
  role: string;                  // Role of the responder
  content: {
    type: string;                // Content type
    text: string;                // Content text
  }[];
  model: string;                 // Model that generated the response
  stop_reason: string;           // Reason for stopping generation
  stop_sequence?: string;        // Sequence that stopped generation
  usage: {
    input_tokens: number;        // Tokens used for input
    output_tokens: number;       // Tokens generated in output
  };
}

// === OpenAI API Types ===

/**
 * OpenAI model configuration
 */
export interface OpenAIModelConfig {
  id: string;                    // Model identifier for API calls
  displayName: string;           // Human-readable name for logs and messages
  maxInputTokens: number;        // Maximum tokens for input
  maxOutputTokens: number;       // Maximum tokens for response generation
  description: string;           // Brief description of the model's capabilities
  defaultTemp: number;           // Default temperature value
}

/**
 * Options for calling the OpenAI API
 */
export interface OpenAIOptions {
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for response generation
  model?: string;                // OpenAI model to use
  systemPrompt?: string;         // System prompt
  tools?: any[];                 // Tools for function calling
  logger?: any;                  // Logger for API calls
}

/**
 * OpenAI API request structure
 */
export interface OpenAIRequest {
  model: string;                 // Model identifier
  messages: OpenAIMessage[];     // Messages for the conversation
  max_tokens?: number;           // Maximum tokens for response
  temperature?: number;          // Temperature for response generation
  tools?: any[];                 // Tools for function calling
  tool_choice?: string | any;    // Tool choice configuration
}

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';  // Role of the message sender
  content: string | null;        // Content of the message
  name?: string;                 // Name for the tool role
  tool_call_id?: string;         // ID of the tool call
  tool_calls?: any[];            // Tool calls made by the assistant
}

/**
 * OpenAI API response structure
 */
export interface OpenAIResponse {
  id: string;                    // Response identifier
  object: string;                // Object type
  created: number;               // Creation timestamp
  model: string;                 // Model used
  choices: {
    index: number;               // Choice index
    message: OpenAIMessage;      // Response message
    logprobs: any;               // Log probabilities
    finish_reason: string;       // Reason for finishing
  }[];
  usage: {
    prompt_tokens: number;       // Tokens used for prompt
    completion_tokens: number;   // Tokens used for completion
    total_tokens: number;        // Total tokens used
  };
}

// === Code Evolution Types ===

/**
 * Types of code evolution operations
 */
export type EvolutionType = 'refactor' | 'improve' | 'transform' | 'test' | 'document';

/**
 * Code location reference
 */
export interface CodeLocation {
  filePath: string;              // Path to the file
  startLine: number;             // Starting line number
  endLine: number;               // Ending line number
  startColumn?: number;          // Starting column number
  endColumn?: number;            // Ending column number
}

/**
 * Security risk information
 */
export interface SecurityRisk {
  type: string;                  // Type of security risk
  severity: 'low' | 'medium' | 'high' | 'critical';  // Risk severity
  description: string;           // Description of the risk
  location?: CodeLocation;       // Location of the risk
  recommendation?: string;       // Recommendation for fixing
}

/**
 * Performance issue information
 */
export interface PerformanceIssue {
  type: string;                  // Type of performance issue
  impact: 'low' | 'medium' | 'high';  // Impact on performance
  description: string;           // Description of the issue
  location?: CodeLocation;       // Location of the issue
  recommendation?: string;       // Recommendation for fixing
}

/**
 * Code change definition
 */
export interface Change {
  id: string;                    // Unique identifier for the change
  type: 'create' | 'update' | 'delete' | 'move';  // Type of change
  filePath: string;              // Path to the file
  description: string;           // Description of the change
  before?: string;               // Code before the change
  after?: string;                // Code after the change
  codeLocations?: CodeLocation[];  // Locations affected by the change
  impacts?: {
    components: string[];        // Components impacted by the change
    files: string[];             // Files impacted by the change
    description: string;         // Description of the impacts
  };
}

/**
 * Evolution operation details
 */
export interface EvolutionOperation {
  id: string;                    // Unique identifier for the operation
  type: EvolutionType;           // Type of evolution
  status: 'proposed' | 'approved' | 'rejected' | 'completed';  // Status of the operation
  query: string;                 // Original query that triggered the operation
  targetComponent?: string;      // Component targeted by the operation
  contextFiles?: string[];       // Files providing context for the operation
  filesToModify?: string[];      // Files to be modified by the operation
  createdAt: string;             // When the operation was created
  completedAt?: string;          // When the operation was completed
  details: EvolutionDetails;     // Operation-specific details
  provider?: 'claude' | 'gemini' | 'openai'; // Provider of the operation
}

/**
 * Operation-specific details
 */
export type EvolutionDetails = 
  | RefactorDetails
  | ImprovementDetails
  | TransformationDetails
  | TestGenerationDetails
  | DocumentationDetails;

/**
 * Refactoring operation details
 */
export interface RefactorDetails {
  goal: string;                  // Goal of the refactoring
  strategy: string;              // Strategy for refactoring
  codeSmellsAddressed?: string[];  // Code smells being addressed
  patternsApplied?: string[];    // Design patterns being applied
  changes: Change[];             // Changes to be made
}

/**
 * Improvement operation details
 */
export interface ImprovementDetails {
  goal: string;                  // Goal of the improvement
  improvedAspect: 'performance' | 'security' | 'accessibility' | 'other';  // Aspect being improved
  measurableMetrics?: string[];  // Metrics for measuring improvement
  changes: Change[];             // Changes to be made
}

/**
 * Transformation operation details
 */
export interface TransformationDetails {
  goal: string;                  // Goal of the transformation
  fromArchitecture?: string;     // Current architecture
  toArchitecture?: string;       // Target architecture
  transformationSteps: string[]; // Steps for transformation
  changes: Change[];             // Changes to be made
}

/**
 * Test generation operation details
 */
export interface TestGenerationDetails {
  goal: string;                  // Goal of test generation
  testFramework: string;         // Test framework to use
  coverageTargets?: string[];    // Coverage targets
  testTypes: ('unit' | 'integration' | 'e2e' | 'other')[];  // Types of tests
  generatedTests: {
    filePath: string;            // Path to the test file
    description: string;         // Description of the test
    content: string;             // Content of the test
  }[];
}

/**
 * Documentation generation operation details
 */
export interface DocumentationDetails {
  goal: string;                  // Goal of documentation
  documentationType: 'api' | 'architecture' | 'component' | 'usage' | 'other';  // Type of documentation
  generatedDocs: {
    filePath: string;            // Path to the documentation file
    description: string;         // Description of the documentation
    content: string;             // Content of the documentation
  }[];
}

/**
 * Evolution operation request
 */
export interface EvolutionRequest {
  query: string;                 // Query describing the evolution
  evolutionType: EvolutionType;  // Type of evolution
  directory: string;             // Repository directory
  targetComponent?: string;      // Component to target
  analysisType?: AnalysisType;   // Type of analysis to perform
  contextFiles?: string[];       // Files providing context
  filesToModify?: string[];      // Files to modify
  codeSpecification?: string;    // Detailed specification
  previousEvolutionId?: string;  // Previous evolution for context
  sharedContext?: SharedContext; // Shared context from previous operations
  geminiModel?: string;          // Gemini model to use
  claudeModel?: string;          // Claude model to use
  openaiModel?: string;          // OpenAI model to use
  preferredProvider?: 'claude' | 'gemini' | 'openai'; // Preferred provider for this operation
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for generation
  cachingOptions?: CachingOptions;  // Caching options
}

/**
 * Evolution operation response
 */
export interface EvolutionResponse {
  id: string;                    // Response identifier
  evolutionOperation: EvolutionOperation;  // Evolution operation
  explanation: string;           // Explanation of the evolution
  recommendations: string[];     // Additional recommendations
  provider: 'claude' | 'gemini' | 'openai'; // Provider that generated the response
}

// === Enhanced Tool Types ===

/**
 * Options for the chat-with-claude tool
 */
export interface ChatWithClaudeOptions {
  prompt: string;                // Prompt to send to Claude
  systemPrompt?: string;         // System prompt for Claude
  model?: string;                // Claude model to use
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for generation
  sharedContext?: SharedContext; // Shared context to use
  updateContext?: boolean;       // Whether to update context
}

/**
 * Options for the chat-with-gemini tool
 */
export interface ChatWithGeminiOptions {
  prompt: string;                // Prompt to send to Gemini
  model?: string;                // Gemini model to use
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for generation
  sharedContext?: SharedContext; // Shared context to use
  updateContext?: boolean;       // Whether to update context
}

/**
 * Options for the chat-with-openai tool
 */
export interface ChatWithOpenAIOptions {
  prompt: string;                // Prompt to send to OpenAI
  systemPrompt?: string;         // System prompt for OpenAI
  model?: string;                // OpenAI model to use
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for generation
  sharedContext?: SharedContext; // Shared context to use
  updateContext?: boolean;       // Whether to update context
}

/**
 * Options for the evolve-code tool
 */
export interface EvolveCodeOptions extends EvolutionRequest {
  updateContext?: boolean;       // Whether to update context
}

/**
 * Options for the manage-context tool
 */
export interface ManageContextOptions {
  action: 'create' | 'get' | 'update' | 'delete' | 'list';  // Action to perform
  contextId?: string;            // Context identifier
  context?: Partial<SharedContext>;  // Context data for create/update
  updateOptions?: ContextUpdateOptions;  // Options for update
}

// === Enhanced Caching Support ===

/**
 * Caching options for model calls
 */
export interface CachingOptions {
  enabled: boolean;              // Whether caching is enabled
  key?: string;                  // Custom cache key
  ttl?: number;                  // Time-to-live in seconds
  invalidate?: boolean;          // Whether to invalidate existing cache
}

/**
 * Updated options for repository analysis with context support
 */
export interface EnhancedRepositoryAnalysisOptions {
  query: string;                 // Question about the repository
  directory?: string;            // Repository directory
  model?: string;                // Model to use
  maxTokens?: number;            // Maximum tokens for response
  temperature?: number;          // Temperature for generation
  reasoningEffort?: string;      // Reasoning effort level
  outputFormat?: OutputFormat;   // Output format
  analysisType?: AnalysisType;   // Type of analysis
  analysisLevel?: string;        // Level of analysis
  component?: string;            // Component to focus on
  previousAnalysis?: string;     // Previous analysis for context
  logger?: any;                  // Logger
  includeStructure?: boolean;    // Whether to include structure
  includeImports?: boolean;      // Whether to include imports
  smartFiltering?: boolean;      // Whether to use smart filtering
  sharedContext?: SharedContext; // Shared context to use
  updateContext?: boolean;       // Whether to update context
  cachingOptions?: CachingOptions;  // Caching options
  preferredProvider?: 'claude' | 'gemini' | 'openai'; // Preferred provider for this analysis
}
