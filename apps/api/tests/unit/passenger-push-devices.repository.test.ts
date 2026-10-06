import { createHash } from "node:crypto";
import * as util from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  PassengerPushDeviceOperationError,
  PassengerPushDevicesRepository,
} from "../../src/modules/passenger-push-devices/passenger-push-devices.repository";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function baseCommand(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    drtsPassengerId: "passenger-001",
    platform: "ios" as const,
    provider: "fcm_v1" as const,
    appId: "app-first-party-001",
    appVersion: "1.0.0",
    token: "raw-fcm-token-must-never-be-logged",
    notificationConsentVersion: "v1",
    ...overrides,
  };
}

describe("PassengerPushDevicesRepository.registerDevice", () => {
  it("inserts a brand-new device with last_seen_at NULL (unseen until first touch)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT") && sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-001",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("OFFSET")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(baseCommand());

    expect(result).toMatchObject({
      deviceId: "device-001",
      drtsPassengerId: "passenger-001",
      status: "active",
      lastSeenAt: null,
    });
    expect(Object.keys(result)).not.toContain("token");

    const insertCall = query.mock.calls.find(([sql]) =>
      (sql as string).includes("INSERT INTO iam.phase1_passenger_push_devices"),
    );
    expect(insertCall![1]).toContain("raw-fcm-token-must-never-be-logged");
    expect(insertCall![1]).toContain(sha256("raw-fcm-token-must-never-be-logged"));

    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("treats a same-passenger re-registration of the same token as idempotent (no revoke, no new row)", async () => {
    const existingRow = {
      device_id: "device-001",
      drts_passenger_id: "passenger-001",
      platform: "ios",
      provider: "fcm_v1",
      app_id: "app-first-party-001",
      app_version: "0.9.0",
      token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
      status: "active",
      status_reason: null,
      notification_consent_version: "v1",
      registered_at: "2026-10-01T00:00:00.000Z",
      last_seen_at: "2026-10-05T00:00:00.000Z",
      invalidated_at: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [existingRow] };
      }
      if (sql.includes("UPDATE iam.phase1_passenger_push_devices") && sql.includes("app_version = $2")) {
        return { rows: [{ ...existingRow, app_version: "1.0.0" }] };
      }
      if (sql.includes("OFFSET")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(baseCommand());

    expect(result.deviceId).toBe("device-001");
    expect(result.appVersion).toBe("1.0.0");
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).not.toContain("status = 'revoked'");
    expect(sql).not.toContain("INSERT INTO iam.phase1_passenger_push_devices");
  });

  it("rebinds: revokes the prior passenger's active row for the same token and inserts a new one", async () => {
    const priorRow = {
      device_id: "device-old",
      drts_passenger_id: "passenger-OLD",
      platform: "ios",
      provider: "fcm_v1",
      app_id: "app-first-party-001",
      app_version: "1.0.0",
      token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
      status: "active",
      status_reason: null,
      notification_consent_version: "v1",
      registered_at: "2026-10-01T00:00:00.000Z",
      last_seen_at: null,
      invalidated_at: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [priorRow] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              ...priorRow,
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              status: "active",
              status_reason: null,
            },
          ],
        };
      }
      if (sql.includes("OFFSET")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(baseCommand());

    expect(result.deviceId).toBe("device-new");
    expect(result.drtsPassengerId).toBe("passenger-001");

    const revokeCall = query.mock.calls.find(
      ([sql]) =>
        (sql as string).includes("status = 'revoked'") &&
        (sql as string).includes("status_reason = 'rebound_to_new_passenger'"),
    );
    expect(revokeCall![1]).toEqual(["device-old"]);
  });

  it("rotates: revokes the caller-supplied previousDeviceId and inserts a fresh row for the new token", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-rotated",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("brand-new-rotated-token"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("OFFSET")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(
      baseCommand({
        token: "brand-new-rotated-token",
        previousDeviceId: "device-prior",
      }),
    );

    expect(result.deviceId).toBe("device-rotated");
    const rotateCall = query.mock.calls.find(
      ([sql]) =>
        (sql as string).includes("status = 'revoked'") &&
        (sql as string).includes("status_reason = 'token_rotated'"),
    );
    expect(rotateCall![1]).toEqual(["device-prior"]);
  });

  it("revokes the least-recently-seen active device once a passenger exceeds the 10-device cap", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("OFFSET")) {
        return { rows: [{ device_id: "device-stale" }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await repository.registerDevice(baseCommand());

    const capCall = query.mock.calls.find(([sql]) =>
      (sql as string).includes("OFFSET"),
    );
    expect(capCall![1]).toEqual(["passenger-001", 10]);

    const revokeCall = query.mock.calls.find(
      ([sql]) =>
        (sql as string).includes("status_reason = 'active_device_cap_exceeded'"),
    );
    expect(revokeCall![1]).toEqual([["device-stale"]]);
  });

  it("rolls back and rethrows a sanitized error, never the raw DB error object", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        throw Object.assign(new Error("unique_violation on token_sha256"), {
          code: "23505",
        });
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await expect(repository.registerDevice(baseCommand())).rejects.toMatchObject({
      message: "passenger_push_device_operation_failed",
      code: "23505",
    });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("F3: never lets a raw token leak through a DB error's message/detail/cause, even via util.inspect", async () => {
    const rawToken = "raw-fcm-token-must-never-be-logged";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        throw Object.assign(new Error("new row violates check constraint"), {
          code: "23514",
          detail: `Failing row contains (${rawToken}).`,
        });
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    let caught: unknown;
    try {
      await repository.registerDevice(baseCommand({ token: rawToken }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PassengerPushDeviceOperationError);
    expect(util.inspect(caught)).not.toContain(rawToken);
    expect((caught as Error).message).not.toContain(rawToken);
  });

  it("F2: serializes registerDevice for a passenger behind a transaction-scoped advisory lock before any row lock", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-001",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await repository.registerDevice(baseCommand());

    const calls = query.mock.calls.map(([sql]) => sql as string);
    const beginIndex = calls.indexOf("BEGIN");
    const lockIndex = calls.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const forUpdateIndex = calls.findIndex((sql) => sql.includes("FOR UPDATE"));
    expect(beginIndex).toBe(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(lockIndex).toBeLessThan(forUpdateIndex);
    const lockCall = query.mock.calls[lockIndex];
    expect(lockCall[1]).toEqual(["passenger-push-device-register:passenger-001"]);
  });

  it("F1: keeps the most-recently-seen devices and revokes the least-recently-seen overflow (not the newest)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("ORDER BY last_seen_at")) {
        expect(sql).toContain("ORDER BY last_seen_at DESC NULLS LAST, registered_at DESC");
        return { rows: [{ device_id: "device-oldest-seen" }] };
      }
      if (
        sql.includes("SELECT") &&
        sql.includes("WHERE device_id = $1") &&
        !sql.includes("FOR UPDATE")
      ) {
        return {
          rows: [
            {
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(baseCommand());

    expect(result.deviceId).toBe("device-new");
    expect(result.status).toBe("active");

    const revokeCall = query.mock.calls.find(
      ([sql]) => (sql as string).includes("status_reason = 'active_device_cap_exceeded'"),
    );
    expect(revokeCall![1]).toEqual([["device-oldest-seen"]]);
  });

  it("F1: when the cap enforcement revokes the row this very call just touched, the returned record reflects revoked — not the stale pre-cap active snapshot", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE") && sql.includes("token_sha256 = $2")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO iam.phase1_passenger_push_devices")) {
        return {
          rows: [
            {
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "active",
              status_reason: null,
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("ORDER BY last_seen_at")) {
        // Simulate the device just inserted by this call ending up as part
        // of the overflow anyway (e.g. an older row raced last_seen_at
        // past it between INSERT and the cap check).
        return { rows: [{ device_id: "device-new" }] };
      }
      if (
        sql.includes("SELECT") &&
        sql.includes("WHERE device_id = $1") &&
        !sql.includes("FOR UPDATE")
      ) {
        return {
          rows: [
            {
              device_id: "device-new",
              drts_passenger_id: "passenger-001",
              platform: "ios",
              provider: "fcm_v1",
              app_id: "app-first-party-001",
              app_version: "1.0.0",
              token_sha256: sha256("raw-fcm-token-must-never-be-logged"),
              status: "revoked",
              status_reason: "active_device_cap_exceeded",
              notification_consent_version: "v1",
              registered_at: "2026-10-06T00:00:00.000Z",
              last_seen_at: null,
              invalidated_at: null,
              created_at: "2026-10-06T00:00:00.000Z",
              updated_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.registerDevice(baseCommand());

    expect(result.deviceId).toBe("device-new");
    expect(result.status).toBe("revoked");
    expect(result.statusReason).toBe("active_device_cap_exceeded");
  });
});

describe("PassengerPushDevicesRepository.touchDevice/revokeDevice/invalidateDevice", () => {
  it("touchDevice only updates an active device's last_seen_at", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          device_id: "device-001",
          drts_passenger_id: "passenger-001",
          platform: "ios",
          provider: "fcm_v1",
          app_id: "app-001",
          app_version: "1.0.0",
          token_sha256: "hash",
          status: "active",
          status_reason: null,
          notification_consent_version: "v1",
          registered_at: "2026-10-01T00:00:00.000Z",
          last_seen_at: "2026-10-06T00:00:00.000Z",
          invalidated_at: null,
          created_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
        },
      ],
    });
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.touchDevice("device-001");
    expect(result?.lastSeenAt).toBe("2026-10-06T00:00:00.000Z");
    expect(query.mock.calls[0][0]).toContain("status = 'active'");
  });

  it("revokeDevice is idempotent for an already-revoked device", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("WHERE device_id = $1 AND status = 'active'")) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            device_id: "device-001",
            drts_passenger_id: "passenger-001",
            platform: "ios",
            provider: "fcm_v1",
            app_id: "app-001",
            app_version: "1.0.0",
            token_sha256: "hash",
            status: "revoked",
            status_reason: "logout",
            notification_consent_version: "v1",
            registered_at: "2026-10-01T00:00:00.000Z",
            last_seen_at: null,
            invalidated_at: null,
            created_at: "2026-10-01T00:00:00.000Z",
            updated_at: "2026-10-01T00:00:00.000Z",
          },
        ],
      };
    });
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.revokeDevice("device-001", "logout");
    expect(result?.status).toBe("revoked");
  });

  it("invalidateDevice records the provider-reported reason and sets invalidated_at", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          device_id: "device-001",
          drts_passenger_id: "passenger-001",
          platform: "ios",
          provider: "fcm_v1",
          app_id: "app-001",
          app_version: "1.0.0",
          token_sha256: "hash",
          status: "invalid",
          status_reason: "UNREGISTERED",
          notification_consent_version: "v1",
          registered_at: "2026-10-01T00:00:00.000Z",
          last_seen_at: null,
          invalidated_at: "2026-10-06T00:00:00.000Z",
          created_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
        },
      ],
    });
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.invalidateDevice("device-001", "UNREGISTERED");
    expect(result?.status).toBe("invalid");
    expect(result?.statusReason).toBe("UNREGISTERED");
    expect(query.mock.calls[0][1]).toEqual(["device-001", "UNREGISTERED"]);
  });
});

describe("PassengerPushDevicesRepository.resolveActiveDevices", () => {
  it("only selects active devices with a non-null last_seen_at within the stale window", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.resolveActiveDevices("passenger-001");

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("last_seen_at IS NOT NULL");
    expect(sql).toContain("make_interval(days => $2)");
    expect(params).toEqual(["passenger-001", 60]);
  });
});

describe("PassengerPushDevicesRepository.writeFirstPartyRoute", () => {
  function routeCommand(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      orderId: "order-001",
      tenantId: "tenant-001",
      drtsPassengerId: "passenger-001",
      passengerSubjectRef: "subj-001",
      appId: "app-001",
      consentVersion: "v1",
      rideRef: "ride-001",
      ...overrides,
    };
  }

  it("rejects when a partner route already exists for the order, writing nothing", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [{ order_id: "order-001" }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.writeFirstPartyRoute(routeCommand());
    expect(result).toEqual({ outcome: "rejected_partner_route_exists" });
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).not.toContain("INSERT INTO mobility.phase1_order_first_party_notification_routes");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("creates a new route when none exists for the order", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT") && sql.includes("mobility.phase1_order_first_party_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO mobility.phase1_order_first_party_notification_routes")) {
        return {
          rows: [
            {
              order_id: "order-001",
              tenant_id: "tenant-001",
              drts_passenger_id: "passenger-001",
              passenger_subject_ref: "subj-001",
              app_id: "app-001",
              notification_policy_version: "first_party_notification_v1",
              consent_version: "v1",
              ride_ref: "ride-001",
              created_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.writeFirstPartyRoute(routeCommand());
    expect(result).toMatchObject({
      outcome: "created",
      route: { orderId: "order-001", notificationPolicyVersion: "first_party_notification_v1" },
    });
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("replays idempotently when the exact same content is rewritten for the same order", async () => {
    const existingRow = {
      order_id: "order-001",
      tenant_id: "tenant-001",
      drts_passenger_id: "passenger-001",
      passenger_subject_ref: "subj-001",
      app_id: "app-001",
      notification_policy_version: "first_party_notification_v1",
      consent_version: "v1",
      ride_ref: "ride-001",
      created_at: "2026-10-06T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [existingRow] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.writeFirstPartyRoute(routeCommand());
    expect(result.outcome).toBe("idempotent_replay");
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).not.toContain("INSERT INTO mobility.phase1_order_first_party_notification_routes");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("rejects when the same order is rewritten with different content", async () => {
    const existingRow = {
      order_id: "order-001",
      tenant_id: "tenant-001",
      drts_passenger_id: "passenger-001",
      passenger_subject_ref: "subj-001",
      app_id: "app-001",
      notification_policy_version: "first_party_notification_v1",
      consent_version: "v1",
      ride_ref: "ride-001",
      created_at: "2026-10-06T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [existingRow] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.writeFirstPartyRoute(
      routeCommand({ rideRef: "ride-DIFFERENT" }),
    );
    expect(result).toEqual({ outcome: "rejected_content_mismatch" });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("F4: serializes writeFirstPartyRoute for an order_id behind a transaction-scoped advisory lock before the FOR UPDATE read", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO mobility.phase1_order_first_party_notification_routes")) {
        return {
          rows: [
            {
              order_id: "order-001",
              tenant_id: "tenant-001",
              drts_passenger_id: "passenger-001",
              passenger_subject_ref: "subj-001",
              app_id: "app-001",
              notification_policy_version: "first_party_notification_v1",
              consent_version: "v1",
              ride_ref: "ride-001",
              created_at: "2026-10-06T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await repository.writeFirstPartyRoute(routeCommand());

    const calls = query.mock.calls.map(([sql]) => sql as string);
    const beginIndex = calls.indexOf("BEGIN");
    const lockIndex = calls.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const forUpdateIndex = calls.findIndex((sql) => sql.includes("FOR UPDATE"));
    expect(beginIndex).toBe(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(lockIndex).toBeLessThan(forUpdateIndex);
    const lockCall = query.mock.calls[lockIndex];
    expect(lockCall[1]).toEqual(["passenger-push-first-party-route:order-001"]);
  });

  it("F4: a concurrent second writer for the same never-yet-routed order sees the first writer's committed row instead of racing a PK-violation INSERT", async () => {
    // Models the serialized outcome the advisory lock produces: by the time
    // writer B's transaction runs its FOR UPDATE select, writer A has
    // already committed, so B observes the row A inserted and takes the
    // idempotent-replay/content-mismatch branch instead of attempting a
    // second INSERT into the same order_id primary key.
    const insertedByWriterA = {
      order_id: "order-001",
      tenant_id: "tenant-001",
      drts_passenger_id: "passenger-001",
      passenger_subject_ref: "subj-001",
      app_id: "app-001",
      notification_policy_version: "first_party_notification_v1",
      consent_version: "v1",
      ride_ref: "ride-001",
      created_at: "2026-10-06T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [insertedByWriterA] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const writerBResult = await repository.writeFirstPartyRoute(routeCommand());

    expect(writerBResult.outcome).toBe("idempotent_replay");
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).not.toContain("INSERT INTO mobility.phase1_order_first_party_notification_routes");
  });

  it("F3: sanitizes a raw DB error on writeFirstPartyRoute too, never surfacing detail/cause", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mobility.phase1_order_partner_notification_routes")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO mobility.phase1_order_first_party_notification_routes")) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
          detail: 'Key (order_id)=(order-001) already exists, passenger_subject_ref=(subj-001).',
        });
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new PassengerPushDevicesRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    let caught: unknown;
    try {
      await repository.writeFirstPartyRoute(routeCommand());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PassengerPushDeviceOperationError);
    expect(util.inspect(caught)).not.toContain("subj-001");
    expect((caught as Error).message).toBe("passenger_push_device_operation_failed");
    expect((caught as { code?: string }).code).toBe("23505");
  });
});
