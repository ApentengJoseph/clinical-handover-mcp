# Clinical Handover MCP Server

A **Model Context Protocol (MCP) server** for clinical handover coordination agents.
It provides structured tools for risk classification, SBAR generation, completeness
validation, follow-up task extraction, and ward preference management.

> ⚠️ **Safety Notice:** All outputs are clinical communication support drafts only.
> This system does not diagnose, prescribe, or make clinical decisions.
> Every output must be reviewed by a qualified clinical professional before use in patient care.

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- npm ≥ 9

### Install & Build

```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript → build/
npm run build

# 3. Verify the server starts cleanly
npm start
# Expected stderr: [clinical-handover-mcp] Server running on stdio transport. Ready.
# Press Ctrl+C to stop.
```

### Local Development (no build step)

```bash
npm run dev          # runs src/index.ts via tsx directly
```

### Lint (TypeScript type-check without emitting)

```bash
npm run lint
```

---

## Inspect with MCP Inspector

```bash
npm run inspect
# Opens MCP Inspector UI — usually at http://localhost:5173
```

The inspector lets you call each tool interactively with a form UI and see raw
JSON responses. Use the sample inputs in `src/data/sample-handover.md` as test data.

---

## Tools

| Tool | Purpose |
|---|---|
| `classify_patient_risk` | Risk-score a patient case (high/medium/low/uncertain) |
| `validate_handover_completeness` | Check for missing critical fields, return 0–100 score |
| `generate_follow_up_tasks` | Extract prioritised tasks from Gmail/Fireflies/Notion text |
| `build_sbar_handover` | Format a structured SBAR handover document |
| `create_handover_record` | Assemble a full shift handover record |
| `update_ward_preferences` | Draft ward-specific preference rules from clinician feedback |

---

## Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "clinical-handover": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/clinical-handover-mcp-server/build/index.js"]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/` with the real path, then restart Claude Desktop.
The 6 tools will appear in Claude's tool palette.

---

## Connect to Agentman

In your Agentman agent config, add this MCP server as a tool source:

```json
{
  "mcp_servers": [
    {
      "name": "clinical-handover",
      "transport": "stdio",
      "command": "node",
      "args": ["build/index.js"],
      "cwd": "/path/to/clinical-handover-mcp-server"
    }
  ]
}
```

The agent will discover all 6 tools automatically via the MCP protocol.

---

## Environment Variables

Copy `.env.example` to `.env` and populate if needed:

```bash
cp .env.example .env
```

Currently the server needs no secrets — all logic is local.
Future integrations (e.g. Notion write-back) would add tokens here.

---

## Future: Streamable HTTP Deployment

The server currently uses stdio transport (simplest for local agents and Claude Desktop).

To expose it as an HTTP endpoint for multi-agent or remote deployments:

1. Install the HTTP transport package when available:
   ```bash
   npm install @modelcontextprotocol/sdk-transport-http
   ```

2. Replace `StdioServerTransport` in `src/index.ts` with `StreamableHttpServerTransport`:
   ```typescript
   import { StreamableHttpServerTransport } from "@modelcontextprotocol/sdk-transport-http";
   const transport = new StreamableHttpServerTransport({ port: 3000 });
   ```

3. Deploy behind a reverse proxy (nginx/Caddy) with TLS.
4. Add bearer token auth middleware before exposing publicly.

For now, stdio is preferred — it keeps the attack surface minimal and avoids
network credential management for a clinical communication tool.

---

## Safety Design Principles

1. **No diagnosis.** Tools score and classify for communication purposes only — not to inform clinical treatment.
2. **No prescribing.** The `recommendation` field in SBAR is a handover communication field, not a prescription.
3. **Mandatory disclaimer.** Every tool output carries the safety notice.
4. **Human approval gate.** `update_ward_preferences` never writes to Notion directly — it drafts rules for human review.
5. **No PII storage.** The server holds no state between calls. Patient identifiers used in tool calls are not persisted.

---

## Project Structure

```
src/
  index.ts        Entry point — stdio transport setup, graceful shutdown
  server.ts       Tool registration (MCP tool schemas + handlers)
  logic.ts        Core business logic (risk scoring, completeness, task extraction)
  formatters.ts   Output formatters (SBAR markdown, task tables, handover records)
  safety.ts       Safety disclaimer constants
  types.ts        Shared TypeScript interfaces and type aliases
  data/
    sample-handover.md   Sample handover text for testing
docs/
  CODEX_PROMPT.md  Agent system prompt reference
```
