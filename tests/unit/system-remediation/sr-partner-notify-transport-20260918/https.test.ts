import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublicPartnerAddress,
  partnerNotificationHttpsFetch,
} from "../../../../apps/api/src/modules/tenant-partner/partner-notification-https";
import {
  WebhookDispatchService,
  type WebhookDispatchAttemptCommand,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const command: WebhookDispatchAttemptCommand = {
  url: "https://partner.example.test/notify",
  deliveryId: "delivery-1",
  eventType: "passenger.receipt_ready.v1",
  tenantId: "tenant-1",
  secretValue: "secret",
  secretVersion: 1,
  payload: { deliveryId: "delivery-1" },
  attempt: 1,
  retryPolicy: {
    maxAttempts: 5,
    initialBackoffSeconds: 30,
    backoffMultiplier: 2,
    maxBackoffSeconds: 300,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  partnerAckV1: {
    mode: "partner_ack_v1",
    expected: {
      notificationId: "notification-1",
      deliveryId: "delivery-1",
      partnerEntrySlug: "entry-1",
    },
  },
};
afterEach(() => vi.useRealTimers());
describe("partner HTTPS restrictions", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.2",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::1",
  ])("rejects nonpublic %s", (address) =>
    expect(isPublicPartnerAddress(address)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public %s",
    (address) => expect(isPublicPartnerAddress(address)).toBe(true),
  );
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1",
    "https://[::1]",
  ])("rejects unsafe endpoint %s before opening a socket", async (url) => {
    await expect(partnerNotificationHttpsFetch(url)).rejects.toThrow(
      "partner_endpoint_not_public_https",
    );
  });
  it("ack body shares the platform deadline even when the reader ignores abort", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: () => new Promise<string>(() => {}),
    }));
    const delivery = new WebhookDispatchService(fetch, 60_000).dispatchAttempt(
      command,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await delivery).toMatchObject({
      status: "queued",
      nextAttemptAt: expect.any(String),
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toBeDefined();
  });
});
