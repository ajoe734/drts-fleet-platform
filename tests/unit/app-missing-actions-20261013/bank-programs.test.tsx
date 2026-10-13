// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../../../packages/control-plane-auth/src/index";
import * as tokens from "../../../packages/ui-tokens/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const definitions = [
  {
    program_id: "live-program-alpha",
    tenant_id: "tenant-contoso-001",
    display_name: '實際方案, "Alpha"',
    program_type: "credit_card_airport_transfer",
    active: true,
    billing_mode: "partner_settlement",
    pricing_plan_id: "price-alpha",
    eligibility_rule_id: "eligibility-alpha",
    service_rule_set_id: "rules-alpha",
    allowed_service_products: ["credit_card_airport_transfer"],
  },
  {
    program_id: "live-program-beta",
    tenant_id: "tenant-contoso-001",
    display_name: "Beta live program",
    program_type: "credit_card_airport_transfer",
    active: false,
    billing_mode: "partner_settlement",
    pricing_plan_id: "price-beta",
    eligibility_rule_id: null,
    service_rule_set_id: "rules-beta",
    allowed_service_products: ["credit_card_airport_transfer"],
  },
  {
    program_id: "live-program-new",
    tenant_id: "tenant-contoso-001",
    display_name: "New program without usage",
    program_type: "credit_card_airport_transfer",
    active: true,
    billing_mode: "partner_settlement",
    pricing_plan_id: "price-new",
    eligibility_rule_id: null,
    service_rule_set_id: "rules-new",
    allowed_service_products: [],
  },
];
const usage = [
  {
    program_id: "live-program-alpha",
    program_code: "LIVE-ALPHA",
    period: "2026-09",
    cardholders_served: 17,
    trips_consumed: 24,
    quota_total: 100,
    quota_remaining: 77,
  },
  {
    program_id: "live-program-alpha",
    program_code: "LIVE-ALPHA",
    period: "2026-10",
    cardholders_served: 3,
    trips_consumed: 5,
    quota_total: null,
    quota_remaining: null,
  },
  {
    program_id: "live-program-beta",
    program_code: "LIVE-BETA",
    period: "2026-10",
    cardholders_served: 1,
    trips_consumed: 1,
    quota_total: 2,
    quota_remaining: 1,
  },
];
const query = { bank: "contoso", locale: "en", role: "bank_finance" };

function harness(
  options: {
    definitions?: unknown[];
    usage?: unknown[];
    failDefinitions?: boolean;
    failUsage?: boolean;
  } = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const isDefinitions = path === "/api/tenant/service-programs";
    if (!isDefinitions && path !== "/api/tenant/program-usage") {
      throw new Error(`Unexpected network request: ${path}`);
    }
    if (isDefinitions ? options.failDefinitions : options.failUsage) {
      return new Response("upstream unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        data: {
          items: isDefinitions
            ? (options.definitions ?? definitions)
            : (options.usage ?? usage),
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const appRoot = resolve("apps/bank-console-web");
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "server-only": {},
    "@drts/control-plane-auth": auth,
    "@drts/ui-tokens": tokens,
    "next/link": ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a {...props}>{children}</a>
    ),
    "next/navigation": {
      notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
      },
    },
  });
  type SearchProps = { searchParams: Promise<Record<string, string>> };
  const listPage = load<{
    default: (props: SearchProps) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/programs/page.tsx")).default;
  const detailPage = load<{
    default: (
      props: SearchProps & { params: Promise<{ programId: string }> },
    ) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/programs/[programId]/page.tsx")).default;
  const data = load<{
    loadBankProgramsData: (
      tenant: string,
      role: string,
    ) => Promise<{
      data: {
        programs: Array<{
          id: string;
          name: string;
          definition: unknown;
          usage: Array<{
            quotaTotal: number | null;
            quotaRemaining: number | null;
          }>;
        }>;
        programsAvailable: boolean;
        usageAvailable: boolean;
      };
      degradedMessage: string | null;
    }>;
  }>(resolve(appRoot, "lib/bank-dev-read-models.ts"));
  return { listPage, detailPage, data, fetchMock };
}

function csvFrom(link: HTMLElement) {
  const href = link.getAttribute("href") ?? "";
  expect(href.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
  return decodeURIComponent(href.slice(href.indexOf(",") + 1));
}

beforeEach(() => {
  vi.stubEnv("DRTS_API_URL", "http://bank-api.unit.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bank program live list, detail and usage download", () => {
  it("reads only the relevant APIs with the tenant context, decodes the HTTP wire contract and keeps programs without usage", async () => {
    const { data, fetchMock } = harness();
    const result = await data.loadBankProgramsData(
      "tenant-contoso-001",
      "bank_finance",
    );
    expect(result.degradedMessage).toBeNull();
    expect(result.data.programs.map((program) => program.id)).toEqual([
      "live-program-alpha",
      "live-program-beta",
      "live-program-new",
    ]);
    expect(result.data.programs[0].usage).toHaveLength(2);
    expect(result.data.programs[0].usage[0].quotaRemaining).toBe(77);
    expect(result.data.programs[0].usage[1].quotaTotal).toBeNull();
    expect(result.data.programs[2].usage).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const init = (call as unknown as [unknown, RequestInit])[1];
      expect(init.headers).toMatchObject({
        "x-tenant-id": "tenant-contoso-001",
        "x-actor-id": "bank-console:tenant-contoso-001:bank_finance",
      });
    }
  });

  it("navigates by actual program ID with bank, locale and role intact, and downloads only that program's periods", async () => {
    const { listPage, detailPage } = harness();
    const list = render(
      await listPage({ searchParams: Promise.resolve(query) }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Data source: connected API",
    );
    const card = screen
      .getByRole("heading", { name: definitions[0].display_name })
      .closest("article")!;
    const detailLink = within(card).getByRole("link", { name: "View details" });
    const detailUrl = new URL(
      detailLink.getAttribute("href")!,
      "http://bank.unit.test",
    );
    expect(detailUrl.pathname).toBe("/programs/live-program-alpha");
    expect(Object.fromEntries(detailUrl.searchParams)).toEqual(query);
    const cardCsv = csvFrom(
      within(card).getByRole("link", { name: "Export usage" }),
    );
    expect(cardCsv).toContain('"實際方案, ""Alpha"""');
    expect(cardCsv).toContain('"2026-09","17","24","100","77"');
    expect(cardCsv).toContain('"2026-10","3","5","",""');
    expect(cardCsv).not.toContain("live-program-beta");
    expect(within(card).getByText("77 remaining")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Edit eligibility policy" }),
    ).toBeNull();
    list.unmount();
    render(
      await detailPage({
        params: Promise.resolve({
          programId: detailUrl.pathname.split("/").at(-1)!,
        }),
        searchParams: Promise.resolve(
          Object.fromEntries(detailUrl.searchParams),
        ),
      }),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      definitions[0].display_name,
    );
    expect(screen.getByText("price-alpha")).toBeTruthy();
    expect(screen.getByText("eligibility-alpha")).toBeTruthy();
    expect(screen.getByText("rules-alpha")).toBeTruthy();
    expect(screen.getByText("2026-09")).toBeTruthy();
    expect(screen.getByText("2026-10")).toBeTruthy();
    expect(screen.getAllByText("Not provided")).toHaveLength(2);
    const download = screen.getByRole("link", { name: "Export usage" });
    expect(download.getAttribute("download")).toBe(
      "program-live-program-alpha-usage.csv",
    );
    expect(csvFrom(download)).toBe(cardCsv);
    expect(
      screen
        .getByRole("link", { name: "Back to programs" })
        .getAttribute("href"),
    ).toBe("/programs?bank=contoso&locale=en&role=bank_finance");
  });

  it("renders connected-but-empty results without fabricated programs or downloads", async () => {
    const { listPage } = harness({ definitions: [], usage: [] });
    render(await listPage({ searchParams: Promise.resolve(query) }));
    expect(
      screen.getByText("No programs have been returned for this issuer."),
    ).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("link", { name: "Export usage" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View details" })).toBeNull();
  });

  it("renders a known program without usage and preserves inactive and nullable settings", async () => {
    const { detailPage } = harness({ usage: [] });
    render(
      await detailPage({
        params: Promise.resolve({ programId: "live-program-beta" }),
        searchParams: Promise.resolve(query),
      }),
    );
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("Not provided")).toBeTruthy();
    expect(
      screen.getAllByText(
        "No usage records are available for these programs yet.",
      ),
    ).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Export usage" })).toBeNull();
  });

  it("keeps loaded settings visible when usage fails and does not offer an empty CSV", async () => {
    const { detailPage } = harness({ failUsage: true });
    render(
      await detailPage({
        params: Promise.resolve({ programId: "live-program-alpha" }),
        searchParams: Promise.resolve(query),
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Usage: Unavailable",
    );
    expect(screen.getByText("price-alpha")).toBeTruthy();
    expect(screen.getAllByText(/Usage could not be loaded/)).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Export usage" })).toBeNull();
    expect(
      screen.queryByText(
        "No usage records are available for these programs yet.",
      ),
    ).toBeNull();
  });

  it("keeps actual usage available with a clear partial source state if settings fail", async () => {
    const { detailPage } = harness({ failDefinitions: true });
    render(
      await detailPage({
        params: Promise.resolve({ programId: "live-program-alpha" }),
        searchParams: Promise.resolve(query),
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Program settings: Unavailable",
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "LIVE-ALPHA",
    );
    expect(screen.getByText(/Program settings were not returned/)).toBeTruthy();
    expect(
      csvFrom(screen.getByRole("link", { name: "Export usage" })),
    ).toContain('"live-program-alpha","LIVE-ALPHA"');
  });

  it("uses not-found only for a healthy missing program; outage is shown as retryable", async () => {
    const healthy = harness();
    const props = {
      params: Promise.resolve({ programId: "unknown-program" }),
      searchParams: Promise.resolve(query),
    };
    await expect(healthy.detailPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    const failing = harness({ failDefinitions: true, failUsage: true });
    render(await failing.detailPage(props));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByText(
        "This program could not be loaded. Reload the page to try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Export usage" })).toBeNull();
  });

  it("supports camelCase in-process responses and retains usage when a definition is missing", async () => {
    const { data } = harness({
      definitions: [],
      usage: [
        {
          programId: "orphan-program",
          programCode: "ORPHAN",
          period: "2026-10",
          cardholdersServed: 0,
          tripsConsumed: 0,
          quotaTotal: 0,
          quotaRemaining: 0,
        },
      ],
    });
    const result = await data.loadBankProgramsData(
      "tenant-contoso-001",
      "bank_finance",
    );
    expect(result.data.programs[0]).toMatchObject({
      id: "orphan-program",
      name: "ORPHAN",
      definition: null,
      usage: [{ quotaTotal: 0, quotaRemaining: 0 }],
    });
    expect(result.degradedMessage).toBeNull();
  });

  it("renders the live flow in Chinese", async () => {
    const { listPage } = harness();
    render(
      await listPage({
        searchParams: Promise.resolve({ ...query, locale: "zh" }),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "資料來源：已連線 API",
    );
    expect(screen.getAllByRole("link", { name: "查看明細" })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "匯出用量" })).toHaveLength(2);
  });
});
