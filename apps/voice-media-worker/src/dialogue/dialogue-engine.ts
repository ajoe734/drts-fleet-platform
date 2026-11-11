import type { VoiceDialogueOutput, VoiceToolProposal } from "@drts/contracts";
import { VoiceDialogueState } from "./dialogue-state";
import { guardSpokenReply, heardFromSlots } from "./reply-guard";
import {
  runVoiceDialogue,
  type VoiceDialogueProvider,
  type VoiceDialogueRequest,
} from "./voice-dialogue-provider";

export interface VoiceDialogueTurnPorts {
  /** Must CAS against the admitted session revision and input/lease epochs.
   * Failure blocks every tool and playback. Supplied by session coordinator.
   * Honor request.signal/deadline at commit; a cancelled wait does not prove
   * rollback. Reconcile ambiguous commits against the authoritative revision. */
  persist(
    state: VoiceDialogueState,
    request: VoiceDialogueRequest,
  ): Promise<void>;
  /** Uses one authenticated VoiceToolGatewayService for this admitted turn.
   * `request` (Codex reopen round 5/6, R6) is the same per-stage bounded
   * request `persist` above receives: its `signal` is already aborted the
   * moment this turn is superseded (barge-in, release, a newer final, a
   * media-authority epoch advance, or its own deadline) and its
   * `inputEpoch` is the immutable epoch admitted when this turn's final
   * transcript arrived -- an implementation must honor `signal` at every
   * awaited external call it makes (never start one once already aborted)
   * and must submit `request.inputEpoch`, never a mutable later value, so a
   * stale proposal can never be re-labeled under a newer epoch. */
  execute(
    output: VoiceDialogueOutput,
    request: VoiceDialogueRequest,
  ): Promise<unknown[]>;
}

/** Model text is never a booking receipt or confirmation: only the trusted
 * coordinator's verified snapshot templates read back a booking (SD §6.2).
 * CALLCENTER-AI-ASSIST-20261111 (owner decision 2026-11-11): in ordinary
 * conversation turns the model's own reply is spoken when it passes
 * `guardSpokenReply` (no unverified numbers/addresses, no commitments);
 * otherwise the fixed prompt for the state is used. After tools ran, the
 * caller hears what the tools found (e.g. the address candidates). */
export class VoiceDialogueEngine {
  private running = false;
  constructor(
    private readonly provider: VoiceDialogueProvider,
    private readonly production: boolean,
  ) {}

  async turn(
    request: VoiceDialogueRequest,
    state: VoiceDialogueState,
    currentEpoch: () => number,
    ports: VoiceDialogueTurnPorts,
    /** Codex reopen round 2/3, R2: `inputEpoch` alone only tracks ASR-
     * input supersession. A media-authority change (handoff/reconnect,
     * `VoiceMediaWorkerSession.advanceMediaEpoch`) never touches it, so an
     * obsolete proposal captured under a since-superseded media owner
     * must be fenced here too, at the exact same points `inputEpoch`
     * already gates -- before this turn's state commit and before its
     * tool execution -- not only when the eventual speaker tries to
     * publish audio for it. Optional, appended last, so an existing
     * caller with no media-authority concept of its own (a direct unit
     * test against this engine) is unaffected and simply skips this
     * check. */
    currentMediaEpoch?: () => number,
  ) {
    if (this.running) throw new Error("voice_turn_in_progress");
    if (state.handoff)
      return { prompt: "", terminal: "handoff" as const, results: [] };
    this.running = true;
    // Read through a function: TypeScript keeps `state.handoff` narrowed to
    // null after the early return above, but `apply` may set it this turn.
    const decidedHandoff = (): VoiceDialogueState["handoff"] => state.handoff;
    const isStale = () =>
      request.inputEpoch !== currentEpoch() ||
      (currentMediaEpoch !== undefined &&
        request.mediaEpoch !== currentMediaEpoch());
    try {
      const output = await runVoiceDialogue(
        this.provider,
        request,
        currentEpoch,
        this.production,
        currentMediaEpoch,
      );
      const next = Object.assign(
        new VoiceDialogueState(),
        structuredClone(state),
      );
      next.apply(output, request.turnId);
      await this.boundedStage(request, isStale, (bounded) =>
        ports.persist(next, bounded),
      );
      request.signal.throwIfAborted();
      if (isStale() || Date.now() >= request.deadline)
        throw new Error("voice_stale_epoch");
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist overlapping
      // recovery (Codex reopen, canonical 2026-10-03T22:41:06Z, "an
      // obsolete marker resurrected from the clone"): `next.unresolvedCommit`
      // is only ever a byproduct of the `structuredClone(state)` this
      // method took BEFORE `ports.persist` ran -- a trusted persist port
      // never writes a new value onto `next` itself, only onto the real,
      // live `state` directly (via `recovery.attachmentState`, see
      // `dialogue-persist-port.ts`). If a concurrent reconciliation
      // resolved or re-armed `state.unresolvedCommit` while this call was
      // in flight, `next`'s copy is simply stale and must never overwrite
      // the live value below -- `state.unresolvedCommit` immediately
      // before this merge is always the authoritative one.
      const liveUnresolvedCommit = state.unresolvedCommit;
      Object.assign(state, next);
      state.unresolvedCommit = liveUnresolvedCommit;
      const results = await this.boundedStage(request, isStale, (bounded) =>
        // `state.handoff` was null on entry (early return above), so any
        // value now was decided by this very turn.
        ports.execute(withHandoffRequest(output, decidedHandoff()), bounded),
      );
      request.signal.throwIfAborted();
      if (isStale() || Date.now() >= request.deadline)
        throw new Error("voice_stale_epoch");
      const prompt = state.handoff
        ? output.intent === "emergency"
          ? "如有立即危險，請聯絡當地緊急救援服務。"
          : decidedHandoff()?.reason === "speech_not_understood"
            ? "抱歉，我沒有聽清楚。現在幫您轉接客服人員，請稍候。"
            : "好的，現在幫您轉接客服人員，請稍候。"
        : results.length
          ? (toolResultPrompt(output, results) ?? "")
          : this.spokenReply(output, request, state);
      return {
        prompt,
        terminal: state.handoff ? ("handoff" as const) : output.terminal,
        results,
      };
    } finally {
      this.running = false;
    }
  }

  /** Only the race winner can resume the turn; late settlement cannot publish
   * state, invoke the next stage, or release a newer turn's running guard. */
  private async boundedStage<T>(
    request: VoiceDialogueRequest,
    isStale: () => boolean,
    operation: (bounded: VoiceDialogueRequest) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => {
        cancel = () => {
          controller.abort();
          reject(new Error("voice_aborted"));
        };
        request.signal.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(cancel, Math.max(0, request.deadline - Date.now()));
      });
      if (request.signal.aborted || Date.now() >= request.deadline) cancel();
      return await Promise.race([
        cancelled,
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new Error("voice_aborted");
          if (isStale()) throw new Error("voice_stale_epoch");
          return operation({ ...request, signal: controller.signal });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", cancel);
    }
  }

  /** The model's own words when they pass the guard, else the fixed prompt. */
  private spokenReply(
    output: VoiceDialogueOutput,
    request: VoiceDialogueRequest,
    state: VoiceDialogueState,
  ): string {
    const guarded = guardSpokenReply(output.text, {
      transcript: request.transcript,
      heard: heardFromSlots(state.slots),
      toolFacts: [],
    });
    return guarded.ok
      ? guarded.text
      : this.collectionPrompt(state, output.intent);
  }

  private collectionPrompt(
    state: VoiceDialogueState,
    intent: VoiceDialogueOutput["intent"],
  ): string {
    if (intent === "unknown") return "請問您需要叫車、查詢訂單，還是聯絡客服？";
    if (intent === "status") return "查詢訂單需要先確認您有查詢權限。";
    if (!state.slots.pickup) return "請說明上車地點的縣市、道路與門牌或入口。";
    if (!state.slots.passengerContact)
      return "司機應聯絡哪位乘客？請提供聯絡電話。";
    return "資料仍需驗證，尚未完成叫車。";
  }
}

type HandoffReason = Extract<
  VoiceToolProposal,
  { name: "request_handoff" }
>["args"]["reason"];

const HANDOFF_REASONS: readonly HandoffReason[] = [
  "customer_requested",
  "location_unresolved",
  "service_unsupported",
  "urgent_safety",
  "provider_unavailable",
  "speech_not_understood",
];

/**
 * CALLCENTER-AI-ASSIST-20261111: a handoff this turn's state decided on its
 * own (e.g. the caller was not understood twice, or an intent such as
 * "human" arrived without a tool call) must still reach the human queue.
 * The coordinator only calls the tool gateway when the output carries a
 * tool, so the decision is expressed as the single `request_handoff` the
 * gateway would force anyway. Outputs that already request a handoff, and
 * turns where no new handoff was decided, pass through unchanged.
 */
export function withHandoffRequest(
  output: VoiceDialogueOutput,
  newHandoff: { reason: string } | null,
): VoiceDialogueOutput {
  if (
    !newHandoff ||
    output.tools.some((tool) => tool.name === "request_handoff")
  ) {
    return output;
  }
  const reason = (HANDOFF_REASONS as readonly string[]).includes(
    newHandoff.reason,
  )
    ? (newHandoff.reason as HandoffReason)
    : "customer_requested";
  return {
    ...output,
    terminal: "handoff",
    tools: [{ name: "request_handoff", args: { reason } }],
  };
}

/**
 * What the caller hears after this turn's tools ran, built only from the
 * tool results. Booking read-back plans are spoken by the coordinator from
 * the verified plan instead, so they return null here.
 */
export function toolResultPrompt(
  output: VoiceDialogueOutput,
  results: readonly unknown[],
): string | null {
  for (let index = 0; index < output.tools.length; index += 1) {
    const tool = output.tools[index]!;
    const result = results[index];
    if (tool.name === "resolve_location") {
      const labels = (
        (result as { candidates?: Array<{ label?: unknown }> } | null)
          ?.candidates ?? []
      )
        .map((candidate) =>
          typeof candidate.label === "string" ? candidate.label.trim() : "",
        )
        .filter(Boolean)
        .slice(0, 3);
      if (labels.length === 0) {
        return "抱歉，找不到這個地點。請再說一次縣市、路名，或附近的地標。";
      }
      if (labels.length === 1) {
        return `請問是「${labels[0]}」嗎？`;
      }
      const options = labels.map((label) => `「${label}」`);
      return `請問是${options.slice(0, -1).join("、")}，還是${options.at(-1)}？如果都不是，請再說一次。`;
    }
    if (tool.name === "get_bound_booking_status") {
      const status = (result as { status?: unknown } | null)?.status;
      return typeof status === "string" && status.trim()
        ? status.trim()
        : "目前查不到這通電話的訂單狀態。請問還需要什麼協助？";
    }
  }
  return null;
}
