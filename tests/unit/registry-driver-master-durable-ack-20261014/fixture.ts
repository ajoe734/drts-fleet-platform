import { EventEmitter } from "node:events";
import { expect, vi } from "vitest";
import type { DriverRegistryRecord } from "@drts/contracts";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

export async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

export function observe<T>(result: T) {
  const state: { status: string; value?: Awaited<T>; error?: unknown } = {
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

export function fixture(storage: "enabled" | "missing" = "enabled") {
  // Production service/controller/repositories/audit; only external queries
  // are controlled. These maps model query ACKs, not PostgreSQL behavior.
  const records = new Map<string, string>();
  const profiles = new Map<string, string>();
  const writes: {
    record: DriverRegistryRecord;
    commit: () => void;
    reject: (error: Error) => void;
  }[] = [];
  let enabled = true;
  let profileEnabled = true;
  const query = vi.fn((sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
      expect(sql).toContain("$6::jsonb");
      expect(params).toHaveLength(6);
      const json = params![5] as string;
      const record = JSON.parse(json) as DriverRegistryRecord;
      expect(params!.slice(0, 4)).toEqual([
        record.driverId,
        record.name,
        record.workState,
        record.licensesValid,
      ]);
      return new Promise<{ rows: never[] }>((resolve, reject) => {
        writes.push({
          record,
          commit: () => {
            records.set(record.driverId, json);
            resolve({ rows: [] });
          },
          reject,
        });
      });
    }
    if (sql.includes("FROM reg.phase1_registry_drivers")) {
      return Promise.resolve({
        rows: [...records.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
  const repository = new RegulatoryRegistryRepository({
    isEnabled: () => enabled,
    query,
    connect: async () => ({ query, release: () => {} }),
  } as never);
  const report = vi
    .spyOn(repository, "reportPersistenceFailure")
    .mockImplementation(() => {});
  const profileRepository = new DriverProfileRepository({
    isEnabled: () => profileEnabled,
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO ops.phase1_driver_profiles")) {
        profiles.set(params![0] as string, params![2] as string);
        return { rows: [] };
      }
      return {
        rows: [...profiles.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      };
    },
  } as never);
  const audit = new AuditNotificationService();
  const auditWrites = vi.spyOn(audit, "recordAuditLog");
  const profile = new DriverProfileService(audit, profileRepository);
  const ops = new OpsDispatchEventsService(new EventEmitter() as never);
  const service = new RegulatoryRegistryService(
    ops,
    audit,
    profile,
    storage === "missing" ? undefined : repository,
  );
  const controller = new RegulatoryRegistryController(service);
  const reload = async () => {
    const freshProfile = new DriverProfileService(
      new AuditNotificationService(),
      profileRepository,
    );
    await freshProfile.onModuleInit();
    const fresh = new RegulatoryRegistryService(
      ops,
      new AuditNotificationService(),
      freshProfile,
      repository,
    );
    await fresh.onModuleInit();
    await fresh.onModuleDestroy();
    return fresh;
  };
  return {
    service,
    controller,
    repository,
    profile,
    profiles,
    records,
    writes,
    auditWrites,
    report,
    query,
    reload,
    disable: () => {
      enabled = false;
    },
    disableProfile: () => {
      profileEnabled = false;
    },
  };
}

export const operations = [
  "create",
  "buckets",
  "lifecycle",
  "licenses",
] as const;
export type Operation = (typeof operations)[number];
export const actionNames = {
  create: "create_driver_master",
  buckets: "update_driver_service_buckets",
  lifecycle: "update_driver_master_lifecycle",
  licenses: "update_driver_licenses",
};
export function driverId(operation: Operation) {
  return operation === "create" ? "drv-master-ack" : "drv-demo-001";
}
export function read(f: ReturnType<typeof fixture>, operation: Operation) {
  return f.service
    .listDrivers()
    .find((driver) => driver.driverId === driverId(operation));
}
export function invoke(f: ReturnType<typeof fixture>, operation: Operation) {
  if (operation === "create")
    return f.controller.createDriver(
      {
        driverId: driverId(operation),
        name: "Master ACK",
        lifecycleStatus: "active",
        licensesValid: true,
      },
      "request-master",
    );
  if (operation === "buckets")
    return f.controller.updateDriverServiceBuckets(
      driverId(operation),
      {
        supportedServiceBuckets: ["business_dispatch"],
        reason: "bucket control",
      },
      "request-master",
    );
  if (operation === "lifecycle")
    return f.controller.updateDriverLifecycle(
      driverId(operation),
      {
        lifecycleStatus: "suspended",
        reason: "lifecycle control",
      },
      "request-master",
    );
  return f.controller.updateDriverLicenses(
    driverId(operation),
    {
      licensesValid: false,
      reason: "license control",
    },
    "request-master",
  );
}
