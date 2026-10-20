import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  DispatchAssignmentRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  ReferralMonthlyRatingQuery,
} from "../../../packages/contracts/src";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReferralMonthlyRatingService } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.service";
import { ReferralMonthlyRatingController } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.controller";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
requireApi("reflect-metadata");

// Candidate monthly reader only. The original four atomic monthly-replacement
// cases remain preserved in their original task; no atomic writer is adopted.
// These imports resolve to this candidate Source, never artifact loader/cache.
// Same hosted-only harness as existing Referral native6: native psql/db-apply,
// all production migrations, a fresh owned database clone per case and only
// harness-owned database cleanup. Do not run this file on the worker VM.
// Missing hosted DB configuration fails in h.open(); absent local hosted
// execution is skip/unexecuted, not PG proof. No new env/workflow/DDL is added.
describe.skipIf(!hostedPaymentEnabled)(
  "Referral monthly ratings: native canonical SQL and completed attribution",
  () => {
    const h = new PaymentPostgresHarness();
    const scope = {
      tenantId: `monthly-tenant-${randomUUID()}`,
      partnerId: `monthly-partner-${randomUUID()}`,
      partnerProgramId: `monthly-program-${randomUUID()}`,
      entrySlug: `monthly-entry-${randomUUID()}`,
    };
    const completedDriver = `monthly-completed-driver-${randomUUID()}`;
    const completionTime = "2026-09-15T12:00:00.000Z";
    type Rating = NonNullable<
      NonNullable<OwnedOrderRecord["referralPassengerLifecycle"]>["rating"]
    >;
    type Trip = {
      order: OwnedOrderRecord;
      task: DriverTaskRecord;
      assignment: DispatchAssignmentRecord;
      hook?: ReturnType<ComplaintService["prepareReferralRatingHook"]>;
    };
    type Statement = { sql: string; values: readonly unknown[] };

    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    function trip(
      submittedAt = "2026-10-15T12:00:00.000Z",
      score: Rating["score"] = 5,
    ): Trip {
      const orderId = randomUUID();
      const assignmentId = randomUUID();
      const taskId = randomUUID();
      const dispatchJobId = randomUUID();
      const vehicleId = `monthly-vehicle-${randomUUID()}`;
      const order = buildOrderFixture({
        orderId,
        status: "completed",
        orderSource: "portal",
        runtimeProfileCode: "business_dispatch",
        tenantId: scope.tenantId,
        partnerId: scope.partnerId,
        partnerProgramId: scope.partnerProgramId,
        partnerEntrySlug: scope.entrySlug,
        createdAt: completionTime,
        updatedAt: completionTime,
        referralPassengerLifecycle: {
          rating: {
            orderId,
            score,
            tags: ["親切有禮", "historical-custom-tag"],
            comment: "原始歷史意見".repeat(45),
            submittedAt,
            idempotencyKey: `monthly-rating-${orderId}`,
            policyVersion: "referral_rating_v1",
            contactRequested: false,
            complaintCaseNo: null,
          },
        },
      });
      const assignment: DispatchAssignmentRecord = {
        assignmentId,
        dispatchJobId,
        orderId,
        taskId,
        driverId: completedDriver,
        vehicleId,
        assignmentType: "metered",
        status: "completed",
        acceptedAt: completionTime,
        rejectedAt: null,
        rejectReasonCode: null,
        createdAt: completionTime,
        updatedAt: completionTime,
      };
      const task: DriverTaskRecord = {
        taskId,
        orderId,
        dispatchJobId,
        assignmentId,
        driverId: completedDriver,
        vehicleId,
        status: "completed",
        sourcePlatform: null,
        routeProvided: false,
        waypoints: [],
        acceptedAt: completionTime,
        departedAt: completionTime,
        arrivedPickupAt: completionTime,
        startedAt: completionTime,
        completedAt: completionTime,
        actualDistanceKm: 3,
        actualDurationSec: 600,
        fare: null,
        proof: null,
      };
      return { order, task, assignment };
    }

    async function persist(...trips: Trip[]) {
      // Commit fixture order/task/assignment + original CRM hook on one real
      // executor. The reader never creates these records or mirrors their SQL.
      await h.owned.withTransaction(async (tx) => {
        for (const item of trips) await item.hook?.execute(tx);
        await h.owned.persistOrderWorkflow(tx, {
          orders: trips.map((item) => item.order),
          driverTasks: trips.map((item) => item.task),
          dispatchAssignments: trips.map((item) => item.assignment),
        });
      });
    }

    async function readOnly<T>(
      work: (context: {
        repository: ReportingRepository;
        service: ReferralMonthlyRatingService;
        controller: ReferralMonthlyRatingController;
        statements: Statement[];
      }) => Promise<T>,
    ): Promise<T> {
      const client = await h.pool!.connect();
      try {
        await client.query("BEGIN READ ONLY");
        expect(
          (await client.query("SHOW transaction_read_only")).rows[0],
        ).toEqual({ transaction_read_only: "on" });
        const statements: Statement[] = [];
        const nativeReadPort: Pick<DatabaseService, "isEnabled" | "query"> = {
          isEnabled: () => true,
          query: async <Row extends QueryResultRow>(
            sql: string,
            values?: readonly unknown[],
          ) => {
            statements.push({ sql, values: values ?? [] });
            // Unmodified production SQL/binds go to this native PoolClient.
            // READ ONLY is enforced by PostgreSQL, not a fake SQL decision.
            return client.query<Row>(sql, values ? [...values] : undefined);
          },
        };
        const repository = new ReportingRepository(
          nativeReadPort as DatabaseService,
        );
        const service = new ReferralMonthlyRatingService(repository);
        return await work({
          repository,
          service,
          controller: new ReferralMonthlyRatingController(service),
          statements,
        });
      } finally {
        try {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
    }

    async function read(
      periodMonth = "2026-10",
      extra: Partial<ReferralMonthlyRatingQuery> = {},
    ) {
      return readOnly(async ({ service, statements }) => {
        const report = await service.read({ ...scope, periodMonth, ...extra });
        expect(statements).toHaveLength(1);
        return { report, statement: statements[0]! };
      });
    }

    async function snapshot() {
      // Original tables/columns only; compare rows incl. generated metadata.
      const tables = [
        "ops.phase1_owned_orders",
        "ops.phase1_driver_tasks",
        "ops.phase1_dispatch_assignments",
        "crm.phase1_complaint_cases",
        "crm.phase1_complaint_timelines",
        "reg.phase1_registry_drivers",
      ] as const;
      const snapshots: Record<string, unknown> = {};
      for (const table of tables) {
        snapshots[table] = (
          await h.pool!.query(
            `SELECT to_jsonb(source_row) AS original FROM ${table} source_row ORDER BY to_jsonb(source_row)::text`,
          )
        ).rows;
      }
      return snapshots;
    }

    it("reads production JSON, real completed driver and original no-contact CRM; fresh/repeated reads neither recount nor write", async () => {
      const low = trip("2026-10-15T12:00:00.000Z", 2);
      const rating = low.order.referralPassengerLifecycle!.rating!;
      const complaint = new ComplaintService(
        new AuditNotificationService(),
        new ComplaintRepository(h.database),
      );
      low.hook = complaint.prepareReferralRatingHook(
        {
          orderId: low.order.orderId,
          passengerId: `monthly-passenger-${randomUUID()}`,
          tenantId: scope.tenantId,
        },
        {
          score: rating.score,
          comment: rating.comment!,
          contactRequested: false,
        },
      );
      expect(low.hook.caseNo).toEqual(expect.any(String));
      rating.complaintCaseNo = low.hook.caseNo;
      rating.createdTimelineId = low.hook.createdTimelineId;
      const high = trip("2026-10-16T12:00:00.000Z", 5);
      const mid = trip("2026-10-17T12:00:00.000Z", 4);
      await persist(low, high, mid);
      // A current Registry eligibility change must not replace the historical
      // completed-task driver in a monthly report. No eligibility rule changes.
      const currentDriver: DriverRegistryRecord = {
        driverId: completedDriver,
        name: "Synthetic current registry profile",
        supportedServiceBuckets: ["standard_taxi"],
        workState: "suspended",
        licensesValid: false,
        lifecycleStatus: "retired",
        eligibilityBlockedReasons: ["lifecycle_retired"],
        dispatchEligible: false,
        createdAt: completionTime,
        updatedAt: "2026-11-15T12:00:00.000Z",
        activatedAt: completionTime,
        suspendedAt: null,
        retiredAt: "2026-11-15T12:00:00.000Z",
        profileUpdatedAt: null,
        deviceBindings: [],
      };
      await new RegulatoryRegistryRepository(h.database).persistChanges({
        drivers: [currentDriver],
      });
      const stored = await h.pool!.query(
        `SELECT record #> '{referralPassengerLifecycle,rating}' AS rating,
                record -> 'referral_passenger_lifecycle' AS wrong_wire_key
         FROM ops.phase1_owned_orders WHERE order_id=$1`,
        [low.order.orderId],
      );
      expect(stored.rows[0]).toEqual({ rating, wrong_wire_key: null });
      const crm = await h.pool!.query(
        "SELECT record FROM crm.phase1_complaint_cases WHERE case_no=$1",
        [low.hook.caseNo],
      );
      expect(crm.rows[0].record).toMatchObject({
        caseNo: low.hook.caseNo,
        relatedOrderId: low.order.orderId,
        description: expect.stringContaining("不需客服聯繫，僅供內部檢視"),
      });
      const before = await snapshot();
      const first = await read();
      expect(first.report).toMatchObject({
        ratingCount: 3,
        averageRating: 3.67,
        unattributedRatingCount: 0,
        drivers: [
          { driverId: completedDriver, ratingCount: 3, averageRating: 3.67 },
        ],
      });
      expect(
        first.report.rows.find((row) => row.orderId === low.order.orderId),
      ).toMatchObject({
        tags: rating.tags,
        comment: rating.comment,
        contactRequested: false,
        complaintCaseNo: low.hook.caseNo,
        driverId: completedDriver,
        taskId: low.task.taskId,
        assignmentId: low.assignment.assignmentId,
        attribution: "completed_task",
      });
      expect((await read()).report).toEqual(first.report);
      await readOnly(async ({ controller, statements }) => {
        const envelope = await controller.read(
          { ...scope, periodMonth: "2026-10" },
          "monthly-native-readback",
        );
        expect(envelope.data).toEqual(first.report);
        expect(envelope.meta.requestId).toBe("monthly-native-readback");
        expect(statements).toHaveLength(1);
      });
      expect(await snapshot()).toEqual(before);
    });

    it("uses Taipei submittedAt month with inclusive start/exclusive end, not completion month, and excludes noncompleted/no-rating rows", async () => {
      const start = trip("2026-09-30T16:00:00.000Z");
      const last = trip("2026-10-31T15:59:59.999Z");
      const before = trip("2026-09-30T15:59:59.999Z");
      const after = trip("2026-10-31T16:00:00.000Z");
      const incomplete = trip();
      incomplete.order.status = "cancelled";
      const noRating = trip();
      noRating.order.referralPassengerLifecycle = {};
      await persist(start, last, before, after, incomplete, noRating);
      const result = await read();
      expect(result.report.rows.map((row) => row.orderId).sort()).toEqual(
        [start.order.orderId, last.order.orderId].sort(),
      );
      expect(result.report.ratingCount).toBe(2);
      expect(result.statement.values.slice(0, 2)).toEqual([
        "2026-10-01",
        "2026-11-01",
      ]);
      expect(
        (await read("2026-11")).report.rows.map((row) => row.orderId),
      ).toEqual([after.order.orderId]);
    });

    it.each([
      [
        "0099-02",
        "0099-03",
        "0099-02-15T12:00:00.000Z",
        "0099-03-01T12:00:00.000Z",
      ],
      [
        "0099-12",
        "0100-01",
        "0099-12-15T12:00:00.000Z",
        "0100-01-01T12:00:00.000Z",
      ],
      [
        "2026-12",
        "2027-01",
        "2026-12-15T12:00:00.000Z",
        "2027-01-01T12:00:00.000Z",
      ],
    ])(
      "executes native year-padded bounds %s -> %s",
      async (month, next, at, outside) => {
        const included = trip(at);
        const excluded = trip(outside);
        await persist(included, excluded);
        const result = await read(month);
        expect(result.statement.values.slice(0, 2)).toEqual([
          `${month}-01`,
          `${next}-01`,
        ]);
        expect(result.report.rows.map((row) => row.orderId)).toEqual([
          included.order.orderId,
        ]);
        expect(result.report.ratingCount).toBe(1);
      },
    );

    it("keeps missing/ambiguous attribution as one original row each, without joining duplicates or inventing a driver", async () => {
      const good = trip();
      const missing = trip("2026-10-15T12:00:00.000Z", 2);
      const ambiguous = trip("2026-10-15T12:00:00.000Z", 1);
      const second = trip();
      second.order = ambiguous.order;
      second.task.orderId = ambiguous.order.orderId;
      second.assignment.orderId = ambiguous.order.orderId;
      await persist(good, ambiguous, second);
      await h.owned.withTransaction((tx) =>
        h.owned.persistOrderWorkflow(tx, { orders: [missing.order] }),
      );
      const before = await snapshot();
      const report = (await read()).report;
      expect(report).toMatchObject({
        ratingCount: 3,
        averageRating: 2.67,
        unattributedRatingCount: 2,
        drivers: [
          { driverId: completedDriver, ratingCount: 1, averageRating: 5 },
        ],
      });
      for (const order of [missing.order, ambiguous.order]) {
        expect(
          report.rows.find((row) => row.orderId === order.orderId),
        ).toMatchObject({
          driverId: null,
          taskId: null,
          assignmentId: null,
          attribution: "unavailable",
        });
      }
      expect(new Set(report.rows.map((row) => row.orderId)).size).toBe(3);
      expect(
        (await read("2026-10", { driverId: completedDriver })).report.rows.map(
          (row) => row.orderId,
        ),
      ).toEqual([good.order.orderId]);
      expect(await snapshot()).toEqual(before);
    });

    it.each([
      "assignmentId",
      "taskId",
      "orderId",
      "dispatchJobId",
      "driverId",
      "vehicleId",
      "status",
    ] as const)(
      "requires exact completed assignment %s binding",
      async (field) => {
        const item = trip();
        if (field === "status") item.assignment.status = "rejected";
        else item.assignment[field] = `different-${randomUUID()}`;
        await persist(item);
        const report = (await read()).report;
        expect(report).toMatchObject({
          ratingCount: 1,
          averageRating: 5,
          unattributedRatingCount: 1,
          drivers: [],
        });
        expect(report.rows[0]).toMatchObject({
          orderId: item.order.orderId,
          driverId: null,
          assignmentId: null,
          taskId: null,
          attribution: "unavailable",
        });
      },
    );

    it("filters actual completed driver plus every original resource scope, without substituting current Registry or a foreign order", async () => {
      const own = trip();
      const other = trip();
      other.order.tenantId = `other-${randomUUID()}`;
      other.task.driverId = `other-driver-${randomUUID()}`;
      other.assignment.driverId = other.task.driverId;
      await persist(own, other);
      expect(
        (await read("2026-10", { driverId: completedDriver })).report.rows.map(
          (row) => row.orderId,
        ),
      ).toEqual([own.order.orderId]);
      expect(
        (await read("2026-10", { driverId: other.task.driverId })).report,
      ).toMatchObject({
        ratingCount: 0,
        averageRating: null,
        drivers: [],
        rows: [],
      });
      for (const field of [
        "tenantId",
        "partnerId",
        "partnerProgramId",
        "entrySlug",
      ] as const) {
        const query: Partial<ReferralMonthlyRatingQuery> = {
          [field]: `foreign-${randomUUID()}`,
        };
        expect((await read("2026-10", query)).report).toMatchObject({
          ratingCount: 0,
          averageRating: null,
          rows: [],
        });
      }
    });

    it("does not expose an uncommitted order/task/assignment bundle and reads the exact completed bundle after native COMMIT", async () => {
      const item = trip();
      const writer = await h.pool!.connect();
      try {
        await writer.query("BEGIN");
        await h.owned.persistOrderWorkflow(writer, {
          orders: [item.order],
          driverTasks: [item.task],
          dispatchAssignments: [item.assignment],
        });
        expect((await read()).report.ratingCount).toBe(0);
        await writer.query("COMMIT");
        const report = (await read()).report;
        expect(report.ratingCount).toBe(1);
        expect(report.rows[0]).toMatchObject({
          orderId: item.order.orderId,
          driverId: item.task.driverId,
          taskId: item.task.taskId,
          assignmentId: item.assignment.assignmentId,
        });
      } finally {
        try {
          await writer.query("ROLLBACK");
        } finally {
          writer.release();
        }
      }
    });

    it("propagates an actual PostgreSQL submittedAt cast error rather than fabricating an empty/cache-success report", async () => {
      const corrupt = trip("not-a-timestamp");
      await persist(corrupt);
      // Deliberately corrupted storage fixture: no schema/SQL fallback or error mock.
      await expect(read()).rejects.toMatchObject({ code: "22007" });
    });

    it("returns zero/null/empty from the native source when this exact month/scope has no original rating", async () => {
      const result = await read();
      expect(result.report).toEqual({
        periodMonth: "2026-10",
        timeZone: "Asia/Taipei",
        ratingCount: 0,
        averageRating: null,
        unattributedRatingCount: 0,
        drivers: [],
        rows: [],
      });
    });
  },
);
