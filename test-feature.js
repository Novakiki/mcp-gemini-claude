#!/usr/bin/env node

/**
 * Test script specifically for the hierarchical analysis feature
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the MCP server executable
const mcpServerPath = path.join(__dirname, 'dist', 'index.js');

// Simple way to handle async/await in a script
async function main() {
  console.log("Testing Hierarchical Analysis Feature...");
  console.log("----------------------------------------");
  
  // Launch the MCP server process
  const serverProcess = spawn('node', [mcpServerPath]);
  
  // Listen for server output
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('debug') || output.length === 0) return; // Skip debug logs
    console.log(`[Server]: ${output}`);
  });
  
  // Create a test request for hierarchical analysis
  const analysisRequest = {
    type: "tool_call",
    name: "analyze-repository",
    params: {
      query: "Give me a high-level architectural overview of this codebase",
      directory: __dirname,
      analysisLevel: "overview",
      model: "gemini-1.5-pro" // Make sure we're using a model that exists
    }
  };
  
  console.log("Sending analysis request with hierarchical approach enabled...");
  
  // Send the request to the server
  serverProcess.stdin.write(JSON.stringify(analysisRequest));
  serverProcess.stdin.end();
  
  // Collect the response
  let responseData = '';
  serverProcess.stdout.on('data', (data) => {
    responseData += data.toString();
  });
  
  // Wait for response to complete
  await new Promise((resolve) => {
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      
      // Process the response
      try {
        const response = JSON.parse(responseData);
        console.log("\nResponse received!");
        console.log("----------------------------------------");
        
        // Check if we received a component map (evidence of hierarchical analysis)
        if (response.metadata && response.metadata.componentMap) {
          console.log("✅ Hierarchical analysis success! Component map detected:");
          console.log(JSON.stringify(response.metadata.componentMap, null, 2));
        } else {
          console.log("❌ Hierarchical analysis may not be working correctly. No component map found.");
        }
        
        // Show a brief response summary
        console.log("\nResponse summary:");
        if (Array.isArray(response.content)) {
          const text = response.content[0].text;
          console.log("-", text.substring(0, 200) + "...");
        }
      } catch (error) {
        console.log("Error parsing response:", error);
        console.log("Raw response:", responseData);
      }
      
      resolve();
    });
  });
}

// Run the test
main().catch(console.error);
