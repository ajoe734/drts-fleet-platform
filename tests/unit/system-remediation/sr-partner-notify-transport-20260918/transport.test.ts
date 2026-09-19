import { afterEach, describe, expect, it, vi } from "vitest";
import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME } from "@drts/contracts";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";
import { harness } from "./transport-harness";
import { MultiTaxiModule } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import {
  PassengerPushClaimConflictError,
  PassengerPushPersistenceUnknownError,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PartnerNotificationTransport } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import {
  PASSENGER_DEVICE_RESOLVER,
  PASSENGER_PUSH_TRANSPORT,
  PASSENGER_PUSH_ADAPTER_CONFIG,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";

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
