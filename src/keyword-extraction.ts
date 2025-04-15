/**
 * Enhanced keyword extraction for improved file filtering
 */
import { Logger } from './types.js';

// Common programming terms to exclude from keyword matching
// to avoid over-matching on generic terms
const COMMON_PROGRAMMING_TERMS = new Set([
  // General programming terms
  'function', 'class', 'variable', 'method', 'interface', 'type', 'module',
  'import', 'export', 'return', 'public', 'private', 'protected', 'static',
  'const', 'let', 'var', 'void', 'null', 'undefined', 'object', 'array', 
  'string', 'number', 'boolean', 'true', 'false', 'async', 'await', 'promise',
  'try', 'catch', 'finally', 'throw', 'error', 'exception', 'event', 'callback',
  
  // Common data structures
  'list', 'array', 'map', 'set', 'dictionary', 'tree', 'graph', 'queue', 'stack',
  
  // Common operations
  'add', 'remove', 'delete', 'update', 'get', 'set', 'create', 'init', 'start',
  'stop', 'pause', 'resume', 'load', 'save', 'read', 'write', 'open', 'close',
  
  // Common programming concepts
  'algorithm', 'api', 'bug', 'cache', 'code', 'compiler', 'debug', 'feature',
  'framework', 'implementation', 'library', 'package', 'pattern', 'performance',
  'programming', 'reference', 'software', 'solution', 'source', 'syntax', 'system',
  
  // Common file types
  'file', 'folder', 'directory', 'path', 'extension', 'json', 'xml', 'html',
  'css', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'md', 'txt',
  
  // Common UI terms
  'button', 'input', 'form', 'field', 'label', 'select', 'option', 'checkbox',
  'radio', 'dropdown', 'menu', 'navigation', 'sidebar', 'header', 'footer', 'modal',
  
  // Common database terms
  'database', 'table', 'column', 'row', 'query', 'schema', 'index', 'field',
  'record', 'primary', 'foreign', 'key', 'value', 'relation',
  
  // Common web terms
  'http', 'https', 'url', 'uri', 'request', 'response', 'client', 'server',
  'browser', 'cookie', 'session', 'token', 'header', 'body', 'param', 'endpoint',
  
  // Common networking terms
  'network', 'socket', 'protocol', 'ip', 'tcp', 'udp', 'dns', 'port', 'host',
  'domain', 'ssl', 'tls', 'connection', 'packet', 'firewall', 'proxy'
]);

/**
 * Extract keywords from a query string
 */
export function extractKeywords(query: string, options: {
  minWordLength?: number;
  maxKeywords?: number;
  filterCommonTerms?: boolean;
  logger?: Logger;
} = {}): string[] {
  const {
    minWordLength = 3,
    maxKeywords = 15,
    filterCommonTerms = true,
    logger
  } = options;

  // Convert to lowercase
  const lowerQuery = query.toLowerCase();
  
  // Remove code-like patterns
  // This removes things like function calls, paths, URLs, etc.
  const cleanedQuery = lowerQuery
    .replace(/`[^`]+`/g, '') // Remove backtick code blocks
    .replace(/\([^)]*\)/g, '') // Remove parentheses and contents
    .replace(/\[[^\]]*\]/g, '') // Remove square brackets and contents
    .replace(/\{[^}]*\}/g, '') // Remove curly braces and contents
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .replace(/[a-z0-9_-]+\.[a-z0-9_-]+/g, '') // Remove things like file.ext
    .replace(/[a-z0-9_-]+\/[a-z0-9_-]+/g, ''); // Remove paths like dir/file
  
  // Extract words, removing punctuation
  let words = cleanedQuery
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .split(' ')
    .filter(word => word.length >= minWordLength);
  
  // Filter out common programming terms if requested
  if (filterCommonTerms) {
    words = words.filter(word => !COMMON_PROGRAMMING_TERMS.has(word));
  }
  
  // Count word occurrences and sort by frequency
  const wordCounts = new Map<string, number>();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  // Combine similar words based on common stemming patterns
  // (This is a simple approach; a real stemmer would be more sophisticated)
  const stems = new Map<string, string[]>();
  
  for (const word of wordCounts.keys()) {
    // Very basic stemming rules
    let stem = word;
    
    // Remove common suffixes
    if (stem.endsWith('ing')) stem = stem.slice(0, -3);
    else if (stem.endsWith('ed')) stem = stem.slice(0, -2);
    else if (stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1);
    else if (stem.endsWith('es')) stem = stem.slice(0, -2);
    
    // Add to stem group
    if (!stems.has(stem)) {
      stems.set(stem, []);
    }
    stems.get(stem)!.push(word);
  }
  
  // For each stem group, keep the most frequent word
  const stemmedWords = new Map<string, number>();
  
  for (const [stem, wordGroup] of stems.entries()) {
    if (wordGroup.length === 1) {
      // Single word in group, keep its original count
      stemmedWords.set(wordGroup[0], wordCounts.get(wordGroup[0]) || 0);
    } else {
      // Multiple words in group, find the one with highest count
      let bestWord = wordGroup[0];
      let bestCount = wordCounts.get(bestWord) || 0;
      
      for (let i = 1; i < wordGroup.length; i++) {
        const word = wordGroup[i];
        const count = wordCounts.get(word) || 0;
        
        if (count > bestCount) {
          bestWord = word;
          bestCount = count;
        }
      }
      
      // Sum the counts of all words in the group
      const totalCount = wordGroup.reduce((sum, word) => sum + (wordCounts.get(word) || 0), 0);
      stemmedWords.set(bestWord, totalCount);
    }
  }
  
  // Get words sorted by frequency (highest first)
  const sortedWords = [...stemmedWords.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
  
  // Take top N keywords
  const keywords = sortedWords.slice(0, maxKeywords);
  
  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g;
  const phrases: string[] = [];
  
  let match;
  while ((match = phraseRegex.exec(query)) !== null) {
    if (match[1].length >= minWordLength) {
      phrases.push(match[1].toLowerCase());
    }
  }
  
  // Combine keywords and phrases
  const combined = [...keywords, ...phrases];
  
  // Log the extracted keywords
  if (logger) {
    logger.debug(`Extracted ${combined.length} keywords from query:`, combined);
  }
  
  return combined;
}

/**
 * Calculate keyword relevance score
 */
export function calculateRelevanceScore(
  filePath: string, 
  fileContent: string | null,
  keywords: string[],
  options: {
    contentWeight?: number;
    pathWeight?: number;
    proximityBonus?: boolean;
    logger?: Logger;
  } = {}
): number {
  const {
    contentWeight = 2,
    pathWeight = 3,
    proximityBonus = true,
    logger
  } = options;
  
  // Normalize the file path
  const normalizedPath = filePath.toLowerCase();
  
  // Initialize score
  let score = 0;
  
  // Score path matches (higher weight as path is more significant)
  keywords.forEach(keyword => {
    // Exact path component match gets highest score
    const pathComponents = normalizedPath.split('/');
    const isExactComponent = pathComponents.some(component => 
      component === keyword || component.startsWith(keyword + '.'));
      
    if (isExactComponent) {
      score += pathWeight * 2;
    } else if (normalizedPath.includes(keyword)) {
      score += pathWeight;
    }
  });
  
  // Score content matches if we have content
  if (fileContent) {
    const normalizedContent = fileContent.toLowerCase();
    
    // Count keyword occurrences in content
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = normalizedContent.match(regex);
      
      if (matches) {
        score += matches.length * contentWeight;
      }
    });
    
    // Boost score for keywords that appear close to each other (proximity bonus)
    if (proximityBonus && keywords.length > 1) {
      const positions = new Map<string, number[]>();
      
      // Find positions of all keyword matches
      keywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const keywordPositions: number[] = [];
        
        let match;
        while ((match = regex.exec(normalizedContent)) !== null) {
          keywordPositions.push(match.index);
        }
        
        if (keywordPositions.length > 0) {
          positions.set(keyword, keywordPositions);
        }
      });
      
      // Calculate proximity bonus
      if (positions.size > 1) {
        let proximityScore = 0;
        const keywords = [...positions.keys()];
        
        // Compare each pair of keywords
        for (let i = 0; i < keywords.length; i++) {
          const keywordA = keywords[i];
          const positionsA = positions.get(keywordA)!;
          
          for (let j = i + 1; j < keywords.length; j++) {
            const keywordB = keywords[j];
            const positionsB = positions.get(keywordB)!;
            
            // Find closest pair of positions
            let minDistance = Infinity;
            
            for (const posA of positionsA) {
              for (const posB of positionsB) {
                const distance = Math.abs(posA - posB);
                minDistance = Math.min(minDistance, distance);
              }
            }
            
            // Add bonus based on proximity (closer is better)
            if (minDistance < 100) {
              // Exponential decay formula: the closer, the higher the bonus
              const proximityBonus = 5 * Math.exp(-minDistance / 50);
              proximityScore += proximityBonus;
            }
          }
        }
        
        score += proximityScore;
      }
    }
  }
  
  return score;
}

/**
 * Enhanced version of extractRelevantSections from token-management.ts
 */
export function extractRelevantSections(
  content: string,
  query: string,
  options: {
    maxSections?: number;
    logger?: Logger;
  } = {}
): string {
  const {
    maxSections = 10,
    logger
  } = options;
  
  // Extract keywords from query
  const keywords = extractKeywords(query, { logger });
  
  if (keywords.length === 0) {
    // No keywords found, return original content
    return content;
  }
  
  // Split content into sections (files)
  const fileRegex = /<file[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g;
  const files: Array<{ path: string; content: string }> = [];
  
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    files.push({
      path: match[1],
      content: match[0]
    });
  }
  
  // Calculate relevance score for each file
  const scoredFiles = files.map(file => ({
    ...file,
    score: calculateRelevanceScore(file.path, file.content, keywords, { logger })
  }));
  
  // Sort files by relevance score (highest first)
  scoredFiles.sort((a, b) => b.score - a.score);
  
  // Take top N files
  const relevantFiles = scoredFiles.slice(0, maxSections);
  
  // Log results
  if (logger) {
    logger.info(`Selected ${relevantFiles.length} most relevant files out of ${files.length} total`);
    logger.debug(`Top relevant files:`, relevantFiles.map(f => `${f.path} (score: ${f.score.toFixed(2)})`));
  }
  
  // Return combined content
  return relevantFiles.map(file => file.content).join('\n');
}
