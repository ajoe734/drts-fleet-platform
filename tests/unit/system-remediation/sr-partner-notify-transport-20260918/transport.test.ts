import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerNotificationOutboxRecord,
  OrderPartnerNotificationRoute,
  PartnerEntryNotificationBinding,
} from "@drts/contracts";
import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MultiTaxiModule } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import {
  MultiTaxiService,
  PassengerPushClaimConflictError,
  PassengerPushPersistenceUnknownError,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  MultiTaxiRepository,
  type RecordPushDeliveryOutcomeInput,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PartnerNotificationTransport } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import type { StoredPartnerNotificationContext } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.types";
import {
  PassengerPushAdapter,
  PASSENGER_DEVICE_RESOLVER,
  PASSENGER_PUSH_TRANSPORT,
  PASSENGER_PUSH_ADAPTER_CONFIG,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  WebhookDispatchService,
  type WebhookFetchResponse,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

function harness() {
  const now = new Date().toISOString();
  const row: ConsumerNotificationOutboxRecord = {
    outboxId: "outbox-1",
    orderId: "order-1",
    passengerSubjectRef: "subject-1",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: {
      eventSequence: 7,
      driverId: "SECRET",
      phone: "SECRET",
      accessToken: "SECRET",
    },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    deliveredAt: null,
  };
  const route: OrderPartnerNotificationRoute = {
    orderId: row.orderId,
    passengerSubjectRef: row.passengerSubjectRef,
    tenantId: "tenant-demo-001",
    partnerId: "partner-1",
    entrySlug: "entry-1",
    partnerUserRef: "opaque-user-1",
    drtsPassengerId: "passenger-1",
    identityLinkedAt: now,
    consentBundleVersion: "v1",
    notificationPolicyVersion: "partner_notification_v1",
    rideRef: "ride-1",
    createdAt: now,
  };
  const received = new Map<string, string>();
  const fetch = vi.fn(
    async (_url: string, init?: RequestInit): Promise<WebhookFetchResponse> => {
      const body = JSON.parse(String(init?.body));
      const duplicate = received.has(body.delivery_id);
      const receipt =
        received.get(body.delivery_id) ?? "real-partner-receipt-42";
      received.set(body.delivery_id, receipt);
      return {
        ok: true,
        status: 202,
        text: async () =>
          JSON.stringify({
            notification_id: body.data.notification_id,
            delivery_id: body.delivery_id,
            partner_entry_slug: body.data.partner_entry_slug,
            status: duplicate ? "duplicate" : "accepted",
            receipt_id: receipt,
          }),
      };
    },
  );
  const tenant = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    new WebhookDispatchService(fetch),
  );
  const endpoint = tenant.createWebhookEndpoint(route.tenantId, {
    url: "https://partner.example.test/notification",
    secret: "unit-test-secret",
    events: Object.values(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME),
  });
  tenant.updateWebhookEndpoint(route.tenantId, endpoint.webhookId, {
    status: "active",
  });
  const activeEndpoint = tenant.findNotificationWebhookEndpoint(
    route.tenantId,
    endpoint.webhookId,
  )!;
  const entry = {
    entrySlug: route.entrySlug,
    tenantId: route.tenantId,
    partnerId: route.partnerId,
    activeFlag: true,
  };
  vi.spyOn(tenant, "getPartnerEntry").mockImplementation(() => entry as never);
  const binding: PartnerEntryNotificationBinding = {
    bindingId: "binding-1",
    entrySlug: route.entrySlug,
    tenantId: route.tenantId,
    partnerId: route.partnerId,
    webhookId: endpoint.webhookId,
    version: 1,
    state: "ready",
    purpose: "passenger_notification",
    eventTypes: Object.keys(
      PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
    ) as PartnerEntryNotificationBinding["eventTypes"],
    schemaVersion: "1.0",
    acknowledgementPolicy: "durable_partner_acceptance_v1",
    validatedEndpointFingerprint: computeEndpointFingerprint(activeEndpoint),
    validatedAt: now,
    updatedAt: now,
  };
  const bindings = {
    findByEntrySlug: vi.fn(
      async () => binding as PartnerEntryNotificationBinding | null,
    ),
  };
  const link = { status: "active", drtsPassengerId: route.drtsPassengerId };
  const identities = { find: vi.fn(async () => link) };
  const facade = new PartnerNotificationDispatchFacade(
    tenant,
    bindings as never,
    identities as never,
  );
  const dispatch = vi.spyOn(facade, "dispatchNotificationAttemptByWebhookId");
  let stored: StoredPartnerNotificationContext | null = null;
  let fence = 0;
  let leasedUntil = 0;
  const relevance = { status: "assigned", assignmentVersion: 1 };
  const repository = {
    isEnabled: () => true,
    findOrderPartnerNotificationRoute: vi.fn(
      async () => route as OrderPartnerNotificationRoute | null,
    ),
    findPartnerNotificationContext: vi.fn(
      async () => stored && structuredClone(stored),
    ),
    findPartnerNotificationRelevance: vi.fn(async () => relevance),
    preparePartnerNotificationContext: vi.fn(
      async (context: StoredPartnerNotificationContext) => {
        stored ??= structuredClone(context);
        return structuredClone(stored);
      },
    ),
    claimPartnerNotification: vi.fn(async () => {
      const metadata = row.payload.partnerNotification as
        | { retryDisposition?: string }
        | undefined;
      if (
        leasedUntil > Date.now() ||
        row.status === "delivered" ||
        Date.parse(row.nextAttemptAt) > Date.now() ||
        (metadata?.retryDisposition &&
          metadata.retryDisposition !== "automatic")
      )
        return null;
      fence += 1;
      leasedUntil = Date.now() + 120_000;
      row.attemptCount += 1;
      row.status = "sending";
      return { record: structuredClone(row), fenceToken: fence };
    }),
    recordPushDeliveryOutcome: vi.fn(
      async (input: RecordPushDeliveryOutcomeInput) => {
        if (input.fenceToken !== fence || leasedUntil <= Date.now())
          return { recorded: false, reason: "fence_lost" };
        Object.assign(row, input.deliveryOutcome);
        row.payload.partnerNotification = input.partnerMetadata;
        if (stored)
          Object.assign(stored, input.partnerMetadata, {
            deliveredAt: input.deliveryOutcome.deliveredAt,
          });
        leasedUntil = 0;
        return { recorded: true, replayed: false };
      },
    ),
  };
  const transport = new PartnerNotificationTransport(
    repository as unknown as MultiTaxiRepository,
    facade,
  );
  const resolver = {
    resolveDevice: vi.fn(() => {
      throw new Error("device resolver must not run");
    }),
  };
  const adapter = new PassengerPushAdapter(
    { transportMode: "partner_webhook" },
    transport,
    resolver,
  );
  const service = new MultiTaxiService(
    {} as never,
    repository as never,
    undefined,
    undefined,
    undefined,
    adapter,
  );
  return {
    row,
    route,
    binding,
    bindings,
    link,
    entry,
    relevance,
    facade,
    dispatch,
    fetch,
    received,
    repository,
    resolver,
    adapter,
    service,
    tenant,
    getContext: () => stored,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("partner transport and consumer retry owner", () => {
  it("DI chooses partner mode and removes WebPush/device resolver providers", () => {
    const providers = Reflect.getMetadata("providers", MultiTaxiModule) as {
      provide?: unknown;
      useExisting?: unknown;
      useValue?: unknown;
    }[];
    expect(
      providers.find((p) => p.provide === PASSENGER_PUSH_TRANSPORT)
        ?.useExisting,
    ).toBe(PartnerNotificationTransport);
    expect(
      providers.find((p) => p.provide === PASSENGER_PUSH_ADAPTER_CONFIG)
        ?.useValue,
    ).toMatchObject({ transportMode: "partner_webhook" });
    expect(providers.some((p) => p.provide === PASSENGER_DEVICE_RESOLVER)).toBe(
      false,
    );
  });

  it("requires route readiness; missing binding never claims availability or uses legacy fallback", async () => {
    const h = harness();
    expect(h.adapter.isAvailable()).toBe(false);
    expect(await h.adapter.isAvailableFor(h.row)).toBe(true);
    h.bindings.findByEntrySlug.mockResolvedValue(null);
    expect(await h.adapter.isAvailableFor(h.row)).toBe(false);
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      result: "provider_not_configured",
      retryDisposition: "configuration_blocked",
      failureReason: "configuration_blocked",
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.resolver.resolveDevice).not.toHaveBeenCalled();
  });

  it("persists context before one HTTP attempt, allowlists fields, and records only the real receipt", async () => {
    const h = harness();
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      result: "delivered",
      deliveryStage: "partner_accepted",
      downstreamStatus: "unknown",
      receiptId: "real-partner-receipt-42",
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(
      h.repository.preparePartnerNotificationContext.mock
        .invocationCallOrder[0],
    ).toBeLessThan(h.fetch.mock.invocationCallOrder[0]!);
    const wire = String(h.fetch.mock.calls[0]![1]?.body);
    expect(wire).not.toContain("SECRET");
    expect(wire).not.toContain("subject-1");
    expect(JSON.parse(wire).data).toMatchObject({
      event_sequence: 7,
      recipient: { partner_user_ref: "opaque-user-1" },
      navigation: { type: "ride", ride_ref: "ride-1" },
    });
    expect(h.repository.recordPushDeliveryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageRef: "real-partner-receipt-42",
        partnerMetadata: expect.objectContaining({
          deliveryStage: "partner_accepted",
        }),
      }),
    );
  });

  it("partner enqueues then times out: retries identical bytes and accepts its duplicate receipt", async () => {
    vi.useFakeTimers();
    const h = harness();
    const normal = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementationOnce(async (...args) => {
      await normal(...args);
      throw new Error("connection timed out after durable enqueue");
    });
    const first = await h.service.deliverPassengerNotification(h.row);
    expect(first).toMatchObject({
      result: "provider_error",
      retryDisposition: "automatic",
      attemptCount: 1,
    });
    await vi.advanceTimersByTimeAsync(
      Date.parse(first.nextAttemptAt) - Date.now(),
    );
    const second = await h.service.deliverPassengerNotification(h.row);
    expect(second).toMatchObject({
      result: "delivered",
      receiptId: "real-partner-receipt-42",
      attemptCount: 2,
    });
    expect(h.received.size).toBe(1);
    expect(h.fetch.mock.calls[1]![1]?.body).toBe(
      h.fetch.mock.calls[0]![1]?.body,
    );
  });

  it("ack then DB failure remains unknown; lease recovery reuses the delivery and payload", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.repository.recordPushDeliveryOutcome.mockRejectedValueOnce(
      new Error("commit unavailable"),
    );
    await expect(h.service.deliverPassengerNotification(h.row)).rejects.toThrow(
      PassengerPushPersistenceUnknownError,
    );
    expect(h.row.status).toBe("sending");
    expect(h.getContext()?.receiptId).toBeNull();
    await vi.advanceTimersByTimeAsync(120_001);
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      result: "delivered",
      attemptCount: 2,
    });
    expect(h.fetch.mock.calls[1]![1]?.body).toBe(
      h.fetch.mock.calls[0]![1]?.body,
    );
  });

  it("two workers compete: only the claim winner sends", async () => {
    const h = harness();
    const results = await Promise.allSettled([
      h.service.deliverPassengerNotification(h.row),
      h.service.deliverPassengerNotification(h.row),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("an expired lease cannot commit a returned ack", async () => {
    vi.useFakeTimers();
    const h = harness();
    const normal = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementationOnce(async (...args) => {
      const response = await normal(...args);
      vi.setSystemTime(Date.now() + 120_001);
      return response;
    });
    await expect(h.service.deliverPassengerNotification(h.row)).rejects.toThrow(
      PassengerPushPersistenceUnknownError,
    );
    expect(h.getContext()?.receiptId).toBeNull();
  });

  it("five maxAttempts means five HTTP attempts; snapshot backoff is retained and no tenant timer restarts it", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.row.eventType = "receipt_ready";
    h.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    for (let i = 1; i <= 5; i++) {
      const result = await h.service.deliverPassengerNotification(h.row);
      expect(result.attemptCount).toBe(i);
      expect(result).toMatchObject({
        retryDisposition: i === 5 ? "terminal" : "automatic",
      });
      if (i < 5)
        await vi.advanceTimersByTimeAsync(
          Date.parse(result.nextAttemptAt) - Date.now(),
        );
    }
    expect(h.fetch).toHaveBeenCalledTimes(5);
    await expect(h.service.deliverPassengerNotification(h.row)).rejects.toThrow(
      PassengerPushClaimConflictError,
    );
    const restart = h.tenant as unknown as {
      schedulePersistedWebhookRetries(): void;
      retryTimers: Map<string, unknown>;
    };
    restart.schedulePersistedWebhookRetries();
    await vi.advanceTimersByTimeAsync(1_000_000);
    expect(h.fetch).toHaveBeenCalledTimes(5);
    expect(restart.retryTimers.size).toBe(0);
  });

  it.each([
    [
      "expiresAt",
      "notification_expired",
      (h: ReturnType<typeof harness>) => {
        h.row.payload.expiresAt = new Date(Date.now() - 1).toISOString();
      },
    ],
    [
      "old ETA after reassignment",
      "notification_superseded",
      (h: ReturnType<typeof harness>) => {
        h.row.eventType = "eta_changed";
        h.relevance.assignmentVersion = 2;
      },
    ],
    [
      "old arrival after cancellation",
      "notification_obsolete",
      (h: ReturnType<typeof harness>) => {
        h.row.eventType = "driver_arrived";
        h.relevance.status = "cancelled";
      },
    ],
    [
      "entry moved to another tenant",
      "owner_changed",
      (h: ReturnType<typeof harness>) => {
        h.entry.tenantId = "other-tenant";
      },
    ],
    [
      "identity revoked",
      "recipient_revoked",
      (h: ReturnType<typeof harness>) => {
        h.link.status = "revoked";
      },
    ],
    [
      "route missing",
      "route_missing",
      (h: ReturnType<typeof harness>) => {
        h.repository.findOrderPartnerNotificationRoute.mockResolvedValue(null);
      },
    ],
  ])("stops %s before remote IO", async (_case, reason, change) => {
    const h = harness();
    change(h);
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      failureReason: reason,
      result: "provider_error",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "credential_rejected", "configuration_blocked"],
    [403, "credential_rejected", "configuration_blocked"],
    [404, "endpoint_unavailable", "configuration_blocked"],
    [410, "endpoint_unavailable", "configuration_blocked"],
    [204, "partner_ack_invalid", "manual_only"],
    [200, "partner_ack_invalid", "manual_only"],
    [400, "provider_transient_error", "terminal"],
  ])(
    "preserves HTTP %i classification",
    async (status, failureReason, retryDisposition) => {
      const h = harness();
      h.fetch.mockResolvedValue({
        ok: Number(status) < 300,
        status: Number(status),
        text: async () => "<html>ok</html>",
      });
      expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject(
        { failureReason, retryDisposition, receiptId: null, deliveredAt: null },
      );
      expect(h.getContext()?.deliveryStage).toBeNull();
      expect(
        h.tenant
          .listWebhookDeliveriesByWebhook(h.route.tenantId, h.binding.webhookId)
          .some((delivery) => delivery.status === "delivered"),
      ).toBe(false);
    },
  );

  it("restart never schedules a pending passenger retry, and tenant manual retry is rejected", async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    await h.service.deliverPassengerNotification(h.row);
    const internal = h.tenant as unknown as {
      schedulePersistedWebhookRetries(): void;
      retryTimers: Map<string, unknown>;
    };
    internal.schedulePersistedWebhookRetries();
    expect(internal.retryTimers.size).toBe(0);
    expect(() =>
      h.tenant.retryWebhookDelivery(
        h.route.tenantId,
        h.binding.webhookId,
        h.getContext()!.deliveryId,
      ),
    ).toThrow();
  });
});

describe("immutable partner retry context", () => {
  it("policy changes cannot shorten the frozen attempt budget or replace its backoff", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.row.eventType = "receipt_ready";
    h.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    const first = await h.service.deliverPassengerNotification(h.row);
    const frozen = h.getContext()!.retryPolicySnapshot;
    const internal = h.tenant as unknown as {
      webhookEndpoints: { retryPolicy: typeof frozen }[];
    };
    internal.webhookEndpoints[0]!.retryPolicy = {
      ...frozen,
      maxAttempts: 1,
      initialBackoffSeconds: 999,
    };
    await vi.advanceTimersByTimeAsync(
      Date.parse(first.nextAttemptAt) - Date.now(),
    );
    const second = await h.service.deliverPassengerNotification(h.row);
    expect(second).toMatchObject({
      attemptCount: 2,
      retryDisposition: "automatic",
    });
    expect(Date.parse(second.nextAttemptAt) - Date.now()).toBe(
      Math.min(
        frozen.initialBackoffSeconds * frozen.backoffMultiplier,
        frozen.maxBackoffSeconds,
      ) * 1000,
    );
    expect(h.dispatch.mock.calls[1]![0].retryPolicySnapshot).toEqual(frozen);
  });

  it("changed endpoint/binding cannot silently retarget an already prepared notification", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    const first = await h.service.deliverPassengerNotification(h.row);
    const frozen = structuredClone(h.getContext());
    h.binding.webhookId = "another-webhook";
    const nextEndpoint = h.tenant.createWebhookEndpoint(h.route.tenantId, {
      url: "https://other.example.test/notify",
      secret: "secret",
      events: Object.values(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME),
    });
    h.tenant.updateWebhookEndpoint(h.route.tenantId, nextEndpoint.webhookId, {
      status: "active",
    });
    h.binding.webhookId = nextEndpoint.webhookId;
    h.binding.validatedEndpointFingerprint = computeEndpointFingerprint(
      h.tenant.findNotificationWebhookEndpoint(
        h.route.tenantId,
        nextEndpoint.webhookId,
      )!,
    );
    await vi.advanceTimersByTimeAsync(
      Date.parse(first.nextAttemptAt) - Date.now(),
    );
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      failureReason: "owner_changed",
      retryDisposition: "manual_only",
    });
    expect(h.getContext()?.wirePayload).toEqual(frozen?.wirePayload);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("deliveredAt is local ack validation time, with no route/wire data on the returned outcome", async () => {
    vi.useFakeTimers();
    const h = harness();
    const started = Date.now();
    const normal = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementationOnce(async (...args) => {
      const response = await normal(...args);
      vi.setSystemTime(started + 321);
      return response;
    });
    const result = await h.service.deliverPassengerNotification(h.row);
    expect(result.deliveredAt).toBe(new Date(started + 321).toISOString());
    expect(result).not.toHaveProperty("wirePayload");
    expect(result).not.toHaveProperty("partnerId");
  });
});
