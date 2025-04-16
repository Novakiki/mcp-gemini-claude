import { GEMINI_MODELS, DEFAULT_MODEL } from './gemini-config.js';
import { promises as fsPromises, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import os from 'os';
// Import shared configuration types
import {
  GitHubConfig,
  GitHubAuthConfig, // Needed for GitHubConfig
  RepositoryConfig,
  ServerConfig,
  ProfileConfig,
  Logger,
  ConfigManagerInterface
} from './types.js';

/**
 * Configuration Manager class for MCP Gemini Bridge
 * Handles loading, saving, and accessing configuration settings
 */
class ConfigManager implements ConfigManagerInterface {
  private configPath: string;
  private config: ServerConfig;
  private logger: Logger;
  
  // Default Claude settings
  private defaultClaudeModel = 'claude-3-opus-20240229';
  private defaultClaudeTemperature = 0.7;
  private defaultClaudeMaxTokens = 4096;
  private defaultClaudeSystemPrompt = '';

  constructor(logger?: Logger) {
    this.logger = logger || {
      debug: (msg: string) => console.error(`[DEBUG] ${msg}`),
      info: (msg: string) => console.error(`[INFO] ${msg}`),
      warn: (msg: string) => console.error(`[WARN] ${msg}`),
      error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err)
    };
    
    // Configuration path (respecting XDG base directory spec)
    this.configPath = process.env.MCP_CONFIG_PATH || 
      path.join(os.homedir(), '.config', 'mcp-gemini-claude', 'config.json');
    
    // Default configuration
    this.config = {
      server: {
        name: "gemini-bridge",
        version: "1.0.0",
        logLevel: "info"
      },
      gemini: {
        defaultModel: process.env.GEMINI_DEFAULT_MODEL || DEFAULT_MODEL,
        defaultTemperature: 0.7,
        defaultMaxTokens: 8192
      },
      claude: {
        defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-opus-20240229',
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultSystemPrompt: ''
      },
      repository: {
        maxSizeBytes: 150 * 1024 * 1024, // 150 MB
        maxFileCount: 5000,
        prioritization: 'default',
        includeImports: true,
        includeStructure: true,
        smartFiltering: true
      },
      github: {
        auth: {
          type: process.env.GITHUB_TOKEN ? 'token' : 'none',
          token: process.env.GITHUB_TOKEN
        },
        cacheTtl: 3600, // 1 hour in seconds
        cloneDepth: 1
      },
      profiles: {
        default: {
          name: 'default',
          description: 'Default configuration',
          config: {}
        },
        security: {
          name: 'security',
          description: 'Security-focused analysis',
          extends: 'default',
          config: {
            gemini: {
              defaultModel: 'gemini-1.5-flash',
              defaultTemperature: 0.2,
              defaultMaxTokens: 8192
            },
            repository: {
              maxSizeBytes: 50 * 1024 * 1024,
              maxFileCount: 1000,
              includeImports: true,
              includeStructure: true,
              prioritization: 'aggressive',
              smartFiltering: true
            }
          }
        },
        documentation: {
          name: 'documentation',
          description: 'Documentation generation focus',
          extends: 'default',
          config: {
            gemini: {
              defaultModel: 'gemini-1.5-pro',
              defaultMaxTokens: 16384,
              defaultTemperature: 0.7
            }
          }
        }
      },
      activeProfile: 'default'
    };
    
    // Ensure the config directory exists
    try {
      mkdirSync(path.dirname(this.configPath), { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to create config directory: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Load configuration synchronously on startup
    this.loadConfigSync();
  }

  /**
   * Load configuration from file synchronously
   * (Used during initialization)
   */
  private loadConfigSync(): void {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(configData);
        
        // Deep merge configuration to preserve defaults
        this.config = this.mergeConfig(this.config, savedConfig);
        
        this.logger.info(`Loaded configuration from ${this.configPath}`);
      } else {
        // Save default configuration if it doesn't exist
        this.saveConfigSync();
        this.logger.info(`Created default configuration at ${this.configPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save configuration to file synchronously
   * (Used during initialization)
   */
  private saveConfigSync(): void {
    try {
      mkdirSync(path.dirname(this.configPath), { recursive: true });
      writeFileSync(
        this.configPath, 
        JSON.stringify(this.config, null, 2), 
        'utf-8'
      );
      this.logger.info(`Saved configuration to ${this.configPath}`);
    } catch (error) {
      this.logger.error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load configuration from file asynchronously
   */
  async loadConfig(): Promise<void> {
    try {
      await fsPromises.mkdir(path.dirname(this.configPath), { recursive: true });
      const configExists = await fsPromises.access(this.configPath)
        .then(() => true)
        .catch(() => false);
      
      if (configExists) {
        const configData = await fsPromises.readFile(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(configData);
        
        // Deep merge configuration to preserve defaults
        this.config = this.mergeConfig(this.config, savedConfig);
        
        this.logger.info(`Loaded configuration from ${this.configPath}`);
      } else {
        // Save default configuration if it doesn't exist
        await this.saveConfig();
        this.logger.info(`Created default configuration at ${this.configPath}`);
      }
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Helper function to deep merge objects
   */
  private mergeConfig<T>(target: T, source: any): T {
    if (!source) return target;
    
    const result: any = { ...target };
    
    for (const key in source) {
      if (source[key] === null) {
        result[key] = null;
      } else if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // Only deep merge if both target and source have an object
        if (typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.mergeConfig(result[key], source[key]);
        } else {
          // Otherwise just override
          result[key] = source[key];
        }
      } else {
        // For primitives and arrays, simply override
        result[key] = source[key];
      }
    }
    
    return result as T;
  }

  /**
   * Get effective configuration for the current profile
   */
  private getEffectiveProfileConfig(): ServerConfig {
    const activeProfile = this.config.activeProfile || 'default';
    const profile = this.config.profiles[activeProfile];
    
    if (!profile) {
      this.logger.warn(`Profile '${activeProfile}' not found, using default`);
      return this.config;
    }
    
    // Create a copy of base config without profiles/activeProfile
    const baseConfig: Partial<ServerConfig> = {
      server: { ...this.config.server },
      gemini: { ...this.config.gemini },
      repository: { ...this.config.repository },
      github: this.config.github ? { ...this.config.github } : undefined,
      // profiles and activeProfile are intentionally omitted
    };
    
    // Apply profile inheritance chain
    const resolvedConfig = this.resolveProfileInheritance(profile, baseConfig);
    
    // Ensure profiles and activeProfile are preserved
    resolvedConfig.profiles = this.config.profiles;
    resolvedConfig.activeProfile = this.config.activeProfile;
    
    return resolvedConfig;
  }

  /**
   * Resolve profile inheritance
   */
  private resolveProfileInheritance(
    profile: ProfileConfig,
    baseConfig: Partial<ServerConfig>
  ): ServerConfig {
    // If no extension, apply directly to base config
    if (!profile.extends) {
      // Cast the merged config to ServerConfig
      return this.mergeConfig(baseConfig, profile.config) as ServerConfig;
    }
    
    // Check for circular dependencies
    const visited = new Set<string>([profile.name]);
    // Explicitly type 'current' as string | undefined
    let current: string | undefined = profile.extends;
    let parentChain: string[] = [];
    
    while (current) {
      if (visited.has(current)) {
        this.logger.error(`Circular profile inheritance detected: ${[...parentChain, current].join(' -> ')}`);
        break;
      }
      
      parentChain.push(current);
      visited.add(current);
      
      const parentProfile: ProfileConfig | undefined = this.config.profiles[current];
      if (!parentProfile) {
        this.logger.warn(`Parent profile '${current}' not found, breaking inheritance chain`);
        break;
      }
      
      current = parentProfile.extends;
    }
    
    // Apply inheritance chain from bottom up
    let resolvedConfig = { ...baseConfig };
    
    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parentName = parentChain[i];
      // Re-apply explicit type annotation using imported ProfileConfig
      const parentProfile: ProfileConfig | undefined = this.config.profiles[parentName];
      
      if (parentProfile) {
        resolvedConfig = this.mergeConfig(resolvedConfig, parentProfile.config);
      }
    }
    
    // Finally apply the current profile's config
    // Cast the final merged config to ServerConfig
    return this.mergeConfig(resolvedConfig, profile.config) as ServerConfig;
  }

  /**
   * Save configuration to file asynchronously
   */
  async saveConfig(): Promise<void> {
    try {
      await fsPromises.mkdir(path.dirname(this.configPath), { recursive: true });
      await fsPromises.writeFile(
        this.configPath, 
        JSON.stringify(this.config, null, 2), 
        'utf-8'
      );
      this.logger.info(`Saved configuration to ${this.configPath}`);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Getter methods based on active profile
  
  /**
   * Get default model
   */
  getDefaultModel(): string {
    const config = this.getEffectiveProfileConfig();
    return config.gemini.defaultModel;
  }

  /**
   * Get default temperature
   */
  getDefaultTemperature(): number {
    const config = this.getEffectiveProfileConfig();
    return config.gemini.defaultTemperature;
  }

  /**
   * Get default maximum tokens
   */
  getDefaultMaxTokens(): number {
    const config = this.getEffectiveProfileConfig();
    return config.gemini.defaultMaxTokens;
  }

  /**
   * Get default Claude model
   */
  getClaudeModel(): string {
    const config = this.getEffectiveProfileConfig();
    return config.claude?.defaultModel || this.defaultClaudeModel;
  }

  /**
   * Get default Claude temperature
   */
  getClaudeTemperature(): number {
    const config = this.getEffectiveProfileConfig();
    return config.claude?.defaultTemperature || this.defaultClaudeTemperature;
  }

  /**
   * Get default Claude maximum tokens
   */
  getClaudeMaxTokens(): number {
    const config = this.getEffectiveProfileConfig();
    return config.claude?.defaultMaxTokens || this.defaultClaudeMaxTokens;
  }

  /**
   * Get default Claude system prompt
   */
  getClaudeSystemPrompt(): string {
    const config = this.getEffectiveProfileConfig();
    return config.claude?.defaultSystemPrompt || this.defaultClaudeSystemPrompt;
  }

  /**
   * Get repository configuration
   */
  getRepositoryConfig(): RepositoryConfig {
    const config = this.getEffectiveProfileConfig();
    return config.repository;
  }

  /**
   * Get GitHub configuration
   */
  getGitHubConfig(): GitHubConfig | undefined {
    const config = this.getEffectiveProfileConfig();
    return config.github;
  }

  /**
   * Get complete configuration
   */
  getConfig(): ServerConfig {
    return this.getEffectiveProfileConfig();
  }

  /**
   * Get available profiles
   */
  getProfiles(): Record<string, ProfileConfig> {
    return { ...this.config.profiles };
  }

  /**
   * Get active profile name
   */
  getActiveProfile(): string {
    return this.config.activeProfile;
  }

  // Setter methods
  
  /**
   * Set default model
   */
  async setDefaultModel(model: string): Promise<void> {
    if (!GEMINI_MODELS[model]) {
      throw new Error(`Invalid model: ${model}`);
    }
    this.config.gemini.defaultModel = model;
    await this.saveConfig();
  }

  /**
   * Set default temperature
   */
  async setDefaultTemperature(temperature: number): Promise<void> {
    if (temperature < 0 || temperature > 1) {
      throw new Error(`Invalid temperature: ${temperature}. Must be between 0 and 1.`);
    }
    this.config.gemini.defaultTemperature = temperature;
    await this.saveConfig();
  }

  /**
   * Set default maximum tokens
   */
  async setDefaultMaxTokens(maxTokens: number): Promise<void> {
    if (maxTokens < 1) {
      throw new Error(`Invalid max tokens: ${maxTokens}. Must be at least 1.`);
    }
    this.config.gemini.defaultMaxTokens = maxTokens;
    await this.saveConfig();
  }

  /**
   * Set default Claude model
   */
  async setClaudeModel(model: string): Promise<void> {
    // Add validation if needed
    if (!this.config.claude) {
      this.config.claude = {
        defaultModel: this.defaultClaudeModel,
        defaultTemperature: this.defaultClaudeTemperature,
        defaultMaxTokens: this.defaultClaudeMaxTokens,
        defaultSystemPrompt: this.defaultClaudeSystemPrompt
      };
    }
    
    this.config.claude.defaultModel = model;
    await this.saveConfig();
    
    this.logger.info(`Set default Claude model to: ${model}`);
  }

  /**
   * Set default Claude temperature
   */
  async setClaudeTemperature(temperature: number): Promise<void> {
    if (temperature < 0 || temperature > 1) {
      throw new Error(`Invalid temperature: ${temperature}. Must be between 0 and 1.`);
    }
    
    if (!this.config.claude) {
      this.config.claude = {
        defaultModel: this.defaultClaudeModel,
        defaultTemperature: this.defaultClaudeTemperature,
        defaultMaxTokens: this.defaultClaudeMaxTokens,
        defaultSystemPrompt: this.defaultClaudeSystemPrompt
      };
    }
    
    this.config.claude.defaultTemperature = temperature;
    await this.saveConfig();
    
    this.logger.info(`Set default Claude temperature to: ${temperature}`);
  }

  /**
   * Set default Claude maximum tokens
   */
  async setClaudeMaxTokens(maxTokens: number): Promise<void> {
    if (maxTokens < 1) {
      throw new Error(`Invalid max tokens: ${maxTokens}. Must be at least 1.`);
    }
    
    if (!this.config.claude) {
      this.config.claude = {
        defaultModel: this.defaultClaudeModel,
        defaultTemperature: this.defaultClaudeTemperature,
        defaultMaxTokens: this.defaultClaudeMaxTokens,
        defaultSystemPrompt: this.defaultClaudeSystemPrompt
      };
    }
    
    this.config.claude.defaultMaxTokens = maxTokens;
    await this.saveConfig();
    
    this.logger.info(`Set default Claude max tokens to: ${maxTokens}`);
  }

  /**
   * Set default Claude system prompt
   */
  async setClaudeSystemPrompt(systemPrompt: string): Promise<void> {
    if (!this.config.claude) {
      this.config.claude = {
        defaultModel: this.defaultClaudeModel,
        defaultTemperature: this.defaultClaudeTemperature,
        defaultMaxTokens: this.defaultClaudeMaxTokens,
        defaultSystemPrompt: this.defaultClaudeSystemPrompt
      };
    }
    
    this.config.claude.defaultSystemPrompt = systemPrompt;
    await this.saveConfig();
    
    this.logger.info(`Updated default Claude system prompt`);
  }

  /**
   * Switch to a different profile
   */
  async switchProfile(profileName: string): Promise<void> {
    if (!this.config.profiles[profileName]) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    
    this.config.activeProfile = profileName;
    await this.saveConfig();
    
    this.logger.info(`Switched to profile: ${profileName}`);
  }

  /**
   * Create a new profile
   */
  async createProfile(profile: ProfileConfig): Promise<void> {
    if (this.config.profiles[profile.name]) {
      throw new Error(`Profile already exists: ${profile.name}`);
    }
    
    this.config.profiles[profile.name] = profile;
    await this.saveConfig();
    
    this.logger.info(`Created new profile: ${profile.name}`);
  }

  /**
   * Update an existing profile
   */
  async updateProfile(profileName: string, updates: Partial<ProfileConfig>): Promise<void> {
    if (!this.config.profiles[profileName]) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    
    // Preserve profile name
    if (updates.name && updates.name !== profileName) {
      throw new Error(`Cannot change profile name from '${profileName}' to '${updates.name}'`);
    }
    
    // Update profile
    this.config.profiles[profileName] = { 
      ...this.config.profiles[profileName],
      ...updates,
      name: profileName
    };
    
    await this.saveConfig();
    
    this.logger.info(`Updated profile: ${profileName}`);
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileName: string): Promise<void> {
    if (profileName === 'default') {
      throw new Error(`Cannot delete the default profile`);
    }
    
    if (!this.config.profiles[profileName]) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    
    // If active profile is being deleted, switch to default
    if (this.config.activeProfile === profileName) {
      this.config.activeProfile = 'default';
    }
    
    // Delete the profile
    delete this.config.profiles[profileName];
    
    await this.saveConfig();
    
    this.logger.info(`Deleted profile: ${profileName}`);
  }

  /**
   * Update GitHub configuration
   */
  async updateGitHubConfig(updates: Partial<GitHubConfig>): Promise<void> {
    if (!this.config.github) {
      this.config.github = {
        auth: { type: 'none' },
        cacheTtl: 3600,
        cloneDepth: 1
      };
    }
    
    this.config.github = {
      ...this.config.github,
      ...updates,
      auth: updates.auth 
        ? { ...this.config.github.auth, ...updates.auth }
        : this.config.github.auth
    };
    
    await this.saveConfig();
    
    this.logger.info(`Updated GitHub configuration`);
  }
}

// Singleton instance
let instance: ConfigManager | null = null;

/**
 * Get the configuration manager instance
 */
export function getConfigManager(logger?: Logger): ConfigManagerInterface {
  if (!instance) {
    instance = new ConfigManager(logger);
  }
  return instance;
}
