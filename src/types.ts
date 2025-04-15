// === ConfigManager Types ===

/**
 * Interface for ConfigManager class
 */
export interface ConfigManagerInterface {
  // Getter methods
  getDefaultModel(): string;
  getDefaultTemperature(): number;
  getDefaultMaxTokens(): number;
  getRepositoryConfig(): RepositoryConfig;
  getGitHubConfig(): GitHubConfig | undefined;
  getConfig(): ServerConfig;
  getProfiles(): Record<string, ProfileConfig>;
  getActiveProfile(): string;
  
  // Setter methods
  loadConfig(): Promise<void>;
  setDefaultModel(model: string): Promise<void>;
  setDefaultTemperature(temperature: number): Promise<void>;
  setDefaultMaxTokens(maxTokens: number): Promise<void>;
  switchProfile(profileName: string): Promise<void>;
  createProfile(profile: ProfileConfig): Promise<void>;
  updateProfile(profileName: string, updates: Partial<ProfileConfig>): Promise<void>;
  deleteProfile(profileName: string): Promise<void>;
  updateGitHubConfig(updates: Partial<GitHubConfig>): Promise<void>;
}

/**
 * Centralized type definitions for MCP Gemini Bridge
 */

// === MCP Types ===

/**
 * Represents a single content item in an MCP message.
 */
export type McpContentItem = 
  | { type: "text"; text: string; [key: string]: unknown }
  | { type: "image"; data: string; mimeType: string; [key: string]: unknown }
  | { type: "audio"; data: string; mimeType: string; [key: string]: unknown }
  | { 
      type: "resource"; 
      resource: 
        | { text: string; uri: string; mimeType?: string; [key: string]: unknown } 
        | { uri: string; blob: string; mimeType?: string; [key: string]: unknown }; 
      [key: string]: unknown 
    };

/**
 * Represents the structure of a response expected by MCP tools/callbacks.
 */
export type McpCallbackResponse = { 
  content: McpContentItem[]; 
  isError?: boolean; 
  [key: string]: unknown; 
};

// === Configuration Types ===

/**
 * GitHub authentication configuration
 */
export type GitHubAuthConfig = {
  type: 'token' | 'oauth' | 'none';
  token?: string;
  clientId?: string;
  clientSecret?: string;
};

/**
 * GitHub general configuration
 */
export interface GitHubConfig {
  auth: GitHubAuthConfig;
  cacheTtl: number;
  cloneDepth: number;
}

/**
 * Repository analysis configuration
 */
export interface RepositoryConfig {
  maxSizeBytes: number;
  maxFileCount: number;
  prioritization: 'default' | 'aggressive' | 'conservative';
  includeImports: boolean;
  includeStructure: boolean;
  smartFiltering: boolean;
}

/**
 * Profile configuration
 */
export interface ProfileConfig {
  name: string;
  description?: string;
  extends?: string;
  // Uses Omit to avoid circular dependency with ServerConfig before it's fully defined
  config: Partial<Omit<ServerConfig, 'profiles' | 'activeProfile'>>;
}

/**
 * Main server configuration interface
 */
export interface ServerConfig {
  server: {
    name: string;
    version: string;
    logLevel: LogLevel;
  };
  gemini: {
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
  };
  repository: RepositoryConfig;
  github?: GitHubConfig;
  profiles: Record<string, ProfileConfig>;
  activeProfile: string;
}

// === Logger Interface ===

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Standard logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

// === Analysis Types ===

/**
 * Analysis type options
 */
export type AnalysisType = 'architecture' | 'security' | 'performance' | 'documentation' | 'testing' | 'comprehensive' | 'bug' | string;

/**
 * Analysis level for hierarchical approach
 */
export type AnalysisLevel = 'overview' | 'component' | 'detail';

/**
 * Output format options
 */
export type OutputFormat = 'text' | 'json' | 'markdown';

/**
 * Reasoning effort levels
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

// === GitHub API Types ===

/**
 * Information about a GitHub repository.
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  fullName?: string;
  description?: string;
  stars?: number;
  forks?: number;
  issues?: number;
  lastUpdated?: string;
  language?: string;
  defaultBranch?: string;
}

/**
 * Options for the GitHub API client.
 */
export interface GitHubApiOptions {
  authConfig?: GitHubAuthConfig;
  baseUrl?: string;
  logger?: Logger;
}

/**
 * Generated repository context from GitHub
 */
export interface GitHubRepositoryContext {
  repository: GitHubRepoInfo;
  readme: string;
  contributors?: Array<{
    login: string;
    contributions: number;
    avatarUrl?: string;
  }>;
  languages?: Record<string, number>;
  structure?: string;
  statistics?: {
    commits: number;
    branches: number;
    releases: number;
    lastActivity: string;
  };
}

// === Tool Option Types ===

/**
 * Options for processing (cloning and packaging) a GitHub repository.
 */
export interface GitHubRepositoryOptions {
  owner: string;
  repo: string;
  branch?: string;
  path?: string; // Path within the repo
  depth?: number;
  maxTokens?: number;
  query?: string;
  analysisType?: AnalysisType;
  smartFiltering?: boolean;
  includeForks?: boolean;
  logger?: Logger;
}

/**
 * Options for the enhanced repository analysis tool.
 */
export interface RepositoryAnalysisOptions {
  query: string;
  directory?: string; // Local path or GitHub URL
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  outputFormat?: OutputFormat;
  analysisType?: AnalysisType;
  analysisLevel?: AnalysisLevel;
  component?: string; // Specific component to analyze in component/detail level
  previousAnalysis?: string; // Results from previous analysis level for context
  logger?: Logger;
  includeStructure?: boolean;
  includeImports?: boolean;
  smartFiltering?: boolean;
}

/**
 * Options for the enhanced file analysis tool.
 */
export interface FileAnalysisOptions {
  query: string;
  files: string[];
  directory?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  outputFormat?: OutputFormat;
  logger?: Logger;
}

// === Prompt Template Types ===

/**
 * Base template structure for role-based prompting
 */
export interface PromptTemplate {
  name: string;
  description: string;
  template: string;
}

/**
 * Template key type
 */
export type PromptTemplateKey = 
  | 'REPOSITORY_ANALYSIS'
  | 'SECURITY_ANALYSIS'
  | 'PERFORMANCE_ANALYSIS'
  | 'DOCUMENTATION_GENERATION'
  | 'CODE_EXPLANATION'
  | 'BUG_ANALYSIS'
  | 'TESTING_ANALYSIS'
  | 'OVERVIEW_ARCHITECTURE'
  | 'OVERVIEW_SECURITY'
  | 'OVERVIEW_PERFORMANCE'
  | 'COMPONENT_ANALYSIS'
  | 'COMPONENT_SECURITY'
  | 'DETAIL_ANALYSIS'
  | string;

// === Gemini Types ===

/**
 * Interface for Gemini model configuration
 */
export interface GeminiModelConfig {
  id: string;               // Model identifier for API calls
  displayName: string;      // Human-readable name for logs and messages
  maxInputTokens: number;   // Maximum tokens for input
  maxOutputTokens: number;  // Maximum tokens for response generation
  description: string;      // Brief description of the model's capabilities
  contextWindow: number;    // Total context window size
  defaultTemp: number;      // Default temperature value
  isPreview?: boolean;      // Whether the model is in preview
}

/**
 * Options for calling the Gemini API
 */
export interface GeminiOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  logger?: Logger;
}

// === Repomix Types ===
/**
 * Options for repository packaging using Repomix utilities.
 */
export interface PackageRepositoryOptions {
  include?: string[];
  exclude?: string[];
  query?: string;
  analysisType?: AnalysisType;
  maxTokens?: number;
  maxFileSize?: number;   // Maximum size of individual files to include
  allowReadOutsideBaseDirs?: boolean;
  extractStructure?: boolean;
  extractImports?: boolean;
  smartFiltering?: boolean;
  logger?: Logger;
  componentPath?: string;  // Path to specific component for component-level analysis
  compress?: boolean;      // Whether to compress code by removing implementation details
}

/**
 * Result from packaging a repository.
 */
export interface PackageResult {
  totalFiles: number;
  totalTokens: number;
  filePaths: string[];
  structure?: string;
  imports?: Record<string, string[]>;
  usedMcp?: boolean;          // Indicates if Repomix MCP was used
  usedCliWrapper?: boolean;   // Indicates if CLI wrapper was used
  usedFallback?: boolean;     // Indicates if fallback solution was used instead of Repomix
  fallbackError?: string;     // Original Repomix error if fallback was used
  componentPath?: string;     // Component path if component-level analysis was performed
  outputId?: string;          // Output ID from MCP server if applicable
}
