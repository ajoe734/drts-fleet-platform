import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { GoogleMetadataTokens } from "../../../apps/api/src/common/google-cloud/google-cloud-object-client";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";
import {
  FirstPartyNotificationTransport,
  FirstPartyPushFailure,
} from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";

const deviceId = "00000000-0000-4000-8000-000000000001";
const token = "synthetic-captured-device-token";
const hash = createHash("sha256").update(token).digest("hex");
const name = "projects/test-project/messages/late-io";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Only database rows and HTTP responses are synthetic. Actual repository mapping,
// transport validation, metadata parsing and FCM provider all execute. No SQL
// predicates are reimplemented: eligibility rows model PG's boundary result;
// formal-schema predicate/locking behavior still requires hosted PG acceptance.
function harness(eventType = "driver_arrived") {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 120000).toISOString();
  const route = {
    order_id: "order1",
    tenant_id: "tenant1",
    drts_passenger_id: "passenger1",
    passenger_subject_ref: "subject1",
    app_id: "app1",
    ride_ref: "ride1",
    notification_policy_version: "first_party_v1",
    consent_version: "v1",
    created_at: now,
  };
  const stored = {
    outbox_id: "outbox1",
    order_id: "order1",
    tenant_id: "tenant1",
    route_snapshot: {
      orderId: "order1",
      tenantId: "tenant1",
      drtsPassengerId: "passenger1",
      passengerSubjectRef: "subject1",
      appId: "app1",
      rideRef: "ride1",
    },
    target_devices: [{ deviceId, tokenSha256: hash }],
    device_outcomes: [],
    wire_message: {
      notification: { title: "乘車通知", body: "請查看最新乘車資訊" },
      data: {
        notification_id: "outbox1",
        event: `passenger.${eventType}.v1`,
        ride_ref: "ride1",
        event_sequence: "1",
        expires_at: expiresAt,
      },
    },
    wire_message_hash: "captured-wire-hash",
    event_sequence: 1,
    expires_at: expiresAt,
    retry_policy_snapshot: {
      maxAttempts: 5,
      initialDelaySeconds: 30,
      backoffMultiplier: 2,
      maxDelaySeconds: 600,
    },
    delivery_target: "first_party_device",
    delivery_stage: null,
    retry_disposition: null,
    failure_reason: null,
    receipt_id: null,
    created_at: now,
    delivered_at: null,
  };
  const state = {
    route: route as typeof route | null,
    relevance: { status: "active", assignment_version: 1 },
    eligibility: { fence_valid: true, token: token as string | null },
  };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    void params;
    if (sql.includes("AS fence_valid"))
      return { rows: [{ ...state.eligibility }] };
    if (sql.includes("SELECT * FROM mobility.phase1_first_party"))
      return { rows: [structuredClone(stored)] };
    if (sql.includes("FROM mobility.phase1_order_first_party"))
      return { rows: state.route ? [{ ...state.route }] : [] };
    if (sql.includes("FROM ops.phase1_owned_orders"))
      return { rows: [{ ...state.relevance }] };
    throw new Error("Unexpected database operation");
  });
  const repository = new MultiTaxiRepository({
    isEnabled: () => true,
    query,
  } as any);
  const reachedMetadata = deferred<void>();
  const metadataResponse = deferred<void>();
  const metadataFetch = vi.fn(async () => {
    reachedMetadata.resolve();
    await metadataResponse.promise;
    return Response.json(
      {
        token_type: "Bearer",
        access_token: "synthetic-access-token",
        expires_in: 3600,
      },
      { headers: { "Metadata-Flavor": "Google" } },
    );
  });
  const fcmFetch = vi.fn(async () => Response.json({ name }));
  const provider = new FcmFirstPartyPushProvider(
    new GoogleMetadataTokens(metadataFetch),
    fcmFetch,
  );
  const devices = { resolveActiveDevices: vi.fn(), invalidateDevice: vi.fn() };
  const transport = new FirstPartyNotificationTransport(
    repository,
    devices as any,
    provider,
  );
  const request = {
    providerName: "first_party_app",
    message: {
      outboxId: "outbox1",
      orderId: "order1",
      passengerSubjectRef: "subject1",
      eventType,
      assignmentVersion: 1,
      payload: { eventSequence: 1 },
      createdAt: now,
      attemptCount: 1,
    },
    context: { fenceToken: 7 },
  } as any;
  const release = () => metadataResponse.resolve();
  return {
    stored,
    transport,
    request,
    reachedMetadata,
    release,
    state,
    query,
    fcmFetch,
    metadataFetch,
    devices,
  };
}

describe("actual metadata-await late I/O boundary", () => {
  beforeEach(() => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "test-project");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Real network prohibited");
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    "revoked",
    "rotated/hash mismatch",
    "rebound passenger",
    "rebound app",
    "60-day ineligible",
  ])("does not POST when PG excludes %s during metadata await", async () => {
    const h = harness();
    const pending = h.transport.send(h.request).catch((e: unknown) => e);
    await h.reachedMetadata.promise;
    h.state.eligibility.token = null;
    h.release();
    const result = await pending;
    expect(h.fcmFetch).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(FirstPartyPushFailure);
    expect(result).toMatchObject({
      failure: {
        failureReason: "no_active_device",
        retryDisposition: "terminal",
      },
    });
    expect(h.devices.resolveActiveDevices).not.toHaveBeenCalled();
    expect(h.devices.invalidateDevice).not.toHaveBeenCalled();
    expect(
      h.query.mock.calls
        .filter(([sql]) => sql.includes("AS fence_valid"))
        .map(([, params]) => params),
    ).toEqual([
      ["outbox1", deviceId, 7, hash],
      ["outbox1", deviceId, 7, hash],
    ]);
  });
  it.each([
    ["cancelled", 1, "notification_obsolete"],
    ["active", 2, "notification_superseded"],
  ])(
    "preserves typed %s/%s rejection and context",
    async (status, version, reason) => {
      const h = harness();
      const pending = h.transport.send(h.request).catch((e: unknown) => e);
      await h.reachedMetadata.promise;
      h.state.relevance = { status, assignment_version: version };
      h.release();
      const result = await pending;
      expect(h.fcmFetch).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(FirstPartyPushFailure);
      expect(result).toMatchObject({
        failure: { failureReason: reason, retryDisposition: "terminal" },
        deliveryContext: { outboxId: "outbox1" },
      });
      expect(JSON.stringify(result)).not.toContain(token);
    },
  );
  it.each([
    "tenant_id",
    "drts_passenger_id",
    "passenger_subject_ref",
    "app_id",
    "ride_ref",
  ] as const)(
    "rejects changed route %s during metadata await",
    async (field) => {
      const h = harness();
      const pending = h.transport.send(h.request).catch((e: unknown) => e);
      await h.reachedMetadata.promise;
      h.state.route![field] = "changed";
      h.release();
      expect(await pending).toMatchObject({
        failure: { failureReason: "owner_changed" },
      });
      expect(h.fcmFetch).not.toHaveBeenCalled();
    },
  );
  it("preserves repository fence loss instead of classifying it as a provider retry", async () => {
    const h = harness();
    const pending = h.transport.send(h.request).catch((e: unknown) => e);
    await h.reachedMetadata.promise;
    h.state.eligibility.fence_valid = false;
    h.release();
    const result = await pending;
    expect(h.fcmFetch).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(FirstPartyPushFailure);
    expect((result as Error).message).toContain("fence lost");
  });
  it.each(["driver_arrived", "trip_cancelled", "receipt_ready"])(
    "sends current %s with legal relevance exemptions",
    async (event) => {
      const h = harness(event);
      const pending = h.transport.send(h.request);
      await h.reachedMetadata.promise;
      if (event !== "driver_arrived")
        h.state.relevance = { status: "cancelled", assignment_version: 2 };
      h.release();
      expect(await pending).toMatchObject({
        providerMessageRef: name,
        deliveryContext: { deliveryStage: "provider_accepted" },
      });
      expect(h.fcmFetch).toHaveBeenCalledTimes(1);
      expect(h.devices.resolveActiveDevices).not.toHaveBeenCalled();
    },
  );
  it("does not replace the captured token if a lookup returns another token", async () => {
    const h = harness();
    const pending = h.transport.send(h.request).catch((e: unknown) => e);
    await h.reachedMetadata.promise;
    h.state.eligibility.token = "synthetic-replacement-token";
    h.release();
    expect(await pending).toMatchObject({
      failure: { failureReason: "no_active_device" },
    });
    expect(h.fcmFetch).not.toHaveBeenCalled();
  });
  it("preserves route_missing with the captured context", async () => {
    const h = harness();
    const pending = h.transport.send(h.request).catch((e: unknown) => e);
    await h.reachedMetadata.promise;
    h.state.route = null;
    h.release();
    expect(await pending).toMatchObject({
      failure: { failureReason: "route_missing" },
      deliveryContext: { outboxId: "outbox1" },
    });
    expect(h.fcmFetch).not.toHaveBeenCalled();
  });
  it.each(["trip_cancelled", "receipt_ready"])(
    "%s exemption cannot bypass device eligibility",
    async (event) => {
      const h = harness(event);
      const pending = h.transport.send(h.request).catch((e: unknown) => e);
      await h.reachedMetadata.promise;
      h.state.relevance.status = "cancelled";
      h.state.eligibility.token = null;
      h.release();
      expect(await pending).toMatchObject({
        failure: { failureReason: "no_active_device" },
      });
      expect(h.fcmFetch).not.toHaveBeenCalled();
    },
  );
  it("invalidates only the captured device/hash after token rejection", async () => {
    const h = harness();
    h.fcmFetch.mockImplementation(async () => {
      h.state.eligibility.token = "synthetic-rotated-after-post";
      return Response.json(
        {
          error: {
            details: [
              {
                "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                errorCode: "UNREGISTERED",
              },
            ],
          },
        },
        { status: 404 },
      );
    });
    const pending = h.transport.send(h.request).catch((e: unknown) => e);
    await h.reachedMetadata.promise;
    h.release();
    expect(await pending).toMatchObject({
      failure: { failureReason: "no_active_device" },
    });
    expect(h.devices.invalidateDevice).toHaveBeenCalledExactlyOnceWith(
      deviceId,
      "provider_invalid",
      hash,
    );
    expect(h.fcmFetch).toHaveBeenCalledTimes(1);
  });
  it.each(["cancelled", "fence_lost"])(
    "retains correct outcome if second device becomes %s during metadata",
    async (mode) => {
      const h = harness();
      h.stored.target_devices.push({
        deviceId: "00000000-0000-4000-8000-000000000002",
        tokenSha256: hash,
      });
      const metadata = h.metadataFetch.getMockImplementation()!;
      h.metadataFetch.mockImplementation(async () => {
        if (h.metadataFetch.mock.calls.length === 2) {
          if (mode === "cancelled") h.state.relevance.status = "cancelled";
          else h.state.eligibility.fence_valid = false;
        }
        return metadata();
      });
      const pending = h.transport.send(h.request).catch((e: unknown) => e);
      await h.reachedMetadata.promise;
      h.release();
      const result = await pending;
      expect(h.fcmFetch).toHaveBeenCalledTimes(1);
      if (mode === "cancelled")
        expect(result).toMatchObject({
          providerMessageRef: name,
          deliveryContext: {
            deviceOutcomes: [{ deviceId, kind: "accepted", messageId: name }],
          },
        });
      else {
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toContain("fence lost");
      }
    },
  );
  it.each(["cancelled", "fence_lost"])(
    "service preserves %s persistence semantics after metadata await",
    async (mode) => {
      const h = harness();
      // Claim/outcome IO is synthetic; the full real send chain above remains intact.
      const recordPushDeliveryOutcome = vi.fn(async (_input: unknown) => {
        void _input;
        return { recorded: true };
      });
      const service = new MultiTaxiService(
        {} as any,
        {
          resolvePassengerNotificationChannel: async () => ({
            channel: "first_party_app",
          }),
          claimPartnerNotification: async () => ({
            record: h.request.message,
            fenceToken: 7,
          }),
          recordPushDeliveryOutcome,
        } as any,
        undefined,
        undefined,
        undefined,
        { transportMode: "partner_webhook" } as any,
        undefined,
        undefined,
        undefined,
        h.transport,
      );
      const pending = service
        .deliverPassengerNotification(h.request.message)
        .catch((e: unknown) => e);
      await h.reachedMetadata.promise;
      if (mode === "cancelled") h.state.relevance.status = "cancelled";
      else h.state.eligibility.fence_valid = false;
      h.release();
      const result = await pending;
      expect(h.fcmFetch).not.toHaveBeenCalled();
      if (mode === "cancelled") {
        expect(result).toMatchObject({
          result: "provider_error",
          failureReason: "notification_obsolete",
          retryDisposition: "terminal",
        });
        expect(recordPushDeliveryOutcome).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            fenceToken: 7,
            firstPartyMetadata: expect.objectContaining({
              failureReason: "notification_obsolete",
              deviceOutcomes: [],
            }),
          }),
        );
      } else {
        expect(result).toMatchObject({
          name: "PassengerPushPersistenceUnknownError",
        });
        expect(recordPushDeliveryOutcome).not.toHaveBeenCalled();
      }
    },
  );
});
