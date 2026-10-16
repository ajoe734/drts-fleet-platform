import { expect, vi } from "vitest";

import type { DriverSettings } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSettingsController } from "../../../apps/api/src/modules/driver-settings/driver-settings.controller";
import { DriverSettingsRepository } from "../../../apps/api/src/modules/driver-settings/driver-settings.repository";
import { DriverSettingsService } from "../../../apps/api/src/modules/driver-settings/driver-settings.service";

export async function flush() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

export function observe<T>(result: T) {
  const state: {
    status: "pending" | "fulfilled" | "rejected";
    value?: Awaited<T>;
    error?: unknown;
  } = {
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

export interface ControlledSettingsWrite {
  driverId: string;
  updatedAt: string;
  record: DriverSettings;
  commit: () => void;
  rejectBeforeCommit: (error: Error) => void;
  rejectAfterCommitUncertain: (error: Error) => void;
}

export function createSettingsFixture() {
  // Only the external DatabaseService.query I/O boundary is controlled.
  // Controller, service, repository SQL generation, audit, and notification
  // interception run unchanged production code.
  const records = new Map<string, { updatedAt: string; json: string }>();
  const writes: ControlledSettingsWrite[] = [];
  let enabled = true;
  let automatic = false;

  const query = vi.fn((sql: string, params?: unknown[]) => {
    if (!params) {
      expect(sql).toContain("FROM ops.phase1_driver_settings");
      const sorted = [...records.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      return Promise.resolve({
        rows: sorted.map((entry) => ({
          record: JSON.parse(entry.json) as DriverSettings,
        })),
      });
    }

    expect(sql).toContain("INSERT INTO ops.phase1_driver_settings");
    expect(sql).toContain("$3::jsonb");
    expect(params).toHaveLength(3);
    const driverId = params[0] as string;
    const updatedAt = params[1] as string;
    const json = params[2] as string;
    const record = JSON.parse(json) as DriverSettings;
    expect(record.driverId).toBe(driverId);
    expect(record.updatedAt).toBe(updatedAt);

    return new Promise<{ rows: never[] }>((resolve, reject) => {
      const write: ControlledSettingsWrite = {
        driverId,
        updatedAt,
        record,
        commit: () => {
          records.set(driverId, { updatedAt, json });
          resolve({ rows: [] });
        },
        rejectBeforeCommit: (error: Error) => {
          reject(error);
        },
        rejectAfterCommitUncertain: (error: Error) => {
          // Simulates a transport/connection drop after the database server
          // has already committed the row: SQL was not rolled back, but the
          // caller receives an error instead of an authoritative ACK.
          records.set(driverId, { updatedAt, json });
          reject(error);
        },
      };
      writes.push(write);
      if (automatic) {
        write.commit();
      }
    });
  });

  const repository = new DriverSettingsRepository({
    isEnabled: () => enabled,
    query,
  } as never);
  const report = vi
    .spyOn(repository, "reportPersistenceFailure")
    .mockImplementation(() => {});
  const audit = new AuditNotificationService();
  const auditWrites = vi.spyOn(audit, "recordAuditLog");
  const service = new DriverSettingsService(audit, repository);
  const controller = new DriverSettingsController(service);

  const reload = async () => {
    const freshAudit = new AuditNotificationService();
    const freshService = new DriverSettingsService(freshAudit, repository);
    await freshService.onModuleInit();
    const freshController = new DriverSettingsController(freshService);
    return {
      audit: freshAudit,
      service: freshService,
      controller: freshController,
    };
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
    reload,
    disable: () => {
      enabled = false;
    },
    enable: () => {
      enabled = true;
    },
    autoCommit: (value = true) => {
      automatic = value;
    },
  };
}

export function buildDriverIdentity(
  actorId = "drv-ack-001",
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId: null,
  };
}
