import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { CallcenterService } from "./callcenter.service";
import {
  SANDBOX_WEBHOOK_EVENT_TYPES,
  type SandboxWebhookEventType,
  type SandboxWebhookPayload,
} from "./sandbox.fixtures";

@Injectable()
export class SandboxWebhookAdapter {
  constructor(private readonly callcenterService: CallcenterService) {}

  ingest(payload: SandboxWebhookPayload, requestId?: string) {
    const eventType = this.requireEventType(payload.event_type);
    const callId = payload.provider_call_id?.trim();
    if (!callId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_CALL_ID_REQUIRED",
        "provider_call_id is required.",
      );
    }

    switch (eventType) {
      case "call.started":
        return {
          accepted: true,
          eventType,
          callId,
          session: this.callcenterService.upsertExternalSession(
            {
              callId,
              callType: payload.call_type ?? "booking",
              callerPhone: payload.caller_phone ?? null,
              agentId: payload.agent_extension ?? null,
              startedAt: payload.started_at ?? null,
            },
            requestId,
          ),
        };
      case "call.ended":
        this.callcenterService.upsertExternalSession(
          {
            callId,
            callType: payload.call_type ?? "booking",
            callerPhone: payload.caller_phone ?? null,
            agentId: payload.agent_extension ?? null,
            startedAt: payload.started_at ?? null,
          },
          requestId,
        );
        return {
          accepted: true,
          eventType,
          callId,
          session: this.callcenterService.closeCallSession(
            callId,
            payload.ended_at
              ? {
                  endedAt: payload.ended_at,
                }
              : {},
            requestId,
          ),
        };
      case "recording.pending":
        this.callcenterService.upsertExternalSession(
          {
            callId,
            callType: payload.call_type ?? "booking",
            callerPhone: payload.caller_phone ?? null,
            agentId: payload.agent_extension ?? null,
            startedAt: payload.started_at ?? null,
            endedAt: payload.ended_at ?? null,
          },
          requestId,
        );
        return {
          accepted: true,
          eventType,
          callId,
          session: this.callcenterService.markRecordingPending(
            callId,
            {
              agentId: payload.agent_extension ?? null,
              startedAt: payload.started_at ?? null,
              endedAt: payload.ended_at ?? null,
            },
            requestId,
          ),
        };
      case "recording.ready":
        this.callcenterService.upsertExternalSession(
          {
            callId,
            callType: payload.call_type ?? "booking",
            callerPhone: payload.caller_phone ?? null,
            agentId: payload.agent_extension ?? null,
            startedAt: payload.started_at ?? null,
            endedAt: payload.ended_at ?? null,
          },
          requestId,
        );
        if (!payload.recording_id?.trim()) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "RECORDING_ID_REQUIRED",
            "recording_id is required for recording.ready.",
          );
        }
        return {
          accepted: true,
          eventType,
          callId,
          session: this.callcenterService.attachRecordingCallback(
            callId,
            {
              recordingId: payload.recording_id,
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
            },
            requestId,
          ),
        };
      case "recording.failed":
        this.callcenterService.upsertExternalSession(
          {
            callId,
            callType: payload.call_type ?? "booking",
            callerPhone: payload.caller_phone ?? null,
            agentId: payload.agent_extension ?? null,
            startedAt: payload.started_at ?? null,
            endedAt: payload.ended_at ?? null,
          },
          requestId,
        );
        return {
          accepted: true,
          eventType,
          callId,
          session: this.callcenterService.markRecordingFailed(
            callId,
            {
              agentId: payload.agent_extension ?? null,
              startedAt: payload.started_at ?? null,
              endedAt: payload.ended_at ?? null,
            },
            requestId,
          ),
        };
    }
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
