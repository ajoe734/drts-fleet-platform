// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "node:path";
import type { FleetPartnerStatementRecord } from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

type Page = (props: {
  searchParams?: Promise<{ period?: string }>;
}) => Promise<React.ReactElement>;
type Revenue = {
  period: string;
  source: string;
  error: string | null;
  payable: string;
  lines: { v: string }[];
  availablePeriods: string[];
  fleetPartnerId: string | null;
  statement: {
    id: string;
    period: string;
    decisionStatus?: string;
    status: string;
    confirmNote?: string | null;
    disputeCaseId?: string | null;
  } | null;
};
function record(
  periodMonth: string,
  amount: number,
  decision: Partial<FleetPartnerStatementRecord> = {},
): FleetPartnerStatementRecord {
  const money = { amountMinor: amount * 100, currency: "TWD" };
  const zero = { amountMinor: 0, currency: "TWD" };
  return {
    statementId: `statement-${periodMonth}`,
    fleetPartnerId: "fleet-live",
    periodMonth,
    payoutStatus: "pending",
    grossEarningBasis: money,
    driverNetAmountBasis: money,
    shareAmount: money,
    sponsorFundedTripCount: 0,
    sponsorFundedGrossEarningBasis: zero,
    sponsorFundedShareAmount: zero,
    reimbursementAmount: zero,
    decisionStatus: "unreviewed",
    createdAt: `${periodMonth}-01T00:00:00Z`,
    updatedAt: `${periodMonth}-01T00:00:00Z`,
    lines: [
      {
        lineId: `line-${periodMonth}`,
        ruleId: "rule-live",
        formula: "percent_of_gross",
        orderId: `order-${periodMonth}`,
        driverId: "driver-live",
        affiliationId: "affiliation-live",
        grossEarning: money,
        driverNetAmount: money,
        shareAmount: money,
        completedAt: `${periodMonth}-15T00:00:00Z`,
        metadata: {
          appliesTo: "driver",
          serviceProduct: null,
          tenantServiceProgramId: null,
          sourcePlatform: null,
          driverGroupId: null,
          orderSource: null,
          settlementChannelKey: "drts_direct",
          sponsorFunded: false,
          partnerId: null,
          partnerProgramId: null,
          benefitReference: null,
          issuerAuthorizationRef: null,
          reimbursementAmount: null,
        },
      },
    ],
    ...decision,
  };
}
function harness(
  records: FleetPartnerStatementRecord[] = [],
  locale: "en" | "zh" = "en",
) {
  const appRoot = resolve("apps/fleet-partner-portal-web");
  const listFleetPortalStatements = vi.fn().mockResolvedValue(records);
  const listFleetPortalDrivers = vi.fn().mockResolvedValue([]);
  const listFleetPortalTrips = vi.fn().mockResolvedValue([]);
  const listFleetPortalDashboard = vi
    .fn()
    .mockRejectedValue(new Error("Aggregate unavailable"));
  const client = {
    listFleetPortalStatements,
    listFleetPortalDrivers,
    listFleetPortalTrips,
    listFleetPortalDashboard,
  };
  const getServerFleetPartnerClient = vi
    .fn()
    .mockResolvedValue({ client, fleetPartnerId: "fleet-live" });
  const submitStatementDecision = vi
    .fn()
    .mockResolvedValue({ ok: false, error: "unit error" });
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "server-only": {},
    "./api-client.server": { getServerFleetPartnerClient },
    "@/lib/api-client.server": { getServerFleetPartnerClient },
    "@/lib/server-locale": { getServerLocale: async () => locale },
    "@/app/statements/actions": { submitStatementDecision },
    "next/navigation": {
      useRouter: () => ({ refresh: vi.fn() }),
      useSearchParams: () => new URLSearchParams("period=2026-09"),
      notFound: () => {
        throw new Error("not found");
      },
    },
    "next/server": { NextRequest, NextResponse },
  });
  const data = load<{ loadRevenue: (period?: string) => Promise<Revenue> }>(
    resolve(appRoot, "lib/fleet-portal-data.server.ts"),
  );
  const revenue = load<{ default: Page }>(
    resolve(appRoot, "app/revenue/page.tsx"),
  ).default;
  const dashboard = load<{ default: Page }>(
    resolve(appRoot, "app/dashboard/page.tsx"),
  ).default;
  const index = load<{ default: Page }>(
    resolve(appRoot, "app/page.tsx"),
  ).default;
  const csv = load<{ GET: (request: NextRequest) => Promise<Response> }>(
    resolve(appRoot, "app/statements/export/route.ts"),
  ).GET;
  const { buildFleetPortalNav } = load<{
    buildFleetPortalNav: (locale: string) => { key?: string; href?: string }[];
  }>(resolve(appRoot, "lib/fleet-portal-nav.ts"));
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "zh" | "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  const wrap = (element: React.ReactElement) =>
    render(
      <LanguageProvider defaultLocale={locale}>{element}</LanguageProvider>,
    );
  return {
    client,
    getServerFleetPartnerClient,
    submitStatementDecision,
    data,
    revenue,
    dashboard,
    index,
    csv,
    buildFleetPortalNav,
    wrap,
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("active Fleet overview navigation", () => {
  it.each(["dashboard", "index"] as const)(
    "%s uses the same working actions with the requested month",
    async (route) => {
      const h = harness();
      expect(
        h.buildFleetPortalNav("en").find((item) => item.key === "dashboard")
          ?.href,
      ).toBe("/dashboard");
      h.wrap(
        await h[route]({
          searchParams: Promise.resolve({ period: "2026-09" }),
        }),
      );
      expect(
        screen.getByRole("link", { name: /Export$/ }).getAttribute("href"),
      ).toBe("/trips/export?type=summary&period=2026-09");
      expect(
        screen
          .getByRole("link", { name: "Recruit drivers" })
          .getAttribute("href"),
      ).toBe("/supply/drivers/new");
      expect(
        screen.getByRole("link", { name: "Go to trips" }).getAttribute("href"),
      ).toBe("/trips?period=2026-09");
      expect(h.client.listFleetPortalTrips).toHaveBeenCalledExactlyOnceWith(
        "2026-09",
      );
      expect(h.client.listFleetPortalDashboard).toHaveBeenCalledExactlyOnceWith(
        "2026-09",
      );
    },
  );

  it("shows live zero data and API failures through the active shared overview", async () => {
    const h = harness();
    const first = h.wrap(
      await h.dashboard({
        searchParams: Promise.resolve({ period: "2026-09" }),
      }),
    );
    expect(first.container.textContent).toContain("NT$ 0");
    expect(first.container.textContent).not.toContain("128");
    first.unmount();
    h.client.listFleetPortalDrivers.mockRejectedValue(
      new Error("Driver read failed"),
    );
    h.client.listFleetPortalTrips.mockRejectedValue(
      new Error("Trip read failed"),
    );
    const failed = h.wrap(
      await h.dashboard({
        searchParams: Promise.resolve({ period: "2026-09" }),
      }),
    );
    expect(failed.container.textContent).toContain("Driver read failed");
    expect(failed.container.textContent).toContain("Trip read failed");
    expect(failed.container.textContent).not.toContain("NT$ 0");
    expect(failed.container.textContent).not.toContain("642,000");
  });
});

describe("Revenue period and statement use one authoritative collection", () => {
  it("selects historical amount, lines, decision and exact CSV from one read", async () => {
    const september = record("2026-09", 7777, {
      decisionStatus: "confirmed",
      confirmNote: "Reviewed September",
      confirmedBy: "reviewer-live",
      confirmedAt: "2026-10-01T01:00:00Z",
    });
    const h = harness([record("2026-10", 9999), september]);
    h.client.listFleetPortalStatements
      .mockResolvedValueOnce([record("2026-10", 9999), september])
      .mockResolvedValue([record("2026-11", 12345)]);
    const page = h.wrap(
      await h.revenue({ searchParams: Promise.resolve({ period: "2026-09" }) }),
    );
    expect(h.client.listFleetPortalStatements).toHaveBeenCalledTimes(1);
    expect(h.client.listFleetPortalStatements).toHaveBeenCalledWith();
    expect(page.container.textContent).toContain("NT$ 7,777");
    expect(page.container.textContent).not.toContain("NT$ 9,999");
    expect(page.container.textContent).not.toContain("NT$ 12,345");
    expect(screen.getByText("Reviewed September")).toBeTruthy();
    expect(
      screen.queryByText("Current statement pending confirmation"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Export lines$/ }).getAttribute("href"),
    ).toBe("/statements/export?statementId=statement-2026-09");
    expect(screen.getByRole("button", { name: /^Confirm/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("the selected unreviewed month is the only statement submitted by its existing decision control", async () => {
    const h = harness([record("2026-10", 9999), record("2026-09", 7777)]);
    vi.spyOn(window, "prompt").mockReturnValue("Reviewed selected September");
    h.wrap(
      await h.revenue({ searchParams: Promise.resolve({ period: "2026-09" }) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(h.submitStatementDecision).toHaveBeenCalledExactlyOnceWith(
        "statement-2026-09",
        "confirmed",
        "Reviewed selected September",
      ),
    );
    expect(h.client.listFleetPortalStatements).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "zh"] as const)(
    "%s period control is a native GET form with actual periods and submit behavior",
    async (locale) => {
      const h = harness(
        [record("2026-09", 9), record("2026-10", 10), record("2026-09", 9)],
        locale,
      );
      h.wrap(
        await h.revenue({
          searchParams: Promise.resolve({ period: "2026-09" }),
        }),
      );
      const select = screen.getByRole("combobox", {
        name: locale === "en" ? "Period" : "期別",
      }) as HTMLSelectElement;
      expect(select.name).toBe("period");
      expect(select.value).toBe("2026-09");
      expect([...select.options].map((o) => o.value)).toEqual([
        "2026-10",
        "2026-09",
      ]);
      const form = select.closest("form")!;
      expect(form.getAttribute("action")).toBe("/revenue");
      expect(form.method.toLowerCase()).toBe("get");
      fireEvent.change(select, { target: { value: "2026-10" } });
      expect(new FormData(form).get("period")).toBe("2026-10");
      expect(form.querySelector('button[type="submit"]')).not.toBeNull();
    },
  );

  it("does not substitute another month for an explicit month without a statement", async () => {
    const h = harness([record("2026-10", 9999)]);
    const page = h.wrap(
      await h.revenue({ searchParams: Promise.resolve({ period: "2026-08" }) }),
    );
    expect(screen.getByRole("combobox")).toHaveProperty("value", "2026-08");
    expect(screen.getByText("No statement for this period yet")).toBeTruthy();
    expect(page.container.textContent).not.toContain("NT$ 9,999");
    expect(screen.queryByRole("link", { name: /Export lines$/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Export lines$/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: /^Confirm/ })).toBeNull();
    expect(
      screen.queryByText("Current statement pending confirmation"),
    ).toBeNull();
  });

  it("distinguishes a genuinely empty period from read failure and retries the same period", async () => {
    const h = harness([]);
    const empty = await h.data.loadRevenue("2026-09");
    expect(empty).toMatchObject({
      period: "2026-09",
      source: "live",
      error: null,
      statement: null,
      payable: "—",
      lines: [],
      availablePeriods: [],
      fleetPartnerId: "fleet-live",
    });
    const emptyPage = h.wrap(
      await h.revenue({ searchParams: Promise.resolve({ period: "2026-09" }) }),
    );
    expect(screen.getByText("No statement for this period yet")).toBeTruthy();
    expect(screen.queryByText("Unable to load this period")).toBeNull();
    expect(screen.queryByRole("link", { name: /Export lines$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Confirm/ })).toBeNull();
    emptyPage.unmount();
    h.client.listFleetPortalStatements.mockRejectedValue(
      new Error("Database unavailable"),
    );
    const failed = await h.data.loadRevenue("2026-09");
    expect(failed).toMatchObject({
      period: "2026-09",
      source: "fallback",
      error: "Database unavailable",
      statement: null,
      payable: "—",
      lines: [],
    });
    const page = h.wrap(
      await h.revenue({ searchParams: Promise.resolve({ period: "2026-09" }) }),
    );
    expect(screen.getByText("Unable to load this period")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Retry" }).getAttribute("href"),
    ).toBe("/revenue?period=2026-09");
    expect(screen.queryByText("No statement for this period yet")).toBeNull();
    expect(page.container.textContent).not.toContain("642,000");
    expect(screen.queryByRole("link", { name: /Export lines$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Confirm/ })).toBeNull();
  });

  it("defaults to the latest actual month and preserves legitimate zero amounts", async () => {
    const h = harness([record("2026-08", 777), record("2026-10", 0)]);
    const view = await h.data.loadRevenue();
    expect(view).toMatchObject({
      period: "2026-10",
      payable: "NT$ 0",
      statement: { id: "statement-2026-10" },
      availablePeriods: ["2026-10", "2026-08"],
    });
    h.client.listFleetPortalStatements.mockResolvedValue([]);
    expect((await h.data.loadRevenue()).period).toBe(
      new Date().toISOString().slice(0, 7),
    );
  });

  it("rethrows missing fleet configuration", async () => {
    const h = harness();
    h.getServerFleetPartnerClient.mockRejectedValue(
      new Error("Missing fleet scope configuration"),
    );
    await expect(h.data.loadRevenue("2026-09")).rejects.toThrow(
      "Missing fleet scope configuration",
    );
  });

  it.each(["confirmed", "disputed", "paid"] as const)(
    "preserves %s readback and the exact selected immutable line CSV",
    async (state) => {
      const selected = record(
        "2026-09",
        7777,
        state === "paid"
          ? { payoutStatus: "paid", decisionStatus: "confirmed" }
          : state === "confirmed"
            ? { decisionStatus: state, confirmNote: "Saved confirmation" }
            : {
                decisionStatus: state,
                disputeReason: "Saved dispute",
                disputeCaseId: "case-live",
              },
      );
      const h = harness([record("2026-10", 9999), selected]);
      h.wrap(
        await h.revenue({
          searchParams: Promise.resolve({ period: "2026-09" }),
        }),
      );
      expect(screen.getByRole("button", { name: /^Confirm/ })).toHaveProperty(
        "disabled",
        true,
      );
      expect(
        screen.getByRole("button", { name: /^Raise dispute/ }),
      ).toHaveProperty("disabled", true);
      const link = screen.getByRole("link", { name: /Export lines$/ });
      const response = await h.csv(
        new NextRequest(`https://fleet.invalid${link.getAttribute("href")}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toContain(
        'filename="statement-2026-09.csv"',
      );
      const body = await response.text();
      expect(body).toContain("line-2026-09");
      expect(body).toContain("7,777");
      expect(body).not.toContain("line-2026-10");
      if (state === "disputed")
        expect(
          screen
            .getByRole("link", { name: "View dispute case case-live" })
            .getAttribute("href"),
        ).toBe("/cases/case-live?period=2026-09");
      if (state === "paid")
        expect(screen.getByText("This period is settled")).toBeTruthy();
    },
  );
});
