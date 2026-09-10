// SR-HOST-FE-001-ACCEPTANCE-RUNNER: real HTTP + real SQL acceptance evidence
// for the Host restricted read-only surface (`/api/host/*`).
//
// This is the `host_actual_http_sql_owner_scope` required_acceptance gate:
// real HTTP requests against a real, listening Nest server, backed by a
// real, migrated PostgreSQL — never mocked repositories or fabricated
// `CurrentIdentity` objects. See host-acceptance-app.ts for why this boots
// an isolated composition (HostViewModule + BootstrapAuthGuard) instead of
// the full AppModule, and host-acceptance-seed.ts for exactly which
// production tables this fixture writes to and why.
//
// Requires `DATABASE_URL` to point at a migrated, empty-of-conflicts
// PostgreSQL instance. Run only in the dedicated `host-acceptance.yml`
// GitHub Actions workflow (GitHub-hosted Postgres service) or against a
// throwaway local database outside this repo's VM restriction — never
// against a shared/unmigrated database.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { createRequire } from "node:module";
import {
  buildHostAcceptanceCandidate,
  createHostAcceptanceApp,
  type HostAcceptanceAppLike,
} from "./host-acceptance-app";
import {
  ASSIGNMENT_A1_TRIP1,
  BULK_VEHICLE_COUNT,
  CASE_A1,
  FLEET_OPERATOR_PARTNER_ID,
  HOST_A_PARTNER_ID,
  HOST_B_PARTNER_ID,
  HOST_BULK_PARTNER_ID,
  HOST_UNRELATED_PARTNER_ID,
  ORDER_A1_TRIP1,
  TASK_A1_TRIP1,
  VEHICLE_A1,
  VEHICLE_A2_MAINT,
  VEHICLE_A_INACTIVE,
  VEHICLE_B1,
  bulkVehicleId,
  cleanupHostAcceptanceFixtures,
  seedHostAcceptanceFixtures,
} from "./host-acceptance-seed";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

const HOST_SCOPES = "owned:read,reports:read,maintenance:read";

function hostHeaders(
  partnerId: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    "x-actor-type": "partner_user",
    "x-actor-id": partnerId,
    "x-partner-id": partnerId,
    "x-realm": "partner",
    "x-roles": "partner",
    "x-role-families": "partner",
    "x-scopes": HOST_SCOPES,
    "x-request-id": `sr-host-fe-001-${partnerId}-${Date.now()}`,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete base[key];
    } else {
      base[key] = value;
    }
  }
  return base;
}

interface ApiEnvelope<T> {
  data: T;
  error?: { code: string; message: string };
}

describe("SR-HOST-FE-001-ACCEPTANCE-RUNNER: real HTTP + SQL Host acceptance", () => {
  let app: HostAcceptanceAppLike;
  let baseUrl: string;
  let recorder: UatEvidenceRecorder;
  let dbQuery: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

  beforeAll(async () => {
    recorder = new UatEvidenceRecorder({
      taskId: "SR-HOST-FE-001-ACCEPTANCE-RUNNER",
      candidateSha: process.env.CANDIDATE_SHA,
    });
    recorder.recordConsole("info", "Building apps/api candidate for isolated Host acceptance composition.");
    buildHostAcceptanceCandidate();

    await cleanupHostAcceptanceFixtures().catch(() => undefined);
    await seedHostAcceptanceFixtures();
    recorder.recordResourceId("partner", HOST_A_PARTNER_ID);
    recorder.recordResourceId("partner", HOST_B_PARTNER_ID);
    recorder.recordResourceId("partner", HOST_UNRELATED_PARTNER_ID);
    recorder.recordResourceId("partner", HOST_BULK_PARTNER_ID);
    recorder.recordResourceId("vehicle", VEHICLE_A1);

    app = await createHostAcceptanceApp();
    await app.listen(0, "127.0.0.1");
    baseUrl = (await app.getUrl()).replace("[::1]", "127.0.0.1");

    const apiRequire = createRequire(
      path.resolve(__dirname, "../../../../apps/api/package.json"),
    );
    interface DatabaseServiceLike {
      query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
    }
    const { DatabaseService } = apiRequire("./dist/common/db") as {
      DatabaseService: new () => DatabaseServiceLike;
    };
    const db = app.get<DatabaseServiceLike>(DatabaseService);
    dbQuery = (text, values) => db.query(text, values);
  }, 180_000);

  afterAll(async () => {
    const outputPath = process.env.HOST_ACCEPTANCE_EVIDENCE_PATH;
    if (outputPath) {
      recorder.saveToFile(outputPath);
    } else {
      recorder.finalize();
    }
    if (app) {
      await app.close();
    }
    await cleanupHostAcceptanceFixtures().catch(() => undefined);
  });

  async function call(
    method: string,
    urlPath: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const start = Date.now();
    const res = await fetch(`${baseUrl}${urlPath}`, { method, headers });
    const durationMs = Date.now() - start;
    const body = await res.json().catch(() => undefined);
    recorder.recordHttpCall({
      method,
      url: `${baseUrl}${urlPath}`,
      statusCode: res.status,
      durationMs,
      requestHeaders: headers,
      responseBody: body,
      actorRole: headers["x-actor-id"],
    });
    return { status: res.status, body };
  }

  describe("Anonymous / unauthenticated access", () => {
    it("rejects a request with no bootstrap headers as 401 (guard-level AUTH_REQUIRED)", async () => {
      // No identity headers at all: BootstrapAuthGuard itself rejects this
      // before the request ever reaches HostViewController/Service — the
      // controller's own HOST_UNAUTHORIZED code is a defense-in-depth check
      // for an identity that resolves but is incomplete (see the next test),
      // not for a wholly anonymous request.
      const { status, body } = await call("GET", "/api/host/vehicles", {});
      expect(status).toBe(401);
      expect(JSON.stringify(body)).toContain("AUTH_REQUIRED");
    });

    it("rejects a non-partner realm identity as 403 (guard-level AUTH_REALM_DENIED)", async () => {
      // HostViewController's own @RequireRealms("partner") means
      // BootstrapAuthGuard rejects any other realm before
      // HostViewService.resolvePartnerId's own (otherwise unreachable
      // through this guarded route) "only partner realm" check ever runs.
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles",
        hostHeaders(HOST_A_PARTNER_ID, { "x-realm": "ops" }),
      );
      expect(status).toBe(403);
      expect(JSON.stringify(body)).toContain("AUTH_REALM_DENIED");
    });

    it("rejects a partner-realm identity with no partner id as 401 (service-level HOST_UNAUTHORIZED)", async () => {
      // Realm is "partner" (passes the guard), but both x-actor-id and
      // x-partner-id are withheld, so HostViewService.resolvePartnerId's own
      // check is what actually rejects this — the one guard-level 401 above
      // cannot reach.
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles",
        hostHeaders(HOST_A_PARTNER_ID, {
          "x-actor-id": undefined,
          "x-partner-id": undefined,
        }),
      );
      expect(status).toBe(401);
      expect(JSON.stringify(body)).toContain("HOST_UNAUTHORIZED");
    });

    it("rejects a partner identity missing the required scope as 403 (service-level HOST_FORBIDDEN)", async () => {
      // Realm is "partner" and the identity is otherwise complete (passes
      // both the guard and resolvePartnerId's own identity checks), but the
      // granted scope set omits "owned:read", which HostViewService.listVehicles
      // requires — the one guard-level 403 above (wrong realm) cannot reach
      // this scope-level check.
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles",
        hostHeaders(HOST_A_PARTNER_ID, { "x-scopes": "reports:read" }),
      );
      expect(status).toBe(403);
      expect(JSON.stringify(body)).toContain("HOST_FORBIDDEN");
    });
  });

  describe("Owner isolation across two real hosts and an unrelated identity", () => {
    it("Host A sees only its own active vehicles, never Host B's or its own inactive vehicle", async () => {
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles?page=1&pageSize=20",
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: Array<{ vehicle_id: string }> }>;
      const ids = envelope.data.items.map((v) => v.vehicle_id);
      expect(ids).toContain(VEHICLE_A1);
      expect(ids).toContain(VEHICLE_A2_MAINT);
      expect(ids).not.toContain(VEHICLE_B1);
      expect(ids).not.toContain(VEHICLE_A_INACTIVE);
    });

    it("Host B sees only its own vehicle, never Host A's", async () => {
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles?page=1&pageSize=20",
        hostHeaders(HOST_B_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: Array<{ vehicle_id: string }> }>;
      const ids = envelope.data.items.map((v) => v.vehicle_id);
      expect(ids).toEqual([VEHICLE_B1]);
    });

    it("an unrelated authenticated partner identity with zero vehicles gets a legitimate empty list, not an error", async () => {
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles?page=1&pageSize=20",
        hostHeaders(HOST_UNRELATED_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: unknown[]; page_info: { total_items: number } }>;
      expect(envelope.data.items).toEqual([]);
      expect(envelope.data.page_info.total_items).toBe(0);
    });

    it("Host B requesting Host A's vehicle detail (earnings) gets anti-enumeration 404, not 403 or leaked data", async () => {
      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/earnings`,
        hostHeaders(HOST_B_PARTNER_ID),
      );
      expect(status).toBe(404);
      expect(JSON.stringify(body)).toContain("HOST_VEHICLE_NOT_FOUND");
      expect(JSON.stringify(body)).not.toContain("UAT-A001");
    });

    it("Host B requesting Host A's vehicle maintenance also gets 404, and no maintenance rows leak", async () => {
      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/maintenance`,
        hostHeaders(HOST_B_PARTNER_ID),
      );
      expect(status).toBe(404);
      expect(JSON.stringify(body)).not.toContain("oil_change");
    });
  });

  describe("Read-only enforcement (AC-HOST-NEG-2)", () => {
    it("rejects POST/PUT/PATCH/DELETE on vehicles with 405 and leaves SQL state unchanged", async () => {
      const before = await dbQuery(
        "SELECT current_status, active_flag FROM reg.vehicles WHERE vehicle_id = $1",
        [VEHICLE_A1],
      );

      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { status, body } = await call(
          method,
          "/api/host/vehicles",
          hostHeaders(HOST_A_PARTNER_ID),
        );
        expect(status).toBe(405);
        expect(JSON.stringify(body)).toContain("HOST_MUTATION_NOT_SUPPORTED");
      }

      const after = await dbQuery(
        "SELECT current_status, active_flag FROM reg.vehicles WHERE vehicle_id = $1",
        [VEHICLE_A1],
      );
      expect(after.rows).toEqual(before.rows);
    });
  });

  describe("Real maintenance HTTP + SQL round trip", () => {
    it("returns the two real seeded maintenance rows for Host A's own vehicle", async () => {
      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/maintenance`,
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: Array<{ maintenance_id: string; status: string; cost: number | null }> }>;
      expect(envelope.data.items).toHaveLength(2);
      const completed = envelope.data.items.find(
        (i) => i.maintenance_id === "sr-host-fe-001-maint-a1-completed",
      );
      expect(completed?.status).toBe("completed");
      expect(completed?.cost).toBe(1200);
      const scheduled = envelope.data.items.find(
        (i) => i.maintenance_id === "sr-host-fe-001-maint-a1-scheduled",
      );
      expect(scheduled?.status).toBe("scheduled");
      expect(scheduled?.cost).toBeNull();
    });
  });

  describe("Known real-schema defect: trips/cases/earnings cannot reach seeded data", () => {
    // HostViewRepository.listTripsByVehicle queries
    // `ops.phase1_driver_tasks` for `t.vehicle_id`, `t.started_at`,
    // `t.completed_at`, `t.actual_distance_km`, `t.fare` as if they were
    // real top-level columns. On the actual production schema (see
    // infra/migrations/V0011__phase1_runtime_snapshots.sql) that table only
    // has `task_id, order_id, dispatch_job_id, assignment_id, status,
    // created_at, updated_at, record jsonb` — none of those five referenced
    // columns exist. listVehicleCases' subquery on
    // `ops.phase1_dispatch_assignments.vehicle_id` has the same problem.
    // Both real SQL statements fail with "column does not exist"; the
    // repository's own try/catch then silently falls back to its
    // (production-empty) in-memory map, so the real HTTP response is a
    // quiet 200 with an empty list, not a 5xx. This suite proves that with
    // real, correctly-shaped source data actually present (seeded above) —
    // the failure is the query, not missing data — and records it as a
    // defect to report upstream, per this task's mandate to report real
    // failures rather than paper over them.
    it("real completed trip data exists in SQL for VEHICLE_A1", async () => {
      const rows = await dbQuery(
        "SELECT task_id FROM ops.phase1_driver_tasks WHERE task_id = $1",
        [TASK_A1_TRIP1],
      );
      expect(rows.rows).toHaveLength(1);
      const assignmentRows = await dbQuery(
        "SELECT assignment_id FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
        [ASSIGNMENT_A1_TRIP1],
      );
      expect(assignmentRows.rows).toHaveLength(1);
    });

    it("[DEFECT] GET .../trips silently returns an empty list despite the real completed trip existing", async () => {
      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/trips`,
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: unknown[] }>;
      expect(envelope.data.items).toEqual([]);
      recorder.recordLiveLimitation(
        "host_view_trips_sql_column_mismatch",
        "HostViewRepository.listTripsByVehicle queries ops.phase1_driver_tasks.vehicle_id/started_at/completed_at/actual_distance_km/fare as top-level columns, which do not exist on the real production schema (data lives in the record jsonb column). The real SQL query throws and the repository's try/catch silently falls back to an always-empty in-memory map, so GET /api/host/vehicles/:id/trips returns HTTP 200 with an empty list even when real completed trips exist for that vehicle. Reported to SR-HOST-BE-001 owners; not fixed by this acceptance-runner task, which does not edit apps/api/src.",
      );
    });

    it("[DEFECT] GET .../cases silently returns an empty list despite the real open case existing", async () => {
      const caseRows = await dbQuery(
        "SELECT case_no FROM crm.phase1_complaint_cases WHERE case_no = $1",
        [CASE_A1],
      );
      expect(caseRows.rows).toHaveLength(1);

      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/cases`,
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ items: unknown[] }>;
      expect(envelope.data.items).toEqual([]);
      recorder.recordLiveLimitation(
        "host_view_cases_sql_column_mismatch",
        "HostViewRepository.listVehicleCases' subquery references ops.phase1_dispatch_assignments.vehicle_id, which does not exist on the real production schema (same record-jsonb-only shape as phase1_driver_tasks). The real SQL query throws and the repository silently falls back to an always-empty in-memory map, so GET /api/host/vehicles/:id/cases returns HTTP 200 with an empty list even when a real open case exists for that vehicle. Reported to SR-HOST-BE-001 owners; not fixed by this acceptance-runner task, which does not edit apps/api/src.",
      );
    });

    it("[DEFECT] earnings summary is always zero because it derives from the same broken trips query", async () => {
      const { status, body } = await call(
        "GET",
        `/api/host/vehicles/${VEHICLE_A1}/earnings?month=2026-03`,
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(200);
      const envelope = body as ApiEnvelope<{ gross_revenue: number; trips_count: number }>;
      expect(envelope.data.gross_revenue).toBe(0);
      expect(envelope.data.trips_count).toBe(0);
    });
  });

  describe("Pagination edge cases: empty, long lists, and the >100-vehicle lookup limitation", () => {
    it("supports a long list (205 vehicles) across pages, and reveals the backend's own 100-row pageSize clamp", async () => {
      // HostViewService.paginate clamps pageSize to a hard max of 100
      // (Math.min(100, ...)) regardless of what the caller requests. This is
      // real, verified backend behavior — requesting pageSize=200 does not
      // raise an error, it silently returns (and reports back via
      // page_info.page_size) a 100-row page instead.
      const page1 = await call(
        "GET",
        "/api/host/vehicles?page=1&pageSize=200",
        hostHeaders(HOST_BULK_PARTNER_ID),
      );
      expect(page1.status).toBe(200);
      const page1Envelope = page1.body as ApiEnvelope<{
        items: Array<{ vehicle_id: string }>;
        page_info: { page_size: number; total_items: number; total_pages: number };
      }>;
      expect(page1Envelope.data.items).toHaveLength(100);
      expect(page1Envelope.data.page_info.page_size).toBe(100);
      expect(page1Envelope.data.page_info.total_items).toBe(BULK_VEHICLE_COUNT);

      const page2 = await call(
        "GET",
        "/api/host/vehicles?page=2&pageSize=100",
        hostHeaders(HOST_BULK_PARTNER_ID),
      );
      expect(page2.status).toBe(200);
      const page2Envelope = page2.body as ApiEnvelope<{ items: Array<{ vehicle_id: string }> }>;
      expect(page2Envelope.data.items).toHaveLength(100);

      const page3 = await call(
        "GET",
        "/api/host/vehicles?page=3&pageSize=100",
        hostHeaders(HOST_BULK_PARTNER_ID),
      );
      expect(page3.status).toBe(200);
      const page3Envelope = page3.body as ApiEnvelope<{ items: Array<{ vehicle_id: string }> }>;
      expect(page3Envelope.data.items).toHaveLength(BULK_VEHICLE_COUNT - 200);
      const lastVehicleId = bulkVehicleId(BULK_VEHICLE_COUNT);
      expect(page3Envelope.data.items.map((v) => v.vehicle_id)).toContain(lastVehicleId);

      // The list endpoint itself paginates correctly across as many 100-row
      // pages as needed (it fetches all owned rows, then paginates in
      // memory — see HostViewService.paginate). But the FRONTEND's
      // loadHostVehicleDetail (host-data.server.ts) always requests a single
      // page=1/pageSize=200 lookup and searches only within the rows that
      // page actually returns. Because the backend clamps pageSize to 100,
      // that single lookup only ever contains the first 100 owned vehicles —
      // a host's vehicle #101+ is reported as vehicle_not_found on the
      // detail page despite being genuinely owned and active. This is a more
      // severe cutoff than host-data.server.ts's own "200-row" comment
      // assumes, because it did not account for the backend's independent
      // 100-row pageSize clamp. See host-browser-acceptance.spec.ts for the
      // real-browser reproduction (vehicle #201, which is beyond both the
      // frontend's assumed 200-row boundary and the backend's real 100-row
      // clamp, so it is not found under either accounting).
      recorder.recordLiveLimitation(
        "host_frontend_200_row_detail_lookup",
        "The backend GET /api/host/vehicles list endpoint paginates correctly past 100 rows across multiple pages (verified here), but HostViewService.paginate clamps any requested pageSize to a hard max of 100. The FRONTEND's loadHostVehicleDetail (host-data.server.ts) assumes a single page=1/pageSize=200 request returns up to 200 rows and searches only within that one response; because the backend silently clamps to 100, the real cutoff for the detail page is a host's vehicle #101, not #201 as host-data.server.ts's own comment assumes. See host-browser-acceptance.spec.ts for the real-browser reproduction of this limitation using vehicle #201 (beyond both boundaries).",
      );
    });

    it("returns a legitimate 404 for a syntactically valid but nonexistent vehicle id", async () => {
      const { status, body } = await call(
        "GET",
        "/api/host/vehicles/00000000-0000-4000-8000-000000000000/earnings",
        hostHeaders(HOST_A_PARTNER_ID),
      );
      expect(status).toBe(404);
      expect(JSON.stringify(body)).toContain("HOST_VEHICLE_NOT_FOUND");
    });
  });

  describe("Fictional data guardrail", () => {
    it("every identifier used in this suite is fictional UAT data, never a real production ID", () => {
      const fictionalIds = [
        HOST_A_PARTNER_ID,
        HOST_B_PARTNER_ID,
        HOST_UNRELATED_PARTNER_ID,
        HOST_BULK_PARTNER_ID,
        FLEET_OPERATOR_PARTNER_ID,
        VEHICLE_A1,
        VEHICLE_A2_MAINT,
        VEHICLE_A_INACTIVE,
        VEHICLE_B1,
        ORDER_A1_TRIP1,
      ];
      for (const id of fictionalIds) {
        expect(id.toLowerCase()).toMatch(/^(a0000000-0000-4000-8000-|b0000000-0000-4000-8000-|sr-host-fe-001-)/);
      }
    });
  });
});
