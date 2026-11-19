import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DispatchableSupplySnapshotRecord } from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import {
  summarizeSupplySnapshotsByMonth,
  type DispatchableSupplyMonthTotal,
} from "../../../apps/api/src/modules/reporting/operations-metrics";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";

// Runs the production per-month supply SQL on the migrated CI PostgreSQL and
// checks it against the in-process reduction (Asia/Taipei months, complete
// samples only, filters). Rows are written inside a transaction that is rolled
// back, under business areas unique to this run, in months nobody else uses.

const require = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

const RUN = randomUUID().slice(0, 8);
const AREA_A = `SYN-PG-A-${RUN}`;
const AREA_B = `SYN-PG-B-${RUN}`;
const PRODUCT_P = "syn-pg-product-p";
const PRODUCT_Q = "syn-pg-product-q";
const PERIODS = ["2001-01", "2001-02", "2001-03"];

function snapshot(
  snapshotAt: string,
  businessArea: string,
  serviceProductCode: string,
  dispatchableVehicleCount: number,
  sourceHealth: DispatchableSupplySnapshotRecord["sourceHealth"] = "complete",
): DispatchableSupplySnapshotRecord {
  return {
    snapshotAt,
    businessArea,
    serviceProductCode,
    dispatchableVehicleCount,
    availableDriverCount: dispatchableVehicleCount,
    sourceHealth,
    generatedAt: snapshotAt,
  };
}

const SNAPSHOTS = [
  // Taipei 2000-12-31 23:45: before the window.
  snapshot("2000-12-31T15:45:00.000Z", AREA_A, PRODUCT_P, 90),
  // Taipei 2001-01-01 00:00: the first instant of the window.
  snapshot("2000-12-31T16:00:00.000Z", AREA_A, PRODUCT_P, 2),
  snapshot("2001-01-15T04:00:00.000Z", AREA_A, PRODUCT_P, 7),
  snapshot("2001-01-15T04:15:00.000Z", AREA_A, PRODUCT_P, 40, "location_stale"),
  // Taipei 2001-01-31 23:59:59 vs 2001-02-01 00:00.
  snapshot("2001-01-31T15:59:59.000Z", AREA_A, PRODUCT_Q, 3),
  snapshot("2001-01-31T16:00:00.000Z", AREA_A, PRODUCT_Q, 11),
  snapshot(
    "2001-02-10T00:00:00.000Z",
    AREA_B,
    PRODUCT_P,
    8,
    "location_missing",
  ),
  snapshot("2001-03-31T15:45:00.000Z", AREA_B, PRODUCT_P, 6),
  // Taipei 2001-04-01 00:00: after the window.
  snapshot("2001-03-31T16:00:00.000Z", AREA_B, PRODUCT_P, 80),
  // Taipei 2001-12-31 23:45: a December window ends at 2002-01-01 Taipei.
  snapshot("2001-12-31T15:45:00.000Z", AREA_A, PRODUCT_P, 4),
];

function ordered(totals: DispatchableSupplyMonthTotal[]) {
  return totals
    .filter((total) => [AREA_A, AREA_B].includes(total.businessArea))
    .sort((left, right) =>
      `${left.periodMonth}|${left.businessArea}|${left.serviceProductCode}`.localeCompare(
        `${right.periodMonth}|${right.businessArea}|${right.serviceProductCode}`,
      ),
    );
}

describe.skipIf(
  process.env.GITHUB_ACTIONS !== "true" || !process.env.DATABASE_URL,
)("per-month dispatchable supply totals on PostgreSQL", () => {
  let pool: InstanceType<typeof Pool>;
  let client: import("pg").PoolClient;
  let repository: ReportingRepository;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
    });
    client = await pool.connect();
    const table = await client.query<{ name: string | null }>(
      "SELECT to_regclass('reporting.dispatchable_supply_snapshots')::text AS name",
    );
    if (!table.rows[0]?.name)
      throw new Error(
        "Migrated reporting.dispatchable_supply_snapshots missing",
      );
    await client.query("BEGIN");
    for (const row of SNAPSHOTS) {
      await client.query(
        `INSERT INTO reporting.dispatchable_supply_snapshots (
           snapshot_at, business_area, service_product_code,
           dispatchable_vehicle_count, available_driver_count,
           source_health, generated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.snapshotAt,
          row.businessArea,
          row.serviceProductCode,
          row.dispatchableVehicleCount,
          row.availableDriverCount,
          row.sourceHealth,
          row.generatedAt,
        ],
      );
    }
    // Production SQL and binds, unchanged, on this transaction's connection.
    const port = {
      isEnabled: () => true,
      query: (sql: string, values?: unknown[]) => client.query(sql, values),
    };
    repository = new ReportingRepository(port as unknown as DatabaseService);
  });

  afterAll(async () => {
    await client?.query("ROLLBACK").catch(() => undefined);
    client?.release();
    await pool?.end();
  });

  it("matches the in-process reduction for the whole window and per filter", async () => {
    for (const filter of [
      {},
      { businessArea: AREA_A },
      { businessArea: AREA_A, serviceProductCode: PRODUCT_Q },
      { serviceProductCode: PRODUCT_P },
    ]) {
      const fromDatabase =
        await repository.summarizeDispatchableSupplySnapshotsByMonth(
          PERIODS,
          filter,
        );
      expect(ordered(fromDatabase)).toEqual(
        ordered(summarizeSupplySnapshotsByMonth(SNAPSHOTS, PERIODS, filter)),
      );
    }
  });

  it("assigns snapshots to Asia/Taipei months at both window edges and the month boundary", async () => {
    const totals = ordered(
      await repository.summarizeDispatchableSupplySnapshotsByMonth(PERIODS),
    );
    expect(totals).toEqual([
      {
        periodMonth: "2001-01",
        businessArea: AREA_A,
        serviceProductCode: PRODUCT_P,
        snapshotCount: 3,
        validSnapshotCount: 2,
        dispatchableVehicleSum: 9,
      },
      {
        periodMonth: "2001-01",
        businessArea: AREA_A,
        serviceProductCode: PRODUCT_Q,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 3,
      },
      {
        periodMonth: "2001-02",
        businessArea: AREA_A,
        serviceProductCode: PRODUCT_Q,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 11,
      },
      {
        periodMonth: "2001-02",
        businessArea: AREA_B,
        serviceProductCode: PRODUCT_P,
        snapshotCount: 1,
        validSnapshotCount: 0,
        dispatchableVehicleSum: 0,
      },
      {
        periodMonth: "2001-03",
        businessArea: AREA_B,
        serviceProductCode: PRODUCT_P,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 6,
      },
    ]);
    // A one-month window keeps only that month.
    expect(
      ordered(
        await repository.summarizeDispatchableSupplySnapshotsByMonth([
          "2001-02",
        ]),
      ).map((total) => total.periodMonth),
    ).toEqual(["2001-02", "2001-02"]);
    // December rolls the upper bound into the next year.
    expect(
      ordered(
        await repository.summarizeDispatchableSupplySnapshotsByMonth([
          "2001-12",
        ]),
      ),
    ).toEqual([
      {
        periodMonth: "2001-12",
        businessArea: AREA_A,
        serviceProductCode: PRODUCT_P,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 4,
      },
    ]);
  });
});
