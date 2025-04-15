# Gemini-Claude Bridge MCP Server

This Model Context Protocol (MCP) server enables Claude to leverage Google's Gemini model for code repository analysis tasks. It uses Repomix to efficiently package repository content before sending it to Gemini for specialized processing.

## Features

- **Repository Analysis**: Analyze entire code repositories with Gemini's AI capabilities
- **File-Specific Analysis**: Focus analysis on specific files within a repository
- **Direct Chat**: Have a general conversation directly with Gemini
- **Token Management**: Handles large repositories appropriately
- **Configurable Parameters**: Control temperature, token count, and reasoning depth
- **Model Selection**: Choose from different Gemini models (1.5-pro, 1.5-flash, 1.0-pro, 1.0-pro-vision)
- **Persistent Configuration**: Save and reuse your preferred settings

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

## Usage

Once configured, you can ask Claude to use the Gemini bridge for repository analysis:

### Analyzing a Repository

```
Can you use gemini-bridge to analyze-repository in the current directory to explain the authentication system?
```

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

## License

MIT
