/**
 * SelfTax MCP Server — Entry Point
 *
 * Starts the MCP server with stdio transport for use with Claude Code
 * or other MCP clients. Wraps tax-core as LLM-callable tools that:
 *
 * 1. Extract text from tax documents (PDF, images, spreadsheets)
 * 2. Strip PII before the LLM sees anything
 * 3. Run deterministic tax calculations
 * 4. Generate filled PDF forms with PII merged only at the final step
 *
 * Usage:
 *   npx tsx packages/mcp/src/index.ts
 *
 * Or configure in Claude Code MCP settings:
 *   { "mcpServers": { "selftax": { "command": "npx", "args": ["tsx", "packages/mcp/src/index.ts"] } } }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main() {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start SelfTax MCP server:', err);
  process.exit(1);
});
