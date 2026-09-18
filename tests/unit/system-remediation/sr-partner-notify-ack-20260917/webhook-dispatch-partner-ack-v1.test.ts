import { describe, expect, it, vi } from "vitest";

import {
  WebhookDispatchService,
  type WebhookFetchResponse,
  type WebhookRetryPolicy,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 1,
  initialBackoffSeconds: 10,
  backoffMultiplier: 2,
  maxBackoffSeconds: 60,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

const EXPECTED = {
  notificationId: "notif_abc",
  deliveryId: "wd_delivery_1",
  partnerEntrySlug: "yuhe-residence",
};

function fetchReturning(
  response: WebhookFetchResponse,
): (input: string, init?: RequestInit) => Promise<WebhookFetchResponse> {
  return vi.fn().mockResolvedValue(response);
}

function baseCommand(
  overrides: Partial<
    Parameters<WebhookDispatchService["dispatchAttempt"]>[0]
  > = {},
) {
  return {
    url: "https://partner.example.test/webhooks/passenger",
    deliveryId: EXPECTED.deliveryId,
    eventType: "passenger.assignment_disclosure_ready.v1",
    tenantId: "tenant-demo-001",
    secretValue: "whsec_test",
    secretVersion: 1,
    payload: { hello: "world" },
    attempt: 1,
    retryPolicy: RETRY_POLICY,
    ...overrides,
  };
}

describe("SR-PARTNER-NOTIFY-ACK-20260917: WebhookDispatchService partner_ack_v1", () => {
  describe("ordinary tenant webhook — status-only behavior is unchanged", () => {
    it("never calls text() when partnerAckV1 is not requested, even if the response exposes it", async () => {
      const text = vi.fn().mockResolvedValue("should never be read");
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(baseCommand());

      expect(result.status).toBe("delivered");
      expect(result.httpStatus).toBe(200);
      expect(result.partnerAckV1).toBeUndefined();
      expect(text).not.toHaveBeenCalled();
    });

    it("keeps existing retry/backoff classification for a mock that only returns { ok, status }", async () => {
      const service = new WebhookDispatchService(
        fetchReturning({ ok: false, status: 503 }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({ retryPolicy: { ...RETRY_POLICY, maxAttempts: 5 } }),
      );

      expect(result.status).toBe("queued");
      expect(result.partnerAckV1).toBeUndefined();
    });
  });

  describe("partner_ack_v1 opt-in — §7 success condition", () => {
    it("accepts a matching 200 response with status=accepted and a real receipt_id", async () => {
      const text = vi.fn().mockResolvedValue(
        JSON.stringify({
          notification_id: EXPECTED.notificationId,
          delivery_id: EXPECTED.deliveryId,
          partner_entry_slug: EXPECTED.partnerEntrySlug,
          status: "accepted",
          receipt_id: "receipt_from_partner_9f2a",
        }),
      );
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "accepted",
        ack: {
          notificationId: EXPECTED.notificationId,
          deliveryId: EXPECTED.deliveryId,
          partnerEntrySlug: EXPECTED.partnerEntrySlug,
          status: "accepted",
          receiptId: "receipt_from_partner_9f2a",
        },
      });
      // Never a synthesized receipt: it must be exactly the parsed field.
      expect(
        result.partnerAckV1?.kind === "accepted" &&
          result.partnerAckV1.ack.receiptId,
      ).not.toMatch(/^receipt-/);
    });

    it("accepts status=duplicate as a valid ack", async () => {
      const text = vi.fn().mockResolvedValue(
        JSON.stringify({
          notification_id: EXPECTED.notificationId,
          delivery_id: EXPECTED.deliveryId,
          partner_entry_slug: EXPECTED.partnerEntrySlug,
          status: "duplicate",
          receipt_id: "receipt_prior_attempt",
        }),
      );
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 201, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toMatchObject({
        kind: "accepted",
        ack: { status: "duplicate", receiptId: "receipt_prior_attempt" },
      });
    });

    it("rejects 204 even though it is a success status class", async () => {
      const text = vi.fn().mockResolvedValue("");
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 204, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "http_status_not_eligible",
      });
      expect(text).not.toHaveBeenCalled();
    });

    it("rejects an empty 200 body", async () => {
      const text = vi.fn().mockResolvedValue("");
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "empty_body",
      });
    });

    it("rejects an HTML 200 body", async () => {
      const text = vi.fn().mockResolvedValue("<html><body>ok</body></html>");
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "not_json",
      });
    });

    it("rejects a mismatched notification_id/delivery_id/partner_entry_slug", async () => {
      const text = vi.fn().mockResolvedValue(
        JSON.stringify({
          notification_id: "not-the-right-id",
          delivery_id: EXPECTED.deliveryId,
          partner_entry_slug: EXPECTED.partnerEntrySlug,
          status: "accepted",
          receipt_id: "receipt_x",
        }),
      );
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "id_mismatch",
      });
    });

    it("rejects a missing/blank receipt_id", async () => {
      const text = vi.fn().mockResolvedValue(
        JSON.stringify({
          notification_id: EXPECTED.notificationId,
          delivery_id: EXPECTED.deliveryId,
          partner_entry_slug: EXPECTED.partnerEntrySlug,
          status: "accepted",
          receipt_id: "",
        }),
      );
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "receipt_missing",
      });
    });

    it("rejects an unrecognized status value", async () => {
      const text = vi.fn().mockResolvedValue(
        JSON.stringify({
          notification_id: EXPECTED.notificationId,
          delivery_id: EXPECTED.deliveryId,
          partner_entry_slug: EXPECTED.partnerEntrySlug,
          status: "queued",
          receipt_id: "receipt_x",
        }),
      );
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "status_invalid",
      });
    });

    it("rejects a body over the 4 KiB cap", async () => {
      const oversized = JSON.stringify({
        notification_id: EXPECTED.notificationId,
        delivery_id: EXPECTED.deliveryId,
        partner_entry_slug: EXPECTED.partnerEntrySlug,
        status: "accepted",
        receipt_id: "receipt_x",
        padding: "a".repeat(5000),
      });
      const text = vi.fn().mockResolvedValue(oversized);
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "body_too_large",
      });
    });

    it("treats a response with no text() reader as invalid rather than throwing", async () => {
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200 }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "no_body_reader",
      });
    });

    it("treats a body read that throws (e.g. aborted at the deadline) as invalid, not a crash", async () => {
      const text = vi.fn().mockRejectedValue(new Error("aborted"));
      const service = new WebhookDispatchService(
        fetchReturning({ ok: true, status: 200, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "read_aborted",
      });
    });

    it("does not attempt to read a body for a non-2xx-eligible status (e.g. 500)", async () => {
      const text = vi.fn().mockResolvedValue("irrelevant");
      const service = new WebhookDispatchService(
        fetchReturning({ ok: false, status: 500, text }),
      );

      const result = await service.dispatchAttempt(
        baseCommand({
          partnerAckV1: { mode: "partner_ack_v1", expected: EXPECTED },
        }),
      );

      expect(result.partnerAckV1).toEqual({
        kind: "invalid",
        reason: "http_status_not_eligible",
      });
      expect(text).not.toHaveBeenCalled();
      // Ordinary status/httpStatus classification (§9 relies on this, not on
      // WebhookDispatchService's own queued/delivery_failed split).
      expect(result.httpStatus).toBe(500);
    });
  });
});
