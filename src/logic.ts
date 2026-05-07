// ─────────────────────────────────────────────────────────────────────────────
// Clinical Handover MCP Server – Core Logic
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ClassifyRiskInput,
  ClassifyRiskResult,
  EscalationStatus,
  FollowUpTask,
  RiskLevel,
  SourceType,
  ValidateCompletenessResult,
} from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_REQUIRED_FIELDS: string[] = [
  "latest vitals",
  "current diagnosis or problem",
  "medication changes",
  "allergies",
  "pending labs or imaging",
  "responsible clinician or team",
  "escalation status",
  "follow-up owner",
  "time-sensitive actions",
];

/** Keywords that each required field can be detected by in free text. */
const FIELD_KEYWORDS: Record<string, string[]> = {
  "latest vitals": ["vitals", "bp", "blood pressure", "hr", "heart rate", "spo2", "oxygen sat", "temperature", "rr ", "resp rate"],
  "current diagnosis or problem": ["diagnosis", "problem", "admitted for", "reason for", "presenting with", "post-op", "infection", "uti", "appendectomy"],
  "medication changes": ["medication", "medicine", "dose changed", "antibiotic", "insulin", "stopped", "started", "prescribed"],
  "allergies": ["allergy", "allergies", "nkda", "no known drug"],
  "pending labs or imaging": ["pending", "awaiting", "lab result", "blood result", "renal", "x-ray", "ct scan", "imaging", "culture"],
  "responsible clinician or team": ["dr ", "doctor", "nurse", "team", "consultant", "registrar", "assigned to"],
  "escalation status": ["escalate", "escalation", "senior review", "urgent review", "bleep", "fast bleep"],
  "follow-up owner": ["owner", "assigned to", "responsible", "doctor to follow", "nurse to check"],
  "time-sensitive actions": ["before ward round", "by morning", "by 4", "today", "urgent", "asap", "this shift"],
};

const DETERIORATION_KEYWORDS: string[] = [
  "unstable",
  "deteriorat",
  "sepsis",
  "confusion",
  "chest pain",
  "breathless",
  "hypotension",
  "tachycardia",
  "post-op complication",
  "acute kidney",
  "unresponsive",
  "low gcs",
];

const URGENT_ACTION_KEYWORDS: string[] = [
  "follow up",
  "review",
  "check",
  "confirm",
  "escalate",
  "complete",
  "repeat",
  "monitor",
  "assign",
  "write",
  "chase",
  "call",
  "bleep",
];

const URGENT_PRIORITY_KEYWORDS: string[] = [
  "urgent",
  "asap",
  "unstable",
  "below 92",
  "deteriorat",
  "before ward round",
  "escalate",
  "fast bleep",
];

// ── Risk Classification ───────────────────────────────────────────────────────

export function classifyRisk(input: ClassifyRiskInput): ClassifyRiskResult {
  const notes = input.notes.toLowerCase();
  const reasons: string[] = [];
  const missingCriticalInfo: string[] = [];
  const recommendedNextSteps: string[] = [];
  let score = 0;

  // SpO2 threshold check
  if (typeof input.oxygenSaturation === "number") {
    if (input.oxygenSaturation < 88) {
      score += 6;
      reasons.push(`Oxygen saturation critically low at ${input.oxygenSaturation}% (threshold < 88%).`);
      recommendedNextSteps.push("Immediate escalation required — confirm SpO2 and apply supplemental oxygen per local protocol.");
    } else if (input.oxygenSaturation < 92) {
      score += 4;
      reasons.push(`Oxygen saturation below 92% (recorded: ${input.oxygenSaturation}%).`);
      recommendedNextSteps.push("Confirm latest SpO2 and escalate if still below threshold.");
    }
  }

  // Deterioration keyword scan
  for (const keyword of DETERIORATION_KEYWORDS) {
    if (notes.includes(keyword)) {
      score += 2;
      reasons.push(`Clinical note contains deterioration signal: "${keyword}".`);
    }
  }

  // Vitals availability
  if (!input.vitalsAvailable) {
    missingCriticalInfo.push("Latest vitals not available.");
    if (score >= 2) {
      score += 3;
      reasons.push("Vitals missing despite possible instability.");
      recommendedNextSteps.push("Obtain and document BP, HR, temperature, RR, and SpO2 before shift handover.");
    }
  }

  // Pending labs
  if (input.pendingLabs && input.pendingLabs.length > 0) {
    score += 1;
    reasons.push(`Pending labs/investigations: ${input.pendingLabs.join(", ")}.`);
    recommendedNextSteps.push("Assign an owner to chase pending lab or imaging results.");
  }

  // Medication changes
  if (input.medicationChanges && input.medicationChanges.length > 0) {
    score += 1;
    reasons.push(`Medication changes noted: ${input.medicationChanges.join(", ")}.`);
    recommendedNextSteps.push("Confirm all medication changes and associated monitoring requirements.");
  }

  // Escalation status
  const esc: EscalationStatus | undefined = input.escalationStatus;
  if (esc === "unclear" || esc === "not_provided") {
    missingCriticalInfo.push("Escalation status is unclear or not provided.");
    score += 1;
  }

  // Explicit deterioration signs
  if (input.deteriorationSigns && input.deteriorationSigns.length > 0) {
    const signScore = Math.min(input.deteriorationSigns.length * 2, 8);
    score += signScore;
    reasons.push(`Reported deterioration signs: ${input.deteriorationSigns.join(", ")}.`);
  }

  // Determine risk level
  let riskLevel: RiskLevel;
  if (reasons.length === 0 && missingCriticalInfo.length > 0) {
    riskLevel = "uncertain";
    reasons.push("Insufficient information to classify risk confidently.");
    recommendedNextSteps.push("Clarify missing handover-critical information before finalising handover.");
  } else if (score >= 6) {
    riskLevel = "high";
  } else if (score >= 3) {
    riskLevel = "medium";
  } else if (reasons.length === 0) {
    riskLevel = "low";
  } else {
    riskLevel = "medium";
  }

  if (recommendedNextSteps.length === 0) {
    recommendedNextSteps.push("Review during next shift and confirm no unresolved actions remain.");
  }

  return { riskLevel, riskScore: score, reasons, missingCriticalInfo, recommendedNextSteps };
}

// ── Completeness Validation ───────────────────────────────────────────────────

export function validateCompleteness(
  handoverText: string,
  requiredFields: string[] = DEFAULT_REQUIRED_FIELDS,
): ValidateCompletenessResult {
  const text = handoverText.toLowerCase();
  const missingFields: string[] = [];
  const unclearFields: string[] = [];
  const safetyWarnings: string[] = [];

  for (const field of requiredFields) {
    const keywords = FIELD_KEYWORDS[field.toLowerCase()] ?? [field.toLowerCase()];
    const found = keywords.some((kw) => text.includes(kw));
    if (!found) missingFields.push(field);
  }

  // Scan for explicit uncertainty phrases
  const uncertaintyPhrases = ["unclear", "unknown", "not sure", "tbc", "to be confirmed", "not documented"];
  for (const phrase of uncertaintyPhrases) {
    if (text.includes(phrase)) {
      unclearFields.push(`Handover contains explicit uncertainty phrase: "${phrase}".`);
    }
  }

  // Safety warnings for high-stakes missing fields
  if (missingFields.includes("latest vitals")) {
    safetyWarnings.push("Latest vitals are missing — this can be safety-critical for any unstable patient.");
  }
  if (missingFields.includes("follow-up owner")) {
    safetyWarnings.push("Follow-up owner is missing — pending tasks risk being dropped between shifts.");
  }
  if (missingFields.includes("escalation status")) {
    safetyWarnings.push("Escalation status is absent — the receiving team cannot determine urgency.");
  }
  if (missingFields.includes("medication changes")) {
    safetyWarnings.push("Medication changes field absent — prescribing errors are a leading handover risk.");
  }

  const completenessScore = Math.max(
    0,
    Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100),
  );

  return { completenessScore, missingFields, unclearFields, safetyWarnings };
}

// ── Follow-Up Task Extraction ─────────────────────────────────────────────────

export function extractFollowUpTasks(
  sourceText: string,
  sourceType: SourceType,
  defaultOwner = "Next shift lead",
): FollowUpTask[] {
  // Split on newlines or sentence ends, keep non-trivial lines
  const lines = sourceText
    .split(/[\n.;]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 10);

  const tasks: FollowUpTask[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Only process lines that contain an action keyword
    if (!URGENT_ACTION_KEYWORDS.some((kw) => lower.includes(kw))) continue;

    // Try to extract a patient identifier from common patterns
    const patientMatch = line.match(
      /\b(Patient\s+[A-Z][a-z]*|Bed\s+\d+[A-Za-z]?|Mrs?\.\s+[A-Z][a-z]+|Dr\.\s+[A-Z][a-z]+|Room\s+\d+)\b/,
    );
    const patientId = patientMatch ? patientMatch[0] : "Unspecified patient/case";

    const isUrgent = URGENT_PRIORITY_KEYWORDS.some((kw) => lower.includes(kw));
    const isPending = lower.includes("pending") || lower.includes("awaiting");

    const priority = isUrgent ? "high" : isPending ? "medium" : "low";
    const status = isUrgent ? "urgent" : lower.includes("unclear") ? "unclear" : "pending";
    const timing = isUrgent ? "As soon as possible / before ward round" : "During next shift";

    tasks.push({
      priority,
      patientId,
      action: line,
      owner: defaultOwner,
      timing,
      source: sourceType,
      status,
    });
  }

  return tasks;
}
