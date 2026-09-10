import {
  voiceDialogueOutputSchema,
  type VoiceDialogueOutput,
  type VoiceToolProposal,
} from "@drts/contracts";
import type { VoiceDialogueProvider, VoiceDialogueRequest } from "../../dialogue/voice-dialogue-provider";
import { VoiceMediaProviderError } from "../../media-provider";
import {
  OPENAI_REALTIME_DOCS_REF,
  OPENAI_REALTIME_MODEL_ID,
  OPENAI_REALTIME_PROTOCOL_VERSION,
  type NativeVoiceProfile,
  type NativeVoiceUnknownsRecord,
  type RealtimeClientEvent,
  type RealtimeServerEvent,
  type RealtimeSessionConfig,
  type RealtimeSessionCreatedEvent,
  type RealtimeSessionUpdatedEvent,
  type RealtimeSpeechStartedEvent,
  type RealtimeConversationItemTruncateEvent,
  type NativeVoiceTruncationRecord,
} from "./types";
import {
  RealtimeSharedGateBridge,
  DRTS_REALTIME_TOOLS,
} from "./shared-gate-bridge";
import type { VoiceMediaOutputFence } from "../../media/output-fence";
import type { VoiceConfirmationController } from "../../dialogue/confirmation/confirmation-controller";

export interface OpenAiRealtimeAdapterOptions {
  fence?: VoiceMediaOutputFence;
  confirmationController?: VoiceConfirmationController;
  fixtures?: readonly RealtimeServerEvent[];
}

export const DEFAULT_OPENAI_REALTIME_PROFILE: NativeVoiceProfile = {
  candidateId: "openai_realtime",
  provider: "openai",
  modelId: OPENAI_REALTIME_MODEL_ID,
  protocolVersion: OPENAI_REALTIME_PROTOCOL_VERSION,
  inputAudioFormat: "g711_ulaw",
  outputAudioFormat: "g711_ulaw",
  sampleRateHz: 8000,
  voice: "shimmer",
  turnDetection: {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 300,
  },
  accountCapabilityVerified: false,
  supportedLanguages: ["zh-TW", "en-mixed"],
  unverifiedLanguages: ["nan-TW", "hak-TW"],
};

/**
 * Fixture adapter for the OpenAI Realtime native speech-to-speech candidate (SD §14).
 * 
 * - Encapsulates bidirectional WebSocket wire protocol events.
 * - Bridges tool proposals to the shared DRTS tool gateway.
 * - Handles caller barge-in by emitting truncation events and invalidating active readbacks.
 * - Operates strictly in hermetic fixture mode; production accounts are deferred to UV-EXEC-027/028.
 */
export class OpenAiRealtimeFixtureAdapter implements VoiceDialogueProvider {
  readonly providerName = "openai_realtime" as const;
  readonly mode = "fixture" as const;
  readonly isProductionCapable = false as const;
  readonly profileVersion: string;

  private connected = false;
  private sessionConfig: RealtimeSessionConfig | null = null;
  private readonly clientEvents: RealtimeClientEvent[] = [];
  private readonly serverEvents: RealtimeServerEvent[] = [];
  private readonly bridge: RealtimeSharedGateBridge;

  private activeResponseId: string | null = null;
  private activeAssistantItemId: string | null = null;
  private isAssistantSpeaking = false;
  private sentAudioDurationMs = 0;

  constructor(
    readonly profile: NativeVoiceProfile = DEFAULT_OPENAI_REALTIME_PROFILE,
    options: OpenAiRealtimeAdapterOptions = {},
  ) {
    this.profileVersion = `${profile.candidateId}:${profile.modelId}:${profile.protocolVersion}`;
    this.bridge = new RealtimeSharedGateBridge(
      options.fence,
      options.confirmationController,
    );
    if (options.fixtures) {
      this.serverEvents.push(...options.fixtures);
    }
  }

  /**
   * Models opening the WebSocket stream and performing the initial handshake.
   * Enforces fail-closed behavior: attempting to run in production throws voice_fixture_forbidden.
   */
  connect(
    authorizationToken: string,
    options?: { production?: boolean },
  ): RealtimeSessionCreatedEvent {
    if (options?.production || this.profile.accountCapabilityVerified) {
      throw new VoiceMediaProviderError(
        "voice_fixture_forbidden",
        "OpenAI Realtime candidate adapter is running in fixture mode. " +
        "Real production account, SIP trunks and credentials are gated at UV-EXEC-027 and UV-EXEC-028.",
        {
          candidateId: this.profile.candidateId,
          modelId: this.profile.modelId,
          docs: OPENAI_REALTIME_DOCS_REF,
        },
      );
    }

    if (!authorizationToken || !authorizationToken.trim()) {
      throw new Error("Authorization token is required to establish Realtime session.");
    }

    this.connected = true;
    this.sessionConfig = {
      modalities: ["text", "audio"],
      voice: this.profile.voice,
      input_audio_format: this.profile.inputAudioFormat,
      output_audio_format: this.profile.outputAudioFormat,
      turn_detection: this.profile.turnDetection,
      tools: DRTS_REALTIME_TOOLS,
    };

    const sessionCreated: RealtimeSessionCreatedEvent = {
      event_id: `evt_session_${Date.now()}`,
      type: "session.created",
      session: {
        ...this.sessionConfig,
        id: `sess_${Date.now()}`,
      },
    };

    this.serverEvents.push(sessionCreated);
    return sessionCreated;
  }

  /**
   * Processes outbound client events to the Realtime model.
   */
  sendClientEvent(event: RealtimeClientEvent): void {
    if (!this.connected) {
      throw new Error("Cannot send Realtime client event: connection not established.");
    }
    this.clientEvents.push(event);

    switch (event.type) {
      case "session.update": {
        this.sessionConfig = { ...this.sessionConfig, ...event.session };
        const updated: RealtimeSessionUpdatedEvent = {
          event_id: `evt_updated_${Date.now()}`,
          type: "session.updated",
          session: this.sessionConfig,
        };
        this.serverEvents.push(updated);
        break;
      }
      case "input_audio_buffer.append": {
        // Appends audio frame (e.g. 20ms G.711u frame)
        break;
      }
      case "input_audio_buffer.clear": {
        // Clear buffer on barge-in
        break;
      }
      case "input_audio_buffer.commit": {
        break;
      }
      case "conversation.item.truncate": {
        // Enforce audio truncation
        this.isAssistantSpeaking = false;
        break;
      }
      case "response.cancel": {
        // Model generation cancelled due to caller interruption
        this.isAssistantSpeaking = false;
        this.activeResponseId = null;
        break;
      }
      default:
        break;
    }
  }

  /**
   * Simulates caller barge-in detection (server VAD speech_started).
   * Automatically invokes the shared gate bridge to halt playback, emit truncation,
   * and invalidate uncommitted confirmation readbacks.
   */
  async handleBargeIn(audioStartMs: number): Promise<{
    truncation: NativeVoiceTruncationRecord;
    truncateEvent: RealtimeConversationItemTruncateEvent;
  }> {
    if (!this.connected) throw new Error("Adapter not connected.");

    const speechStarted: RealtimeSpeechStartedEvent = {
      event_id: `evt_vad_start_${Date.now()}`,
      type: "input_audio_buffer.speech_started",
      audio_start_ms: audioStartMs,
      item_id: `item_caller_${Date.now()}`,
    };
    this.serverEvents.push(speechStarted);

    const itemIdToTruncate = this.activeAssistantItemId || `item_assistant_readback`;
    const truncation = await this.bridge.handleBargeIn(itemIdToTruncate, this.sentAudioDurationMs);

    // Formally emit conversation.item.truncate client event as required by Realtime spec
    const truncateEvent: RealtimeConversationItemTruncateEvent = {
      type: "conversation.item.truncate",
      item_id: itemIdToTruncate,
      content_index: 0,
      audio_end_ms: this.sentAudioDurationMs,
    };
    this.sendClientEvent(truncateEvent);

    return { truncation, truncateEvent };
  }

  /**
   * Sets assistant speech state for simulation of active playback.
   */
  simulateAssistantSpeaking(responseId: string, itemId: string, durationMs: number): void {
    this.activeResponseId = responseId;
    this.activeAssistantItemId = itemId;
    this.isAssistantSpeaking = true;
    this.sentAudioDurationMs = durationMs;
  }

  /**
   * Adapts caller input into a structured VoiceDialogueOutput via the shared gate.
   * Strictly adheres to voiceDialogueOutputSchema and ensures no direct database mutations.
   */
  async propose(request: VoiceDialogueRequest): Promise<VoiceDialogueOutput> {
    if (!this.connected) {
      // Connect in fixture mode if not already explicitly connected
      this.connect("fixture-token-uv026");
    }

    const transcript = request.transcript.trim();
    const segmentIds = request.segmentIds;
    const primarySegmentId = segmentIds[0] || "seg-1";

    // 1. Detect Emergency or Handoff requests
    if (transcript.includes("救命") || transcript.includes("緊急") || transcript.includes("報警")) {
      const output: VoiceDialogueOutput = {
        intent: "emergency",
        text: "偵測到緊急狀況，正在為您接聽救援服務。",
        slots: [],
        tools: [
          {
            name: "request_handoff",
            args: { reason: "urgent_safety" },
          },
        ],
        usage: { inputTokens: 42, outputTokens: 18 },
        terminal: "handoff",
      };
      return voiceDialogueOutputSchema.parse(output);
    }

    if (transcript.includes("轉真人") || transcript.includes("客服") || transcript.includes("找專人")) {
      const output: VoiceDialogueOutput = {
        intent: "human",
        text: "好的，為您轉接客服人員，請稍候。",
        slots: [],
        tools: [
          {
            name: "request_handoff",
            args: { reason: "customer_requested" },
          },
        ],
        usage: { inputTokens: 35, outputTokens: 15 },
        terminal: "handoff",
      };
      return voiceDialogueOutputSchema.parse(output);
    }

    // 2. Detect Confirmation affirmation ("對", "沒錯", "確認", "可以")
    if (
      (transcript.includes("對") || transcript.includes("沒錯") || transcript.includes("確認") || transcript.includes("好的")) &&
      !transcript.includes("不對") && !transcript.includes("不是") && !transcript.includes("改去")
    ) {
      const output: VoiceDialogueOutput = {
        intent: "book",
        text: "已收到您的確認，正在為您送出叫車派遣。",
        slots: [],
        tools: [
          {
            name: "prepare_booking_readback",
            args: {},
          },
        ],
        usage: { inputTokens: 60, outputTokens: 25 },
        terminal: "tool_required",
      };
      this.bridge.validateNoBypassedMutations(output);
      return voiceDialogueOutputSchema.parse(output);
    }

    // 3. Detect In-flight Correction or Location details
    const slots: VoiceDialogueOutput["slots"] = [];
    const tools: VoiceToolProposal[] = [];

    // Check for destination / dropoff
    if (transcript.includes("改去")) {
      const target = transcript.split("改去")[1]?.split("，")[0]?.trim() || "台北車站";
      slots.push({
        field: "dropoff",
        rawText: `改去${target}`,
        candidate: target,
        sourceSegmentIds: [primarySegmentId],
        providerConfidence: 0.98,
      });
      tools.push({
        name: "resolve_location",
        args: { query: target },
      });
    } else if (transcript.includes("到") || transcript.includes("去")) {
      const match = transcript.match(/(?:到|去)([^，。 ]+)/);
      if (match && match[1]) {
        const dropoffText = match[1];
        slots.push({
          field: "dropoff",
          rawText: dropoffText,
          candidate: dropoffText,
          sourceSegmentIds: [primarySegmentId],
          providerConfidence: 0.95,
        });
        tools.push({
          name: "resolve_location",
          args: { query: dropoffText },
        });
      }
    }

    // Check for pickup
    if (transcript.includes("從")) {
      const match = transcript.match(/從([^，。 到去]+)/);
      if (match && match[1]) {
        const pickupText = match[1];
        slots.push({
          field: "pickup",
          rawText: pickupText,
          candidate: pickupText,
          sourceSegmentIds: [primarySegmentId],
          providerConfidence: 0.95,
        });
        tools.push({
          name: "resolve_location",
          args: { query: pickupText },
        });
      }
    }

    // Fallback if no specific slot was matched: extract full query
    if (slots.length === 0 && transcript.length > 0) {
      slots.push({
        field: "pickup",
        rawText: transcript,
        candidate: transcript,
        sourceSegmentIds: [primarySegmentId],
        providerConfidence: 0.90,
      });
      tools.push({
        name: "resolve_location",
        args: { query: transcript },
      });
    }

    const output: VoiceDialogueOutput = {
      intent: "book",
      text: slots.length > 0
        ? `好的，為您查詢乘車資訊：${slots.map(s => s.candidate).join("，")}。`
        : "您好，請問您今天想從哪裡出發？",
      slots,
      tools: tools.slice(0, 3),
      usage: {
        inputTokens: 120,
        outputTokens: 45,
      },
      terminal: tools.length > 0 ? "tool_required" : "turn_complete",
    };

    // Guarantee that no unauthorized mutation tools bypassed the confirmation gate
    this.bridge.validateNoBypassedMutations(output);

    return voiceDialogueOutputSchema.parse(output);
  }

  getUnknowns(): NativeVoiceUnknownsRecord {
    return {
      nanTwSupport: "unknown_pending_live",
      hakTwSupport: "unknown_pending_live",
      carrierPstnPacketLoss: "unknown_pending_live",
      exactLiveCostTwd: "unknown_pending_live",
      rationale:
        "OpenAI Realtime documentation confirms zh-TW (Mandarin), but Taiwanese Hokkien (nan-TW) " +
        "and Hakka (hak-TW) native comprehension and TTS quality, as well as live PSTN telephony " +
        "trunk packet loss and jitter, are unverified and formally retained as unknowns pending " +
        "UV-EXEC-028 live PSTN testing.",
    };
  }

  getClientEvents(): readonly RealtimeClientEvent[] {
    return this.clientEvents;
  }

  getServerEvents(): readonly RealtimeServerEvent[] {
    return this.serverEvents;
  }

  getSharedGateBridge(): RealtimeSharedGateBridge {
    return this.bridge;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
