#!/usr/bin/env node

/**
 * Test script to verify that .repomixignore is working properly
 * 
 * This script:
 * 1. Calls the repomix CLI with and without the .repomixignore file
 * 2. Compares the number of files and tokens in each output
 * 3. Verifies that patterns in .repomixignore are being excluded
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const repoDir = process.cwd();
const outputWithIgnore = path.join(repoDir, '.repomix-test-with-ignore.txt');
const outputWithoutIgnore = path.join(repoDir, '.repomix-test-without-ignore.txt');
const repomixIgnorePath = path.join(repoDir, '.repomixignore');
const repomixIgnoreBackup = path.join(repoDir, '.repomixignore.backup');

// ANSI Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Utility functions
function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`ERROR: ${message}`, colors.red);
}

function success(message) {
  log(`SUCCESS: ${message}`, colors.green);
}

function info(message) {
  log(`INFO: ${message}`, colors.cyan);
}

function warning(message) {
  log(`WARNING: ${message}`, colors.yellow);
}

function header(message) {
  log('\n' + '='.repeat(60), colors.blue);
  log(message.padStart(30 + message.length/2), colors.blue);
  log('='.repeat(60) + '\n', colors.blue);
}

function countFilesInOutput(outputPath) {
  try {
    const content = fs.readFileSync(outputPath, 'utf-8');
    const fileMatches = content.match(/<file/g);
    return fileMatches ? fileMatches.length : 0;
  } catch (err) {
    error(`Failed to read output file: ${err.message}`);
    return 0;
  }
}

function estimateTokens(outputPath) {
  try {
    const stats = fs.statSync(outputPath);
    // Very rough estimate: 1 token ~= 4 characters
    return Math.floor(stats.size / 4);
  } catch (err) {
    error(`Failed to get file stats: ${err.message}`);
    return 0;
  }
}

function findPatternsInOutput(outputPath, patterns) {
  try {
    const content = fs.readFileSync(outputPath, 'utf-8');
    const results = {};
    
    for (const pattern of patterns) {
      // Convert glob pattern to a simpler string to search for
      const searchPattern = pattern.replace(/\*\*/g, '')
                                  .replace(/\*/g, '')
                                  .replace(/\\/g, '/')
                                  .trim();
      
      if (searchPattern && searchPattern.length > 2) {
        const regex = new RegExp(`<file[^>]+path="[^"]*${escapeRegExp(searchPattern)}[^"]*"`, 'g');
        const matches = content.match(regex);
        results[pattern] = matches ? matches.length : 0;
      }
    }
    
    return results;
  } catch (err) {
    error(`Failed to search patterns in output: ${err.message}`);
    return {};
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRepomixIgnorePatterns() {
  try {
    const content = fs.readFileSync(repomixIgnorePath, 'utf-8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (err) {
    error(`Failed to read .repomixignore patterns: ${err.message}`);
    return [];
  }
}

// Main test function
async function runTest() {
  header('REPOMIXIGNORE TEST');
  
  // Check if .repomixignore exists
  if (!fs.existsSync(repomixIgnorePath)) {
    error('.repomixignore file not found in the current directory!');
    return;
  }
  
  info('Found .repomixignore file');
  
  // Backup .repomixignore
  try {
    fs.copyFileSync(repomixIgnorePath, repomixIgnoreBackup);
    info('Created backup of .repomixignore');
  } catch (err) {
    error(`Failed to backup .repomixignore: ${err.message}`);
    return;
  }
  
  try {
    // Step 1: Run with .repomixignore
    info('Running Repomix with .repomixignore...');
    execSync(`npx -y repomix ${repoDir} -o "${outputWithIgnore}" --ignorefile="${repomixIgnorePath}"`, { 
      stdio: 'pipe' 
    });
    
    // Step 2: Temporarily move .repomixignore
    fs.renameSync(repomixIgnorePath, `${repomixIgnorePath}.temp`);
    
    // Step 3: Run without .repomixignore
    info('Running Repomix without .repomixignore...');
    execSync(`npx -y repomix ${repoDir} -o "${outputWithoutIgnore}"`, { 
      stdio: 'pipe' 
    });
    
    // Step 4: Restore .repomixignore
    fs.renameSync(`${repomixIgnorePath}.temp`, repomixIgnorePath);
    
    // Step 5: Compare results
    const fileCountWithIgnore = countFilesInOutput(outputWithIgnore);
    const fileCountWithoutIgnore = countFilesInOutput(outputWithoutIgnore);
    
    const tokensWithIgnore = estimateTokens(outputWithIgnore);
    const tokensWithoutIgnore = estimateTokens(outputWithoutIgnore);
    
    const fileDifference = fileCountWithoutIgnore - fileCountWithIgnore;
    const tokenDifference = tokensWithoutIgnore - tokensWithIgnore;
    
    header('TEST RESULTS');
    
    info(`With .repomixignore: ${fileCountWithIgnore} files, ~${tokensWithIgnore} tokens`);
    info(`Without .repomixignore: ${fileCountWithoutIgnore} files, ~${tokensWithoutIgnore} tokens`);
    info(`Difference: ${fileDifference} files, ~${tokenDifference} tokens`);
    
    const percentFilesReduced = ((fileDifference / fileCountWithoutIgnore) * 100).toFixed(2);
    const percentTokensReduced = ((tokenDifference / tokensWithoutIgnore) * 100).toFixed(2);
    
    info(`File reduction: ${percentFilesReduced}%`);
    info(`Token reduction: ${percentTokensReduced}%`);
    
    // Step 6: Check if specific patterns are working
    const ignorePatterns = getRepomixIgnorePatterns();
    const samplePatterns = ignorePatterns.slice(0, 10); // Check first 10 patterns
    
    header('PATTERN TESTING');
    info(`Testing ${samplePatterns.length} sample patterns from .repomixignore`);
    
    const withIgnoreMatches = findPatternsInOutput(outputWithIgnore, samplePatterns);
    const withoutIgnoreMatches = findPatternsInOutput(outputWithoutIgnore, samplePatterns);
    
    let patternSuccessCount = 0;
    let patternTotalCount = 0;
    
    for (const pattern of samplePatterns) {
      if (pattern.length < 3 || pattern.includes('**/')) continue;
      
      patternTotalCount++;
      const withIgnoreCount = withIgnoreMatches[pattern] || 0;
      const withoutIgnoreCount = withoutIgnoreMatches[pattern] || 0;
      
      if (withIgnoreCount < withoutIgnoreCount) {
        success(`Pattern "${pattern}" - Excluded ${withoutIgnoreCount - withIgnoreCount} files`);
        patternSuccessCount++;
      } else if (withoutIgnoreCount > 0) {
        warning(`Pattern "${pattern}" - Not working as expected: ${withIgnoreCount} files with ignore, ${withoutIgnoreCount} without`);
      } else {
        info(`Pattern "${pattern}" - No matching files found in either output`);
      }
    }
    
    // Step 7: Overall assessment
    header('OVERALL ASSESSMENT');
    
    if (fileDifference > 0 && tokenDifference > 0) {
      if (percentFilesReduced > 20) {
        success(`The .repomixignore file is working well! Reduced files by ${percentFilesReduced}% and tokens by ${percentTokensReduced}%`);
      } else {
        warning(`The .repomixignore file is working but could be more effective. Consider adding more patterns.`);
      }
    } else {
      error(`The .repomixignore file doesn't seem to be working. No significant reduction in files or tokens.`);
    }
    
    if (patternTotalCount > 0) {
      const patternSuccessRate = ((patternSuccessCount / patternTotalCount) * 100).toFixed(2);
      info(`Pattern test success rate: ${patternSuccessRate}% (${patternSuccessCount}/${patternTotalCount})`);
    }
    
    // Step 8: Cleanup
    try {
      fs.unlinkSync(outputWithIgnore);
      fs.unlinkSync(outputWithoutIgnore);
      fs.unlinkSync(repomixIgnoreBackup);
      info('Cleaned up temporary files');
    } catch (err) {
      warning(`Some cleanup failed: ${err.message}`);
    }
    
  } catch (err) {
    error(`Test failed: ${err.message}`);
    
    // Restore .repomixignore if needed
    if (fs.existsSync(`${repomixIgnorePath}.temp`)) {
      fs.renameSync(`${repomixIgnorePath}.temp`, repomixIgnorePath);
    }
    
    // Restore from backup if needed
    if (!fs.existsSync(repomixIgnorePath) && fs.existsSync(repomixIgnoreBackup)) {
      fs.copyFileSync(repomixIgnoreBackup, repomixIgnorePath);
    }
  }
}

// Run the test
runTest().catch(err => {
  error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
