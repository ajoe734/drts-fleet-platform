import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import type { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import type { PassengerPushTransportRequest } from "../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import {
  notificationExpiresAt,
  PartnerNotificationTransport,
} from "../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import type { PartnerNotificationDispatchFacade } from "../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import type { FirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
const source = process.env.PAX_PAYMENT_FIRST_PARTY_TRANSPORT_SOURCE;
const {
  FirstPartyNotificationTransport,
}: typeof import("../../../apps/api/src/modules/multi-taxi/first-party-notification.transport") =
  source
    ? await import(source)
    : await import("../../../apps/api/src/modules/multi-taxi/first-party-notification.transport");

const ORDER = "00000000-0000-4000-8000-000000000051";
const SUBJECT = "synthetic_notice_subject";
const OWNER = "synthetic_notice_owner";
const NOW = new Date("2026-10-11T12:00:00Z");
const EXPIRY = "2026-10-11T13:00:00.000Z"; // Explicit synthetic expiry only.

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
  const state = {
    eligible: true,
    token: "synthetic_device_token" as string | null,
    fault: "",
    owner: OWNER,
    late: () => {},
  };
  let stored: Record<string, unknown> | null = null;
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  // Formal production repository SQL runs against synthetic external replies;
  // this is not a PG join/constraint/race or rollback engine.
  const query = vi.fn(async (sql: string, raw?: readonly unknown[]) => {
    const params = raw ?? [];
    calls.push({ sql, params });
    if (state.fault && sql.includes(state.fault))
      throw new Error("synthetic_private_persistence_error");
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("AS fence_valid"))
      rows = [{ fence_valid: true, token: state.token }];
    else if (
      sql.includes(
        "FROM mobility.phase1_first_party_notification_delivery_contexts",
      )
    )
      rows = stored ? [stored] : [];
    else if (
      sql.includes("FROM mobility.phase1_order_first_party_notification_routes")
    )
      rows = [
        {
          order_id: ORDER,
          tenant_id: "synthetic_captured_tenant",
          drts_passenger_id: state.owner,
          passenger_subject_ref: SUBJECT,
          app_id: "synthetic_captured_app",
          notification_policy_version: "first_party_notification_v1",
          consent_version: "synthetic_consent",
          ride_ref: "synthetic_ride",
          created_at: NOW,
        },
      ];
    else if (sql.includes("FROM passenger.payment_charge_records c"))
      rows = state.eligible ? [{ order_id: ORDER }] : [];
    else if (sql.includes("FROM ops.phase1_owned_orders o"))
      rows = [{ status: "completed", assignment_version: 0 }];
    else if (
      sql.includes("SELECT outbox_id FROM ops.consumer_notification_outbox")
    )
      rows = [{ outbox_id: "synthetic_notice_outbox" }];
    else if (
      sql.includes("SELECT fence_token FROM ops.phase1_push_delivery_claims")
    )
      rows = [{ fence_token: 1 }];
    else if (
      sql.includes(
        "INSERT INTO mobility.phase1_first_party_notification_delivery_contexts",
      )
    )
      stored = {
        outbox_id: params[0],
        order_id: params[1],
        tenant_id: params[2],
        route_snapshot: JSON.parse(String(params[3])),
        target_devices: JSON.parse(String(params[4])),
        wire_message: JSON.parse(String(params[5])),
        wire_message_hash: params[6],
        event_sequence: params[7],
        expires_at: params[8],
        retry_policy_snapshot: JSON.parse(String(params[9])),
        device_outcomes: [],
        delivery_target: "first_party_device",
        created_at: NOW,
        delivered_at: null,
      };
    return { rows, rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const repository = new MultiTaxiRepository({
    isEnabled: () => true,
    query,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseService);
  const devices = {
    resolveActiveDevices: vi
      .fn()
      .mockResolvedValue([
        {
          deviceId: "synthetic_device",
          tokenSha256: "synthetic_hash",
          appId: "synthetic_captured_app",
        },
      ]),
    invalidateDevice: vi.fn(),
  };
  const provider: FirstPartyPushProvider = {
    isConfigured: () => true,
    send: vi.fn(async (_wire, _target, validate) => {
      state.late();
      if (!(await validate(new AbortController().signal)))
        return { kind: "ineligible" };
      return { kind: "accepted", messageId: "synthetic_provider_ack" };
    }),
  };
  const transport = new FirstPartyNotificationTransport(
    repository,
    devices as unknown as PassengerPushDevicesService,
    provider,
  );
  const request: PassengerPushTransportRequest = {
    providerName: "first_party_app",
    message: {
      outboxId: "synthetic_notice_outbox",
      orderId: ORDER,
      passengerSubjectRef: SUBJECT,
      eventType: "payment_recovery_required",
      assignmentVersion: null,
      attemptCount: 1,
      createdAt: NOW.toISOString(),
      payload: { eventSequence: 1, expiresAt: EXPIRY },
    },
    context: { fenceToken: 1 },
  };
  return {
    state,
    calls,
    repository,
    provider,
    devices,
    transport,
    request,
    client,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("real first-party payment recovery transport and repository", () => {
  it("sends completed unpaid owner notice with explicit persisted expiry through real repository and late guards", async () => {
    const f = fixture();
    const result = await f.transport.send(f.request);
    expect(result.providerMessageRef).toBe("synthetic_provider_ack");
    expect(result.deliveryContext.wireMessage.data).toEqual({
      notification_id: "synthetic_notice_outbox",
      event: "passenger.payment_recovery_required.v1",
      ride_ref: "synthetic_ride",
      event_sequence: "1",
      expires_at: EXPIRY,
    });
    expect(
      f.calls.filter((c) =>
        c.sql.includes("FROM passenger.payment_charge_records c"),
      ).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      f.calls.find((c) =>
        c.sql.includes("FROM passenger.payment_charge_records c"),
      )?.params,
    ).toEqual([ORDER, SUBJECT]);
    expect(JSON.stringify(result)).not.toContain("synthetic_device_token");
    expect(result.deliveryContext.routeSnapshot.drtsPassengerId).toBe(OWNER);
    expect(JSON.stringify(result.deliveryContext.wireMessage)).not.toContain(
      OWNER,
    );
  });

  it.each([undefined, "", "synthetic_invalid_expiry", "2026-10-11T11:00:00Z"])(
    "refuses missing/invalid/obsolete explicit expiry %s before provider",
    async (expiry) => {
      const f = fixture();
      f.request.message.payload.expiresAt = expiry;
      await expect(f.transport.send(f.request)).rejects.toMatchObject({
        failure: { failureReason: "notification_expired" },
      });
      expect(f.provider.send).not.toHaveBeenCalled();
    },
  );

  it("refuses no-longer-relevant/paid/refunded/foreign/ambiguous SQL result before credentials or device IO", async () => {
    const f = fixture();
    f.state.eligible = false;
    await expect(f.transport.send(f.request)).rejects.toMatchObject({
      failure: { failureReason: "notification_obsolete" },
    });
    expect(f.devices.resolveActiveDevices).not.toHaveBeenCalled();
    expect(f.provider.send).not.toHaveBeenCalled();
  });

  it.each(["paid", "owner", "device"])(
    "late %s revocation cannot become accepted",
    async (kind) => {
      const f = fixture();
      f.state.late = () => {
        if (kind === "paid") f.state.eligible = false;
        if (kind === "owner") f.state.owner = "synthetic_other_owner";
        if (kind === "device") f.state.token = null;
      };
      await expect(f.transport.send(f.request)).rejects.toMatchObject({
        failure: {
          failureReason:
            kind === "paid"
              ? "notification_obsolete"
              : kind === "owner"
                ? "owner_changed"
                : "no_active_device",
        },
      });
    },
  );

  it("preserves a relevance persistence failure instead of claiming delivery", async () => {
    const f = fixture();
    f.state.fault = "FROM passenger.payment_charge_records c";
    await expect(f.transport.send(f.request)).rejects.toThrow(
      "synthetic_private_persistence_error",
    );
    expect(f.provider.send).not.toHaveBeenCalled();
  });

  it("never exposes a first-party payment event through partner dispatch", async () => {
    const f = fixture();
    const facade = {
      resolveNotificationRoute: vi.fn(),
      dispatchNotificationAttemptByWebhookId: vi.fn(),
    };
    const partner = new PartnerNotificationTransport(
      f.repository,
      facade as unknown as PartnerNotificationDispatchFacade,
    );
    await expect(partner.isAvailableFor(f.request.message)).resolves.toBe(
      false,
    );
    await expect(partner.send(f.request)).rejects.toMatchObject({
      failure: { failureReason: "configuration_blocked" },
    });
    expect(facade.resolveNotificationRoute).not.toHaveBeenCalled();
    expect(
      facade.dispatchNotificationAttemptByWebhookId,
    ).not.toHaveBeenCalled();
    expect(notificationExpiresAt(f.request.message)).toBe(EXPIRY);
  });
});
