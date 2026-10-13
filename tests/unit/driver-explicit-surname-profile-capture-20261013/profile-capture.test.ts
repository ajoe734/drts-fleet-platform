import "reflect-metadata";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CreateDriverProfileCommand,
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileController } from "../../../apps/api/src/modules/driver-profile/driver-profile.controller";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import {
  ApiClient,
  ApiClientError,
} from "../../../packages/api-client/src/index";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  // Only the external DB boundary is simulated. Production repository performs
  // serialization and parsing; no replacement profile processor or SQL schema.
  const records = new Map<string, string>();
  const writes: Promise<unknown>[] = [];
  const query = vi.fn((sql: string, params?: unknown[]) => {
    if (!params) {
      expect(sql).toContain("FROM ops.phase1_driver_profiles");
      return Promise.resolve({
        rows: [...records.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      });
    }
    expect(sql).toContain("INSERT INTO ops.phase1_driver_profiles");
    expect(sql).toContain("$3::jsonb");
    expect(params).toHaveLength(3);
    const write = Promise.resolve().then(() => {
      records.set(params[0] as string, params[2] as string);
      return { rows: [] };
    });
    writes.push(write);
    return write;
  });
  const repository = new DriverProfileRepository({
    isEnabled: () => true,
    query,
  } as never);
  const audit = new AuditNotificationService();
  const service = new DriverProfileService(audit, repository);
  const settle = () => Promise.all(writes);
  const reload = async () => {
    await settle();
    const fresh = new DriverProfileService(
      new AuditNotificationService(),
      repository,
    );
    await fresh.onModuleInit();
    return fresh;
  };
  return { service, audit, repository, query, records, settle, reload };
}

function absent(profile: DriverProfileRecord) {
  expect(Object.hasOwn(profile, "driverSurname")).toBe(false);
  expect(JSON.stringify(profile)).not.toContain("driverSurname");
}

describe("explicit driver surname production profile capture", () => {
  it.each(["歐陽", "van der Fixture", "O’Fixture-Sample"])(
    "captures explicit %s through create and JSON reload without name inference",
    async (surname) => {
      const f = fixture();
      const command: CreateDriverProfileCommand = {
        name: "Unrelated synthetic display name",
        driverSurname: ` \t${surname}\n `,
      };
      const created = f.service.createProfile(
        "drv-surname-new",
        command,
        "req-create",
      );
      expect(created.driverSurname).toBe(surname);
      expect(created.name).toBe(command.name);
      command.driverSurname = "Changed input";
      created.driverSurname = "Changed response";
      expect(f.service.getProfile("drv-surname-new").driverSurname).toBe(
        surname,
      );
      expect(
        f.service.findProfileForDriver("drv-surname-new")?.driverSurname,
      ).toBe(surname);
      const fresh = await f.reload();
      expect(fresh.getProfileForDriver("drv-surname-new").driverSurname).toBe(
        surname,
      );
      expect(JSON.parse(f.records.get("drv-surname-new")!).driverSurname).toBe(
        surname,
      );
      const log = f.audit.listAuditLogs()[0]!;
      expect(log).toMatchObject({
        actorId: "drv-surname-new",
        requestId: "req-create",
      });
      expect(JSON.stringify(log)).not.toContain(surname);
    },
  );

  it("captures explicit update and admin upsert; omission preserves it across reload", async () => {
    const f = fixture();
    const updated = f.service.updateProfile("driver-demo-001", {
      driverSurname: "Compound Fixture",
    });
    expect(updated.driverId).toBe("drv-demo-001");
    expect(updated.driverSurname).toBe("Compound Fixture");
    const renamed = f.service.updateProfile("driver-demo-001", {
      name: "Other Display Fixture",
    });
    expect(renamed.driverSurname).toBe("Compound Fixture");
    const admin = f.service.upsertAdminProfile(" drv-demo-001 ", {
      name: "Admin Fixture",
    });
    expect(admin.driverSurname).toBe("Compound Fixture");
    expect(
      f.service.upsertAdminProfile("drv-demo-001", {
        name: "Admin Fixture",
        driverSurname: "Explicit Admin Fixture",
      }).driverSurname,
    ).toBe("Explicit Admin Fixture");
    const fresh = await f.reload();
    expect(fresh.getProfile("driver-demo-001").driverSurname).toBe(
      "Explicit Admin Fixture",
    );
    absent(fresh.getProfile("driver-demo-002"));
  });

  it("keeps legacy absent on seed, empty, create, update, admin and persisted load", async () => {
    const f = fixture();
    absent(f.service.getProfile("driver-demo-001"));
    absent(f.service.getProfile("drv-empty"));
    absent(
      f.service.createProfile("drv-legacy", { name: "歐陽 Synthetic Fixture" }),
    );
    absent(
      f.service.updateProfile("drv-legacy", { name: "Changed legacy name" }),
    );
    absent(
      f.service.upsertAdminProfile("drv-legacy", {
        name: "Legacy Admin Fixture",
      }),
    );
    absent((await f.reload()).getProfile("drv-legacy"));
  });

  it("keeps supplied internal whitespace and existing no-length-cap profile handling", () => {
    const f = fixture();
    const surname = `van  der ${"Synthetic".repeat(40)}`;
    expect(
      f.service.updateProfile("drv-demo-001", { driverSurname: surname })
        .driverSurname,
    ).toBe(surname);
  });

  const invalid = [
    null,
    undefined,
    "",
    " \t\n ",
    42,
    false,
    [],
    {},
    ["Fixture"],
  ];
  describe.each(["create", "update", "admin"] as const)(
    "%s invalid input",
    (operation) => {
      it.each(invalid.map((value, index) => ({ value, index })))(
        "rejects supplied invalid value #$index without partial mutation or side effects",
        async ({ value }) => {
          const f = fixture();
          const auditWrites = vi.spyOn(f.audit, "recordAuditLog");
          const driverId = "drv-invalid-fixture";
          if (operation !== "create") {
            f.service.createProfile(driverId, {
              name: "Before",
              driverSurname: "Retained Fixture",
            });
            await f.settle();
          }
          const before = f.service.getProfile(driverId);
          const beforeRecords = [...f.records];
          const beforeAudit = auditWrites.mock.calls.length;
          const beforeCalls = f.query.mock.calls.length;
          const command = {
            name: "Must not commit",
            phone: "changed",
            driverSurname: value,
          } as unknown as CreateDriverProfileCommand;
          const act = () =>
            operation === "create"
              ? f.service.createProfile(driverId, command)
              : operation === "update"
                ? f.service.updateProfile(driverId, command)
                : f.service.upsertAdminProfile(driverId, command);
          expect(act).toThrowError(ApiRequestError);
          try {
            act();
          } catch (error) {
            expect(error).toMatchObject({ code: "INVALID_DRIVER_PROFILE" });
            expect((error as ApiRequestError).getStatus()).toBe(400);
            expect((error as ApiRequestError).getResponse()).toMatchObject({
              error: { details: { field: "driverSurname" } },
            });
          }
          // Empty profiles carry a generated timestamp; use actual existence for create.
          if (operation === "create")
            expect(f.service.findProfileForDriver(driverId)).toBeNull();
          else expect(f.service.getProfile(driverId)).toEqual(before);
          expect(f.query.mock.calls.length).toBe(beforeCalls);
          expect([...f.records]).toEqual(beforeRecords);
          expect(auditWrites.mock.calls.length).toBe(beforeAudit);
        },
      );
    },
  );

  it("retains driver identity binding and rejects missing identity", () => {
    const f = fixture();
    const command = {
      name: "Fixture",
      driverSurname: "Explicit Fixture",
      driverId: "drv-victim",
    };
    expect(f.service.createProfile("drv-bound", command).driverId).toBe(
      "drv-bound",
    );
    absent(f.service.getProfile("drv-victim"));
    for (const actor of [null, undefined, " "]) {
      expect(() => f.service.createProfile(actor, command)).toThrowError(
        ApiRequestError,
      );
      expect(() => f.service.updateProfile(actor, command)).toThrowError(
        ApiRequestError,
      );
    }
  });

  it("preserves captured surname across existing device operations and returned clones", () => {
    const f = fixture();
    f.service.updateProfile("drv-demo-001", {
      driverSurname: "Device Fixture",
    });
    const bound = f.service.recordDeviceBinding("drv-demo-001", {
      bindingId: "fixture-binding",
      deviceId: "fixture-device",
      deviceLabel: "Fixture",
      status: "active",
      issuedAt: "2026-10-13T00:00:00Z",
      refreshedAt: "2026-10-13T00:00:00Z",
      revokedAt: null,
    });
    bound.driverSurname = "Mutation";
    f.service.recordDeviceBindingRefresh(
      "drv-demo-001",
      "fixture-binding",
      "2026-10-13T00:01:00Z",
    );
    f.service.recordDeviceBindingRevocation(
      "drv-demo-001",
      "fixture-binding",
      "2026-10-13T00:02:00Z",
    );
    expect(f.service.getProfileForDriver("drv-demo-001").driverSurname).toBe(
      "Device Fixture",
    );
  });

  it("discloses asynchronous persist: response precedes write; failure is reported", async () => {
    let rejectWrite!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    });
    const repository = new DriverProfileRepository({
      isEnabled: () => true,
      query: () => pending,
    } as never);
    const report = vi
      .spyOn(repository, "reportPersistenceFailure")
      .mockImplementation(() => {});
    const service = new DriverProfileService(
      new AuditNotificationService(),
      repository,
    );
    expect(
      service.createProfile("drv-async", {
        name: "Fixture",
        driverSurname: "Async Fixture",
      }).driverSurname,
    ).toBe("Async Fixture");
    expect(report).not.toHaveBeenCalled();
    const error = new Error("Synthetic DB unavailable");
    rejectWrite(error);
    await pending.catch(() => {});
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(error, "create_profile");
  });
});

describe("actual SDK JSON transport to typed controller and repository", () => {
  it("captures explicit POST/PATCH and reloads GET through real producer paths", async () => {
    const f = fixture();
    let controller = new DriverProfileController(f.service);
    const identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "driver_user",
      actorId: "drv-transport",
      realm: "driver",
      tenantId: null,
      roleFamilies: ["driver"],
      roles: [],
      scopes: ["driver:read", "driver:write"],
      requestId: null,
    };
    const wire: { method: string; body?: Record<string, unknown> }[] = [];
    // In-process fetch boundary: no HTTP server or guard execution. The SDK's
    // actual JSON body/envelope path and real controller/service/repository run.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://example.invalid/api/driver/profile");
        const body = init.body ? JSON.parse(init.body as string) : undefined;
        wire.push({ method: init.method!, ...(body ? { body } : {}) });
        try {
          const result =
            init.method === "POST"
              ? controller.createProfile(identity, body, "req-wire")
              : init.method === "PATCH"
                ? controller.updateProfile(identity, body, "req-wire")
                : controller.getProfile(identity, "req-wire");
          return new Response(JSON.stringify(result), { status: 200 });
        } catch (error) {
          if (!(error instanceof ApiRequestError)) throw error;
          return new Response(JSON.stringify(error.getResponse()), {
            status: error.getStatus(),
          });
        }
      }),
    );
    const client = new ApiClient({ baseUrl: "https://example.invalid" });
    const create: CreateDriverProfileCommand = {
      name: "Not the surname",
      driverSurname: " Wire Compound Fixture ",
    };
    expect((await client.createDriverProfile(create)).driverSurname).toBe(
      "Wire Compound Fixture",
    );
    expect(wire[0]).toEqual({ method: "POST", body: create });
    const patch: UpdateDriverProfileCommand = {
      driverSurname: "Wire Updated Fixture",
    };
    expect((await client.updateDriverProfile(patch)).driverSurname).toBe(
      "Wire Updated Fixture",
    );
    expect(wire[1]).toEqual({ method: "PATCH", body: patch });
    expect(
      (await client.updateDriverProfile({ name: "Renamed" })).driverSurname,
    ).toBe("Wire Updated Fixture");
    expect(Object.hasOwn(wire[2]!.body!, "driverSurname")).toBe(false);
    await expect(
      client.updateDriverProfile({
        driverSurname: null,
      } as unknown as UpdateDriverProfileCommand),
    ).rejects.toMatchObject({
      code: "INVALID_DRIVER_PROFILE",
      statusCode: 400,
    } satisfies Partial<ApiClientError>);
    controller = new DriverProfileController(await f.reload());
    expect((await client.getDriverProfile()).driverSurname).toBe(
      "Wire Updated Fixture",
    );
    expect((await client.getDriverProfile()).name).toBe("Renamed");
    expect(f.service.findProfileForDriver("drv-other")).toBeNull();
    identity.actorId = "drv-wire-legacy";
    absent(await client.createDriverProfile({ name: "Legacy Wire Fixture" }));
    controller = new DriverProfileController(await f.reload());
    absent(await client.getDriverProfile());
  });
});
