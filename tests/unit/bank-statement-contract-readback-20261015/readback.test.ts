import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as auth from "../../../packages/control-plane-auth/src/index";
import * as tokens from "../../../packages/ui-tokens/src/index";
import * as ui from "../../../packages/ui-web/src/index";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { SettlementStatementRecord } from "../../../apps/api/src/modules/billing-settlement/settlement-statement.types";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

type StatementInput = Partial<SettlementStatementRecord> & {
  period: string;
  status: "published" | "paid" | "due";
  issued_at?: string;
  due_at?: string;
  generated_at?: string;
  issuedAt?: string;
  dueAt?: string;
};
type Statement = { period: string; issuedAt: string; dueAt: string };
type PageProps = {
  searchParams: Promise<Record<string, string>>;
  params: Promise<{ period: string; contractId: string }>;
};
const roles = ["bank_program_admin", "bank_finance", "bank_ops_viewer"];
const seedId = "ctr_acme_world_elite_2026";
const appRoot = resolve("apps/bank-console-web");

// Only the HTTP transport and Next request/navigation boundaries are replaced.
// The real pages, loaders, mapper, session/role helpers and UI render on Node.
function harness(options: {
  statements?: StatementInput[];
  contracts?: unknown[];
  failure?: number | "timeout";
  cookieRole?: string;
} = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://synthetic-bank-api.invalid");
    expect(init?.method ?? "GET").toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-tenant-id"]).toBe("tenant-contoso-001");
    expect(headers["x-actor-id"]).toMatch(/^bank-console:tenant-contoso-001:bank_/);
    if (url.pathname === "/api/tenant/contracts" && options.failure) {
      if (options.failure === "timeout") throw new Error("synthetic timeout");
      return new Response("scoped contract unavailable", { status: options.failure });
    }
    const items = url.pathname === "/api/tenant/contracts"
      ? options.contracts ?? []
      : url.pathname === "/api/tenant/settlement-statements"
        ? options.statements ?? []
        : [];
    return new Response(JSON.stringify({ data: { items } }));
  });
  vi.stubEnv("DRTS_API_URL", "https://synthetic-bank-api.invalid");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubGlobal("fetch", fetchMock);
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "server-only": {},
    "@drts/control-plane-auth": auth,
    "@drts/ui-tokens": tokens,
    "@drts/ui-web": ui,
    "next/link": ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement("a", props, children),
    "next/headers": { cookies: async () => ({ get: () => options.cookieRole ? { value: options.cookieRole } : undefined }) },
    "next/navigation": { notFound: () => { throw new Error("NEXT_NOT_FOUND"); } },
  });
  const model = load<{
    mapStatementsFromApi: (items: StatementInput[], label: string) => Statement[];
    deriveStatementDates: (record: StatementInput) => Omit<Statement, "period">;
    loadBankStatementsData: (tenant: string, role: string) => Promise<{ data: { statements: Statement[] }; degradedMessage: string | null }>;
  }>(resolve(appRoot, "lib/bank-dev-read-models.ts"));
  const page = (path: string) => load<{ default: (props: PageProps) => Promise<React.ReactElement> }>(resolve(appRoot, path)).default;
  const props = (role = "bank_finance", contractId = seedId): PageProps => ({
    searchParams: Promise.resolve({ bank: "contoso", locale: "en", role }),
    params: Promise.resolve({ period: "2026-10", contractId }),
  });
  return { load, model, page, props, fetchMock };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("C084 immutable producer projection", () => {
  it("keeps no-seed same-period dates stable across actual producer GETs", async () => {
    vi.useFakeTimers();
    const producer = new BillingSettlementService(new AuditNotificationService());
    // A non-seed tenant/trip enters through the production completion handler.
    await producer.handleOwnedMobilityTripCompleted({
      tenantId: "tenant-contoso-001", driverId: "synthetic-driver", orderId: "synthetic-trip",
      bookingId: null, completedAt: "2026-10-02T00:00:00+08:00",
      grossEarning: { amountMinor: 120000, currency: "TWD" }, orderSource: "portal",
      serviceBucket: "business_dispatch", businessDispatchSubtype: "credit_card_airport_transfer",
      costCenterCode: null, riderId: null, partnerId: null, partnerProgramId: null,
      partnerEntrySlug: null, eligibilityVerificationId: null,
      issuerAuthorizationRef: "synthetic-authorization", benefitReference: "synthetic-benefit",
      serviceProduct: "credit_card_airport_transfer",
    });
    vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
    const first = await producer.listTenantSettlementStatements("tenant-contoso-001");
    vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
    const second = await producer.listTenantSettlementStatements("tenant-contoso-001");
    expect(first).toHaveLength(1);
    expect(first[0]?.lines).toHaveLength(1);
    expect(first[0]?.generatedAt).not.toBe(second[0]?.generatedAt);
    expect({ ...first[0], generatedAt: undefined }).toEqual({ ...second[0], generatedAt: undefined });
    const { model } = harness();
    expect(model.mapStatementsFromApi(first, "live")).toEqual(model.mapStatementsFromApi(second, "live"));
    expect(model.mapStatementsFromApi(first, "live")[0]).toMatchObject({
      issuedAt: "2026-10-01T00:00:00+08:00", dueAt: "2026-10-31T23:59:59+08:00",
    });
  });

  it("preserves explicit snake/camel dates, seed, past/leap bounds, ordering and empty states", async () => {
    const { model, load } = harness();
    const explicit = { issuedAt: "2026-10-02T18:00:00Z", dueAt: "2026-11-01T16:30:00Z" };
    for (const fields of [explicit, { issued_at: explicit.issuedAt, due_at: explicit.dueAt }]) {
      expect(model.mapStatementsFromApi([{ period: "2026-10", status: "paid", ...fields, generatedAt: "2026-10-29T00:00:00Z" }], "live")[0]).toMatchObject(explicit);
    }
    const seeds = load<{ settlementStatements: Statement[] }>(resolve(appRoot, "lib/statements.ts")).settlementStatements;
    for (const seed of seeds) {
      expect(model.mapStatementsFromApi([{ period: seed.period, status: "due", generatedAt: `${seed.period}-15T00:00:00Z` }], "seed")[0]).toMatchObject({ issuedAt: seed.issuedAt, dueAt: seed.dueAt });
    }
    const mapped = model.mapStatementsFromApi([
      { period: "2026-10", status: "due" }, { period: "2024-02", status: "paid", generated_at: "2026-10-15T00:00:00Z" },
    ], "live");
    expect(mapped.map(s => s.period)).toEqual(["2026-10", "2024-02"]);
    expect(mapped[1]).toMatchObject({ issuedAt: "2024-02-01T00:00:00+08:00", dueAt: "2024-02-29T23:59:59+08:00" });
    expect(model.deriveStatementDates({ period: "2026-10", status: "due", issuedAt: "2026-11-03T00:00:00Z", dueAt: "2026-10-04T00:00:00Z" })).toEqual({ issuedAt: "2026-10-01T00:00:00+08:00", dueAt: "2026-10-31T23:59:59+08:00" });
    expect(await model.loadBankStatementsData("tenant-contoso-001", "bank_finance")).toEqual({ data: { statements: [] }, degradedMessage: null });
  });
});

describe("C084 production SSR date consumers (run with TZ=UTC and TZ=Asia/Taipei)", () => {
  it.each(["app/statements/page.tsx", "app/statements/[period]/page.tsx"])("%s renders Taipei midnight and trip dates", async path => {
    const h = harness({ statements: [{ period: "2026-10", status: "published", issuedAt: "2026-10-01T00:00:00+08:00", dueAt: "2026-11-01T16:30:00Z", lines: [{ tripId: "synthetic-trip", completedAt: "2026-10-02T00:00:00+08:00" }] as SettlementStatementRecord["lines"] }] });
    const html = renderToStaticMarkup(await h.page(path)(h.props()));
    expect(html).toContain("2026-10-01");
    expect(html).toContain("2026-11-02");
    expect(html).not.toContain("2026-09-30");
    if (path.includes("[period]")) expect(html).toContain("2026-10-02");
  });

  it("home formats UTC instants with the same Taipei dates, including compact due labels", async () => {
    const h = harness({ statements: [{ period: "2026-10", status: "due", issuedAt: "2026-09-30T16:00:00Z", dueAt: "2026-10-30T16:30:00Z" }] });
    const html = renderToStaticMarkup(await h.page("app/page.tsx")(h.props()));
    expect(html).toContain("2026-10-01");
    expect(html).toContain("2026-10-31");
    expect(html).toContain("10-31");
    expect(html).not.toContain("2026-09-30");
    expect(html).not.toContain("10-30");
  });

  it("signed ops role still masks finance despite a finance query", async () => {
    const h = harness({ cookieRole: "bank_ops_viewer", statements: [{ period: "2026-10", status: "due", totals: { issuerPayable: { amountMinor: 98765400, currency: "TWD" } } as SettlementStatementRecord["totals"] }] });
    const html = renderToStaticMarkup(await h.page("app/statements/[period]/page.tsx")(h.props()));
    expect(html).toContain("••••••");
    expect(html).not.toContain("987,654");
  });
});

describe("C085 scoped contract detail", () => {
  it.each(roles.flatMap(role => [403, 404, 503, "timeout", undefined].map(failure => ({ role, failure }))))("$role fails closed on $failure or missing scoped data even for a known seed ID", async ({ role, failure }) => {
    const h = harness({ failure: failure as number | "timeout" | undefined });
    await expect(h.page("app/contracts/[contractId]/page.tsx")(h.props(role))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(roles)("%s renders authorized scoped details and aliases read-only without SSR errors", async role => {
    const h = harness({ contracts: [{ contractId: "scoped-contract", programId: "scoped-program", programCode: "SCOPED-CODE", displayName: "Scoped contract only", status: "active", exceptions: [], slaTargets: [] }] });
    for (const alias of ["scoped-contract", "scoped-program", "scoped-code"]) {
      const html = renderToStaticMarkup(await h.page("app/contracts/[contractId]/page.tsx")(h.props(role, alias)));
      expect(html).toContain("Scoped contract only");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("<button");
    }
    await expect(h.page("app/contracts/[contractId]/page.tsx")(h.props(role, seedId))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
