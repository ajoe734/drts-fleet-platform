import type {
  VoiceDialogueOutput,
  VoiceDialogueSnapshotContent,
} from "@drts/contracts";

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
export interface AddressCandidate {
  placeId: string;
  label: string;
  region: string;
}

/** Session-owned state. Persist snapshots with the session's existing CAS/epoch
 * repository before further action; model proposals never constitute proof. */
export class VoiceDialogueState {
  draftVersion = 0;
  confirmationId: string | null = null;
  readonly slots: Partial<
    Record<VoiceDialogueOutput["slots"][number]["field"], SlotEvidence>
  > = {};
  readonly slotHistory: Array<{
    field: VoiceDialogueOutput["slots"][number]["field"];
    evidence: SlotEvidence;
  }> = [];
  readonly addressRepairs: Record<"pickup" | "dropoff", number> = {
    pickup: 0,
    dropoff: 0,
  };
  readonly addressHistory: Array<{
    field: "pickup" | "dropoff";
    rawText: string;
    candidates: AddressCandidate[];
  }> = [];
  handoff: { reason: string; intent: string } | null = null;
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
   * canonical 2026-10-03T20:13:00Z): the `expectedSnapshotSessionVersion`
   * this attachment's dialogue CONTENT was last durably committed under --
   * deliberately separate from `VoiceSessionBinding.sessionVersion`, which
   * also advances on every authoritative CONTROL event (e.g. a barge-in's
   * `speech.started`, see `VoiceCallTurnCoordinator.
   * recordAuthoritativeControlEvent`) with no dialogue-content write at
   * all. A prior version of `createTrustedDialoguePersistPort`'s late
   * reconciliation fenced against `binding.sessionVersion` itself to avoid
   * regressing a newer turn's already-installed content -- but a barge-in
   * alone bumps that same counter without ever installing anything here,
   * so it incorrectly suppressed recovery of a cancelled turn's genuinely
   * durable commit. `null` means no content has been committed to this
   * attachment yet (fresh session, or restored with no prior snapshot). */
  committedSessionVersion: number | null = null;

  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
   * canonical 2026-10-03T21:09:40Z, "unresolved commit still admits
   * destructive subsequent dialogue"): non-null exactly when a content
   * commit's own HTTP acknowledgement was lost AND the immediate
   * best-effort reconciliation read (`reconcileAmbiguousCommit`) also
   * failed to resolve it -- the server-side outcome of this exact write
   * (landed, or never landed) is genuinely unknown, not merely "failed".
   * Captures the exact identity of the ambiguous write so a later
   * reconciliation attempt (possibly for a completely different,
   * subsequent turn) can still recognize and resolve THIS ONE. Must be
   * cleared only by `reconcileUnresolvedCommit` actually resolving it --
   * never by a later turn's own persist attempt proceeding past it,
   * which is exactly the defect this marker exists to block. */
  unresolvedCommit: {
    expectedSessionVersion: number;
    inputEpoch: number;
    mediaEpoch: number;
    turnId: string;
  } | null = null;
  /** The in-flight bounded reconciliation attempting to resolve
   * `unresolvedCommit`, if one is already running -- a concurrent second
   * caller (e.g. a barge-in-abandoned turn's own still-running background
   * persist racing a brand new turn's foreground one, see
   * `reconcileUnresolvedCommit`'s own doc) joins this SAME attempt
   * instead of starting a redundant, independent one. Cleared together
   * with `unresolvedCommit` once the attempt settles. */
  unresolvedCommitRecovery: Promise<unknown> | null = null;

  apply(output: VoiceDialogueOutput, turnId: string): void {
    if (this.handoff) return;
    const reasons: Record<string, string> = {
      human: "customer_requested",
      complaint: "customer_requested",
      lost_property: "customer_requested",
      emergency: "urgent_safety",
      cancel: "service_unsupported",
      amend: "service_unsupported",
      reservation: "service_unsupported",
    };
    const reason = reasons[output.intent];
    const requestedHandoff = output.tools.find(
      (tool) => tool.name === "request_handoff",
    );
    if (reason || requestedHandoff || output.terminal === "handoff") {
      this.handoff = {
        reason: reason ?? requestedHandoff?.args.reason ?? "customer_requested",
        intent: output.intent,
      };
      this.confirmationId = null;
      return;
    }
    for (const slot of output.slots) {
      const old = this.slots[slot.field];
      if (old?.candidate === slot.candidate && old.rawText === slot.rawText)
        continue;
      if (old)
        this.slotHistory.push({
          field: slot.field,
          evidence: structuredClone(old),
        });
      this.slots[slot.field] = {
        rawText: slot.rawText,
        candidate: slot.candidate,
        normalizedValue: null,
        sourceTurnIds: [turnId],
        sourceSegmentIds: [...slot.sourceSegmentIds],
        providerConfidence: slot.providerConfidence,
        validationState: "unvalidated",
        confirmedByCustomerAt: null,
      };
      this.draftVersion++;
      this.confirmationId = null;
    }
  }

  /** Called only with address-service results. Two failed repair answers after
   * the initial ambiguous query terminate collection with the full history. */
  unresolvedAddress(
    field: "pickup" | "dropoff",
    candidates: AddressCandidate[],
    repairAnswer: boolean,
  ): void {
    this.addressHistory.push({
      field,
      rawText: this.slots[field]?.rawText ?? "",
      candidates: candidates.slice(0, 3).map((c) => ({ ...c })),
    });
    if (repairAnswer) this.addressRepairs[field]++;
    if (this.addressRepairs[field] >= 2) {
      this.handoff = { reason: "location_unresolved", intent: "book" };
      this.confirmationId = null;
    }
  }

  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: the plain, JSON-serializable
   * projection persisted via `VoiceApiClient.persistDialogueSnapshot`
   * (encrypted at rest by apps/api, see
   * `infra/migrations/V0106__voice_dialogue_snapshot.sql`) and validated
   * against `voiceDialogueSnapshotContentSchema` field-for-field. */
  toSnapshotContent(): VoiceDialogueSnapshotContent {
    return {
      draftVersion: this.draftVersion,
      confirmationId: this.confirmationId,
      slots: structuredClone(this.slots) as VoiceDialogueSnapshotContent["slots"],
      slotHistory: structuredClone(
        this.slotHistory,
      ) as VoiceDialogueSnapshotContent["slotHistory"],
      addressRepairs: { ...this.addressRepairs },
      addressHistory: structuredClone(
        this.addressHistory,
      ) as VoiceDialogueSnapshotContent["addressHistory"],
      handoff: this.handoff ? { ...this.handoff } : null,
    };
  }

  /** Rehydrates a freshly-constructed (blank) state from a restored
   * snapshot -- call once, immediately after `attach()`, before any turn
   * runs for this attachment (see
   * `VoiceCallTurnCoordinator`'s restoration doc). Never merges into a
   * state that has already processed a turn: a restore is a cold-start
   * seam, not a live reconciliation. */
  restoreFromSnapshotContent(content: VoiceDialogueSnapshotContent): void {
    this.draftVersion = content.draftVersion;
    this.confirmationId = content.confirmationId;
    for (const field of Object.keys(this.slots) as Array<
      keyof typeof this.slots
    >) {
      delete this.slots[field];
    }
    for (const [field, evidence] of Object.entries(content.slots)) {
      (this.slots as Record<string, unknown>)[field] = structuredClone(evidence);
    }
    this.slotHistory.length = 0;
    this.slotHistory.push(...(structuredClone(content.slotHistory) as typeof this.slotHistory));
    this.addressRepairs.pickup = content.addressRepairs.pickup;
    this.addressRepairs.dropoff = content.addressRepairs.dropoff;
    this.addressHistory.length = 0;
    this.addressHistory.push(
      ...(structuredClone(content.addressHistory) as typeof this.addressHistory),
    );
    this.handoff = content.handoff ? { ...content.handoff } : null;
  }

  handoffSummary() {
    return structuredClone({
      reason: this.handoff,
      draftVersion: this.draftVersion,
      confirmed: Object.entries(this.slots).filter(
        ([, s]) => s?.confirmedByCustomerAt,
      ),
      unconfirmed: Object.entries(this.slots).filter(
        ([, s]) => !s?.confirmedByCustomerAt,
      ),
      addresses: this.addressHistory,
      revisions: this.slotHistory,
    });
  }
}

/** Digit groups avoid cardinal-number ambiguity. Time input must be the
 * server-normalized UTC instant, rendered with the required Taipei date. */
export function voiceNumericReadback(
  kind: "phone" | "door" | "time",
  value: string,
): string {
  if (kind === "time") {
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new Error("voice_time_invalid");
    const parts = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const part = (name: string) =>
      parts
        .find((p) => p.type === name)!
        .value.split("")
        .join(" ");
    return `${part("year")} 年 ${part("month")} 月 ${part("day")} 日 ${part("hour")} 點 ${part("minute")} 分`;
  }
  if (kind === "phone") {
    if (
      !/^\+?[0-9 -]{8,20}$/.test(value) ||
      !/^\+?\d{8,15}$/.test(value.replace(/[ -]/g, ""))
    )
      throw new Error("voice_phone_invalid");
    return value
      .replace(/[ -]/g, "")
      .replace(/\d{1,3}/g, (group) => group.split("").join(" ") + "，")
      .replace(/，$/, "");
  }
  return value.replace(/\d+/g, (digits) => digits.split("").join(" "));
}
