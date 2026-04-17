import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WebhookDispatchService,
  type WebhookRetryPolicy,
} from "../../src/modules/tenant-partner/webhook-dispatch.service";

const RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  initialBackoffSeconds: 30,
  backoffMultiplier: 2,
  maxBackoffSeconds: 900,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("WebhookDispatchService", () => {
  it("serializes webhook payloads as snake_case and signs the request", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
    }));
    const service = new WebhookDispatchService(fetchMock);

    const result = await service.dispatchAttempt({
      url: "https://tenant.example.com/webhooks/drts",
      deliveryId: "wd_001",
      eventType: "tenant.webhook.test",
      tenantId: "tenant-demo-001",
      secretValue: "dispatch-secret",
      secretVersion: 1,
      payload: {
        event: "tenant.webhook.test",
        deliveryId: "wd_001",
        occurredAt: "2026-04-17T12:00:00.000Z",
        tenantId: "tenant-demo-001",
        data: {
          webhookId: "wh_001",
          secretVersion: 1,
        },
      },
      attempt: 1,
      retryPolicy: RETRY_POLICY,
    });

    expect(result.status).toBe("delivered");
    expect(result.rawBody).toEqual({
      event: "tenant.webhook.test",
      delivery_id: "wd_001",
      occurred_at: "2026-04-17T12:00:00.000Z",
      tenant_id: "tenant-demo-001",
      data: {
        webhook_id: "wh_001",
        secret_version: 1,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tenant.example.com/webhooks/drts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-drts-event-type": "tenant.webhook.test",
          "x-drts-webhook-delivery-id": "wd_001",
          "x-drts-webhook-signature": expect.stringMatching(
            /^v=1;t=.*;sig=[0-9a-f]+$/,
          ),
        }),
      }),
    );
  });

  it("returns queued status and the next attempt time for retryable responses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    const service = new WebhookDispatchService(
      vi.fn(async () => ({
        ok: false,
        status: 503,
      })),
    );

    const result = await service.dispatchAttempt({
      url: "https://tenant.example.com/webhooks/drts",
      deliveryId: "wd_002",
      eventType: "tenant.webhook.test",
      tenantId: "tenant-demo-001",
      secretValue: "dispatch-secret",
      secretVersion: 2,
      payload: {
        event: "tenant.webhook.test",
        deliveryId: "wd_002",
        occurredAt: "2026-04-17T12:00:00.000Z",
        tenantId: "tenant-demo-001",
        data: {
          webhookId: "wh_002",
          secretVersion: 2,
        },
      },
      attempt: 1,
      retryPolicy: RETRY_POLICY,
    });

    expect(result.status).toBe("queued");
    expect(result.httpStatus).toBe(503);
    expect(result.nextAttemptAt).toBe("2026-04-17T12:00:30.000Z");
  });
});
