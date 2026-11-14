// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClientPkg from "@drts/api-client";
import { ApiClient } from "@drts/api-client";
import * as contracts from "@drts/contracts";
import type {
  ApiSuccessEnvelope,
  AttendanceRecord,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  GenerateDriverStatementCommand,
  IncidentRecord,
  PlatformPresenceSummary,
  ResourceActionDescriptor,
  ShiftRecord,
} from "@drts/contracts";
import * as uiWeb from "@drts/ui-web";
import type DriverDetailPageType from "../../app/drivers/[driverId]/page";
import * as apiClientLib from "../../lib/api-client";
import * as apiClientServerLib from "../../lib/api-client.server";
import * as canvasWorkflowLib from "../../lib/canvas-workflow";
import * as i18nLib from "../../lib/i18n";
import * as localizedLabelsLib from "../../lib/localized-labels";
import * as opsAnalyticsLib from "../../lib/ops-analytics";
import * as serverLocaleLib from "../../lib/server-locale";
import * as translationsLib from "../../lib/translations";

const { LanguageProvider, useTranslation } = i18nLib;
const { t: translate } = translationsLib;
const { formatOpsCodeLabel } = localizedLabelsLib;
type Locale = translationsLib.Locale;

const navState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  refresh: vi.fn(),
  push: vi.fn(),
  requestHeaders: {
    host: "localhost:3003",
    "x-forwarded-proto": "http",
  } as Record<string, string>,
  cookies: {
    "drts-locale-v2": "en",
  } as Record<string, string>,
}));

vi.mock("../../../../packages/contracts/src/unattended-voice", () => ({}));
vi.mock(
  "../../../../packages/contracts/src/voice-callback-operations",
  () => ({}),
);

vi.mock("next/headers", () => ({
  headers: async () => new Headers(navState.requestHeaders),
  cookies: async () => ({
    get: (name: string) =>
      name in navState.cookies
        ? { name, value: navState.cookies[name]! }
        : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useSearchParams: () => navState.searchParams,
  useRouter: () => ({
    refresh: navState.refresh,
    push: navState.push,
  }),
}));

function loadActualDriverDetailPage(): typeof DriverDetailPageType {
  const here = dirname(fileURLToPath(import.meta.url));
  const pagePath = resolve(here, "../../app/drivers/[driverId]/page.tsx");
  const cache = new Map<string, Record<string, unknown>>();

  const NextLink = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href: String(href), ...rest }, children);

  const moduleTable: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { __esModule: true, default: NextLink },
    "next/headers": {
      headers: async () => new Headers(navState.requestHeaders),
      cookies: async () => ({
        get: (name: string) =>
          name in navState.cookies
            ? { name, value: navState.cookies[name]! }
            : undefined,
      }),
    },
    "next/navigation": {
      notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
      },
      useSearchParams: () => navState.searchParams,
      useRouter: () => ({
        refresh: navState.refresh,
        push: navState.push,
      }),
    },
    "@drts/ui-web": uiWeb,
    "@drts/contracts": contracts,
    "@drts/api-client": apiClientPkg,
    "@/lib/api-client.server": apiClientServerLib,
    "../../../lib/api-client.server": apiClientServerLib,
    "@/lib/api-client": apiClientLib,
    "../../../lib/api-client": apiClientLib,
    "@/lib/i18n": i18nLib,
    "../../../lib/i18n": i18nLib,
    "@/lib/ops-analytics": opsAnalyticsLib,
    "../../../lib/ops-analytics": opsAnalyticsLib,
    "@/lib/localized-labels": localizedLabelsLib,
    "../../../lib/localized-labels": localizedLabelsLib,
    "@/lib/server-locale": serverLocaleLib,
    "../../../lib/server-locale": serverLocaleLib,
    "@/lib/translations": translationsLib,
    "../../../lib/translations": translationsLib,
    "@/lib/canvas-workflow": canvasWorkflowLib,
    "../../../lib/canvas-workflow": canvasWorkflowLib,
  };

  function resolveLocalFile(baseDir: string, request: string): string {
    const candidateBase = resolve(baseDir, request);
    for (const ext of ["", ".ts", ".tsx"]) {
      const fullPath = `${candidateBase}${ext}`;
      try {
        readFileSync(fullPath, "utf8");
        return fullPath;
      } catch {
        // try next extension
      }
    }
    throw new Error(
      `Cannot resolve local module "${request}" from "${baseDir}"`,
    );
  }

  function loadModule(filePath: string): Record<string, unknown> {
    const cached = cache.get(filePath);
    if (cached) {
      return cached;
    }

    const source = readFileSync(filePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;

    const mod = { exports: {} as Record<string, unknown> };
    cache.set(filePath, mod.exports);

    const customRequire = (id: string): unknown => {
      if (id in moduleTable) {
        return moduleTable[id];
      }
      if (id.startsWith("./") || id.startsWith("../")) {
        const resolved = resolveLocalFile(dirname(filePath), id);
        return loadModule(resolved);
      }
      throw new Error(`Unexpected module import in ${filePath}: ${id}`);
    };

    new Function("require", "module", "exports", transpiled)(
      customRequire,
      mod,
      mod.exports,
    );
    cache.set(filePath, mod.exports);
    return mod.exports;
  }

  const pageExports = loadModule(pagePath);
  return pageExports.default as typeof DriverDetailPageType;
}

type RecordedCall = {
  method: string;
  path: string;
  search: string;
  body: unknown;
  idempotencyKey: string | null;
  realm: string | null;
};

function makeSuccessEnvelope<T>(
  data: T,
  requestId: string,
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: "2026-11-14T11:45:00.000Z",
    },
  };
}

function makeDriverRecord(
  driverId = "DRV-8801",
  availableActions?: ResourceActionDescriptor[],
): DriverRegistryRecord & { availableActions?: ResourceActionDescriptor[] } {
  return {
    driverId,
    name: "Lin Chia-Hao",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "available",
    licensesValid: true,
    licenseExpiry: "2028-12-31",
    professionalDriverLicenseExpiry: "2028-12-31",
    taxiDriverRegistrationExpiry: "2028-12-31",
    lifecycleStatus: "active",
    eligibilityBlockedReasons: [],
    dispatchEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-11-14T11:00:00.000Z",
    activatedAt: "2026-01-02T00:00:00.000Z",
    suspendedAt: null,
    retiredAt: null,
    profileUpdatedAt: "2026-11-01T00:00:00.000Z",
    deviceBindings: [
      {
        bindingId: "BND-8801-A",
        deviceId: "DEV-8801-A",
        deviceLabel: "iPhone 16 Pro",
        status: "active",
        issuedAt: "2026-02-01T00:00:00.000Z",
        refreshedAt: "2026-11-14T11:00:00.000Z",
        revokedAt: null,
      },
    ],
    ...(availableActions ? { availableActions } : {}),
  };
}

function makeStatementRecord(
  driverId: string,
  periodMonth: string,
  suffix = "8801",
): DriverStatementRecord {
  const compactMonth = periodMonth.replace("-", "");
  return {
    statementId: `STMT-${driverId}-${compactMonth}`,
    driverId,
    periodMonth,
    receiptNo: `DRTS-STMT-${compactMonth}-${suffix}`,
    payoutStatus: "pending",
    grossEarning: { amountMinor: 1650000, currency: "TWD" },
    serviceFee: { amountMinor: 165000, currency: "TWD" },
    subsidy: { amountMinor: 0, currency: "TWD" },
    netAmount: { amountMinor: 1485000, currency: "TWD" },
    feePlanVersion: `${periodMonth}-v1`,
    lines: [
      {
        lineId: `LINE-${compactMonth}-1`,
        orderId: `ORD-${compactMonth}-101`,
        grossEarning: { amountMinor: 1650000, currency: "TWD" },
        serviceFee: { amountMinor: 165000, currency: "TWD" },
        subsidy: { amountMinor: 0, currency: "TWD" },
        netAmount: { amountMinor: 1485000, currency: "TWD" },
        reimbursementRequired: false,
      },
    ],
    createdAt: "2026-11-14T11:45:00.000Z",
    updatedAt: "2026-11-14T11:45:00.000Z",
  };
}

function makeDriverDetailFixtures(driverId = "DRV-8801") {
  const locations: DriverLocationSnapshot[] = [
    {
      driverId,
      lat: 25.033,
      lng: 121.5654,
      accuracyM: 8,
      recordedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const presence: PlatformPresenceSummary = {
    driverId,
    presences: [
      {
        driverId,
        platformCode: "grab_taiwan",
        accountId: "grab-acct-8801",
        status: "online",
        eligibility: "eligible",
        tokenExpiresAt: "2026-12-31T00:00:00.000Z",
        reauthRequired: false,
        lastOnlineAt: "2026-11-14T08:00:00.000Z",
        lastOfflineAt: null,
        lastHeartbeatAt: "2026-11-14T11:40:00.000Z",
        updatedAt: "2026-11-14T11:40:00.000Z",
      },
    ],
    adapterStatuses: [
      {
        platformCode: "grab_taiwan",
        status: "healthy",
        blockingReason: null,
        lastSyncAt: "2026-11-14T11:40:00.000Z",
      },
    ],
  };

  const tasks: DriverTaskRecord[] = [
    {
      taskId: "TSK-8801",
      orderId: "ORD-8801",
      dispatchJobId: "DJ-8801",
      assignmentId: "ASG-8801",
      driverId,
      vehicleId: "VEH-8801",
      sourcePlatform: null,
      routeProvided: true,
      waypoints: [],
      status: "on_trip",
      acceptedAt: "2026-11-14T10:00:00.000Z",
      departedAt: "2026-11-14T10:05:00.000Z",
      arrivedPickupAt: "2026-11-14T10:12:00.000Z",
      startedAt: "2026-11-14T10:15:00.000Z",
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
    },
  ];

  const forwardedOrders: ForwardedOrderRecord[] = [];

  const incidents: IncidentRecord[] = [
    {
      incidentId: "INC-8801",
      title: "Brake sensor warning",
      description: "Routine telemetry alert under inspection",
      category: "operational",
      severity: "medium",
      status: "open",
      relatedOrderId: "ORD-8801",
      relatedVehicleId: "VEH-8801",
      relatedDriverId: driverId,
      relatedComplaintCaseNo: null,
      reportedBy: driverId,
      assignedTo: "ops-user-1",
      escalationTarget: null,
      sourceDispatchExceptionOrderId: null,
      occurredAt: "2026-11-14T09:30:00.000Z",
      location: "Taipei Main Station",
      resolutionNote: null,
      serviceRecoveryActions: [],
      createdAt: "2026-11-14T09:30:00.000Z",
      updatedAt: "2026-11-14T09:35:00.000Z",
    },
  ];

  const shifts: ShiftRecord[] = [
    {
      shiftId: "SHF-8801",
      driverId,
      vehicleId: "VEH-8801",
      status: "active",
      clockedInAt: "2026-11-14T07:00:00.000Z",
      clockedOutAt: null,
      startLocation: "Neihu Depot",
      endLocation: null,
      startOdometer: 51200,
      endOdometer: null,
      notes: null,
      totalHours: null,
    },
  ];

  const attendance: AttendanceRecord[] = [
    {
      attendanceId: "ATT-8801",
      driverId,
      shiftId: "SHF-8801",
      date: "2026-11-14",
      clockedInAt: "2026-11-14T07:00:00.000Z",
      clockedOutAt: null,
      totalHours: null,
      status: "present",
    },
  ];

  return {
    locations,
    presence,
    tasks,
    forwardedOrders,
    incidents,
    shifts,
    attendance,
  };
}

function readHeader(
  headersInit: HeadersInit | undefined,
  headerName: string,
): string | null {
  if (!headersInit) {
    return null;
  }
  const normalized = headerName.toLowerCase();
  if (headersInit instanceof Headers) {
    return headersInit.get(headerName);
  }
  if (Array.isArray(headersInit)) {
    const found = headersInit.find(([key]) => key.toLowerCase() === normalized);
    return found ? found[1] : null;
  }
  for (const [key, value] of Object.entries(headersInit)) {
    if (key.toLowerCase() === normalized && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function LocaleSwitchControls() {
  const { locale, setLocale } = useTranslation();
  return (
    <div>
      <span data-testid="active-client-locale">{locale}</span>
      <button
        type="button"
        data-testid="switch-locale-en"
        onClick={() => setLocale("en")}
      >
        switch-en
      </button>
      <button
        type="button"
        data-testid="switch-locale-zh"
        onClick={() => setLocale("zh")}
      >
        switch-zh
      </button>
    </div>
  );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushAsync(cycles = 6) {
  for (let i = 0; i < cycles; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function unmountCurrentPage() {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  if (host) {
    host.remove();
    host = null;
  }
}

async function mountDriverDetailPage(
  locale: Locale,
  driverId = "DRV-8801",
): Promise<HTMLDivElement> {
  await unmountCurrentPage();
  navState.cookies["drts-locale-v2"] = locale;
  const DriverDetailPage = loadActualDriverDetailPage();
  const pageElement = await DriverDetailPage({
    params: Promise.resolve({ driverId }),
  });

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    flushSync(() => {
      root!.render(
        <LanguageProvider defaultLocale={locale}>
          <LocaleSwitchControls />
          {pageElement}
        </LanguageProvider>,
      );
    });
  });
  await flushAsync(8);
  return host;
}

function findGenerateStatementCta(
  container: HTMLElement,
  locale: Locale,
): HTMLElement {
  const byTestId = container.querySelector<HTMLElement>(
    '[data-testid="driver-statement-open-cta"]',
  );
  if (byTestId) {
    return byTestId;
  }
  const label = translate(
    "drivers.detailPage.action.generateStatement",
    locale,
  );
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>("button, a"),
  );
  const matched = candidates.find(
    (node) =>
      node.textContent?.trim() === label.trim() ||
      node.textContent?.includes(label.trim()),
  );
  if (!matched) {
    throw new Error(
      `Generate statement CTA "${label}" not found in DriverDetailPage`,
    );
  }
  return matched;
}

async function setInputValue(element: HTMLInputElement, value: string) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await flushAsync(8);
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  navState.searchParams = new URLSearchParams();
  navState.refresh.mockReset();
  navState.push.mockReset();
  navState.cookies = { "drts-locale-v2": "en" };
  process.env.DRTS_API_URL = "http://driver-statement-unit.invalid";
  window.__DRTS_RUNTIME_CONFIG__ = {
    apiBaseUrl: "http://driver-statement-unit.invalid",
  };
});

afterEach(async () => {
  await unmountCurrentPage();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["en", "zh"] as const)(
  "DriverDetailPage same-driver statement generation (%s)",
  (locale) => {
    it("replaces generic /reports CTA with explicit YYYY-MM generation, sends driverId/periodMonth + Idempotency-Key through ApiClient.generateDriverStatements, awaits unknown POST, and renders typed listDriverStatements readback from empty history while preserving all driver-detail sections", async () => {
      const driverId = "DRV-8801";
      const driver = makeDriverRecord(driverId);
      const fixtures = makeDriverDetailFixtures(driverId);
      let persistedStatements: DriverStatementRecord[] = [];
      const calls: RecordedCall[] = [];

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://driver-statement-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({
            method,
            path: url.pathname,
            search: url.search,
            body,
            idempotencyKey: readHeader(init?.headers, "idempotency-key"),
            realm: readHeader(init?.headers, "x-realm"),
          });

          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/drivers"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: [driver] }, "req-drivers"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/driver-locations"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.locations },
                "req-locations",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/platform-presence") {
            return Response.json(
              makeSuccessEnvelope(fixtures.presence, "req-presence"),
            );
          }
          if (method === "GET" && url.pathname === "/api/forwarder/orders") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.forwardedOrders },
                "req-forwarded",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver/tasks") {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.tasks }, "req-tasks"),
            );
          }
          if (method === "GET" && url.pathname === "/api/incidents") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.incidents },
                "req-incidents",
              ),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/shifts"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.shifts }, "req-shifts"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/attendance"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.attendance },
                "req-attendance",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver-statements") {
            const period = url.searchParams.get("period");
            const filtered = period
              ? persistedStatements.filter(
                  (item) => item.periodMonth === period,
                )
              : persistedStatements;
            return Response.json(
              makeSuccessEnvelope(
                { items: filtered.map((item) => ({ ...item })) },
                "req-statements-list",
              ),
            );
          }
          if (
            method === "POST" &&
            url.pathname === "/api/driver-statements/generate"
          ) {
            const cmd = body as GenerateDriverStatementCommand;
            const otherDriverStatement = makeStatementRecord(
              "DRV-OTHER",
              cmd.periodMonth,
              "9999",
            );
            const targetDriverStatement = makeStatementRecord(
              cmd.driverId ?? driverId,
              cmd.periodMonth,
              "8801",
            );
            persistedStatements = [otherDriverStatement, targetDriverStatement];
            // Return an opaque acknowledgement without `items` to verify the UI
            // awaits unknown POST and uses typed listDriverStatements(periodMonth)
            // rather than casting result.items.
            return Response.json(
              makeSuccessEnvelope({ acknowledged: true }, "req-stmt-gen-8801"),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const opsClient = apiClientLib.getOpsClient();
      expect(opsClient).toBeInstanceOf(ApiClient);
      expect(typeof opsClient.generateDriverStatements).toBe("function");
      expect(typeof opsClient.listDriverStatements).toBe("function");

      const container = await mountDriverDetailPage(locale, driverId);

      // Verify all existing driver-detail sections are preserved
      expect(container.textContent).toContain("DRV-8801");
      expect(container.textContent).toContain("grab-acct-8801");
      expect(container.textContent).toContain("ORD-8801");
      expect(container.textContent).toContain("SHF-8801");
      expect(container.textContent).toContain("INC-8801");
      expect(container.textContent).toContain("Brake sensor warning");
      expect(container.textContent).toContain(
        translate("drivers.detailPage.card.noStatements", locale),
      );

      // Verify the Generate statement CTA is a real button, not a /reports link
      const cta = findGenerateStatementCta(container, locale);
      expect(cta.tagName).toBe("BUTTON");
      expect(cta.getAttribute("href")).toBeNull();

      await clickElement(cta);

      const form = container.querySelector<HTMLFormElement>(
        '[data-testid="driver-statement-form"]',
      );
      expect(form).not.toBeNull();
      expect(
        container.querySelector(
          '[data-testid="driver-statement-target-driver"]',
        )?.textContent,
      ).toBe("DRV-8801");

      const periodInput = container.querySelector<HTMLInputElement>(
        '[data-testid="driver-statement-period-input"]',
      );
      expect(periodInput).not.toBeNull();
      expect(periodInput!.value).toBe("");

      await setInputValue(periodInput!, "2026-03");

      const submitBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-submit-btn"]',
      );
      expect(submitBtn).not.toBeNull();
      await clickElement(submitBtn!);

      const postCalls = calls.filter(
        (call) =>
          call.method === "POST" &&
          call.path === "/api/driver-statements/generate",
      );
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0]?.body).toEqual({
        driverId: "DRV-8801",
        periodMonth: "2026-03",
      });
      expect(postCalls[0]?.idempotencyKey).toEqual(
        expect.stringMatching(/^ops-driver-stmt-DRV-8801-2026-03-/),
      );
      expect(postCalls[0]?.realm).toBe("ops");

      const readbackCalls = calls.filter(
        (call) =>
          call.method === "GET" &&
          call.path === "/api/driver-statements" &&
          call.search === "?period=2026-03",
      );
      expect(readbackCalls).toHaveLength(1);

      const receipt = container.querySelector<HTMLElement>(
        '[data-testid="driver-statement-receipt"]',
      );
      expect(receipt).not.toBeNull();
      expect(receipt!.textContent).toContain("STMT-DRV-8801-202603");
      expect(receipt!.textContent).toContain("DRV-8801");
      expect(receipt!.textContent).toContain("2026-03");
      expect(receipt!.textContent).toContain("DRTS-STMT-202603-8801");
      expect(receipt!.textContent).toContain("2026-03-v1");
      expect(receipt!.textContent).toContain(
        "/api/driver-statements?period=2026-03",
      );
      expect(receipt!.textContent).not.toContain("STMT-DRV-OTHER-202603");

      // Empty history state is replaced by the read-back statement row in the table
      expect(container.textContent).not.toContain(
        translate("drivers.detailPage.card.noStatements", locale),
      );
      expect(container.textContent).toContain("DRTS-STMT-202603-8801");
      expect(container.textContent).not.toContain("DRTS-STMT-202603-9999");
    });

    it("does not assume latest-history month, cancels without submitting, and respects disabled generate_statement descriptor", async () => {
      const driverId = "DRV-8801";
      let currentDriver = makeDriverRecord(driverId);
      const fixtures = makeDriverDetailFixtures(driverId);
      const existingStatement = makeStatementRecord(
        driverId,
        "2026-01",
        "8801",
      );
      const calls: RecordedCall[] = [];

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://driver-statement-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({
            method,
            path: url.pathname,
            search: url.search,
            body,
            idempotencyKey: readHeader(init?.headers, "idempotency-key"),
            realm: readHeader(init?.headers, "x-realm"),
          });

          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/drivers"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: [currentDriver] }, "req-drivers"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/driver-locations"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.locations },
                "req-locations",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/platform-presence") {
            return Response.json(
              makeSuccessEnvelope(fixtures.presence, "req-presence"),
            );
          }
          if (method === "GET" && url.pathname === "/api/forwarder/orders") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.forwardedOrders },
                "req-forwarded",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver/tasks") {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.tasks }, "req-tasks"),
            );
          }
          if (method === "GET" && url.pathname === "/api/incidents") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.incidents },
                "req-incidents",
              ),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/shifts"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.shifts }, "req-shifts"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/attendance"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.attendance },
                "req-attendance",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver-statements") {
            return Response.json(
              makeSuccessEnvelope(
                { items: [existingStatement] },
                "req-statements",
              ),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountDriverDetailPage(locale, driverId);
      expect(container.textContent).toContain("DRTS-STMT-202601-8801");

      const cta = findGenerateStatementCta(container, locale);
      await clickElement(cta);

      const periodInput = container.querySelector<HTMLInputElement>(
        '[data-testid="driver-statement-period-input"]',
      );
      expect(periodInput).not.toBeNull();
      // Must not assume latest history month "2026-01"
      expect(periodInput!.value).toBe("");

      // Submitting with blank month shows validation feedback and does not call POST
      const submitBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-submit-btn"]',
      );
      await clickElement(submitBtn!);
      expect(
        container.querySelector('[data-testid="driver-statement-error"]'),
      ).not.toBeNull();
      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.path === "/api/driver-statements/generate",
        ),
      ).toHaveLength(0);

      // Entering a month and clicking Cancel closes the form without submitting
      await setInputValue(periodInput!, "2026-02");
      const cancelBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-cancel-btn"]',
      );
      expect(cancelBtn).not.toBeNull();
      await clickElement(cancelBtn!);

      expect(
        container.querySelector('[data-testid="driver-statement-form"]'),
      ).toBeNull();
      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.path === "/api/driver-statements/generate",
        ),
      ).toHaveLength(0);

      // Disabled action descriptor prevents opening or submitting
      currentDriver = makeDriverRecord(driverId, [
        {
          action: "generate_statement",
          enabled: false,
          riskLevel: "low",
          disabledReasonCode: "billing_freeze",
        },
      ]);
      const disabledContainer = await mountDriverDetailPage(locale, driverId);
      const disabledCta = findGenerateStatementCta(disabledContainer, locale);
      expect((disabledCta as HTMLButtonElement).disabled).toBe(true);
      expect(disabledCta.getAttribute("title")).toBe(
        formatOpsCodeLabel(locale, "billing_freeze"),
      );
      await clickElement(disabledCta);
      expect(
        disabledContainer.querySelector(
          '[data-testid="driver-statement-form"]',
        ),
      ).toBeNull();
    });

    it("suppresses duplicate submissions while busy and completes single in-flight generation and readback", async () => {
      const driverId = "DRV-8801";
      const driver = makeDriverRecord(driverId);
      const fixtures = makeDriverDetailFixtures(driverId);
      let persistedStatements: DriverStatementRecord[] = [];
      const calls: RecordedCall[] = [];
      let releasePost: (() => void) | null = null;

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://driver-statement-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({
            method,
            path: url.pathname,
            search: url.search,
            body,
            idempotencyKey: readHeader(init?.headers, "idempotency-key"),
            realm: readHeader(init?.headers, "x-realm"),
          });

          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/drivers"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: [driver] }, "req-drivers"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/driver-locations"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.locations },
                "req-locations",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/platform-presence") {
            return Response.json(
              makeSuccessEnvelope(fixtures.presence, "req-presence"),
            );
          }
          if (method === "GET" && url.pathname === "/api/forwarder/orders") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.forwardedOrders },
                "req-forwarded",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver/tasks") {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.tasks }, "req-tasks"),
            );
          }
          if (method === "GET" && url.pathname === "/api/incidents") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.incidents },
                "req-incidents",
              ),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/shifts"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.shifts }, "req-shifts"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/attendance"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.attendance },
                "req-attendance",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver-statements") {
            const period = url.searchParams.get("period");
            const filtered = period
              ? persistedStatements.filter(
                  (item) => item.periodMonth === period,
                )
              : persistedStatements;
            return Response.json(
              makeSuccessEnvelope({ items: filtered }, "req-statements"),
            );
          }
          if (
            method === "POST" &&
            url.pathname === "/api/driver-statements/generate"
          ) {
            await new Promise<void>((resolvePromise) => {
              releasePost = resolvePromise;
            });
            persistedStatements = [
              makeStatementRecord(driverId, "2026-04", "8801"),
            ];
            return Response.json(
              makeSuccessEnvelope(
                { acknowledged: true },
                "req-stmt-gen-202604",
              ),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountDriverDetailPage(locale, driverId);
      const cta = findGenerateStatementCta(container, locale);
      await clickElement(cta);

      const periodInput = container.querySelector<HTMLInputElement>(
        '[data-testid="driver-statement-period-input"]',
      );
      expect(periodInput).not.toBeNull();
      await setInputValue(periodInput!, "2026-04");

      const submitBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-submit-btn"]',
      );
      expect(submitBtn).not.toBeNull();

      await clickElement(submitBtn!);
      expect(
        container.querySelector('[data-testid="driver-statement-busy"]'),
      ).not.toBeNull();
      expect(submitBtn!.disabled).toBe(true);

      // Attempt duplicate submissions while in-flight
      await clickElement(submitBtn!);
      await clickElement(cta);
      const form = container.querySelector<HTMLFormElement>(
        '[data-testid="driver-statement-form"]',
      );
      await act(async () => {
        form?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await flushAsync(4);

      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.path === "/api/driver-statements/generate",
        ),
      ).toHaveLength(1);

      await act(async () => {
        releasePost?.();
      });
      await flushAsync(8);

      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.path === "/api/driver-statements/generate",
        ),
      ).toHaveLength(1);
      expect(
        container.querySelector('[data-testid="driver-statement-receipt"]')
          ?.textContent,
      ).toContain("STMT-DRV-8801-202604");
    });

    it("surfaces genuine validation, no-eligible, 403, 5xx, and readback-missing errors, retains the same Idempotency-Key across retries of the same intent, and mints a new key when periodMonth changes", async () => {
      const driverId = "DRV-8801";
      const driver = makeDriverRecord(driverId);
      const fixtures = makeDriverDetailFixtures(driverId);
      let persistedStatements: DriverStatementRecord[] = [];
      const calls: RecordedCall[] = [];
      let postAttempt = 0;

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://driver-statement-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({
            method,
            path: url.pathname,
            search: url.search,
            body,
            idempotencyKey: readHeader(init?.headers, "idempotency-key"),
            realm: readHeader(init?.headers, "x-realm"),
          });

          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/drivers"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: [driver] }, "req-drivers"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/regulatory-registry/driver-locations"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.locations },
                "req-locations",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/platform-presence") {
            return Response.json(
              makeSuccessEnvelope(fixtures.presence, "req-presence"),
            );
          }
          if (method === "GET" && url.pathname === "/api/forwarder/orders") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.forwardedOrders },
                "req-forwarded",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver/tasks") {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.tasks }, "req-tasks"),
            );
          }
          if (method === "GET" && url.pathname === "/api/incidents") {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.incidents },
                "req-incidents",
              ),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/shifts"
          ) {
            return Response.json(
              makeSuccessEnvelope({ items: fixtures.shifts }, "req-shifts"),
            );
          }
          if (
            method === "GET" &&
            url.pathname === "/api/shift-attendance/attendance"
          ) {
            return Response.json(
              makeSuccessEnvelope(
                { items: fixtures.attendance },
                "req-attendance",
              ),
            );
          }
          if (method === "GET" && url.pathname === "/api/driver-statements") {
            const period = url.searchParams.get("period");
            const filtered = period
              ? persistedStatements.filter(
                  (item) => item.periodMonth === period,
                )
              : persistedStatements;
            return Response.json(
              makeSuccessEnvelope({ items: filtered }, "req-statements"),
            );
          }
          if (
            method === "POST" &&
            url.pathname === "/api/driver-statements/generate"
          ) {
            postAttempt += 1;
            const cmd = body as GenerateDriverStatementCommand;

            if (postAttempt === 1) {
              return Response.json(
                {
                  error: {
                    code: "VALIDATION_ERROR",
                    message:
                      "No eligible trips found for the requested statement period.",
                    retryable: false,
                    traceId: "trace-no-eligible",
                  },
                },
                { status: 400 },
              );
            }
            if (postAttempt === 2) {
              return Response.json(
                {
                  error: {
                    code: "VALIDATION_ERROR",
                    message: "An active published driver fee plan is required.",
                    retryable: false,
                    traceId: "trace-fee-plan",
                  },
                },
                { status: 400 },
              );
            }
            if (postAttempt === 3) {
              return Response.json(
                {
                  error: {
                    code: "FORBIDDEN",
                    message:
                      "Missing billing:write permission for statement generation.",
                    retryable: false,
                    traceId: "trace-403",
                  },
                },
                { status: 403 },
              );
            }
            if (postAttempt === 4) {
              return Response.json(
                {
                  error: {
                    code: "SERVICE_UNAVAILABLE",
                    message:
                      "Billing settlement persistence temporarily unavailable.",
                    retryable: true,
                    traceId: "trace-503",
                  },
                },
                { status: 503 },
              );
            }
            if (postAttempt === 5) {
              // POST succeeds, but readback only has a different driver's statement
              persistedStatements = [
                makeStatementRecord("DRV-OTHER", cmd.periodMonth, "9999"),
              ];
              return Response.json(
                makeSuccessEnvelope({ acknowledged: true }, "req-attempt-5"),
              );
            }

            // Attempts 6+ succeed with matching driver and month readback
            persistedStatements = [
              makeStatementRecord(driverId, cmd.periodMonth, "8801"),
            ];
            return Response.json(
              makeSuccessEnvelope({ acknowledged: true }, "req-attempt-ok"),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountDriverDetailPage(locale, driverId);
      const cta = findGenerateStatementCta(container, locale);
      await clickElement(cta);

      const periodInput = container.querySelector<HTMLInputElement>(
        '[data-testid="driver-statement-period-input"]',
      );
      expect(periodInput).not.toBeNull();
      await setInputValue(periodInput!, "2026-05");

      const submitBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-submit-btn"]',
      );
      expect(submitBtn).not.toBeNull();

      // Attempt 1: no-eligible 400 error
      await clickElement(submitBtn!);
      const errorBox1 = container.querySelector<HTMLElement>(
        '[data-testid="driver-statement-error"]',
      );
      expect(errorBox1).not.toBeNull();
      expect(errorBox1!.textContent).toContain(
        "No eligible trips found for the requested statement period.",
      );
      expect(
        container.querySelector('[data-testid="driver-statement-receipt"]'),
      ).toBeNull();

      // Attempt 2: retry same intent -> fee plan validation 400 error
      const retryBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-retry-btn"]',
      );
      expect(retryBtn).not.toBeNull();
      await clickElement(retryBtn!);
      expect(
        container.querySelector('[data-testid="driver-statement-error"]')
          ?.textContent,
      ).toContain("An active published driver fee plan is required.");

      // Attempt 3: retry same intent -> 403 forbidden error
      await clickElement(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="driver-statement-retry-btn"]',
        )!,
      );
      expect(
        container.querySelector('[data-testid="driver-statement-error"]')
          ?.textContent,
      ).toContain("Missing billing:write permission for statement generation.");

      // Attempt 4: retry same intent -> 503 server error
      await clickElement(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="driver-statement-retry-btn"]',
        )!,
      );
      expect(
        container.querySelector('[data-testid="driver-statement-error"]')
          ?.textContent,
      ).toContain("Billing settlement persistence temporarily unavailable.");

      // Attempt 5: retry same intent -> POST 200 but readback missing for DRV-8801
      await clickElement(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="driver-statement-retry-btn"]',
        )!,
      );
      const readbackMissingText =
        container.querySelector('[data-testid="driver-statement-error"]')
          ?.textContent ?? "";
      expect(readbackMissingText).toContain("DRV-8801");
      expect(readbackMissingText).toContain("2026-05");
      expect(
        container.querySelector('[data-testid="driver-statement-receipt"]'),
      ).toBeNull();

      // Attempt 6: retry same intent -> succeeds with matching readback
      await clickElement(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="driver-statement-retry-btn"]',
        )!,
      );
      expect(
        container.querySelector('[data-testid="driver-statement-error"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="driver-statement-receipt"]')
          ?.textContent,
      ).toContain("STMT-DRV-8801-202605");

      const postCallsSameIntent = calls.filter(
        (call) =>
          call.method === "POST" &&
          call.path === "/api/driver-statements/generate",
      );
      expect(postCallsSameIntent).toHaveLength(6);
      const firstIntentKey = postCallsSameIntent[0]?.idempotencyKey;
      expect(firstIntentKey).toEqual(
        expect.stringMatching(/^ops-driver-stmt-DRV-8801-2026-05-/),
      );
      for (const call of postCallsSameIntent) {
        expect(call.idempotencyKey).toBe(firstIntentKey);
      }

      // Attempt 7: changing month to 2026-06 creates a distinct idempotency key
      await setInputValue(periodInput!, "2026-06");
      await clickElement(submitBtn!);

      const allPostCalls = calls.filter(
        (call) =>
          call.method === "POST" &&
          call.path === "/api/driver-statements/generate",
      );
      expect(allPostCalls).toHaveLength(7);
      const newIntentKey = allPostCalls[6]?.idempotencyKey;
      expect(newIntentKey).toEqual(
        expect.stringMatching(/^ops-driver-stmt-DRV-8801-2026-06-/),
      );
      expect(newIntentKey).not.toBe(firstIntentKey);
      expect(
        container.querySelector('[data-testid="driver-statement-receipt"]')
          ?.textContent,
      ).toContain("STMT-DRV-8801-202606");
    });
  },
);

describe("DriverDetailPage statement generation locale switching coherence", () => {
  it("preserves chosen driver/month, active error, retained Idempotency-Key, and readback receipt across en <-> zh locale switches without resubmitting", async () => {
    const driverId = "DRV-8801";
    const driver = makeDriverRecord(driverId);
    const fixtures = makeDriverDetailFixtures(driverId);
    let persistedStatements: DriverStatementRecord[] = [];
    const calls: RecordedCall[] = [];
    let shouldFailPost = true;

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          String(input),
          "http://driver-statement-unit.invalid",
        );
        const method = (init?.method ?? "GET").toUpperCase();
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({
          method,
          path: url.pathname,
          search: url.search,
          body,
          idempotencyKey: readHeader(init?.headers, "idempotency-key"),
          realm: readHeader(init?.headers, "x-realm"),
        });

        if (
          method === "GET" &&
          url.pathname === "/api/regulatory-registry/drivers"
        ) {
          return Response.json(
            makeSuccessEnvelope({ items: [driver] }, "req-drivers"),
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/api/regulatory-registry/driver-locations"
        ) {
          return Response.json(
            makeSuccessEnvelope({ items: fixtures.locations }, "req-locations"),
          );
        }
        if (method === "GET" && url.pathname === "/api/platform-presence") {
          return Response.json(
            makeSuccessEnvelope(fixtures.presence, "req-presence"),
          );
        }
        if (method === "GET" && url.pathname === "/api/forwarder/orders") {
          return Response.json(
            makeSuccessEnvelope(
              { items: fixtures.forwardedOrders },
              "req-forwarded",
            ),
          );
        }
        if (method === "GET" && url.pathname === "/api/driver/tasks") {
          return Response.json(
            makeSuccessEnvelope({ items: fixtures.tasks }, "req-tasks"),
          );
        }
        if (method === "GET" && url.pathname === "/api/incidents") {
          return Response.json(
            makeSuccessEnvelope({ items: fixtures.incidents }, "req-incidents"),
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/api/shift-attendance/shifts"
        ) {
          return Response.json(
            makeSuccessEnvelope({ items: fixtures.shifts }, "req-shifts"),
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/api/shift-attendance/attendance"
        ) {
          return Response.json(
            makeSuccessEnvelope(
              { items: fixtures.attendance },
              "req-attendance",
            ),
          );
        }
        if (method === "GET" && url.pathname === "/api/driver-statements") {
          const period = url.searchParams.get("period");
          const filtered = period
            ? persistedStatements.filter((item) => item.periodMonth === period)
            : persistedStatements;
          return Response.json(
            makeSuccessEnvelope({ items: filtered }, "req-statements"),
          );
        }
        if (
          method === "POST" &&
          url.pathname === "/api/driver-statements/generate"
        ) {
          const cmd = body as GenerateDriverStatementCommand;
          if (shouldFailPost) {
            return Response.json(
              {
                error: {
                  code: "VALIDATION_ERROR",
                  message:
                    "No eligible trips found for the requested statement period.",
                  retryable: false,
                  traceId: "trace-locale-fail",
                },
              },
              { status: 400 },
            );
          }
          persistedStatements = [
            makeStatementRecord(driverId, cmd.periodMonth, "8801"),
          ];
          return Response.json(
            makeSuccessEnvelope({ acknowledged: true }, "req-locale-ok"),
          );
        }

        throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const container = await mountDriverDetailPage("en", driverId);
    const cta = findGenerateStatementCta(container, "en");
    await clickElement(cta);

    const periodInput = container.querySelector<HTMLInputElement>(
      '[data-testid="driver-statement-period-input"]',
    );
    expect(periodInput).not.toBeNull();
    await setInputValue(periodInput!, "2026-07");

    const submitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="driver-statement-submit-btn"]',
    );
    await clickElement(submitBtn!);

    const postCallsAfterFail = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/driver-statements/generate",
    );
    expect(postCallsAfterFail).toHaveLength(1);
    const originalIntentKey = postCallsAfterFail[0]?.idempotencyKey;
    expect(
      container.querySelector('[data-testid="driver-statement-error"]')
        ?.textContent,
    ).toContain("No eligible trips for statement period (DRV-8801 · 2026-07)");

    // Switch locale from en -> zh without resubmitting
    await clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="switch-locale-zh"]',
      )!,
    );

    expect(
      calls.filter(
        (call) =>
          call.method === "POST" &&
          call.path === "/api/driver-statements/generate",
      ),
    ).toHaveLength(1);
    expect(periodInput!.value).toBe("2026-07");
    expect(
      container.querySelector('[data-testid="driver-statement-target-driver"]')
        ?.textContent,
    ).toBe("DRV-8801");
    expect(
      container.querySelector('[data-testid="driver-statement-error"]')
        ?.textContent,
    ).toContain("指定對帳月份無符合資格行程（DRV-8801 · 2026-07）");

    // Retry same intent in zh -> reuses originalIntentKey and succeeds
    shouldFailPost = false;
    await clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="driver-statement-retry-btn"]',
      )!,
    );

    const postCallsAfterRetry = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/driver-statements/generate",
    );
    expect(postCallsAfterRetry).toHaveLength(2);
    expect(postCallsAfterRetry[1]?.idempotencyKey).toBe(originalIntentKey);

    const receiptZh = container.querySelector<HTMLElement>(
      '[data-testid="driver-statement-receipt"]',
    );
    expect(receiptZh).not.toBeNull();
    expect(receiptZh!.textContent).toContain(
      "司機對帳單已產生並完成清單讀回核對",
    );
    expect(receiptZh!.textContent).toContain("STMT-DRV-8801-202607");
    expect(receiptZh!.textContent).toContain("DRTS-STMT-202607-8801");

    // Switch locale back from zh -> en without resubmitting
    await clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="switch-locale-en"]',
      )!,
    );

    expect(
      calls.filter(
        (call) =>
          call.method === "POST" &&
          call.path === "/api/driver-statements/generate",
      ),
    ).toHaveLength(2);
    expect(periodInput!.value).toBe("2026-07");
    const receiptEn = container.querySelector<HTMLElement>(
      '[data-testid="driver-statement-receipt"]',
    );
    expect(receiptEn).not.toBeNull();
    expect(receiptEn!.textContent).toContain(
      "Driver statement generated and verified via list readback",
    );
    expect(receiptEn!.textContent).toContain("STMT-DRV-8801-202607");
    expect(receiptEn!.textContent).toContain("DRTS-STMT-202607-8801");
  });
});
