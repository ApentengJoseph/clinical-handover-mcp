// ─────────────────────────────────────────────────────────────────────────────
// Clinical Handover MCP Server – Tool Registration
//
// All tools use z.object() at the top level (no oneOf/allOf/anyOf).
// All enum values are strings. Tools are scoped to communication support only.
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { classifyRisk, extractFollowUpTasks, validateCompleteness, DEFAULT_REQUIRED_FIELDS } from "./logic.js";
import { buildSbarMarkdown, createHandoverRecord, formatJson, formatTasksTable } from "./formatters.js";
import { SAFETY_NOTE } from "./safety.js";

// ── Shared Zod schemas ────────────────────────────────────────────────────────

const RiskLevelEnum = z.enum(["high", "medium", "low", "uncertain"]);
const SourceTypeEnum = z.enum(["gmail", "fireflies", "notion", "user_notes"]);
const EscalationStatusEnum = z.enum(["clear", "unclear", "not_provided"]);

// ── Server factory ────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name: "clinical-handover-mcp-server",
    version: "1.0.0",
  });

  // ── 1. classify_patient_risk ───────────────────────────────────────────────
  server.registerTool(
    "classify_patient_risk",
    {
      description:
        "Classify a clinical handover case as high, medium, low, or uncertain risk. " +
        "Uses safety-focused handover heuristics based on vitals availability, SpO2, " +
        "medication changes, pending labs, and escalation status. " +
        "Does NOT diagnose or prescribe — communication support only.",
      inputSchema: z.object({
        patientId: z.string().min(1).describe("Unique patient or case identifier (e.g. Bed 4B, MRN-12345)."),
        notes: z.string().min(1).describe("Free-text clinical notes from Gmail, Fireflies, Notion, or user input."),
        vitalsAvailable: z.boolean().describe("Whether the latest vitals set has been documented."),
        oxygenSaturation: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Latest SpO2 percentage (0–100). Omit if not recorded."),
        pendingLabs: z.array(z.string()).optional().describe("List of pending lab or imaging investigations."),
        medicationChanges: z.array(z.string()).optional().describe("Medications started, stopped, or dose-changed this shift."),
        escalationStatus: EscalationStatusEnum.optional().describe(
          "Current escalation status: 'clear', 'unclear', or 'not_provided'.",
        ),
        deteriorationSigns: z
          .array(z.string())
          .optional()
          .describe("Explicit deterioration signs noted (e.g. rising NEWS2, reduced GCS)."),
      }),
    },
    async (input) => {
      try {
        const result = classifyRisk(input);
        const output = { patientId: input.patientId, ...result };
        return {
          content: [
            {
              type: "text",
              text: `${formatJson(output)}\n\n${SAFETY_NOTE}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse("classify_patient_risk", err);
      }
    },
  );

  // ── 2. validate_handover_completeness ─────────────────────────────────────
  server.registerTool(
    "validate_handover_completeness",
    {
      description:
        "Check a handover draft for missing or unclear critical fields: " +
        "vitals, medication changes, pending labs, escalation status, responsible clinician, and follow-up owner. " +
        "Returns a completeness score (0–100) and actionable safety warnings. Communication support only.",
      inputSchema: z.object({
        patientId: z.string().min(1).describe("Patient or case identifier."),
        handoverText: z.string().min(1).describe("Full handover text to validate."),
        requiredFields: z
          .array(z.string())
          .optional()
          .describe(
            `Override the default required fields. Default set: ${DEFAULT_REQUIRED_FIELDS.join(", ")}.`,
          ),
      }),
    },
    async ({ patientId, handoverText, requiredFields }) => {
      try {
        const result = validateCompleteness(handoverText, requiredFields);
        return {
          content: [
            {
              type: "text",
              text: `${formatJson({ patientId, ...result })}\n\n${SAFETY_NOTE}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse("validate_handover_completeness", err);
      }
    },
  );

  // ── 3. generate_follow_up_tasks ───────────────────────────────────────────
  server.registerTool(
    "generate_follow_up_tasks",
    {
      description:
        "Extract structured follow-up tasks from Gmail updates, Fireflies meeting transcripts, " +
        "Notion notes, or any free-text handover input. " +
        "Returns a prioritised task table and JSON. Communication support only.",
      inputSchema: z.object({
        sourceText: z
          .string()
          .min(1)
          .describe("Raw text to extract tasks from (email body, transcript, notes, etc.)."),
        sourceType: SourceTypeEnum.describe(
          "Origin of the text: 'gmail', 'fireflies', 'notion', or 'user_notes'.",
        ),
        defaultOwner: z
          .string()
          .optional()
          .describe("Default task owner if none is identified in the text (e.g. 'Night shift lead')."),
      }),
    },
    async ({ sourceText, sourceType, defaultOwner }) => {
      try {
        const tasks = extractFollowUpTasks(sourceText, sourceType, defaultOwner);
        return {
          content: [
            {
              type: "text",
              text: `${formatTasksTable(tasks)}\n\nJSON:\n${formatJson({ tasks })}\n\n${SAFETY_NOTE}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse("generate_follow_up_tasks", err);
      }
    },
  );

  // ── 4. build_sbar_handover ────────────────────────────────────────────────
  server.registerTool(
    "build_sbar_handover",
    {
      description:
        "Build a structured SBAR (Situation–Background–Assessment–Recommendation) handover document. " +
        "The agent populates each section from gathered data; this tool formats it consistently for clinical review. " +
        "Communication support only — requires qualified clinical review before use in patient care.",
      inputSchema: z.object({
        patientId: z.string().min(1).describe("Patient or case identifier."),
        situation: z.string().min(1).describe("S: What is happening right now with this patient?"),
        background: z.string().min(1).describe("B: Relevant clinical history, admission reason, current diagnosis."),
        assessment: z.string().min(1).describe("A: Current clinical status summary (NOT a clinical diagnosis by the agent)."),
        recommendation: z.string().min(1).describe("R: Actions recommended for the incoming team (NOT prescriptions)."),
        riskLevel: RiskLevelEnum.describe("Risk classification: 'high', 'medium', 'low', or 'uncertain'."),
        missingInfo: z.array(z.string()).optional().describe("Fields or information still outstanding."),
        followUpTasks: z.array(z.string()).optional().describe("Tasks the incoming team should action."),
      }),
    },
    async (input) => {
      try {
        return {
          content: [{ type: "text", text: buildSbarMarkdown(input) }],
        };
      } catch (err) {
        return errorResponse("build_sbar_handover", err);
      }
    },
  );

  // ── 5. create_handover_record ─────────────────────────────────────────────
  server.registerTool(
    "create_handover_record",
    {
      description:
        "Assemble a complete, reviewable shift handover record from all gathered patient summaries, " +
        "missing information flags, and follow-up action lists. " +
        "Produces a formatted document ready for clinical team review. Communication support only.",
      inputSchema: z.object({
        ward: z.string().min(1).describe("Ward or unit name (e.g. 'Ward 7B – Surgical')."),
        shiftType: z.string().min(1).describe("Shift type (e.g. 'Night', 'Day', 'Long Day')."),
        timeWindow: z.string().min(1).describe("Time window reviewed (e.g. '07:00–19:00 on 2025-11-14')."),
        preparedFor: z.string().min(1).describe("Recipient team or individual (e.g. 'Night team lead')."),
        sourcesReviewed: z
          .array(z.string())
          .describe("Sources consulted (e.g. ['Gmail', 'Fireflies transcript', 'Notion ward notes'])."),
        patientSummaries: z.array(z.string()).describe("One-line summary per patient/case reviewed."),
        missingInfo: z.array(z.string()).describe("Outstanding gaps across all cases."),
        followUpTasks: z.array(z.string()).describe("Consolidated action list for the incoming team."),
      }),
    },
    async (input) => {
      try {
        return {
          content: [{ type: "text", text: createHandoverRecord(input) }],
        };
      } catch (err) {
        return errorResponse("create_handover_record", err);
      }
    },
  );

  // ── 6. update_ward_preferences ────────────────────────────────────────────
  server.registerTool(
    "update_ward_preferences",
    {
      description:
        "Convert clinician feedback into suggested ward preference rules for future handovers. " +
        "Returns a structured preference draft — the agent must obtain human approval before saving " +
        "to Notion or any external system. Never stores patient-identifying information.",
      inputSchema: z.object({
        ward: z.string().min(1).describe("Ward or unit the preferences apply to."),
        feedback: z.string().min(1).describe("Clinician feedback or correction from the latest handover."),
        currentPreferences: z
          .string()
          .optional()
          .describe("Existing ward preferences (as plain text or JSON string) to merge with."),
      }),
    },
    async ({ ward, feedback, currentPreferences }) => {
      try {
        const text = [
          "# Suggested Ward Preference Update",
          "",
          `## Ward: ${ward}`,
          "",
          "## Existing Preferences",
          currentPreferences ?? "No existing preferences provided.",
          "",
          "## New Feedback Received",
          feedback,
          "",
          "## Suggested Rules to Persist",
          "Review the feedback above and extract only stable, reusable rules such as:",
          "- Sender priority rules (e.g. 'Always check Dr Smith's emails first for Ward 7B').",
          "- Missing-information rules (e.g. 'Ward 7B always requires NEWS2 score in handover').",
          "- Formatting preferences (e.g. 'Surgical ward prefers SBAR over plain summary').",
          "- Escalation contacts (e.g. 'Bleep 4421 for overnight ITU queries').",
          "",
          "**Do NOT persist patient-identifying details, clinical opinions, or individual diagnoses.**",
          "**Require explicit human approval before writing these rules to Notion or any storage system.**",
          "",
          `---`,
          `> ${SAFETY_NOTE}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return errorResponse("update_ward_preferences", err);
      }
    },
  );

  return server;
}

// ── Error helper ──────────────────────────────────────────────────────────────

function errorResponse(
  toolName: string,
  err: unknown,
): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${toolName}] Error:`, message);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Tool "${toolName}" encountered an error: ${message}\n\nPlease check inputs and retry.`,
      },
    ],
  };
}
