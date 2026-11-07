import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import * as contracts from "../../../packages/contracts/src/index";
import * as sdk from "../../../packages/api-client/src/index";
import * as auth from "../../../packages/control-plane-auth/src/index";
import * as canvas from "../../../packages/ui-web/src/index";
import * as canvasClient from "../../../packages/ui-web/src/client";
import * as canvasTokens from "../../../packages/ui-web/src/canvas-tokens";
import * as tokens from "../../../packages/ui-tokens/src/index";
import { toApiListData } from "../../../apps/api/src/common/api-envelope";
import { formatOpsCodeLabel } from "../../../apps/ops-console-web/lib/localized-labels";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import { buildOwnedMobilityServiceForTest } from "../system-remediation/sr-qa-dispatch-001/test-support";

const ORIGIN = "https://ops-terminal-lifecycle.example.test";
const PHOTO = "cHJvb2YtcGhvdG8tMDAx";
type State = "completed" | "cancelled" | "on_trip" | "created";
type Snapshot = {
  order: OwnedOrderRecord;
  job: DispatchJobRecord | undefined;
  task: DriverTaskRecord | undefined;
  trace: DispatchTraceLogRecord[];
};

// Use the real backend state machine to create the exact same order/task/job
// aggregate that the dispatcher reads. Registry, audit and event delivery are
// existing in-memory collaborator ports, not a second order implementation.
async function snapshot(state: State): Promise<Snapshot> {
  const { service, regulatoryRegistryService } =
    buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "drv-terminal-unit",
          vehicleId: "veh-terminal-unit",
          etaMinutes: 5,
          operatingArea: "north",
          serviceBuckets: ["business_dispatch"],
        },
      ],
    });
  regulatoryRegistryService.getVehicleLicenseType.mockReturnValue(
    "business_vehicle",
  );
  const at = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000).toISOString();
  const booking = await service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: at(60),
      reservationWindowEnd: at(120),
      pickup: { address: "Synthetic origin", lat: 25.04, lng: 121.51 },
      dropoff: { address: "Synthetic destination", lat: 25.05, lng: 121.52 },
      passenger: { name: "Lifecycle unit rider", phone: "0900000000" },
    },
    "tenant-demo-001",
  );
  if (state !== "created") {
    const job = await service.dispatchOrder(booking.orderId, { mode: "auto" });
    const assigned = await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "veh-terminal-unit",
      driverId: "drv-terminal-unit",
    });
    if (state === "cancelled") {
      await service.cancelOwnedOrder(booking.orderId, {
        reason: "Synthetic rider cancellation",
      });
    } else {
      await service.acceptDriverTask(assigned.taskId, { acceptedAt: at(61) });
      await service.departDriverTask(assigned.taskId, { departedAt: at(62) });
      await service.arrivedPickup(assigned.taskId, { arrivedAt: at(63) });
      await service.startDriverTask(assigned.taskId, { startedAt: at(64) });
      if (state === "completed") {
        await service.completeDriverTask(assigned.taskId, {
          completedAt: at(84),
          actualDistanceKm: 12.4,
          actualDurationSec: 1200,
          proof: { photos: [PHOTO] },
        });
      }
    }
  }
  const order = service.getOrder(booking.orderId);
  expect(order.status).toBe(state);
  const job = service
    .listDispatchJobs()
    .find((item) => item.orderId === order.orderId);
  const task = service
    .listDriverTasks()
    .find((item) => item.orderId === order.orderId);
  if (state === "completed") {
    expect(task?.status).toBe("completed");
    expect(job?.status).toBe("assigned");
  } else if (state === "cancelled") {
    expect(task?.status).toBe("cancelled");
    expect(job?.status).toBe("closed");
  }
  return { order, job, task, trace: service.listDispatchTrace(order.orderId) };
}

const documents: JSDOM[] = [];
let unexpectedRequests: string[] = [];

// Keep actual pages, SDK, server client/auth adapter, labels, map model and UI
// components. Only framework request/navigation ports and upstream HTTP are
// simulated. SSR never runs polling, assistant or Google Maps useEffects.
function harness(rows: Snapshot[]) {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("DRTS_API_URL", ORIGIN);
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("JWT_SECRET", "synthetic-ops-terminal-lifecycle-unit-key");
  const requestPaths: string[] = [];
  const original = JSON.stringify(rows);
  const lists = new Map<string, unknown[]>([
    ["/api/orders", rows.map((row) => row.order)],
    ["/api/dispatch/tasks", rows.flatMap((row) => (row.job ? [row.job] : []))],
    ["/api/driver/tasks", rows.flatMap((row) => (row.task ? [row.task] : []))],
    ...[
      "/api/drivers",
      "/api/regulatory-registry/drivers",
      "/api/regulatory-registry/vehicles",
      "/api/shift-attendance/shifts",
      "/api/incidents",
      "/api/maintenance",
      "/api/reports/jobs",
      "/api/complaints",
      "/api/forwarder/orders",
      "/api/forwarder/adapters/health",
      "/api/forwarder/reconciliation-issues",
      "/api/ops/partner/eligibility/reviews",
    ].map((path): [string, unknown[]] => [path, []]),
    ...rows
      .filter((row) => row.job)
      .map((row): [string, unknown[]] => [
        `/api/dispatch/tasks/${row.job!.dispatchJobId}/candidates`,
        [],
      ]),
    ...rows.map((row): [string, unknown[]] => [
      `/api/orders/${row.order.orderId}/dispatch-trace`,
      row.trace,
    ]),
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      requestPaths.push(url.pathname);
      if (url.origin !== ORIGIN || method !== "GET" || url.search) {
        const detail = `${method} ${url.href}`;
        unexpectedRequests.push(detail);
        throw new Error(`Unexpected lifecycle transport: ${detail}`);
      }
      if (url.pathname === "/api/health") {
        return Response.json({
          service: "api",
          status: "healthy",
          mode: "unit",
          execution_mode: "unit",
          timestamp: new Date().toISOString(),
        });
      }
      if (url.pathname === "/api/identity/context") {
        return apiWireResponse({
          realm: "ops",
          actorType: "ops_user",
          actorId: "ops-terminal-unit",
          tenantId: null,
          roleFamilies: ["ops"],
          roles: [],
          scopes: [],
        });
      }
      // The unrelated observability provider is explicitly unavailable; the real
      // dashboard read-state adapter displays that result without live requests.
      if (url.pathname === "/api/operational-observability") {
        return Response.json(
          {
            error: {
              code: "UNIT_PROVIDER_UNAVAILABLE",
              message: "Unrelated metrics unavailable in this unit",
              retryable: false,
              traceId: "terminal-unit",
            },
          },
          { status: 503 },
        );
      }
      const items = lists.get(url.pathname);
      if (items) return apiWireResponse(toApiListData(items));
      const order = rows.find(
        (row) => url.pathname === `/api/orders/${row.order.orderId}`,
      );
      if (order) return apiWireResponse(order.order);
      unexpectedRequests.push(`${method} ${url.href}`);
      throw new Error(`Unexpected lifecycle path: ${url.pathname}`);
    }),
  );
  const navigation = {
    useRouter: () => ({ refresh() {}, push() {}, replace() {}, prefetch() {} }),
    usePathname: () => "/dispatch",
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
      throw new Error("Unexpected framework notFound");
    },
  };
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/contracts": contracts,
    "@drts/api-client": sdk,
    "@drts/control-plane-auth": auth,
    "@drts/ui-web": canvas,
    "@drts/ui-web/client": canvasClient,
    "@drts/ui-web/canvas-tokens": canvasTokens,
    "@drts/ui-tokens": tokens,
    "next/navigation": navigation,
    "next/headers": {
      headers: async () => new Headers({ "x-request-id": "ops-terminal-unit" }),
      cookies: async () => ({
        get: (name: string) =>
          name === "drts-locale-v2" ? { value: "en" } : undefined,
      }),
    },
  };
  const appRoot = resolve("apps/ops-console-web");
  const load = createUiModuleLoader(appRoot, modules);
  // Existing loader resolves files; explicitly bind the real directory index
  // rather than replacing its actual PublishAssistantScope implementation.
  modules["@/components/ops-assistant"] = load(
    resolve(appRoot, "components/ops-assistant/index.ts"),
  );
  const Board = load<{
    default: (props: {
      searchParams: Promise<Record<string, string>>;
    }) => Promise<React.ReactNode>;
  }>(resolve(appRoot, "app/dispatch/page.tsx")).default;
  const Dashboard = load<{ default: () => Promise<React.ReactNode> }>(
    resolve(appRoot, "app/dashboard/page.tsx"),
  ).default;
  const Detail = load<{
    default: (props: {
      params: Promise<{ dispatchId: string }>;
    }) => Promise<React.ReactNode>;
  }>(resolve(appRoot, "app/dispatch/[dispatchId]/page.tsx")).default;
  async function documentFor(
    element: Promise<React.ReactNode>,
    expectedOrderRead = "/api/orders",
  ) {
    const dom = new JSDOM(renderToStaticMarkup(await element));
    documents.push(dom);
    expect(JSON.stringify(rows)).toBe(original);
    expect(unexpectedRequests).toEqual([]);
    expect(requestPaths).toContain(expectedOrderRead);
    if (expectedOrderRead !== "/api/orders")
      expect(requestPaths).not.toContain("/api/orders");
    expect(requestPaths).toContain("/api/dispatch/tasks");
    return dom.window.document;
  }
  return {
    board: (board: string) =>
      documentFor(Board({ searchParams: Promise.resolve({ board }) })),
    dashboard: () => documentFor(Dashboard()),
    detail: (orderId: string) =>
      documentFor(
        Detail({ params: Promise.resolve({ dispatchId: orderId }) }),
        `/api/orders/${orderId}`,
      ),
  };
}

function orderLink(document: Document, order: OwnedOrderRecord) {
  return document.querySelector(`a[href="/dispatch/${order.orderId}"]`);
}

function boardNavigationLink(document: Document, href: string, label: string) {
  return Array.from(document.querySelectorAll(`a[href="${href}"]`)).find(
    (anchor) =>
      Array.from(anchor.querySelectorAll("span")).some(
        (span) => span.textContent === label,
      ),
  );
}

afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const unexpected = unexpectedRequests;
  unexpectedRequests = [];
  expect(unexpected).toEqual([]);
});

describe("same canonical backend order leaves active dispatcher work after trip terminality", () => {
  it("removes completed-with-retained-assigned-job from assigned rows, counts and map, keeping an in-trip control", async () => {
    const done = await snapshot("completed");
    const active = await snapshot("on_trip");
    const doc = await harness([done, active]).board("assigned");
    expect(orderLink(doc, active.order)).not.toBeNull();
    expect(
      doc.querySelector(`[data-ops-map-order-id="${active.order.orderId}"]`),
    ).not.toBeNull();
    expect(orderLink(doc, done.order)).toBeNull();
    expect(
      doc.querySelector(`[data-ops-map-order-id="${done.order.orderId}"]`),
    ).toBeNull();
    expect(
      boardNavigationLink(
        doc,
        "/dispatch?board=assigned",
        "Assigned",
      )?.textContent?.trim(),
    ).toBe("1Assigned");
  });

  it("removes canonical cancelled-with-closed-job from the ready queue, retaining a genuine undispatched control", async () => {
    const cancelled = await snapshot("cancelled");
    const ready = await snapshot("created");
    const doc = await harness([cancelled, ready]).board("ready");
    expect(orderLink(doc, ready.order)).not.toBeNull();
    expect(orderLink(doc, cancelled.order)).toBeNull();
    expect(
      boardNavigationLink(doc, "/dispatch", "Ready queue")?.textContent?.trim(),
    ).toBe("1Ready queue");
  });

  it("excludes terminal orders before the dashboard top-five limit, keeping an older in-trip order visible", async () => {
    const active = await snapshot("on_trip");
    const terminal = await Promise.all(
      Array.from({ length: 6 }, () => snapshot("completed")),
    );
    const cancelled = await snapshot("cancelled");
    // Read timestamps are fixture data at the transport boundary. All states,
    // IDs and relationships still come from real backend transitions above.
    active.order.updatedAt = "2026-01-01T00:00:00.000Z";
    terminal.forEach((row, index) => {
      row.order.updatedAt = `2026-02-0${index + 1}T00:00:00.000Z`;
    });
    const doc = await harness([...terminal, cancelled, active]).dashboard();
    expect(doc.body.textContent).toContain("Current Dispatch Queue · top 5");
    expect(orderLink(doc, active.order)).not.toBeNull();
    for (const row of [...terminal, cancelled])
      expect(orderLink(doc, row.order)).toBeNull();
  });

  it("keeps completed details readable but labels the exact retained job as completed, not assigned", async () => {
    const done = await snapshot("completed");
    const doc = await harness([done]).detail(done.order.orderId);
    expect(
      doc.querySelector(`[data-ops-order-id="${done.order.orderId}"]`),
    ).not.toBeNull();
    expect(doc.body.textContent).toContain("Read-only · terminal");
    expect(
      doc.querySelector('[data-drt-operation="ops-dispatch-create"]'),
    ).toBeNull();
    expect(
      doc.querySelector('[data-drt-operation="ops-dispatch-assign"]'),
    ).toBeNull();
    const text = doc.body.textContent ?? "";
    expect(text).toContain(
      `${formatOpsCodeLabel("en", "completed")} · ${done.job!.dispatchJobId}`,
    );
    expect(text).not.toContain(
      `${formatOpsCodeLabel("en", "assigned")} · ${done.job!.dispatchJobId}`,
    );
  });

  it("preserves direct canonical cancelled detail as read-only history with its closed job", async () => {
    const cancelled = await snapshot("cancelled");
    const doc = await harness([cancelled]).detail(cancelled.order.orderId);
    expect(
      doc.querySelector(`[data-ops-order-id="${cancelled.order.orderId}"]`),
    ).not.toBeNull();
    expect(doc.body.textContent).toContain("Read-only · terminal");
    expect(doc.body.textContent).toContain(
      `${formatOpsCodeLabel("en", "cancelled")} · ${cancelled.job!.dispatchJobId}`,
    );
    expect(
      doc.querySelector('[data-drt-operation="ops-dispatch-create"]'),
    ).toBeNull();
  });
});
