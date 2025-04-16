/**
 * Stub Repomix MCP integration.
 * In production this would start or communicate with the MCP server.
 */
export async function startRepomixMCP(config: Record<string, unknown>): Promise<void> {
  console.warn('Repomix MCP stub started with config:', config);
}
