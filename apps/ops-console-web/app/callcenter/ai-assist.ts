/**
 * CALLCENTER-AI-ASSIST-20261111: the AI fills the phone booking, the agent
 * corrects what is wrong and submits. Pure state logic for the console; the
 * API keeps the AI's draft (GET /api/callcenter/sessions/:callId/assist).
 *
 * Rules the agent can rely on:
 * - A field the agent has edited is never overwritten by later AI updates;
 *   a newer AI value is offered next to it instead.
 * - A field the AI marked "uncertain" must be confirmed or edited before
 *   the order can be submitted.
 * - On submit, each field's outcome (kept / corrected / missed by the AI) is
 *   reported so the AI's accuracy can be measured.
 */

import type { AddressPayload } from "@drts/contracts";

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

/** Fields that are not separate inputs on the order form; they are written
 * into the order notes for the driver. */
export const ASSIST_NOTE_FIELDS = [
  "pickupTime",
  "passengerCount",
  "luggage",
  "requiredCapabilities",
] as const satisfies readonly AssistField[];

export interface AssistFieldView {
  value: string;
  rawText: string | null;
  confidence: number | null;
  status: "filled" | "uncertain";
  candidates: string[];
  origin: "voice_dialogue" | "rules" | "llm";
}

export interface AssistTranscriptLine {
  segmentId: string;
  speaker: "caller" | "agent" | "unknown";
  text: string;
}

export interface AssistDraftView {
  callId: string;
  source: "voice_handoff" | "agent_assist";
  handoffId: string | null;
  fields: Partial<Record<AssistField, AssistFieldView>>;
  transcript: AssistTranscriptLine[];
  draftVersion: number;
  extractor: "voice_dialogue" | "rules" | "llm";
  submittedOrderId: string | null;
}

export interface HandoffQueueItemView {
  handoffId: string;
  callId: string;
  priority: "normal" | "urgent" | "emergency";
  reason: string;
  status: string;
  assignedAgentId: string | null;
  enqueuedAt: string;
}

export interface AssistAccuracyView {
  totals: {
    accepted: number;
    corrected: number;
    aiMissing: number;
    accuracy: number | null;
    coverage: number | null;
  };
  byField: Array<{
    field: AssistField;
    accepted: number;
    corrected: number;
    aiMissing: number;
    accuracy: number | null;
  }>;
}

export interface AssistFormState {
  callId: string | null;
  draftVersion: number;
  /** Current value per field as the agent sees it. */
  values: Partial<Record<AssistField, string>>;
  /** The AI value last applied to the field. */
  aiValues: Partial<Record<AssistField, string>>;
  aiApplied: Partial<Record<AssistField, boolean>>;
  agentEdited: Partial<Record<AssistField, boolean>>;
  confirmed: Partial<Record<AssistField, boolean>>;
  /** A newer AI value for a field the agent already edited. */
  offers: Partial<Record<AssistField, string>>;
}

export function emptyAssistForm(callId: string | null = null): AssistFormState {
  return {
    callId,
    draftVersion: 0,
    values: {},
    aiValues: {},
    aiApplied: {},
    agentEdited: {},
    confirmed: {},
    offers: {},
  };
}

/**
 * Merge a newer AI draft into the agent's form. Returns the fields whose
 * value changed, so the page can update the matching order-form inputs.
 */
export function applyAssistDraft(
  state: AssistFormState,
  draft: AssistDraftView,
): { state: AssistFormState; changed: AssistField[] } {
  const base =
    state.callId === draft.callId ? state : emptyAssistForm(draft.callId);
  if (base.callId === draft.callId && draft.draftVersion <= base.draftVersion) {
    return { state: base, changed: [] };
  }
  const next: AssistFormState = {
    ...base,
    callId: draft.callId,
    draftVersion: draft.draftVersion,
    values: { ...base.values },
    aiValues: { ...base.aiValues },
    aiApplied: { ...base.aiApplied },
    confirmed: { ...base.confirmed },
    offers: { ...base.offers },
  };
  const changed: AssistField[] = [];
  for (const field of ASSIST_FIELDS) {
    const ai = draft.fields[field];
    if (!ai || ai.value === base.aiValues[field]) {
      continue;
    }
    next.aiValues[field] = ai.value;
    if (base.agentEdited[field]) {
      if (ai.value !== base.values[field]) {
        next.offers[field] = ai.value;
      }
      continue;
    }
    next.values[field] = ai.value;
    next.aiApplied[field] = true;
    next.confirmed[field] = false;
    delete next.offers[field];
    changed.push(field);
  }
  return { state: next, changed };
}

/** The agent typed or picked a value for a field. */
export function editAssistField(
  state: AssistFormState,
  field: AssistField,
  value: string,
): AssistFormState {
  const edited =
    state.aiApplied[field] === true
      ? value.trim() !== (state.aiValues[field] ?? "").trim()
      : value.trim() !== "";
  const offers = { ...state.offers };
  delete offers[field];
  return {
    ...state,
    values: { ...state.values, [field]: value },
    agentEdited: { ...state.agentEdited, [field]: edited },
    offers,
  };
}

/** The agent checked an uncertain AI value and accepts it as is. */
export function confirmAssistField(
  state: AssistFormState,
  field: AssistField,
): AssistFormState {
  return { ...state, confirmed: { ...state.confirmed, [field]: true } };
}

/** Use the newer AI value the agent was offered. */
export function acceptAssistOffer(
  state: AssistFormState,
  field: AssistField,
): AssistFormState {
  const offer = state.offers[field];
  if (offer === undefined) {
    return state;
  }
  const offers = { ...state.offers };
  delete offers[field];
  return {
    ...state,
    values: { ...state.values, [field]: offer },
    aiApplied: { ...state.aiApplied, [field]: true },
    agentEdited: { ...state.agentEdited, [field]: false },
    confirmed: { ...state.confirmed, [field]: true },
    offers,
  };
}

/** Uncertain AI values the agent has neither confirmed nor corrected. */
export function blockingUncertainFields(
  state: AssistFormState,
  draft: AssistDraftView | null,
): AssistField[] {
  if (!draft || draft.callId !== state.callId) {
    return [];
  }
  return ASSIST_FIELDS.filter(
    (field) =>
      draft.fields[field]?.status === "uncertain" &&
      state.aiApplied[field] === true &&
      !state.agentEdited[field] &&
      !state.confirmed[field],
  );
}

export type AssistFieldStatusView =
  | "empty"
  | "ai_filled"
  | "ai_uncertain"
  | "confirmed"
  | "agent_edited";

export function assistFieldStatus(
  state: AssistFormState,
  draft: AssistDraftView | null,
  field: AssistField,
): AssistFieldStatusView {
  if (state.agentEdited[field]) return "agent_edited";
  if (!state.aiApplied[field]) return "empty";
  if (state.confirmed[field]) return "confirmed";
  return draft?.fields[field]?.status === "uncertain"
    ? "ai_uncertain"
    : "ai_filled";
}

const CAPABILITY_LABELS: Record<string, { zh: string; en: string }> = {
  wheelchair: { zh: "輪椅", en: "wheelchair" },
  child_seat: { zh: "兒童座椅", en: "child seat" },
};

export function formatCapabilities(value: string, locale: "zh" | "en") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => CAPABILITY_LABELS[item]?.[locale] ?? item)
    .join(locale === "zh" ? "、" : ", ");
}

/**
 * The order notes the driver sees: the agent's own notes plus the trip
 * details the AI collected that have no dedicated order field.
 */
export function composeOrderNotes(
  agentNotes: string,
  state: AssistFormState,
  locale: "zh" | "en",
): string {
  const labels =
    locale === "zh"
      ? {
          pickupTime: "乘車時間",
          passengerCount: "乘客人數",
          luggage: "行李",
          requiredCapabilities: "特殊需求",
        }
      : {
          pickupTime: "Pickup time",
          passengerCount: "Passengers",
          luggage: "Luggage",
          requiredCapabilities: "Needs",
        };
  const parts: string[] = [];
  for (const field of ASSIST_NOTE_FIELDS) {
    const raw = state.values[field]?.trim();
    if (!raw) continue;
    const value =
      field === "requiredCapabilities" ? formatCapabilities(raw, locale) : raw;
    parts.push(`${labels[field]}：${value}`);
  }
  const aiNotes = state.values.notes?.trim();
  const own = agentNotes.trim();
  return [own, aiNotes && aiNotes !== own ? aiNotes : "", parts.join("；")]
    .filter(Boolean)
    .join("\n");
}

/**
 * Per-field outcome report for POST .../assist/outcomes. `finalPresent`
 * comes from the actual order: addresses and passenger fields from the
 * order form, the rest from the assist inputs.
 */
export function buildAssistOutcomeReport(
  state: AssistFormState,
  finalPresence: Partial<Record<AssistField, boolean>>,
) {
  return ASSIST_FIELDS.map((field) => ({
    field,
    aiApplied: state.aiApplied[field] === true,
    agentEdited: state.agentEdited[field] === true,
    finalPresent: finalPresence[field] ?? Boolean(state.values[field]?.trim()),
  }));
}

export function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function handoffWaitMinutes(enqueuedAt: string, now = Date.now()) {
  const started = Date.parse(enqueuedAt);
  return Number.isFinite(started)
    ? Math.max(0, Math.floor((now - started) / 60_000))
    : 0;
}

/** Same place: equal coordinates and address text (null equals null). */
export function sameAddress(
  left: AddressPayload | null | undefined,
  right: AddressPayload | null | undefined,
) {
  if (!left || !right) {
    return !left && !right;
  }
  return (
    left.lat === right.lat &&
    left.lng === right.lng &&
    (left.address ?? "") === (right.address ?? "")
  );
}

/** A pickup place this caller's phone number used on earlier trips. */
export interface FrequentPlaceView {
  label: string;
  address: {
    address: string;
    addressName?: string | null;
    normalizedAddress?: string | null;
    lat: number;
    lng: number;
    placeId?: string | null;
    geocodeProvider?: string | null;
    coordinateSource?: string | null;
  };
  tripCount: number;
  lastUsedAt: string;
}

function compactText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[\s，,。.、()（）-]/g, "")
    .replace(/臺/g, "台")
    .toLowerCase();
}

/**
 * The frequent place the caller's spoken address refers to, if any: one of
 * the two contains the other, ignoring spaces, punctuation and 臺/台. Short
 * fragments (under four characters) never match, so "車站" alone cannot
 * pick a stored place.
 */
export function matchFrequentPlace(
  spoken: string,
  places: readonly FrequentPlaceView[],
): FrequentPlaceView | null {
  const said = compactText(spoken);
  if (said.length < 4) return null;
  for (const place of places) {
    for (const text of [
      place.label,
      place.address.address,
      place.address.addressName,
      place.address.normalizedAddress,
    ]) {
      const known = compactText(text);
      if (known.length >= 4 && (known.includes(said) || said.includes(known))) {
        return place;
      }
    }
  }
  return null;
}

/** The order-form address for a frequent place, keeping its original pin
 * and provenance; it records who chose it now. */
export function frequentPlaceToAddress(
  place: FrequentPlaceView,
  actorId: string,
  now: string = new Date().toISOString(),
): AddressPayload {
  const { address } = place;
  return {
    address: address.address,
    addressName: address.addressName ?? null,
    normalizedAddress: address.normalizedAddress ?? null,
    lat: address.lat,
    lng: address.lng,
    placeId: address.placeId ?? null,
    geocodeProvider: address.geocodeProvider ?? null,
    ...(address.coordinateSource
      ? {
          coordinateSource: address.coordinateSource as NonNullable<
            AddressPayload["coordinateSource"]
          >,
        }
      : {}),
    selectedByActorId: actorId,
    selectedAt: now,
    surface: "callcenter",
  };
}
