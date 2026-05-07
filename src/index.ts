#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const app = express();
app.use(express.json());

const AUTH_TOKEN = process.env.MCP_SECRET_TOKEN;

// Auth middleware
app.use("/mcp", (req, res, next) => {
  if (AUTH_TOKEN) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  next();
});

// MCP endpoint
app.all("/mcp", async (req, res) => {
  const server: McpServer = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Health check for Railway
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "clinical-handover-mcp" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[clinical-handover-mcp] HTTP server running on port ${PORT}`);
});
