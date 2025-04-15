// Gemini configuration file with model specifications and parameters

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
 * Available Gemini models
 */
export const GEMINI_MODELS: Record<string, GeminiModelConfig> = {
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    description: "Most capable model with thinking capabilities",
    contextWindow: 1000000,
    defaultTemp: 0.7
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash", 
    displayName: "Gemini 2.5 Flash",
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    description: "Efficient model with dynamic compute capabilities", 
    contextWindow: 1000000,
    defaultTemp: 0.7
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash", 
    displayName: "Gemini 2.0 Flash",
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    description: "Fast workhorse model with enhanced performance", 
    contextWindow: 1000000,
    defaultTemp: 0.7
  },
  "gemini-1.5-pro": {
    id: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    description: "Most capable model with high context capabilities",
    contextWindow: 1000000,
    defaultTemp: 0.7
  },
  "gemini-1.5-flash": {
    id: "gemini-1.5-flash", 
    displayName: "Gemini 1.5 Flash",
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    description: "Fast, efficient model for shorter responses", 
    contextWindow: 1000000,
    defaultTemp: 0.7
  },
  "gemini-1.0-pro": {
    id: "gemini-1.0-pro",
    displayName: "Gemini 1.0 Pro",
    maxInputTokens: 30720,
    maxOutputTokens: 2048,
    description: "Original Gemini Pro model",
    contextWindow: 32768,
    defaultTemp: 0.7
  },
  "gemini-1.0-pro-vision": {
    id: "gemini-1.0-pro-vision",
    displayName: "Gemini 1.0 Pro Vision",
    maxInputTokens: 12288,
    maxOutputTokens: 4096,
    description: "Vision-capable model for image analysis",
    contextWindow: 16384,
    defaultTemp: 0.7
  }
};

/**
 * Default model to use if none specified
 * Uses environment variable GEMINI_DEFAULT_MODEL if set, otherwise defaults to gemini-2.5-pro
 */
export const DEFAULT_MODEL = process.env.GEMINI_DEFAULT_MODEL || "gemini-2.5-pro";

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string): GeminiModelConfig {
  const config = GEMINI_MODELS[modelId];
  if (!config) {
    throw new Error(`Unknown Gemini model: ${modelId}`);
  }
  return config;
}

/**
 * Get base API URL for a given model
 */
export function getModelApiUrl(modelId: string): string {
  // Construct the API URL based on the model ID
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
}

/**
 * Get list of available models for display
 */
export function getAvailableModels(): {id: string, displayName: string, description: string}[] {
  return Object.values(GEMINI_MODELS).map(model => ({
    id: model.id,
    displayName: model.displayName,
    description: model.description
  }));
}
