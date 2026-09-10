import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import {
  DriverLeaveRepository,
  DriverLeaveService,
} from "../../../../apps/api/src/modules/driver-leave";

// Kept in its own file (not filtered out of the main suite via `-t`) so that
// vitest's JSON reporter never records unrelated tests as "pending" for this
// phase: the acceptance gate requires zero skips on every report it checks,
// and a `-t` subset run against a multi-test file would otherwise report the
// non-matching tests as pending/skipped.
const connectionString =
  process.env.DRTS_LEAVE_TEST_DATABASE_URL || process.env.DATABASE_URL;

const EVIDENCE_PATH =
  process.env.LEAVE_ACCEPTANCE_DURABLE_RELOAD_EVIDENCE_PATH ||
  ".artifacts/leave-acceptance/durable-reload-seed.json";

const phase =
  process.env.LEAVE_ACCEPTANCE_PHASE === "post-restart"
    ? "post-restart"
    : "pre-restart";

interface DurableReloadSnapshot {
  leaveId: string;
  driverId: string;
  shiftId: string;
  expected: {
    status: string;
    reviewNotes: string | null;
    impactedShiftIds: string[];
  };
  recordedAt: string;
}

describe("SR-LEAVE-BE-001-ACCEPTANCE-RUNNER: Durable Reload Across a Real PostgreSQL Restart", () => {
  it(`persists exact IDs before restart, then verifies the SAME rows survive with a brand-new process instance [phase=${phase}]`, async () => {
    if (!connectionString) {
      throw new Error(
        "SR-LEAVE-BE-001 Acceptance Requirement: DATABASE_URL or DRTS_LEAVE_TEST_DATABASE_URL " +
          "must be explicitly configured. Suite fails explicitly when DB is unconfigured.",
      );
    }

    // A brand-new DatabaseService/Repository/Service instance on every run of
    // this test, simulating a fresh process reconnecting to PostgreSQL after
    // the runner restarts the database container. Zero shared in-memory state
    // with any earlier phase.
    const db = new DatabaseService();
    const repo = new DriverLeaveRepository(db);
    const service = new DriverLeaveService(repo);

    try {
      if (phase === "pre-restart") {
        const driverId = `drv_reload_${randomUUID().slice(0, 8)}`;
        const shiftId = `sh_reload_${randomUUID().slice(0, 8)}`;
        const fixedNow = new Date("2026-09-10T10:00:00.000Z");

        await db.query(
          `
          INSERT INTO ops.phase1_driver_shifts (
            shift_id, shift_no, driver_id, scheduled_start, scheduled_end, clock_in_at,
            clock_out_at, status, record, created_at, updated_at
          ) VALUES (
            $1, $3, $2, '2026-09-10T12:00:00.000Z', '2026-09-10T18:00:00.000Z',
            '2026-09-10T12:00:00.000Z', null, 'scheduled',
            '{"shiftId": "${shiftId}", "driverId": "${driverId}"}'::jsonb,
            now(), now()
          )
        `,
          [shiftId, driverId, `SFT-${shiftId}`],
        );

        const leave = await service.createLeave(
          driverId,
          {
            leaveType: "annual",
            startTime: "2026-09-10T13:00:00.000Z",
            endTime: "2026-09-10T17:00:00.000Z",
            reason: "durable reload test",
          },
          fixedNow,
        );

        const approved = await service.reviewLeave(
          leave.leaveId,
          "ops_manager_reload",
          { decision: "approve", reviewNotes: "approved for durable reload" },
          fixedNow,
        );

        expect(approved.status).toBe("approved");
        expect(approved.impactedShiftIds).toContain(shiftId);

        const snapshot: DurableReloadSnapshot = {
          leaveId: leave.leaveId,
          driverId,
          shiftId,
          expected: {
            status: "approved",
            reviewNotes: "approved for durable reload",
            impactedShiftIds: approved.impactedShiftIds,
          },
          recordedAt: new Date().toISOString(),
        };

        mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
        writeFileSync(EVIDENCE_PATH, JSON.stringify(snapshot, null, 2));
      } else {
        if (!existsSync(EVIDENCE_PATH)) {
          throw new Error(
            `SR-LEAVE-BE-001 Acceptance Requirement: durable reload evidence file missing at ` +
              `${EVIDENCE_PATH}. Phase 1 (pre-restart) must run and persist the exact IDs before ` +
              "this post-restart verification can run. Refusing to re-seed instead of verifying.",
          );
        }
        const snapshot = JSON.parse(
          readFileSync(EVIDENCE_PATH, "utf-8"),
        ) as DurableReloadSnapshot;

        // Read-only verification against the SAME leaveId/shiftId recorded
        // before the restart. No new rows are created in this phase.
        const reloadedLeave = await repo.findById(snapshot.leaveId);
        expect(reloadedLeave).not.toBeNull();
        expect(reloadedLeave!.status).toBe(snapshot.expected.status);
        expect(reloadedLeave!.reviewNotes).toBe(snapshot.expected.reviewNotes);
        expect(reloadedLeave!.impactedShiftIds).toEqual(
          snapshot.expected.impactedShiftIds,
        );

        const shiftRow = await db.query<{ record: Record<string, unknown> }>(
          `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1`,
          [snapshot.shiftId],
        );
        expect(shiftRow.rows).toHaveLength(1);
        expect(shiftRow.rows[0]!.record.leaveReassigned).toBe(true);
        expect(shiftRow.rows[0]!.record.reassignedReason).toBe(
          "DRIVER_ON_LEAVE",
        );
        expect(shiftRow.rows[0]!.record.leaveId).toBe(snapshot.leaveId);

        const suppRow = await db.query<{
          active: boolean;
          reason_code: string;
        }>(
          `SELECT active, reason_code FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [snapshot.leaveId],
        );
        expect(suppRow.rows).toHaveLength(1);
        expect(suppRow.rows[0]!.active).toBe(true);
        expect(suppRow.rows[0]!.reason_code).toBe("DRIVER_ON_LEAVE");
      }
    } finally {
      await db.onModuleDestroy();
    }
  });
});
