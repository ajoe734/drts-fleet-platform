import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
export const actor: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "system",
  actorId: "11111111-1111-4111-8111-111111111111",
  realm: "platform",
  tenantId: null,
  roles: [],
  roleFamilies: ["platform"],
  scopes: ["regulatory:read", "regulatory:write"],
  requestId: null,
};
export const vid = "22222222-2222-4222-8222-222222222222",
  did = "33333333-3333-4333-8333-333333333333",
  sid = "44444444-4444-4444-8444-444444444444";
export function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export async function fixture() {
  const audit = new AuditNotificationService();
  const profile = new DriverProfileService(audit);
  const events = {
    publishSupplyLifecycleUpdated: () => {},
    publishDriverLocationUpdated: () => {},
  };
  const seeded = new RegulatoryRegistryService(events as never, audit, profile);
  type Store = {
    vehicles: Record<string, unknown>[];
    drivers: Record<string, unknown>[];
    profiles: Record<string, unknown>[];
    credentials: Record<string, unknown>[];
    history: Record<string, unknown>[];
  };
  let state: Store = {
    vehicles: [
      { ...seeded.listVehicles()[0]!, vehicleId: vid, plateNo: "REAL-123" },
    ],
    drivers: [{ ...seeded.listDrivers()[0]!, driverId: did }],
    profiles: [
      {
        vehicle_id: vid,
        make: "Actual Make",
        model: "Actual Model",
        model_year: 2025,
        door_count: 4,
        color: "yellow",
        status: "incomplete",
        missing_field_codes: [],
        verified_by_actor_id: null,
        verified_at: null,
        source_submission_id: sid,
        version: 4,
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    credentials: [
      {
        driver_id: did,
        registration_no: "REAL-REG-9876",
        registration_area: "KHH",
        effective_from: "2025-01-01",
        effective_until: "2099-12-31",
        status: "unverified",
        masked_display: "RE***76",
        verified_by_actor_id: null,
        verified_at: null,
        source_submission_id: sid,
        version: 2,
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    history: [],
  };
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const control = {
    enabled: true,
    failWrite: false,
    failAudit: false,
    loseCommitAck: false,
    gate: null as ReturnType<typeof deferred> | null,
  };
  async function query(
    sql: string,
    values: readonly unknown[] = [],
    tx?: { state: Store },
  ) {
    calls.push({ sql, values: structuredClone(values) });
    const s = tx?.state ?? state;
    const text = sql.replace(/\s+/g, " ").trim();
    if (
      text.includes("INSERT INTO reg.vehicle_passenger_disclosure_profiles")
    ) {
      if (control.gate) await control.gate.promise;
      if (control.failWrite) throw new Error("Original storage refused");
      s.profiles = [
        {
          vehicle_id: values[0],
          make: values[1],
          model: values[2],
          model_year: values[3],
          door_count: values[4],
          color: values[5],
          status: values[6],
          missing_field_codes: JSON.parse(String(values[7])),
          verified_by_actor_id: values[8],
          verified_at: values[9],
          source_submission_id: values[10],
          version: values[11],
          updated_at: new Date().toISOString(),
        },
      ];
    } else if (
      text.includes("INSERT INTO reg.driver_public_registration_credentials") &&
      text.includes("VALUES")
    ) {
      if (control.failWrite) throw new Error("Original storage refused");
      s.credentials = [
        {
          driver_id: values[0],
          registration_no: values[1],
          registration_area: values[2],
          effective_from: values[3],
          effective_until: values[4],
          status: values[5],
          masked_display: values[6],
          verified_by_actor_id: values[7],
          verified_at: values[8],
          source_submission_id: values[9],
          version: values[10],
          updated_at: new Date().toISOString(),
        },
      ];
    } else if (text.includes("INSERT INTO admin.audit_logs")) {
      if (control.failAudit) throw new Error("Audit refused");
      s.history.push({ new_value: JSON.parse(String(values[9])) });
    } else if (text.includes("INSERT INTO reg.phase1_registry_vehicles")) {
      const record = values.find(
        (x) => typeof x === "string" && x.includes('"vehicleId"'),
      );
      s.vehicles = [JSON.parse(String(record))];
    } else if (text.includes("INSERT INTO reg.phase1_registry_drivers")) {
      const record = values.find(
        (x) => typeof x === "string" && x.includes('"driverId"'),
      );
      s.drivers = [JSON.parse(String(record))];
    }
    if (text.startsWith("SELECT")) {
      if (text.includes("FROM reg.phase1_registry_vehicles"))
        return {
          rows: s.vehicles
            .filter((x) => !values.length || x.vehicleId === values[0])
            .map((record) => ({ record: structuredClone(record) })),
        };
      if (text.includes("FROM reg.phase1_registry_drivers"))
        return {
          rows: s.drivers
            .filter((x) => !values.length || x.driverId === values[0])
            .map((record) => ({ record: structuredClone(record) })),
        };
      if (text.includes("FROM reg.vehicle_passenger_disclosure_profiles"))
        return {
          rows: structuredClone(
            s.profiles.filter(
              (x) => !values.length || x.vehicle_id === values[0],
            ),
          ),
        };
      if (text.includes("FROM reg.driver_public_registration_credentials"))
        return {
          rows: structuredClone(
            s.credentials.filter(
              (x) => !values.length || x.driver_id === values[0],
            ),
          ),
        };
      if (text.includes("FROM admin.audit_logs"))
        return {
          rows: structuredClone(
            s.history.filter((x) => {
              const d = (
                x.new_value as {
                  p5Review: { subjectType: string; subjectId: string };
                }
              ).p5Review;
              return (
                `p5_disclosure_${d.subjectType}` === values[0] &&
                d.subjectId === values[1]
              );
            }),
          ),
        };
    }
    return { rows: [] };
  }
  const db = {
    isEnabled: () => control.enabled,
    query,
    connect: async () => {
      const tx = { state: structuredClone(state) };
      return {
        query: async (sql: string, values?: readonly unknown[]) => {
          if (sql === "BEGIN") return { rows: [] };
          if (sql === "COMMIT") {
            state = tx.state;
            if (control.loseCommitAck) {
              control.loseCommitAck = false;
              throw new Error("COMMIT response lost");
            }
            return { rows: [] };
          }
          if (sql === "ROLLBACK") return { rows: [] };
          return query(sql, values, tx);
        },
        release: () => {},
      };
    },
  };
  const repository = new RegulatoryRegistryRepository(db as never);
  const service = new RegulatoryRegistryService(
    events as never,
    audit,
    profile,
    repository,
  );
  await service.onModuleInit();
  service.onModuleDestroy();
  const controller = new RegulatoryRegistryController(service);
  return {
    service,
    controller,
    repository,
    control,
    calls,
    state: () => state,
    fresh: () =>
      new RegulatoryRegistryService(
        events as never,
        new AuditNotificationService(),
        profile,
        new RegulatoryRegistryRepository(db as never),
      ),
  };
}
export const command = (
  version = 4,
  action: "approve" | "return" = "approve",
) => ({
  expectedVersion: version,
  sourceSubmissionId: sid,
  action,
  reason:
    action === "approve"
      ? "Reviewed original records"
      : "Please correct source",
});
