import "../../../apps/api/node_modules/reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  PassengerPushDevicesRepository,
  type WriteFirstPartyRouteCommand,
} from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { PassengerPushService } from "../../../apps/api/src/modules/passenger-app/push/passenger-push.service";
import { PassengerPushController } from "../../../apps/api/src/modules/passenger-app/push/passenger-push.controller";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { FirstPartyNotificationTransport } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import { AUTH_ALLOWED_REALMS_KEY } from "../../../apps/api/src/common/auth/auth.constants";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
afterEach(() => vi.unstubAllEnvs());
const owner = "drts_passenger_fixture",
  orderId = "00000000-0000-4000-8000-000000000001",
  deviceId = "00000000-0000-4000-8000-000000000002",
  methodId = "00000000-0000-4000-8000-000000000003";
const route: WriteFirstPartyRouteCommand = {
  orderId,
  tenantId: null,
  drtsPassengerId: owner,
  passengerSubjectRef: owner,
  appId: "fixture-native-app",
  consentVersion: "fixture-notification-v1",
  rideRef: orderId,
};
function routeRow(command = route) {
  return {
    order_id: command.orderId,
    tenant_id: command.tenantId,
    drts_passenger_id: command.drtsPassengerId,
    passenger_subject_ref: command.passengerSubjectRef,
    app_id: command.appId,
    consent_version: command.consentVersion,
    ride_ref: command.rideRef,
    notification_policy_version: "first_party_notification_v1",
    created_at: "2026-10-14T00:00:00Z",
  };
}
function database(
  input: {
    partner?: boolean;
    existing?: ReturnType<typeof routeRow>;
    insertError?: boolean;
    commitError?: boolean;
  } = {},
) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      statements.push({ sql, ...(values ? { values } : {}) });
      if (sql === "COMMIT" && input.commitError)
        throw Object.assign(new Error("simulated lost COMMIT reply"), {
          code: "08006",
        });
      if (sql.includes("SELECT status FROM passenger.accounts"))
        return { rows: [{ status: "active" }] };
      if (sql.includes("SELECT payment_method_id FROM passenger.psp_tokens"))
        return { rows: [{ payment_method_id: methodId }] };
      if (sql.includes("phase1_order_partner_notification_routes"))
        return { rows: input.partner ? [{ order_id: orderId }] : [] };
      if (
        sql.includes(
          "INSERT INTO mobility.phase1_order_first_party_notification_routes",
        )
      ) {
        if (input.insertError)
          throw Object.assign(new Error("synthetic raw DB error"), {
            code: "23514",
            detail: "sensitive fixture detail",
          });
        return { rows: [routeRow()] };
      }
      if (
        sql.includes(
          "FROM mobility.phase1_order_first_party_notification_routes",
        )
      )
        return { rows: input.existing ? [input.existing] : [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const db = {
    isEnabled: () => true,
    connect: vi.fn(async () => client),
    query: vi.fn(),
  };
  return {
    client: client as unknown as PoolClient,
    db,
    statements,
    release: client.release,
  };
}
describe("Existing route writer transaction ownership", () => {
  it.each([
    ["created", {}],
    ["idempotent_replay", { existing: routeRow() }],
    ["rejected_partner_route_exists", { partner: true }],
    [
      "rejected_content_mismatch",
      { existing: routeRow({ ...route, appId: "different-frozen-app" }) },
    ],
  ] as const)(
    "borrowed %s uses exactly the caller client and never settles or releases it",
    async (outcome, input) => {
      const f = database(input);
      const repository = new PassengerPushDevicesRepository(f.db as never);
      const result = await new PassengerPushDevicesService(
        repository,
      ).writeFirstPartyRoute(route, f.client);
      expect(result.outcome).toBe(outcome);
      expect(f.db.connect).not.toHaveBeenCalled();
      expect(f.release).not.toHaveBeenCalled();
      expect(
        f.statements.some((entry) =>
          /^(BEGIN|COMMIT|ROLLBACK)$/.test(entry.sql),
        ),
      ).toBe(false);
      expect(f.statements[0]?.sql).toContain("pg_advisory_xact_lock");
      if (outcome === "created")
        expect(
          f.statements.find((entry) => entry.sql.includes("INSERT INTO"))
            ?.values,
        ).toEqual([
          orderId,
          null,
          owner,
          owner,
          route.appId,
          route.consentVersion,
          orderId,
        ]);
    },
  );
  it.each([
    ["created", {}, "COMMIT"],
    ["idempotent_replay", { existing: routeRow() }, "COMMIT"],
    ["rejected_partner_route_exists", { partner: true }, "ROLLBACK"],
    [
      "rejected_content_mismatch",
      { existing: routeRow({ ...route, consentVersion: "different" }) },
      "ROLLBACK",
    ],
  ] as const)(
    "standalone %s retains its own original transaction semantics",
    async (outcome, input, settlement) => {
      const f = database(input);
      const result = await new PassengerPushDevicesRepository(
        f.db as never,
      ).writeFirstPartyRoute(route);
      expect(result.outcome).toBe(outcome);
      expect(f.db.connect).toHaveBeenCalledTimes(1);
      expect(f.release).toHaveBeenCalledExactlyOnceWith();
      expect(f.statements[0]?.sql).toBe("BEGIN");
      expect(f.statements.at(-1)?.sql).toBe(settlement);
    },
  );
  it("borrowed SQL failure preserves existing safe operation error and leaves rollback/release to its owner", async () => {
    const f = database({ insertError: true });
    const repository = new PassengerPushDevicesRepository(f.db as never);
    await expect(
      repository.writeFirstPartyRoute(route, f.client),
    ).rejects.toMatchObject({
      name: "PassengerPushDeviceOperationError",
      code: "23514",
      message: "passenger_push_device_operation_failed",
    });
    expect(f.release).not.toHaveBeenCalled();
    expect(f.statements.some((entry) => entry.sql === "ROLLBACK")).toBe(false);
  });
});
function booking(input: Parameters<typeof database>[0] = {}, eligible = true) {
  const f = database(input);
  const repository = new PassengerBookingRepository(f.db as never);
  const writer = new PassengerPushDevicesService(
    new PassengerPushDevicesRepository(f.db as never),
  );
  const resolve = vi.spyOn(writer, "resolveActiveDevices").mockResolvedValue(
    eligible
      ? [
          {
            appId: route.appId,
            notificationConsentVersion: route.consentVersion,
          } as never,
        ]
      : [],
  );
  const write = vi.spyOn(writer, "writeFirstPartyRoute");
  const command = {
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    origin: { lat: 25, lng: 121 },
    destination: { lat: 25.1, lng: 121.1 },
    fareSnapshotId: orderId,
    paymentMethodId: methodId,
    passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
  };
  const view = { order: { orderId } };
  const multi = {
    createTrustedPassengerRide: vi.fn(
      async (
        _command: unknown,
        _owner: string,
        _id: string,
        persist: (
          id: string,
          fn: (client: PoolClient) => Promise<void>,
        ) => Promise<void>,
      ) => {
        await persist(orderId, async (client) => {
          expect(client).toBe(f.client);
          await client.query(
            "INSERT INTO ops.phase1_owned_orders (order_id) VALUES ($1)",
            [orderId],
          );
        });
        return { ride: { orderId } };
      },
    ),
    getPassengerRideById: vi.fn(async () => view),
  };
  const fare = {
    findOwnedSnapshot: async () => ({
      ...command,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    }),
  };
  const accounts = {
    transaction: async (work: (tx: any) => unknown) =>
      work({
        lockAccount: async () => ({
          displayName: "fixture",
          contactPhone: "0900000000",
          status: "active",
          drtsPassengerId: owner,
        }),
      }),
  };
  const service = new PassengerBookingService(
    repository,
    multi as never,
    fare as never,
    accounts as never,
    undefined,
    writer,
  );
  return { ...f, service, multi, command, resolve, write };
}
describe("Actual booking callback with actual repository and optional notification metadata", () => {
  it("persists ride then route then history on the same client and publishes only after the outer COMMIT", async () => {
    const f = booking();
    await expect(
      f.service.createRide(owner, f.command, "fixture-request"),
    ).resolves.toHaveProperty("ride");
    expect(f.write).toHaveBeenCalledWith(route, f.client);
    expect(f.resolve).toHaveBeenCalledWith(owner);
    const sql = f.statements.map((entry) => entry.sql);
    expect(
      sql.findIndex((s) => s.includes("INSERT INTO ops.phase1_owned_orders")),
    ).toBeLessThan(
      sql.findIndex((s) =>
        s.includes(
          "INSERT INTO mobility.phase1_order_first_party_notification_routes",
        ),
      ),
    );
    expect(
      sql.findIndex((s) =>
        s.includes(
          "INSERT INTO mobility.phase1_order_first_party_notification_routes",
        ),
      ),
    ).toBeLessThan(
      sql.findIndex((s) =>
        s.includes("INSERT INTO passenger.booking_histories"),
      ),
    );
    expect(sql.filter((s) => s === "BEGIN")).toHaveLength(1);
    expect(sql.filter((s) => s === "COMMIT")).toHaveLength(1);
    expect(f.db.connect).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledExactlyOnceWith();
    expect(f.multi.getPassengerRideById).toHaveBeenCalledExactlyOnceWith(
      orderId,
      owner,
    );
  });
  it("keeps existing Web booking successful with no eligible native device and does not invent app/consent", async () => {
    const f = booking({}, false);
    await f.service.createRide(owner, f.command);
    expect(f.write).not.toHaveBeenCalled();
    expect(
      f.statements.some((entry) =>
        entry.sql.includes("INSERT INTO passenger.booking_histories"),
      ),
    ).toBe(true);
    expect(f.statements.at(-1)?.sql).toBe("COMMIT");
  });
  it.each([
    { partner: true },
    { existing: routeRow({ ...route, consentVersion: "different" }) },
    { insertError: true },
    { commitError: true },
  ])(
    "rolls back uncommitted route failure/commit reply loss without early authority publication: %j",
    async (input) => {
      const f = booking(input);
      await expect(
        f.service.createRide(owner, f.command),
      ).rejects.toBeDefined();
      expect(f.statements.at(-1)?.sql).toBe("ROLLBACK");
      expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
      expect(f.multi.getPassengerRideById).not.toHaveBeenCalled();
      if (input.partner || input.existing || input.insertError)
        expect(f.statements.some((entry) => entry.sql === "COMMIT")).toBe(
          false,
        );
    },
  );
  it("makes the production registry dependency required, preserving the preexisting complaint optional dependency", () => {
    expect(
      Reflect.getMetadata("self:paramtypes", PassengerBookingService),
    ).toContainEqual({ index: 5, param: PassengerPushDevicesService });
    expect(
      Reflect.getMetadata("optional:paramtypes", PassengerBookingService),
    ).toContain(4);
    expect(
      Reflect.getMetadata("optional:paramtypes", PassengerBookingService),
    ).not.toContain(5);
  });
});
function deviceApi() {
  let live = true;
  const accounts = new PassengerAccountService(
    {
      transaction: async (work: (tx: any) => unknown) =>
        work({
          lockAccount: async () => ({
            drtsPassengerId: owner,
            status: "active",
          }),
          findLiveFamily: async () => (live ? {} : null),
        }),
    } as never,
    {} as never,
  );
  const register = vi.fn(async () => ({
    deviceId,
    tokenSha256: "private-fixture-hash",
  }));
  const touch = vi.fn(async () => null);
  const revoke = vi.fn(async () => null);
  const devices = {
    registerDevice: register,
    touchDevice: touch,
    revokeDevice: revoke,
  };
  const query = vi.fn(async () => ({ rows: [{ drts_passenger_id: owner }] }));
  const service = new PassengerPushService(
    accounts,
    devices as never,
    { isEnabled: () => true, query } as never,
  );
  const controller = new PassengerPushController(service);
  const identity = {
    authMode: "jwt_bearer",
    realm: "passenger",
    actorType: "first_party_passenger",
    drtsPassengerId: owner,
    actorId: owner,
    subject: owner,
    sessionId: "fixture-family",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  } as never;
  const body = {
    platform: "ios",
    provider: "fcm_v1",
    app_id: "fixture-native-app",
    app_version: "1",
    token: "synthetic-fixture-token",
    notification_consent_version: "notification-v1",
  };
  return {
    service,
    controller,
    identity,
    body,
    register,
    touch,
    revoke,
    query,
    revokeSession: () => {
      live = false;
    },
  };
}
describe("Existing account/session and owned push device API facade", () => {
  it("keeps both HTTP methods under the existing passenger realm policy", () => {
    expect(
      Reflect.getMetadata(AUTH_ALLOWED_REALMS_KEY, PassengerPushController),
    ).toEqual(["passenger"]);
    for (const [method, path] of [
      ["POST", "/api/passenger-app/push-devices"],
      ["DELETE", `/api/passenger-app/push-devices/${deviceId}`],
    ]) {
      expect(resolveRouteAuthPolicy(method!, path!)).toMatchObject({
        allowedRealms: ["passenger"],
        requiredScopes: [],
      });
    }
  });
  it("rejects absent and non-passenger sessions on both mutations", async () => {
    const f = deviceApi();
    for (const identity of [
      null,
      Object.assign({}, f.identity, { realm: "partner" }) as never,
    ]) {
      await expect(
        f.controller.register(identity, f.body),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        f.controller.unregister(identity, deviceId),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(f.register).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
  });
  it("rejects forged owners, ambiguous aliases and unsupported provider input before registration", async () => {
    const f = deviceApi();
    for (const extra of [
      { drtsPassengerId: "foreign" },
      { appId: "ambiguous" },
      { provider: "unsupported" },
    ]) {
      await expect(
        f.service.register(f.identity, { ...f.body, ...extra }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(f.register).not.toHaveBeenCalled();
  });
  it("registers and touches with the real account owner, normalizes wire fields, and returns only deviceId", async () => {
    const f = deviceApi();
    const response = await f.controller.register(f.identity, f.body);
    expect(response.data).toEqual({ deviceId });
    expect(JSON.stringify(response)).not.toContain("token");
    expect(JSON.stringify(response)).not.toContain("hash");
    expect(f.register).toHaveBeenCalledWith({
      platform: "ios",
      provider: "fcm_v1",
      appId: "fixture-native-app",
      appVersion: "1",
      token: "synthetic-fixture-token",
      notificationConsentVersion: "notification-v1",
      drtsPassengerId: owner,
    });
    expect(f.touch).toHaveBeenCalledExactlyOnceWith(deviceId);
  });
  it("reuses the actual persistent-session check before any registry mutation", async () => {
    const f = deviceApi();
    f.revokeSession();
    await expect(f.service.register(f.identity, f.body)).rejects.toMatchObject({
      status: 401,
    });
    expect(f.register).not.toHaveBeenCalled();
  });
  it("checks rotation ownership through stored rows, not a stale-filtered resolver", async () => {
    const f = deviceApi();
    await f.service.register(f.identity, {
      ...f.body,
      previous_device_id: deviceId,
    });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE device_id = $1"),
      [deviceId],
    );
    expect(f.register).toHaveBeenCalledWith(
      expect.objectContaining({ previousDeviceId: deviceId }),
    );
  });
  it("unregisters an owned stale/revoked row idempotently through the existing revoke method", async () => {
    const f = deviceApi();
    expect((await f.controller.unregister(f.identity, deviceId)).data).toEqual({
      success: true,
    });
    expect(f.revoke).toHaveBeenCalledExactlyOnceWith(deviceId);
  });
  it("refuses a foreign or missing device without revoking or rotating it", async () => {
    const f = deviceApi();
    f.query.mockResolvedValue({ rows: [] });
    await expect(
      f.service.unregister(f.identity, deviceId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.service.register(f.identity, {
        ...f.body,
        previous_device_id: deviceId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.revoke).not.toHaveBeenCalled();
    expect(f.register).not.toHaveBeenCalled();
  });
});

function transport(tenantId: string | null) {
  const repository = {
    findFirstPartyNotificationContextAndTokens: vi.fn(async () => null),
    findOrderFirstPartyNotificationRoute: vi.fn(async () => ({
      ...route,
      tenantId,
      notificationPolicyVersion: "first_party_notification_v1",
      createdAt: new Date().toISOString(),
    })),
    findPartnerNotificationRelevance: vi.fn(async () => ({
      status: "cancelled",
      assignmentVersion: 1,
    })),
    prepareFirstPartyNotificationContext: vi.fn(
      async (context: unknown) => context,
    ),
    findFirstPartyNotificationDeviceToken: vi.fn(
      async () => "synthetic-fixture-delivery-token",
    ),
  };
  const devices = {
    resolveActiveDevices: vi.fn(async () => [
      { deviceId, appId: route.appId, tokenSha256: "fixture-hash" },
    ]),
    invalidateDevice: vi.fn(),
  };
  const provider = {
    isConfigured: vi.fn(() => true),
    send: vi.fn(
      async (
        _wire: unknown,
        _target: unknown,
        validate: (signal: AbortSignal) => Promise<boolean>,
      ) => {
        expect(await validate(new AbortController().signal)).toBe(true);
        return { kind: "accepted", messageId: "fixture-provider-receipt" };
      },
    ),
  };
  const instance = new FirstPartyNotificationTransport(
    repository as never,
    devices as never,
    provider as never,
  );
  const request = {
    message: {
      outboxId: "fixture-outbox",
      orderId,
      passengerSubjectRef: owner,
      eventType: "trip_cancelled",
      attemptCount: 1,
      assignmentVersion: null,
      payload: { eventSequence: 1 },
      createdAt: new Date().toISOString(),
    },
    context: { fenceToken: "fixture-existing-fence" },
  } as never;
  return { instance, repository, devices, provider, request };
}
describe("Stored tenantless route remains separate from existing nonnull delivery capability", () => {
  it("returns existing configuration_blocked for tenantless route before context/device/provider work", async () => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    const f = transport(null);
    await expect(f.instance.send(f.request)).rejects.toMatchObject({
      failure: {
        failureReason: "configuration_blocked",
        retryDisposition: "configuration_blocked",
      },
    });
    expect(
      f.repository.prepareFirstPartyNotificationContext,
    ).not.toHaveBeenCalled();
    expect(f.devices.resolveActiveDevices).not.toHaveBeenCalled();
    expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("retains actual nonnull context and captured-provider callback behavior", async () => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    const f = transport("fixture-existing-tenant");
    const result = await f.instance.send(f.request);
    expect(result.providerMessageRef).toBe("fixture-provider-receipt");
    expect(result.deliveryContext.tenantId).toBe("fixture-existing-tenant");
    expect(
      f.repository.prepareFirstPartyNotificationContext,
    ).toHaveBeenCalledTimes(1);
    expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it("keeps unset flag before repository, metadata or provider I/O", async () => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", undefined);
    const f = transport(null);
    await expect(f.instance.send(f.request)).rejects.toMatchObject({
      failure: { failureReason: "configuration_blocked" },
    });
    expect(
      f.repository.findFirstPartyNotificationContextAndTokens,
    ).not.toHaveBeenCalled();
    expect(f.provider.isConfigured).not.toHaveBeenCalled();
    expect(f.provider.send).not.toHaveBeenCalled();
  });
});
