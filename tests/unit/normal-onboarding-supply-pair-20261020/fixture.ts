import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const { EventEmitter2 } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/event-emitter");
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplyReviewService } from "../../../apps/api/src/modules/fleet-partner/supply-review.service";
import type {
  SupplySubmissionRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";

type Row = Record<string, any>;
type Tables = Map<string, Map<string, Row>>;

/** Controlled storage only: original repositories, transaction, approval and
 * eligibility decisions run unchanged. This is not PostgreSQL lock proof. */
export class OnboardingSqlPort {
  tables: Tables = new Map();
  calls: {
    sql: string;
    values: readonly unknown[];
    transaction: number | null;
  }[] = [];
  failSql: RegExp | null = null;
  rejectCommit = false;
  beforeCommit?: () => void;
  loseCommitAck = false;
  private counter = 0;
  isEnabled() {
    return true;
  }
  table(name: string, tables = this.tables) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  }
  query = (sql: string, values: readonly unknown[] = []) =>
    this.execute(sql, values, this.tables, null);
  async connect() {
    const transaction = ++this.counter;
    let staged = structuredClone(this.tables);
    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        if (sql === "BEGIN") staged = structuredClone(this.tables);
        if (sql === "COMMIT") {
          this.beforeCommit?.();
          if (this.rejectCommit)
            throw Object.assign(new Error("controlled COMMIT rejected"), {
              code: "40001",
            });
          this.tables = staged;
          if (this.loseCommitAck)
            throw new Error("controlled committed ACK loss");
        }
        return this.execute(sql, values, staged, transaction);
      },
      release() {},
    };
  }
  private async execute(
    raw: string,
    values: readonly unknown[],
    tables: Tables,
    transaction: number | null,
  ): Promise<any> {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, values: structuredClone(values), transaction });
    if (this.failSql?.test(sql)) throw new Error("controlled storage failure");
    const result = (rows: Row[] = []) => ({
      rows: structuredClone(rows),
      rowCount: rows.length,
      command: "",
      oid: 0,
      fields: [],
    });
    if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return result();
    if (sql.startsWith("INSERT INTO")) {
      const match =
        /^INSERT INTO ([\w.]+) \((.*?)\) VALUES \((.*?)\)(?: |$)/.exec(sql);
      if (!match) throw new Error(`Unsupported controlled insert: ${sql}`);
      const [, table, columns, params] = match;
      const row: Row = {};
      const args = params!.split(",").map((part) => part.trim());
      columns!.split(",").forEach((part, i) => {
        const token = args[i] ?? "";
        const index = /^\$(\d+)/.exec(token);
        let value = index
          ? values[Number(index[1]) - 1]
          : new Date().toISOString();
        if (token.includes("::jsonb") && typeof value === "string")
          value = JSON.parse(value);
        row[part.trim()] = value;
      });
      this.table(table!, tables).set(
        String(row[columns!.split(",")[0]!.trim()]),
        row,
      );
      return result(sql.includes("RETURNING") ? [row] : []);
    }
    if (sql.startsWith("UPDATE fleet.supply_submissions")) {
      const row = this.table("fleet.supply_submissions", tables).get(
        String(values[0]),
      );
      if (
        !row ||
        row.fleet_partner_id !== values[1] ||
        row.revision_no !== values[2] ||
        !(values[16] as string[]).includes(row.status)
      )
        return result();
      const next: Row = {
        ...row,
        status: values[3],
        revision_no: row.revision_no + 1,
      };
      [
        "submitted_by",
        "submitted_at",
        "review_started_by",
        "review_started_at",
        "reviewed_by",
        "reviewed_at",
        "review_reason_code",
        "review_comment",
        "canonical_driver_id",
        "canonical_vehicle_id",
        "canonical_contract_id",
        "canonical_policy_id",
      ].forEach((key, i) => {
        if (values[i + 4] !== null) next[key] = values[i + 4];
      });
      this.table("fleet.supply_submissions", tables).set(
        String(values[0]),
        next,
      );
      return result([next]);
    }
    if (sql.startsWith("WITH vehicles AS MATERIALIZED")) {
      const vehicles = [
        ...this.table("reg.phase1_registry_vehicles", tables).values(),
      ].filter((r) => r.record.supportedServiceBuckets.includes(values[0]));
      const ids = new Set(vehicles.map((r) => r.vehicle_id));
      const pairs = [
        ...this.table("reg.phase1_registry_supply_pairs", tables).values(),
      ].filter((r) => ids.has(r.vehicle_id));
      const drivers = [
        ...this.table("reg.phase1_registry_drivers", tables).values(),
      ].filter((r) => pairs.some((p) => p.driver_id === r.driver_id));
      const byVehicle = (table: string) =>
        [...this.table(table, tables).values()].filter((r) =>
          ids.has(r.vehicle_id),
        );
      return result([
        {
          vehicles,
          drivers,
          pairs,
          contracts: byVehicle("reg.phase1_registry_contracts"),
          policies: byVehicle("reg.phase1_registry_policies"),
          exclusivities: byVehicle("reg.phase1_registry_exclusivities"),
          disclosures: byVehicle("reg.vehicle_passenger_disclosure_profiles"),
          credentials: [],
          locations: [],
        },
      ]);
    }
    const table = /FROM ([\w.]+)/.exec(sql)?.[1];
    if (table) {
      let rows = [...this.table(table, tables).values()];
      for (const match of sql.matchAll(/(?:WHERE|AND) ([a-z_]+) = \$(\d+)/g))
        rows = rows.filter(
          (row) => row[match[1]!] === values[Number(match[2]) - 1],
        );
      return result(rows);
    }
    throw new Error(`Unsupported controlled SQL: ${sql}`);
  }
}

export function services(database?: OnboardingSqlPort | DatabaseService) {
  const audit = new AuditNotificationService();
  const registryRepository = new RegulatoryRegistryRepository(
    database as never,
  );
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter2()),
    audit,
    new DriverProfileService(audit),
    registryRepository,
  );
  const submissions = new SupplySubmissionRepository(database as never);
  const review = new SupplyReviewService(registry, submissions);
  return { registry, registryRepository, submissions, review };
}

export function approvalRecords(registry: RegulatoryRegistryService) {
  const driverId = registry.listDrivers()[0]!.driverId;
  const driverSubmissionId = randomUUID(),
    vehicleSubmissionId = randomUUID();
  const now = new Date().toISOString();
  const base: SupplySubmissionRecord = {
    submissionId: driverSubmissionId,
    fleetPartnerId: "fleet-unit-one",
    submissionType: "driver_onboarding",
    status: "approved",
    revisionNo: 3,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "unit-fleet-user",
    submittedAt: now,
    reviewStartedBy: "unit-reviewer",
    reviewStartedAt: now,
    reviewedBy: "unit-reviewer",
    reviewedAt: now,
    reviewReasonCode: "all_documents_valid",
    reviewComment: null,
    canonicalDriverId: driverId,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: now,
    updatedAt: now,
  };
  const vehicle: SupplySubmissionRecord = {
    ...base,
    submissionId: vehicleSubmissionId,
    submissionType: "vehicle_onboarding",
    status: "in_review",
    revisionNo: 2,
    canonicalDriverId: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  const draft: VehicleSupplyDraft = {
    submissionId: vehicleSubmissionId,
    plateNo: "UNIT-PAIR",
    licenseType: "taxi",
    brand: "Unit brand",
    model: "Unit model",
    modelYear: 2026,
    seatCount: 4,
    luggageCapacity: 2,
    businessArea: "TPE",
    supportedServiceProductCodes: ["taxi_realtime"],
    airportTransferEligible: false,
    fixedFareAllowed: false,
    currentDriverSubmissionId: driverSubmissionId,
    doorCount: 4,
    color: null,
  };
  return { driver: base, vehicle, draft, driverId };
}

export async function durableFixture() {
  const database = new OnboardingSqlPort(),
    f = services(database),
    records = approvalRecords(f.registry);
  await f.submissions.persistChanges({
    submissions: [records.driver, records.vehicle],
    vehicleDrafts: [records.draft],
  });
  await f.registryRepository.persistChangesWithExecutor(database, {
    drivers: [
      f.registry.listDrivers().find((d) => d.driverId === records.driverId)!,
    ],
  });
  return {
    ...f,
    database,
    ...records,
    approve: () =>
      f.review.approveSubmission(
        records.vehicle.submissionId,
        { expectedRevisionNo: 2, reasonCode: "all_documents_valid" },
        "unit-reviewer",
      ),
  };
}
