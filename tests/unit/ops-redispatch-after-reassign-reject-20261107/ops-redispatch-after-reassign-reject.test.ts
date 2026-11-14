import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DispatchCandidate,
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

const ORIGIN = "https://ops-redispatch-unit.example.test";
const NOW = Date.parse("2026-11-07T12:00:00Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const PHOTO = "cHJvb2YtcGhvdG8tMDAx";

type Snapshot = {
  order: OwnedOrderRecord;
  jobs: DispatchJobRecord[];
  tasks: DriverTaskRecord[];
  candidates: DispatchCandidate[];
  trace: DispatchTraceLogRecord[];
};

// Real backend transitions create every order/task status and timestamp. The
// existing registry/audit/event collaborator fixtures are external SIM ports;
// neither the state machine, task picker, page, client nor mapper is replaced.
async function fixture() {
  const candidates = ["a", "b", "c"].map((id, i) => ({
    driverId: `driver-redispatch-${id}`,
    vehicleId: `vehicle-redispatch-${id}`,
    etaMinutes: 5 + i,
    operatingArea: "north",
    serviceBuckets: ["business_dispatch"],
  }));
  const { service, regulatoryRegistryService } =
    buildOwnedMobilityServiceForTest({ candidates });
  regulatoryRegistryService.getVehicleLicenseType.mockReturnValue(
    "business_vehicle",
  );
  const booking = await service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: at(60),
      reservationWindowEnd: at(120),
      pickup: { address: "Synthetic origin", lat: 25.04, lng: 121.51 },
      dropoff: { address: "Synthetic destination", lat: 25.05, lng: 121.52 },
      passenger: { name: "Redispatch unit passenger", phone: "0900000000" },
    },
    "tenant-demo-001",
  );
  vi.setSystemTime(new Date(at(60)));
  const job = await service.dispatchOrder(booking.orderId, { mode: "auto" });
  const first = await service.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    vehicleId: candidates[0]!.vehicleId,
    driverId: candidates[0]!.driverId,
  });
  async function snapshot(): Promise<Snapshot> {
    return {
      order: service.getOrder(booking.orderId),
      jobs: service
        .listDispatchJobs()
        .filter((item) => item.orderId === booking.orderId),
      tasks: service
        .listDriverTasks()
        .filter((item) => item.orderId === booking.orderId),
      candidates: await service.listDispatchCandidates(job.dispatchJobId),
      trace: service.listDispatchTrace(booking.orderId),
    };
  }
  return { service, candidates, booking, job, first, snapshot };
}

const documents: JSDOM[] = [];
const unexpected: string[] = [];
type ElementProps = {
  children?: React.ReactNode;
  enabled?: boolean;
  intervalMs?: number;
};
function findElements(
  node: React.ReactNode,
  type: React.ElementType,
): React.ReactElement<ElementProps>[] {
  if (!React.isValidElement<ElementProps>(node)) return [];
  const children = React.Children.toArray(node.props.children);
  return [
    ...(node.type === type ? [node] : []),
    ...children.flatMap((child) => findElements(child, type)),
  ];
}

async function actualPage(snapshot: Snapshot) {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("DRTS_API_URL", ORIGIN);
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("JWT_SECRET", "synthetic-ops-redispatch-unit-key");
  const requestPaths: string[] = [];
  const authorityBeforePage = JSON.stringify(snapshot);
  const lists = new Map<string, unknown[]>([
    ["/api/dispatch/tasks", snapshot.jobs],
    ["/api/driver/tasks", snapshot.tasks],
    ["/api/regulatory-registry/drivers", []],
    [
      `/api/dispatch/tasks/${snapshot.jobs[0]!.dispatchJobId}/candidates`,
      snapshot.candidates,
    ],
    [`/api/orders/${snapshot.order.orderId}/dispatch-trace`, snapshot.trace],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const method = init?.method ?? "GET";
      requestPaths.push(url.pathname);
      if (url.origin !== ORIGIN || method !== "GET" || url.search) {
        unexpected.push(`${method} ${url.href}`);
        throw new Error(`Unexpected unit transport: ${method} ${url.href}`);
      }
      const items = lists.get(url.pathname);
      if (items) return apiWireResponse(toApiListData(items));
      if (url.pathname === `/api/orders/${snapshot.order.orderId}`)
        return apiWireResponse(snapshot.order);
      unexpected.push(`${method} ${url.href}`);
      throw new Error(`Unexpected unit path: ${url.pathname}`);
    }),
  );
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
    "next/navigation": {
      useRouter: () => ({
        refresh() {},
        push() {},
        replace() {},
        prefetch() {},
      }),
      usePathname: () => `/dispatch/${snapshot.order.orderId}`,
      useSearchParams: () => new URLSearchParams(),
      notFound: () => {
        throw new Error("Unexpected framework notFound");
      },
    },
    "next/headers": {
      headers: async () =>
        new Headers({ "x-request-id": "ops-redispatch-unit" }),
      cookies: async () => ({
        get: (name: string) =>
          name === "drts-locale-v2" ? { value: "en" } : undefined,
      }),
    },
  };
  const appRoot = resolve("apps/ops-console-web");
  const load = createUiModuleLoader(appRoot, modules);
  modules["@/components/ops-assistant"] = load(
    resolve(appRoot, "components/ops-assistant/index.ts"),
  );
  const { DispatchAutoRefresh } = load<{
    DispatchAutoRefresh: React.ComponentType<{
      intervalMs: number;
      enabled?: boolean;
    }>;
  }>(resolve(appRoot, "components/dispatch-auto-refresh.tsx"));
  const { default: Page } = load<{
    default: (props: {
      params: Promise<{ dispatchId: string }>;
    }) => Promise<React.ReactNode>;
  }>(resolve(appRoot, "app/dispatch/[dispatchId]/page.tsx"));
  const page = await Page({
    params: Promise.resolve({ dispatchId: snapshot.order.orderId }),
  });
  const refreshers = findElements(page, DispatchAutoRefresh);
  expect(refreshers).toHaveLength(1);
  const dom = new JSDOM(renderToStaticMarkup(page));
  documents.push(dom);
  expect(JSON.stringify(snapshot)).toBe(authorityBeforePage);
  expect(unexpected).toEqual([]);
  const orderPath = `/api/orders/${snapshot.order.orderId}`;
  expect(requestPaths.filter((path) => path === orderPath)).toHaveLength(1);
  expect(requestPaths).not.toContain("/api/orders");
  for (const path of ["/api/dispatch/tasks", "/api/driver/tasks"])
    expect(requestPaths).toContain(path);
  expect(requestPaths).toContain(
    `/api/dispatch/tasks/${snapshot.jobs[0]!.dispatchJobId}/candidates`,
  );
  expect(requestPaths).toContain(
    `/api/orders/${snapshot.order.orderId}/dispatch-trace`,
  );
  return { document: dom.window.document, refresh: refreshers[0]! };
}

function completedStep(document: Document) {
  const step = Array.from(document.querySelectorAll("strong")).find(
    (node) => node.textContent === formatOpsCodeLabel("en", "completed"),
  );
  expect(step).toBeDefined();
  return step!.parentElement!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  expect(unexpected.splice(0)).toEqual([]);
});

describe("Ops canonical order survives reassignment followed by driver rejection", () => {
  it("offers dispatch again for the same redispatch-required order instead of completing it from cancelled task history", async () => {
    const f = await fixture();
    vi.setSystemTime(new Date(at(61)));
    await f.service.acceptDriverTask(f.first.taskId, { acceptedAt: at(61) });
    vi.setSystemTime(new Date(at(62)));
    const second = await f.service.reassignDispatch({
      dispatchJobId: f.job.dispatchJobId,
      vehicleId: f.candidates[1]!.vehicleId,
      driverId: f.candidates[1]!.driverId,
      reasonCode: "operator_reassign",
    });
    vi.setSystemTime(new Date(at(63)));
    await f.service.rejectDriverTask(second.taskId, {
      reasonCode: "driver_rejected",
    });
    const snapshot = await f.snapshot();
    expect(snapshot.order.orderId).toBe(f.booking.orderId);
    expect(snapshot.order.status).toBe("redispatch_required");
    expect(snapshot.tasks).toHaveLength(2);
    expect(
      snapshot.tasks.find((task) => task.taskId === f.first.taskId),
    ).toMatchObject({
      status: "cancelled",
      acceptedAt: at(61),
      completedAt: at(62),
      orderId: f.booking.orderId,
    });
    expect(
      snapshot.tasks.find((task) => task.taskId === second.taskId),
    ).toMatchObject({
      status: "rejected",
      completedAt: null,
      orderId: f.booking.orderId,
    });
    expect(snapshot.candidates.length).toBeGreaterThan(0);
    const { document, refresh } = await actualPage(snapshot);
    expect(
      document.querySelector(`[data-ops-order-id="${f.booking.orderId}"]`),
    ).not.toBeNull();
    const assign = document.querySelector<HTMLButtonElement>(
      '[data-drt-operation="ops-dispatch-assign"]',
    );
    expect(
      assign,
      "canonical redispatch-required order must remain assignable after earlier task cancellation",
    ).not.toBeNull();
    expect(assign!.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Read-only · terminal");
    expect(refresh.props.enabled).toBe(true);
    expect(refresh.props.intervalMs).toBe(5_000);
    // The same historical task/card remains visible. Filtering it away must
    // not be used to hide the real state or change order-action authority.
    expect(
      document.querySelector(
        `[data-ops-task-id="${f.first.taskId}"][data-ops-task-status="cancelled"]`,
      ),
    ).not.toBeNull();
    expect(completedStep(document).querySelector("span")?.textContent).toBe(
      "Waiting",
    );
  });

  it("keeps a truly completed canonical order read-only even with a prior driver's rejected task in its history", async () => {
    const f = await fixture();
    vi.setSystemTime(new Date(at(61)));
    await f.service.rejectDriverTask(f.first.taskId, {
      reasonCode: "driver_rejected",
    });
    vi.setSystemTime(new Date(at(62)));
    const second = await f.service.assignDispatch({
      dispatchJobId: f.job.dispatchJobId,
      vehicleId: f.candidates[1]!.vehicleId,
      driverId: f.candidates[1]!.driverId,
    });
    vi.setSystemTime(new Date(at(63)));
    await f.service.acceptDriverTask(second.taskId, { acceptedAt: at(63) });
    vi.setSystemTime(new Date(at(64)));
    await f.service.departDriverTask(second.taskId, { departedAt: at(64) });
    vi.setSystemTime(new Date(at(65)));
    await f.service.arrivedPickup(second.taskId, { arrivedAt: at(65) });
    vi.setSystemTime(new Date(at(66)));
    await f.service.startDriverTask(second.taskId, { startedAt: at(66) });
    vi.setSystemTime(new Date(at(86)));
    await f.service.completeDriverTask(second.taskId, {
      completedAt: at(86),
      actualDistanceKm: 12.4,
      actualDurationSec: 1200,
      proof: { photos: [PHOTO] },
    });
    const snapshot = await f.snapshot();
    expect(snapshot.order.orderId).toBe(f.booking.orderId);
    expect(snapshot.order.status).toBe("completed");
    expect(snapshot.tasks).toHaveLength(2);
    expect(
      snapshot.tasks.find((task) => task.taskId === f.first.taskId)?.status,
    ).toBe("rejected");
    expect(
      snapshot.tasks.find((task) => task.taskId === second.taskId)?.status,
    ).toBe("completed");
    const { document, refresh } = await actualPage(snapshot);
    expect(
      document.querySelector(`[data-ops-order-id="${f.booking.orderId}"]`),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Read-only · terminal");
    expect(
      document.querySelector('[data-drt-operation="ops-dispatch-assign"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-drt-operation="ops-dispatch-reassign"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-drt-operation="ops-dispatch-create"]'),
    ).toBeNull();
    expect(refresh.props.enabled).toBe(false);
    expect(
      document.querySelector(
        `[data-ops-task-id="${second.taskId}"][data-ops-task-status="completed"]`,
      ),
    ).not.toBeNull();
    expect(completedStep(document).querySelector("span")?.textContent).not.toBe(
      "Waiting",
    );
  });
});

// UI-only authority projection check: the existing upstream HTTP SIM delivers
// the typed order requirement; domain qualification is tested separately.
it.each([true, false])(
  "Ops same-order detail preserves optional wheelchair requirement (%s)",
  async (accessible) => {
    const f = await fixture();
    const state = await f.snapshot();
    if (accessible)
      state.order = { ...state.order, serviceSelection: { accessible: true } };
    const { document } = await actualPage(state);
    expect(
      document.querySelector(`[data-ops-order-id="${state.order.orderId}"]`),
    ).not.toBeNull();
    const requirement = Array.from(document.body.querySelectorAll("*")).filter(
      (node) =>
        node.childElementCount === 0 && node.textContent?.trim() === "輪椅需求",
    );
    expect(requirement).toHaveLength(accessible ? 1 : 0);
    expect(state.order.orderId).toBe(f.booking.orderId);
  },
);

// UI-only reads of normal typed order snapshots. The real Page, Ops SDK,
// CanvasDL and React render execute; HTTP transport and external program facts
// are explicit SIMs. These cases do not assert product/supply qualification.
function fulfillmentLeafText(panel: Element) {
  return Array.from(panel.querySelectorAll("*"))
    .filter((node) => node.childElementCount === 0)
    .map((node) => node.textContent?.trim());
}

it.each([
  {
    subtype: "credit_card_airport_transfer" as const,
    patch: {
      direction: "pickup" as const,
      flightNo: "SIM-OPS-FLIGHT-892",
      terminal: "SIM-OPS-T2",
      luggageCount: 0,
    },
    expected: [
      "Airport pickup",
      "Flight",
      "SIM-OPS-FLIGHT-892",
      "Terminal",
      "SIM-OPS-T2",
      "Luggage count",
      "0",
    ],
  },
  {
    subtype: "travel_agency_transfer" as const,
    patch: {
      partnerBookingDetails: {
        subtype: "travel_agency_transfer" as const,
        groupCode: "SIM-OPS-GROUP-17",
        groupSize: 2,
        itineraryLink: "https://itinerary.example.invalid/SIM-OPS-GROUP-17",
        rosterPassengers: ["SIM團員甲", "SIM團員乙"],
        meetingPoint: "SIM-OPS南側集合處",
      },
    },
    expected: [
      "SIM-OPS-GROUP-17",
      "Group size",
      "2",
      "Meeting point",
      "SIM-OPS南側集合處",
      "https://itinerary.example.invalid/SIM-OPS-GROUP-17",
      "SIM團員甲、SIM團員乙",
    ],
  },
  {
    subtype: "insurance_replacement_vehicle" as const,
    patch: {
      partnerBookingDetails: {
        subtype: "insurance_replacement_vehicle" as const,
        claimNumber: "SIM-OPS-CLAIM-36",
        policyNumber: "SIM-OPS-POLICY-36",
        claimReference: "SIM-OPS-REFERENCE-36",
        claimantName: "SIM-OPS代步使用人",
        replacementStart: "2199-11-12T01:30:00.000Z",
        replacementEnd: "2199-11-14T09:00:00.000Z",
        replacementVehicleClass: "SIM-OPS中型代步車",
        caseHandler: "SIM-OPS理賠聯絡員",
      },
    },
    expected: [
      "SIM-OPS-CLAIM-36",
      "SIM-OPS代步使用人",
      "Replacement vehicle class",
      "SIM-OPS中型代步車",
      "Replacement start (UTC)",
      "Replacement end (UTC)",
      "SIM-OPS理賠聯絡員",
    ],
  },
])(
  "Ops detail renders $subtype fulfillment facts from the same-order API record",
  async ({ subtype, patch, expected }) => {
    const f = await fixture();
    const state = await f.snapshot();
    state.order = {
      ...state.order,
      businessDispatchSubtype: subtype,
      serviceProductCode: subtype,
      ...patch,
    };
    const { document, refresh } = await actualPage(state);
    const panel = document.querySelector(
      `[data-ops-fulfillment-order-id="${state.order.orderId}"]`,
    );
    expect(
      panel,
      "same-order fulfillment facts are visible to dispatch",
    ).not.toBeNull();
    expect(panel!.getAttribute("data-ops-fulfillment-subtype")).toBe(subtype);
    const values = fulfillmentLeafText(panel!);
    for (const item of expected) expect(values).toContain(item);
    if (subtype === "insurance_replacement_vehicle") {
      const contents = panel!.textContent ?? "";
      expect(contents).toContain("2199");
      expect(contents).toContain("01:30");
      expect(contents).toContain("09:00");
    }
    expect(
      document.querySelector(`[data-ops-order-id="${f.booking.orderId}"]`),
    ).not.toBeNull();
    expect(state.order.orderId).toBe(f.booking.orderId);
    expect(refresh.props.enabled).toBe(true);
    expect(refresh.props.intervalMs).toBe(5_000);
  },
);

it("Ops detail shows unavailable insurance fulfillment fields instead of inventing program facts", async () => {
  const f = await fixture();
  const state = await f.snapshot();
  state.order = {
    ...state.order,
    businessDispatchSubtype: "insurance_replacement_vehicle",
    serviceProductCode: "insurance_replacement_vehicle",
  };
  const { document } = await actualPage(state);
  const panel = document.querySelector(
    `[data-ops-fulfillment-order-id="${state.order.orderId}"]`,
  );
  expect(panel).not.toBeNull();
  const values = fulfillmentLeafText(panel!);
  expect(values).toContain("Replacement vehicle class");
  expect(values).toContain("Not provided");
  expect(panel!.textContent).not.toContain("SIM-OPS中型代步車");
  expect(panel!.textContent).not.toContain("undefined");
  expect(state.order.orderId).toBe(f.booking.orderId);
});

it("Ops ordinary enterprise detail does not present an unrelated program snapshot as its fulfillment", async () => {
  const f = await fixture();
  const state = await f.snapshot();
  state.order.partnerBookingDetails = {
    subtype: "travel_agency_transfer",
    groupCode: "SIM-OPS-UNRELATED-GROUP",
    groupSize: 2,
    itineraryLink: "https://itinerary.example.invalid/SIM-OPS-UNRELATED-GROUP",
    rosterPassengers: ["SIM不相關旅客"],
    meetingPoint: "SIM不相關集合點",
  };
  const { document } = await actualPage(state);
  expect(document.querySelector("[data-ops-fulfillment-order-id]")).toBeNull();
  expect(document.body.textContent).not.toContain("SIM-OPS-UNRELATED-GROUP");
  expect(document.body.textContent).not.toContain("SIM不相關集合點");
  expect(
    document.querySelector(`[data-ops-order-id="${f.booking.orderId}"]`),
  ).not.toBeNull();
});
