import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  RatePassengerRideCommand,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import {
  createProductionBookingFixture,
  NOW,
} from "../pax-booking-history-20261009/production-booking-fixture";

const PASSENGER = "drts_passenger_11111111-1111-4111-8111-111111111111";
const OTHER = "drts_passenger_22222222-2222-4222-8222-222222222222";
const identity = {
  realm: "passenger",
  actorType: "first_party_passenger",
  drtsPassengerId: PASSENGER,
} as RequestIdentity;
type Fault =
  | "rating"
  | "case"
  | "timeline"
  | "intake"
  | "consent"
  | "summary"
  | "commit"
  | "lost_commit_reply"
  | "connect"
  | "audit";
type State = {
  rating?: Record<string, unknown>;
  complaintCase?: ComplaintCaseRecord;
  timeline?: ComplaintTimelineEntry;
  intake?: readonly unknown[];
  consent?: readonly unknown[];
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Real booking/rating/CRM/controller logic; SQL results and completed assignment are external fixtures, never a PG/concurrency acceptance simulator. */
async function fixture() {
  const booked = createProductionBookingFixture();
  booked.account.drtsPassengerId = PASSENGER;
  booked.snapshot.drtsPassengerId = PASSENGER;
  const created = await booked.service.createRide(PASSENGER, booked.command);
  const orderId = created.ride.order.orderId;
  booked.state.order!.status = "completed";
  // Completion/disclosure is the external producer boundary for this rating unit.
  const orders = booked.owned as unknown as {
    orders: (typeof booked.state.order)[];
    passengerDisclosureSnapshots: unknown[];
  };
  // The real service uses order snapshots; update the captured in-memory order by its existing update source in this fixture.
  const ownedState = booked.owned as unknown as {
    orders: NonNullable<typeof booked.state.order>[];
  };
  ownedState.orders[0]!.status = "completed";
  orders.passengerDisclosureSnapshots = [
    {
      orderId,
      assignmentId: "assignment-unit",
      driver: { driverId: "driver-unit" },
      supersededAt: null,
    },
  ];
  const state: State = {};
  let pending: State | undefined;
  let commitGate: Promise<void> | undefined;
  let commitReached: (() => void) | undefined;
  const access = {
    enabled: true,
    active: true,
    owned: true,
    paid: true,
    durableStatus: "completed",
    completedAt: new Date(NOW - 3600000).toISOString(),
    now: NOW,
    fault: undefined as Fault | undefined,
    rollbackFails: false,
  };
  const calls: {
    sql: string;
    values: readonly unknown[];
    transaction: boolean;
  }[] = [];
  const release = vi.fn();
  const auditRecords = new Map<string, readonly unknown[]>();
  const summary = () => ({
    driver_id: "driver-unit",
    display_state: "rated",
    average_rating: 2,
    rating_count: 1,
    last_rated_at: new Date(NOW).toISOString(),
    aggregate_version: 1,
    calculated_at: new Date(NOW).toISOString(),
  });
  const query = async (
    sql: string,
    values: readonly unknown[] = [],
    transaction = false,
  ) => {
    const text = sql.trim().replace(/\s+/g, " ");
    calls.push({ sql: text, values, transaction });
    if (text === "BEGIN") pending = structuredClone(state);
    if (text === "ROLLBACK") {
      pending = undefined;
      if (access.rollbackFails) throw new Error("rollback failure");
    }
    if (text === "COMMIT") {
      commitReached?.();
      if (commitGate) await commitGate;
      if (access.fault === "commit") throw new Error("commit failure");
      Object.assign(state, pending);
      pending = undefined;
      if (access.fault === "lost_commit_reply")
        throw new Error("lost commit reply");
    }
    const target = transaction ? pending! : state;
    const fail = (fault: Fault) => {
      if (access.fault === fault) throw new Error(`${fault} failure`);
    };
    if (text.startsWith("INSERT INTO admin.audit_logs")) {
      fail("audit");
      if (!auditRecords.has(values[0] as string))
        auditRecords.set(values[0] as string, [...values]);
    }
    if (text.startsWith("SELECT o.status"))
      return {
        rows:
          access.active && access.owned
            ? [{ status: access.durableStatus, record: booked.state.order }]
            : [],
      };
    if (text.startsWith("SELECT b.order_id"))
      return {
        rows: access.active && access.owned ? [{ order_id: orderId }] : [],
      };
    if (text.startsWith("SELECT record->>'completedAt'"))
      return {
        rows: [
          {
            completed_at: access.completedAt,
            database_now: new Date(access.now),
          },
        ],
      };
    if (text.startsWith("SELECT payment_id"))
      return { rows: access.paid ? [{ payment_id: "actual-paid-unit" }] : [] };
    if (text.startsWith("INSERT INTO ops.passenger_trip_ratings")) {
      fail("rating");
      target.rating ??= {
        rating_id: values[0],
        order_id: values[1],
        trip_id: values[2],
        driver_id: values[3],
        passenger_subject_ref: values[4],
        score: values[5],
        tags: JSON.parse(values[6] as string),
        comment: values[7],
        status: values[8],
        submitted_at: values[9],
        updated_at: values[10],
      };
      return { rows: [target.rating] };
    }
    if (text.startsWith("SELECT request_hash, rating_id"))
      return {
        rows: target.consent
          ? [
              {
                request_hash: target.consent[4],
                rating_id: target.consent[2],
                complaint_case_no: target.consent[5],
              },
            ]
          : [],
      };
    if (text.startsWith("SELECT p.request_hash"))
      return {
        rows: target.intake
          ? [
              {
                request_hash: target.intake[6],
                record: target.complaintCase,
                timeline: target.timeline,
              },
            ]
          : [],
      };
    if (text.startsWith("INSERT INTO crm.phase1_complaint_cases")) {
      fail("case");
      target.complaintCase = JSON.parse(values[5] as string);
    }
    if (text.startsWith("INSERT INTO crm.phase1_complaint_timelines")) {
      fail("timeline");
      target.timeline = JSON.parse(values[4] as string);
    }
    if (text.startsWith("INSERT INTO passenger.complaints")) {
      fail("intake");
      target.intake = [...values];
    }
    if (text.startsWith("INSERT INTO passenger.rating_consents")) {
      fail("consent");
      target.consent = [...values];
    }
    if (text.startsWith("INSERT INTO ops.driver_rating_summaries")) {
      fail("summary");
      return { rows: [summary()] };
    }
    if (text.includes("FROM ops.passenger_trip_ratings"))
      return { rows: state.rating ? [state.rating] : [] };
    if (text.includes("FROM passenger.complaints p")) {
      const record = text.startsWith("SELECT t.record")
        ? state.timeline
        : state.complaintCase;
      return { rows: record ? [{ record }] : [] };
    }
    return { rows: [] };
  };
  const database = {
    isEnabled: () => access.enabled,
    query: (sql: string, values?: readonly unknown[]) => query(sql, values),
    connect: async () => {
      if (access.fault === "connect") throw new Error("connect failure");
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          query(sql, values, true),
        release,
      };
    },
  } as unknown as DatabaseService;
  const repository = new MultiTaxiRepository(database);
  const multi = new MultiTaxiService(booked.owned, repository);
  const complaintRepository = new ComplaintRepository(database);
  const audit = new AuditNotificationService(new AuditLogRepository(database));
  const complaint = new ComplaintService(audit, complaintRepository);
  const booking = new PassengerBookingService(
    booked.bookingRepository,
    multi,
    {} as never,
    {} as never,
    complaint,
    {
      resolveActiveDevices: async () => [],
    } as unknown as PassengerPushDevicesService,
  );
  const controller = new PassengerBookingController(booking, multi);
  const ops = new ComplaintController(complaint, {} as never, {} as never);
  const command: RatePassengerRideCommand = {
    rideId: orderId,
    rating: 2,
    tags: ["clean"],
    comments: "請客服聯繫",
    contactRequested: true,
  };
  return {
    booked,
    orderId,
    state,
    access,
    calls,
    release,
    audit,
    auditRecords,
    database,
    multi,
    complaint,
    complaintRepository,
    booking,
    controller,
    ops,
    command,
    holdCommit: () => {
      let releaseCommit!: () => void;
      commitGate = new Promise<void>((resolve) => {
        releaseCommit = resolve;
      });
      const atCommit = new Promise<void>((resolve) => {
        commitReached = resolve;
      });
      return { atCommit, releaseCommit };
    },
    submit: (body = command, actor = identity) =>
      controller.rateRide(actor, orderId, body),
  };
}

describe("actual account rating and explicit contact choice share the CRM transaction", () => {
  it.each([1, 2] as const)(
    "score %s opt-in creates one canonical CRM case after commit",
    async (rating) => {
      const f = await fixture();
      const response = await f.submit({ ...f.command, rating });
      expect(response.data).toEqual({ success: true });
      expect(f.state.rating?.score).toBe(rating);
      expect(f.state.consent?.[3]).toBe(true);
      expect(f.state.consent?.[5]).toBe(f.state.complaintCase!.caseNo);
      expect(f.state.complaintCase!.description).toContain(
        `乘客評價 ${rating} 星`,
      );
      expect(f.complaint.listComplaintCases()).toHaveLength(1);
      expect(
        f.audit
          .getAuditLogsSnapshot()
          .filter(
            (entry) => entry.actionName === "create_passenger_complaint_case",
          )[0],
      ).toMatchObject({
        actorId: PASSENGER,
        actorType: "first_party_passenger",
        resourceId: f.state.complaintCase!.caseNo,
      });
      expect(
        f.calls
          .filter((c) => c.sql === "BEGIN" || c.sql === "COMMIT")
          .map((c) => c.sql),
      ).toEqual(["BEGIN", "COMMIT"]);
      expect(
        f.calls
          .filter(
            (c) =>
              c.sql.startsWith("INSERT") &&
              !c.sql.startsWith("INSERT INTO admin.audit_logs"),
          )
          .every((c) => c.transaction),
      ).toBe(true);
    },
  );
  it.each([
    { rating: 2, contactRequested: false },
    { rating: 2, contactRequested: undefined },
    { rating: 3, contactRequested: true },
    { rating: 5, contactRequested: true },
  ] as const)(
    "%j preserves the choice without creating a complaint",
    async (patch) => {
      const f = await fixture();
      const command: RatePassengerRideCommand = {
        ...f.command,
        rating: patch.rating,
      };
      if (patch.contactRequested === undefined) delete command.contactRequested;
      else command.contactRequested = patch.contactRequested;
      await f.submit(command);
      expect(f.state.rating).toBeDefined();
      expect(f.state.consent?.[3]).toBe(patch.contactRequested === true);
      expect(f.state.complaintCase).toBeUndefined();
      expect(f.state.consent?.[5]).toBeNull();
    },
  );
  it("does not publish rating, case, audit or response while commit is pending", async () => {
    const f = await fixture();
    const gate = f.holdCommit();
    let acknowledged = false;
    const request = f.submit().then((response) => {
      acknowledged = true;
      return response;
    });
    await gate.atCommit;
    expect(f.state).toEqual({});
    expect(f.complaint.listComplaintCases()).toEqual([]);
    expect(f.auditRecords.size).toBe(0);
    expect(acknowledged).toBe(false);
    expect(
      (f.multi as unknown as { ratingsById: Map<string, unknown> }).ratingsById
        .size,
    ).toBe(0);
    gate.releaseCommit();
    await request;
    expect(f.state.complaintCase).toBeDefined();
    expect(acknowledged).toBe(true);
  });
  it("audit failure after commit fails acknowledgement, then retries the original case with one stable audit identity", async () => {
    const f = await fixture();
    f.access.fault = "audit";
    await expect(f.submit()).rejects.toThrow("audit failure");
    const original = structuredClone(f.state);
    expect(original.complaintCase).toBeDefined();
    expect(f.complaint.listComplaintCases()).toEqual([]);
    expect(f.auditRecords.size).toBe(0);
    f.access.fault = undefined;
    await f.submit();
    expect(f.state).toEqual(original);
    expect(f.auditRecords.size).toBe(1);
    const log = [...f.auditRecords.values()][0]!;
    expect(log[1]).toBeNull(); // Existing UUID actor column; original identity stays in typed JSON.
    expect(log[2]).toBe("first_party_passenger");
    expect(JSON.parse(log[9] as string)).toMatchObject({
      source: "passenger_app",
      drtsPassengerId: PASSENGER,
    });
    const attempts = f.calls.filter((c) =>
      c.sql.startsWith("INSERT INTO admin.audit_logs"),
    );
    expect(attempts[0]!.values[0]).toBe(attempts[1]!.values[0]);
    expect(f.complaint.listComplaintCases()).toHaveLength(1);
  });
  it("same payload replay keeps rating/case IDs and cannot change contact consent", async () => {
    const f = await fixture();
    await f.submit();
    const first = structuredClone(f.state);
    await f.submit({
      ...f.command,
      tags: ["clean", "clean"],
      comments: " 請客服聯繫 ",
    });
    expect(f.state).toEqual(first);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
    expect(
      f.audit
        .getAuditLogsSnapshot()
        .filter(
          (entry) => entry.actionName === "create_passenger_complaint_case",
        ),
    ).toHaveLength(1);
    await expect(
      f.submit({ ...f.command, contactRequested: false }),
    ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
    expect(f.state).toEqual(first);
  });
  it.each([
    "rating",
    "case",
    "timeline",
    "intake",
    "consent",
    "summary",
    "commit",
    "connect",
  ] as const)(
    "%s failure leaves no rating, consent, case or memory success",
    async (fault) => {
      const f = await fixture();
      f.access.fault = fault;
      await expect(f.submit()).rejects.toThrow(`${fault} failure`);
      expect(f.state).toEqual({});
      expect(f.complaint.listComplaintCases()).toEqual([]);
      expect(
        f.audit
          .getAuditLogsSnapshot()
          .filter(
            (entry) => entry.actionName === "create_passenger_complaint_case",
          ),
      ).toEqual([]);
      expect(
        (f.multi as unknown as { ratingsById: Map<string, unknown> })
          .ratingsById.size,
      ).toBe(0);
      if (fault !== "connect") expect(f.release).toHaveBeenLastCalledWith(true);
      f.access.fault = undefined;
      await f.submit();
      expect(f.state.complaintCase).toBeDefined();
    },
  );
  it("lost commit reply, peer replica and new-owner retry recover original durable source", async () => {
    const f = await fixture();
    const peer = new ComplaintService(
      new AuditNotificationService(),
      f.complaintRepository,
    );
    const ops = new ComplaintController(peer, {} as never, {} as never);
    expect((await ops.listComplaintCases()).data.items).toEqual([]);
    f.access.fault = "lost_commit_reply";
    await expect(f.submit()).rejects.toThrow("lost commit reply");
    expect(f.complaint.listComplaintCases()).toEqual([]);
    const original = structuredClone(f.state);
    expect((await ops.listComplaintCases()).data.items[0]).toEqual(
      original.complaintCase,
    );
    expect(
      (await ops.getComplaintTimeline(original.complaintCase!.caseNo)).data
        .items,
    ).toEqual([original.timeline]);
    const restartedMulti = new MultiTaxiService(
      f.booked.owned,
      new MultiTaxiRepository(
        (
          f.complaintRepository as unknown as {
            databaseService: DatabaseService;
          }
        ).databaseService,
      ),
    );
    const restartBooking = new PassengerBookingService(
      f.booked.bookingRepository,
      restartedMulti,
      {} as never,
      {} as never,
      peer,
      {
        resolveActiveDevices: async () => [],
      } as unknown as PassengerPushDevicesService,
    );
    f.access.fault = undefined;
    f.access.now = NOW + 48 * 3600000;
    f.access.paid = false;
    await restartBooking.rateRide(PASSENGER, f.orderId, f.command);
    expect(f.state).toEqual(original);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
  });
  it.each([
    "foreign",
    "unknown",
    "malformed",
    "deleted",
    "ownership_changed",
    "cancelled",
    "unpaid",
    "expired",
    "future",
    "missing_completion",
  ])("%s cannot create an account rating/complaint", async (scenario) => {
    const f = await fixture();
    let actor = identity;
    let id = f.orderId;
    if (scenario === "foreign")
      actor = { ...identity, drtsPassengerId: OTHER } as RequestIdentity;
    if (scenario === "unknown") id = "33333333-3333-4333-8333-333333333333";
    if (scenario === "malformed") id = "bad-id";
    if (scenario === "deleted") f.access.active = false;
    if (scenario === "ownership_changed") f.access.owned = false;
    if (scenario === "cancelled") f.access.durableStatus = "cancelled";
    if (scenario === "unpaid") f.access.paid = false;
    if (scenario === "expired")
      f.access.completedAt = new Date(NOW - 24 * 3600000 - 1).toISOString();
    if (scenario === "future")
      f.access.completedAt = new Date(NOW + 1).toISOString();
    if (scenario === "missing_completion") f.access.completedAt = "";
    await expect(
      f.controller.rateRide(actor, id, f.command),
    ).rejects.toBeInstanceOf(Error);
    expect(f.state).toEqual({});
    expect(f.complaint.listComplaintCases()).toEqual([]);
  });
  it.each([
    null,
    { realm: "platform", actorType: "platform_admin" },
    { realm: "passenger", actorType: "ops_user", drtsPassengerId: PASSENGER },
  ])(
    "invalid verified rating identity %j is denied before ownership",
    async (actor) => {
      const f = await fixture();
      const lookup = vi.spyOn(f.booking, "getRide");
      await expect(
        f.submit(f.command, actor as RequestIdentity),
      ).rejects.toMatchObject({ status: 401 });
      expect(lookup).not.toHaveBeenCalled();
      expect(f.state).toEqual({});
    },
  );
  it.each([{ rating: 1 }, { comments: "changed" }, { tags: ["other"] }])(
    "changed immutable rating field %j is rejected",
    async (patch) => {
      const f = await fixture();
      await f.submit();
      const original = structuredClone(f.state);
      await expect(
        f.submit({ ...f.command, ...patch } as RatePassengerRideCommand),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
      expect(f.state).toEqual(original);
    },
  );
  it("an original opt-out cannot become a later opt-in", async () => {
    const f = await fixture();
    await f.submit({ ...f.command, contactRequested: false });
    await expect(f.submit()).rejects.toMatchObject({
      code: "PASSENGER_RATING_ALREADY_SUBMITTED",
    });
    expect(f.state.complaintCase).toBeUndefined();
    expect(f.state.consent?.[3]).toBe(false);
  });
  it("exactly 24 hours and 200 unicode characters are accepted; larger or malformed comments/contact are rejected", async () => {
    const f = await fixture();
    f.access.completedAt = new Date(NOW - 24 * 3600000).toISOString();
    await f.submit({ ...f.command, comments: "😀".repeat(200) });
    expect(f.state.rating).toBeDefined();
    for (const patch of [
      { comments: "😀".repeat(201) },
      { comments: 42 },
      { contactRequested: "true" },
      { rating: 0 },
    ]) {
      const other = await fixture();
      await expect(
        other.submit({
          ...other.command,
          ...patch,
        } as RatePassengerRideCommand),
      ).rejects.toMatchObject({ status: 400 });
      expect(other.state).toEqual({});
    }
  });
  it("does not infer mutable contact consent for a pre-existing legacy rating", async () => {
    const f = await fixture();
    await f.submit({ ...f.command, contactRequested: false });
    delete f.state.consent;
    await expect(
      f.submit({ ...f.command, contactRequested: false }),
    ).rejects.toMatchObject({ code: "PASSENGER_RATING_CONSENT_UNAVAILABLE" });
    expect(f.state.complaintCase).toBeUndefined();
  });
  it("keeps nonpassenger CRM behavior and never overwrites newer local passenger state with a stale read", async () => {
    const f = await fixture();
    await f.submit();
    const id = f.state.complaintCase!.caseNo;
    vi.setSystemTime(NOW + 1000);
    f.complaint.assignComplaintCase(id, { assigneeId: "ops-user" });
    expect((await f.ops.getComplaintCase(id)).data.status).toBe("assigned");
    expect((await f.ops.getComplaintTimeline(id)).data.items).toHaveLength(2);
    const manual = f.complaint.createComplaintCase({
      caseSource: "phone",
      category: "other",
      severity: "normal",
      description: "Existing Ops source",
    });
    expect((await f.ops.getComplaintCase(manual.caseNo)).data.caseSource).toBe(
      "phone",
    );
    expect((await f.ops.listComplaintCases()).data.items).toHaveLength(2);
  });
  it("rollback failure still preserves the original failure and destroys the connection", async () => {
    const f = await fixture();
    f.access.fault = "consent";
    f.access.rollbackFails = true;
    await expect(f.submit()).rejects.toThrow("consent failure");
    expect(f.release).toHaveBeenLastCalledWith(true);
    expect(f.state).toEqual({});
  });
  it("disabled storage fails closed and legacy token rating repository positives remain", async () => {
    const f = await fixture();
    f.access.enabled = false;
    await expect(f.submit()).rejects.toMatchObject({ status: 503 });
    expect(f.state).toEqual({});
    const repo = new MultiTaxiRepository();
    const rating = {
      ratingId: "legacy",
      orderId: f.orderId,
      tripId: "trip",
      driverId: "driver",
      passengerSubjectRef: "legacy-token",
      score: 5 as const,
      tags: [],
      comment: null,
      status: "active" as const,
      submittedAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    };
    expect((await repo.persistPassengerRating(rating)).rating).toEqual(rating);
  });
});
