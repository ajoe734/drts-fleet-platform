/**
 * Types and wire event contracts for the native voice candidate adapter (SD §14).
 * 
 * Formal references:
 * - OpenAI Realtime API: https://developers.openai.com/api/docs/guides/realtime
 * - Realtime SIP Telephony: https://developers.openai.com/api/docs/guides/realtime-sip
 * - Realtime Costs & Usage: https://developers.openai.com/api/docs/guides/realtime-costs
 */

export const OPENAI_REALTIME_DOCS_REF = "https://developers.openai.com/api/docs/guides/realtime" as const;
export const OPENAI_REALTIME_SIP_REF = "https://developers.openai.com/api/docs/guides/realtime-sip" as const;
export const OPENAI_REALTIME_COSTS_REF = "https://developers.openai.com/api/docs/guides/realtime-costs" as const;
export const OPENAI_REALTIME_MODEL_ID = "gpt-4o-realtime-preview-2024-12-17" as const;
export const OPENAI_REALTIME_PROTOCOL_VERSION = "v1" as const;

export type NativeVoiceCandidateId = "openai_realtime" | "gemini_live";
export type NativeVoiceAudioFormat = "g711_ulaw" | "g711_alaw" | "pcm16";

export interface NativeVoiceTurnDetection {
  type: "server_vad";
  threshold: number;
  prefix_padding_ms?: number;
  silence_duration_ms: number;
}

export interface NativeVoiceProfile {
  candidateId: "openai_realtime";
  provider: "openai";
  modelId: typeof OPENAI_REALTIME_MODEL_ID;
  protocolVersion: typeof OPENAI_REALTIME_PROTOCOL_VERSION;
  inputAudioFormat: NativeVoiceAudioFormat;
  outputAudioFormat: NativeVoiceAudioFormat;
  sampleRateHz: 8000 | 16000;
  voice: "shimmer" | "alloy" | "echo" | "ash" | "coral" | "fable" | "onyx" | "nova" | "sage" | "verse";
  turnDetection: NativeVoiceTurnDetection;
  /** Account/billing capability is strictly gated at UV-EXEC-027/028. */
  accountCapabilityVerified: boolean;
  supportedLanguages: readonly string[];
  unverifiedLanguages: readonly string[];
}

// ---------------------------------------------------------------------------
// Client wire events (Media Worker -> Provider)
// ---------------------------------------------------------------------------

export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeSessionConfig {
  modalities?: ("text" | "audio")[];
  instructions?: string;
  voice?: string;
  input_audio_format?: NativeVoiceAudioFormat;
  output_audio_format?: NativeVoiceAudioFormat;
  input_audio_transcription?: {
    model: string;
  } | null;
  turn_detection?: NativeVoiceTurnDetection | null;
  tools?: RealtimeToolDefinition[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; name: string };
  temperature?: number;
  max_response_output_tokens?: number | "inf";
}

export interface RealtimeSessionUpdateEvent {
  event_id?: string;
  type: "session.update";
  session: RealtimeSessionConfig;
}

export interface RealtimeInputAudioBufferAppendEvent {
  event_id?: string;
  type: "input_audio_buffer.append";
  audio: string; // base64-encoded audio chunk
}

export interface RealtimeInputAudioBufferCommitEvent {
  event_id?: string;
  type: "input_audio_buffer.commit";
}

export interface RealtimeInputAudioBufferClearEvent {
  event_id?: string;
  type: "input_audio_buffer.clear";
}

export interface RealtimeConversationItemCreateEvent {
  event_id?: string;
  type: "conversation.item.create";
  previous_item_id?: string | null;
  item: {
    id?: string;
    type: "message" | "function_call" | "function_call_output";
    role?: "user" | "assistant" | "system";
    content?: Array<{
      type: "input_text" | "input_audio" | "text" | "audio";
      text?: string;
      audio?: string; // base64
    }>;
    call_id?: string;
    output?: string;
  };
}

export interface RealtimeConversationItemTruncateEvent {
  event_id?: string;
  type: "conversation.item.truncate";
  item_id: string;
  content_index: number;
  audio_end_ms: number;
}

export interface RealtimeResponseCreateEvent {
  event_id?: string;
  type: "response.create";
  response?: {
    modalities?: ("text" | "audio")[];
    instructions?: string;
    voice?: string;
    output_audio_format?: NativeVoiceAudioFormat;
    tools?: RealtimeToolDefinition[];
    tool_choice?: string;
    temperature?: number;
    max_output_tokens?: number | "inf";
  };
}

export interface RealtimeResponseCancelEvent {
  event_id?: string;
  type: "response.cancel";
  response_id?: string;
}

export type RealtimeClientEvent =
  | RealtimeSessionUpdateEvent
  | RealtimeInputAudioBufferAppendEvent
  | RealtimeInputAudioBufferCommitEvent
  | RealtimeInputAudioBufferClearEvent
  | RealtimeConversationItemCreateEvent
  | RealtimeConversationItemTruncateEvent
  | RealtimeResponseCreateEvent
  | RealtimeResponseCancelEvent;

// ---------------------------------------------------------------------------
// Server wire events (Provider -> Media Worker)
// ---------------------------------------------------------------------------

export interface RealtimeSessionCreatedEvent {
  event_id: string;
  type: "session.created";
  session: RealtimeSessionConfig & { id: string };
}

export interface RealtimeSessionUpdatedEvent {
  event_id: string;
  type: "session.updated";
  session: RealtimeSessionConfig;
}

export interface RealtimeSpeechStartedEvent {
  event_id: string;
  type: "input_audio_buffer.speech_started";
  audio_start_ms: number;
  item_id: string;
}

export interface RealtimeSpeechStoppedEvent {
  event_id: string;
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms: number;
  item_id: string;
}

export interface RealtimeAudioDeltaEvent {
  event_id: string;
  type: "response.audio.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string; // base64 chunk
}

export interface RealtimeAudioDoneEvent {
  event_id: string;
  type: "response.audio.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
}

export interface RealtimeFunctionCallArgumentsDoneEvent {
  event_id: string;
  type: "response.function_call_arguments.done";
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  name: string;
  arguments: string; // JSON serialized string
}

export interface RealtimeResponseDoneEvent {
  event_id: string;
  type: "response.done";
  response: {
    id: string;
    status: "completed" | "cancelled" | "failed" | "incomplete";
    status_details?: Record<string, unknown>;
    output: Array<{
      id: string;
      type: "message" | "function_call";
      role?: "assistant";
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
    usage?: {
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
      input_token_details?: {
        cached_tokens: number;
        text_tokens: number;
        audio_tokens: number;
      };
      output_token_details?: {
        text_tokens: number;
        audio_tokens: number;
      };
    };
  };
}

export interface RealtimeErrorEvent {
  event_id: string;
  type: "error";
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string | null;
  };
}

export type RealtimeServerEvent =
  | RealtimeSessionCreatedEvent
  | RealtimeSessionUpdatedEvent
  | RealtimeSpeechStartedEvent
  | RealtimeSpeechStoppedEvent
  | RealtimeAudioDeltaEvent
  | RealtimeAudioDoneEvent
  | RealtimeFunctionCallArgumentsDoneEvent
  | RealtimeResponseDoneEvent
  | RealtimeErrorEvent;

// ---------------------------------------------------------------------------
// Truncation, Fencing & Unknowns Tracking Records
// ---------------------------------------------------------------------------

export interface NativeVoiceTruncationRecord {
  itemId: string;
  audioEndMs: number;
  truncatedAt: string;
  reason: "caller_barge_in" | "turn_cancelled" | "epoch_fenced";
}

export interface NativeVoiceUnknownsRecord {
  nanTwSupport: "unknown_pending_live";
  hakTwSupport: "unknown_pending_live";
  carrierPstnPacketLoss: "unknown_pending_live";
  exactLiveCostTwd: "unknown_pending_live";
  rationale: string;
}
