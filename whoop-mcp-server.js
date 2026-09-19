#!/usr/bin/env node

// WHOOP MCP Server - Standalone executable
// Usage: node whoop-mcp-server.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WhoopMcpServer } from './dist/mcp-server.js';

// Load environment variables from THIS package's .env, not the caller's cwd. An MCP host
// spawns the server from an arbitrary working directory, so a bare dotenv.config() silently
// finds nothing and the server dies on "missing required environment variables".
const __pkgDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__pkgDir, '.env') });

// Validate required environment variables
const requiredEnvVars = ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please create a .env file based on env.example');
  process.exit(1);
}

// Create WHOOP API configuration
const config = {
  clientId: process.env.WHOOP_CLIENT_ID,
  clientSecret: process.env.WHOOP_CLIENT_SECRET,
  redirectUri: process.env.WHOOP_REDIRECT_URI,
};

// Create and run the MCP server
const server = new WhoopMcpServer(config);

server.run().catch((error) => {
  console.error('Failed to start WHOOP MCP Server:', error);
  process.exit(1);
});
