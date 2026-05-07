#!/usr/bin/env node
import "dotenv/config";
import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const app = express();

app.use(express.json());

const AUTH_TOKEN = process.env.MCP_SECRET_TOKEN;

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Health check for Railway
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "clinical-handover-mcp",
  });
});

// Optional Bearer auth for /mcp only
function checkAuth(req: Request, res: Response): boolean {
  if (!AUTH_TOKEN) return true;

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token !== AUTH_TOKEN) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Bearer token",
    });
    return false;
  }

  return true;
}

// Main Streamable HTTP MCP endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    if (!checkAuth(req, res)) return;

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Existing initialized session
      transport = transports[sessionId];
    } else {
      // New session
      const server: McpServer = createServer();

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          transports[newSessionId] = transport;
          console.error(
            `[clinical-handover-mcp] Session initialized: ${newSessionId}`,
          );
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          console.error(
            `[clinical-handover-mcp] Session closed: ${transport.sessionId}`,
          );
        }
      };

      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[clinical-handover-mcp] POST /mcp error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

// Handle GET for existing stream/session requests
app.get("/mcp", async (req: Request, res: Response) => {
  try {
    if (!checkAuth(req, res)) return;

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        error: "Bad Request",
        message: "No valid MCP session found",
      });
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("[clinical-handover-mcp] GET /mcp error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

// Handle session termination
app.delete("/mcp", async (req: Request, res: Response) => {
  try {
    if (!checkAuth(req, res)) return;

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        error: "Bad Request",
        message: "No valid MCP session found",
      });
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);

    delete transports[sessionId];
  } catch (error) {
    console.error("[clinical-handover-mcp] DELETE /mcp error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.error(`[clinical-handover-mcp] HTTP server running on port ${PORT}`);
});
