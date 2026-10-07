// PUSH-FIRST-PARTY-FCM-20261006 — D6: a provider-agnostic send port plus the
// first (and only, this wave) implementation, FCM HTTP v1. Pure/stateless
// helpers (wire message construction, collapse key, response classification)
// live here so they are unit-testable without any I/O; the claim/fence,
// context persistence and device-list orchestration live in
// MultiTaxiService.deliverFirstPartyPushNotification (out of this file's
// scope — this file never touches the database or the outbox).
//
// Design: docs/02-architecture/passenger-notification-channel-routing-20261006.md D6.
import { createHash } from "node:crypto";
import { Inject } from "@nestjs/common";

import type {
  ConsumerNotificationOutboxRecord,
  FirstPartyPushMessage,
  FirstPartyPushNotificationText,
} from "@drts/contracts";
import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME } from "@drts/contracts";

import {
  type GoogleCloudTokens,
  GoogleMetadataTokens,
  readCloudBody,
  withCloudDeadline,
} from "../../common/google-cloud/google-cloud-object-client";

// ===========================================================================
// Config/DI — flag + project id, read once at module bootstrap (same
// `useValue` pattern as PASSENGER_PUSH_ADAPTER_CONFIG). Default is dormant:
// `enabled: false`, `projectId: null`.
// ===========================================================================

export interface FirstPartyPushConfig {
  enabled: boolean;
  projectId: string | null;
}

export function firstPartyPushConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FirstPartyPushConfig {
  return {
    enabled: env.PASSENGER_PUSH_FIRST_PARTY_ENABLED === "true",
    projectId: env.PASSENGER_PUSH_FCM_PROJECT_ID?.trim() || null,
  };
}

export const FIRST_PARTY_PUSH_CONFIG = Symbol("FIRST_PARTY_PUSH_CONFIG");
export const InjectFirstPartyPushConfig = () => Inject(FIRST_PARTY_PUSH_CONFIG);

// ===========================================================================
// Provider port — one request per device token (FCM HTTP v1 has no
// multicast). A provider implementation never decides retry/invalidate
// policy itself; it only reports what the HTTP call observed.
// ===========================================================================

export type FirstPartyPushProviderOutcome =
  | { outcome: "accepted"; messageName: string }
  | { outcome: "invalid" }
  | { outcome: "transient"; retryAfterSeconds: number | null }
  | { outcome: "credential_rejected" };

export interface FirstPartyPushSendOptions {
  projectId: string;
  ttlSeconds: number;
  collapseKey: string;
  expiresAtEpochSeconds: number;
}

export interface FirstPartyPushProvider {
  send(
    token: string,
    message: FirstPartyPushMessage,
    options: FirstPartyPushSendOptions,
  ): Promise<FirstPartyPushProviderOutcome>;
}

export const FIRST_PARTY_PUSH_PROVIDER = Symbol("FIRST_PARTY_PUSH_PROVIDER");
export const InjectFirstPartyPushProvider = () =>
  Inject(FIRST_PARTY_PUSH_PROVIDER);

function parseRetryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    const diffSeconds = Math.ceil((dateMs - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : 0;
  }
  return null;
}

function fcmErrorStatus(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

/**
 * D6 error-mapping table. `errorStatus` (FCM's own `error.status` enum
 * value, when present) takes priority over the bare HTTP status for the two
 * cases D6 calls out by name (`THIRD_PARTY_AUTH_ERROR`, `SENDER_ID_MISMATCH`)
 * since the HTTP status alone (401/403) is ambiguous between them and a
 * plain credential rejection. Any HTTP status this table does not recognise
 * is treated as transient (no `Retry-After` assumption either way) rather
 * than guessed into `invalid`/`credential_rejected` — a device must never be
 * invalidated, and FCM credentials must never be flagged blocked, on a
 * response this provider cannot actually identify.
 */
export function classifyFcmErrorResponse(
  httpStatus: number,
  body: unknown,
  retryAfterSeconds: number | null,
): FirstPartyPushProviderOutcome {
  const errorStatus = fcmErrorStatus(body);
  if (errorStatus === "THIRD_PARTY_AUTH_ERROR") {
    return { outcome: "credential_rejected" };
  }
  if (httpStatus === 404 || httpStatus === 400) {
    return { outcome: "invalid" };
  }
  if (httpStatus === 403) {
    return errorStatus === "SENDER_ID_MISMATCH"
      ? { outcome: "invalid" }
      : { outcome: "credential_rejected" };
  }
  if (httpStatus === 401) {
    return { outcome: "credential_rejected" };
  }
  if (httpStatus === 429 || httpStatus === 500 || httpStatus === 503) {
    return { outcome: "transient", retryAfterSeconds };
  }
  return { outcome: "transient", retryAfterSeconds };
}

/**
 * FCM HTTP v1. Access token via Cloud Run's metadata service
 * (`GoogleMetadataTokens`) — no service-account key, no firebase-admin
 * dependency. 10s deadline covers token acquisition and the send call
 * together; no redirects; response body read is size-bounded.
 */
/**
 * Always constructed directly (`multi-taxi.module.ts`'s `useFactory`), never
 * resolved through Nest's own constructor-injection — `GoogleCloudTokens` is
 * an interface, not a DI token, so there is nothing for Nest to resolve here.
 */
export class FcmHttpV1PushProvider implements FirstPartyPushProvider {
  constructor(
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(
    token: string,
    message: FirstPartyPushMessage,
    options: FirstPartyPushSendOptions,
  ): Promise<FirstPartyPushProviderOutcome> {
    try {
      return await withCloudDeadline(this.timeoutMs, async (signal) => {
        const accessToken = await this.tokens.accessToken(signal);
        signal.throwIfAborted();
        const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/messages:send`;
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: message.notification,
              data: message.data,
              android: {
                ttl: `${options.ttlSeconds}s`,
                collapse_key: options.collapseKey,
              },
              apns: {
                headers: {
                  "apns-expiration": String(options.expiresAtEpochSeconds),
                  "apns-collapse-id": options.collapseKey,
                },
              },
            },
          }),
          redirect: "error",
          signal,
        });
        const retryAfterSeconds = parseRetryAfterSeconds(
          response.headers.get("retry-after"),
        );
        let body: unknown = null;
        try {
          const bytes = await readCloudBody(response, 64 * 1024, signal);
          body = bytes.length ? JSON.parse(bytes.toString("utf8")) : null;
        } catch {
          body = null;
        }
        if (response.ok) {
          const messageName =
            typeof (body as { name?: unknown } | null)?.name === "string"
              ? (body as { name: string }).name
              : null;
          // A 200 without FCM's own message name is never treated as a
          // receipt (D6: "絕不合成 receipt") — retried as transient instead.
          if (!messageName) return { outcome: "transient", retryAfterSeconds: null };
          return { outcome: "accepted", messageName };
        }
        return classifyFcmErrorResponse(response.status, body, retryAfterSeconds);
      });
    } catch {
      // Timeout (withCloudDeadline), token acquisition failure, or any
      // network error: none of these is a device-specific or credential
      // verdict — only an actual FCM HTTP response can produce those.
      return { outcome: "transient", retryAfterSeconds: null };
    }
  }
}

// ===========================================================================
// Pure wire-message helpers — no I/O, reused by both the first attempt
// (building a new immutable context) and persistence (hashing it).
// ===========================================================================

const FIRST_PARTY_PUSH_TEXT: Record<
  ConsumerNotificationOutboxRecord["eventType"],
  FirstPartyPushNotificationText
> = {
  assignment_disclosure_ready: {
    title: "DRTS 乘車通知",
    body: "車輛已安排，請回行程查看。",
  },
  assignment_replaced: {
    title: "DRTS 乘車通知",
    body: "車輛安排已更新，請回行程查看。",
  },
  eta_changed: {
    title: "DRTS 乘車通知",
    body: "預計抵達時間已更新，請回行程查看。",
  },
  driver_arrived: {
    title: "DRTS 乘車通知",
    body: "司機已抵達，請回行程查看。",
  },
  receipt_ready: {
    title: "DRTS 乘車通知",
    body: "乘車證明已備妥，請回行程查看。",
  },
  trip_cancelled: {
    title: "DRTS 乘車通知",
    body: "行程已取消，請回行程查看。",
  },
};

/**
 * D6 collapse policy: only `eta_changed` shares a collapse key across an
 * order's repeated updates (newest supersedes older, same spirit as the
 * existing ETA throttling at a different layer). Every other event type
 * gets a per-outbox collapse key, i.e. it never actually collapses with
 * anything, since FCM requires the field to be present either way.
 */
export function firstPartyPushCollapseKey(
  eventType: ConsumerNotificationOutboxRecord["eventType"],
  orderId: string,
  outboxId: string,
): string {
  return eventType === "eta_changed"
    ? `eta_changed:${orderId}`
    : `${eventType}:${outboxId}`;
}

export function buildFirstPartyPushMessage(input: {
  eventType: ConsumerNotificationOutboxRecord["eventType"];
  outboxId: string;
  rideRef: string;
  eventSequence: number;
  expiresAt: string;
}): FirstPartyPushMessage {
  return {
    notification: FIRST_PARTY_PUSH_TEXT[input.eventType],
    data: {
      notification_id: input.outboxId,
      event: PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[input.eventType],
      ride_ref: input.rideRef,
      event_sequence: String(input.eventSequence),
      expires_at: input.expiresAt,
    },
  };
}

export function firstPartyPushMessageHash(message: FirstPartyPushMessage): string {
  return createHash("sha256").update(JSON.stringify(message)).digest("hex");
}
