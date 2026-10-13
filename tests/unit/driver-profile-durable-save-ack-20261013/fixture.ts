import { expect, vi } from "vitest";

import type { DriverProfileRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileController } from "../../../apps/api/src/modules/driver-profile/driver-profile.controller";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

export async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

export function observe<T>(result: T | Promise<T>) {
  const state: { status: string; value?: T; error?: unknown } = {
    status: "pending",
  };
  const settled = Promise.resolve(result).then(
    (value) => {
      state.status = "fulfilled";
      state.value = value;
    },
    (error: unknown) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return { state, settled };
}

export function fixture() {
  // Only the external database query is controlled. All serialization, profile
  // validation, publication, audit and caller logic are production code.
  const records = new Map<string, string>();
  const writes: {
    record: DriverProfileRecord;
    commit: () => void;
    reject: (error: Error) => void;
  }[] = [];
  let enabled = true;
  let automatic = false;
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
    const json = params[2] as string;
    const record = JSON.parse(json) as DriverProfileRecord;
    expect(record.driverId).toBe(params[0]);
    expect(record.updatedAt).toBe(params[1]);
    return new Promise<{ rows: never[] }>((resolve, reject) => {
      const write = {
        record,
        commit: () => {
          records.set(record.driverId, json);
          resolve({ rows: [] });
        },
        reject,
      };
      writes.push(write);
      if (automatic) write.commit();
    });
  });
  const repository = new DriverProfileRepository({
    isEnabled: () => enabled,
    query,
  } as never);
  const report = vi
    .spyOn(repository, "reportPersistenceFailure")
    .mockImplementation(() => {});
  const audit = new AuditNotificationService();
  const auditWrites = vi.spyOn(audit, "recordAuditLog");
  const service = new DriverProfileService(audit, repository);
  const controller = new DriverProfileController(service);
  const registry = new RegulatoryRegistryService(
    { publishSupplyLifecycleUpdated: vi.fn() } as never,
    audit,
    service,
  );
  const registryController = new RegulatoryRegistryController(registry);
  const reload = async () => {
    const fresh = new DriverProfileService(
      new AuditNotificationService(),
      repository,
    );
    await fresh.onModuleInit();
    return fresh;
  };
  return {
    records,
    writes,
    query,
    repository,
    report,
    audit,
    auditWrites,
    service,
    controller,
    registry,
    registryController,
    reload,
    disable: () => {
      enabled = false;
    },
    autoCommit: () => {
      automatic = true;
    },
  };
}

export const identity = {
  authMode: "bootstrap_headers",
  actorType: "driver_user",
  actorId: "drv-ack-fixture",
  realm: "driver",
  tenantId: null,
  roleFamilies: ["driver"],
  roles: [],
  scopes: ["driver:read", "driver:write"],
  requestId: null,
} as const;

export function invoke(
  f: ReturnType<typeof fixture>,
  operation: "create" | "update" | "admin",
) {
  const command = {
    name: "Saved Fixture",
    driverSurname: "Explicit Fixture",
    phone: "123",
  };
  if (operation === "create")
    return f.controller.createProfile(identity as never, command, "req-ack");
  if (operation === "update")
    return f.controller.updateProfile(identity as never, command, "req-ack");
  return f.service.upsertAdminProfile(identity.actorId, command, "req-ack");
}
