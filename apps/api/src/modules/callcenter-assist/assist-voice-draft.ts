import type { VoiceDialogueSnapshotContent } from "@drts/contracts";

import {
  type AssistField,
  type AssistFieldMap,
  type AssistFieldValue,
  clampConfidence,
  mergeCandidates,
  statusForConfidence,
} from "./assist-fields";

type SlotEvidence = VoiceDialogueSnapshotContent["slots"][string];

const SLOT_TO_FIELD: Record<string, AssistField> = {
  pickup: "pickup",
  dropoff: "dropoff",
  passengerContact: "passengerPhone",
  time: "pickupTime",
  passengerCount: "passengerCount",
  requiredCapabilities: "requiredCapabilities",
  notes: "notes",
};

function slotValue(slot: SlotEvidence): string {
  return (slot.normalizedValue ?? slot.candidate).trim();
}

function slotConfidence(slot: SlotEvidence): number | null {
  // A value the caller explicitly confirmed during read-back, or one the
  // domain already validated, is trusted even if ASR confidence was low.
  if (slot.confirmedByCustomerAt || slot.validationState === "validated") {
    return clampConfidence(Math.max(slot.providerConfidence ?? 0, 0.9));
  }
  return clampConfidence(slot.providerConfidence);
}

function capabilitiesValue(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item): item is string =>
            item === "wheelchair" || item === "child_seat",
        )
        .join(",");
    }
  } catch {
    // Fall through: keep the model's text so the agent can see it.
  }
  return raw;
}

function toFieldValue(
  slot: SlotEvidence,
  value: string,
  previousValues: string[],
  now: string,
): AssistFieldValue {
  const confidence = slotConfidence(slot);
  return {
    value,
    rawText: slot.rawText,
    confidence,
    status: statusForConfidence(confidence),
    candidates: mergeCandidates([], ...previousValues).filter(
      (candidate) => candidate !== value,
    ),
    origin: "voice_dialogue",
    sourceSegmentIds: [...slot.sourceSegmentIds],
    updatedAt: now,
  };
}

/**
 * Turn the voice AI's own dialogue state (the encrypted snapshot the media
 * worker persists every turn) into the agent's prefilled booking draft.
 * Address alternatives the AI offered the caller and values the caller
 * later changed are kept as candidates.
 */
export function buildAssistFieldsFromDialogue(
  content: VoiceDialogueSnapshotContent | null,
  now: string = new Date().toISOString(),
): AssistFieldMap {
  const fields: AssistFieldMap = {};
  if (!content) {
    return fields;
  }
  const history = (slotName: string) =>
    content.slotHistory
      .filter((entry) => entry.field === slotName)
      .map((entry) => slotValue(entry.evidence))
      .reverse();
  const addressAlternatives = (field: "pickup" | "dropoff") =>
    content.addressHistory
      .filter((entry) => entry.field === field)
      .flatMap((entry) => entry.candidates.map((candidate) => candidate.label))
      .reverse();

  for (const [slotName, slot] of Object.entries(content.slots)) {
    const field = SLOT_TO_FIELD[slotName];
    if (!field || !slot) {
      continue;
    }
    const raw = slotValue(slot);
    if (!raw) {
      continue;
    }
    const value =
      field === "requiredCapabilities" ? capabilitiesValue(raw) : raw;
    if (!value) {
      continue;
    }
    const previous =
      field === "pickup" || field === "dropoff"
        ? [...history(slotName), ...addressAlternatives(field)]
        : history(slotName);
    fields[field] = toFieldValue(slot, value, previous, now);
  }

  // The booker's phone stands in for the passenger's when only one was given.
  const booker = content.slots.bookerContact;
  if (!fields.passengerPhone && booker && slotValue(booker)) {
    const value = toFieldValue(booker, slotValue(booker), [], now);
    const confidence = clampConfidence((value.confidence ?? 0) - 0.15);
    fields.passengerPhone = {
      ...value,
      confidence,
      status: statusForConfidence(confidence),
    };
  }

  const luggageCount = content.slots.luggageCount;
  const luggageSize = content.slots.luggageSize;
  if (luggageCount && slotValue(luggageCount)) {
    const oversized = luggageSize && slotValue(luggageSize) === "oversized";
    fields.luggage = toFieldValue(
      luggageCount,
      `${slotValue(luggageCount)} 件${oversized ? "（大型）" : ""}`,
      [],
      now,
    );
  }
  return fields;
}

/** Compact slot view for the handoff summary the queue item carries. */
export function summarizeDialogueSlots(
  fields: AssistFieldMap,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([field, value]) => [
      field,
      {
        value: value.value,
        status: value.status,
        confidence: value.confidence,
      },
    ]),
  );
}
