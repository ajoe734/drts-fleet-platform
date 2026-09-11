// Real Postgres fixture seeding for SR-HOST-FE-001-ACCEPTANCE-RUNNER.
//
// Every table written here is the REAL production schema HostViewRepository
// queries against (infra/migrations/V0002, V0003, V0004, V0011, V0015,
// V0096 — read directly before writing this file, not assumed), not a
// test-only shadow table. All identifiers are fictional per this task's
// guardrails.

// `pg` is only required lazily, inside pool() below, rather than at module
// top level. This file's exported ID/helper constants are imported by both
// the vitest HTTP/SQL suite AND the Playwright browser spec (via
// host-acceptance-seed.ts's shared constants) — the browser spec never
// calls seedHostAcceptanceFixtures/cleanupHostAcceptanceFixtures itself
// (the standalone host-acceptance-server.ts process does that), but
// Playwright's own TypeScript compilation is CommonJS-based, unlike
// vitest's ESM/esbuild pipeline, and does not support the
// `createRequire(import.meta.url)` pattern at module scope — deferring the
// require into the function body means Playwright's compiler never needs
// to evaluate it at all.
import path from "node:path";
import { createRequire } from "node:module";

export const HOST_A_PARTNER_ID = "a0000000-0000-4000-8000-00000000000a";
export const HOST_B_PARTNER_ID = "a0000000-0000-4000-8000-00000000000b";
export const HOST_UNRELATED_PARTNER_ID = "a0000000-0000-4000-8000-00000000000c";
export const HOST_BULK_PARTNER_ID = "a0000000-0000-4000-8000-00000000000d";
export const FLEET_OPERATOR_PARTNER_ID = "a0000000-0000-4000-8000-0000000000f1";

export const VEHICLE_A1 = "b0000000-0000-4000-8000-0000000000a1";
export const VEHICLE_A2_MAINT = "b0000000-0000-4000-8000-0000000000a2";
export const VEHICLE_A_INACTIVE = "b0000000-0000-4000-8000-0000000000a9";
export const VEHICLE_B1 = "b0000000-0000-4000-8000-0000000000b1";

export const BULK_VEHICLE_COUNT = 205;
export function bulkVehicleId(index: number): string {
  return `b0000000-0000-4000-9000-${String(index).padStart(12, "0")}`;
}

export const ORDER_A1_TRIP1 = "sr-host-fe-001-order-a1-001";
export const TASK_A1_TRIP1 = "sr-host-fe-001-task-a1-001";
export const DISPATCH_JOB_A1_TRIP1 = "sr-host-fe-001-dispatch-a1-001";
export const ASSIGNMENT_A1_TRIP1 = "sr-host-fe-001-assignment-a1-001";
export const CASE_A1 = "sr-host-fe-001-case-a1-001";

function pool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL must be set for SR-HOST-FE-001-ACCEPTANCE-RUNNER seeding.",
    );
  }
  const apiRequire = createRequire(
    path.resolve(__dirname, "../../../../apps/api/package.json"),
  );
  const { Pool } = apiRequire("pg") as typeof import("pg");
  return new Pool({ connectionString: databaseUrl });
}

/**
 * Seeds the full Host acceptance fixture set: two owning hosts (A, B), an
 * unrelated identity with no vehicles, a bulk host with 205 vehicles (to
 * expose the frontend's fixed 200-row lookup limitation honestly rather than
 * hiding it), an inactive vehicle (must not appear in any listing), real
 * maintenance rows, and real trip/case rows that HostViewRepository's SQL
 * cannot actually reach (see host-api-sql-acceptance.test.ts's
 * "known defects" suite) despite the underlying data genuinely existing.
 */
export async function seedHostAcceptanceFixtures(): Promise<void> {
  const db = pool();
  try {
    await db.query(
      `INSERT INTO core.partners (partner_id, partner_code, partner_name, partner_type, status)
       VALUES
         ($1, 'UAT_HOST_A', 'UAT Host A', 'individual_owner', 'active'),
         ($2, 'UAT_HOST_B', 'UAT Host B', 'individual_owner', 'active'),
         ($3, 'UAT_HOST_UNRELATED', 'UAT Unrelated Identity', 'individual_owner', 'active'),
         ($4, 'UAT_HOST_BULK', 'UAT Host Bulk', 'individual_owner', 'active'),
         ($5, 'UAT_FLEET_OPERATOR', 'UAT Metro Fleet Operator', 'fleet_company_partner', 'active')
       ON CONFLICT (partner_id) DO NOTHING`,
      [
        HOST_A_PARTNER_ID,
        HOST_B_PARTNER_ID,
        HOST_UNRELATED_PARTNER_ID,
        HOST_BULK_PARTNER_ID,
        FLEET_OPERATOR_PARTNER_ID,
      ],
    );

    await db.query(
      `INSERT INTO reg.vehicles
         (vehicle_id, plate_no, vin, vehicle_form, license_class, energy_type,
          owner_type, owner_partner_id, dispatch_partner_id, current_status, active_flag)
       VALUES
         ($1, 'UAT-A001', 'UATVIN0000000A001', 'sedan', 'multi_taxi', 'ev',
          'individual_owner', $5, $6, 'active', true),
         ($2, 'UAT-A002', 'UATVIN0000000A002', 'mpv', 'taxi', 'hybrid',
          'individual_owner', $5, $6, 'maintenance', true),
         ($3, 'UAT-A009', 'UATVIN0000000A009', 'sedan', 'taxi', 'fuel',
          'individual_owner', $5, $6, 'suspended', false),
         ($4, 'UAT-B001', 'UATVIN0000000B001', 'sedan', 'multi_taxi', 'fuel',
          'individual_owner', $7, $6, 'active', true)
       ON CONFLICT (vehicle_id) DO NOTHING`,
      [
        VEHICLE_A1,
        VEHICLE_A2_MAINT,
        VEHICLE_A_INACTIVE,
        VEHICLE_B1,
        HOST_A_PARTNER_ID,
        FLEET_OPERATOR_PARTNER_ID,
        HOST_B_PARTNER_ID,
      ],
    );

    await db.query(
      `INSERT INTO reg.vehicle_contracts
         (vehicle_id, partner_id, partner_type, contract_type, service_scope, start_at, end_at, status)
       VALUES
         ($1, $2, 'individual_owner', 'owner_operating_contract', 'standard_taxi',
          '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'active')`,
      [VEHICLE_A1, HOST_A_PARTNER_ID],
    );

    await db.query(
      `INSERT INTO ops.phase1_maintenance_logs
         (log_id, vehicle_id, status, maintenance_type, description,
          scheduled_date, completed_date, cost_amount, notes, created_at, updated_at, record)
       VALUES
         ('sr-host-fe-001-maint-a1-completed', $1, 'completed', 'oil_change',
          'UAT oil change', '2026-02-01', '2026-02-01', 1200.00, 'UAT note',
          now(), now(), '{}'::jsonb),
         ('sr-host-fe-001-maint-a1-scheduled', $1, 'scheduled', 'brake_inspection',
          'UAT brake inspection', '2026-09-20', NULL, NULL, NULL,
          now(), now(), '{}'::jsonb)
       ON CONFLICT (log_id) DO NOTHING`,
      [VEHICLE_A1],
    );

    // Real trip/case source data. HostViewRepository's SQL for these two
    // endpoints references columns (`vehicle_id`, `started_at`,
    // `completed_at`, `actual_distance_km`, `fare` on
    // ops.phase1_driver_tasks; `vehicle_id` on
    // ops.phase1_dispatch_assignments) that do not exist on the real
    // production schema (both tables only carry a `record jsonb` payload —
    // see infra/migrations/V0011__phase1_runtime_snapshots.sql and the
    // `record->>'driverId'` expression index in
    // V0020__settlement_driver_index.sql, which confirms the real access
    // pattern for this table family is through `record`, not top-level
    // columns). This fixture stores the exact real data those two READ
    // paths are supposed to serve, entirely inside `record`, precisely so
    // the acceptance test proves the failure is in the query, not in
    // absent data.
    await db.query(
      `INSERT INTO ops.phase1_owned_orders (order_id, order_no, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at, record)
       VALUES ($1, 'UAT-ORDER-A1-001', 'completed', 'app', 'standard_taxi', 'immediate', now(), now(), $2::jsonb)`,
      [
        ORDER_A1_TRIP1,
        JSON.stringify({
          pickup: { address: "台北市信義區UAT測試路1號" },
          dropoff: { address: "台北市內湖區UAT測試路2號" },
          quotedFare: { amount: 350 },
        }),
      ],
    );

    await db.query(
      `INSERT INTO ops.phase1_dispatch_jobs (dispatch_job_id, order_id, status, created_at, updated_at, record)
       VALUES ($1, $2, 'completed', now(), now(), '{}'::jsonb)`,
      [DISPATCH_JOB_A1_TRIP1, ORDER_A1_TRIP1],
    );

    await db.query(
      `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
       VALUES ($1, $2, $3, $4, 'completed', now(), now(), $5::jsonb)`,
      [
        ASSIGNMENT_A1_TRIP1,
        DISPATCH_JOB_A1_TRIP1,
        ORDER_A1_TRIP1,
        TASK_A1_TRIP1,
        JSON.stringify({ vehicleId: VEHICLE_A1 }),
      ],
    );

    await db.query(
      `INSERT INTO ops.phase1_driver_tasks (task_id, order_id, dispatch_job_id, assignment_id, status, created_at, updated_at, record)
       VALUES ($1, $2, $3, $4, 'completed', now(), now(), $5::jsonb)`,
      [
        TASK_A1_TRIP1,
        ORDER_A1_TRIP1,
        DISPATCH_JOB_A1_TRIP1,
        ASSIGNMENT_A1_TRIP1,
        JSON.stringify({
          vehicleId: VEHICLE_A1,
          startedAt: "2026-03-01T08:00:00.000Z",
          completedAt: "2026-03-01T08:30:00.000Z",
          actualDistanceKm: 8.4,
          fare: { amount: 350 },
        }),
      ],
    );

    await db.query(
      `INSERT INTO crm.phase1_complaint_cases (case_no, status, sla_due_at, created_at, updated_at, record)
       VALUES ($1, 'open', now() + interval '2 days', now(), now(), $2::jsonb)`,
      [
        CASE_A1,
        JSON.stringify({
          relatedVehicleId: VEHICLE_A1,
          category: "vehicle_condition",
          closingNote: null,
        }),
      ],
    );

    // Bulk host: 205 active vehicles so a page-size-200 lookup (the
    // frontend's VEHICLE_LOOKUP_PAGE_SIZE constant in host-data.server.ts)
    // provably cannot see vehicle #201+ even though they are genuinely
    // owned and active. Batched inserts, not one row per round trip.
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 1; i <= BULK_VEHICLE_COUNT; i += 1) {
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, 'sedan', 'taxi', 'fuel', 'individual_owner', $${base + 4}, 'active', true)`,
      );
      params.push(
        bulkVehicleId(i),
        `UAT-BULK-${String(i).padStart(4, "0")}`,
        `UATVINBULK${String(i).padStart(8, "0")}`,
        HOST_BULK_PARTNER_ID,
      );
    }
    await db.query(
      `INSERT INTO reg.vehicles
         (vehicle_id, plate_no, vin, vehicle_form, license_class, energy_type, owner_type, owner_partner_id, current_status, active_flag)
       VALUES ${values.join(",\n")}
       ON CONFLICT (vehicle_id) DO NOTHING`,
      params,
    );
  } finally {
    await db.end();
  }
}

/**
 * Removes every row this fixture created. Scoped strictly to the fictional
 * IDs this file owns, in FK-safe order (children before parents).
 */
export async function cleanupHostAcceptanceFixtures(): Promise<void> {
  const db = pool();
  try {
    await db.query(`DELETE FROM crm.phase1_complaint_cases WHERE case_no = $1`, [
      CASE_A1,
    ]);
    await db.query(`DELETE FROM ops.phase1_driver_tasks WHERE task_id = $1`, [
      TASK_A1_TRIP1,
    ]);
    await db.query(
      `DELETE FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1`,
      [ASSIGNMENT_A1_TRIP1],
    );
    await db.query(
      `DELETE FROM ops.phase1_dispatch_jobs WHERE dispatch_job_id = $1`,
      [DISPATCH_JOB_A1_TRIP1],
    );
    await db.query(`DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`, [
      ORDER_A1_TRIP1,
    ]);
    await db.query(
      `DELETE FROM ops.phase1_maintenance_logs WHERE vehicle_id = $1`,
      [VEHICLE_A1],
    );
    await db.query(`DELETE FROM reg.vehicle_contracts WHERE vehicle_id = $1`, [
      VEHICLE_A1,
    ]);
    await db.query(
      `DELETE FROM reg.vehicles WHERE owner_partner_id IN ($1, $2, $3, $4)`,
      [HOST_A_PARTNER_ID, HOST_B_PARTNER_ID, HOST_UNRELATED_PARTNER_ID, HOST_BULK_PARTNER_ID],
    );
    await db.query(
      `DELETE FROM core.partners WHERE partner_id IN ($1, $2, $3, $4, $5)`,
      [
        HOST_A_PARTNER_ID,
        HOST_B_PARTNER_ID,
        HOST_UNRELATED_PARTNER_ID,
        HOST_BULK_PARTNER_ID,
        FLEET_OPERATOR_PARTNER_ID,
      ],
    );
  } finally {
    await db.end();
  }
}
