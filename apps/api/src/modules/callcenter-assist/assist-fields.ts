/**
 * CALLCENTER-AI-ASSIST-20261111: the AI-prefilled phone booking draft.
 *
 * One draft exists per call. It is seeded either from the voice AI's own
 * dialogue state when the AI hands the call to a human (`voice_handoff`), or
 * from the live call transcript while a human agent talks and the AI listens
 * (`agent_assist`). The agent always reviews and submits the order; the draft
 * never creates an order by itself.
 */

export const ASSIST_FIELDS = [
  "pickup",
  "dropoff",
  "passengerName",
  "passengerPhone",
  "pickupTime",
  "passengerCount",
  "luggage",
  "requiredCapabilities",
  "notes",
] as const;

export type AssistField = (typeof ASSIST_FIELDS)[number];

export type AssistDraftSource = "voice_handoff" | "agent_assist";

export type AssistExtractor = "voice_dialogue" | "rules" | "llm";

export type AssistFieldStatus = "filled" | "uncertain";

/** Fields below this confidence are shown as "please check" and must be
 * confirmed or edited by the agent before the order can be submitted. */
export const UNCERTAIN_CONFIDENCE_THRESHOLD = 0.75;

export const MAX_FIELD_CANDIDATES = 3;
export const MAX_TRANSCRIPT_SEGMENTS = 300;
export const MAX_SEGMENT_TEXT_LENGTH = 1000;

export interface AssistFieldValue {
  value: string;
  /** What the caller or agent actually said, when known. */
  rawText: string | null;
  confidence: number | null;
  status: AssistFieldStatus;
  /** Other values heard for this field, most recent first. */
  candidates: string[];
  origin: AssistExtractor;
  sourceSegmentIds: string[];
  updatedAt: string;
}

export type AssistFieldMap = Partial<Record<AssistField, AssistFieldValue>>;

export type AssistSpeaker = "caller" | "agent" | "unknown";

export interface AssistTranscriptSegment {
  segmentId: string;
  speaker: AssistSpeaker;
  text: string;
  startedAt: string | null;
  receivedAt: string;
}

export interface CallcenterAssistDraft {
  callId: string;
  source: AssistDraftSource;
  handoffId: string | null;
  voiceSessionId: string | null;
  fields: AssistFieldMap;
  transcript: AssistTranscriptSegment[];
  draftVersion: number;
  extractor: AssistExtractor;
  submittedOrderId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type AssistFieldOutcome = "accepted" | "corrected" | "ai_missing";

export interface AssistFieldOutcomeRecord {
  callId: string;
  orderId: string;
  field: AssistField;
  source: AssistDraftSource;
  outcome: AssistFieldOutcome;
  aiStatus: AssistFieldStatus | null;
  aiConfidence: number | null;
  agentId: string | null;
  recordedAt: string;
}

export function isAssistField(value: unknown): value is AssistField {
  return (
    typeof value === "string" &&
    (ASSIST_FIELDS as readonly string[]).includes(value)
  );
}

export function statusForConfidence(
  confidence: number | null,
): AssistFieldStatus {
  return confidence !== null && confidence >= UNCERTAIN_CONFIDENCE_THRESHOLD
    ? "filled"
    : "uncertain";
}

export function clampConfidence(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

/** Push a superseded value into the candidate list without duplicates. */
export function mergeCandidates(
  current: readonly string[],
  ...values: Array<string | null | undefined>
): string[] {
  const merged: string[] = [];
  for (const value of [...values, ...current]) {
    const trimmed = value?.trim();
    if (trimmed && !merged.includes(trimmed)) {
      merged.push(trimmed);
    }
  }
  return merged.slice(0, MAX_FIELD_CANDIDATES);
}

/**
 * Decide the outcome of one field when the agent submits the order.
 * `aiApplied`: the form field was filled from the AI draft.
 * `agentEdited`: the agent changed that field afterwards.
 * Returns null when the field is empty on both sides (nothing to measure).
 */
export function decideFieldOutcome(input: {
  aiValue: AssistFieldValue | undefined;
  aiApplied: boolean;
  agentEdited: boolean;
  finalPresent: boolean;
}): AssistFieldOutcome | null {
  const aiHadValue = Boolean(input.aiValue) && input.aiApplied;
  if (aiHadValue) {
    return input.agentEdited ? "corrected" : "accepted";
  }
  return input.finalPresent ? "ai_missing" : null;
}
