import { resolve } from "node:path";
import * as React from "react";
import * as tokens from "@drts/ui-tokens";
import * as contracts from "@drts/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ts from "typescript";
import { createUiModuleLoader } from "../../../../tests/unit/system-remediation/sr-wire-001/ui-module-loader";

it("production TypeScript graph keeps bank sources without repository test helpers", () => {
  const appRoot = resolve(__dirname, "../..");
  const repositoryTests = `${resolve(appRoot, "../../tests")}/`;
  // Docker copies the app and packages, but does not copy repository-root tests.
  // Only that filesystem boundary is simulated; TypeScript builds the real graph.
  const system = {
    ...ts.sys,
    fileExists: (file: string) =>
      !file.startsWith(repositoryTests) && ts.sys.fileExists(file),
    readFile: (file: string) =>
      file.startsWith(repositoryTests) ? undefined : ts.sys.readFile(file),
  };
  const config = ts.readConfigFile(
    resolve(appRoot, "tsconfig.json"),
    system.readFile,
  );
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, system, appRoot);
  expect(parsed.errors).toEqual([]);
  const host = ts.createCompilerHost(parsed.options);
  host.fileExists = system.fileExists;
  host.readFile = system.readFile;
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  const files = program.getSourceFiles().map((file) => file.fileName);
  for (const source of [
    "app/bookings/page.tsx",
    "app/bookings/[bookingId]/page.tsx",
    "lib/bank-bookings-data.ts",
    "proxy.ts",
  ]) {
    expect(files).toContain(resolve(appRoot, source));
  }
  expect(files.filter((file) => file.startsWith(`${appRoot}/tests/`))).toEqual(
    [],
  );
  expect(files.filter((file) => file.startsWith(repositoryTests))).toEqual([]);
});

const identity = {
  accessToken: "private-session-token",
  tenantId: "tenant_acme",
  userId: "verified-member",
  roleCodes: ["tenant_admin"],
  scopes: ["tenant:read"],
  displayRole: "bank_ops_viewer",
};
const getIdentity = vi.fn(async () => identity);
const request = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
function formalOrder(index = 1) {
  return {
    order_id: `ord_${index}`,
    order_no: `FORMAL-${index}`,
    tenant_id: identity.tenantId,
    order_domain: "owned",
    service_bucket: "business_dispatch",
    business_dispatch_subtype: "credit_card_airport_transfer",
    partner_program_id: "program_1",
    status: "assigned",
    direction: "dropoff",
    pickup: {
      address: "Legitimate owner address",
      masked_address: "City ••••",
    },
    dropoff: { address: "Airport T2", masked_address: "Airport ••••" },
    passenger: { name: "Private Cardholder", phone: "0912345678" },
    created_at: "2026-10-01T01:00:00Z",
    updated_at: "2026-10-02T02:00:00Z",
    reservation_window_start: "2026-10-18T03:00:00Z",
    flight_no: "XY101",
    terminal: "T2",
    benefit_reference: "BEN-TENANT-0123",
    issuer_authorization_ref: "AUTH-TENANT-0456",
    approval_state: "approved",
    notes: null,
  };
}
function envelope(items: unknown[]) {
  return new Response(JSON.stringify({ data: { items } }));
}
function loadPages() {
  const load = createUiModuleLoader(resolve(__dirname, "../.."), {
    "server-only": {},
    react: React,
    "@drts/contracts": contracts,
    "@drts/control-plane-auth": {},
    "@drts/ui-tokens": tokens,
    "@drts/ui-web": {
      DataTable: ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          "table",
          null,
          React.createElement("tbody", null, children),
        ),
      Tr: ({ children }: { children: React.ReactNode }) =>
        React.createElement("tr", null, children),
      Td: ({ children }: { children: React.ReactNode }) =>
        React.createElement("td", null, children),
      CanvasPill: ({ children }: { children: React.ReactNode }) =>
        React.createElement("span", null, children),
    },
    "next/link": {
      __esModule: true,
      default: ({
        children,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
        React.createElement("a", props, children),
    },
    "next/navigation": { notFound },
    "@/lib/bank-user-identity": { getBankUserIdentity: getIdentity },
    "./bank-user-identity": { getBankUserIdentity: getIdentity },
    "@drts/tenant-auth/api-fetch": {
      resolveTenantApiUrl: () => "https://api.example",
      tenantAuthFetch: request,
    },
  });
  type Props = {
    searchParams?: Promise<Record<string, string>>;
    params: Promise<{ bookingId: string }>;
  };
  return {
    list: load<{ default(p: Partial<Props>): Promise<React.ReactElement> }>(
      resolve(__dirname, "../../app/bookings/page.tsx"),
    ).default,
    detail: load<{ default(p: Props): Promise<React.ReactElement> }>(
      resolve(__dirname, "../../app/bookings/[bookingId]/page.tsx"),
    ).default,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  getIdentity.mockResolvedValue(identity);
  request.mockImplementation(async (url: string) =>
    envelope(
      String(url).includes("service-programs")
        ? [
            {
              program_id: "program_1",
              tenant_id: identity.tenantId,
              display_name: "Formal program",
            },
          ]
        : [formalOrder()],
    ),
  );
  // Old reader is exercised against the same formal envelopes for before/fixed-after.
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());
it("mounted list reads formal wire with verified identity despite foreign display selectors", async () => {
  const html = renderToStaticMarkup(
    await loadPages().list({
      searchParams: Promise.resolve({
        bank: "contoso",
        role: "bank_program_admin",
        locale: "en",
      }),
    }),
  );
  expect(getIdentity).toHaveBeenCalledOnce();
  expect(html).toContain("FORMAL-1");
  expect(html).toContain("Formal program");
  expect(html).toContain("City ••••");
  expect(html).not.toContain("Legitimate owner address");
  expect(html).not.toContain(identity.accessToken);
  expect(html).not.toContain("0912345678");
  expect(html).not.toContain("Private Cardholder");
  expect(
    request.mock.calls.every(
      ([, init]) =>
        init.headers.Authorization === `Bearer ${identity.accessToken}` &&
        init.headers["x-tenant-id"] === identity.tenantId,
    ),
  ).toBe(true);
});
it("mounted pages deny expired/revoked identity without requesting orders or claiming not-found", async () => {
  getIdentity.mockRejectedValue(new Error("expired"));
  const pages = loadPages();
  const html = renderToStaticMarkup(await pages.list({}));
  const detail = renderToStaticMarkup(
    await pages.detail({ params: Promise.resolve({ bookingId: "ord_1" }) }),
  );
  expect(request).not.toHaveBeenCalled();
  expect(notFound).not.toHaveBeenCalled();
  expect(html).toContain('role="alert"');
  expect(detail).toContain('role="alert"');
});
it("mounted detail distinguishes upstream outage from authoritative missing", async () => {
  request.mockResolvedValue(new Response("private error", { status: 503 }));
  const pages = loadPages();
  expect(
    renderToStaticMarkup(
      await pages.detail({ params: Promise.resolve({ bookingId: "ord_1" }) }),
    ),
  ).toContain('role="alert"');
  expect(notFound).not.toHaveBeenCalled();
});
it("mounted list pages the full filtered dataset and preserves filters on navigation and detail return", async () => {
  request.mockImplementation(async (url: string) =>
    envelope(
      String(url).includes("service-programs")
        ? []
        : Array.from({ length: 61 }, (_, i) => formalOrder(i + 1)),
    ),
  );
  const pages = loadPages();
  const search = {
    locale: "en",
    program: "program_1",
    direction: "outbound",
    state: "assigned",
    period: "2026-10",
    cardholder: "09",
    page: "2",
  };
  const html = renderToStaticMarkup(
    await pages.list({ searchParams: Promise.resolve(search) }),
  );
  expect(html).toContain("FORMAL-26</a>");
  expect(html).toContain("FORMAL-50</a>");
  expect(html).not.toContain("FORMAL-1</a>");
  expect(html).not.toContain("FORMAL-51</a>");
  const paginationHtml = html.match(
    /<nav aria-label="Booking pages">(.*?)<\/nav>/,
  )?.[1];
  expect(paginationHtml).toContain("page=1");
  expect(paginationHtml).toContain("page=3");
  for (const filter of [
    "program=program_1",
    "direction=outbound",
    "period=2026-10",
    "cardholder=09",
    "state=assigned",
  ])
    expect(paginationHtml).toContain(filter);
  const detail = renderToStaticMarkup(
    await pages.detail({
      params: Promise.resolve({ bookingId: "ord_26" }),
      searchParams: Promise.resolve(search),
    }),
  );
  expect(detail).toContain("FORMAL-26");
  expect(detail).toContain("page=2");
  expect(detail).toContain("program=program_1");
});

it("only a successful canonical empty detail lookup yields not-found", async () => {
  request.mockImplementation(async () => envelope([]));
  await expect(
    loadPages().detail({ params: Promise.resolve({ bookingId: "missing" }) }),
  ).rejects.toThrow("NOT_FOUND");
  expect(notFound).toHaveBeenCalledOnce();
  const html = renderToStaticMarkup(
    await loadPages().list({ searchParams: Promise.resolve({ locale: "en" }) }),
  );
  expect(html).not.toContain("FORMAL-");
  expect(html).not.toContain("BK-2406");
  expect(html).not.toContain('role="alert"');
});

it.each([401, 403, 503])(
  "mounted detail reports HTTP %i without not-found or body leakage",
  async (status) => {
    request.mockImplementation(
      async () => new Response("sensitive upstream text", { status }),
    );
    const html = renderToStaticMarkup(
      await loadPages().detail({
        params: Promise.resolve({ bookingId: "ord_1" }),
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("sensitive");
    expect(notFound).not.toHaveBeenCalled();
  },
);

it("mounted tabs retain every other filter and count the full scope before pagination", async () => {
  request.mockImplementation(async (url: string) =>
    envelope(
      String(url).includes("service-programs")
        ? []
        : Array.from({ length: 6 }, (_, i) => ({
            ...formalOrder(i + 1),
            status: i < 2 ? "assigned" : "completed",
          })),
    ),
  );
  const html = renderToStaticMarkup(
    await loadPages().list({
      searchParams: Promise.resolve({
        locale: "en",
        program: "program_1",
        direction: "outbound",
        period: "2026-10",
        cardholder: "09",
        state: "assigned",
        page: "999",
        pageSize: "10",
      }),
    }),
  );
  expect(html).toContain('All</span><span class="users-filter-badge">6');
  expect(html).toContain('Assigned</span><span class="users-filter-badge">2');
  expect(html).toContain('Completed</span><span class="users-filter-badge">4');
  expect(html).toContain("FORMAL-1</a>");
  expect(html).toContain("FORMAL-2</a>");
  expect(html).not.toContain("FORMAL-3</a>");
  const tabHref = html.match(/href="([^"]*state=completed[^"]*)"/)?.[1];
  for (const filter of [
    "program=program_1",
    "direction=outbound",
    "period=2026-10",
    "cardholder=09",
    "pageSize=10",
  ])
    expect(tabHref).toContain(filter);
  expect(tabHref).not.toContain("page=999");
});

it("display branding cannot rewrite canonical order IDs or program identifiers/labels", async () => {
  request.mockImplementation(async (url: string) =>
    envelope(
      String(url).includes("service-programs")
        ? [
            {
              program_id: "acme-program",
              tenant_id: identity.tenantId,
              display_name: "ACME canonical program",
            },
          ]
        : [
            {
              ...formalOrder(),
              order_id: "ord_acme_original",
              partner_program_id: "acme-program",
            },
          ],
    ),
  );
  const searchParams = Promise.resolve({ bank: "contoso", locale: "en" });
  const pages = loadPages();
  for (const html of [
    renderToStaticMarkup(await pages.list({ searchParams })),
    renderToStaticMarkup(
      await pages.detail({
        searchParams,
        params: Promise.resolve({ bookingId: "ord_acme_original" }),
      }),
    ),
  ]) {
    expect(html).toContain("ord_acme_original");
    expect(html).toContain("acme-program");
    expect(html).toContain("ACME canonical program");
    expect(html).not.toContain("ord_contoso_original");
  }
});
// Real pages and projection; only the existing identity/transport ports are controlled.
function serveCanonicalStatuses(
  values: Array<{
    status: string;
    scheduledAt?: string;
    approvalState?: string;
  }>,
) {
  request.mockImplementation(async (url: string) =>
    envelope(
      String(url).includes("service-programs")
        ? []
        : values.map((value, index) => ({
            ...formalOrder(index + 1),
            status: value.status,
            approval_state: value.approvalState ?? "pending",
            reservation_window_start:
              value.scheduledAt ?? formalOrder().reservation_window_start,
          })),
    ),
  );
}

it("canonical created booking stays unassigned in its real list, detail, filter and progress", async () => {
  serveCanonicalStatuses([{ status: "created" }]);
  const pages = loadPages();
  const list = renderToStaticMarkup(
    await pages.list({
      searchParams: Promise.resolve({ locale: "en", state: "created" }),
    }),
  );
  expect(list).toContain("FORMAL-1</a>");
  expect(list).toContain('Created</span><span class="users-filter-badge">1');
  const row = list.match(/<tr>.*?FORMAL-1.*?<\/tr>/)?.[0];
  expect(row).toContain(">Created<");
  expect(row).not.toContain(">Assigned<");
  const detail = renderToStaticMarkup(
    await pages.detail({
      params: Promise.resolve({ bookingId: "ord_1" }),
      searchParams: Promise.resolve({ locale: "en" }),
    }),
  );
  expect(detail).toContain(">Created<");
  expect(detail).not.toContain("booking-stage-pill is-completed");
  expect(detail).not.toContain("已指派");
  expect(detail).not.toContain("資格審批通過");
  // Approval state has no independent event timestamp in this read contract.
  serveCanonicalStatuses([{ status: "created", approvalState: "approved" }]);
  const approvedSnapshot = renderToStaticMarkup(
    await pages.detail({
      params: Promise.resolve({ bookingId: "ord_1" }),
      searchParams: Promise.resolve({ locale: "en" }),
    }),
  );
  expect(approvedSnapshot).not.toContain("資格審批通過");
});

it.each([
  ["dispatch_failed", "Dispatch failed", "派車失敗"],
  ["no_supply", "No available supply", "無可用運能"],
  ["dispatch_timeout", "Dispatch timed out", "派車逾時"],
])(
  "canonical %s retains its real reason instead of assigned/completed",
  async (status, en, zh) => {
    serveCanonicalStatuses([{ status }]);
    const pages = loadPages();
    const list = renderToStaticMarkup(
      await pages.list({
        searchParams: Promise.resolve({
          locale: "en",
          state: status,
          program: "program_1",
        }),
      }),
    );
    expect(list).toContain("FORMAL-1</a>");
    expect(list).toContain(`>${en}<`);
    const detail = renderToStaticMarkup(
      await pages.detail({
        params: Promise.resolve({ bookingId: "ord_1" }),
        searchParams: Promise.resolve({ locale: "zh" }),
      }),
    );
    expect(detail).toContain(`>${zh}<`);
    expect(detail).toContain(`目前狀態：${status}`);
    expect(detail).not.toContain("booking-stage-pill is-completed");
    expect(detail).not.toContain("已指派");
  },
);

it("canonical on-trip keeps its own label and all five real trip phases remain reachable through legacy en_route", async () => {
  const phases = [
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "proof_pending",
  ];
  serveCanonicalStatuses([
    ...phases.map((status) => ({ status })),
    { status: "assigned" },
    { status: "recording_pending" },
  ]);
  const pages = loadPages();
  const all = renderToStaticMarkup(
    await pages.list({ searchParams: Promise.resolve({ locale: "en" }) }),
  );
  const metrics = all.match(
    /<section class="surface-grid">(.*?)<\/section>/,
  )?.[1];
  expect(metrics).toContain("<h3>6</h3>");
  expect(metrics).toContain("<h3>7</h3>");
  const legacy = renderToStaticMarkup(
    await pages.list({
      searchParams: Promise.resolve({ locale: "en", state: "en_route" }),
    }),
  );
  for (let index = 1; index <= 5; index++)
    expect(legacy).toContain(`FORMAL-${index}</a>`);
  expect(legacy).not.toContain("FORMAL-6</a>");
  expect(legacy).not.toContain("FORMAL-7</a>");
  expect(legacy).toContain('En route</span><span class="users-filter-badge">5');
  expect(legacy).toContain(">On trip<");
  const exact = renderToStaticMarkup(
    await pages.list({
      searchParams: Promise.resolve({ locale: "en", state: "on_trip" }),
    }),
  );
  expect(exact).toContain("FORMAL-4</a>");
  expect(exact).not.toContain("FORMAL-1</a>");
  expect(exact).toContain('On trip</span><span class="users-filter-badge">1');
  const detail = renderToStaticMarkup(
    await pages.detail({
      params: Promise.resolve({ bookingId: "ord_4" }),
      searchParams: Promise.resolve({ locale: "zh" }),
    }),
  );
  expect(detail).toContain(">行程中<");
  expect(detail).not.toContain('booking-stage-pill is-current">Completed');
});

it.each([
  ["2026-10-31T16:30:00Z", "2026-11", "2026-10", "2026-11-01 00:30"],
  ["2026-12-31T16:15:00Z", "2027-01", "2026-12", "2027-01-01 00:15"],
])(
  "canonical UTC instant %s uses one Taipei month and displayed time in both pages",
  async (instant, period, wrongPeriod, display) => {
    serveCanonicalStatuses([{ status: "assigned", scheduledAt: instant }]);
    const pages = loadPages();
    const list = renderToStaticMarkup(
      await pages.list({
        searchParams: Promise.resolve({ locale: "en", period }),
      }),
    );
    expect(list).toContain("FORMAL-1</a>");
    expect(list).toContain(display);
    expect(list).toContain(`<option value="${period}"`);
    const excluded = renderToStaticMarkup(
      await pages.list({
        searchParams: Promise.resolve({ locale: "en", period: wrongPeriod }),
      }),
    );
    expect(excluded).not.toContain("FORMAL-1</a>");
    const detail = renderToStaticMarkup(
      await pages.detail({
        params: Promise.resolve({ bookingId: "ord_1" }),
        searchParams: Promise.resolve({ locale: "en", period }),
      }),
    );
    expect(detail).toContain(display);
    expect(detail).toContain(`period=${period}`);
  },
);
