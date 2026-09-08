import type { VoiceDialogueOutput } from "@drts/contracts";

export interface SlotEvidence {
  rawText: string;
  normalizedValue: string | null;
  candidate: string;
  sourceTurnIds: string[];
  sourceSegmentIds: string[];
  providerConfidence: number | null;
  validationState: "unvalidated" | "validated";
  confirmedByCustomerAt: string | null;
}
export interface AddressCandidate { placeId: string; label: string; region: string }

/** Session-owned state. Persist snapshots with the session's existing CAS/epoch
 * repository before further action; model proposals never constitute proof. */
export class VoiceDialogueState {
  draftVersion = 0;
  confirmationId: string | null = null;
  readonly slots: Partial<Record<VoiceDialogueOutput["slots"][number]["field"], SlotEvidence>> = {};
  readonly addressRepairs: Record<"pickup" | "dropoff", number> = { pickup: 0, dropoff: 0 };
  readonly addressHistory: Array<{ field: "pickup" | "dropoff"; rawText: string; candidates: AddressCandidate[] }> = [];
  handoff: { reason: string; intent: string } | null = null;

  apply(output: VoiceDialogueOutput, turnId: string): void {
    if (this.handoff) return;
    const reasons: Record<string, string> = {
      human: "customer_requested", complaint: "customer_requested", lost_property: "customer_requested",
      emergency: "urgent_safety", cancel: "service_unsupported", amend: "service_unsupported", reservation: "service_unsupported",
    };
    const reason = reasons[output.intent];
    if (reason || output.terminal === "handoff") {
      this.handoff = { reason: reason ?? "customer_requested", intent: output.intent };
      this.confirmationId = null;
      return;
    }
    for (const slot of output.slots) {
      const old = this.slots[slot.field];
      if (old?.candidate === slot.candidate && old.rawText === slot.rawText) continue;
      this.slots[slot.field] = {
        rawText: slot.rawText, candidate: slot.candidate, normalizedValue: null,
        sourceTurnIds: [turnId], sourceSegmentIds: [...slot.sourceSegmentIds],
        providerConfidence: slot.providerConfidence, validationState: "unvalidated", confirmedByCustomerAt: null,
      };
      this.draftVersion++;
      this.confirmationId = null;
    }
  }

  /** Called only with address-service results. Two failed repair answers after
   * the initial ambiguous query terminate collection with the full history. */
  unresolvedAddress(field: "pickup" | "dropoff", candidates: AddressCandidate[], repairAnswer: boolean): void {
    this.addressHistory.push({ field, rawText: this.slots[field]?.rawText ?? "", candidates: candidates.slice(0, 3).map(c => ({ ...c })) });
    if (repairAnswer) this.addressRepairs[field]++;
    if (this.addressRepairs[field] >= 2) {
      this.handoff = { reason: "location_unresolved", intent: "book" };
      this.confirmationId = null;
    }
  }

  handoffSummary() {
    return structuredClone({ reason: this.handoff, draftVersion: this.draftVersion,
      confirmed: Object.entries(this.slots).filter(([, s]) => s?.confirmedByCustomerAt),
      unconfirmed: Object.entries(this.slots).filter(([, s]) => !s?.confirmedByCustomerAt),
      addresses: this.addressHistory });
  }
}

/** Digit groups avoid cardinal-number ambiguity. Time input must be the
 * server-normalized UTC instant, rendered with the required Taipei date. */
export function voiceNumericReadback(kind: "phone" | "door" | "time", value: string): string {
  if (kind === "time") {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("voice_time_invalid");
    const parts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const part = (name: string) => parts.find(p => p.type === name)!.value.split("").join(" ");
    return `${part("year")} 年 ${part("month")} 月 ${part("day")} 日 ${part("hour")} 點 ${part("minute")} 分`;
  }
  if (kind === "phone") {
    if (!/^\+?[0-9 -]{8,20}$/.test(value)) throw new Error("voice_phone_invalid");
    return value.replace(/[ -]/g, "").replace(/\d{1,3}/g, group => group.split("").join(" ") + "，").replace(/，$/, "");
  }
  return value.replace(/\d+/g, digits => digits.split("").join(" "));
}
