// @vitest-environment jsdom
import React from "react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReferralMonthlyRatingService } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.service";
import { ReferralMonthlyRatingController } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.controller";
import { ReferralMonthlyRatings } from "../../../apps/platform-admin-web/app/p5-ratings/referral-monthly/report";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import { AUTH_ALLOWED_REALMS_KEY } from "../../../apps/api/src/common/auth/auth.constants";
type MonthlyEnvelope = Awaited<
  ReturnType<ReferralMonthlyRatingController["read"]>
>;
const fixture = vi.hoisted(() => ({
  current: null as {
    getEnvelope: (path: string) => Promise<MonthlyEnvelope>;
  } | null,
}));
vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => fixture.current,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
function setMonthlyClient(client: NonNullable<typeof fixture.current>) {
  fixture.current = client;
}
const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");

afterEach(async () => {
  await React.act(async () => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined)
    throw new Error(`Missing required ${label}`);
  return value;
}

function bundle(
  id = "order1",
  score = 4,
  at = "2026-10-01T01:00:00.000Z",
  driver = "completed-driver",
) {
  const order = {
    orderId: id,
    orderNo: `N-${id}`,
    orderSource: "partner",
    orderDomain: "owned",
    status: "completed",
    tenantId: "tenant-A",
    partnerId: "partner-A",
    partnerProgramId: "program-A",
    partnerEntrySlug: "approved-entry",
    referralPassengerLifecycle: {
      rating: {
        orderId: id,
        score,
        tags: ["駕駛親切", "車內整潔"],
        comment: "保留原意見",
        submittedAt: at,
        contactRequested: false,
        complaintCaseNo: "CRM-1",
      },
    },
  };
  const task = {
    taskId: `task-${id}`,
    orderId: id,
    assignmentId: `assignment-${id}`,
    dispatchJobId: `job-${id}`,
    driverId: driver,
    vehicleId: "completed-vehicle",
    status: "completed",
    completedAt: "2026-09-30T15:00:00Z",
  };
  const assignment = {
    assignmentId: task.assignmentId,
    taskId: task.taskId,
    orderId: id,
    dispatchJobId: task.dispatchJobId,
    driverId: driver,
    vehicleId: task.vehicleId,
    status: "completed",
  };
  return {
    orders: [order],
    driverTasks: [task],
    dispatchAssignments: [assignment],
  };
}
function combine(...sources: ReturnType<typeof bundle>[]) {
  return {
    orders: sources.flatMap((s) => s.orders),
    driverTasks: sources.flatMap((s) => s.driverTasks),
    dispatchAssignments: sources.flatMap((s) => s.dispatchAssignments),
  };
}
function composition(source = bundle()) {
  vi.stubEnv("DATABASE_URL", "");
  const database = new DatabaseService();
  const query = vi.spyOn(database, "query");
  query.mockResolvedValue({
    rows: [{ record: structuredClone(source) }],
    rowCount: 1,
    command: "SELECT",
    oid: 0,
    fields: [],
  });
  // DB transport alone is doubled. The reader, SQL, aggregation and controller are actual candidate Source; only the database transport is controlled.
  const db = {
    isEnabled: vi.spyOn(database, "isEnabled").mockReturnValue(true),
    query,
  };
  const repo = new ReportingRepository(database);
  const service = new ReferralMonthlyRatingService(repo);
  const controller = new ReferralMonthlyRatingController(service);
  return { db, repo, service, controller };
}

describe("canonical monthly Referral reader", () => {
  it("executes one coherent repository SELECT with real scope/month bind parameters", async () => {
    const f = composition();
    const report = await f.controller.read(
      {
        periodMonth: "2026-10",
        tenantId: "tenant-A",
        partnerId: "partner-A",
        partnerProgramId: "program-A",
        entrySlug: "approved-entry",
      },
      "req1",
    );
    expect(f.db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = required(f.db.query.mock.calls[0], "SQL call");
    expect(sql).toContain("WITH selected_orders AS");
    expect(sql).toContain("AT TIME ZONE 'Asia/Taipei'");
    for (const table of [
      "ops.phase1_owned_orders",
      "ops.phase1_driver_tasks",
      "ops.phase1_dispatch_assignments",
    ])
      expect(sql).toContain(table);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(values).toEqual([
      "2026-10-01",
      "2026-11-01",
      "tenant-A",
      "partner-A",
      "program-A",
      "approved-entry",
    ]);
    expect(report.meta.requestId).toBe("req1");
    expect(report.data.rows[0]).toMatchObject({
      driverId: "completed-driver",
      taskId: "task-order1",
      attribution: "completed_task",
    });
    expect(report.data.rows[0]).not.toHaveProperty("passenger");
  });

  it.each([
    [
      "2026-10",
      "2026-09-30T15:59:59.999Z",
      "2026-09-30T16:00:00.000Z",
      "2026-10-31T15:59:59.999Z",
      "2026-10-31T16:00:00.000Z",
    ],
    [
      "2024-02",
      "2024-01-31T15:59:59.999Z",
      "2024-01-31T16:00:00.000Z",
      "2024-02-29T15:59:59.999Z",
      "2024-02-29T16:00:00.000Z",
    ],
    [
      "2026-12",
      "2026-11-30T15:59:59.999Z",
      "2026-11-30T16:00:00.000Z",
      "2026-12-31T15:59:59.999Z",
      "2026-12-31T16:00:00.000Z",
    ],
  ])(
    "%s uses submittedAt Taipei boundaries, never service/completion month",
    async (month, outsideBefore, start, last, next) => {
      const f = composition(
        combine(
          bundle("before", 1, outsideBefore),
          bundle("start", 2, start),
          bundle("last", 4, last),
          bundle("next", 5, next),
        ),
      );
      const result = await f.service.read({ periodMonth: month });
      expect(result.rows.map((row) => row.orderId)).toEqual(["last", "start"]);
      expect(result.ratingCount).toBe(2);
      expect(result.averageRating).toBe(3);
      expect(required(f.db.query.mock.calls[0], "SQL call")[1]?.[0]).toBe(
        `${month}-01`,
      );
    },
  );

  it("orders mixed valid offset/Z timestamps by instant and retains the actual latest original rating", async () => {
    const earlier = "2026-10-01T00:30:00+08:00";
    const later = "2026-09-30T17:00:00.000Z";
    const f = composition(
      combine(
        bundle("offset-earlier", 2, earlier),
        bundle("z-later", 4, later),
      ),
    );
    const report = await f.service.read({ periodMonth: "2026-10" });
    expect(report.periodMonth).toBe("2026-10");
    expect(report.ratingCount).toBe(2);
    expect(report.rows.map((row) => [row.orderId, row.submittedAt])).toEqual([
      ["z-later", later],
      ["offset-earlier", earlier],
    ]);
    expect(report.drivers).toEqual([
      {
        driverId: "completed-driver",
        ratingCount: 2,
        averageRating: 3,
        lastRatedAt: later,
      },
    ]);
  });

  it("attributes the completed task/assignment, despite stale Registry-like and rejected task rows", async () => {
    const source = bundle();
    source.driverTasks.unshift({
      ...required(source.driverTasks[0], "completed task"),
      taskId: "stale-task",
      assignmentId: "stale-assignment",
      driverId: "old-registry-driver",
      status: "rejected",
    });
    source.dispatchAssignments.unshift({
      ...required(source.dispatchAssignments[0], "completed assignment"),
      taskId: "stale-task",
      assignmentId: "stale-assignment",
      driverId: "old-registry-driver",
      status: "rejected",
    });
    const f = composition(source);
    const report = await f.service.read({ periodMonth: "2026-10" });
    expect(report.drivers).toEqual([
      {
        driverId: "completed-driver",
        ratingCount: 1,
        averageRating: 4,
        lastRatedAt: "2026-10-01T01:00:00.000Z",
      },
    ]);
    expect(
      (
        await f.service.read({
          periodMonth: "2026-10",
          driverId: "old-registry-driver",
        })
      ).ratingCount,
    ).toBe(0);
  });

  it("retains original rows with absent/ambiguous attribution without crediting an arbitrary driver", async () => {
    const absent = bundle("absent");
    absent.dispatchAssignments = [];
    const ambiguous = bundle("ambiguous");
    ambiguous.driverTasks.push({
      ...required(ambiguous.driverTasks[0], "ambiguous first task"),
      taskId: "second",
      assignmentId: "second-assignment",
      driverId: "other-driver",
    });
    ambiguous.dispatchAssignments.push({
      ...required(
        ambiguous.dispatchAssignments[0],
        "ambiguous first assignment",
      ),
      taskId: "second",
      assignmentId: "second-assignment",
      driverId: "other-driver",
    });
    const result = await composition(combine(absent, ambiguous)).service.read({
      periodMonth: "2026-10",
    });
    expect(result.ratingCount).toBe(2);
    expect(result.unattributedRatingCount).toBe(2);
    expect(result.drivers).toEqual([]);
    expect(
      result.rows.every(
        (row) =>
          row.attribution === "unavailable" &&
          row.driverId === null &&
          row.taskId === null,
      ),
    ).toBe(true);
  });

  it("averages to 2 decimals and preserves original tags/comments/contactfalse/CRM and scope", async () => {
    const source = combine(
      bundle("one", 1),
      bundle("two", 3),
      bundle("three", 4),
    );
    required(
      source.orders[0],
      "first order",
    ).referralPassengerLifecycle.rating.comment = "字".repeat(250);
    const untouched = JSON.stringify(source);
    const result = await composition(source).service.read({
      periodMonth: "2026-10",
    });
    expect(result.ratingCount).toBe(3);
    expect(result.averageRating).toBe(2.67);
    expect(required(result.drivers[0], "reported driver").averageRating).toBe(
      2.67,
    );
    expect(result.rows.find((r) => r.orderId === "one")).toMatchObject({
      comment: "字".repeat(250),
      tags: ["駕駛親切", "車內整潔"],
      contactRequested: false,
      complaintCaseNo: "CRM-1",
      tenantId: "tenant-A",
      partnerId: "partner-A",
      partnerProgramId: "program-A",
      entrySlug: "approved-entry",
    });
    expect(JSON.stringify(source)).toBe(untouched);
  });

  it.each(["tenantId", "partnerId", "partnerProgramId", "entrySlug"])(
    "%s retains canonical query filtering",
    async (field) => {
      const result = await composition().service.read({
        periodMonth: "2026-10",
        [field]: "other-scope",
      });
      expect(result.ratingCount).toBe(0);
      expect(result.averageRating).toBeNull();
      expect(result.rows).toEqual([]);
    },
  );

  it("zero remains count0/average null; repeat fresh reads never count a rating twice", async () => {
    const f = composition();
    for (let i = 0; i < 3; i++) {
      const result = await f.service.read({ periodMonth: "2026-10" });
      expect(result.ratingCount).toBe(1);
      expect(result.rows).toHaveLength(1);
    }
    expect(f.db.query).toHaveBeenCalledTimes(3);
    f.db.query.mockResolvedValueOnce({
      rows: [
        { record: { orders: [], driverTasks: [], dispatchAssignments: [] } },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });
    const result = await f.service.read({
      periodMonth: "2026-10",
      driverId: "not-rated",
    });
    expect(result).toMatchObject({
      ratingCount: 0,
      averageRating: null,
      rows: [],
      drivers: [],
    });
  });

  it("a canonical SQL failure propagates; a previous good response does not become a cache fallback", async () => {
    const f = composition();
    await f.controller.read({ periodMonth: "2026-10" });
    const failure = new Error("SQL transport rejected");
    f.db.query.mockRejectedValueOnce(failure);
    await expect(f.controller.read({ periodMonth: "2026-10" })).rejects.toBe(
      failure,
    );
    f.db.isEnabled.mockReturnValue(false);
    await expect(
      f.controller.read({ periodMonth: "2026-10" }),
    ).rejects.toMatchObject({ code: "REPORT_SOURCE_UNAVAILABLE" });
  });

  it("invalid query rejects before querying and malformed SQL source never becomes zero success", async () => {
    const f = composition();
    for (const query of [
      { periodMonth: "2026-13" },
      { periodMonth: "0000-01" },
      { periodMonth: "2026-10", driverId: ["x"] },
    ]) {
      await expect(
        Reflect.apply(f.service.read, f.service, [query]),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(f.db.query).not.toHaveBeenCalled();
    f.db.query.mockResolvedValueOnce({
      rows: [
        { record: { orders: [], driverTasks: null, dispatchAssignments: [] } },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });
    await expect(f.service.read({ periodMonth: "2026-10" })).rejects.toThrow(
      "Invalid canonical",
    );
  });

  it("the new GET stays inside original reports:read and original reporting realms", () => {
    const policy = required(
      resolveRouteAuthPolicy(
        "GET",
        "/api/reports/referral-monthly-ratings?periodMonth=2026-10",
      ),
      "reporting policy",
    );
    const original = resolveRouteAuthPolicy(
      "GET",
      "/api/reports/monthly-operations-summaries",
    );
    expect(policy).toEqual(original);
    expect(policy.requiredScopes).toEqual(["reports:read"]);
    expect(policy.allowedRealms).toEqual(["system", "platform", "ops"]);
    expect(
      Reflect.getMetadata(
        AUTH_ALLOWED_REALMS_KEY,
        ReferralMonthlyRatingController.prototype.read,
      ),
    ).toEqual(["platform", "ops"]);
  });
});

describe("existing manager client -> new reporting controller -> canonical reader -> rendered report", () => {
  function setup() {
    const f = composition(
      combine(bundle("one", 1), bundle("two", 3), bundle("three", 4)),
    );
    const getEnvelope = vi.fn(async (path: string) => {
      const u = new URL(path, "https://not-requested.invalid");
      expect(u.pathname).toBe("/api/reports/referral-monthly-ratings");
      return f.controller.read({
        ...Object.fromEntries(u.searchParams),
        periodMonth: u.searchParams.get("periodMonth") ?? "",
      });
    });
    setMonthlyClient({ getEnvelope });
    render(<ReferralMonthlyRatings />);
    fireEvent.change(screen.getByLabelText("月份"), {
      target: { value: "2026-10" },
    });
    return { ...f, getEnvelope };
  }
  it("displays actual production count/average/original rows and driver/month filtering", async () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    await screen.findByRole("region", { name: "月評價結果" });
    expect(screen.getByText(/評價數：3；平均：2.67/)).toBeTruthy();
    const rows = within(
      screen.getByRole("table", { name: "原始評價" }),
    ).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(screen.getAllByText("駕駛親切、車內整潔")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("駕駛 ID"), {
      target: { value: "not-this-driver" },
    });
    expect(screen.queryByRole("region", { name: "月評價結果" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    await screen.findByText(/評價數：0；平均：無評價/);
    expect(
      required(f.getEnvelope.mock.calls[1], "filtered request")[0],
    ).toContain("driverId=not-this-driver");
  });
  it("shows a real reader failure, clears prior data, and retries the same month honestly", async () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    await screen.findByText(/評價數：3；平均：2.67/);
    f.db.query.mockRejectedValueOnce(new Error("canonical SQL unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain(
      "canonical SQL unavailable",
    );
    expect(screen.queryByRole("region", { name: "月評價結果" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    await screen.findByText(/評價數：3；平均：2.67/);
    expect(f.db.query).toHaveBeenCalledTimes(3);
  });
});
