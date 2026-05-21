import type { CallType } from "@drts/contracts";

export const SANDBOX_WEBHOOK_EVENT_TYPES = [
  "call.started",
  "call.ended",
  "recording.pending",
  "recording.ready",
  "recording.failed",
] as const;

export type SandboxWebhookEventType =
  (typeof SANDBOX_WEBHOOK_EVENT_TYPES)[number];

export type SandboxWebhookPayload = {
  event_type: SandboxWebhookEventType;
  provider_call_id: string;
  caller_phone?: string;
  agent_extension?: string;
  call_type?: CallType;
  started_at?: string;
  ended_at?: string;
  recording_id?: string;
  provider_recording_ref?: string;
  recording_url?: string;
  disposition?: string;
};

export const sandboxFixtures = {
  callStarted: {
    event_type: "call.started",
    provider_call_id: "cti-sandbox-call-001",
    caller_phone: "0911000001",
    agent_extension: "ops-001",
    call_type: "booking",
    started_at: "2026-05-19T05:00:00.000Z",
  } satisfies SandboxWebhookPayload,
  callEnded: {
    event_type: "call.ended",
    provider_call_id: "cti-sandbox-call-001",
    caller_phone: "0911000001",
    agent_extension: "ops-001",
    ended_at: "2026-05-19T05:08:00.000Z",
    disposition: "completed",
  } satisfies SandboxWebhookPayload,
  recordingPending: {
    event_type: "recording.pending",
    provider_call_id: "cti-sandbox-call-001",
    agent_extension: "ops-001",
    started_at: "2026-05-19T05:00:00.000Z",
    ended_at: "2026-05-19T05:08:00.000Z",
  } satisfies SandboxWebhookPayload,
  recordingReady: {
    event_type: "recording.ready",
    provider_call_id: "cti-sandbox-call-001",
    agent_extension: "ops-001",
    started_at: "2026-05-19T05:00:00.000Z",
    ended_at: "2026-05-19T05:08:00.000Z",
    recording_id: "rec-sandbox-001",
    provider_recording_ref: "sandbox-ref-001",
    recording_url: "https://sandbox.cti.example/recordings/rec-sandbox-001",
  } satisfies SandboxWebhookPayload,
  recordingFailed: {
    event_type: "recording.failed",
    provider_call_id: "cti-sandbox-call-001",
    agent_extension: "ops-001",
    started_at: "2026-05-19T05:00:00.000Z",
    ended_at: "2026-05-19T05:08:00.000Z",
    disposition: "recording_timeout",
  } satisfies SandboxWebhookPayload,
} as const;
