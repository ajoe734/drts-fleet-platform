import { describe, expect, it, vi } from "vitest";
import {
  MultiTaxiRepository,
  type RecordPushDeliveryOutcomeInput,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

function input(): RecordPushDeliveryOutcomeInput {
  return {
    outboxId: "notification-1",
    passengerSubjectRef: "subject-1",
    fenceToken: 3,
    providerName: "partner_webhook",
    providerAckState: "provider_acknowledged",
    providerMessageRef: "partner-real-receipt",
    deliveryOutcome: {
      outboxId: "notification-1",
      status: "delivered",
      result: "delivered",
      attemptCount: 2,
      nextAttemptAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
      providerName: "partner_webhook",
    },
    partnerMetadata: {
      deliveryTarget: "partner_endpoint",
      deliveryStage: "partner_accepted",
      retryDisposition: "none",
      failureReason: null,
      receiptId: "partner-real-receipt",
      downstreamStatus: "unknown",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
}

function harness(
  options: { fence?: number; fail?: string; leaseExpired?: boolean } = {},
) {
  const query = vi.fn(async (sql: string) => {
    if (options.fail && sql.includes(options.fail))
      throw new Error("write failed");
    if (sql.includes("SELECT fence_token"))
      return {
        rows: options.leaseExpired ? [] : [{ fence_token: options.fence ?? 3 }],
      };
    if (sql.includes("INSERT INTO ops.phase1_push_delivery_receipts"))
      return { rows: [{ receipt_id: "db-receipt-id" }] };
    return { rows: [] };
  });
  const release = vi.fn();
  return {
    query,
    release,
    repository: new MultiTaxiRepository({
      isEnabled: () => true,
      connect: async () => ({ query, release }),
    } as never),
  };
}

describe("partner outcome transaction", () => {
  it("receipt, context, outbox metadata/outcome and release all commit on the same connection", async () => {
    const h = harness();
    expect(await h.repository.recordPushDeliveryOutcome(input())).toMatchObject(
      { recorded: true },
    );
    const sql = h.query.mock.calls.map(([q]) => q);
    expect(sql[0]).toBe("BEGIN");
    expect(sql[1]).toContain("ops.consumer_notification_outbox");
    expect(sql[2]).toContain(
      "claim_state = 'claimed' AND lease_expires_at > clock_timestamp()",
    );
    expect(
      sql.some((q) =>
        q.includes(
          "UPDATE mobility.phase1_partner_notification_delivery_contexts",
        ),
      ),
    ).toBe(true);
    expect(sql.some((q) => q.includes("'{partnerNotification}'"))).toBe(true);
    expect(sql.at(-1)).toBe("COMMIT");
    expect(h.release).toHaveBeenCalledOnce();
  });
  it.each(["receipts", "delivery_contexts", "jsonb_set", "SET claim_state"])(
    "rolls back every write when %s fails",
    async (fail) => {
      const h = harness({ fail });
      await expect(
        h.repository.recordPushDeliveryOutcome(input()),
      ).rejects.toThrow("write failed");
      expect(h.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
      expect(h.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    },
  );
  it.each([{ fence: 4 }, { leaseExpired: true }])(
    "rejects stale or expired claim %o before any receipt/context write",
    async (options) => {
      const h = harness(options);
      expect(await h.repository.recordPushDeliveryOutcome(input())).toEqual({
        recorded: false,
        reason: "fence_lost",
      });
      expect(h.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(
        false,
      );
      expect(h.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    },
  );
  it("records failures through the same fence with no receipt id or accepted stage", async () => {
    const h = harness();
    const failure = input();
    failure.providerAckState = "provider_rejected";
    failure.providerMessageRef = null;
    failure.deliveryOutcome = {
      ...failure.deliveryOutcome,
      status: "failed",
      result: "provider_error",
      deliveredAt: null,
    };
    failure.partnerMetadata = {
      ...failure.partnerMetadata!,
      receiptId: null,
      deliveryStage: null,
      failureReason: "partner_ack_invalid",
      retryDisposition: "manual_only",
    };
    expect(await h.repository.recordPushDeliveryOutcome(failure)).toMatchObject(
      { recorded: true },
    );
    expect(h.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});
