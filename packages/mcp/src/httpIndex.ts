/**
 * SelfTax HTTP API Server — Entry Point
 *
 * Starts the HTTP API for the Chrome extension (and future hosted MCP).
 * Unlike the stdio MCP server, this is a standard HTTP server that
 * the extension can call via fetch().
 *
 * Usage:
 *   npx tsx packages/mcp/src/httpIndex.ts
 *   # Server starts on http://localhost:3742
 */

import { startHttpServer } from './httpServer.js';

const port = parseInt(process.env.SELFTAX_PORT ?? '3742', 10);
startHttpServer(port);
