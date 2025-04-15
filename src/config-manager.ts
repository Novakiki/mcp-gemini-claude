import { GEMINI_MODELS, DEFAULT_MODEL } from './gemini-config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync, mkdirSync } from 'fs';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  // Add more configuration options as needed
}

/**
 * Configuration Manager class for MCP Gemini Bridge
 * Handles loading, saving, and accessing configuration settings
 */
class ConfigManager {
  private configPath: string;
  private config: ServerConfig;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger || {
      info: (msg: string) => console.error(`[INFO] ${msg}`),
      warn: (msg: string) => console.error(`[WARN] ${msg}`),
      error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err)
    };
    
    // Configuration path (respecting XDG base directory spec)
    this.configPath = process.env.MCP_CONFIG_PATH || 
      path.join(os.homedir(), '.config', 'mcp-gemini-claude', 'config.json');
    
    // Default configuration
    this.config = {
      defaultModel: process.env.GEMINI_DEFAULT_MODEL || DEFAULT_MODEL,
      defaultTemperature: 0.7,
      defaultMaxTokens: 8192
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
        const configData = require('fs').readFileSync(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(configData);
        this.config = { ...this.config, ...savedConfig };
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
      require('fs').mkdirSync(path.dirname(this.configPath), { recursive: true });
      require('fs').writeFileSync(
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
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      const configExists = await fs.access(this.configPath)
        .then(() => true)
        .catch(() => false);
      
      if (configExists) {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(configData);
        this.config = { ...this.config, ...savedConfig };
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
   * Save configuration to file asynchronously
   */
  async saveConfig(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(
        this.configPath, 
        JSON.stringify(this.config, null, 2), 
        'utf-8'
      );
      this.logger.info(`Saved configuration to ${this.configPath}`);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Getter methods
  
  /**
   * Get default model
   */
  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  /**
   * Get default temperature
   */
  getDefaultTemperature(): number {
    return this.config.defaultTemperature;
  }

  /**
   * Get default maximum tokens
   */
  getDefaultMaxTokens(): number {
    return this.config.defaultMaxTokens;
  }

  /**
   * Get complete configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }

  // Setter methods
  
  /**
   * Set default model
   */
  async setDefaultModel(model: string): Promise<void> {
    if (!GEMINI_MODELS[model]) {
      throw new Error(`Invalid model: ${model}`);
    }
    this.config.defaultModel = model;
    await this.saveConfig();
  }

  /**
   * Set default temperature
   */
  async setDefaultTemperature(temperature: number): Promise<void> {
    if (temperature < 0 || temperature > 1) {
      throw new Error(`Invalid temperature: ${temperature}. Must be between 0 and 1.`);
    }
    this.config.defaultTemperature = temperature;
    await this.saveConfig();
  }

  /**
   * Set default maximum tokens
   */
  async setDefaultMaxTokens(maxTokens: number): Promise<void> {
    if (maxTokens < 1) {
      throw new Error(`Invalid max tokens: ${maxTokens}. Must be at least 1.`);
    }
    this.config.defaultMaxTokens = maxTokens;
    await this.saveConfig();
  }
}

// Singleton instance
let instance: ConfigManager | null = null;

/**
 * Get the configuration manager instance
 */
export function getConfigManager(logger?: any): ConfigManager {
  if (!instance) {
    instance = new ConfigManager(logger);
  }
  return instance;
}
