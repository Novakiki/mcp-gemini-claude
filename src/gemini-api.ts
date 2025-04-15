import { ApiKeyMissingError, NetworkError } from './errors.js';
import { retryWithBackoff } from './utils.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { Logger, GeminiOptions } from './types.js';

// Import Gemini configuration
import { DEFAULT_MODEL, getModelConfig, getModelApiUrl } from './gemini-config.js';

// Import configuration manager
import { getConfigManager } from './config-manager.js';

// API endpoints are now dynamic based on the model configuration

// GeminiOptions is now imported from types.js

/**
 * Validate the Gemini API key format
 */
function validateApiKey(apiKey: string): boolean {
  // Simple validation - API keys are typically longer than 20 chars
  return apiKey.length > 20;
}

/**
 * Check if it's a JSON service account file
 */
async function isValidServiceAccountFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(content);
    return !!(json.private_key && json.client_email);
  } catch (error) {
    return false;
  }
}

/**
 * Direct access to Gemini API with an API key
 */
async function callGeminiApi(
  prompt: string, 
  apiKey: string, 
  options: GeminiOptions
): Promise<string> {
  const logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const configManager = getConfigManager(logger);
  
  // Get the model config
  const modelId = options.model || configManager.getDefaultModel();
  const modelConfig = getModelConfig(modelId);
  logger.debug(`Calling Gemini API (${modelConfig.displayName}) directly`);
  
  try {
    const url = `${getModelApiUrl(modelId)}?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens || configManager.getDefaultMaxTokens(),
          temperature: options.temperature || configManager.getDefaultTemperature()
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new NetworkError(`Gemini API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    logger.debug("Received response from Gemini API");
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new NetworkError("No candidates returned from Gemini");
    }
    
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(`Error calling Gemini API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main function to call Gemini API with improved error handling and retry logic
 */
export async function callGemini(
  prompt: string, 
  options: GeminiOptions = {}
): Promise<string> {
  const logger = options.logger || {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
  
  logger.debug("Preparing to call Gemini API", { promptLength: prompt.length });
  
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new ApiKeyMissingError("GEMINI_API_KEY is not defined");
  }

  // Check if it's a regular API key (simplest case)
  if (validateApiKey(GEMINI_API_KEY)) {
    // Use retry with backoff for API calls to handle transient errors
    return await retryWithBackoff(
      async () => callGeminiApi(prompt, GEMINI_API_KEY, options),
      3,  // maxRetries
      1000,  // initialDelay
      (error) => {
        // Retry on network errors and rate limits, but not auth errors
        const errorMsg = String(error);
        return errorMsg.includes('ETIMEDOUT') || 
               errorMsg.includes('ECONNRESET') || 
               errorMsg.includes('rate limit') ||
               errorMsg.includes('quota') ||
               errorMsg.includes('429') ||
               errorMsg.includes('503');
      },
      logger
    );
  } 
  
  // For service account files or ADC, give clear error messages for now
  // We'll implement these in a future update
  if (GEMINI_API_KEY.endsWith('.json')) {
    // Service account file validation
    if (!existsSync(GEMINI_API_KEY)) {
      throw new ApiKeyMissingError(`Service account file not found: ${GEMINI_API_KEY}`);
    }
    
    const isValid = await isValidServiceAccountFile(GEMINI_API_KEY);
    if (!isValid) {
      throw new ApiKeyMissingError(`Invalid service account file: ${GEMINI_API_KEY}`);
    }
    
    throw new ApiKeyMissingError(
      "Service account authentication is planned for a future update. " +
      "Please use a direct API key for now."
    );
  }
  
  if (GEMINI_API_KEY.toLowerCase() === 'adc') {
    throw new ApiKeyMissingError(
      "Application Default Credentials (ADC) support is planned for a future update. " +
      "Please use a direct API key for now."
    );
  }
  
  // If we get here, it's an unrecognized format
  throw new ApiKeyMissingError(
    "Unrecognized API key format. Please use a valid Gemini API key. " +
    "Service account and ADC support is coming in a future update."
  );
}
