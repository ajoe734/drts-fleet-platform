import { HttpStatus, Injectable } from "@nestjs/common";
import type { CallSessionRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { CallcenterService } from "./callcenter.service";
import {
  SANDBOX_WEBHOOK_EVENT_TYPES,
  type SandboxWebhookEventType,
  type SandboxWebhookPayload,
} from "./sandbox.fixtures";

type SessionOperation = {
  legacy: () => CallSessionRecord;
  durable: () => CallSessionRecord | Promise<CallSessionRecord>;
};

@Injectable()
export class SandboxWebhookAdapter {
  constructor(private readonly callcenterService: CallcenterService) {}

  ingest(payload: SandboxWebhookPayload, requestId?: string) {
    // Preserve the original synchronous in-memory integration contract. The
    // HTTP endpoint uses ingestForWrite and waits for the same operation plan.
    const { eventType, callId, operations } = this.prepareIngest(
      payload,
      requestId,
    );
    let session!: CallSessionRecord;
    for (const operation of operations) session = operation.legacy();
    return { accepted: true, eventType, callId, session };
  }

  async ingestForWrite(payload: SandboxWebhookPayload, requestId?: string) {
    const { eventType, callId, operations } = this.prepareIngest(
      payload,
      requestId,
    );
    let session!: CallSessionRecord;
    // Each step reads the committed session produced by its predecessor. A
    // rejected upsert must never start a close/recording mutation or ACK.
    for (const operation of operations) session = await operation.durable();
    return { accepted: true, eventType, callId, session };
  }

  private prepareIngest(payload: SandboxWebhookPayload, requestId?: string) {
    const eventType = this.requireEventType(payload.event_type);
    const callId = payload.provider_call_id?.trim();
    if (!callId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_CALL_ID_REQUIRED",
        "provider_call_id is required.",
      );
    }

    if (eventType === "recording.ready" && !payload.recording_id?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RECORDING_ID_REQUIRED",
        "recording_id is required for recording.ready.",
      );
    }
    const input = {
      callId,
      callType: payload.call_type ?? "booking",
      callerPhone: payload.caller_phone ?? null,
      agentId: payload.agent_extension ?? null,
      startedAt: payload.started_at ?? null,
      ...(eventType.startsWith("recording.")
        ? { endedAt: payload.ended_at ?? null }
        : {}),
    };
    const operations: SessionOperation[] = [
      {
        legacy: () =>
          this.callcenterService.upsertExternalSession(input, requestId),
        durable: () =>
          this.callcenterService.upsertExternalSessionForWrite(
            input,
            requestId,
          ),
      },
    ];
    const stateCommand = {
      agentId: payload.agent_extension ?? null,
      startedAt: payload.started_at ?? null,
      endedAt: payload.ended_at ?? null,
    };
    switch (eventType) {
      case "call.started":
        break;
      case "call.ended": {
        const command = payload.ended_at ? { endedAt: payload.ended_at } : {};
        operations.push({
          legacy: () =>
            this.callcenterService.closeCallSession(callId, command, requestId),
          durable: () =>
            this.callcenterService.closeCallSessionForWrite(
              callId,
              command,
              requestId,
            ),
        });
        break;
      }
      case "recording.pending":
        operations.push({
          legacy: () =>
            this.callcenterService.markRecordingPending(
              callId,
              stateCommand,
              requestId,
            ),
          durable: () =>
            this.callcenterService.markRecordingPendingForWrite(
              callId,
              stateCommand,
              requestId,
            ),
        });
        break;
      case "recording.ready": {
        const command = {
          recordingId: payload.recording_id!.trim(),
          ...(payload.provider_recording_ref
            ? {
                providerRecordingRef: payload.provider_recording_ref,
              }
            : {}),
          ...(payload.recording_url
            ? {
                recordingUrl: payload.recording_url,
              }
            : {}),
          ...(payload.started_at
            ? {
                startedAt: payload.started_at,
              }
            : {}),
          ...(payload.ended_at
            ? {
                endedAt: payload.ended_at,
              }
            : {}),
          ...(payload.agent_extension
            ? {
                agentId: payload.agent_extension,
              }
            : {}),
        };
        operations.push({
          legacy: () =>
            this.callcenterService.attachRecordingCallback(
              callId,
              command,
              requestId,
            ),
          durable: () =>
            this.callcenterService.attachRecordingCallbackForWrite(
              callId,
              command,
              requestId,
            ),
        });
        break;
      }
      case "recording.failed":
        operations.push({
          legacy: () =>
            this.callcenterService.markRecordingFailed(
              callId,
              stateCommand,
              requestId,
            ),
          durable: () =>
            this.callcenterService.markRecordingFailedForWrite(
              callId,
              stateCommand,
              requestId,
            ),
        });
        break;
    }
    return { eventType, callId, operations };
  }

  private requireEventType(value: string): SandboxWebhookEventType {
    if (
      SANDBOX_WEBHOOK_EVENT_TYPES.includes(value as SandboxWebhookEventType)
    ) {
      return value as SandboxWebhookEventType;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "SANDBOX_EVENT_TYPE_UNSUPPORTED",
      "The sandbox event type is not supported.",
      {
        eventType: value,
      },
    );
  }
}
