# Prompt for Claude Code / OpenAI Codex

You are a senior TypeScript backend engineer and MCP specialist.

Build a production-grade TypeScript MCP server called `clinical-handover-mcp-server`.

## Context

This server supports an Agentman Clinical Handover Coordinator Agent. The agent helps hospital teams prepare safe shift handovers by turning fragmented Gmail updates, Fireflies transcripts, Notion ward rules, and user notes into structured SBAR handovers.

The MCP server should expose clinical workflow tools. It must not diagnose, prescribe medication, or make final clinical decisions.

## Tech stack

- Node.js 20+
- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`
- stdio transport first
- strict TypeScript
- safe JSON schemas only

## Critical MCP schema requirements

Avoid schema errors that break Agentman/Claude:

- Do not use `oneOf`, `allOf`, or `anyOf` at the top level of tool input schemas.
- Do not use numeric enum values. All enum values must be strings.
- Prefer simple Zod schemas.
- Keep nested arrays/objects simple.
- Return text content with JSON stringified output when needed.

## Tools to implement

1. `classify_patient_risk`
2. `validate_handover_completeness`
3. `generate_follow_up_tasks`
4. `build_sbar_handover`
5. `create_handover_record`
6. `update_ward_preferences`

## Safety behavior

Every output must respect this note:

> This is a clinical communication support draft and must be reviewed by a qualified clinical professional before use in patient care.

Never invent missing clinical data. If information is missing, flag it.

## Folder structure

Create:

- `src/index.ts`
- `src/server.ts`
- `src/logic.ts`
- `src/formatters.ts`
- `src/safety.ts`
- `src/types.ts`
- `README.md`
- `.env.example`
- `tsconfig.json`
- `package.json`

## Final deliverable

Return the full file tree and code for every file. Ensure `npm install`, `npm run build`, and `npm run inspect` work.
