import { createHmac } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";

import { PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES } from "@drts/contracts";

import { partnerNotificationWireBytes } from "./partner-notification-wire";

import { deepToSnakeCase } from "../../common/snake-case.interceptor";

export const WEBHOOK_FETCH = Symbol("WEBHOOK_FETCH");
export const WEBHOOK_DISPATCH_TIMEOUT_MS = Symbol(
  "WEBHOOK_DISPATCH_TIMEOUT_MS",
);

const WEBHOOK_DISPATCH_TIMEOUT_ENV_VAR = "WEBHOOK_DISPATCH_TIMEOUT_MS";
const WEBHOOK_DISPATCH_TIMEOUT_MIN_MS = 1;
const WEBHOOK_DISPATCH_TIMEOUT_MAX_MS = 60_000;
// Webhook delivery is queued and already covered by shouldRetry/backoff below, unlike
// the synchronous partner-eligibility adapter budget (3_000ms) or other caller-facing
// outbound adapters (driver-sos scanner / geo provider default 5_000ms). A slow but
// healthy tenant endpoint should not be misclassified as failed on that tighter,
// synchronous-call budget, so the default sits higher while still bounding the worst
// case; see docs/03-runbooks/tenant-api-webhook-governance-runbook.md and
// docs/04-uat/system-remediation-20260906/webhook-transport-timeout-20260911.md.
const DEFAULT_WEBHOOK_DISPATCH_TIMEOUT_MS = 10_000;

function validateWebhookDispatchTimeoutMs(
  value: number,
  source: string,
): number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < WEBHOOK_DISPATCH_TIMEOUT_MIN_MS ||
    value > WEBHOOK_DISPATCH_TIMEOUT_MAX_MS
  ) {
    throw new Error(
      `${source} must be an integer between ${WEBHOOK_DISPATCH_TIMEOUT_MIN_MS} and ${WEBHOOK_DISPATCH_TIMEOUT_MAX_MS} milliseconds, got "${value}".`,
    );
  }
  return value;
}

function resolveWebhookDispatchTimeoutMs(
  configured: number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (configured !== undefined) {
    return validateWebhookDispatchTimeoutMs(
      configured,
      `${WEBHOOK_DISPATCH_TIMEOUT_ENV_VAR} override`,
    );
  }
  const raw = env[WEBHOOK_DISPATCH_TIMEOUT_ENV_VAR];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_WEBHOOK_DISPATCH_TIMEOUT_MS;
  }
  return validateWebhookDispatchTimeoutMs(
    Number(raw),
    WEBHOOK_DISPATCH_TIMEOUT_ENV_VAR,
  );
}

/**
 * `text` is optional so the widened type stays backward compatible with
 * every existing WEBHOOK_FETCH mock/injection that only returns `{ ok,
 * status }` — those still satisfy this type unchanged. Only the opt-in
 * `partner_ack_v1` path (see `PartnerAckV1RequestOptions` below) ever reads
 * it; an ordinary tenant webhook dispatch never calls `text()`.
 */
export type WebhookFetchResponse = Pick<Response, "ok" | "status"> &
  Partial<Pick<Response, "text">>;

export type WebhookFetch = (
  input: string,
  init?: RequestInit,
) => Promise<WebhookFetchResponse>;

export type WebhookRetryPolicy = {
  maxAttempts: number;
  initialBackoffSeconds: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryableStatusCodes: number[];
};

/**
 * Opt-in partner passenger-notification acknowledgement mode — SR-PARTNER-
 * NOTIFY-ACK-20260917, design doc §7/§8. `expected` is what this exact
 * attempt's request carried; the response body must echo it back verbatim
 * or the ack does not count. An ordinary tenant webhook never sets this and
 * keeps its existing status-only behavior unchanged.
 */
export type PartnerAckV1ExpectedIdentity = {
  notificationId: string;
  deliveryId: string;
  partnerEntrySlug: string;
};

export type PartnerAckV1RequestOptions = {
  mode: "partner_ack_v1";
  expected: PartnerAckV1ExpectedIdentity;
};

export type PartnerAckV1InvalidReason =
  | "http_status_not_eligible"
  | "no_body_reader"
  | "empty_body"
  | "body_too_large"
  | "not_json"
  | "id_mismatch"
  | "status_invalid"
  | "receipt_missing"
  | "read_aborted";

export type PartnerAckV1AcceptedAck = {
  notificationId: string;
  deliveryId: string;
  partnerEntrySlug: string;
  status: "accepted" | "duplicate";
  receiptId: string;
};

export type PartnerAckV1Outcome =
  | { kind: "accepted"; ack: PartnerAckV1AcceptedAck }
  | { kind: "invalid"; reason: PartnerAckV1InvalidReason };

const PARTNER_ACK_V1_ELIGIBLE_HTTP_STATUSES = new Set([200, 201, 202]);

export type WebhookDispatchAttemptCommand = {
  url: string;
  deliveryId: string;
  eventType: string;
  tenantId: string;
  secretValue: string;
  secretVersion: number;
  payload: Record<string, unknown>;
  attempt: number;
  retryPolicy: WebhookRetryPolicy;
  /** Opt-in only. Omit for ordinary tenant webhooks — status-only, no body read. */
  partnerAckV1?: PartnerAckV1RequestOptions;
};

export type WebhookDispatchAttemptResult = {
  attempt: number;
  attemptedAt: string;
  status: "queued" | "delivered" | "delivery_failed";
  httpStatus: number | null;
  signature: string;
  signatureHeader: string;
  signatureVersion: number;
  secretVersion: number;
  nextAttemptAt: string | null;
  rawBody: Record<string, unknown>;
  /** Present only when `partnerAckV1` was requested on the command. */
  partnerAckV1?: PartnerAckV1Outcome;
};

@Injectable()
export class WebhookDispatchService {
  readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject(WEBHOOK_FETCH)
    private readonly fetchImpl: WebhookFetch = globalThis.fetch.bind(
      globalThis,
    ),
    @Optional()
    @Inject(WEBHOOK_DISPATCH_TIMEOUT_MS)
    timeoutMsOverride?: number,
  ) {
    this.timeoutMs = resolveWebhookDispatchTimeoutMs(timeoutMsOverride);
  }

  async dispatchAttempt(
    command: WebhookDispatchAttemptCommand,
  ): Promise<WebhookDispatchAttemptResult> {
    const attemptedAt = new Date().toISOString();
    const rawBody = this.normalizePayload(command.payload);
    const rawBodyString = command.partnerAckV1 ? partnerNotificationWireBytes(command.payload) : JSON.stringify(rawBody);
    const signature = createHmac("sha256", command.secretValue)
      .update(`${attemptedAt}.${rawBodyString}`)
      .digest("hex");
    const signatureHeader = `v=${command.secretVersion};t=${attemptedAt};sig=${signature}`;

    let httpStatus: number | null = null;
    let status: WebhookDispatchAttemptResult["status"] = "delivered";
    let partnerAckV1: PartnerAckV1Outcome | undefined;

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort(new Error("webhook_dispatch_transport_timeout"));
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(command.url, {
        method: "POST",
        ...(command.partnerAckV1 ? { redirect: "error" as const } : {}),
        headers: {
          "content-type": "application/json",
          "user-agent": "drts-webhook-dispatch/1.0",
          "x-drts-event-type": command.eventType,
          "x-drts-tenant-id": command.tenantId,
          "x-drts-webhook-delivery-id": command.deliveryId,
          "x-drts-webhook-signature": signatureHeader,
        },
        body: rawBodyString,
        signal: controller.signal,
      });

      httpStatus = response.status;

      // Read within the same abort-bound deadline as the request itself,
      // and only when the caller opted in — an ordinary tenant webhook must
      // never pay for a body read it did not ask for.
      if (command.partnerAckV1) {
        partnerAckV1 = await this.readPartnerAckV1(
          response,
          httpStatus,
          command.partnerAckV1.expected,
        );
      }

      if (!response.ok) {
        status = this.shouldRetry(
          command.retryPolicy,
          command.attempt,
          response.status,
        )
          ? "queued"
          : "delivery_failed";
      }
    } catch {
      status = this.shouldRetry(command.retryPolicy, command.attempt, null)
        ? "queued"
        : "delivery_failed";
    } finally {
      clearTimeout(timeoutTimer);
    }

    return {
      attempt: command.attempt,
      attemptedAt,
      status,
      httpStatus,
      signature,
      signatureHeader,
      signatureVersion: command.secretVersion,
      secretVersion: command.secretVersion,
      nextAttemptAt:
        status === "queued"
          ? this.computeNextAttemptAt(
              attemptedAt,
              command.retryPolicy,
              command.attempt,
            )
          : null,
      rawBody,
      ...(partnerAckV1 ? { partnerAckV1 } : {}),
    };
  }

  /**
   * Design doc §7: HTTPS 200/201/202 whose JSON body's notification_id/
   * delivery_id/partner_entry_slug match this request and whose status is
   * accepted|duplicate with a non-empty receipt_id. 204, an empty body, HTML,
   * a missing receipt or a mismatched id are never a success. `receiptId`
   * always comes from the parsed body — this method never synthesizes one.
   */
  private async readPartnerAckV1(
    response: WebhookFetchResponse,
    httpStatus: number,
    expected: PartnerAckV1ExpectedIdentity,
  ): Promise<PartnerAckV1Outcome> {
    if (!PARTNER_ACK_V1_ELIGIBLE_HTTP_STATUSES.has(httpStatus)) {
      return { kind: "invalid", reason: "http_status_not_eligible" };
    }
    if (typeof response.text !== "function") {
      return { kind: "invalid", reason: "no_body_reader" };
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      return { kind: "invalid", reason: "read_aborted" };
    }

    if (!text) {
      return { kind: "invalid", reason: "empty_body" };
    }
    if (
      Buffer.byteLength(text, "utf8") > PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES
    ) {
      return { kind: "invalid", reason: "body_too_large" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { kind: "invalid", reason: "not_json" };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return { kind: "invalid", reason: "not_json" };
    }

    const body = parsed as Record<string, unknown>;
    if (
      body.notification_id !== expected.notificationId ||
      body.delivery_id !== expected.deliveryId ||
      body.partner_entry_slug !== expected.partnerEntrySlug
    ) {
      return { kind: "invalid", reason: "id_mismatch" };
    }
    if (body.status !== "accepted" && body.status !== "duplicate") {
      return { kind: "invalid", reason: "status_invalid" };
    }
    if (typeof body.receipt_id !== "string" || body.receipt_id.length === 0) {
      return { kind: "invalid", reason: "receipt_missing" };
    }

    return {
      kind: "accepted",
      ack: {
        notificationId: expected.notificationId,
        deliveryId: expected.deliveryId,
        partnerEntrySlug: expected.partnerEntrySlug,
        status: body.status,
        receiptId: body.receipt_id,
      },
    };
  }

  computeNextAttemptAt(
    attemptedAt: string,
    retryPolicy: WebhookRetryPolicy,
    attempt: number,
  ) {
    const baseTime = Number.isNaN(new Date(attemptedAt).getTime())
      ? Date.now()
      : new Date(attemptedAt).getTime();
    return new Date(
      baseTime + this.computeRetryDelayMs(retryPolicy, attempt),
    ).toISOString();
  }

  computeRetryDelayMs(retryPolicy: WebhookRetryPolicy, attempt: number) {
    const initialBackoff = retryPolicy?.initialBackoffSeconds ?? 10;
    const multiplier = retryPolicy?.backoffMultiplier ?? 2;
    const maxBackoff = retryPolicy?.maxBackoffSeconds ?? 300;
    const delaySeconds = initialBackoff * multiplier ** (attempt - 1);
    return Math.min(Math.max(1, Math.round(delaySeconds)), maxBackoff) * 1000;
  }

  shouldRetry(
    retryPolicy: WebhookRetryPolicy,
    attempt: number,
    httpStatus: number | null,
  ) {
    if (attempt >= retryPolicy.maxAttempts) {
      return false;
    }

    if (httpStatus === null) {
      return true;
    }

    return retryPolicy.retryableStatusCodes.includes(httpStatus);
  }

  private normalizePayload(payload: Record<string, unknown>) {
    return deepToSnakeCase(payload) as Record<string, unknown>;
  }
}
