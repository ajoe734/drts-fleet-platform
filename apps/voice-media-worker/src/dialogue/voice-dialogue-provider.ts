import {
  voiceDialogueOutputSchema,
  type VoiceDialogueOutput,
} from "@drts/contracts";

export interface VoiceDialogueRequest {
  sessionId: string;
  turnId: string;
  inputEpoch: number;
  /** The session's media-authority epoch (SD §5.4) at the moment this
   * turn's triggering transcript was captured -- distinct from
   * `inputEpoch` (Codex reopen round 2/3, R2): `inputEpoch` only tracks
   * ASR-input supersession (a newer final, a barge-in), never a
   * handoff/reconnect media-authority change, which can land mid-turn
   * without ever touching `inputEpoch`. Checked alongside it at every
   * commit/tool-execution gate so an obsolete proposal can never mutate
   * state or run tools under a media owner it was never captured for.
   * Optional: a caller with no media-authority concept of its own (e.g.
   * an existing unit test driving `VoiceDialogueEngine` directly) may
   * omit it, which skips this specific check -- see `currentMediaEpoch`
   * on `runVoiceDialogue`/`VoiceDialogueEngine.turn`. */
  mediaEpoch?: number;
  segmentIds: readonly string[];
  transcript: string;
  verifiedContext: Readonly<Record<string, unknown>>;
  deadline: number;
  signal: AbortSignal;
}

export interface VoiceDialogueProvider {
  readonly mode: "live" | "fixture";
  readonly profileVersion: string;
  propose(request: VoiceDialogueRequest): Promise<unknown>;
}

/** Bounds even transports that ignore AbortSignal; late results never escape.
 * `currentMediaEpoch`, when supplied, fences a media-authority change the
 * same way `currentEpoch` fences ASR-input supersession (Codex reopen
 * round 2/3, R2) -- optional so an existing caller with no media-authority
 * concept of its own is unaffected. */
export async function runVoiceDialogue(
  provider: VoiceDialogueProvider,
  request: VoiceDialogueRequest,
  currentEpoch: () => number,
  production: boolean,
  currentMediaEpoch?: () => number,
): Promise<VoiceDialogueOutput> {
  if (production && provider.mode !== "live")
    throw new Error("voice_fixture_forbidden");
  if (!provider.profileVersion.trim())
    throw new Error("voice_profile_required");
  const remaining = request.deadline - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 30_000)
    throw new Error("voice_deadline_invalid");
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
      timer = setTimeout(cancel, remaining);
    });
    if (request.signal.aborted) cancel();
    const result = await Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("voice_aborted");
        return provider.propose({ ...request, signal: controller.signal });
      }),
    ]);
    if (
      controller.signal.aborted ||
      request.inputEpoch !== currentEpoch() ||
      (currentMediaEpoch && request.mediaEpoch !== currentMediaEpoch())
    )
      throw new Error("voice_stale_epoch");
    const output = voiceDialogueOutputSchema.parse(result);
    for (const slot of output.slots) {
      if (
        slot.sourceSegmentIds.some((id) => !request.segmentIds.includes(id)) ||
        !request.transcript.includes(slot.rawText)
      ) {
        throw new Error("voice_slot_evidence_invalid");
      }
    }
    return output;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancel);
  }
}
