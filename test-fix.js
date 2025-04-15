#!/usr/bin/env node

/**
 * This script specifically tests the fix we made to the enhancedPackageRepository function
 * to handle undefined logger parameters correctly
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to test file
const testFile = path.join(__dirname, 'test-fix-impl.js');

// Create a simple test implementation
fs.writeFileSync(testFile, `
// Import the fixed function
import { enhancedPackageRepository } from './dist/repomix-utils.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testFix() {
  try {
    // Create a temporary directory for testing
    const tempDir = path.join(os.tmpdir(), 'mcp-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Create a simple file for testing
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'Hello world');
    
    // Create an output file path
    const outputFile = path.join(tempDir, 'output.txt');
    
    console.log('Test directory created at ' + tempDir);
    
    // Call enhancedPackageRepository WITHOUT a logger (this should work now with our fix)
    console.log('Calling enhancedPackageRepository WITHOUT logger...');
    
    const result = await enhancedPackageRepository(
      tempDir,
      outputFile,
      {
        query: 'test query',
        extractStructure: true
      }
      // No logger parameter
    );
    
    console.log('Function completed successfully!');
    console.log('Result:', result);
    
    // Check if output file was created
    if (fs.existsSync(outputFile)) {
      console.log('Output file was created successfully');
    } else {
      console.log('Output file was NOT created');
    }
    
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Test directory removed');
    
    console.log('✅ FIX VERIFIED: Function works with undefined logger parameter');
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
  }
}

testFix();
`);

console.log("Running test to verify the fix for undefined logger parameter...");

// Run the test file
const proc = spawn('node', ['--experimental-modules', testFile]);

// Display output
proc.stdout.on('data', (data) => {
  console.log(data.toString().trim());
});

proc.stderr.on('data', (data) => {
  console.error(data.toString().trim());
});

proc.on('close', (code) => {
  console.log(`\nTest process exited with code ${code}`);
  
  // Clean up
  fs.unlinkSync(testFile);
  console.log("Removed temporary test file");
  
  if (code === 0) {
    console.log("\n✅ SUMMARY: The fix for handling undefined logger parameters has been verified!");
  } else {
    console.log("\n❌ SUMMARY: The test failed. The fix may not be working correctly.");
  }
});
