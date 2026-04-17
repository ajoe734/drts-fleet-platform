import { createHmac } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";

import { deepToSnakeCase } from "../../common/snake-case.interceptor";

export const WEBHOOK_FETCH = Symbol("WEBHOOK_FETCH");

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
  constructor(
    @Optional()
    @Inject(WEBHOOK_FETCH)
    private readonly fetchImpl: WebhookFetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {}

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
    return new Date(
      new Date(attemptedAt).getTime() +
        this.computeRetryDelayMs(retryPolicy, attempt),
    ).toISOString();
  }

  computeRetryDelayMs(retryPolicy: WebhookRetryPolicy, attempt: number) {
    const delaySeconds =
      retryPolicy.initialBackoffSeconds *
      retryPolicy.backoffMultiplier ** (attempt - 1);
    return (
      Math.min(
        Math.max(1, Math.round(delaySeconds)),
        retryPolicy.maxBackoffSeconds,
      ) * 1000
    );
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
