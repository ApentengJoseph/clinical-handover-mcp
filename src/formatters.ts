// ─────────────────────────────────────────────────────────────────────────────
// Clinical Handover MCP Server – Output Formatters
// ─────────────────────────────────────────────────────────────────────────────

import { SAFETY_NOTE, SAFETY_HEADER } from "./safety.js";
import type { FollowUpTask, HandoverRecordInput, SbarInput } from "./types.js";

// ── Utilities ─────────────────────────────────────────────────────────────────

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ── SBAR Markdown ─────────────────────────────────────────────────────────────

export function buildSbarMarkdown(input: SbarInput): string {
  const missing =
    input.missingInfo && input.missingInfo.length > 0
      ? input.missingInfo.map((item) => `- ${item}`).join("\n")
      : "- None explicitly identified.";

  const tasks =
    input.followUpTasks && input.followUpTasks.length > 0
      ? input.followUpTasks.map((item) => `- ${item}`).join("\n")
      : "- No follow-up tasks explicitly identified.";

  const riskBadge =
    input.riskLevel === "high"
      ? "🔴 HIGH"
      : input.riskLevel === "medium"
        ? "🟡 MEDIUM"
        : input.riskLevel === "low"
          ? "🟢 LOW"
          : "⚪ UNCERTAIN";

  return [
    SAFETY_HEADER,
    `# SBAR Handover: ${input.patientId}`,
    "",
    `**Risk Level:** ${riskBadge}`,
    "",
    "## S — Situation",
    input.situation,
    "",
    "## B — Background",
    input.background,
    "",
    "## A — Assessment",
    input.assessment,
    "",
    "## R — Recommendation",
    input.recommendation,
    "",
    "## Missing or Unclear Information",
    missing,
    "",
    "## Follow-Up Tasks",
    tasks,
    "",
    `---`,
    `> ${SAFETY_NOTE}`,
  ].join("\n");
}

// ── Follow-Up Tasks Table ─────────────────────────────────────────────────────

export function formatTasksTable(tasks: FollowUpTask[]): string {
  if (tasks.length === 0) return "No follow-up tasks identified in the provided text.";

  const header = "| Priority | Patient/Case | Action | Owner | Timing | Source | Status |";
  const divider = "|---|---|---|---|---|---|---|";

  const rows = tasks.map((task) => {
    const priorityIcon =
      task.priority === "high" ? "🔴 high" : task.priority === "medium" ? "🟡 medium" : "🟢 low";
    // Escape pipe characters so they don't break the markdown table
    const safeAction = task.action.replace(/\|/g, "/").replace(/\n/g, " ");
    return `| ${priorityIcon} | ${task.patientId} | ${safeAction} | ${task.owner} | ${task.timing} | ${task.source} | ${task.status} |`;
  });

  return [header, divider, ...rows].join("\n");
}

// ── Handover Record ───────────────────────────────────────────────────────────

export function createHandoverRecord(input: HandoverRecordInput): string {
  const patientList =
    input.patientSummaries.length > 0
      ? input.patientSummaries.map((s) => `- ${s}`).join("\n")
      : "- No patient summaries provided.";

  const missingList =
    input.missingInfo.length > 0
      ? input.missingInfo.map((s) => `- ${s}`).join("\n")
      : "- None explicitly identified.";

  const taskList =
    input.followUpTasks.length > 0
      ? input.followUpTasks.map((s) => `- ${s}`).join("\n")
      : "- No follow-up actions provided.";

  return [
    SAFETY_HEADER,
    "# Clinical Handover Summary",
    "",
    "## Handover Context",
    `- **Ward:** ${input.ward}`,
    `- **Shift:** ${input.shiftType}`,
    `- **Time window reviewed:** ${input.timeWindow}`,
    `- **Prepared for:** ${input.preparedFor}`,
    `- **Sources reviewed:** ${input.sourcesReviewed.join(", ") || "Not specified"}`,
    "",
    "## Executive Summary",
    "This handover consolidates patient/case updates, missing information, and follow-up actions for the incoming clinical team.",
    "",
    "## Patient / Case Summaries",
    patientList,
    "",
    "## Missing or Unclear Information",
    missingList,
    "",
    "## Follow-Up Actions",
    taskList,
    "",
    "## Feedback for Next Handover",
    "Please confirm whether any patients were misclassified, tasks are missing, or ward-specific preferences should be remembered for future handovers.",
    "",
    `---`,
    `> ${SAFETY_NOTE}`,
  ].join("\n");
}
