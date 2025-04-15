/**
 * Token management utilities for optimizing content size
 */
import { TokenLimitError } from './errors.js';
import { extractKeywords, calculateRelevanceScore } from './keyword-extraction.js';

/**
 * Token limit configuration
 */
export const TOKEN_LIMITS = {
  // Default maximum tokens for prompts
  MAX_PROMPT_TOKENS: 200000,
  
  // Default maximum tokens for responses
  MAX_RESPONSE_TOKENS: 8192,
  
  // Default total token limit
  MAX_TOTAL_TOKENS: 208192,
  
  // Safety margin for token estimates
  TOKEN_SAFETY_MARGIN: 0.1, // 10% safety margin
  
  // Character-to-token ratio estimates by model with index signature
  MODEL_TOKEN_RATIOS: {
    'gemini-1.0-pro': 4.0,   // ~4 chars per token
    'gemini-1.0-pro-vision': 4.0,
    'gemini-1.5-pro': 3.75,  // Slightly better tokenization
    'gemini-1.5-flash': 3.75,
    'gemini-2.5-pro': 3.5,   // More efficient tokenization
    'gemini-2.5-flash': 3.5, 
    'gemini-2.5-pro-exp-03-25': 3.5, // Experimental version
    'default': 4.0
  } as { [key: string]: number }, // Add type assertion for index signature
};

/**
 * Estimate token count from text using model-specific ratios
 */
export function estimateTokenCount(
  text: string,
  modelId?: string
): number {
  if (!text) return 0;
  
  // Get character-to-token ratio for this model
  const ratio = modelId && TOKEN_LIMITS.MODEL_TOKEN_RATIOS[modelId] 
    ? TOKEN_LIMITS.MODEL_TOKEN_RATIOS[modelId]
    : TOKEN_LIMITS.MODEL_TOKEN_RATIOS.default;
    
  // Calculate estimated tokens
  const estimatedTokens = Math.ceil(text.length / ratio);
  
  // Add safety margin
  const tokensWithMargin = Math.ceil(
    estimatedTokens * (1 + TOKEN_LIMITS.TOKEN_SAFETY_MARGIN)
  );
  
  return tokensWithMargin;
}

/**
 * Check if content exceeds token limits and throw error if it does
 */
export function validateTokenCount(
  content: string, 
  maxTokens: number,
  modelId?: string
): void {
  const estimatedTokens = estimateTokenCount(content, modelId);
  
  if (estimatedTokens > maxTokens) {
    throw new TokenLimitError(
      `Content exceeds token limit: estimated ${estimatedTokens} tokens exceeds maximum ${maxTokens} tokens`
    );
  }
}

/**
 * Options for content trimming
 */
export interface TrimContentOptions {
  maxTokens: number;
  preserveStart?: boolean;
  preserveEnd?: boolean;
  modelId?: string;
  addEllipsis?: boolean;
  insertMessage?: string;
  logger?: any;
}

/**
 * Trim content to fit within token limits
 */
export function trimContentToTokenLimit(
  content: string,
  options: TrimContentOptions
): string {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  const estimatedTokens = estimateTokenCount(content, options.modelId);
  
  // If already under limit, return unchanged
  if (estimatedTokens <= options.maxTokens) {
    return content;
  }
  
  logger.info(`Trimming content from ${estimatedTokens} tokens to ${options.maxTokens} tokens`);
  
  // Calculate what percentage of content to keep
  const keepRatio = options.maxTokens / estimatedTokens;
  
  // Decide how to split the kept content
  const preserveRatio = options.preserveEnd ? 0.3 : options.preserveStart ? 0.7 : 0.5;
  
  // Calculate character counts
  const totalCharsToKeep = Math.floor(content.length * keepRatio);
  const charsFromStart = options.preserveEnd 
    ? Math.floor(totalCharsToKeep * (1 - preserveRatio)) 
    : Math.floor(totalCharsToKeep * preserveRatio);
  const charsFromEnd = totalCharsToKeep - charsFromStart;
  
  // Get the parts to keep
  const startPart = content.substring(0, charsFromStart);
  const endPart = content.substring(content.length - charsFromEnd);
  
  // Create message about trimming
  const insertMessage = options.insertMessage || 
    `\n\n[...CONTENT TRIMMED TO FIT ${options.maxTokens} TOKEN LIMIT (${estimatedTokens - options.maxTokens} tokens removed)...]\n\n`;
  
  // Put it all together
  const trimmedContent = options.preserveEnd
    ? (options.addEllipsis ? '...' : '') + endPart
    : options.preserveStart
    ? startPart + (options.addEllipsis ? '...' : '')
    : startPart + insertMessage + endPart;
  
  logger.debug(`Trimmed content from ${content.length} chars to ${trimmedContent.length} chars`);
  
  return trimmedContent;
}

/**
 * Options for smart text trimming
 */
export interface SmartTrimOptions {
  maxTokens: number;
  modelId?: string;
  contextSize?: number;  // How many lines of surrounding context to keep
  priorityElements?: string[]; // Elements to prioritize (file paths, etc.)
  deprioritizeElements?: string[]; // Elements to remove first
  preferComplete?: boolean; // Prefer complete sections over partial ones
  logger?: any;
}

/**
 * Smart trimming of repository content keeping the most important parts
 */
export function smartTrimRepositoryContent(
  content: string,
  options: SmartTrimOptions
): string {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  const contextSize = options.contextSize || 3;
  
  const estimatedTokens = estimateTokenCount(content, options.modelId);
  
  // If already under limit, return unchanged
  if (estimatedTokens <= options.maxTokens) {
    return content;
  }
  
  logger.info(`Smart trimming repository content from ${estimatedTokens} tokens to ${options.maxTokens} tokens`);
  
  // Split content into sections (files)
  const filePattern = /^File: (.+?)\n[-=]+\n/gm;
  const fileSections: { fileName: string; content: string; priority: number }[] = [];
  let lastIndex = 0;
  let match;
  
  // Extract file sections
  while ((match = filePattern.exec(content)) !== null) {
    const fileName = match[1];
    const startIndex = match.index;
    
    // Find the end of this file section (start of next file or end of string)
    const nextMatch = filePattern.exec(content);
    const endIndex = nextMatch ? nextMatch.index : content.length;
    filePattern.lastIndex = nextMatch ? nextMatch.index : content.length;
    
    // Extract section content
    const sectionContent = content.substring(startIndex, endIndex);
    
    // Calculate priority based on file type and content
    let priority = 0;
    
    // Check against priority elements
    if (options.priorityElements) {
      for (const element of options.priorityElements) {
        if (fileName.includes(element)) {
          priority += 10;
        }
      }
    }
    
    // Important file indicators
    if (fileName.endsWith('package.json') || 
        fileName.endsWith('tsconfig.json') || 
        fileName.includes('webpack.config') ||
        fileName.includes('README') ||
        fileName.includes('/src/index')) {
      priority += 20;
    }
    
    // Check against deprioritize elements
    if (options.deprioritizeElements) {
      for (const element of options.deprioritizeElements) {
        if (fileName.includes(element)) {
          priority -= 10;
        }
      }
    }
    
    // Deprioritize large files
    const lineCount = sectionContent.split('\n').length;
    if (lineCount > 200) {
      priority -= 5;
    }
    
    fileSections.push({
      fileName,
      content: sectionContent,
      priority
    });
    
    lastIndex = endIndex;
  }
  
  // If there's content before the first file, treat it as intro
  if (fileSections.length > 0) {
    const introContent = content.substring(0, fileSections[0].content.indexOf("File:"));
    if (introContent.trim().length > 0) {
      fileSections.unshift({
        fileName: "Repository Introduction",
        content: introContent,
        priority: 100 // Give highest priority to the intro
      });
    }
  }
  
  // Sort sections by priority (highest first)
  fileSections.sort((a, b) => b.priority - a.priority);
  
  // Trim sections if needed
  const maxTokensCopy = options.maxTokens;
  const trimmedSections: string[] = [];
  let currentTokens = 0;
  
  // First pass: add high priority sections in their entirety
  for (const section of fileSections) {
    const sectionTokens = estimateTokenCount(section.content, options.modelId);
    
    if (currentTokens + sectionTokens <= maxTokensCopy) {
      // Can add the whole section
      trimmedSections.push(section.content);
      currentTokens += sectionTokens;
    } 
    else if (options.preferComplete) {
      // Skip if we prefer complete sections
      continue;
    }
    else {
      // Need to trim this section
      const partialSection = trimContentToTokenLimit(section.content, {
        maxTokens: maxTokensCopy - currentTokens,
        preserveStart: true,
        addEllipsis: true,
        modelId: options.modelId,
        insertMessage: `\n\n[...TRIMMED CONTENT FROM ${section.fileName}...]\n\n`,
        logger
      });
      
      trimmedSections.push(partialSection);
      currentTokens = maxTokensCopy;
      break;
    }
  }
  
  // Combine trimmed result
  const result = trimmedSections.join('\n\n');
  
  logger.info(`Smart trimming completed: ${estimatedTokens} tokens -> ~${currentTokens} tokens`);
  
  return result;
}

/**
 * Calculate token usage for a given prompt and configuration
 */
export function calculateTokenUsage(
  prompt: string,
  response: string,
  modelId?: string
): { 
  promptTokens: number; 
  responseTokens: number; 
  totalTokens: number;
  isWithinLimits: boolean;
} {
  const promptTokens = estimateTokenCount(prompt, modelId);
  const responseTokens = estimateTokenCount(response, modelId);
  const totalTokens = promptTokens + responseTokens;
  
  // Check if within allowed limits
  const isWithinLimits = 
    promptTokens <= TOKEN_LIMITS.MAX_PROMPT_TOKENS &&
    responseTokens <= TOKEN_LIMITS.MAX_RESPONSE_TOKENS &&
    totalTokens <= TOKEN_LIMITS.MAX_TOTAL_TOKENS;
    
  return {
    promptTokens,
    responseTokens,
    totalTokens,
    isWithinLimits
  };
}

/**
 * Extract the most important sections from a repository content
 * based on search query relevance
 */
export function extractRelevantSections(
  content: string,
  query: string,
  options: {
    maxTokens?: number;
    modelId?: string;
    contextSize?: number;
    logger?: any;
  } = {}
): string {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  
  // If no query or it's too short, return original content
  if (!query || query.length < 5) {
    return content;
  }
  
  // Use enhanced keyword extraction
  const keywords = extractKeywords(query, {
    minWordLength: 3,
    maxKeywords: 15,
    filterCommonTerms: true,
    logger
  });
  
  if (keywords.length === 0) {
    logger.info('No significant keywords extracted from query, returning full content');
    return content;
  }
  
  logger.info(`Enhanced keyword extraction found ${keywords.length} keywords: ${keywords.join(', ')}`);
  
  // Split content into file sections
  const fileRegex = /<file[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g;
  const files: Array<{ path: string; content: string }> = [];
  
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    files.push({
      path: match[1],
      content: match[0] // Include the full file tag and content
    });
  }
  
  if (files.length === 0) {
    logger.warn('No file sections found in content, falling back to line-based analysis');
    return fallbackLineBasedExtraction(content, keywords, options);
  }
  
  // Calculate relevance score for each file
  const scoredFiles = files.map(file => ({
    ...file,
    score: calculateRelevanceScore(file.path, file.content, keywords, {
      contentWeight: 2,
      pathWeight: 3,
      proximityBonus: true,
      logger
    })
  }));
  
  // Sort files by relevance score (highest first)
  scoredFiles.sort((a, b) => b.score - a.score);
  
  // Take top N files or until we hit token limit
  const maxSections = 15; // Default max sections to consider
  const maxTokens = options.maxTokens || 200000;
  
  let extractedContent = '';
  let currentTokens = 0;
  let includedFiles = 0;
  
  // Always include repository intro if present (content before first file tag)
  const introMatch = content.match(/^([\s\S]*?)(?:<file|$)/);
  if (introMatch && introMatch[1].trim()) {
    const introContent = introMatch[1];
    extractedContent = introContent;
    currentTokens = estimateTokenCount(introContent, options.modelId);
    logger.debug(`Including repository intro (${currentTokens} tokens)`);
  }
  
  // Add scored files until we hit limit
  for (const file of scoredFiles) {
    // Skip files with zero score
    if (file.score === 0) continue;
    
    const fileTokens = estimateTokenCount(file.content, options.modelId);
    
    if (currentTokens + fileTokens <= maxTokens && includedFiles < maxSections) {
      extractedContent += (extractedContent && !extractedContent.endsWith('\n') ? '\n\n' : '') + file.content;
      currentTokens += fileTokens;
      includedFiles++;
      logger.debug(`Including file: ${file.path} with score ${file.score.toFixed(2)} (${fileTokens} tokens)`);
    } else {
      break;
    }
  }
  
  logger.info(`Enhanced extraction included ${includedFiles} files totaling ${currentTokens} tokens based on query relevance`);
  
  // If we didn't find any relevant files, return the original content
  return extractedContent || content;
}

/**
 * Fallback to line-based extraction when file sections aren't available
 */
function fallbackLineBasedExtraction(
  content: string,
  keywords: string[],
  options: {
    maxTokens?: number;
    modelId?: string;
    contextSize?: number;
    logger?: any;
  } = {}
): string {
  const logger = options.logger || { debug: () => {}, info: () => {}, error: () => {} };
  const contextSize = options.contextSize || 5;
  const maxTokens = options.maxTokens || 200000;
  
  // Split content into lines
  const lines = content.split('\n');
  
  // Score each line based on keyword matches
  const lineScores = lines.map(line => {
    let score = 0;
    const lowerLine = line.toLowerCase();
    
    for (const keyword of keywords) {
      if (lowerLine.includes(keyword)) {
        score += 1;
        
        // Add bonus for exact match or match at word boundary
        const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (wordBoundaryRegex.test(lowerLine)) {
          score += 0.5;
        }
      }
    }
    
    return score;
  });
  
  // Find sections with high scores (contiguous lines with scores > 0)
  const sections: Array<{ startLine: number; endLine: number; score: number }> = [];
  let inSection = false;
  let sectionStart = 0;
  let sectionScore = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (lineScores[i] > 0) {
      if (!inSection) {
        inSection = true;
        sectionStart = Math.max(0, i - contextSize); // Include preceding context
        sectionScore = 0;
      }
      sectionScore += lineScores[i];
    } else if (inSection) {
      // End section if we've gone contextSize lines without a match
      if (i - sectionStart - contextSize > contextSize) {
        sections.push({
          startLine: sectionStart,
          endLine: Math.min(lines.length - 1, i + contextSize), // Include trailing context
          score: sectionScore
        });
        inSection = false;
      }
    }
  }
  
  // Close final section if needed
  if (inSection) {
    sections.push({
      startLine: sectionStart,
      endLine: Math.min(lines.length - 1, lines.length),
      score: sectionScore
    });
  }
  
  // Sort sections by score (highest first)
  sections.sort((a, b) => b.score - a.score);
  
  // Extract most relevant sections until we hit token limit
  let extractedContent = '';
  let currentTokens = 0;
  
  for (const section of sections) {
    const sectionContent = lines.slice(section.startLine, section.endLine + 1).join('\n');
    const sectionTokens = estimateTokenCount(sectionContent, options.modelId);
    
    if (currentTokens + sectionTokens <= maxTokens) {
      extractedContent += (extractedContent ? '\n\n' : '') + sectionContent;
      currentTokens += sectionTokens;
    } else {
      break;
    }
  }
  
  logger.info(`Fallback extraction selected ${sections.length} sections totaling ${currentTokens} tokens`);
  
  return extractedContent || content; // Fall back to original if no sections found
}