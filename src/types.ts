// ─────────────────────────────────────────────────────────────────────────────
// Clinical Handover MCP Server – Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "high" | "medium" | "low" | "uncertain";
export type SourceType = "gmail" | "fireflies" | "notion" | "user_notes";
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "urgent" | "blocked" | "unclear";
export type EscalationStatus = "clear" | "unclear" | "not_provided";

// ── Risk Classification ───────────────────────────────────────────────────────

export interface ClassifyRiskInput {
  patientId: string;
  notes: string;
  vitalsAvailable: boolean;
  oxygenSaturation?: number;
  pendingLabs?: string[];
  medicationChanges?: string[];
  escalationStatus?: EscalationStatus;
  deteriorationSigns?: string[];
}

export interface ClassifyRiskResult {
  riskLevel: RiskLevel;
  riskScore: number;
  reasons: string[];
  missingCriticalInfo: string[];
  recommendedNextSteps: string[];
}

// ── Completeness Validation ───────────────────────────────────────────────────

export interface ValidateCompletenessResult {
  completenessScore: number;
  missingFields: string[];
  unclearFields: string[];
  safetyWarnings: string[];
}

// ── Follow-Up Tasks ───────────────────────────────────────────────────────────

export interface FollowUpTask {
  priority: TaskPriority;
  patientId: string;
  action: string;
  owner: string;
  timing: string;
  source: SourceType;
  status: TaskStatus;
}

// ── SBAR ─────────────────────────────────────────────────────────────────────

export interface SbarInput {
  patientId: string;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  riskLevel: RiskLevel;
  missingInfo?: string[];
  followUpTasks?: string[];
}

// ── Handover Record ───────────────────────────────────────────────────────────

export interface HandoverRecordInput {
  ward: string;
  shiftType: string;
  timeWindow: string;
  preparedFor: string;
  sourcesReviewed: string[];
  patientSummaries: string[];
  missingInfo: string[];
  followUpTasks: string[];
}
