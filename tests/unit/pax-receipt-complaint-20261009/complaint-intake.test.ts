import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePassengerComplaintCommand } from "@drts/contracts";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { PassengerComplaintController } from "../../../apps/api/src/modules/passenger-app/complaint/passenger-complaint.controller";
import { PassengerComplaintService } from "../../../apps/api/src/modules/passenger-app/complaint/passenger-complaint.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
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
  | "case"
  | "timeline"
  | "intake"
  | "commit"
  | "lost_commit_reply"
  | "connect";
type Stored = {
  caseRecord: unknown;
  timelineRecord: unknown;
  keyHash: unknown;
  requestHash: unknown;
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

/** SQL response/failure boundary only; no PG schema/concurrency claim. */
async function fixture(fault?: Fault) {
  const booking = createProductionBookingFixture();
  booking.account.drtsPassengerId = PASSENGER;
  booking.snapshot.drtsPassengerId = PASSENGER;
  const ride = await booking.service.createRide(PASSENGER, booking.command);
  const orderId = ride.ride.order.orderId;
  let stored: Stored | undefined;
  let pending: Stored | undefined;
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const access = {
    active: true,
    owned: true,
    enabled: true,
    fault,
    rollbackFails: false,
  };
  const release = vi.fn();
  const query = async (sql: string, values: readonly unknown[] = []) => {
    const text = sql.trim().replace(/\s+/g, " ");
    calls.push({ sql: text, values });
    if (text === "BEGIN")
      pending = stored ? structuredClone(stored) : undefined;
    if (text === "ROLLBACK") {
      pending = undefined;
      if (access.rollbackFails) throw new Error("rollback failure");
    }
    if (text === "COMMIT") {
      if (access.fault === "commit") throw new Error("commit failure");
      stored = pending;
      if (access.fault === "lost_commit_reply")
        throw new Error("lost commit reply");
    }
    if (text.startsWith("SELECT b.order_id")) {
      return {
        rows:
          access.active &&
          access.owned &&
          values[0] === orderId &&
          values[1] === PASSENGER
            ? [{ order_id: orderId }]
            : [],
      };
    }
    if (text.startsWith("SELECT p.request_hash")) {
      return {
        rows:
          stored && stored.keyHash === values[1]
            ? [
                {
                  request_hash: stored.requestHash,
                  record: stored.caseRecord,
                  timeline: stored.timelineRecord,
                },
              ]
            : [],
      };
    }
    if (text.startsWith("INSERT INTO crm.phase1_complaint_cases")) {
      if (access.fault === "case") throw new Error("case failure");
      pending = {
        caseRecord: JSON.parse(values[5] as string),
        timelineRecord: undefined,
        keyHash: undefined,
        requestHash: undefined,
      };
    }
    if (text.startsWith("INSERT INTO crm.phase1_complaint_timelines")) {
      if (access.fault === "timeline") throw new Error("timeline failure");
      pending!.timelineRecord = JSON.parse(values[4] as string);
    }
    if (text.startsWith("INSERT INTO passenger.complaints")) {
      if (access.fault === "intake") throw new Error("intake failure");
      pending!.keyHash = values[5];
      pending!.requestHash = values[6];
    }
    return { rows: [] };
  };
  vi.spyOn(booking.database, "isEnabled").mockImplementation(
    () => access.enabled,
  );
  const bookingQuery = booking.database.query.bind(booking.database);
  vi.spyOn(booking.database, "query").mockImplementation(
    async (sql, values) => {
      if (sql.includes("FROM passenger.complaints p")) {
        const record = sql.includes("SELECT t.record")
          ? stored?.timelineRecord
          : stored?.caseRecord;
        return { rows: record ? [{ record }] : [] } as never;
      }
      if (sql.includes("FROM crm.phase1_complaint_cases"))
        return { rows: stored ? [{ record: stored.caseRecord }] : [] } as never;
      if (sql.includes("FROM crm.phase1_complaint_timelines"))
        return {
          rows: stored ? [{ record: stored.timelineRecord }] : [],
        } as never;
      return bookingQuery(sql, values);
    },
  );
  vi.spyOn(booking.database, "connect").mockImplementation(async () => {
    if (access.fault === "connect") throw new Error("connect failure");
    return { query, release } as never;
  });
  const repository = new ComplaintRepository(booking.database);
  const audit = new AuditNotificationService();
  const complaint = new ComplaintService(audit, repository);
  const service = new PassengerComplaintService(booking.service, complaint);
  const controller = new PassengerComplaintController(service);
  const ops = new ComplaintController(complaint, {} as never, {} as never);
  const command: CreatePassengerComplaintCommand = {
    rideId: orderId,
    category: "service",
    content: "請協助處理",
    contactConsent: true,
  };
  return {
    booking,
    audit,
    orderId,
    repository,
    complaint,
    service,
    controller,
    ops,
    command,
    calls,
    access,
    release,
    stored: () => stored,
    submit: (body = command, key = "complaint-key") =>
      controller.create(identity, orderId, body, key, "request-1"),
  };
}

describe("passenger complaint intake: actual booking, CRM and Ops path", () => {
  it.each(["service", "fare", "lost_item", "other"] as const)(
    "maps %s to the existing Ops case and preserves explicit consent",
    async (category) => {
      const f = await fixture();
      const response = await f.submit({
        ...f.command,
        category,
        contactConsent: false,
        ...(category === "lost_item"
          ? { lostItemDescription: "藍色背包" }
          : {}),
      });
      expect(response.data.complaintId).toMatch(/^PAX-/);
      expect(response.meta.requestId).toBe("request-1");
      const cases = (await f.ops.listComplaintCases()).data.items;
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({
        caseNo: response.data.complaintId,
        caseSource: "app",
        relatedOrderId: f.orderId,
        status: "new",
        severity: "normal",
        category: {
          service: "driver_service",
          fare: "fare_dispute",
          lost_item: "lost_and_found",
          other: "other",
        }[category],
      });
      expect(cases[0]!.description).toContain(
        "來源：乘客 App\n同意客服聯繫：否",
      );
      expect(cases[0]!.description).not.toContain(
        f.booking.account.contactPhone,
      );
      if (category === "lost_item")
        expect(cases[0]!.description).toContain("遺失物：藍色背包");
      const timeline = (
        await f.ops.getComplaintTimeline(response.data.complaintId)
      ).data.items;
      expect(timeline).toHaveLength(1);
      expect(timeline[0]!.note).toContain("同意客服聯繫：否");
      const intake = f.calls.find((c) =>
        c.sql.startsWith("INSERT INTO passenger.complaints"),
      )!;
      expect(intake.values.slice(0, 5)).toEqual([
        response.data.complaintId,
        PASSENGER,
        f.orderId,
        category,
        false,
      ]);
      expect(intake.values[5]).toBe(
        createHash("sha256").update("complaint-key").digest("hex"),
      );
      expect(f.calls.at(-1)?.sql).toBe("COMMIT");
      expect(f.release).toHaveBeenCalledWith();
      expect(
        f.calls.find((c) => c.sql.startsWith("SELECT b.order_id"))?.sql,
      ).toContain(
        "a.status = 'active' AND a.deleted_at IS NULL FOR SHARE OF b, a",
      );
    },
  );

  it("same key and normalized payload replay the original case without another CRM write", async () => {
    const f = await fixture();
    const first = await f.submit();
    const second = await f.submit({ ...f.command, content: "  請協助處理  " });
    expect(second.data).toEqual(first.data);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
    expect((await f.ops.listComplaintCases()).data.items).toHaveLength(1);
    expect(
      f.calls.filter((c) => c.sql.includes("pg_advisory_xact_lock")),
    ).toHaveLength(2);
  });

  it("loads the passenger source from the actual CRM repository after restart", async () => {
    const f = await fixture();
    const response = await f.submit({
      ...f.command,
      category: "lost_item",
      lostItemDescription: "藍色背包",
    });
    const restarted = new ComplaintService(
      new AuditNotificationService(),
      f.repository,
    );
    await restarted.onModuleInit();
    const ops = new ComplaintController(restarted, {} as never, {} as never);
    expect(
      (await ops.getComplaintCase(response.data.complaintId)).data,
    ).toEqual((await f.ops.getComplaintCase(response.data.complaintId)).data);
    expect(
      (await ops.getComplaintTimeline(response.data.complaintId)).data.items,
    ).toEqual(
      (await f.ops.getComplaintTimeline(response.data.complaintId)).data.items,
    );
  });

  it.each(["content", "contactConsent", "category"] as const)(
    "rejects changed %s on retry",
    async (field) => {
      const f = await fixture();
      await f.submit();
      const body = {
        ...f.command,
        [field]:
          field === "content"
            ? "changed"
            : field === "category"
              ? "fare"
              : false,
      };
      await expect(f.submit(body)).rejects.toMatchObject({
        status: 409,
        code: "IDEMPOTENCY_KEY_REUSED",
      });
      expect((await f.ops.listComplaintCases()).data.items).toHaveLength(1);
      expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
      expect(f.release).toHaveBeenLastCalledWith(true);
    },
  );

  it.each(["foreign", "unknown", "malformed"])(
    "runs the actual ownership denial for %s before entering CRM",
    async (scenario) => {
      const f = await fixture();
      const id =
        scenario === "unknown"
          ? "33333333-3333-4333-8333-333333333333"
          : scenario === "malformed"
            ? "bad-id"
            : f.orderId;
      await expect(
        f.service.create(
          scenario === "foreign" ? OTHER : PASSENGER,
          id,
          { ...f.command, rideId: id },
          "key",
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: "PASSENGER_RIDE_NOT_FOUND",
      });
      expect(f.calls).toEqual([]);
      expect((await f.ops.listComplaintCases()).data.items).toEqual([]);
    },
  );

  it.each(["deleted", "suspended", "ownership_changed"])(
    "denies %s observed by the locked recheck",
    async (scenario) => {
      const f = await fixture();
      if (scenario === "ownership_changed") f.access.owned = false;
      else f.access.active = false;
      await expect(f.submit()).rejects.toMatchObject({
        status: 404,
        code: "PASSENGER_RIDE_NOT_FOUND",
      });
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect((await f.ops.listComplaintCases()).data.items).toEqual([]);
    },
  );

  it.each([
    null,
    { realm: "platform", actorType: "platform_admin" },
    { realm: "passenger", actorType: "ops_user" },
  ])("rejects the wrong identity %j before ownership lookup", async (actor) => {
    const f = await fixture();
    const lookup = vi.spyOn(f.booking.service, "getRide");
    await expect(
      f.controller.create(
        actor as RequestIdentity,
        f.orderId,
        f.command,
        "key",
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(lookup).not.toHaveBeenCalled();
    expect(f.calls).toEqual([]);
  });

  it.each([
    { rideId: "33333333-3333-4333-8333-333333333333" },
    { category: "spoof" },
    { content: " " },
    { content: "字".repeat(2001) },
    { contactConsent: undefined },
    { contactConsent: "true" },
    { category: "lost_item" },
    { category: "lost_item", lostItemDescription: 42 },
    { lostItemDescription: "背包" },
  ])("rejects malformed intake %j without a CRM transaction", async (patch) => {
    const f = await fixture();
    await expect(
      f.submit({ ...f.command, ...patch } as CreatePassengerComplaintCommand),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.calls).toEqual([]);
  });

  it.each(["", " ", "x".repeat(256)])(
    "requires bounded Idempotency-Key %j",
    async (key) => {
      const f = await fixture();
      await expect(f.submit(f.command, key)).rejects.toMatchObject({
        status: 400,
      });
      expect(f.calls).toEqual([]);
    },
  );

  it.each(["case", "timeline", "intake", "commit", "connect"] as const)(
    "propagates %s failure and publishes no Ops case",
    async (fault) => {
      const f = await fixture(fault);
      await expect(f.submit()).rejects.toThrow(`${fault} failure`);
      expect((await f.ops.listComplaintCases()).data.items).toEqual([]);
      expect(f.stored()).toBeUndefined();
      if (fault !== "connect") {
        expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
        expect(f.release).toHaveBeenLastCalledWith(true);
      }
      f.access.fault = undefined;
      expect((await f.submit()).data.complaintId).toMatch(/^PAX-/);
    },
  );

  it("returns 503 when durable storage is disabled rather than claiming an in-memory case", async () => {
    const f = await fixture();
    f.access.enabled = false;
    await expect(f.submit()).rejects.toMatchObject({
      status: 503,
      code: "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
    });
    expect(f.calls).toEqual([]);
    expect((await f.ops.listComplaintCases()).data.items).toEqual([]);
  });

  it("a lost COMMIT reply recovers the original case on retry", async () => {
    const f = await fixture("lost_commit_reply");
    await expect(f.submit()).rejects.toThrow("lost commit reply");
    expect(f.complaint.listComplaintCases()).toEqual([]);
    expect((await f.ops.listComplaintCases()).data.items).toHaveLength(1);
    const originalCase = f.stored()?.caseRecord;
    f.access.fault = undefined;
    const response = await f.submit();
    expect(
      (await f.ops.getComplaintCase(response.data.complaintId)).data,
    ).toEqual(originalCase);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
  });

  it("discards the transaction connection even if rollback fails", async () => {
    const f = await fixture("timeline");
    f.access.rollbackFails = true;
    await expect(f.submit()).rejects.toThrow("timeline failure");
    expect(f.release).toHaveBeenCalledWith(true);
    expect((await f.ops.listComplaintCases()).data.items).toEqual([]);
  });
});
