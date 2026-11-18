import { describe, expect, it, vi } from "vitest";
import { parseRecentDaysWindow } from "../../apps/api/src/modules/owned-mobility/recent-days-window";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import {
  OPS_DISPATCH_TASKS_WORKING_LIST,
  OPS_ORDERS_WORKING_LIST,
} from "../../apps/ops-console-web/lib/working-lists";

// GET /api/orders and GET /api/dispatch/tasks returned every order ever
// created. On shared dev that reached about 10 MB per read, and the Ops
// dashboard and dispatch board load both on every render. `recentDays` keeps
// every open order and adds closed ones from the last N days.

const NOW = Date.parse("2026-11-18T00:00:00Z");

function repositoryWithQuery() {
  const query = vi.fn<
    (
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: { record: unknown }[] }>
  >(async () => ({ rows: [] }));
  const database = { isEnabled: () => true, query };
  const repository = new OwnedMobilityRepository(
    database as never,
    {} as never,
  );
  return { repository, query };
}

const sqlOf = (query: ReturnType<typeof repositoryWithQuery>["query"]) =>
  String(query.mock.calls[0]?.[0]).replace(/\s+/g, " ").trim();

describe("recentDays query", () => {
  it("is optional: absent or empty keeps the full list", () => {
    expect(parseRecentDaysWindow(undefined, NOW)).toBeUndefined();
    expect(parseRecentDaysWindow("", NOW)).toBeUndefined();
  });

  it("turns whole days into a created-since instant", () => {
    expect(parseRecentDaysWindow("30", NOW)).toEqual({
      createdSince: new Date("2026-10-19T00:00:00Z"),
    });
    expect(parseRecentDaysWindow("1", NOW)).toEqual({
      createdSince: new Date("2026-11-17T00:00:00Z"),
    });
  });

  it.each(["0", "367", "-1", "1.5", "abc", "30d", "1e2", " 30"])(
    "rejects %j instead of widening to every order",
    (raw) => {
      expect(() => parseRecentDaysWindow(raw, NOW)).toThrow(
        expect.objectContaining({ code: "RECENT_DAYS_INVALID", status: 400 }),
      );
    },
  );

  it("is what the Ops working lists send", () => {
    expect(OPS_ORDERS_WORKING_LIST).toBe("/api/orders?recentDays=30");
    expect(OPS_DISPATCH_TASKS_WORKING_LIST).toBe(
      "/api/dispatch/tasks?recentDays=30",
    );
  });
});

describe("owned order and dispatch job reads", () => {
  const window = { createdSince: new Date("2026-10-19T00:00:00Z") };

  it("reads every order when no window is given", async () => {
    const { repository, query } = repositoryWithQuery();
    await repository.listOrdersForRead();
    expect(sqlOf(query)).toBe(
      "SELECT record FROM ops.phase1_owned_orders ORDER BY created_at DESC, order_id",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([]);
  });

  it("keeps open orders of any age and closed ones inside the window", async () => {
    const { repository, query } = repositoryWithQuery();
    await repository.listOrdersForRead(undefined, window);
    expect(sqlOf(query)).toBe(
      "SELECT record FROM ops.phase1_owned_orders WHERE (status NOT IN ('completed', 'cancelled') OR created_at >= $1::timestamptz) ORDER BY created_at DESC, order_id",
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["2026-10-19T00:00:00.000Z"]);
  });

  it("combines the window with an explicit order id list", async () => {
    const { repository, query } = repositoryWithQuery();
    await repository.listOrdersForRead(["order-1"], window);
    expect(sqlOf(query)).toBe(
      "SELECT record FROM ops.phase1_owned_orders WHERE order_id = ANY($1::varchar[]) AND (status NOT IN ('completed', 'cancelled') OR created_at >= $2::timestamptz) ORDER BY created_at DESC, order_id",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      ["order-1"],
      "2026-10-19T00:00:00.000Z",
    ]);
  });

  it("selects dispatch jobs by their order's window, not the job's own age", async () => {
    const { repository, query } = repositoryWithQuery();
    await repository.listDispatchJobsForRead(window);
    expect(sqlOf(query)).toBe(
      "SELECT record FROM ops.phase1_dispatch_jobs WHERE order_id IN ( SELECT order_id FROM ops.phase1_owned_orders WHERE (status NOT IN ('completed', 'cancelled') OR created_at >= $1::timestamptz) ) ORDER BY created_at DESC, dispatch_job_id",
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["2026-10-19T00:00:00.000Z"]);
  });

  it("reads every dispatch job when no window is given", async () => {
    const { repository, query } = repositoryWithQuery();
    await repository.listDispatchJobsForRead();
    expect(sqlOf(query)).toBe(
      "SELECT record FROM ops.phase1_dispatch_jobs ORDER BY created_at DESC, dispatch_job_id",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([]);
  });
});
