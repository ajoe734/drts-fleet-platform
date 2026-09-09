import { createHash } from "node:crypto";

export interface ControlledReadback {
  confirmationId: string;
  readbackPlaybackId: string;
  snapshotHash: string;
  script: string;
  readbackScriptHash: string;
  templateVersion: "zh-TW-booking-v1";
  expectedDigit: "1";
  expiresAt: string;
}
export interface ConfirmationMediaPorts {
  /** Controlled TTS must bind this exact text/hash to its immutable audio
   * version. The shared media sink still checks output owner/epoch per chunk. */
  play(plan: ControlledReadback, signal: AbortSignal): Promise<void>;
  /** Synchronous local clear/invalidate/abort, independent of API availability. */
  clear(playbackId: string): void;
  invalidate(reason: "unknown_input" | "disconnect"): Promise<void>;
}

/** Local prompt guard only: API + recorder ledger mint consent. No mark, TTS
 * completion or model final can turn this controller into an accepted proof. */
export class VoiceConfirmationController {
  private plan: ControlledReadback | null = null;
  private abort: AbortController | null = null;
  private completed = false;
  private seenEvents = new Set<string>();
  private retiredPlaybacks = new Set<string>();
  constructor(private readonly ports: ConfirmationMediaPorts) {}

  async readback(input: ControlledReadback): Promise<void> {
    if (this.plan || this.retiredPlaybacks.has(input.readbackPlaybackId))
      throw new Error("voice_readback_active");
    const plan = structuredClone(input);
    if (
      plan.templateVersion !== "zh-TW-booking-v1" ||
      plan.expectedDigit !== "1" ||
      createHash("sha256").update(plan.script).digest("hex") !==
        plan.readbackScriptHash ||
      !Number.isFinite(Date.parse(plan.expiresAt)) ||
      Date.parse(plan.expiresAt) <= Date.now()
    )
      throw new Error("voice_readback_invalid");
    this.plan = plan;
    this.completed = false;
    this.abort = new AbortController();
    try {
      await this.ports.play(structuredClone(plan), this.abort.signal);
    } catch (error) {
      if (this.plan === plan) await this.interrupt("disconnect");
      throw error;
    }
  }

  /** Only the authenticated sink's actual provider completion is eligible.
   * Cleared and replayed marks never resurrect an interrupted plan. */
  playbackCompleted(event: {
    playbackId: string;
    eventId: string;
    outcome: string;
    source: string;
  }): boolean {
    if (
      !this.plan ||
      this.abort?.signal.aborted ||
      this.seenEvents.has(event.eventId) ||
      !event.eventId ||
      event.playbackId !== this.plan.readbackPlaybackId ||
      event.outcome !== "completed" ||
      event.source !== "provider_playback"
    )
      return false;
    this.seenEvents.add(event.eventId);
    this.completed = true;
    return true;
  }

  canRequestEvidence(playbackId: string, replay: boolean): boolean {
    return (
      !!this.plan &&
      this.plan.readbackPlaybackId === playbackId &&
      this.completed &&
      !replay &&
      Date.parse(this.plan.expiresAt) > Date.now() &&
      !this.abort?.signal.aborted
    );
  }

  /** The coordinator retrieves recorder evidence and calls the API gate here.
   * Every failed/ambiguous answer invalidates before any clarification prompt.
   * The callback receives no model-generated confirmation boolean. */
  async requestConfirmation<T>(
    playbackId: string,
    replay: boolean,
    submit: () => Promise<T>,
  ): Promise<T> {
    if (!this.canRequestEvidence(playbackId, replay)) {
      await this.interrupt("unknown_input");
      throw new Error("voice_confirmation_reask");
    }
    const plan = this.plan;
    try {
      const result = await submit();
      if (this.plan !== plan || !this.canRequestEvidence(playbackId, replay))
        throw new Error("voice_confirmation_interrupted");
      return result;
    } catch (error) {
      if (this.plan === plan) await this.interrupt("unknown_input");
      throw error;
    }
  }

  /** Invoke before clarification/correction playback or an API round trip.
   * API failure leaves this local generation permanently unusable. */
  async interrupt(reason: "unknown_input" | "disconnect"): Promise<void> {
    const old = this.plan;
    this.completed = false;
    if (old) this.retiredPlaybacks.add(old.readbackPlaybackId);
    this.plan = null;
    this.abort?.abort();
    this.abort = null;
    try {
      if (old) this.ports.clear(old.readbackPlaybackId);
    } finally {
      await this.ports.invalidate(reason);
    }
  }
}
