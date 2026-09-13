import { createHmac } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";

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
// case; see docs/04-uat/system-remediation-20260906/webhook-transport-timeout-20260911.md.
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

export type WebhookFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

export type WebhookRetryPolicy = {
  maxAttempts: number;
  initialBackoffSeconds: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryableStatusCodes: number[];
};

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
    const rawBodyString = JSON.stringify(rawBody);
    const signature = createHmac("sha256", command.secretValue)
      .update(`${attemptedAt}.${rawBodyString}`)
      .digest("hex");
    const signatureHeader = `v=${command.secretVersion};t=${attemptedAt};sig=${signature}`;

    let httpStatus: number | null = null;
    let status: WebhookDispatchAttemptResult["status"] = "delivered";

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort(new Error("webhook_dispatch_transport_timeout"));
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(command.url, {
        method: "POST",
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
