import { Injectable, Logger, Optional } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { LlmGatewayService } from "../../common/llm-gateway";
import { VoiceHandoffQueueService } from "../callcenter/voice-handoff-queue.service";
import {
  ASSIST_FIELDS,
  type AssistDraftSource,
  type AssistField,
  type AssistFieldMap,
  type AssistFieldOutcome,
  type AssistFieldOutcomeRecord,
  type AssistTranscriptSegment,
  type CallcenterAssistDraft,
  decideFieldOutcome,
  isAssistField,
  MAX_SEGMENT_TEXT_LENGTH,
  MAX_TRANSCRIPT_SEGMENTS,
  mergeCandidates,
} from "./assist-fields";
import {
  isAssistLlmEnabled,
  refineAssistFieldsWithLlm,
} from "./assist-llm-extractor";
import { extractAssistFieldsByRules } from "./assist-rule-extractor";
import { CallcenterAssistRepository } from "./callcenter-assist.repository";

const DEFAULT_RETENTION_DAYS = 7;
const MAX_SEGMENTS_PER_BATCH = 50;

const TRANSCRIPT_SPEAKERS = new Set(["caller", "agent", "unknown"]);

function invalid(code: string, message: string): never {
  throw new ApiRequestError(400, code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export interface TranscriptSegmentInput {
  segmentId: string;
  speaker: AssistTranscriptSegment["speaker"];
  text: string;
  startedAt: string | null;
}

/** Validates the media worker's batch of final ASR segments. */
export function parseTranscriptBatch(body: unknown): TranscriptSegmentInput[] {
  const code = "CALLCENTER_ASSIST_TRANSCRIPT_INVALID";
  if (!isRecord(body) || !Array.isArray(body.segments)) {
    invalid(code, "segments must be an array.");
  }
  const segments = body.segments as unknown[];
  if (segments.length < 1 || segments.length > MAX_SEGMENTS_PER_BATCH) {
    invalid(code, `segments must hold 1-${MAX_SEGMENTS_PER_BATCH} items.`);
  }
  return segments.map((raw, index) => {
    if (!isRecord(raw)) invalid(code, `segments.${index} must be an object.`);
    const segmentId = boundedString(raw.segmentId, 200);
    if (!segmentId) invalid(code, `segments.${index}.segmentId is required.`);
    const speaker = raw.speaker ?? "unknown";
    if (typeof speaker !== "string" || !TRANSCRIPT_SPEAKERS.has(speaker)) {
      invalid(
        code,
        `segments.${index}.speaker must be caller, agent or unknown.`,
      );
    }
    if (
      typeof raw.text !== "string" ||
      raw.text.length > MAX_SEGMENT_TEXT_LENGTH
    ) {
      invalid(
        code,
        `segments.${index}.text must be a string of at most ${MAX_SEGMENT_TEXT_LENGTH} characters.`,
      );
    }
    let startedAt: string | null = null;
    if (raw.startedAt !== undefined && raw.startedAt !== null) {
      if (
        typeof raw.startedAt !== "string" ||
        Number.isNaN(Date.parse(raw.startedAt))
      ) {
        invalid(code, `segments.${index}.startedAt must be an ISO time.`);
      }
      startedAt = new Date(raw.startedAt).toISOString();
    }
    return {
      segmentId,
      speaker: speaker as AssistTranscriptSegment["speaker"],
      text: raw.text,
      startedAt,
    };
  });
}

export interface FieldOutcomeInput {
  orderId: string;
  agentId: string | null;
  fields: Array<{
    field: AssistField;
    aiApplied: boolean;
    agentEdited: boolean;
    finalPresent: boolean;
  }>;
}

/** Validates the console's per-field submit report. */
export function parseFieldOutcomeBatch(body: unknown): FieldOutcomeInput {
  const code = "CALLCENTER_ASSIST_OUTCOME_INVALID";
  if (!isRecord(body)) invalid(code, "body must be an object.");
  const orderId = boundedString(body.orderId, 100);
  if (!orderId) invalid(code, "orderId is required.");
  const agentId =
    body.agentId === undefined || body.agentId === null
      ? null
      : boundedString(body.agentId, 100);
  if (body.agentId !== undefined && body.agentId !== null && !agentId) {
    invalid(code, "agentId must be a short string.");
  }
  if (
    !Array.isArray(body.fields) ||
    body.fields.length > ASSIST_FIELDS.length
  ) {
    invalid(
      code,
      `fields must be an array of at most ${ASSIST_FIELDS.length}.`,
    );
  }
  const seen = new Set<string>();
  const fields = (body.fields as unknown[]).map((raw, index) => {
    if (!isRecord(raw) || !isAssistField(raw.field)) {
      invalid(code, `fields.${index}.field is not a known booking field.`);
    }
    if (seen.has(raw.field as string)) {
      invalid(code, `fields.${index}.field is repeated.`);
    }
    seen.add(raw.field as string);
    for (const flag of ["aiApplied", "agentEdited", "finalPresent"] as const) {
      if (typeof raw[flag] !== "boolean") {
        invalid(code, `fields.${index}.${flag} must be a boolean.`);
      }
    }
    return {
      field: raw.field as AssistField,
      aiApplied: raw.aiApplied as boolean,
      agentEdited: raw.agentEdited as boolean,
      finalPresent: raw.finalPresent as boolean,
    };
  });
  return { orderId, agentId, fields };
}

export interface AssistAccuracyBucket {
  accepted: number;
  corrected: number;
  aiMissing: number;
  /** Share of AI-filled fields the agent kept unchanged. */
  accuracy: number | null;
  /** Share of submitted fields the AI had filled at all. */
  coverage: number | null;
}

export interface AssistAccuracyReport {
  since: string;
  until: string;
  totals: AssistAccuracyBucket;
  byField: Array<AssistAccuracyBucket & { field: AssistField }>;
  bySource: Array<AssistAccuracyBucket & { source: AssistDraftSource }>;
}

function bucket(
  counts: Record<AssistFieldOutcome, number>,
): AssistAccuracyBucket {
  const filled = counts.accepted + counts.corrected;
  const all = filled + counts.ai_missing;
  return {
    accepted: counts.accepted,
    corrected: counts.corrected,
    aiMissing: counts.ai_missing,
    accuracy: filled
      ? Math.round((counts.accepted / filled) * 1000) / 1000
      : null,
    coverage: all ? Math.round((filled / all) * 1000) / 1000 : null,
  };
}

/**
 * CALLCENTER-AI-ASSIST-20261111. The agent's AI-prefilled booking draft:
 * seeded from the voice AI on handoff, or extracted from the live transcript
 * while a human agent handles the call. The agent always reviews and submits;
 * this service never creates an order. When the order is submitted the
 * per-field outcome (kept / corrected / missed) feeds the accuracy metric.
 */
@Injectable()
export class CallcenterAssistService {
  private readonly logger = new Logger(CallcenterAssistService.name);

  constructor(
    private readonly repository: CallcenterAssistRepository,
    @Optional() private readonly llm?: LlmGatewayService,
    @Optional() private readonly handoffQueue?: VoiceHandoffQueueService,
  ) {}

  retentionDays(env: NodeJS.ProcessEnv = process.env): number {
    const raw = Number(env.CALLCENTER_ASSIST_RETENTION_DAYS);
    return Number.isInteger(raw) && raw >= 1 && raw <= 90
      ? raw
      : DEFAULT_RETENTION_DAYS;
  }

  async getDraft(callId: string): Promise<CallcenterAssistDraft | null> {
    return this.repository.findDraft(callId);
  }

  /** The voice AI handed the call to a human: prefill from its dialogue. */
  async seedFromVoiceHandoff(input: {
    callId: string;
    handoffId: string;
    voiceSessionId: string;
    fields: AssistFieldMap;
  }): Promise<CallcenterAssistDraft> {
    const now = new Date().toISOString();
    const draft = await this.repository.updateDraft(
      input.callId,
      async (current) => {
        const base =
          current ?? this.newDraft(input.callId, "voice_handoff", now);
        const next: CallcenterAssistDraft = {
          ...base,
          source: "voice_handoff",
          handoffId: input.handoffId,
          voiceSessionId: input.voiceSessionId,
          // The AI's own dialogue state is newer than anything heard before
          // the handoff; earlier values stay visible as candidates. Stamped
          // with the handoff time: only speech after it may override them.
          fields: this.overlay(
            base.fields,
            Object.fromEntries(
              Object.entries(input.fields).map(([field, value]) => [
                field,
                { ...value, updatedAt: now },
              ]),
            ) as AssistFieldMap,
          ),
          extractor: "voice_dialogue",
          draftVersion: current ? current.draftVersion + 1 : 1,
          updatedAt: now,
        };
        return { next, result: next };
      },
    );
    this.purgeExpiredInBackground();
    return draft;
  }

  /**
   * Live transcript from the call (human hotline with the AI listening, or
   * the human part of a handed-off call). Segments are final ASR results;
   * re-sending a segment id replaces its text.
   */
  async ingestTranscript(
    callId: string,
    batch: unknown,
  ): Promise<CallcenterAssistDraft> {
    const now = new Date().toISOString();
    const incoming: AssistTranscriptSegment[] = parseTranscriptBatch(batch)
      .filter((segment) => segment.text.trim())
      .map((segment) => ({
        segmentId: segment.segmentId,
        speaker: segment.speaker,
        text: segment.text.trim(),
        startedAt: segment.startedAt,
        receivedAt: now,
      }));

    const draft = await this.repository.updateDraft(callId, async (current) => {
      const base = current ?? this.newDraft(callId, "agent_assist", now);
      const transcript = this.mergeTranscript(base.transcript, incoming);
      if (current && transcript === base.transcript) {
        return { next: null, result: current };
      }
      const extracted = extractAssistFieldsByRules(transcript, now);
      const next: CallcenterAssistDraft = {
        ...base,
        transcript,
        fields: this.mergeExtracted(base.fields, extracted, transcript),
        extractor: base.extractor,
        draftVersion: current ? current.draftVersion + 1 : 1,
        updatedAt: now,
      };
      return { next, result: next };
    });
    this.purgeExpiredInBackground();
    // A replayed batch changed nothing; do not pay for another model call.
    return draft.updatedAt === now ? this.refineWithLlm(draft) : draft;
  }

  /**
   * Record, for the submitted order, which AI-filled fields the agent kept,
   * which it corrected and which the AI missed. Stores outcomes only, never
   * field values. Idempotent per (call, order, field).
   */
  async recordOutcomes(
    callId: string,
    batch: unknown,
  ): Promise<{ recorded: number; outcomes: AssistFieldOutcomeRecord[] }> {
    const parsed = parseFieldOutcomeBatch(batch);
    const draft = await this.repository.findDraft(callId);
    if (!draft) {
      // No AI draft existed for this call: nothing to measure.
      return { recorded: 0, outcomes: [] };
    }
    const recordedAt = new Date().toISOString();
    const outcomes: AssistFieldOutcomeRecord[] = [];
    for (const entry of parsed.fields) {
      const field = entry.field;
      const aiValue = draft.fields[field];
      const outcome = decideFieldOutcome({
        aiValue,
        aiApplied: entry.aiApplied,
        agentEdited: entry.agentEdited,
        finalPresent: entry.finalPresent,
      });
      if (!outcome) continue;
      outcomes.push({
        callId,
        orderId: parsed.orderId,
        field,
        source: draft.source,
        outcome,
        aiStatus: outcome === "ai_missing" ? null : (aiValue?.status ?? null),
        aiConfidence:
          outcome === "ai_missing" ? null : (aiValue?.confidence ?? null),
        agentId: parsed.agentId,
        recordedAt,
      });
    }
    const recorded = await this.repository.insertOutcomes(outcomes);
    await this.repository.updateDraft(callId, async (current) => {
      if (!current || current.submittedOrderId) {
        return { next: null, result: undefined };
      }
      return {
        next: {
          ...current,
          submittedOrderId: parsed.orderId,
          submittedAt: recordedAt,
          updatedAt: recordedAt,
        },
        result: undefined,
      };
    });
    if (draft.handoffId && this.handoffQueue) {
      await this.handoffQueue.complete(draft.handoffId).catch((error) => {
        this.logger.warn(
          `Assist outcome recorded but handoff ${draft.handoffId} could not be completed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
    return { recorded, outcomes };
  }

  async getAccuracy(input: {
    since?: string | undefined;
    until?: string | undefined;
  }): Promise<AssistAccuracyReport> {
    // The range end is exclusive. Without an explicit end, include the
    // current millisecond so an outcome recorded just now is counted.
    const until = input.until
      ? new Date(input.until)
      : new Date(Date.now() + 1);
    const since = input.since
      ? new Date(input.since)
      : new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(since.getTime()) ||
      Number.isNaN(until.getTime()) ||
      since >= until
    ) {
      throw new ApiRequestError(
        400,
        "CALLCENTER_ASSIST_RANGE_INVALID",
        "since must be an ISO time earlier than until.",
      );
    }
    const rows = await this.repository.aggregateOutcomes(since, until);
    const empty = (): Record<AssistFieldOutcome, number> => ({
      accepted: 0,
      corrected: 0,
      ai_missing: 0,
    });
    const totals = empty();
    const byField = new Map<AssistField, Record<AssistFieldOutcome, number>>();
    const bySource = new Map<
      AssistDraftSource,
      Record<AssistFieldOutcome, number>
    >();
    for (const row of rows) {
      totals[row.outcome] += row.count;
      const fieldCounts = byField.get(row.field) ?? empty();
      fieldCounts[row.outcome] += row.count;
      byField.set(row.field, fieldCounts);
      const sourceCounts = bySource.get(row.source) ?? empty();
      sourceCounts[row.outcome] += row.count;
      bySource.set(row.source, sourceCounts);
    }
    return {
      since: since.toISOString(),
      until: until.toISOString(),
      totals: bucket(totals),
      byField: ASSIST_FIELDS.filter((field) => byField.has(field)).map(
        (field) => ({ field, ...bucket(byField.get(field)!) }),
      ),
      bySource: [...bySource.entries()].map(([source, counts]) => ({
        source,
        ...bucket(counts),
      })),
    };
  }

  // ------------------------------------------------------------ helpers ---

  private newDraft(
    callId: string,
    source: AssistDraftSource,
    now: string,
  ): CallcenterAssistDraft {
    return {
      callId,
      source,
      handoffId: null,
      voiceSessionId: null,
      fields: {},
      transcript: [],
      draftVersion: 1,
      extractor: source === "voice_handoff" ? "voice_dialogue" : "rules",
      submittedOrderId: null,
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(
        Date.parse(now) + this.retentionDays() * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  /** Returns the same array instance when nothing changed. */
  private mergeTranscript(
    existing: AssistTranscriptSegment[],
    incoming: AssistTranscriptSegment[],
  ): AssistTranscriptSegment[] {
    let changed = false;
    const merged = [...existing];
    for (const segment of incoming) {
      const index = merged.findIndex(
        (candidate) => candidate.segmentId === segment.segmentId,
      );
      if (index === -1) {
        merged.push(segment);
        changed = true;
      } else if (
        merged[index]!.text !== segment.text ||
        merged[index]!.speaker !== segment.speaker
      ) {
        merged[index] = { ...segment, receivedAt: merged[index]!.receivedAt };
        changed = true;
      }
    }
    if (!changed) {
      return existing;
    }
    return merged.slice(-MAX_TRANSCRIPT_SEGMENTS);
  }

  /** New values win; replaced values stay as candidates. */
  private overlay(base: AssistFieldMap, incoming: AssistFieldMap) {
    const result: AssistFieldMap = { ...base };
    for (const field of ASSIST_FIELDS) {
      const next = incoming[field];
      if (!next) continue;
      const previous = base[field];
      result[field] =
        previous && previous.value !== next.value
          ? {
              ...next,
              candidates: mergeCandidates(
                next.candidates,
                previous.value,
              ).filter((candidate) => candidate !== next.value),
            }
          : next;
    }
    return result;
  }

  /**
   * Rule results are recomputed from the whole transcript every time, so a
   * rule-origin field is simply replaced. A value from the voice AI or the
   * LLM is only replaced by rule evidence heard after it was set.
   */
  private mergeExtracted(
    existing: AssistFieldMap,
    extracted: AssistFieldMap,
    transcript: AssistTranscriptSegment[],
  ): AssistFieldMap {
    // When the segment carries its call time, use it: segments spoken before
    // the voice AI handed over must not override the AI's confirmed values.
    const spokenAt = new Map(
      transcript.map((segment) => [
        segment.segmentId,
        segment.startedAt ?? segment.receivedAt,
      ]),
    );
    const result: AssistFieldMap = {};
    for (const field of ASSIST_FIELDS) {
      const current = existing[field];
      const next = extracted[field];
      if (!next) {
        if (current) result[field] = current;
        continue;
      }
      if (!current || current.origin === "rules") {
        result[field] = next;
        continue;
      }
      const newer = next.sourceSegmentIds.some(
        (id) =>
          Date.parse(spokenAt.get(id) ?? "") > Date.parse(current.updatedAt),
      );
      result[field] = newer
        ? this.overlay({ [field]: current }, { [field]: next })[field]!
        : current;
    }
    return result;
  }

  private async refineWithLlm(
    draft: CallcenterAssistDraft,
  ): Promise<CallcenterAssistDraft> {
    if (!isAssistLlmEnabled(this.llm) || draft.transcript.length === 0) {
      return draft;
    }
    let refined: AssistFieldMap;
    try {
      // Outside the row lock: the model may take seconds.
      refined = await refineAssistFieldsWithLlm(
        this.llm!,
        draft.transcript,
        draft.fields,
      );
    } catch (error) {
      this.logger.warn(
        `Assist LLM refinement failed for call ${draft.callId}; keeping rule result: ${error instanceof Error ? error.message : String(error)}`,
      );
      return draft;
    }
    return this.repository.updateDraft(draft.callId, async (current) => {
      // A newer transcript batch already re-extracted; it will refine itself.
      if (!current || current.draftVersion !== draft.draftVersion) {
        return { next: null, result: current ?? draft };
      }
      const next: CallcenterAssistDraft = {
        ...current,
        fields: refined,
        extractor: "llm",
        draftVersion: current.draftVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      return { next, result: next };
    });
  }

  private purgeExpiredInBackground() {
    void this.repository.purgeExpired().catch((error) => {
      this.logger.warn(
        `Expired assist draft purge failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
