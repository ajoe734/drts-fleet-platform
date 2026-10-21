// @vitest-environment jsdom
import React from "react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
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
import { ApiClient, ApiClientError } from "@drts/api-client";
import { getPlatformAdminClient } from "../../../apps/platform-admin-web/lib/platform-admin-client-factory";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");
const {
  firstValueFrom,
  from,
}: typeof import("../../../apps/api/node_modules/rxjs") = requireApi("rxjs");
const state = vi.hoisted(() => ({ client: null as ApiClient | null }));
vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => state.client,
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

afterEach(async () => {
  await React.act(async () => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function canonicalSource() {
  const orders = [],
    driverTasks = [],
    dispatchAssignments = [];
  for (const [index, score] of [1, 3, 4, 2].entries()) {
    const orderId = `wire-owned-${index}`,
      taskId = `wire-task-${index}`,
      assignmentId = `wire-assignment-${index}`;
    orders.push({
      orderId,
      orderNo: `WIRE-${index}`,
      status: "completed",
      tenantId: "synthetic-tenant",
      partnerId: "synthetic-partner",
      partnerProgramId: "synthetic-program",
      partnerEntrySlug: "synthetic-entry",
      referralPassengerLifecycle: {
        rating: {
          orderId,
          score,
          tags: ["駕駛親切", "車內整潔"],
          comment: `原始意見-${index}`,
          submittedAt: "2026-10-01T01:00:00.000Z",
          contactRequested: false,
          complaintCaseNo: `SYNTHETIC-CRM-${index}`,
        },
      },
    });
    const shared = {
      orderId,
      taskId,
      assignmentId,
      dispatchJobId: `wire-job-${index}`,
      driverId: "same-completed-driver",
      vehicleId: "same-completed-vehicle",
      status: "completed",
    };
    // Last original rating has no completed task/assignment; it stays unattributed.
    if (index < 3) {
      driverTasks.push({ ...shared, completedAt: "2026-09-30T15:00:00.000Z" });
      dispatchAssignments.push(shared);
    }
  }
  return { orders, driverTasks, dispatchAssignments };
}

function setup() {
  const source = canonicalSource();
  vi.stubEnv("DATABASE_URL", "");
  const database = new DatabaseService();
  const db = {
    isEnabled: vi.spyOn(database, "isEnabled").mockReturnValue(true),
    query: vi.spyOn(database, "query").mockResolvedValue({
      rows: [{ record: structuredClone(source) }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    }),
  };
  const repo = new ReportingRepository(database);
  const service = new ReferralMonthlyRatingService(repo);
  const controller = new ReferralMonthlyRatingController(service);
  const serializer = new SnakeCaseInterceptor();
  const exceptionFilter = new SnakeCaseExceptionFilter();
  const requests: {
    url: string;
    signal: AbortSignal;
    wire: {
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      error?: Record<string, unknown>;
    };
    status: number;
  }[] = [];
  const fetchBoundary = vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url, "https://socket-free.invalid");
    expect(u.pathname).toBe(
      "/control-plane-proxy/reports/referral-monthly-ratings",
    );
    expect(init.method).toBe("GET");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Request-Id")).toBeTruthy();
    let wire: unknown,
      status = 200;
    try {
      wire = await firstValueFrom(
        serializer.intercept(
          {} as Parameters<SnakeCaseInterceptor["intercept"]>[0],
          {
            handle: () =>
              from(
                controller.read(
                  {
                    ...Object.fromEntries(u.searchParams),
                    periodMonth: u.searchParams.get("periodMonth") ?? "",
                  },
                  headers.get("X-Request-Id")!,
                ),
              ),
          },
        ),
      );
    } catch (error) {
      exceptionFilter.catch(error, {
        switchToHttp: () => ({
          getResponse: () => ({
            status: (code: number) => {
              status = code;
              return {
                json: (body: unknown) => {
                  wire = body;
                },
              };
            },
          }),
        }),
      } as Parameters<SnakeCaseExceptionFilter["catch"]>[1]);
    }
    requests.push({
      url,
      signal: init.signal as AbortSignal,
      wire: wire as {
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        error?: Record<string, unknown>;
      },
      status,
    });
    return new Response(JSON.stringify(wire), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchBoundary);
  // Use the actual manager factory and actual SDK; only hook injection and fetch transport are controlled.
  const client = getPlatformAdminClient("/control-plane-proxy");
  expect(client).toBeInstanceOf(ApiClient);
  state.client = client;
  const view = render(<ReferralMonthlyRatings />);
  fireEvent.change(screen.getByLabelText("月份"), {
    target: { value: "2026-10" },
  });
  const load = () =>
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
  return {
    source,
    db,
    controller,
    client,
    requests,
    fetchBoundary,
    view,
    load,
  };
}

describe("actual monthly repository/service/controller -> real wire serializer -> real SDK/factory -> manager", () => {
  it("renders the snake_case response as the correct original monthly and driver figures", async () => {
    const f = setup();
    f.load();
    await screen.findByText(/評價數：4；平均：2.50；歸屬待確認：1/);
    expect(f.db.query).toHaveBeenCalledTimes(1);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.wire.data).toMatchObject({
      period_month: "2026-10",
      time_zone: "Asia/Taipei",
      rating_count: 4,
      average_rating: 2.5,
      unattributed_rating_count: 1,
    });
    expect(f.requests[0]!.wire.data).not.toHaveProperty("ratingCount");
    expect(f.requests[0]!.wire.meta!.request_id).toBeTruthy();
    const driver = within(screen.getByRole("table", { name: "駕駛月統計" }));
    expect(driver.getByText("same-completed-driver")).toBeTruthy();
    expect(driver.getByText("2.67")).toBeTruthy();
    const rows = within(
      screen.getByRole("table", { name: "原始評價" }),
    ).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(rows[1]!).getByText("否／SYNTHETIC-CRM-0")).toBeTruthy();
    expect(screen.getAllByText("駕駛親切、車內整潔")).toHaveLength(4);
    expect(screen.getByText("原始意見-0")).toBeTruthy();
    expect(screen.getByText("2026-10（Asia/Taipei）")).toBeTruthy();
  });

  it("carries driver filters over the actual proxy path and renders null averages and empty original rows", async () => {
    const f = setup();
    fireEvent.change(screen.getByLabelText("駕駛 ID"), {
      target: { value: "same-completed-driver" },
    });
    f.load();
    await screen.findByText(/評價數：3；平均：2.67；歸屬待確認：0/);
    expect(f.requests[0]!.url).toContain("driverId=same-completed-driver");
    fireEvent.change(screen.getByLabelText("駕駛 ID"), {
      target: { value: "unknown-driver" },
    });
    expect(screen.queryByRole("region", { name: "月評價結果" })).toBeNull();
    f.load();
    await screen.findByText(/評價數：0；平均：無評價；歸屬待確認：0/);
    expect(f.requests[1]!.wire.data!.average_rating).toBeNull();
    expect(f.requests[1]!.wire.data!.rows).toEqual([]);
    expect(screen.getByText("此月份／駕駛沒有評價。")).toBeTruthy();
    expect(
      within(screen.getByRole("table", { name: "原始評價" })).getAllByRole(
        "row",
      ),
    ).toHaveLength(1);
    expect(f.db.query).toHaveBeenCalledTimes(2);
  });

  it("displays a true exception-filter error through the SDK and requires an explicit refresh to recover", async () => {
    const f = setup();
    f.load();
    await screen.findByText(/評價數：4；平均：2.50/);
    f.db.isEnabled.mockReturnValue(false);
    f.load();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain(
      "Canonical Referral ratings are unavailable.",
    );
    expect(screen.queryByRole("region", { name: "月評價結果" })).toBeNull();
    expect(f.requests[1]).toMatchObject({
      status: 503,
      wire: {
        error: {
          code: "REPORT_SOURCE_UNAVAILABLE",
          retryable: false,
          trace_id: expect.any(String),
        },
      },
    });
    expect(f.fetchBoundary).toHaveBeenCalledTimes(2);
    // Same real SDK receives the actual filter shape, including trace_id -> ApiClientError.traceId.
    await expect(
      f.client.getEnvelope(
        "/api/reports/referral-monthly-ratings?periodMonth=2026-10",
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "REPORT_SOURCE_UNAVAILABLE",
      traceId: expect.any(String),
    });
    expect(f.fetchBoundary).toHaveBeenCalledTimes(3);
    f.db.isEnabled.mockReturnValue(true);
    f.load();
    await screen.findByText(/評價數：4；平均：2.50/);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(f.db.query).toHaveBeenCalledTimes(2);
    expect(f.fetchBoundary).toHaveBeenCalledTimes(4);
    expect(ApiClientError.prototype).toBeInstanceOf(Error);
  });

  it("keeps an aborted previous response from replacing a fresh filtered result and aborts on unmount", async () => {
    const f = setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const original = f.fetchBoundary.getMockImplementation()!;
    let firstSignal: AbortSignal | undefined;
    f.fetchBoundary.mockImplementationOnce(async (url, init) => {
      firstSignal = init.signal as AbortSignal;
      const response = await original(url, init);
      await gate;
      return response;
    });
    f.load();
    await vi.waitFor(() => expect(f.db.query).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("駕駛 ID"), {
      target: { value: "unknown-driver" },
    });
    expect(firstSignal?.aborted).toBe(true);
    f.load();
    await screen.findByText(/評價數：0；平均：無評價/);
    await act(async () => {
      release();
      await gate;
      await Promise.resolve();
    });
    expect(screen.queryByText(/評價數：4；平均：2.50/)).toBeNull();
    expect(screen.getByText(/評價數：0；平均：無評價/)).toBeTruthy();
    const latest = f.requests[1]!.signal;
    expect(latest.aborted).toBe(false);
    f.view.unmount();
    expect(latest.aborted).toBe(true);
    expect(f.fetchBoundary).toHaveBeenCalledTimes(2);
  });
});
