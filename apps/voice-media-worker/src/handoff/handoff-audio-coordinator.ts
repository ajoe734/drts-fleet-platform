import { type PcmFormat } from "../media/audio-codec";
import {
  type VoiceMediaAccess,
  type VoiceMediaOutputFence,
  type VoiceOutputOwner,
} from "../media/output-fence";

export type VoiceHangupReason =
  | "caller_hangup"
  | "callee_hangup"
  | "transferred"
  | "system_terminated"
  | "provider_failure"
  | "timeout";

export type HandoffIsolationState = "idle" | "pending" | "isolated" | "failed";
export type HandoffBridgeState = "idle" | "pending" | "bridged" | "failed";

export interface HandoffIsolationResult {
  success: boolean;
  status: "isolated" | "pending" | "failed";
  coordinatorAccess: VoiceMediaAccess | null;
  error: string | null;
}

export interface HandoffBridgeResult {
  success: boolean;
  status: "bridged" | "pending" | "failed";
  humanAccess: VoiceMediaAccess | null;
  error: string | null;
}

export interface HandoffDropResult {
  callerStillConnected: boolean;
  redispatchable: boolean;
  reason: VoiceHangupReason;
}

export interface BridgeCallResult {
  accepted: boolean;
  connected?: boolean;
}

/**
 * SD §5.4 / §12.5 Handoff audio coordinator in voice-media-worker.
 *
 * Rules:
 * 1. 移交時先隔離舊 AI 音訊:
 *    - Revokes old AI playback generation, clears sink buffer synchronously.
 *    - If CTI clear fails / returns unknown, retains "pending" rather than claiming audio is isolated.
 * 2. CTI clear/bridge 不確定時保留 pending 而非宣稱已接通:
 *    - When bridging to human agent, if CTI bridge result is pending or uncertain, maintains status "pending".
 *    - Never claims "bridged" / "connected" prematurely.
 * 3. Coordinator streams wait/hold audio under new lease/epoch. Hold audio is cleared before bridging.
 * 4. Detects caller vs agent drops; caller-connected agent drops are redispatchable.
 */
export class HandoffAudioCoordinator {
  private isolationState: HandoffIsolationState = "idle";
  private bridgeState: HandoffBridgeState = "idle";
  private coordinatorAccess: VoiceMediaAccess | null = null;
  private humanAccess: VoiceMediaAccess | null = null;
  private holdAudioPlaying = false;

  constructor(
    private readonly fence: VoiceMediaOutputFence,
    private readonly coordinatorPrincipalId: string,
  ) {}

  getIsolationState(): HandoffIsolationState {
    return this.isolationState;
  }

  getBridgeState(): HandoffBridgeState {
    return this.bridgeState;
  }

  isAudioIsolated(): boolean {
    return this.isolationState === "isolated";
  }

  isHoldAudioPlaying(): boolean {
    return this.holdAudioPlaying;
  }

  /**
   * Isolate old AI audio:
   * First clears outbound buffer on sink and aborts synthesis, then transitions owner to coordinator.
   * If CTI sink clear throws or is unknown, maintains status "pending" and does NOT declare isolated!
   */
  isolateAiAudio(aiAccess: VoiceMediaAccess): HandoffIsolationResult {
    const transferred = this.fence.transfer(
      aiAccess,
      "handoff",
      this.coordinatorPrincipalId,
    );

    if (!transferred) {
      // Audio isolation could not be confirmed (e.g. CTI clear threw or returned unknown).
      // Keep state as pending, do NOT declare safe isolation!
      this.isolationState = "pending";
      this.coordinatorAccess = null;
      return {
        success: false,
        status: "pending",
        coordinatorAccess: null,
        error: "cti_clear_uncertain",
      };
    }

    const access = this.fence.issueAccess(this.coordinatorPrincipalId);
    if (!access) {
      this.isolationState = "failed";
      return {
        success: false,
        status: "failed",
        coordinatorAccess: null,
        error: "coordinator_access_denied",
      };
    }

    this.isolationState = "isolated";
    this.coordinatorAccess = access;
    return {
      success: true,
      status: "isolated",
      coordinatorAccess: access,
      error: null,
    };
  }

  /**
   * Coordinator plays wait/hold audio while waiting in queue.
   */
  playWaitAudio(
    coordinatorAccess: VoiceMediaAccess,
    playbackId: string,
    chunk: Int16Array,
    format: PcmFormat,
  ): boolean {
    if (this.isolationState !== "isolated") {
      return false;
    }
    const written = this.fence.writePcm16(
      coordinatorAccess,
      playbackId,
      chunk,
      format,
    );
    if (written) {
      this.holdAudioPlaying = true;
    }
    return written;
  }

  /**
   * Bridge to human agent:
   * 1. Clears hold audio buffer so human agent and customer don't hear remaining hold music.
   * 2. Sets bridge state to pending.
   * 3. Executes CTI bridge action. If bridge action is pending, rejected, or throws:
   *    retains "pending", does NOT claim bridged!
   * 4. Only when bridge is verified (accepted: true, connected !== false):
   *    transfers fence to "human" and issues human access.
   */
  async bridgeToHuman(
    coordinatorAccess: VoiceMediaAccess,
    agentPrincipalId: string,
    bridgeAction: () => Promise<BridgeCallResult>,
  ): Promise<HandoffBridgeResult> {
    if (this.isolationState !== "isolated") {
      return {
        success: false,
        status: "pending",
        humanAccess: null,
        error: "audio_not_isolated",
      };
    }

    // Step 1: Set pending bridge state
    this.bridgeState = "pending";

    // Step 2: Perform CTI bridge
    let result: BridgeCallResult;
    try {
      result = await bridgeAction();
    } catch (err) {
      // Bridge call failed or timed out: retain pending rather than claiming bridged
      this.bridgeState = "pending";
      return {
        success: false,
        status: "pending",
        humanAccess: null,
        error: err instanceof Error ? err.message : "bridge_action_failed",
      };
    }

    if (!result.accepted || result.connected === false) {
      // Bridge is unconfirmed or rejected: preserve pending
      this.bridgeState = "pending";
      return {
        success: false,
        status: "pending",
        humanAccess: null,
        error: "bridge_unconfirmed",
      };
    }

    // Step 3: Transfer fence to human agent (transfer clears hold audio buffer internally)
    const transferred = this.fence.transfer(
      coordinatorAccess,
      "human",
      agentPrincipalId,
    );
    this.holdAudioPlaying = false;
    if (!transferred) {
      this.bridgeState = "pending";
      return {
        success: false,
        status: "pending",
        humanAccess: null,
        error: "human_fence_transfer_failed",
      };
    }

    const humanAccess = this.fence.issueAccess(agentPrincipalId);
    this.bridgeState = "bridged";
    this.humanAccess = humanAccess;
    return {
      success: true,
      status: "bridged",
      humanAccess,
      error: null,
    };
  }

  /**
   * Handle drop after bridge or during handoff.
   */
  handleDrop(
    callerStillConnected: boolean,
    reason: VoiceHangupReason,
  ): HandoffDropResult {
    if (!callerStillConnected) {
      this.fence.localClear();
      this.isolationState = "failed";
      this.bridgeState = "failed";
      return {
        callerStillConnected: false,
        redispatchable: false,
        reason,
      };
    }

    // Agent dropped, but caller is still on the line: can be redispatched!
    this.bridgeState = "idle";
    return {
      callerStillConnected: true,
      redispatchable: true,
      reason,
    };
  }
}
