/**
 * SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911
 *
 * Root cause (base candidate 26eff448abee9f5a14f482e8e42a84e73cda57bc):
 * `WebhookDispatchService.dispatchAttempt()` called `fetch()` with no
 * `AbortSignal`/deadline of any kind, so a tenant endpoint that never
 * responds hangs the attempt forever. C112-3's prior "verification" wrapped
 * its own 150ms `AbortController` around the call, which only proved that a
 * test-supplied wrapper can time out -- it never exercised the production
 * transport, so it could not have caught this defect.
 *
 * This regression instantiates the real, unmodified
 * `WebhookDispatchService` (only the network transport seam -- the existing
 * `WEBHOOK_FETCH` DI token already used by every other test in this suite
 * -- is swapped; no timeout/AbortController logic is injected from the
 * test). The stub transport never settles on its own; it only
 * resolves/rejects in response to an `abort` event on the `AbortSignal` the
 * service itself passes to `fetch()`. Against the pre-fix production
 * transport nothing would ever abort that signal, so this test would hang
 * until Vitest's own per-test timeout fails it -- it cannot pass by
 * accident against the old code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WebhookDispatchService,
  type WebhookRetryPolicy,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  initialBackoffSeconds: 30,
  backoffMultiplier: 2,
  maxBackoffSeconds: 900,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

function neverSettlingUnlessAborted() {
  let capturedSignal: AbortSignal | undefined;
  const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return new Promise<Pick<Response, "ok" | "status">>((_resolve, reject) => {
      // Deliberately does not resolve/reject on its own: this stands in for
      // a tenant endpoint that accepts the TCP connection but never sends a
      // response. Only the production AbortSignal can end this promise.
      capturedSignal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
  });
  return {
    fetchImpl,
    getSignal: () => capturedSignal,
  };
}

describe("SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911: production transport has a real bounded deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the actual production default transport aborts a hung tenant endpoint within its validated deadline", async () => {
    vi.useFakeTimers();
    const { fetchImpl, getSignal } = neverSettlingUnlessAborted();
    const boundedTimeoutMs = 750;
    const service = new WebhookDispatchService(fetchImpl, boundedTimeoutMs);

    const resultPromise = service.dispatchAttempt({
      url: "https://tenant.example.com/webhooks/drts",
      deliveryId: "wd_sr_timeout_001",
      eventType: "tenant.webhook.test",
      tenantId: "tenant-demo-001",
      secretValue: "dispatch-secret",
      secretVersion: 1,
      payload: { event: "tenant.webhook.test" },
      attempt: 1,
      retryPolicy: RETRY_POLICY,
    });

    // Confirm the deadline is really bounded: nothing has aborted yet just
    // before it elapses.
    await vi.advanceTimersByTimeAsync(boundedTimeoutMs - 1);
    expect(getSignal()?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(getSignal()?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Timeout is classified through the pre-existing retry/final-failure
    // policy (shouldRetry with a null httpStatus), exactly like any other
    // network failure -- unchanged authority for retry/backoff.
    expect(result.status).toBe("queued");
    expect(result.httpStatus).toBeNull();
    expect(result.nextAttemptAt).not.toBeNull();
  });

  it("preserves HMAC signature and payload semantics on a timed-out attempt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    const { fetchImpl } = neverSettlingUnlessAborted();
    const service = new WebhookDispatchService(fetchImpl, 500);

    const resultPromise = service.dispatchAttempt({
      url: "https://tenant.example.com/webhooks/drts",
      deliveryId: "wd_sr_timeout_002",
      eventType: "tenant.webhook.test",
      tenantId: "tenant-demo-001",
      secretValue: "dispatch-secret",
      secretVersion: 3,
      payload: { deliveryId: "wd_sr_timeout_002", tenantId: "tenant-demo-001" },
      attempt: 1,
      retryPolicy: RETRY_POLICY,
    });

    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result.signatureHeader).toMatch(/^v=3;t=.*;sig=[0-9a-f]{64}$/);
    expect(result.rawBody).toEqual({
      delivery_id: "wd_sr_timeout_002",
      tenant_id: "tenant-demo-001",
    });
  });

  it("classifies a timed-out final attempt as delivery_failed once retries are exhausted (unchanged exhaustion authority)", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = neverSettlingUnlessAborted();
    const service = new WebhookDispatchService(fetchImpl, 500);

    const resultPromise = service.dispatchAttempt({
      url: "https://tenant.example.com/webhooks/drts",
      deliveryId: "wd_sr_timeout_003",
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

  it("rejects an unbounded or invalid configured deadline instead of silently defaulting to no limit", () => {
    for (const invalid of [
      0,
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      60_001,
    ]) {
      expect(() => new WebhookDispatchService(undefined, invalid)).toThrow();
    }
  });

  it("uses a documented finite default deadline when no override is configured", () => {
    const originalEnv = process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
    delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
    try {
      const service = new WebhookDispatchService();
      expect(Number.isFinite(service.timeoutMs)).toBe(true);
      expect(service.timeoutMs).toBeGreaterThan(0);
      expect(service.timeoutMs).toBeLessThanOrEqual(60_000);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
      } else {
        process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = originalEnv;
      }
    }
  });
});
