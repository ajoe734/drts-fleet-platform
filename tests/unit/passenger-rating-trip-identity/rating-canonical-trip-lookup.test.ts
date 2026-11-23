import { execFileSync } from "node:child_process";
import type {
  OwnedOrderRecord,
  PassengerTripRatingRecord,
} from "@drts/contracts";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";

interface SharedTripSample {
  label: "shared_A" | "shared_B";
  orderId: string;
  orderNo: string;
  tripId: string;
  assignmentId: string;
  driverId: string;
  driverDisplayName: string;
  passengerSubjectRef: string;
  ratingId: string;
  receiptId: string;
  receiptNo: string;
  completedAt: string;
}

const SHARED_SAMPLES: readonly [SharedTripSample, SharedTripSample] = [
  {
    label: "shared_A",
    orderId: "580e0ebf-c1e6-41c4-93dc-449bd92a010f",
    orderNo: "DRTS-PAX-20261119-001",
    tripId: "85f7a59f-ee43-4734-869a-42f2aa1031ae",
    assignmentId: "6c7e412a-2ae4-4fd6-946b-a55f9563c35b",
    driverId: "2ef2301a-6a1f-44a4-b865-2fd7a035e2b5",
    driverDisplayName: "林志豪",
    passengerSubjectRef: "pax-subject-shared-a",
    ratingId: "ca5e20c7-470c-4a62-b107-654aa581d626",
    receiptId: "rcp-580e0ebf-c1e6-41c4-93dc-449bd92a010f",
    receiptNo: "RCP-20261119-001",
    completedAt: "2026-11-19T12:24:10.000Z",
  },
  {
    label: "shared_B",
    orderId: "98e6e9fd-c986-4985-8339-3b00ee977e92",
    orderNo: "DRTS-PAX-20261119-002",
    tripId: "f034e18a-ac90-421a-9163-6f02ff8bf071",
    assignmentId: "59ac5668-5e3c-4685-9393-ab1b7e60feaa",
    driverId: "2ef2301a-6a1f-44a4-b865-2fd7a035e2b5",
    driverDisplayName: "林志豪",
    passengerSubjectRef: "pax-subject-shared-b",
    ratingId: "c6ca4b9c-c3b0-4012-8b9f-73a1cc8f1210",
    receiptId: "rcp-98e6e9fd-c986-4985-8339-3b00ee977e92",
    receiptNo: "RCP-20261119-002",
    completedAt: "2026-11-19T13:18:45.000Z",
  },
] as const;

function createSampleOrder(sample: SharedTripSample): OwnedOrderRecord {
  return {
    orderId: sample.orderId,
    orderNo: sample.orderNo,
    tenantId: "tenant-default",
    runtimeProfileCode: "multi_taxi_direct",
    sourceChannel: "call_center",
    timingMode: "on_demand",
    status: "completed",
    passenger: {
      passengerId: sample.passengerSubjectRef,
      name: "Shared Sample Passenger",
      phone: "0912345678",
    },
    pickup: {
      address: "台北車站",
      latitude: 25.0478,
      longitude: 121.517,
    },
    dropoff: {
      address: "松山機場",
      latitude: 25.0697,
      longitude: 121.5525,
    },
    fixedPrice: false,
    quotedFare: {
      amountMinor: 32500,
      currency: "TWD",
    },
    complianceFlags: [],
    createdAt: "2026-11-19T12:00:00.000Z",
    updatedAt: sample.completedAt,
    cancelledAt: null,
    cancelableUntil: "2026-11-19T12:05:00.000Z",
  } as OwnedOrderRecord;
}

describe("PAX-RATING-CANONICAL-TRIP-LOOKUP-20261123 canonical completed trip identity and lookup", () => {
  it("resolves canonical completed task_id for both 11/19 shared samples across historical assignment_id ratings, readback, search, and detail", async () => {
    const audit = new AuditNotificationService();
    const owned = new OwnedMobilityService(audit);
    const service = new MultiTaxiService(owned);

    const internalOwned = owned as unknown as {
      orders: OwnedOrderRecord[];
      driverTasks: Array<Record<string, unknown>>;
    };
    const internalService = service as unknown as {
      ratingsById: Map<string, PassengerTripRatingRecord>;
      ratingsByPassengerOrder: Map<string, PassengerTripRatingRecord>;
      ratingKey: (orderId: string, passengerSubjectRef: string) => string;
      rebuildInMemoryDriverRatingSummary: (
        driverId: string,
        calculatedAt: string,
      ) => unknown;
    };

    for (const sample of SHARED_SAMPLES) {
      const created = owned.createMultiTaxiRide(
        {
          timingMode: "on_demand",
          requestedPickupAt: new Date(Date.now() + 60_000).toISOString(),
          passenger: {
            passengerId: sample.passengerSubjectRef,
            name: "Shared Sample Passenger",
            phone: "0912345678",
          },
          pickup: {
            address: "台北車站",
            latitude: 25.0478,
            longitude: 121.517,
          },
          dropoff: {
            address: "松山機場",
            latitude: 25.0697,
            longitude: 121.5525,
          },
        },
        {
          authorizationId: "auth-1",
          activeFareVersionId: "fare-v1",
        } as never,
      );
      const storedOrder = internalOwned.orders.find(
        (candidate) => candidate.orderId === created.orderId,
      )!;
      storedOrder.orderId = sample.orderId;
      storedOrder.orderNo = sample.orderNo;
      storedOrder.status = "completed";
      storedOrder.updatedAt = sample.completedAt;
      internalOwned.driverTasks.push({
        taskId: sample.tripId,
        orderId: sample.orderId,
        assignmentId: sample.assignmentId,
        driverId: sample.driverId,
        vehicleId: "veh-001",
        status: "completed",
        completedAt: sample.completedAt,
        updatedAt: sample.completedAt,
      });

      const historicalRating: PassengerTripRatingRecord = {
        ratingId: sample.ratingId,
        orderId: sample.orderId,
        tripId: sample.assignmentId,
        driverId: sample.driverId,
        passengerSubjectRef: sample.passengerSubjectRef,
        score: 5,
        tags: ["clean_vehicle"],
        comment: `shared sample ${sample.label}`,
        status: "active",
        submittedAt: sample.completedAt,
        updatedAt: sample.completedAt,
      };
      internalService.ratingsById.set(sample.ratingId, historicalRating);
      internalService.ratingsByPassengerOrder.set(
        internalService.ratingKey(sample.orderId, sample.passengerSubjectRef),
        historicalRating,
      );
      internalService.rebuildInMemoryDriverRatingSummary(
        sample.driverId,
        sample.completedAt,
      );
    }

    for (const sample of SHARED_SAMPLES) {
      // 1. Search by certificate receipt.record.trip_id (completed task_id)
      const byCertificateTripId = await service.listPassengerRatingReviews({
        tripOrOrder: sample.tripId,
      });
      expect(byCertificateTripId.pageInfo.totalItems).toBe(1);
      expect(byCertificateTripId.items).toHaveLength(1);
      expect(byCertificateTripId.items[0]?.ratingId).toBe(sample.ratingId);
      expect(byCertificateTripId.items[0]?.orderId).toBe(sample.orderId);
      expect(byCertificateTripId.items[0]?.tripId).toBe(sample.tripId);

      // 2. Search by legacy assignment_id continues to work and projects canonical tripId
      const byAssignmentId = await service.listPassengerRatingReviews({
        tripOrOrder: sample.assignmentId,
      });
      expect(byAssignmentId.pageInfo.totalItems).toBe(1);
      expect(byAssignmentId.items[0]?.ratingId).toBe(sample.ratingId);
      expect(byAssignmentId.items[0]?.tripId).toBe(sample.tripId);

      // 3. Search by orderId and orderNo continues to work
      const byOrderId = await service.listPassengerRatingReviews({
        tripOrOrder: sample.orderId,
      });
      expect(byOrderId.pageInfo.totalItems).toBe(1);
      expect(byOrderId.items[0]?.ratingId).toBe(sample.ratingId);
      expect(byOrderId.items[0]?.tripId).toBe(sample.tripId);

      const byOrderNo = await service.listPassengerRatingReviews({
        tripOrOrder: sample.orderNo,
      });
      expect(byOrderNo.pageInfo.totalItems).toBe(1);
      expect(byOrderNo.items[0]?.ratingId).toBe(sample.ratingId);
      expect(byOrderNo.items[0]?.tripId).toBe(sample.tripId);

      // 4. Admin detail view returns canonical completed tripId
      const detail = await service.getPassengerRatingReview(
        sample.ratingId,
        true,
      );
      expect(detail.rating.ratingId).toBe(sample.ratingId);
      expect(detail.rating.orderId).toBe(sample.orderId);
      expect(detail.rating.tripId).toBe(sample.tripId);
      expect(detail.orderNo).toBe(sample.orderNo);

      // 5. Passenger ride readback returns canonical completed tripId matching receipt
      const rideView = await service.getPassengerRideById(
        sample.orderId,
        sample.passengerSubjectRef,
      );
      expect(rideView.rating?.ratingId).toBe(sample.ratingId);
      expect(rideView.rating?.tripId).toBe(sample.tripId);
    }
  });

  it("writes canonical completed task_id on new passenger rating submissions (trusted account and token flows)", async () => {
    const sample = SHARED_SAMPLES[0];
    const order = createSampleOrder(sample);
    const owned = {
      getOrderOrThrow: vi.fn(() => order),
      resolvePersistedOrder: vi.fn(async () => order),
      listOrders: vi.fn(() => [order]),
      listDriverTasks: vi.fn(() => [
        {
          taskId: sample.tripId,
          orderId: sample.orderId,
          assignmentId: sample.assignmentId,
          driverId: sample.driverId,
          vehicleId: "veh-001",
          status: "completed",
          completedAt: sample.completedAt,
          updatedAt: sample.completedAt,
        },
      ]),
      resolvePersistedPassengerAssignmentDisclosure: vi.fn(async () => ({
        assignmentId: sample.assignmentId,
        assignmentVersion: 1,
        assignedAt: "2026-11-19T12:02:00.000Z",
        eta: null,
        driver: {
          driverId: sample.driverId,
          displayName: sample.driverDisplayName,
        },
        vehicle: {
          vehicleId: "veh-001",
          plateNo: "TDC-1119",
          brandModel: "Toyota RAV4",
          exteriorColor: "白",
        },
        routeFare: null,
      })),
      resolvePassengerRideTracking: vi.fn(async () => null),
    } as unknown as OwnedMobilityService;

    const service = new MultiTaxiService(owned);
    const submitted = await service.submitTrustedPassengerRating(
      sample.orderId,
      {
        score: 5,
        tags: ["clean_vehicle", "polite_driver"],
        comment: "與乘車證明共用完程行程編號",
      },
      sample.passengerSubjectRef,
    );
    expect(submitted.orderId).toBe(sample.orderId);
    expect(submitted.tripId).toBe(sample.tripId);

    // Idempotent readback and replay
    const replayed = await service.submitTrustedPassengerRating(
      sample.orderId,
      {
        score: 5,
        tags: ["polite_driver", "clean_vehicle"],
        comment: "與乘車證明共用完程行程編號",
      },
      sample.passengerSubjectRef,
    );
    expect(replayed.ratingId).toBe(submitted.ratingId);
    expect(replayed.tripId).toBe(sample.tripId);

    const listByTripId = await service.listPassengerRatingReviews({
      tripOrOrder: sample.tripId,
    });
    expect(listByTripId.pageInfo.totalItems).toBe(1);
    expect(listByTripId.items[0]?.tripId).toBe(sample.tripId);
  });

  it("executes repository SQL count, list, detail, and findPassengerRating against real SQLite tables for 11/19 shared samples, reassignment, and untraceable legacy rows", async () => {
    const capturedQueries: Array<{ sql: string; params: unknown[] }> = [];
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        capturedQueries.push({ sql, params });
        if (sql.includes("count(*)::integer AS total_items")) {
          return { rows: [{ total_items: 1 }] };
        }
        if (sql.includes("AS comment_excerpt")) {
          return {
            rows: [
              {
                rating_id: SHARED_SAMPLES[0].ratingId,
                order_id: SHARED_SAMPLES[0].orderId,
                trip_id: SHARED_SAMPLES[0].tripId,
                driver_id: SHARED_SAMPLES[0].driverId,
                driver_display_name: SHARED_SAMPLES[0].driverDisplayName,
                score: 5,
                tags: ["clean_vehicle"],
                comment_excerpt: "shared sample A",
                status: "active",
                submitted_at: SHARED_SAMPLES[0].completedAt,
                updated_at: SHARED_SAMPLES[0].completedAt,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as never);

    const listOutcome = await repository.listPassengerRatingReviews({
      status: null,
      score: null,
      tag: null,
      driverId: null,
      tripOrOrder: SHARED_SAMPLES[0].tripId,
      from: null,
      to: null,
      page: 1,
      pageSize: 20,
    });
    expect(capturedQueries).toHaveLength(2);
    expect(listOutcome.totalItems).toBe(1);
    expect(listOutcome.items[0]?.tripId).toBe(SHARED_SAMPLES[0].tripId);

    // Execute the actual repository SQL against SQLite 3.45+ with both 11/19 shared samples,
    // a reassigned order (cancelled task-old for driver-old + completed task-new for driver-new),
    // and an untraceable legacy rating row.
    const countSql = capturedQueries[0]!.sql;
    const listSql = capturedQueries[1]!.sql;

    const detailQueries: Array<{ sql: string; params: unknown[] }> = [];
    const detailRepo = new MultiTaxiRepository({
      isEnabled: () => true,
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        detailQueries.push({ sql, params });
        return { rows: [] };
      }),
    } as never);
    await detailRepo.findPassengerRatingReview(SHARED_SAMPLES[0].ratingId);
    expect(detailQueries).toHaveLength(1);
    const detailSql = detailQueries[0]!.sql;

    const pythonVerifyScript = `
import json, re, sqlite3, sys

payload = json.loads(sys.stdin.read())
count_sql = payload["countSql"]
list_sql = payload["listSql"]
detail_sql = payload["detailSql"]
samples = payload["samples"]

def to_sqlite(sql: str) -> str:
    s = sql
    s = s.replace("ops.passenger_trip_ratings", "passenger_trip_ratings")
    s = s.replace("ops.phase1_owned_orders", "phase1_owned_orders")
    s = s.replace("reg.phase1_registry_drivers", "phase1_registry_drivers")
    s = s.replace("ops.phase1_driver_tasks", "phase1_driver_tasks")
    s = s.replace("reporting.multi_taxi_trip_operational_records", "multi_taxi_trip_operational_records")
    s = s.replace("count(*)::integer", "count(*)")
    s = s.replace(" ILIKE ", " LIKE ")
    s = s.replace("dt.record->>'driverId'", "json_extract(dt.record, '$.driverId')")
    s = s.replace("dt_mismatch.record->>'driverId'", "json_extract(dt_mismatch.record, '$.driverId')")
    s = s.replace("mtr.record->>'driverId'", "json_extract(mtr.record, '$.driverId')")
    s = s.replace("char_length(r.comment)", "length(r.comment)")
    s = s.replace("left(r.comment, 157)", "substr(r.comment, 1, 157)")
    return s

def bind_positional(sql: str, params: dict) -> tuple[str, list]:
    ordered = []
    def repl(match):
        idx = int(match.group(1))
        ordered.append(params[idx])
        return "?"
    return re.sub(r"\\$(\\d+)", repl, sql), ordered

con = sqlite3.connect(":memory:")
con.row_factory = sqlite3.Row
cur = con.cursor()
cur.executescript("""
CREATE TABLE passenger_trip_ratings (
  rating_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  passenger_subject_ref TEXT NOT NULL,
  score INTEGER NOT NULL,
  tags TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE phase1_owned_orders (
  order_id TEXT PRIMARY KEY,
  order_no TEXT
);
CREATE TABLE phase1_registry_drivers (
  driver_id TEXT PRIMARY KEY,
  full_name TEXT
);
CREATE TABLE phase1_driver_tasks (
  task_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE multi_taxi_trip_operational_records (
  record_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_no TEXT,
  trip_id TEXT NOT NULL,
  assignment_id TEXT,
  record TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
""")

# Seed both 11/19 shared samples (rating.trip_id = assignment_id, receipt/task trip_id = task_id)
for s in samples:
    cur.execute("INSERT INTO phase1_owned_orders VALUES (?, ?)", (s["orderId"], s["orderNo"]))
    cur.execute("INSERT OR IGNORE INTO phase1_registry_drivers VALUES (?, ?)", (s["driverId"], s["driverDisplayName"]))
    cur.execute(
        "INSERT INTO passenger_trip_ratings VALUES (?, ?, ?, ?, ?, 5, '[]', ?, 'active', ?, ?)",
        (s["ratingId"], s["orderId"], s["assignmentId"], s["driverId"], s["passengerSubjectRef"], s["label"], s["completedAt"], s["completedAt"]),
    )
    cur.execute(
        "INSERT INTO phase1_driver_tasks VALUES (?, ?, ?, 'completed', ?, ?)",
        (s["tripId"], s["orderId"], s["assignmentId"], json.dumps({"driverId": s["driverId"]}), s["completedAt"]),
    )
    cur.execute(
        "INSERT INTO multi_taxi_trip_operational_records VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("mtr-" + s["orderId"], s["orderId"], s["orderNo"], s["tripId"], s["assignmentId"], json.dumps({"driverId": s["driverId"]}), s["completedAt"]),
    )

# Seed reassigned order: first task cancelled (driver-old, asg-old, task-old), second task completed (driver-new, asg-new, task-new)
cur.execute("INSERT INTO phase1_owned_orders VALUES ('ord-reassign', 'DRTS-REASSIGN-001')")
cur.execute("INSERT INTO phase1_registry_drivers VALUES ('driver-old', '舊司機'), ('driver-new', '新司機')")
cur.execute("INSERT INTO phase1_driver_tasks VALUES ('task-old-superseded', 'ord-reassign', 'asg-old-superseded', 'cancelled', '{\\"driverId\\":\\"driver-old\\"}', '2026-11-19T14:00:00.000Z')")
cur.execute("INSERT INTO phase1_driver_tasks VALUES ('task-new-completed', 'ord-reassign', 'asg-new-completed', 'completed', '{\\"driverId\\":\\"driver-new\\"}', '2026-11-19T14:30:00.000Z')")
cur.execute("INSERT INTO passenger_trip_ratings VALUES ('rat-reassign', 'ord-reassign', 'asg-new-completed', 'driver-new', 'pax-reassign', 4, '[]', 'reassigned order', 'active', '2026-11-19T14:35:00.000Z', '2026-11-19T14:35:00.000Z')")

# Seed untraceable legacy rating (no driver task row, no operational record row)
cur.execute("INSERT INTO phase1_owned_orders VALUES ('ord-legacy-untraceable', 'DRTS-LEGACY-001')")
cur.execute("INSERT INTO phase1_registry_drivers VALUES ('driver-legacy', '歷史司機')")
cur.execute("INSERT INTO passenger_trip_ratings VALUES ('rat-legacy', 'ord-legacy-untraceable', 'legacy-opaque-trip-id', 'driver-legacy', 'pax-legacy', 3, '[]', 'legacy row', 'active', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z')")

def run_search(term: str):
    like = f"%{term}%"
    c_sql, c_args = bind_positional(to_sqlite(count_sql), {1: like})
    l_sql, l_args = bind_positional(to_sqlite(list_sql), {1: like, 2: 20, 3: 0})
    total = cur.execute(c_sql, c_args).fetchone()[0]
    rows = [dict(r) for r in cur.execute(l_sql, l_args).fetchall()]
    return {"total": total, "rows": rows}

def run_detail(rating_id: str):
    d_sql, d_args = bind_positional(to_sqlite(detail_sql), {1: rating_id})
    row = cur.execute(d_sql, d_args).fetchone()
    return dict(row) if row else None

out = {
    "shared_A_by_tripId": run_search(samples[0]["tripId"]),
    "shared_A_by_assignmentId": run_search(samples[0]["assignmentId"]),
    "shared_A_by_orderId": run_search(samples[0]["orderId"]),
    "shared_A_by_orderNo": run_search(samples[0]["orderNo"]),
    "shared_A_detail": run_detail(samples[0]["ratingId"]),
    "shared_B_by_tripId": run_search(samples[1]["tripId"]),
    "shared_B_by_assignmentId": run_search(samples[1]["assignmentId"]),
    "shared_B_by_orderId": run_search(samples[1]["orderId"]),
    "shared_B_by_orderNo": run_search(samples[1]["orderNo"]),
    "shared_B_detail": run_detail(samples[1]["ratingId"]),
    "reassign_by_completed_task": run_search("task-new-completed"),
    "reassign_by_superseded_task": run_search("task-old-superseded"),
    "reassign_by_superseded_assignment": run_search("asg-old-superseded"),
    "reassign_by_order_id": run_search("ord-reassign"),
    "legacy_by_stored_trip": run_search("legacy-opaque-trip-id"),
    "legacy_detail": run_detail("rat-legacy"),
}
print(json.dumps(out))
`;

    const sqliteResult = JSON.parse(
      execFileSync("python3", ["-c", pythonVerifyScript], {
        input: JSON.stringify({
          countSql,
          listSql,
          detailSql,
          samples: SHARED_SAMPLES,
        }),
        encoding: "utf8",
      }),
    );

    // Both 11/19 shared samples return count=1 and canonical trip_id = task_id
    for (const sample of SHARED_SAMPLES) {
      const prefix = sample.label;
      for (const mode of [
        "by_tripId",
        "by_assignmentId",
        "by_orderId",
        "by_orderNo",
      ]) {
        const res = sqliteResult[`${prefix}_${mode}`];
        expect(res.total).toBe(1);
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].rating_id).toBe(sample.ratingId);
        expect(res.rows[0].order_id).toBe(sample.orderId);
        expect(res.rows[0].trip_id).toBe(sample.tripId);
      }
      const detail = sqliteResult[`${prefix}_detail`];
      expect(detail.rating_id).toBe(sample.ratingId);
      expect(detail.canonical_trip_id).toBe(sample.tripId);
    }

    // Reassigned order: matches completed task without duplicate rows or wrong driver
    expect(sqliteResult.reassign_by_completed_task.total).toBe(1);
    expect(sqliteResult.reassign_by_completed_task.rows).toHaveLength(1);
    expect(sqliteResult.reassign_by_completed_task.rows[0].rating_id).toBe(
      "rat-reassign",
    );
    expect(sqliteResult.reassign_by_completed_task.rows[0].trip_id).toBe(
      "task-new-completed",
    );
    expect(sqliteResult.reassign_by_completed_task.rows[0].driver_id).toBe(
      "driver-new",
    );
    expect(sqliteResult.reassign_by_order_id.total).toBe(1);
    expect(sqliteResult.reassign_by_order_id.rows).toHaveLength(1);
    expect(sqliteResult.reassign_by_superseded_task.total).toBe(0);
    expect(sqliteResult.reassign_by_superseded_assignment.total).toBe(0);

    // Untraceable legacy row remains readable and searchable
    expect(sqliteResult.legacy_by_stored_trip.total).toBe(1);
    expect(sqliteResult.legacy_by_stored_trip.rows[0].rating_id).toBe(
      "rat-legacy",
    );
    expect(sqliteResult.legacy_by_stored_trip.rows[0].trip_id).toBe(
      "legacy-opaque-trip-id",
    );
    expect(sqliteResult.legacy_detail.canonical_trip_id).toBe(
      "legacy-opaque-trip-id",
    );
  });

  it("preserves persistPassengerRating transaction dependencies: 24h window check, payment check, low-rating complaint hook, driver summary, and historical assignment_id replay", async () => {
    const sample = SHARED_SAMPLES[0];
    let existingStoredTripId: string | null = null;
    let existingStoredRatingId = sample.ratingId;
    const hookCalls: Array<{
      tripId: string;
      isNew: boolean;
    }> = [];

    const client = {
      query: vi.fn(async (rawSql: string, values: unknown[] = []) => {
        const sql = rawSql.replace(/\s+/g, " ").trim();
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.startsWith("SET LOCAL ") ||
          sql.startsWith("SELECT pg_advisory_xact_lock")
        ) {
          return { rows: [] };
        }
        if (sql.startsWith("SELECT scopes, expires_at")) {
          return {
            rows: [
              {
                scopes: ["ride:read", "ride:rate", "receipt:read"],
                expires_at: "2026-11-20T12:00:00.000Z",
                revoked_at: null,
                database_now: "2026-11-19T13:00:00.000Z",
              },
            ],
          };
        }
        if (sql.startsWith("SELECT o.status, o.record")) {
          return {
            rows: [
              {
                status: "completed",
                record: {
                  runtimeProfileCode: "multi_taxi_direct",
                  passenger: { passengerId: sample.passengerSubjectRef },
                },
              },
            ],
          };
        }
        if (sql.startsWith("INSERT INTO ops.passenger_trip_ratings")) {
          const isReplay = existingStoredTripId !== null;
          const storedTrip = isReplay
            ? existingStoredTripId!
            : String(values[2]);
          const storedId = isReplay
            ? existingStoredRatingId
            : String(values[0]);
          if (!isReplay) {
            existingStoredTripId = storedTrip;
            existingStoredRatingId = storedId;
          }
          return {
            rows: [
              {
                rating_id: storedId,
                order_id: values[1],
                trip_id: storedTrip,
                driver_id: values[3],
                passenger_subject_ref: values[4],
                score: values[5],
                tags: JSON.parse(String(values[6])),
                comment: values[7],
                status: values[8],
                submitted_at: values[9],
                updated_at: values[10],
              },
            ],
          };
        }
        if (sql.startsWith("SELECT record->>'completedAt'")) {
          expect(sql).toContain("AND (assignment_id = $2 OR task_id = $2)");
          return {
            rows: [
              {
                completed_at: sample.completedAt,
                database_now: "2026-11-19T13:00:00.000Z",
                task_id: sample.tripId,
                assignment_id: sample.assignmentId,
              },
            ],
          };
        }
        if (sql.startsWith("SELECT payment_id")) {
          return { rows: [{ payment_id: "pay-001" }] };
        }
        if (sql.startsWith("INSERT INTO ops.driver_rating_summaries")) {
          return {
            rows: [
              {
                driver_id: sample.driverId,
                display_state: "rated",
                average_rating: "2.00",
                rating_count: 1,
                last_rated_at: sample.completedAt,
                aggregate_version: 1,
                calculated_at: "2026-11-19T13:00:00.000Z",
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL in test: ${sql}`);
      }),
      release: vi.fn(),
    };

    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn(async () => client),
    } as never);

    // 1. New rating submitted with canonical task_id
    const newRating: PassengerTripRatingRecord = {
      ratingId: sample.ratingId,
      orderId: sample.orderId,
      tripId: sample.tripId,
      driverId: sample.driverId,
      passengerSubjectRef: sample.passengerSubjectRef,
      score: 2,
      tags: ["route_detour"],
      comment: "低分客訴連結與付款檢核測試",
      status: "active",
      submittedAt: sample.completedAt,
      updatedAt: sample.completedAt,
    };

    const firstOutcome = await repository.persistPassengerRating(
      newRating,
      undefined,
      {
        token: {
          tokenId: "tok-1",
          orderId: sample.orderId,
          passengerSubjectRef: sample.passengerSubjectRef,
          scopes: ["ride:read", "ride:rate", "receipt:read"],
          expiresAt: "2026-11-20T12:00:00.000Z",
          revokedAt: null,
        },
        tokenDigest: "digest-1",
        assignmentId: sample.assignmentId,
        execute: async (_db, rating, isNew) => {
          hookCalls.push({ tripId: rating.tripId, isNew });
        },
      },
    );
    expect(firstOutcome.rating.tripId).toBe(sample.tripId);
    expect(firstOutcome.summary.driverId).toBe(sample.driverId);
    expect(hookCalls).toEqual([{ tripId: sample.tripId, isNew: true }]);

    // 2. Simulate historical rating stored with assignment_id in DB, replayed when service now passes canonical task_id
    existingStoredTripId = sample.assignmentId;
    const replayOutcome = await repository.persistPassengerRating(
      {
        ...newRating,
        ratingId: "replay-attempt-id",
      },
      undefined,
      {
        token: {
          tokenId: "tok-1",
          orderId: sample.orderId,
          passengerSubjectRef: sample.passengerSubjectRef,
          scopes: ["ride:read", "ride:rate", "receipt:read"],
          expiresAt: "2026-11-20T12:00:00.000Z",
          revokedAt: null,
        },
        tokenDigest: "digest-1",
        assignmentId: sample.assignmentId,
        execute: async (_db, rating, isNew) => {
          hookCalls.push({ tripId: rating.tripId, isNew });
        },
      },
    );
    expect(replayOutcome.rating.ratingId).toBe(sample.ratingId);
    expect(replayOutcome.rating.tripId).toBe(sample.tripId);
    expect(hookCalls).toHaveLength(2);
    expect(hookCalls[1]).toEqual({ tripId: sample.tripId, isNew: false });

    // 3. Genuine assignment mismatch on replay is still rejected with 409 PASSENGER_RATING_ASSIGNMENT_MISSING
    existingStoredTripId = "unrelated-other-assignment";
    await expect(
      repository.persistPassengerRating(
        {
          ...newRating,
          ratingId: "mismatch-attempt-id",
        },
        undefined,
        {
          token: {
            tokenId: "tok-1",
            orderId: sample.orderId,
            passengerSubjectRef: sample.passengerSubjectRef,
            scopes: ["ride:read", "ride:rate", "receipt:read"],
            expiresAt: "2026-11-20T12:00:00.000Z",
            revokedAt: null,
          },
          tokenDigest: "digest-1",
          assignmentId: sample.assignmentId,
          execute: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "PASSENGER_RATING_ASSIGNMENT_MISSING",
    } satisfies Partial<ApiRequestError>);
  });

  it("R1 regression: resolves canonical completed task_id on cold-cache account and token rating replays (historical assignment_id and new task_id rows) and after another worker completes the task, matching admin tripId", async () => {
    const sample = SHARED_SAMPLES[0];
    const order = createSampleOrder(sample);

    for (const storedTripMode of [
      "historical_assignment_id",
      "canonical_task_id",
    ] as const) {
      const calls: string[] = [];
      const storedTripId =
        storedTripMode === "historical_assignment_id"
          ? sample.assignmentId
          : sample.tripId;
      const storedRow = {
        rating_id: sample.ratingId,
        order_id: sample.orderId,
        trip_id: storedTripId,
        driver_id: sample.driverId,
        passenger_subject_ref: sample.passengerSubjectRef,
        score: 5,
        tags: ["clean_vehicle"],
        comment: "cold cache replay",
        status: "active",
        submitted_at: sample.completedAt,
        updated_at: sample.completedAt,
      };
      const query = vi.fn(async (sql: string) => {
        const text = sql.replace(/\s+/g, " ").trim();
        calls.push(text);
        if (text.includes("FROM ops.passenger_ride_access_tokens")) {
          return {
            rows: [
              {
                token_id: "review-token",
                order_id: sample.orderId,
                passenger_subject_ref: sample.passengerSubjectRef,
                scopes: ["ride:read", "ride:rate", "receipt:read"],
                expires_at: "2030-01-01T00:00:00.000Z",
                revoked_at: null,
                database_now: "2026-11-23T07:00:00.000Z",
              },
            ],
          };
        }
        if (text.startsWith("SELECT o.status, o.record")) {
          return { rows: [{ status: "completed", record: order }] };
        }
        if (text.includes("count(*)::integer AS total_items")) {
          return { rows: [{ total_items: 1 }] };
        }
        if (text.includes("AS comment_excerpt")) {
          return {
            rows: [
              {
                rating_id: sample.ratingId,
                order_id: sample.orderId,
                trip_id: sample.tripId,
                driver_id: sample.driverId,
                driver_display_name: sample.driverDisplayName,
                score: 5,
                tags: ["clean_vehicle"],
                comment_excerpt: "cold cache replay",
                status: "active",
                submitted_at: sample.completedAt,
                updated_at: sample.completedAt,
              },
            ],
          };
        }
        if (text.includes("AS canonical_trip_id")) {
          return {
            rows: [
              {
                ...storedRow,
                canonical_trip_id: sample.tripId,
                order_no: sample.orderNo,
                driver_display_name: sample.driverDisplayName,
              },
            ],
          };
        }
        if (text.includes("FROM ops.phase1_driver_tasks")) {
          return {
            rows: [
              {
                completed_at: sample.completedAt,
                // Simulate replay after 24h rating window has expired
                database_now: "2026-11-23T07:00:00.000Z",
                task_id: sample.tripId,
                assignment_id: sample.assignmentId,
              },
            ],
          };
        }
        if (
          text.startsWith("INSERT INTO ops.driver_rating_summaries") ||
          text.includes("FROM ops.driver_rating_summaries")
        ) {
          return {
            rows: [
              {
                driver_id: sample.driverId,
                display_state: "rated",
                average_rating: 5,
                rating_count: 1,
                last_rated_at: sample.completedAt,
                aggregate_version: 1,
                calculated_at: sample.completedAt,
              },
            ],
          };
        }
        if (
          text.startsWith("INSERT INTO ops.passenger_trip_ratings") ||
          text.includes("FROM ops.passenger_trip_ratings")
        ) {
          return { rows: [storedRow] };
        }
        return { rows: [] };
      });

      const repository = new MultiTaxiRepository({
        isEnabled: () => true,
        query,
        connect: async () => ({ query, release: vi.fn() }),
      } as never);
      const owned = {
        resolvePersistedOrder: async () => order,
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: sample.assignmentId,
          driver: { driverId: sample.driverId },
          routeFare: null,
        }),
        resolvePassengerRideTracking: async () => null,
      } as unknown as OwnedMobilityService;

      // 1. Account rating replay with accountHook on cold cache (expired window still replays)
      const accountService = new MultiTaxiService(owned, repository);
      const accountHook = { execute: vi.fn(async () => undefined) };
      const accountReplay = await accountService.submitTrustedPassengerRating(
        sample.orderId,
        { score: 5, tags: ["clean_vehicle"], comment: "cold cache replay" },
        sample.passengerSubjectRef,
        accountHook,
      );
      expect(accountReplay.tripId).toBe(sample.tripId);
      expect(
        calls.filter((s) => s.includes("FROM ops.phase1_driver_tasks")).length,
      ).toBeGreaterThanOrEqual(1);

      // 2. Account rating replay without accountHook on a fresh cold-cache instance
      const directAccountService = new MultiTaxiService(owned, repository);
      const directReplay =
        await directAccountService.submitTrustedPassengerRating(
          sample.orderId,
          { score: 5, tags: ["clean_vehicle"], comment: "cold cache replay" },
          sample.passengerSubjectRef,
        );
      expect(directReplay.tripId).toBe(sample.tripId);

      // 3. Token rating replay on a fresh cold-cache instance
      const consent = {
        preparePassengerRideRatingHook: () => ({
          execute: vi.fn(async () => undefined),
          afterCommit: vi.fn(async () => undefined),
        }),
      };
      const tokenService = new MultiTaxiService(
        owned,
        repository,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        consent as never,
      );
      const tokenReplay = await tokenService.submitPassengerRating(
        "review-access-token",
        { score: 5, tags: ["clean_vehicle"], comment: "cold cache replay" },
      );
      expect(tokenReplay.tripId).toBe(sample.tripId);

      // 4. Compare with admin list & detail tripId
      const adminList = await tokenService.listPassengerRatingReviews({
        tripOrOrder: sample.tripId,
      });
      const adminDetail = await tokenService.getPassengerRatingReview(
        sample.ratingId,
        true,
      );
      expect(adminList.items[0]?.tripId).toBe(sample.tripId);
      expect(adminDetail.rating.tripId).toBe(sample.tripId);
      expect(accountReplay.tripId).toBe(adminDetail.rating.tripId);
      expect(tokenReplay.tripId).toBe(adminDetail.rating.tripId);
    }

    // 5. Another worker completes the task in durable storage while this worker's local task cache is empty:
    // new account and token submissions still resolve and return canonical completed task_id.
    let currentPersistedRow: Record<string, unknown> | null = null;
    const crossWorkerQuery = vi.fn(
      async (sql: string, values: unknown[] = []) => {
        const text = sql.replace(/\s+/g, " ").trim();
        if (text.includes("FROM ops.passenger_ride_access_tokens")) {
          return {
            rows: [
              {
                token_id: "review-token",
                order_id: sample.orderId,
                passenger_subject_ref: sample.passengerSubjectRef,
                scopes: ["ride:read", "ride:rate", "receipt:read"],
                expires_at: "2030-01-01T00:00:00.000Z",
                revoked_at: null,
                database_now: "2026-11-19T13:00:00.000Z",
              },
            ],
          };
        }
        if (text.startsWith("SELECT o.status, o.record")) {
          return { rows: [{ status: "completed", record: order }] };
        }
        if (text.includes("FROM ops.phase1_driver_tasks")) {
          return {
            rows: [
              {
                completed_at: sample.completedAt,
                database_now: "2026-11-19T13:00:00.000Z",
                task_id: sample.tripId,
                assignment_id: sample.assignmentId,
              },
            ],
          };
        }
        if (text.includes("FROM billing.multi_taxi_passenger_payments")) {
          return {
            rows: [
              {
                payment_id: "pay-1",
                status: "captured",
                amount_minor: 32500,
                currency: "TWD",
              },
            ],
          };
        }
        if (text.startsWith("INSERT INTO ops.passenger_trip_ratings")) {
          if (!currentPersistedRow) {
            currentPersistedRow = {
              rating_id: values[0],
              order_id: values[1],
              trip_id: values[2],
              driver_id: values[3],
              passenger_subject_ref: values[4],
              score: values[5],
              tags: JSON.parse(String(values[6])),
              comment: values[7],
              status: values[8],
              submitted_at: values[9],
              updated_at: values[10],
            };
          }
          return { rows: [currentPersistedRow] };
        }
        if (text.startsWith("INSERT INTO ops.driver_rating_summaries")) {
          return {
            rows: [
              {
                driver_id: sample.driverId,
                display_state: "rated",
                average_rating: 5,
                rating_count: 1,
                last_rated_at: sample.completedAt,
                aggregate_version: 1,
                calculated_at: sample.completedAt,
              },
            ],
          };
        }
        if (text.includes("FROM ops.passenger_trip_ratings")) {
          return { rows: currentPersistedRow ? [currentPersistedRow] : [] };
        }
        return { rows: [] };
      },
    );
    const crossWorkerRepo = new MultiTaxiRepository({
      isEnabled: () => true,
      query: crossWorkerQuery,
      connect: async () => ({ query: crossWorkerQuery, release: vi.fn() }),
    } as never);
    const coldOwned = {
      resolvePersistedOrder: async () => order,
      getDriverTasksForOrder: () => [],
      resolvePersistedPassengerAssignmentDisclosure: async () => ({
        assignmentId: sample.assignmentId,
        driver: { driverId: sample.driverId },
        routeFare: null,
      }),
      resolvePassengerRideTracking: async () => null,
    } as unknown as OwnedMobilityService;

    const newAccountService = new MultiTaxiService(coldOwned, crossWorkerRepo);
    const createdAccountRating =
      await newAccountService.submitTrustedPassengerRating(
        sample.orderId,
        { score: 5, tags: [] },
        sample.passengerSubjectRef,
        { execute: vi.fn(async () => undefined) },
      );
    expect(createdAccountRating.tripId).toBe(sample.tripId);
    expect(currentPersistedRow?.trip_id).toBe(sample.tripId);

    currentPersistedRow = null;
    const newTokenService = new MultiTaxiService(
      coldOwned,
      crossWorkerRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        preparePassengerRideRatingHook: () => ({
          execute: vi.fn(async () => undefined),
          afterCommit: vi.fn(async () => undefined),
        }),
      } as never,
    );
    const createdTokenRating = await newTokenService.submitPassengerRating(
      "review-access-token",
      { score: 5, tags: [] },
    );
    expect(createdTokenRating.tripId).toBe(sample.tripId);
  });

  it("R2 regression: preserves or resolves original rating trip identity after reassignment (different driver and same driver/different assignment) with cold local tasks without borrowing replacement task", async () => {
    const sample = SHARED_SAMPLES[0];
    const order = createSampleOrder(sample);

    // Case 1: Reassigned to a different driver; original task untraceable (or DB only returns replacement task)
    const historicalDifferentDriverRow = {
      rating_id: sample.ratingId,
      order_id: sample.orderId,
      trip_id: "original-completed-assignment",
      driver_id: "original-driver",
      passenger_subject_ref: sample.passengerSubjectRef,
      score: 5,
      tags: [],
      comment: null,
      status: "active",
      submitted_at: sample.completedAt,
      updated_at: sample.completedAt,
    };
    const untraceableDifferentDriverQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ops.passenger_trip_ratings")) {
        return { rows: [historicalDifferentDriverRow] };
      }
      if (sql.includes("FROM ops.phase1_driver_tasks")) {
        return {
          rows: [
            {
              completed_at: sample.completedAt,
              database_now: "2026-11-19T13:00:00.000Z",
              task_id: "replacement-task",
              assignment_id: "replacement-assignment",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const serviceDifferentDriverUntraceable = new MultiTaxiService(
      {
        resolvePersistedOrder: async () => order,
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: "replacement-assignment",
          driver: { driverId: "replacement-driver" },
          routeFare: null,
        }),
        resolvePassengerRideTracking: async () => null,
      } as unknown as OwnedMobilityService,
      new MultiTaxiRepository({
        isEnabled: () => true,
        query: untraceableDifferentDriverQuery,
      } as never),
    );
    const viewDifferentDriverUntraceable =
      await serviceDifferentDriverUntraceable.getPassengerRideById(
        sample.orderId,
        sample.passengerSubjectRef,
      );
    expect(viewDifferentDriverUntraceable.rating?.driverId).toBe(
      "original-driver",
    );
    expect(viewDifferentDriverUntraceable.rating?.tripId).toBe(
      "original-completed-assignment",
    );

    // Case 2: Reassigned to a different driver; original completed task IS traceable in durable storage
    const traceableDifferentDriverQuery = vi.fn(
      async (sql: string, values: unknown[] = []) => {
        if (sql.includes("FROM ops.passenger_trip_ratings")) {
          return { rows: [historicalDifferentDriverRow] };
        }
        if (sql.includes("FROM ops.phase1_driver_tasks")) {
          const queriedAssignment = values[1];
          const queriedDriver = values[2];
          if (
            queriedAssignment === "original-completed-assignment" &&
            queriedDriver === "original-driver"
          ) {
            return {
              rows: [
                {
                  completed_at: sample.completedAt,
                  database_now: "2026-11-19T13:00:00.000Z",
                  task_id: "original-completed-task",
                  assignment_id: "original-completed-assignment",
                },
              ],
            };
          }
          return {
            rows: [
              {
                completed_at: sample.completedAt,
                database_now: "2026-11-19T13:00:00.000Z",
                task_id: "replacement-task",
                assignment_id: "replacement-assignment",
              },
            ],
          };
        }
        return { rows: [] };
      },
    );
    const serviceDifferentDriverTraceable = new MultiTaxiService(
      {
        resolvePersistedOrder: async () => order,
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: "replacement-assignment",
          driver: { driverId: "replacement-driver" },
          routeFare: null,
        }),
        resolvePassengerRideTracking: async () => null,
      } as unknown as OwnedMobilityService,
      new MultiTaxiRepository({
        isEnabled: () => true,
        query: traceableDifferentDriverQuery,
      } as never),
    );
    const viewDifferentDriverTraceable =
      await serviceDifferentDriverTraceable.getPassengerRideById(
        sample.orderId,
        sample.passengerSubjectRef,
      );
    expect(viewDifferentDriverTraceable.rating?.driverId).toBe(
      "original-driver",
    );
    expect(viewDifferentDriverTraceable.rating?.tripId).toBe(
      "original-completed-task",
    );

    // Case 3: Reassigned to the SAME driver with a DIFFERENT assignment; untraceable vs traceable original task
    const historicalSameDriverRow = {
      ...historicalDifferentDriverRow,
      trip_id: "original-assignment-1",
      driver_id: "same-driver",
    };
    const sameDriverUntraceableQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ops.passenger_trip_ratings")) {
        return { rows: [historicalSameDriverRow] };
      }
      if (sql.includes("FROM ops.phase1_driver_tasks")) {
        return {
          rows: [
            {
              completed_at: sample.completedAt,
              database_now: "2026-11-19T13:00:00.000Z",
              task_id: "replacement-task-2",
              assignment_id: "replacement-assignment-2",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const serviceSameDriverUntraceable = new MultiTaxiService(
      {
        resolvePersistedOrder: async () => order,
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: "replacement-assignment-2",
          driver: { driverId: "same-driver" },
          routeFare: null,
        }),
        resolvePassengerRideTracking: async () => null,
      } as unknown as OwnedMobilityService,
      new MultiTaxiRepository({
        isEnabled: () => true,
        query: sameDriverUntraceableQuery,
      } as never),
    );
    const viewSameDriverUntraceable =
      await serviceSameDriverUntraceable.getPassengerRideById(
        sample.orderId,
        sample.passengerSubjectRef,
      );
    expect(viewSameDriverUntraceable.rating?.driverId).toBe("same-driver");
    expect(viewSameDriverUntraceable.rating?.tripId).toBe(
      "original-assignment-1",
    );

    const sameDriverTraceableQuery = vi.fn(
      async (sql: string, values: unknown[] = []) => {
        if (sql.includes("FROM ops.passenger_trip_ratings")) {
          return { rows: [historicalSameDriverRow] };
        }
        if (sql.includes("FROM ops.phase1_driver_tasks")) {
          if (values[1] === "original-assignment-1") {
            return {
              rows: [
                {
                  completed_at: sample.completedAt,
                  database_now: "2026-11-19T13:00:00.000Z",
                  task_id: "original-task-1",
                  assignment_id: "original-assignment-1",
                },
              ],
            };
          }
          return {
            rows: [
              {
                completed_at: sample.completedAt,
                database_now: "2026-11-19T13:00:00.000Z",
                task_id: "replacement-task-2",
                assignment_id: "replacement-assignment-2",
              },
            ],
          };
        }
        return { rows: [] };
      },
    );
    const serviceSameDriverTraceable = new MultiTaxiService(
      {
        resolvePersistedOrder: async () => order,
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: "replacement-assignment-2",
          driver: { driverId: "same-driver" },
          routeFare: null,
        }),
        resolvePassengerRideTracking: async () => null,
      } as unknown as OwnedMobilityService,
      new MultiTaxiRepository({
        isEnabled: () => true,
        query: sameDriverTraceableQuery,
      } as never),
    );
    const viewSameDriverTraceable =
      await serviceSameDriverTraceable.getPassengerRideById(
        sample.orderId,
        sample.passengerSubjectRef,
      );
    expect(viewSameDriverTraceable.rating?.driverId).toBe("same-driver");
    expect(viewSameDriverTraceable.rating?.tripId).toBe("original-task-1");
  });
});
