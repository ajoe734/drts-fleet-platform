// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActionReceipt,
  OwnedOrderRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import type {
  RocAlertReadModel,
  RocTripReadModel,
} from "../../../apps/ops-console-web/lib/ops-av-fallback";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/ops-console-web");
const appRequire = createRequire(resolve(appRoot, "package.json"));

type ReactModule = {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
};

type ReactDomClientModule = {
  createRoot: (container: Element) => {
    render: (element: unknown) => void;
    unmount: () => void;
  };
};

const React = appRequire("react") as ReactModule;
const jsxRuntime = appRequire("react/jsx-runtime") as Record<string, unknown>;
const { createRoot } = appRequire("react-dom/client") as ReactDomClientModule;

// Enable React 19 act environment in jsdom
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type SearchParamsInput = Record<string, string | string[] | undefined>;

const SIM_REFRESH: UiRefreshMetadata = {
  generatedAt: "2026-11-14T09:00:00.000Z",
  staleAfterMs: 15000,
  dataFreshness: "fresh",
  source: "sandbox",
};

function buildSimAlerts(): RocAlertReadModel[] {
  return [
    {
      alertId: "ex-alert-301",
      alertType: "provider_health",
      status: "open",
      severity: "critical",
      title: "Tesla integration unreachable",
      summary: "Provider heartbeat timed out over 30s",
      vehicleId: "AV-7708",
      orderId: "ord-88201",
      sandboxProgramId: "sbx-tp-01",
      openedAt: "2026-11-14T08:35:00.000Z",
      updatedAt: "2026-11-14T08:40:00.000Z",
      availableActions: [
        {
          action: "fallback-to-human",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
        {
          action: "ack",
          enabled: true,
          requiresReason: false,
          riskLevel: "low",
        },
      ],
    },
    {
      alertId: "ex-alert-302",
      alertType: "takeover_discrepancy",
      status: "acknowledged",
      severity: "warning",
      title: "Safety driver takeover mismatch",
      summary: "Manual disengagement logged without ROC notice",
      vehicleId: "AV-7732",
      orderId: "ord-88240",
      sandboxProgramId: "sbx-tp-01",
      openedAt: "2026-11-14T08:50:00.000Z",
      updatedAt: "2026-11-14T08:55:00.000Z",
      availableActions: [
        {
          action: "open-incident",
          enabled: false,
          disabledReasonCode: "incident_already_open",
          requiresReason: false,
          riskLevel: "medium",
        },
      ],
    },
    {
      alertId: "ex-alert-303",
      alertType: "telemetry_drift_future_v2",
      status: "resolved",
      severity: "info",
      title: "Unmapped future telemetry drift",
      summary: "Future sandbox sensor drift code retained as data",
      vehicleId: "AV-7741",
      orderId: null,
      sandboxProgramId: "sbx-tp-01",
      openedAt: "2026-11-14T08:45:00.000Z",
      updatedAt: "2026-11-14T08:48:00.000Z",
      availableActions: [],
    },
    {
      alertId: "ex-alert-304",
      alertType: "provider_health",
      status: "open",
      severity: "warning",
      title: "Secondary provider latency",
      summary: "Backup telemetry channel degraded",
      vehicleId: "AV-7715",
      orderId: "ord-88228",
      sandboxProgramId: "sbx-tp-01",
      openedAt: "2026-11-14T08:25:00.000Z",
      updatedAt: "2026-11-14T08:30:00.000Z",
      availableActions: [
        {
          action: "ack",
          enabled: true,
          requiresReason: false,
          riskLevel: "low",
        },
      ],
    },
    {
      alertId: "ex-non-sandbox-999",
      alertType: "billing_notice",
      status: "open",
      severity: "info",
      title: "Non-sandbox administrative notice",
      summary: "Must be excluded by matchesSandboxExceptionAlert predicate",
      vehicleId: null,
      orderId: null,
      sandboxProgramId: null,
      openedAt: "2026-11-14T08:59:00.000Z",
      updatedAt: "2026-11-14T08:59:00.000Z",
      availableActions: [],
    },
  ];
}

const SIM_ORDERS: Record<string, Partial<OwnedOrderRecord>> = {
  "ord-88201": {
    orderId: "ord-88201",
    bookingId: "bk-88201",
    status: "on_trip",
  },
  "ord-88240": {
    orderId: "ord-88240",
    bookingId: "bk-88240",
    status: "driver_accepted",
  },
  "ord-88228": {
    orderId: "ord-88228",
    bookingId: "bk-88228",
    status: "enroute_pickup",
  },
};

const SIM_TRIPS: RocTripReadModel[] = [
  {
    tripId: "trip-88201",
    orderId: "ord-88201",
    humanFallbackActive: true,
  },
];

let activeRoot: { unmount: () => void } | null = null;
let activeContainer: HTMLDivElement | null = null;

function unmountActive() {
  if (activeRoot) {
    React.act(() => {
      activeRoot?.unmount();
    });
    activeRoot = null;
  }
  if (activeContainer) {
    activeContainer.remove();
    activeContainer = null;
  }
}

function createTestHarness(options?: {
  localeCookie?: "en" | "zh";
  alerts?: RocAlertReadModel[];
  failAlertsLoad?: Error;
}) {
  let localeCookie: "en" | "zh" = options?.localeCookie ?? "en";
  let currentAlerts: RocAlertReadModel[] = options?.alerts ?? buildSimAlerts();
  const failAlertsLoad = options?.failAlertsLoad;
  const writeCalls: Array<{ path: string; body: unknown }> = [];
  const getCalls: string[] = [];

  const serverClient = {
    getEnvelope: vi.fn(async (path: string) => {
      getCalls.push(path);
      if (path === "/api/roc/alerts") {
        if (failAlertsLoad) {
          throw failAlertsLoad;
        }
        return {
          data: {
            items: currentAlerts,
            refresh: SIM_REFRESH,
            ...(currentAlerts.length === 0
              ? {
                  emptyState: {
                    reason: "no_data",
                    messageCode: "roc.alerts.empty",
                  },
                }
              : {}),
          },
        };
      }
      if (path === "/api/roc/trips") {
        return {
          data: {
            items: SIM_TRIPS,
            refresh: SIM_REFRESH,
          },
        };
      }
      if (path.startsWith("/api/orders/")) {
        const orderId = decodeURIComponent(path.slice("/api/orders/".length));
        const order = SIM_ORDERS[orderId];
        if (!order) {
          throw new Error(`Order not found: ${orderId}`);
        }
        return {
          data: {
            item: order,
            refresh: SIM_REFRESH,
          },
        };
      }
      throw new Error(`Unexpected server GET path: ${path}`);
    }),
  };

  const browserClient = {
    post: vi.fn(
      async (
        path: string,
        init?: { body?: unknown },
      ): Promise<ActionReceipt> => {
        writeCalls.push({ path, body: init?.body });
        return {
          actionId: "act-301",
          auditId: "aud-sandbox-301",
          resourceType: "roc_alert",
          resourceId: "ex-alert-301",
          status: "completed",
          message: "Fallback to human triggered",
        };
      },
    ),
  };

  const LinkMock = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: unknown;
    style?: Record<string, unknown>;
  }) =>
    React.createElement(
      "a",
      {
        href,
        ...rest,
      },
      children,
    );

  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": {
      __esModule: true,
      default: LinkMock,
    },
    "next/headers": {
      cookies: async () => ({
        get: (name: string) =>
          name === "drts-locale-v2" ? { value: localeCookie } : undefined,
      }),
    },
    "@/lib/api-client.server": {
      getServerOpsClient: async () => serverClient,
    },
    "@/lib/api-client": {
      getOpsClient: () => browserClient,
    },
  };

  const load = createUiModuleLoader(appRoot, modules);
  const canvasPrimitives = load<Record<string, unknown>>(
    resolve("packages/ui-web/src/canvas-primitives/index.tsx"),
  );
  const canvasTable = load<{ Table: unknown }>(
    resolve("packages/ui-web/src/canvas-primitives/table.tsx"),
  );
  modules["@drts/ui-web"] = {
    ...canvasPrimitives,
    CanvasBanner: canvasPrimitives.Banner,
    CanvasBtn: canvasPrimitives.Btn,
    CanvasCard: canvasPrimitives.Card,
    CanvasDL: canvasPrimitives.DL,
    CanvasEmptyState: canvasPrimitives.EmptyState,
    CanvasField: canvasPrimitives.Field,
    CanvasInput: canvasPrimitives.Input,
    CanvasKPI: canvasPrimitives.KPI,
    CanvasPageHeader: canvasPrimitives.PageHeader,
    CanvasPill: canvasPrimitives.Pill,
    CanvasSelect: canvasPrimitives.Select,
    CanvasShell: canvasPrimitives.Shell,
    CanvasStaleBanner: canvasPrimitives.StaleBanner,
    CanvasTrafficLights: canvasPrimitives.TrafficLights,
    CanvasWindowChrome: canvasPrimitives.WindowChrome,
    CanvasTable: canvasTable.Table,
  };
  const { default: SandboxExceptionsPage } = load<{
    default: (props?: {
      searchParams?: Promise<SearchParamsInput> | SearchParamsInput;
    }) => Promise<unknown>;
  }>(resolve(appRoot, "app/av-fallback/sandbox-exceptions/page.tsx"));

  async function renderAt(searchParams: SearchParamsInput = {}) {
    unmountActive();
    const element = await SandboxExceptionsPage({
      searchParams: Promise.resolve(searchParams),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await React.act(async () => {
      root.render(element);
    });
    activeRoot = root;
    activeContainer = container;
    return { container };
  }

  return {
    renderAt,
    SandboxExceptionsPage,
    writeCalls,
    getCalls,
    setLocaleCookie(nextLocale: "en" | "zh") {
      localeCookie = nextLocale;
    },
    setAlerts(nextAlerts: RocAlertReadModel[]) {
      currentAlerts = nextAlerts;
    },
  };
}

function readRenderedRowAlertIds(container: HTMLElement): string[] {
  const rows = Array.from(container.querySelectorAll("tbody tr"));
  return rows
    .map((row) => row.querySelector("td")?.textContent?.trim() ?? "")
    .filter(Boolean);
}

function findSelectByLabelText(
  container: HTMLElement,
  labelText: string,
): HTMLSelectElement | null {
  const labels = Array.from(container.querySelectorAll("label"));
  for (const label of labels) {
    const text = label.querySelector("span")?.textContent?.trim();
    if (text === labelText) {
      const select = label.querySelector("select");
      if (select instanceof HTMLSelectElement) {
        return select;
      }
    }
  }
  return null;
}

function findButtonByText(
  root: ParentNode,
  text: string,
): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll("button"));
  return (
    buttons.find(
      (btn): btn is HTMLButtonElement => btn.textContent?.trim() === text,
    ) ?? null
  );
}

function findLinkByText(
  root: ParentNode,
  text: string,
): HTMLAnchorElement | null {
  const links = Array.from(root.querySelectorAll("a"));
  return (
    links.find(
      (link): link is HTMLAnchorElement => link.textContent?.trim() === text,
    ) ?? null
  );
}

afterEach(() => {
  unmountActive();
  vi.restoreAllMocks();
});

describe("Ops Sandbox Exceptions Type filter (/av-fallback/sandbox-exceptions)", () => {
  it("renders a labelled GET Type filter with all canonical loaded types and newest-first rows by default", async () => {
    const harness = createTestHarness({ localeCookie: "en" });
    const { container } = await harness.renderAt({});

    // Excludes non-sandbox alert ex-non-sandbox-999 and orders newest-first by updatedAt
    expect(readRenderedRowAlertIds(container)).toEqual([
      "ex-alert-302",
      "ex-alert-303",
      "ex-alert-301",
      "ex-alert-304",
    ]);
    expect(container.textContent).not.toContain("ex-non-sandbox-999");
    expect(container.textContent).toContain("Showing 4 / 4");

    const select = findSelectByLabelText(container, "Type");
    expect(select).not.toBeNull();
    expect(select!.name).toBe("type");
    expect(select!.value).toBe("all");

    const form = select!.closest("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("get");
    expect(form?.getAttribute("action")).toBe(
      "/av-fallback/sandbox-exceptions",
    );

    const options = Array.from(select!.options).map((option) => ({
      value: option.value,
      label: option.textContent,
    }));
    expect(options).toEqual([
      { value: "all", label: "All types" },
      { value: "takeover_discrepancy", label: "Takeover Discrepancy" },
      {
        value: "telemetry_drift_future_v2",
        label: "Telemetry Drift Future V2",
      },
      { value: "provider_health", label: "Provider Health" },
    ]);

    const submitBtn = findButtonByText(form!, "Apply");
    expect(submitBtn).not.toBeNull();
    expect(submitBtn?.getAttribute("type")).toBe("submit");

    const resetLink = findLinkByText(form!, "Reset");
    expect(resetLink).not.toBeNull();
    expect(resetLink?.getAttribute("href")).toBe(
      "/av-fallback/sandbox-exceptions",
    );

    expect(harness.writeCalls).toEqual([]);
  });

  it("filters by canonical alertType via GET query, preserves full-source options and counts, restores URL state, and resets", async () => {
    const harness = createTestHarness({ localeCookie: "en" });
    const { container: initialContainer } = await harness.renderAt({});

    const initialSelect = findSelectByLabelText(initialContainer, "Type");
    expect(initialSelect).not.toBeNull();
    await React.act(async () => {
      initialSelect!.value = "provider_health";
      initialSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(initialSelect!.value).toBe("provider_health");

    const form = initialSelect!.closest("form")!;
    const submittedParams = Object.fromEntries(
      Array.from(form.elements)
        .filter(
          (el): el is HTMLSelectElement | HTMLInputElement =>
            (el instanceof HTMLSelectElement ||
              el instanceof HTMLInputElement) &&
            Boolean(el.name),
        )
        .map((el) => [el.name, el.value]),
    );
    expect(submittedParams).toEqual({ type: "provider_health" });

    // Roundtrip render with ?type=provider_health
    const { container: filteredContainer } =
      await harness.renderAt(submittedParams);
    expect(readRenderedRowAlertIds(filteredContainer)).toEqual([
      "ex-alert-301",
      "ex-alert-304",
    ]);
    expect(filteredContainer.textContent).toContain("Showing 2 / 4");

    // URL selected-state restoration & full-source options retained (not narrowed to filtered slice)
    const restoredSelect = findSelectByLabelText(filteredContainer, "Type");
    expect(restoredSelect).not.toBeNull();
    expect(restoredSelect!.value).toBe("provider_health");
    expect(Array.from(restoredSelect!.options).map((o) => o.value)).toEqual([
      "all",
      "takeover_discrepancy",
      "telemetry_drift_future_v2",
      "provider_health",
    ]);

    // Filter by second canonical type: takeover_discrepancy
    const { container: secondContainer } = await harness.renderAt({
      type: "takeover_discrepancy",
    });
    expect(readRenderedRowAlertIds(secondContainer)).toEqual(["ex-alert-302"]);
    expect(secondContainer.textContent).toContain("Showing 1 / 4");
    expect(findSelectByLabelText(secondContainer, "Type")?.value).toBe(
      "takeover_discrepancy",
    );
    expect(secondContainer.textContent).toContain("bk-88240");
    expect(secondContainer.textContent).toContain("ord-88240");
    expect(secondContainer.textContent).toContain("AV-7732");
    expect(secondContainer.textContent).toContain("Incident already open");

    // Filter by unknown/future server alert type: telemetry_drift_future_v2
    const { container: unknownTypeContainer } = await harness.renderAt({
      type: "telemetry_drift_future_v2",
    });
    expect(readRenderedRowAlertIds(unknownTypeContainer)).toEqual([
      "ex-alert-303",
    ]);
    expect(unknownTypeContainer.textContent).toContain("Showing 1 / 4");
    expect(findSelectByLabelText(unknownTypeContainer, "Type")?.value).toBe(
      "telemetry_drift_future_v2",
    );
    expect(unknownTypeContainer.textContent).toContain(
      "Future sandbox sensor drift code retained as data",
    );
    expect(unknownTypeContainer.textContent).toContain(
      "No writable actions emitted for this resource.",
    );

    // Reset via Reset link href back to unfiltered route
    const resetHref = findLinkByText(
      unknownTypeContainer,
      "Reset",
    )?.getAttribute("href");
    expect(resetHref).toBe("/av-fallback/sandbox-exceptions");

    const { container: resetContainer } = await harness.renderAt({});
    expect(readRenderedRowAlertIds(resetContainer)).toEqual([
      "ex-alert-302",
      "ex-alert-303",
      "ex-alert-301",
      "ex-alert-304",
    ]);
    expect(resetContainer.textContent).toContain("Showing 4 / 4");
    expect(findSelectByLabelText(resetContainer, "Type")?.value).toBe("all");
    expect(harness.writeCalls).toEqual([]);
  });

  it("distinguishes filtered-empty from actual no-data empty state and preserves fetch failure propagation", async () => {
    const harness = createTestHarness({ localeCookie: "en" });

    // 1. Filtered-empty: alerts exist (4 loaded), but 0 match ?type=boundary_exit
    const { container: filteredEmptyContainer } = await harness.renderAt({
      type: "boundary_exit",
    });
    expect(readRenderedRowAlertIds(filteredEmptyContainer)).toEqual([]);
    expect(filteredEmptyContainer.textContent).toContain("Showing 0 / 4");
    expect(filteredEmptyContainer.textContent).toContain(
      "No matching sandbox exceptions",
    );
    expect(filteredEmptyContainer.textContent).toContain(
      "No loaded sandbox exception alerts match the selected type filter. Reset the filter to view all loaded exceptions.",
    );
    expect(filteredEmptyContainer.textContent).not.toContain(
      "No sandbox exceptions",
    );
    expect(findSelectByLabelText(filteredEmptyContainer, "Type")?.value).toBe(
      "boundary_exit",
    );
    expect(
      findLinkByText(filteredEmptyContainer, "Reset")?.getAttribute("href"),
    ).toBe("/av-fallback/sandbox-exceptions");

    // 2. Actual no-data empty state: ROC returns 0 sandbox alerts
    harness.setAlerts([]);
    const { container: actualEmptyContainer } = await harness.renderAt({});
    expect(actualEmptyContainer.textContent).toContain("Showing 0 / 0");
    expect(actualEmptyContainer.textContent).toContain("No sandbox exceptions");
    expect(actualEmptyContainer.textContent).toContain(
      "ROC did not return any sandbox exception alerts for the current identity.",
    );
    expect(actualEmptyContainer.textContent).not.toContain(
      "No matching sandbox exceptions",
    );

    // 3. Load failure propagates truthfully rather than rendering fake empty state
    const failingHarness = createTestHarness({
      localeCookie: "en",
      failAlertsLoad: new Error("ROC upstream 503 unavailable"),
    });
    await expect(failingHarness.renderAt({})).rejects.toThrow(
      "ROC upstream 503 unavailable",
    );
  });

  it("renders Traditional Chinese (zh) labels via getServerLocale and preserves row write actions when filtered", async () => {
    const harness = createTestHarness({ localeCookie: "zh" });
    const { container } = await harness.renderAt({
      type: "provider_health",
    });

    expect(readRenderedRowAlertIds(container)).toEqual([
      "ex-alert-301",
      "ex-alert-304",
    ]);
    expect(container.textContent).toContain("沙盒例外");
    expect(container.textContent).toContain("顯示 2 / 4 筆");

    const select = findSelectByLabelText(container, "類型");
    expect(select).not.toBeNull();
    expect(select!.value).toBe("provider_health");
    expect(
      Array.from(select!.options).map((option) => ({
        value: option.value,
        label: option.textContent,
      })),
    ).toEqual([
      { value: "all", label: "全部類型" },
      { value: "takeover_discrepancy", label: "接管差異" },
      {
        value: "telemetry_drift_future_v2",
        label: "Telemetry Drift Future V2",
      },
      { value: "provider_health", label: "供應商健康" },
    ]);

    expect(findButtonByText(container, "套用")?.getAttribute("type")).toBe(
      "submit",
    );
    expect(findLinkByText(container, "重設")?.getAttribute("href")).toBe(
      "/av-fallback/sandbox-exceptions",
    );

    // Verify filtered-empty in zh
    const { container: zhFilteredEmpty } = await harness.renderAt({
      type: "boundary_exit",
    });
    expect(zhFilteredEmpty.textContent).toContain("顯示 0 / 4 筆");
    expect(zhFilteredEmpty.textContent).toContain("沒有符合篩選條件的沙盒例外");
    expect(zhFilteredEmpty.textContent).toContain(
      "目前載入的沙盒例外中沒有符合所選類型的項目；請重設篩選以檢視全部例外。",
    );

    // Re-render ?type=provider_health in zh and invoke enabled action on ex-alert-301
    const { container: actionContainer } = await harness.renderAt({
      type: "provider_health",
    });
    expect(harness.writeCalls).toEqual([]);

    const fallbackBtn = findButtonByText(actionContainer, "轉人駕");
    expect(fallbackBtn).not.toBeNull();
    await React.act(async () => {
      fallbackBtn!.click();
    });

    expect(harness.writeCalls).toEqual([
      {
        path: "/api/roc/alerts/ex-alert-301/fallback-to-human",
        body: { reason: "Sandbox 例外動作：ex-alert-301" },
      },
    ]);
    expect(actionContainer.textContent).toContain("稽核: aud-sandbox-301");
  });
});
