import { describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { FirstPartyPushFailure } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";

const now = new Date().toISOString();
const row = {
  outboxId: "o1",
  orderId: "ord1",
  passengerSubjectRef: "subject1",
  eventType: "eta_changed",
  assignmentVersion: 1,
  payload: { eventSequence: 1 },
  createdAt: now,
  attemptCount: 1,
  nextAttemptAt: now,
  status: "sending",
} as any;
const metadata = {
  deliveryTarget: "first_party_device",
  deliveryStage: "provider_accepted",
  retryDisposition: "none",
  failureReason: null,
  expiresAt: now,
  receiptId: "projects/test/messages/real",
  deviceOutcomes: [
    {
      deviceId: "d1",
      kind: "accepted",
      messageId: "projects/test/messages/real",
      errorCode: null,
    },
  ],
};
const storedRow = {
  outbox_id: "o1",
  order_id: "ord1",
  tenant_id: "t1",
  route_snapshot: { drtsPassengerId: "p1", appId: "app1" },
  target_devices: [],
  wire_message: { data: {} },
  wire_message_hash: "hash",
  event_sequence: "1",
  expires_at: now,
  retry_policy_snapshot: { maxAttempts: 5 },
  device_outcomes: [],
  delivery_target: "first_party_device",
  delivery_stage: null,
  retry_disposition: null,
  failure_reason: null,
  receipt_id: null,
  created_at: now,
  delivered_at: null,
};
const input = {
  outboxId: "o1",
  passengerSubjectRef: "subject1",
  fenceToken: 7,
  providerName: "first_party_app",
  providerAckState: "provider_acknowledged",
  providerMessageRef: metadata.receiptId,
  firstPartyMetadata: metadata,
  deliveryOutcome: {
    outboxId: "o1",
    status: "delivered",
    attemptCount: 1,
    deliveredAt: now,
    nextAttemptAt: now,
  },
} as any;

// Only pg IO is stubbed. These test production transaction/control flow and
// bound SQL parameters, not PostgreSQL execution/schema/concurrency semantics.
function dbHarness(handler: (sql: string, params: any[]) => any) {
  const query = vi.fn(async (sql: string, params: any[] = []) => ({
    rows: handler(sql, params) ?? [],
  }));
  const release = vi.fn();
  const repo = new MultiTaxiRepository({
    isEnabled: () => true,
    query,
    connect: async () => ({ query, release }),
  } as any);
  return { repo, query, release };
}
describe("first-party production repository transactions", () => {
  it("prepares under real claim/lease authority and returns persisted winner on replay", async () => {
    const h = dbHarness((sql) =>
      sql.includes("SELECT * FROM mobility.phase1_first_party")
        ? [storedRow]
        : sql.includes("SELECT")
          ? [{ outbox_id: "o1", fence_token: 7 }]
          : [],
    );
    const candidate = {
      ...metadata,
      outboxId: "o1",
      orderId: "ord1",
      tenantId: "t1",
      routeSnapshot: { drtsPassengerId: "p1", appId: "app1" },
      targetDevices: [],
      wireMessage: {},
      wireMessageHash: "new-hash",
      eventSequence: 1,
      retryPolicySnapshot: { maxAttempts: 5 },
    } as any;
    const result = await h.repo.prepareFirstPartyNotificationContext(
      candidate,
      7,
    );
    expect(result.wireMessageHash).toBe("hash");
    expect(result.retryPolicySnapshot).toEqual({ maxAttempts: 5 });
    const calls = h.query.mock.calls;
    expect(calls[1]![0]).toContain("ops.consumer_notification_outbox");
    expect(calls[2]![0]).toContain("ops.phase1_push_delivery_claims");
    expect(calls[2]![0]).toContain("lease_expires_at > clock_timestamp()");
    expect(calls[2]![1]).toEqual(["o1", 7]);
    expect(calls[3]![0]).toContain("ON CONFLICT (outbox_id) DO NOTHING");
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
    expect(h.release).toHaveBeenCalledOnce();
  });
  it.each(["stale", "expired"])(
    "rejects %s fence before insertion",
    async () => {
      const h = dbHarness((sql) =>
        sql.includes("consumer_notification_outbox")
          ? [{ outbox_id: "o1" }]
          : [],
      );
      await expect(
        h.repo.prepareFirstPartyNotificationContext(
          { outboxId: "o1", orderId: "ord1" } as any,
          6,
        ),
      ).rejects.toThrow("fence lost");
      expect(h.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(
        false,
      );
      expect(h.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    },
  );
  it.each([true, false])(
    "outcome and receipt commit share valid fence=%s",
    async (valid) => {
      const h = dbHarness((sql) =>
        sql.includes("SELECT fence_token")
          ? valid
            ? [{ fence_token: 7 }]
            : []
          : sql.includes("RETURNING receipt_id")
            ? [{ receipt_id: "receipt" }]
            : [],
      );
      const result = await h.repo.recordPushDeliveryOutcome(input);
      if (!valid) {
        expect(result).toEqual({ recorded: false, reason: "fence_lost" });
        expect(
          h.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)\b/.test(sql)),
        ).toBe(false);
        return;
      }
      expect(result.recorded).toBe(true);
      const update = h.query.mock.calls.find(([sql]) =>
        sql.includes("UPDATE mobility.phase1_first_party"),
      )!;
      expect(update[1]).toEqual([
        "o1",
        "provider_accepted",
        "none",
        null,
        metadata.receiptId,
        now,
        JSON.stringify(metadata.deviceOutcomes),
      ]);
      expect(
        h.query.mock.calls.some(([sql]) =>
          sql.includes("{firstPartyNotification}"),
        ),
      ).toBe(true);
      expect(
        h.query.mock.calls.some(([sql]) =>
          sql.includes("UPDATE mobility.phase1_partner"),
        ),
      ).toBe(false);
      expect(h.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    },
  );
  it("fences immediate device lookup and binds captured hash", async () => {
    const h = dbHarness(() => [
      { fence_valid: true, token: "synthetic-token" },
    ]);
    expect(
      await h.repo.findFirstPartyNotificationDeviceToken(
        { outboxId: "o1" } as any,
        { deviceId: "d1", tokenSha256: "hash1" },
        7,
      ),
    ).toBe("synthetic-token");
    const [sql, params] = h.query.mock.calls[0]!;
    expect(params).toEqual(["o1", "d1", 7, "hash1"]);
    // Static query inspection only; hosted PG must exercise these predicates.
    for (const predicate of [
      "d.status='active'",
      'd.token_sha256=t."tokenSha256"',
      "d.drts_passenger_id=c.route_snapshot->>'drtsPassengerId'",
      "d.app_id=c.route_snapshot->>'appId'",
      "jsonb_to_recordset(c.target_devices)",
    ])
      expect(sql).toContain(predicate);
  });
  it("does not fabricate a token when the database excludes an ineligible device", async () => {
    const h = dbHarness(() => [{ fence_valid: true, token: null }]);
    expect(
      await h.repo.findFirstPartyNotificationDeviceToken(
        { outboxId: "o1" } as any,
        { deviceId: "d1", tokenSha256: "hash1" },
        7,
      ),
    ).toBeNull();
  });
  it("does not send on expired pre-send lease", async () => {
    const h = dbHarness(() => [
      { fence_valid: false, token: "synthetic-token" },
    ]);
    await expect(
      h.repo.findFirstPartyNotificationDeviceToken(
        { outboxId: "o1" } as any,
        { deviceId: "d1", tokenSha256: "hash1" },
        7,
      ),
    ).rejects.toThrow("fence lost");
  });
  it("invalidating a send result is conditional on active captured identity", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repo = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      query,
    } as any);
    await repo.invalidateDevice("d1", "provider_invalid", "captured-hash");
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("token_sha256 = $3"),
      ["d1", "provider_invalid", "captured-hash"],
    ]);
  });
  it("claim refuses persisted first-party terminal metadata", async () => {
    const h = dbHarness((sql) =>
      sql.includes("SELECT * FROM ops.consumer")
        ? [
            {
              outbox_id: "o1",
              order_id: "ord1",
              passenger_subject_ref: "s1",
              event_type: "eta_changed",
              payload: {
                firstPartyNotification: { retryDisposition: "terminal" },
              },
              status: "failed",
              attempt_count: 1,
              created_at: now,
              next_attempt_at: now,
            },
          ]
        : [],
    );
    expect(
      await h.repo.claimPartnerNotification("o1", "worker", 120),
    ).toBeNull();
    expect(
      h.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO ops.phase1_push_delivery_claims"),
      ),
    ).toBe(false);
  });
});

describe("first-party production service routing and outcome", () => {
  it.each([
    "accepted",
    "no_active_device",
    "provider_transient_error",
    "configuration_blocked",
  ])("persists %s through firstPartyMetadata only", async (scenario) => {
    const disposition =
      scenario === "configuration_blocked"
        ? "configuration_blocked"
        : scenario === "provider_transient_error"
          ? "automatic"
          : "terminal";
    const send = vi.fn(async () => {
      if (scenario !== "accepted")
        throw new FirstPartyPushFailure(
          {
            failureReason: scenario as any,
            retryDisposition: disposition,
            suggestedNextAttemptAt: null,
          },
          { ...metadata, deliveryStage: null } as any,
        );
      return {
        providerName: "first_party_app",
        providerMessageRef: metadata.receiptId,
        deliveredAt: now,
        deliveryContext: metadata,
      };
    });
    const repo = {
      resolvePassengerNotificationChannel: vi.fn(async () => ({
        channel: "first_party_app",
      })),
      claimPartnerNotification: vi.fn(async () => ({
        record: row,
        fenceToken: 7,
      })),
      recordPushDeliveryOutcome: vi
        .fn<(input: any) => Promise<{ recorded: boolean }>>()
        .mockResolvedValue({ recorded: true }),
    };
    const partnerSend = vi.fn();
    const service = new MultiTaxiService(
      {} as any,
      repo as any,
      undefined,
      undefined,
      undefined,
      { transportMode: "partner_webhook", send: partnerSend } as any,
      undefined,
      undefined,
      undefined,
      { send } as any,
    );
    const result = await service.deliverPassengerNotification(row);
    const saved: any = repo.recordPushDeliveryOutcome.mock.calls[0]![0];
    expect(saved.firstPartyMetadata.deviceOutcomes).toEqual(
      metadata.deviceOutcomes,
    );
    expect(saved.partnerMetadata).toBeUndefined();
    expect(partnerSend).not.toHaveBeenCalled();
    expect(result.result).toBe(
      scenario === "accepted"
        ? "delivered"
        : scenario === "configuration_blocked"
          ? "provider_not_configured"
          : "provider_error",
    );
  });
});
