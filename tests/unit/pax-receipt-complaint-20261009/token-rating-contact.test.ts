import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  SubmitPassengerTripRatingCommand,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { MultiTaxiController } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";

const ORDER = "11111111-1111-4111-8111-111111111111";
const SUBJECT = "legacy-subject-unit";
const TOKEN = "review-supported-token";

/**
 * SQL responses and completed order/assignment are the external fixtures.
 * Token digest/scope/expiry, controller, rating logic, SQL and row mappers are
 * production code. This is source reproduction, not PG/HTTP acceptance.
 */
function fixture() {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  type State = {
    rating?: Record<string, unknown>;
    consent?: Record<string, unknown>;
    complaintCase?: ComplaintCaseRecord;
    timeline?: ComplaintTimelineEntry;
    summary?: Record<string, unknown>;
  };
  type Fault =
    | "connect"
    | "rating"
    | "case"
    | "timeline"
    | "consent"
    | "summary"
    | "commit"
    | "lost_commit_reply";
  const state: State = {};
  let pending: State | undefined;
  const authority = {
    enabled: true,
    found: true,
    scopes: ["ride:rate"],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revokedAt: null as string | null,
    completed: true,
    assigned: true,
    subject: SUBJECT,
    durableSubject: SUBJECT,
    durableStatus: "completed",
    durableAssignment: true,
    paid: true,
    completedAt: new Date(Date.now() - 3_600_000).toISOString(),
    fault: undefined as Fault | undefined,
    rollbackFails: false,
  };
  const release = vi.fn();
  const tokenDigest = () =>
    createHash("sha256")
      .update(
        `${process.env.PASSENGER_RIDE_TOKEN_PEPPER?.trim() ?? ""}\0${TOKEN}`,
      )
      .digest("hex");
  const tokenRow = () => ({
    token_id: "unit-token",
    order_id: ORDER,
    passenger_subject_ref: SUBJECT,
    scopes: [...authority.scopes],
    expires_at: authority.expiresAt,
    revoked_at: authority.revokedAt,
    database_now: new Date(),
  });
  const fail = (fault: Fault) => {
    if (authority.fault === fault) throw new Error(`${fault} failure`);
  };
  const query = async (
    sql: string,
    values: readonly unknown[] = [],
    transaction = false,
  ) => {
    const text = sql.trim().replace(/\s+/g, " ");
    calls.push({ sql: text, values });
    if (text === "BEGIN") {
      pending = structuredClone(state);
      return { rows: [] };
    }
    if (text === "ROLLBACK") {
      pending = undefined;
      if (authority.rollbackFails) throw new Error("rollback failure");
      return { rows: [] };
    }
    if (text === "COMMIT") {
      fail("commit");
      Object.assign(state, pending);
      pending = undefined;
      fail("lost_commit_reply");
      return { rows: [] };
    }
    const target = transaction ? pending! : state;
    if (
      text.startsWith("SET LOCAL") ||
      text.startsWith("SELECT pg_advisory_xact_lock")
    )
      return { rows: [] };
    if (text.includes("FROM ops.passenger_ride_access_tokens")) {
      expect(values).toEqual(
        transaction
          ? ["unit-token", tokenDigest(), ORDER, SUBJECT]
          : [tokenDigest()],
      );
      return { rows: authority.found ? [tokenRow()] : [] };
    }
    if (text.startsWith("SELECT o.status"))
      return {
        rows: [
          {
            status: authority.durableStatus,
            record: {
              runtimeProfileCode: "multi_taxi_direct",
              passenger: { passengerId: authority.durableSubject },
            },
          },
        ],
      };
    if (text.startsWith("SELECT record->>'completedAt'")) {
      expect(values).toEqual([ORDER, "unit-assignment", "unit-driver"]);
      return {
        rows: authority.durableAssignment
          ? [{ completed_at: authority.completedAt, database_now: new Date() }]
          : [],
      };
    }
    if (text.startsWith("SELECT payment_id"))
      return { rows: authority.paid ? [{ payment_id: "paid-unit" }] : [] };
    if (text.startsWith("SELECT * FROM ops.passenger_trip_ratings"))
      return { rows: target.rating ? [target.rating] : [] };
    if (text.startsWith("INSERT INTO ops.passenger_trip_ratings")) {
      fail("rating");
      target.rating ??= Object.fromEntries(
        [
          "rating_id",
          "order_id",
          "trip_id",
          "driver_id",
          "passenger_subject_ref",
          "score",
          "tags",
          "comment",
          "status",
          "submitted_at",
          "updated_at",
        ].map((key, index) => [
          key,
          index === 6 ? JSON.parse(values[index] as string) : values[index],
        ]),
      );
      return { rows: [target.rating] };
    }
    if (
      text.startsWith("SELECT p.request_hash") &&
      text.includes("FROM ops.passenger_ride_rating_consents")
    )
      return {
        rows: target.consent
          ? [
              {
                ...target.consent,
                record: target.complaintCase,
                timeline: target.timeline,
              },
            ]
          : [],
      };
    if (text.startsWith("INSERT INTO crm.phase1_complaint_cases")) {
      fail("case");
      target.complaintCase = JSON.parse(values[5] as string);
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO crm.phase1_complaint_timelines")) {
      fail("timeline");
      target.timeline = JSON.parse(values[4] as string);
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO ops.passenger_ride_rating_consents")) {
      fail("consent");
      target.consent = Object.fromEntries(
        [
          "order_id",
          "passenger_subject_ref",
          "rating_id",
          "original_token_id",
          "rating_score",
          "contact_requested",
          "request_hash",
          "complaint_case_no",
          "created_at",
        ].map((key, i) => [key, values[i]]),
      );
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO ops.driver_rating_summaries")) {
      fail("summary");
      target.summary = {
        driver_id: values[0],
        display_state: "rated",
        average_rating: target.rating!.score,
        rating_count: 1,
        last_rated_at: target.rating!.submitted_at,
        aggregate_version: 1,
        calculated_at: values[1],
      };
      return { rows: [target.summary] };
    }
    if (
      text.startsWith("SELECT c.record") ||
      text.startsWith("SELECT t.record")
    ) {
      const record = text.startsWith("SELECT t.record")
        ? state.timeline
        : state.complaintCase;
      const eligible =
        state.consent?.complaint_case_no &&
        (values.length === 2 || values[0] === state.consent.complaint_case_no);
      return { rows: eligible && record ? [{ record }] : [] };
    }
    throw new Error(`Unexpected production SQL: ${text}`);
  };
  const database = {
    isEnabled: () => authority.enabled,
    query,
    connect: async () => {
      fail("connect");
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          query(sql, values, true),
        release,
      };
    },
  } as unknown as DatabaseService;
  const owned = {
    resolvePersistedOrder: async (orderId: string) => {
      expect(orderId).toBe(ORDER);
      return {
        orderId: ORDER,
        runtimeProfileCode: "multi_taxi_direct",
        status: authority.completed ? "completed" : "on_trip",
        passenger: { passengerId: authority.subject },
      };
    },
    resolvePersistedPassengerAssignmentDisclosure: async () =>
      authority.assigned
        ? {
            assignmentId: "unit-assignment",
            driver: { driverId: "unit-driver" },
          }
        : null,
  } as unknown as OwnedMobilityService;
  const audit = new AuditNotificationService();
  const createComplaint = () =>
    new ComplaintService(audit, new ComplaintRepository(database));
  const complaint = createComplaint();
  const createController = (crm: ComplaintService | undefined = complaint) =>
    new MultiTaxiController(
      new MultiTaxiService(
        owned,
        new MultiTaxiRepository(database),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        crm,
      ),
    );
  const controller = createController();
  const command = { score: 2 as const, contactRequested: true };
  return {
    authority,
    calls,
    state,
    release,
    audit,
    complaint,
    createComplaint,
    createController,
    controller,
    command,
    submit: (body: SubmitPassengerTripRatingCommand = command) =>
      controller.submitPassengerRating(TOKEN, body),
  };
}

describe("F-TOKEN-LOW-RATING-CONTACT supported production operation", () => {
  it("score 2 with selected contact persists one canonical CRM case and its initial timeline", async () => {
    const f = fixture();
    const response = await f.submit();
    expect(response.data).toMatchObject({
      score: 2,
      passengerSubjectRef: SUBJECT,
    });
    expect(f.calls.some((call) => call.sql === "COMMIT")).toBe(true);
    expect(
      f.calls.filter((call) =>
        call.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
    expect(
      f.calls.filter((call) =>
        call.sql.startsWith("INSERT INTO crm.phase1_complaint_timelines"),
      ),
    ).toHaveLength(1);
  });

  it("exact replay keeps the original rating; changing contact choice must conflict", async () => {
    const f = fixture();
    const first = await f.submit();
    const replay = await f.submit();
    expect(replay.data.ratingId).toBe(first.data.ratingId);
    await expect(
      f.submit({ ...f.command, contactRequested: false }),
    ).rejects.toMatchObject({
      code: "PASSENGER_RATING_ALREADY_SUBMITTED",
    });
  });

  it.each([
    { score: 2 as const, contactRequested: false },
    { score: 5 as const, contactRequested: true },
    { score: 2 as const },
  ])("%j stores a rating without a complaint", async (command) => {
    const f = fixture();
    const response = await f.controller.submitPassengerRating(TOKEN, command);
    expect(response.data.score).toBe(command.score);
    expect(f.state.consent?.contact_requested).toBe(
      command.contactRequested ?? false,
    );
    expect(
      f.calls.filter((call) => call.sql.startsWith("INSERT INTO crm.")),
    ).toHaveLength(0);
  });

  it.each([
    "missing",
    "expired",
    "revoked",
    "scope",
    "incomplete",
    "unassigned",
  ] as const)("%s authority rejects before rating writes", async (reason) => {
    const f = fixture();
    if (reason === "missing") f.authority.found = false;
    if (reason === "expired") f.authority.expiresAt = new Date(0).toISOString();
    if (reason === "revoked") f.authority.revokedAt = new Date(0).toISOString();
    if (reason === "scope") f.authority.scopes = ["ride:read"];
    if (reason === "incomplete") f.authority.completed = false;
    if (reason === "unassigned") f.authority.assigned = false;
    await expect(f.submit()).rejects.toMatchObject({
      code:
        reason === "scope"
          ? "PASSENGER_RIDE_SCOPE_FORBIDDEN"
          : reason === "incomplete"
            ? "PASSENGER_RATING_TRIP_NOT_COMPLETED"
            : reason === "unassigned"
              ? "PASSENGER_RATING_ASSIGNMENT_MISSING"
              : "PASSENGER_RIDE_TOKEN_INVALID",
    });
    expect(
      f.calls.filter((call) => call.sql.startsWith("INSERT")),
    ).toHaveLength(0);
  });
});

describe("token choice transaction, original replay and durable Ops source", () => {
  it.each([1, 2] as const)(
    "score %s stores verified token choice with canonical CRM and truthful audit",
    async (score) => {
      const f = fixture();
      const response = await f.submit({ ...f.command, score });
      expect(f.state.consent).toMatchObject({
        rating_id: response.data.ratingId,
        original_token_id: "unit-token",
        order_id: ORDER,
        passenger_subject_ref: SUBJECT,
        rating_score: score,
        contact_requested: true,
        complaint_case_no: f.state.complaintCase!.caseNo,
      });
      expect(f.state.complaintCase).toMatchObject({
        relatedOrderId: ORDER,
        category: "driver_service",
        status: "new",
      });
      expect(f.state.timeline).toMatchObject({
        caseNo: f.state.complaintCase!.caseNo,
        action: "case_created",
      });
      expect(
        f.calls.some((c) =>
          /passenger\.(accounts|booking_histories|complaints|rating_consents)/.test(
            c.sql,
          ),
        ),
      ).toBe(false);
      expect(
        f.audit
          .listAuditLogs()
          .find((log) => log.resourceId === f.state.complaintCase!.caseNo),
      ).toMatchObject({
        actorType: "system",
        actorId: null,
        newValuesSummary: {
          source: "passenger_ride_token",
          passengerSubjectRef: SUBJECT,
        },
      });
    },
  );

  it("normalizes rating payload and treats omitted contact as false for new ratings", async () => {
    const f = fixture();
    const first = await f.submit({
      score: 2,
      tags: [" b", "a", "a"],
      comment: " note ",
    });
    const replay = await f.submit({
      score: 2,
      tags: ["a", "b"],
      comment: "note",
      contactRequested: false,
    });
    expect(replay.data.ratingId).toBe(first.data.ratingId);
    expect(f.state.consent?.contact_requested).toBe(false);
    expect(f.state.complaintCase).toBeUndefined();
  });

  it.each([
    { score: 1 as const, contactRequested: true },
    { score: 2 as const, tags: ["changed"], contactRequested: true },
    { score: 2 as const, comment: "changed", contactRequested: true },
  ])(
    "changed rating payload %j rolls back before reusing consent",
    async (command) => {
      const f = fixture();
      await f.submit();
      const original = structuredClone(f.state);
      await expect(f.submit(command)).rejects.toMatchObject({
        code: "PASSENGER_RATING_ALREADY_SUBMITTED",
      });
      expect(f.state).toEqual(original);
      expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );

  it("high score contact remains an immutable choice without creating a case", async () => {
    const f = fixture();
    await f.submit({ score: 5, contactRequested: true });
    await expect(
      f.submit({ score: 5, contactRequested: false }),
    ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
    expect(f.state.consent?.contact_requested).toBe(true);
    expect(f.state.complaintCase).toBeUndefined();
  });

  it("historical rating without consent permits only an omitted-contact exact replay, with no backfill", async () => {
    const f = fixture();
    const first = await f.submit({ score: 2 });
    // External historical DB snapshot: V0119 deliberately does not backfill old ratings.
    delete f.state.consent;
    const replay = await f
      .createController()
      .submitPassengerRating(TOKEN, { score: 2 });
    expect(replay.data.ratingId).toBe(first.data.ratingId);
    expect(f.state.consent).toBeUndefined();
    expect(f.state.complaintCase).toBeUndefined();
    for (const contactRequested of [true, false])
      await expect(
        f.submit({ score: 2, contactRequested }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_CONSENT_UNAVAILABLE" });
    expect(f.state.consent).toBeUndefined();
  });

  it("restart replay preserves rating/case and new Ops service reads the token intake", async () => {
    const f = fixture();
    const first = await f.submit();
    const caseNo = f.state.complaintCase!.caseNo;
    const replay = await f
      .createController(f.createComplaint())
      .submitPassengerRating(TOKEN, f.command);
    expect(replay.data.ratingId).toBe(first.data.ratingId);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_timelines"),
      ),
    ).toHaveLength(1);
    const ops = f.createComplaint();
    expect(await ops.listComplaintCasesForOps()).toEqual([
      f.state.complaintCase,
    ]);
    expect(await ops.getComplaintCaseForOps(caseNo)).toEqual(
      f.state.complaintCase,
    );
    expect(await ops.getComplaintTimelineForOps(caseNo)).toEqual([
      f.state.timeline,
    ]);
    await expect(
      ops.getComplaintCaseForOps("PAX-22222222-2222-4222-8222-222222222222"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("historical unordered tags exact retry preserves the original rating", async () => {
    const f = fixture();
    f.state.rating = {
      rating_id: "historical-rating",
      order_id: ORDER,
      trip_id: "unit-assignment",
      driver_id: "unit-driver",
      passenger_subject_ref: SUBJECT,
      score: 2,
      tags: ["b", "a"],
      comment: null,
      status: "active",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = await f.submit({ score: 2, tags: ["a", "b"] });
    expect(result.data.ratingId).toBe("historical-rating");
    expect(f.state.rating.tags).toEqual(["b", "a"]);
    expect(f.state.consent).toBeUndefined();
    expect(f.state.complaintCase).toBeUndefined();
  });

  it.each([
    "rating",
    "case",
    "timeline",
    "consent",
    "summary",
    "commit",
    "connect",
  ] as const)(
    "%s failure rejects and publishes no partial source; retry succeeds",
    async (fault) => {
      const f = fixture();
      f.authority.fault = fault;
      await expect(f.submit()).rejects.toThrow(`${fault} failure`);
      expect(f.state).toEqual({});
      expect(f.complaint.listComplaintCases()).toEqual([]);
      if (fault !== "connect") {
        expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
        expect(f.release).toHaveBeenLastCalledWith(true);
      }
      f.authority.fault = undefined;
      await f.submit();
      expect(f.state.consent?.complaint_case_no).toBe(
        f.state.complaintCase!.caseNo,
      );
      expect(f.state.summary?.rating_count).toBe(1);
    },
  );

  it("lost commit reply recovers the original case and choice on a fresh service", async () => {
    const f = fixture();
    f.authority.fault = "lost_commit_reply";
    await expect(f.submit()).rejects.toThrow("lost_commit_reply failure");
    expect(f.complaint.listComplaintCases()).toEqual([]);
    const original = structuredClone(f.state);
    f.authority.fault = undefined;
    const replay = await f
      .createController(f.createComplaint())
      .submitPassengerRating(TOKEN, f.command);
    expect(replay.data.ratingId).toBe(original.rating!.rating_id);
    expect(f.state.consent).toEqual(original.consent);
    expect(f.state.complaintCase).toEqual(original.complaintCase);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
  });

  it("failed rollback discards the client without publishing CRM", async () => {
    const f = fixture();
    f.authority.fault = "consent";
    f.authority.rollbackFails = true;
    await expect(f.submit()).rejects.toThrow("consent failure");
    expect(f.release).toHaveBeenLastCalledWith(true);
    expect(f.state).toEqual({});
    expect(f.complaint.listComplaintCases()).toEqual([]);
  });

  it("after-commit audit failure retries the durable choice without creating a second case", async () => {
    const f = fixture();
    vi.spyOn(f.audit, "recordAuditLogAsync").mockRejectedValueOnce(
      new Error("audit boundary failure"),
    );
    await expect(f.submit()).rejects.toThrow("audit boundary failure");
    const original = structuredClone(f.state);
    await f.submit();
    expect(f.state.consent).toEqual(original.consent);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
  });

  it.each(["expired", "revoked", "scope"] as const)(
    "%s cached token still fails the transaction's current authority check",
    async (reason) => {
      const f = fixture();
      await f.submit();
      const writes = f.calls.filter((c) => c.sql.startsWith("INSERT")).length;
      if (reason === "expired")
        f.authority.expiresAt = new Date(0).toISOString();
      if (reason === "revoked")
        f.authority.revokedAt = new Date().toISOString();
      if (reason === "scope") f.authority.scopes = ["ride:read"];
      await expect(f.submit()).rejects.toMatchObject({
        code:
          reason === "scope"
            ? "PASSENGER_RIDE_SCOPE_FORBIDDEN"
            : "PASSENGER_RIDE_TOKEN_INVALID",
      });
      expect(f.calls.filter((c) => c.sql.startsWith("INSERT"))).toHaveLength(
        writes,
      );
    },
  );

  it.each([
    "legacy_foreign_subject",
    "foreign_subject",
    "durable_foreign_subject",
    "durable_incomplete",
    "assignment",
    "payment",
    "expired_window",
    "future_completion",
    "missing_completion",
  ] as const)("%s cannot obtain a rating or consent", async (reason) => {
    const f = fixture();
    if (reason === "legacy_foreign_subject") {
      f.authority.enabled = false;
      f.authority.subject = "other-subject";
    }
    if (reason === "foreign_subject") f.authority.subject = "other-subject";
    if (reason === "durable_foreign_subject")
      f.authority.durableSubject = "other-subject";
    if (reason === "durable_incomplete") f.authority.durableStatus = "on_trip";
    if (reason === "assignment") f.authority.durableAssignment = false;
    if (reason === "payment") f.authority.paid = false;
    if (reason === "expired_window")
      f.authority.completedAt = new Date(Date.now() - 86_400_001).toISOString();
    if (reason === "future_completion")
      f.authority.completedAt = new Date(Date.now() + 60_000).toISOString();
    if (reason === "missing_completion") f.authority.completedAt = "";
    await expect(f.submit()).rejects.toMatchObject({
      code:
        reason === "legacy_foreign_subject"
          ? "PASSENGER_RIDE_TOKEN_INVALID"
          : reason === "foreign_subject" || reason === "durable_foreign_subject"
            ? "PASSENGER_RIDE_NOT_FOUND"
            : reason === "durable_incomplete"
              ? "PASSENGER_RATING_TRIP_NOT_COMPLETED"
              : reason === "payment"
                ? "PASSENGER_RATING_PAYMENT_REQUIRED"
                : "PASSENGER_RATING_WINDOW_CLOSED",
    });
    expect(f.state).toEqual({});
    expect(f.complaint.listComplaintCases()).toEqual([]);
  });

  it.each([null, "true", 1, []])(
    "invalid contact %j rejects without writes",
    async (contactRequested) => {
      const f = fixture();
      await expect(
        f.submit({ ...f.command, contactRequested } as never),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_CONTACT_INVALID" });
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
    },
  );

  it("unavailable storage refuses an explicit contact choice even when token/rating are cached", async () => {
    const f = fixture();
    await f.submit();
    f.authority.enabled = false;
    await expect(f.submit()).rejects.toMatchObject({
      code: "PASSENGER_RATING_STORAGE_UNAVAILABLE",
    });
  });
});
