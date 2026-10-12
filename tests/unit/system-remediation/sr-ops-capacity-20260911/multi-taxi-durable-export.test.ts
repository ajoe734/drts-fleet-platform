import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultiTaxiTripOperationalExportRow } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { MultiTaxiController } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { queueFixture } from "./reporting-queue-fixture";

const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "capacity-export-admin",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: ["records_exporter"],
  scopes: ["multi_taxi_records:export"],
  requestId: "capacity-export-identity",
};
const command = {
  scope: { month: "2026-10" },
  purpose: "Durable operations export verification",
  idempotencyKey: "capacity-export-commit",
};
const rows: MultiTaxiTripOperationalExportRow[] = [
  {
    orderNoMasked: "CAP...01",
    plateNoMasked: "TEST...01",
    reservedAt: "2026-10-12T01:00:00.000Z",
    pickupAt: null,
    dropoffAt: null,
    payableFareMinor: 35000,
    actualFareMinor: null,
    tollMinor: 0,
    currency: "NTD",
    farePolicyVersion: "fare-test",
    chargingMode: "platform_quote",
    generatedAt: "2026-10-12T01:31:00.000Z",
    retainUntil: "2028-10-12T01:31:00.000Z",
  },
];
function controllerFor(f: ReturnType<typeof queueFixture>) {
  const source = {
    exportTripOperationalRecords: vi.fn().mockResolvedValue({ rows }),
  };
  return new MultiTaxiController(
    source as unknown as MultiTaxiService,
    f.service,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("multi-taxi export durable acknowledgement", () => {
  it("does not acknowledge or publish a job before its actual repository INSERT finishes", async () => {
    const f = queueFixture();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    f.control.before = async (sql) => {
      if (sql.includes("INSERT INTO admin.phase1_report_jobs")) {
        entered = true;
        await barrier;
      }
    };
    let returned = false;
    const response = controllerFor(f)
      .createTripOperationalExportJob(command, identity, "capacity-export-ack")
      .then((value) => {
        returned = true;
        return value;
      });
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(returned).toBe(false);
      expect(f.stored.size).toBe(0);
      expect(
        f.audit
          .listAuditLogs()
          .some(
            (log) => log.actionName === "create_multi_taxi_trip_export_job",
          ),
      ).toBe(false);
    } finally {
      release();
      await response;
      await f.service.onModuleDestroy();
    }
  });
});
