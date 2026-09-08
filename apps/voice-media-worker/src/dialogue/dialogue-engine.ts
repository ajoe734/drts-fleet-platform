import type { VoiceDialogueOutput } from "@drts/contracts";
import { VoiceDialogueState } from "./dialogue-state";
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
  /** Uses one authenticated VoiceToolGatewayService for this admitted turn. */
  execute(output: VoiceDialogueOutput): Promise<unknown[]>;
}

/** Model text is diagnostic data, never a playback script or booking receipt.
 * Domain results are returned to the trusted coordinator; only its verified
 * snapshot templates may read back prices, addresses or transaction status. */
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
  ) {
    if (this.running) throw new Error("voice_turn_in_progress");
    if (state.handoff)
      return { prompt: "", terminal: "handoff" as const, results: [] };
    this.running = true;
    try {
      const output = await runVoiceDialogue(
        this.provider,
        request,
        currentEpoch,
        this.production,
      );
      const next = Object.assign(
        new VoiceDialogueState(),
        structuredClone(state),
      );
      next.apply(output, request.turnId);
      await this.boundedStage(request, currentEpoch, (bounded) =>
        ports.persist(next, bounded),
      );
      request.signal.throwIfAborted();
      if (
        request.inputEpoch !== currentEpoch() ||
        Date.now() >= request.deadline
      )
        throw new Error("voice_stale_epoch");
      Object.assign(state, next);
      const results = await this.boundedStage(request, currentEpoch, () =>
        ports.execute(output),
      );
      request.signal.throwIfAborted();
      if (
        request.inputEpoch !== currentEpoch() ||
        Date.now() >= request.deadline
      )
        throw new Error("voice_stale_epoch");
      const prompt = state.handoff
        ? output.intent === "emergency"
          ? "如有立即危險，請聯絡當地緊急救援服務。"
          : "已停止叫車資料蒐集。"
        : results.length
          ? ""
          : this.collectionPrompt(state, output.intent);
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
    currentEpoch: () => number,
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
          if (request.inputEpoch !== currentEpoch())
            throw new Error("voice_stale_epoch");
          return operation({ ...request, signal: controller.signal });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", cancel);
    }
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
