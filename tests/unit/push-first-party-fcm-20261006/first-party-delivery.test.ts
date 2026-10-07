// PUSH-FIRST-PARTY-FCM-20261006 — service-level orchestration:
//   push-first-party-fcm_dormant_by_default_and_privacy: disabled-by-default
//   (flag off / missing project id) makes zero HTTP calls and delegates to
//   the unchanged dormant seal; no raw token ever reaches the outbox
//   payload or the persisted delivery context.
//   push-first-party-fcm_transport_and_error_mapping: multi-device
//   accept/invalid/transient/credential_rejected scenarios, retry only
//   resending to the context's own frozen device snapshot, and the
//   obsolete/superseded relevance short-circuit (mirrors the partner path).
import { describe, expect, it, vi } from "vitest";
import type {
  ConsumerNotificationOutboxRecord,
  FirstPartyPushDeliveryContext,
  OrderFirstPartyNotificationRoute,
} from "@drts/contracts";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import type {
  FirstPartyPushProvider,
  FirstPartyPushProviderOutcome,
} from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";

const route: OrderFirstPartyNotificationRoute = {
  orderId: "order-1",
  tenantId: "tenant-1",
  drtsPassengerId: "passenger-1",
  passengerSubjectRef: "subject-1",
  appId: "app-1",
  notificationPolicyVersion: "first_party_notification_v1",
  consentVersion: "v1",
  rideRef: "ride-1",
  createdAt: new Date().toISOString(),
};

function outboxRow(
  overrides: Partial<ConsumerNotificationOutboxRecord> = {},
): ConsumerNotificationOutboxRecord {
  const now = new Date().toISOString();
  return {
    outboxId: "outbox-1",
    orderId: "order-1",
    passengerSubjectRef: "subject-1",
    eventType: "driver_arrived",
    assignmentVersion: 1,
    payload: { eventSequence: 1 },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    deliveredAt: null,
    ...overrides,
  };
}

interface DeviceTarget {
  deviceId: string;
  token: string;
  tokenSha256: string;
  active: boolean;
}

function harness(opts: {
  devices: DeviceTarget[];
  providerSend: (
    token: string,
  ) => Promise<FirstPartyPushProviderOutcome> | FirstPartyPushProviderOutcome;
  config?: { enabled: boolean; projectId: string | null };
  relevance?: { status: string; assignmentVersion: number } | null;
}) {
  const row = outboxRow();
  const contextStore = new Map<string, FirstPartyPushDeliveryContext>();
  let fence = 0;
  let leasedUntil = 0;

  const resolvePassengerNotificationChannel = vi.fn(async () => ({
    channel: "first_party_app" as const,
    route,
  }));

  const claimPartnerNotification = vi.fn(async () => {
    const metadata = row.payload.channelRouting as
      | { retryDisposition?: string }
      | undefined;
    if (
      leasedUntil > Date.now() ||
      row.status === "delivered" ||
      Date.parse(row.nextAttemptAt) > Date.now() ||
      (metadata?.retryDisposition && metadata.retryDisposition !== "automatic")
    ) {
      return null;
    }
    fence += 1;
    leasedUntil = Date.now() + 120_000;
    row.attemptCount += 1;
    row.status = "sending";
    return {
      record: structuredClone(row),
      fenceToken: fence,
      attemptLimitReached: false,
    };
  });

  const recordPushDeliveryOutcome = vi.fn(async (input: never) => {
    const typed = input as {
      fenceToken: number;
      deliveryOutcome: Partial<ConsumerNotificationOutboxRecord>;
      channelMetadata?: Record<string, unknown>;
      firstPartyMetadata?: {
        deliveryStage: string | null;
        retryDisposition: string | null;
        failureReason: string | null;
        receiptId: string | null;
      };
    };
    if (typed.fenceToken !== fence) {
      return { recorded: false, reason: "fence_lost" as const };
    }
    Object.assign(row, typed.deliveryOutcome);
    if (typed.channelMetadata) {
      row.payload = { ...row.payload, channelRouting: typed.channelMetadata };
    }
    if (typed.firstPartyMetadata) {
      const existing = contextStore.get(row.outboxId);
      if (existing) {
        contextStore.set(row.outboxId, {
          ...existing,
          deliveryStage: typed.firstPartyMetadata.deliveryStage as never,
          retryDisposition: typed.firstPartyMetadata.retryDisposition as never,
          failureReason: typed.firstPartyMetadata.failureReason as never,
          receiptId: typed.firstPartyMetadata.receiptId,
          deliveredAt: typed.deliveryOutcome.deliveredAt ?? null,
        });
      }
    }
    leasedUntil = 0;
    return { recorded: true, replayed: false };
  });

  const findPartnerNotificationRelevance = vi.fn(
    async () => opts.relevance ?? null,
  );

  const findFirstPartyNotificationContext = vi.fn(async () =>
    contextStore.get(row.outboxId) ?? null,
  );

  const prepareFirstPartyNotificationContext = vi.fn(
    async (context: FirstPartyPushDeliveryContext) => {
      if (!contextStore.has(context.outboxId)) {
        contextStore.set(context.outboxId, { ...context });
      }
      return contextStore.get(context.outboxId)!;
    },
  );

  const repository = {
    resolvePassengerNotificationChannel,
    claimPartnerNotification,
    recordPushDeliveryOutcome,
    findPartnerNotificationRelevance,
    findFirstPartyNotificationContext,
    prepareFirstPartyNotificationContext,
  };

  const resolveActiveDeviceSendTargets = vi.fn(async () =>
    opts.devices
      .filter((d) => d.active)
      .map((d) => ({ deviceId: d.deviceId, token: d.token, tokenSha256: d.tokenSha256 })),
  );
  const invalidateDevice = vi.fn(async (deviceId: string) => {
    const device = opts.devices.find((d) => d.deviceId === deviceId);
    if (device) device.active = false;
    return null;
  });
  const firstPartyPushDeviceResolver = {
    resolveActiveDevices: vi.fn(async () => []),
    resolveActiveDeviceSendTargets,
    invalidateDevice,
  };

  const sendCalls: string[] = [];
  const firstPartyPushProvider: FirstPartyPushProvider = {
    send: vi.fn(async (token: string) => {
      sendCalls.push(token);
      return opts.providerSend(token);
    }),
  };

  const firstPartyPushConfig = opts.config ?? {
    enabled: true,
    projectId: "drts-passenger-push",
  };

  // `deliverPassengerNotification` only routes through the shared
  // claim/fence resolution path when `passengerPushPort.transportMode` is
  // `"partner_webhook"` (same precedent as the router task's own harness) —
  // without it, it falls into the unrelated legacy single-transport branch.
  const passengerPushPort = {
    transportMode: "partner_webhook" as const,
    isAvailable: () => true,
    providerName: () => null,
    send: vi.fn(async () => {
      throw new Error("first-party channel must never reach the generic passengerPushPort");
    }),
  };

  const service = new MultiTaxiService(
    {} as never,
    repository as never,
    undefined,
    undefined,
    undefined,
    passengerPushPort,
    undefined,
    undefined,
    undefined,
    firstPartyPushProvider as never,
    firstPartyPushDeviceResolver as never,
    firstPartyPushConfig as never,
  );

  return {
    row,
    repository,
    service,
    devices: opts.devices,
    contextStore,
    sendCalls,
    invalidateDevice,
    resolveActiveDeviceSendTargets,
  };
}

describe("push-first-party-fcm_dormant_by_default_and_privacy", () => {
  it("flag off -> configuration_blocked, no HTTP call, no device lookup", async () => {
    const h = harness({
      devices: [],
      providerSend: () => {
        throw new Error("must never call the provider while disabled");
      },
      config: { enabled: false, projectId: "drts-passenger-push" },
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_not_configured",
      failureReason: "configuration_blocked",
      retryDisposition: "configuration_blocked",
    });
    expect(h.resolveActiveDeviceSendTargets).not.toHaveBeenCalled();
  });

  it("enabled but missing project id -> configuration_blocked, no HTTP call", async () => {
    const h = harness({
      devices: [],
      providerSend: () => {
        throw new Error("must never call the provider without a project id");
      },
      config: { enabled: true, projectId: null },
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      result: "provider_not_configured",
      failureReason: "configuration_blocked",
    });
    expect(h.resolveActiveDeviceSendTargets).not.toHaveBeenCalled();
  });

  it("no active devices -> no_active_device/terminal, no context ever created", async () => {
    const h = harness({ devices: [], providerSend: () => ({ outcome: "accepted", messageName: "x" }) });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      failureReason: "no_active_device",
      retryDisposition: "terminal",
    });
    expect(h.contextStore.size).toBe(0);
    expect(h.sendCalls).toHaveLength(0);
  });

  it("the persisted context and outbox payload never contain the raw device token", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "raw-secret-token", tokenSha256: "sha-1", active: true }],
      providerSend: () => ({ outcome: "accepted", messageName: "projects/p/messages/1" }),
    });
    await h.service.deliverPassengerNotification(h.row);
    const stored = h.contextStore.get("outbox-1")!;
    expect(JSON.stringify(stored)).not.toContain("raw-secret-token");
    expect(JSON.stringify(h.row.payload)).not.toContain("raw-secret-token");
    expect(stored.targetDevices).toEqual([{ deviceId: "d1", tokenSha256: "sha-1" }]);
  });
});

describe("push-first-party-fcm_transport_and_error_mapping", () => {
  it("one accepted device out of two -> delivered with the real FCM message name as receiptId", async () => {
    const h = harness({
      devices: [
        { deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true },
        { deviceId: "d2", token: "t2", tokenSha256: "sha-2", active: true },
      ],
      providerSend: async (token) =>
        token === "t1"
          ? { outcome: "accepted", messageName: "projects/p/messages/real-42" }
          : { outcome: "invalid" },
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "delivered",
      result: "delivered",
      deliveryTarget: "first_party_device",
      deliveryStage: "provider_accepted",
      receiptId: "projects/p/messages/real-42",
      providerName: "fcm_v1",
    });
    expect(h.devices.find((d) => d.deviceId === "d2")!.active).toBe(false);
    expect(h.devices.find((d) => d.deviceId === "d1")!.active).toBe(true);
  });

  it("every device invalid -> no_active_device/terminal and every device invalidated", async () => {
    const h = harness({
      devices: [
        { deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true },
        { deviceId: "d2", token: "t2", tokenSha256: "sha-2", active: true },
      ],
      providerSend: async () => ({ outcome: "invalid" }),
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_error",
      failureReason: "no_active_device",
      retryDisposition: "terminal",
    });
    expect(h.devices.every((d) => !d.active)).toBe(true);
    expect(h.contextStore.get("outbox-1")).toMatchObject({
      failureReason: "no_active_device",
      retryDisposition: "terminal",
    });
  });

  it("a transient provider error -> automatic retry, no device invalidated", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: async () => ({ outcome: "transient", retryAfterSeconds: null }),
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      failureReason: "provider_transient_error",
      retryDisposition: "automatic",
    });
    expect(h.devices[0]!.active).toBe(true);
    expect(h.invalidateDevice).not.toHaveBeenCalled();
  });

  it("a 429 with Retry-After pushes nextAttemptAt out by at least that many seconds", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: async () => ({ outcome: "transient", retryAfterSeconds: 120 }),
    });
    const before = Date.now();
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(Date.parse(outcome.nextAttemptAt) - before).toBeGreaterThanOrEqual(119_000);
  });

  it("credential_rejected -> configuration_blocked disposition, device left active", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: async () => ({ outcome: "credential_rejected" }),
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      failureReason: "credential_rejected",
      retryDisposition: "configuration_blocked",
    });
    expect(h.devices[0]!.active).toBe(true);
  });

  it("obsolete (order cancelled) seals terminal without ever resolving devices or calling the provider", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: () => {
        throw new Error("must never call the provider for an obsolete notification");
      },
      relevance: { status: "cancelled", assignmentVersion: 1 },
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      failureReason: "notification_obsolete",
      retryDisposition: "terminal",
    });
    expect(h.resolveActiveDeviceSendTargets).not.toHaveBeenCalled();
  });

  it("superseded (stale assignmentVersion) seals terminal the same way", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: () => {
        throw new Error("must never call the provider for a superseded notification");
      },
      relevance: { status: "assigned", assignmentVersion: 5 },
    });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      failureReason: "notification_superseded",
      retryDisposition: "terminal",
    });
  });

  it("a retry resends only to devices in the frozen context snapshot, ignoring a device registered afterward", async () => {
    const h = harness({
      devices: [{ deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true }],
      providerSend: async () => ({ outcome: "transient", retryAfterSeconds: null }),
    });
    await h.service.deliverPassengerNotification(h.row);
    // A second device registers after the context already froze d1 alone.
    h.devices.push({ deviceId: "d2", token: "t2", tokenSha256: "sha-2", active: true });
    h.row.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
    await h.service.deliverPassengerNotification(h.row);
    expect(h.sendCalls).toEqual(["t1", "t1"]);
  });

  it("a retry drops a context device that is no longer active, instead of resending to it", async () => {
    const h = harness({
      devices: [
        { deviceId: "d1", token: "t1", tokenSha256: "sha-1", active: true },
        { deviceId: "d2", token: "t2", tokenSha256: "sha-2", active: true },
      ],
      providerSend: async (token) =>
        token === "t1"
          ? { outcome: "transient", retryAfterSeconds: null }
          : { outcome: "transient", retryAfterSeconds: null },
    });
    await h.service.deliverPassengerNotification(h.row);
    expect(h.sendCalls.sort()).toEqual(["t1", "t2"]);
    h.devices.find((d) => d.deviceId === "d2")!.active = false;
    h.row.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
    await h.service.deliverPassengerNotification(h.row);
    expect(h.sendCalls).toEqual(["t1", "t2", "t1"]);
  });
});
