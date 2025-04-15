# Gemini-Claude Bridge MCP Server

This Model Context Protocol (MCP) server enables Claude to leverage Google's Gemini model for code repository analysis tasks. It uses Repomix to efficiently package repository content before sending it to Gemini for specialized processing.

## Features

- **Enhanced Repository Analysis**: Analyze entire code repositories with Gemini's AI capabilities
- **Smart File Filtering**: Intelligently prioritizes files based on query relevance with advanced keyword extraction
- **Specialized Analysis Templates**: Different analysis types for security, performance, architecture, etc.
- **File-Specific Analysis**: Focus analysis on specific files within a repository
- **Hierarchical Analysis**: Multi-level analysis from high-level overview to detailed component examination
- **Direct Chat**: Have a general conversation directly with Gemini
- **Advanced Token Management**: Smart trimming of content to fit within token limits
- **Configurable Parameters**: Control temperature, token count, and reasoning depth
- **Model Selection**: Choose from different Gemini models (1.5-pro, 1.5-flash, 1.0-pro, 1.0-pro-vision)
- **Persistent Configuration**: Save and reuse your preferred settings
- **Multi-Level Fallback Strategy**: Ensures robust repository analysis even when primary methods fail

## Key Improvements

### Hierarchical Analysis with Multi-Level Fallback

Our hierarchical analysis approach transforms how you can understand complex codebases while ensuring reliability through a multi-level fallback strategy:

- **Three-Level Analysis Approach:**
  - **Overview Level:** Get a high-level architectural understanding that identifies key components
  - **Component Level:** Drill down into specific components with detailed analysis
  - **Detail Level:** Examine fine-grained implementation details once you've identified areas of interest

- **Robust Fallback Strategy:**
  - **Primary Method:** Repomix via MCP for optimal performance
  - **Secondary Method:** Direct Repomix library integration
  - **Tertiary Method:** Custom simplified packaging solution

This approach ensures analysis continues even when external dependencies fail, making it ideal for mission-critical deployments.

### Advanced Smart Filtering

Our enhanced smart filtering dramatically improves the relevance of code analysis:

- **NLP-Inspired Keyword Extraction:** Understands the technical significance of your query terms
- **Proximity Analysis:** Detects when related terms appear close together in code
- **Context-Aware Scoring:** Prioritizes files based on query relevance, file importance, and analysis type
- **Critical File Identification:** Always includes essential configuration and documentation files

This means more precise and relevant results, especially for complex technical queries.

## Prerequisites

- Node.js 18+ installed
- Google Gemini API key
- Claude Desktop for MCP client access

## Installation

### Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/Novakiki/mcp-gemini-claude.git
   cd mcp-gemini-claude
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

4. Set your Gemini API key and configuration:
   ```bash
   export GEMINI_API_KEY="your_gemini_api_key_here"
   # Optional: Set default model
   export GEMINI_DEFAULT_MODEL="gemini-1.5-pro"  # or any other supported model
   ```

5. Run the server directly:
   ```bash
   npm start
   ```

### Global Installation

To install this tool globally:

```bash
npm install -g .
export GEMINI_API_KEY="your_gemini_api_key_here"
mcp-gemini-claude
```

## Configuration with Claude Desktop

To use this MCP server with Claude Desktop, add the following to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "gemini-bridge": {
      "command": "mcp-gemini-claude",
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "GEMINI_DEFAULT_MODEL": "gemini-1.5-pro"  # Optional: default model
      }
    }
  }
}
```

Alternatively, for development:

```json
{
  "mcpServers": {
    "gemini-bridge": {
      "command": "node",
      "args": ["/path/to/mcp-gemini-claude/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "GEMINI_DEFAULT_MODEL": "gemini-1.5-pro"  # Optional: default model
      }
    }
  }
}
```

## Testing and Diagnostics

### Running Diagnostic Tests

We provide several diagnostic tools to ensure your environment is correctly configured:

1. **Repomix Availability Test:**
   ```bash
   chmod +x ./run-diagnostic.sh
   ./run-diagnostic.sh
   ```
   This tests whether Repomix is working correctly and which fallback level is being used.

2. **Hierarchical Analysis Test:**
   ```bash
   chmod +x ./run-test.sh
   ./run-test.sh
   ```
   This performs a complete hierarchical analysis test to ensure the entire pipeline works correctly.

3. **Debug Mode:**
   ```bash
   chmod +x ./run-diagnostic-debug.sh
   ./run-diagnostic-debug.sh
   ```
   This provides detailed debug information to help diagnose issues.

### Understanding Diagnostic Results

- **Exit code 0:** Test passed successfully
- **Exit code 1:** Partial success (fallback method was used)
- **Exit code 2:** Complete failure (all methods failed)

## Usage

Once configured, you can ask Claude to use the Gemini bridge for repository analysis:

### Analyzing a Repository

```
Can you use gemini-bridge to analyze-repository in the current directory to explain the authentication system?
```

### Specialized Analysis Types

You can specify different analysis types to get specialized insights:

```
Can you use gemini-bridge to analyze-repository with analysisType="security" to audit the security of this codebase?
```

### Hierarchical Analysis

You can use the hierarchical analysis approach to get a structured, multi-level understanding of the codebase:

```
# Start with a high-level overview that identifies key components
Can you use gemini-bridge to analyze-repository with analysisLevel="overview" to get a high-level view of the architecture?

# Then analyze a specific component in detail
Can you use gemini-bridge to analyze-repository with analysisLevel="component" and component="authentication" to analyze the auth system in detail?

# Finally, do a deep dive into specific implementation details
Can you use gemini-bridge to analyze-repository with analysisLevel="detail" and component="authentication/password-hashing" to examine the password security in detail?
```

Available analysis types:
- `architecture`: Focus on code structure, organization, and design patterns
- `security`: Evaluate authentication, authorization, and security vulnerabilities
- `performance`: Identify bottlenecks and optimization opportunities
- `documentation`: Generate comprehensive documentation for the codebase
- `testing`: Analyze test coverage and suggest improvements
- `comprehensive`: Perform a thorough analysis across multiple dimensions

### Analyzing Specific Files

```
Can you use gemini-bridge to analyze-files for the following files: src/auth.js, src/users.js? Please explain how they work together.
```

### Chatting Directly with Gemini

You can also have a direct conversation with Gemini without analyzing code:

```
Can you use gemini-bridge to chat-with-gemini about the latest advancements in AI?
```

```
Can you use gemini-bridge to chat-with-gemini with prompt="Explain quantum computing simply"?
```

### Model Selection

You can choose from different Gemini models to best suit your task:

```
Can you use gemini-bridge to chat-with-gemini with model="gemini-1.5-flash" and prompt="Compare the performance of different neural network architectures"?
```

Available models include:
- `gemini-1.5-pro`: Most capable model with high context window (default)
- `gemini-1.5-flash`: Fast, efficient model for quicker responses
- `gemini-1.0-pro`: Original Gemini Pro model
- `gemini-1.0-pro-vision`: Vision-capable model for image analysis

### Advanced Options

You can also specify additional parameters:

```
Can you use gemini-bridge to analyze-repository with reasoningEffort=high and temperature=0.3 to provide a detailed code review?
```

### Reasoning Effort Levels

Use the `reasoningEffort` parameter to control the depth and detail of analysis:

- `low`: Quick, concise analysis focusing on the most important aspects
- `medium`: Balanced analysis with sufficient detail and reasoning (default)
- `high`: Very thorough, detailed analysis with step-by-step reasoning and multiple perspectives

## Configuration System

You can configure the Gemini Bridge MCP server using the `configure-gemini` tool:

```
Can you use gemini-bridge to configure-gemini with defaultModel="gemini-1.5-flash"?
```

This configuration will be saved and used for all future requests unless overridden explicitly. The settings are stored in `~/.config/mcp-gemini-claude/config.json`.

### Available Configuration Options

- `defaultModel`: Set the default Gemini model (e.g., "gemini-1.5-pro")
- `defaultTemperature`: Set the default temperature for generation (0.0 to 1.0)
- `defaultMaxTokens`: Set the default maximum tokens for responses

### Viewing Current Configuration

You can view the current configuration using:

```
Can you use gemini-bridge to get config://gemini/models?
```

This will show you the current settings and available models.

### Advanced Usage with Configuration

You can combine the configuration system with per-request parameters:

```
# First configure default settings
Can you use gemini-bridge to configure-gemini with defaultModel="gemini-1.5-pro" and defaultTemperature=0.9?

# Then override only what you need per request
Can you use gemini-bridge to chat-with-gemini with prompt="Compare transformers and RNNs" and temperature=0.5?
```

The per-request parameters will take precedence over your configured defaults.

## Advanced Usage Examples

Here are some high-value examples that demonstrate the full capabilities of the Gemini-Claude Bridge:

### Comprehensive Security Audit

```
Can you use gemini-bridge to analyze-repository with analysisType="security" and analysisLevel="overview" to perform a security audit of our authentication system? Focus on potential vulnerabilities, data validation, and secure data handling patterns.
```

### Performance Optimization of Critical Components

```
Can you use gemini-bridge to analyze-repository with analysisType="performance" and reasoningEffort="high" to identify bottlenecks in our data processing pipeline? Look for N+1 query issues, inefficient algorithms, and memory leaks.
```

### Component-Focused Architecture Review

```
# First, get an architectural overview
Can you use gemini-bridge to analyze-repository with analysisLevel="overview" and reasoningEffort="high" to create a comprehensive map of our system architecture?

# Then analyze the most critical component
Can you use gemini-bridge to analyze-repository with analysisLevel="component" and component="payment-processing" to assess the design patterns, error handling, and integration points of our payment system?

# Finally, dive into a specific implementation concern
Can you use gemini-bridge to analyze-repository with analysisLevel="detail" and component="payment-processing/transaction-validation" to evaluate our transaction validation logic for edge cases and security considerations?
```

### Advanced Issue Debugging

```
Can you use gemini-bridge to analyze-repository with analysisType="bug" and query="race condition in concurrent user sessions" to help identify the root cause of our intermittent session corruption issue?
```

### Technical Documentation Generation

```
Can you use gemini-bridge to analyze-repository with analysisType="documentation" to create comprehensive technical documentation for our API endpoints? Include authentication requirements, request/response formats, and error handling.
```

### Comprehensive API Surface Analysis

```
Can you use gemini-bridge to analyze-files for the following files: src/api/*.ts, src/controllers/*.ts? Please analyze the entire API surface, focusing on consistency, RESTful design principles, and error handling patterns.
```

### GitHub Repository Deep Dive

```
Can you use gemini-bridge to analyze-github-repository with repository="organization/repo-name" and analysisType="architecture" and reasoningEffort="high" to provide a comprehensive analysis of this open-source project's architecture?
```

### Smart Code Refactoring

```
Can you use gemini-bridge to analyze-repository with query="refactor our authentication middleware to support both JWT and OAuth2 authentication strategies" and analysisLevel="component" and component="middleware/auth"?
```

### Integration Pattern Analysis

```
Can you use gemini-bridge to analyze-repository with query="how our system integrates with third-party services" to map all external API dependencies and evaluate our retry and failure handling strategies?
```

### Test Coverage Analysis

```
Can you use gemini-bridge to analyze-repository with analysisType="testing" to evaluate our test coverage, identify untested critical paths, and suggest testing strategies for complex components?
```

## Development

For development with automatic reloading:

```bash
npm run dev
```

For debugging, enable verbose logs:

```bash
DEBUG=true npm start
```

## Notes on API Key Security

- Never commit your API key to version control
- Consider using environment variables or secure credential storage
- For production, use a service account with appropriate permissions

## Troubleshooting

If you encounter issues:

1. Check Claude Desktop logs:
   ```bash
   tail -f ~/Library/Logs/Claude/mcp*.log
   ```

2. Enable debug mode:
   ```bash
   DEBUG=true npm start
   ```

3. Verify your Gemini API key is valid and has appropriate permissions

4. Ensure the repository or files you're analyzing are accessible

### Handling Token Limits

If you encounter token limit errors when analyzing large repositories:
- Try analyzing specific files instead of the entire repository
- Use the `analysisType` parameter to focus on specific aspects
- Limit the scope of your query to be more specific

### Rate Limit Errors

If you encounter rate limit errors:
- Wait a few seconds before trying again
- Reduce the frequency of requests
- Consider upgrading your Gemini API plan for higher rate limits

### Repomix Integration Issues

If you encounter issues with Repomix:
1. Run the diagnostic test to identify which method is being used:
   ```bash
   ./run-diagnostic.sh
   ```
2. If using the fallback, check if Repomix is installed globally:
   ```bash
   npm install -g repomix
   ```
3. Check for version compatibility issues with the Repomix package

## License

MIT