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

  describe("bounded transport deadline", () => {
    const originalTimeoutEnv = process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;

    afterEach(() => {
      if (originalTimeoutEnv === undefined) {
        delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
      } else {
        process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = originalTimeoutEnv;
      }
    });

    it("defaults to a documented finite timeout when unconfigured", () => {
      delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
      const service = new WebhookDispatchService();
      expect(service.timeoutMs).toBe(10_000);
    });

    it("honors a valid WEBHOOK_DISPATCH_TIMEOUT_MS override", () => {
      process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = "2500";
      const service = new WebhookDispatchService();
      expect(service.timeoutMs).toBe(2500);
    });

    it("rejects a non-finite/non-positive WEBHOOK_DISPATCH_TIMEOUT_MS", () => {
      for (const invalid of ["0", "-5", "1.5", "not-a-number", "60001"]) {
        process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = invalid;
        expect(() => new WebhookDispatchService()).toThrow();
      }
    });

    it("rejects a non-finite/non-positive injected timeout override", () => {
      delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
      for (const invalid of [
        0,
        -5,
        1.5,
        60_001,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        expect(() => new WebhookDispatchService(undefined, invalid)).toThrow();
      }
    });

    it("aborts the production fetch call once the bounded deadline elapses and classifies it through the existing retry policy", async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Pick<Response, "ok" | "status">>(
          (_resolve, reject) => {
            capturedSignal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          },
        );
      });
      const service = new WebhookDispatchService(fetchMock, 500);

      const resultPromise = service.dispatchAttempt({
        url: "https://tenant.example.com/webhooks/drts",
        deliveryId: "wd_timeout",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });

      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(capturedSignal?.aborted).toBe(true);
      expect(result.status).toBe("queued");
      expect(result.httpStatus).toBeNull();
    });

    it("marks a timed-out final attempt as delivery_failed once retries are exhausted", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Pick<Response, "ok" | "status">>(
          (_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          },
        );
      });
      const service = new WebhookDispatchService(fetchMock, 500);

      const resultPromise = service.dispatchAttempt({
        url: "https://tenant.example.com/webhooks/drts",
        deliveryId: "wd_exhausted",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: RETRY_POLICY.maxAttempts,
        retryPolicy: RETRY_POLICY,
      });

      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.status).toBe("delivery_failed");
      expect(result.nextAttemptAt).toBeNull();
    });

    it("clears the deadline timer once the transport resolves before the timeout", async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const fetchMock = vi.fn(async () => ({ ok: true, status: 202 }));
      const service = new WebhookDispatchService(fetchMock, 1_000);

      await service.dispatchAttempt({
        url: "https://tenant.example.com/webhooks/drts",
        deliveryId: "wd_cleanup",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("passes an AbortSignal to the production default fetch path on every call", async () => {
      vi.useFakeTimers();
      let capturedInit: RequestInit | undefined;
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        capturedInit = init;
        return { ok: true, status: 202 };
      });
      const service = new WebhookDispatchService(fetchMock, 1_000);

      await service.dispatchAttempt({
        url: "https://tenant.example.com/webhooks/drts",
        deliveryId: "wd_signal",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });

      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
