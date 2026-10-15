import { loadDetailPage } from "./production-page";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
import type { IdentityContext } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { ReferralStatementRecord } from "../../../apps/api/src/modules/billing-settlement/referral-statement.types";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  loadReferralDashboard,
  loadReferralStatementDetail,
  loadReferralStatements,
  loadReferralUsage,
} from "../../../apps/channel-partner-portal-web/lib/channel-portal-data.server";
import { t } from "../../../apps/channel-partner-portal-web/lib/translations";

const slug = "referral-demo-community";
const period = "2026-06";
const identity: IdentityContext = {
  actorType: "partner_api_key",
  actorId: "partner-referral-demo-001",
  realm: "partner",
  authMode: "bootstrap_headers",
  roleFamilies: ["partner"],
  roles: ["partner"],
  scopes: ["billing:read"],
  tenantId: "tenant-demo-001",
  partnerId: "partner-referral-demo-001",
  partnerProgramId: "program-referral-community",
  partnerEntrySlug: slug,
  supportedExecutionModes: ["discussion_planning"],
};

function services(fares?: number[]) {
  const audit = new AuditNotificationService();
  const billing = new BillingSettlementService(audit);
  const partners = new TenantPartnerService(audit);
  if (fares) {
    // Input fixture only: vary the existing attributed in-memory ledger trips.
    // Rule resolution, integer-minor rounding, line creation and sums stay real.
    const template = billing["settlementTrips"].find(
      (trip) => trip.partnerEntrySlug === slug,
    )!;
    billing["settlementTrips"].splice(
      0,
      billing["settlementTrips"].length,
      ...fares.map((fare, index) => ({
        ...template,
        orderId: `precision-trip-${index}`,
        riderId: `precision-rider-${index}`,
        grossEarning: { currency: "TWD", amountMinor: fare },
      })),
    );
  }
  const statement = partners.getPartnerReferralStatement(
    identity,
    billing,
    period,
  );
  return { billing, partners, statement };
}

function serve(statement: ReferralStatementRecord) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    let data: unknown = statement;
    if (url.pathname.endsWith("/statements")) data = { items: [statement] };
    if (url.pathname.endsWith("/usage")) data = { items: [] };
    if (url.pathname.endsWith("/dashboard")) {
      data = {
        partnerEntrySlug: slug,
        period: statement.period,
        activeUserCount: statement.totals.activeRiderCount,
        tripCount: statement.totals.tripCount,
        gmv: statement.totals.gmv,
        estimatedShareAmount: statement.totals.shareTotal,
        statementId: statement.statementId,
        statementStatus: statement.status,
        latestStatementPeriod: statement.period,
        pendingStatementCount: 1,
      };
    }
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function minor(display: string): number {
  return Math.round(
    Number(display.replace(/^(NT\$|[A-Z]{3})\s*/, "").replaceAll(",", "")) *
      100,
  );
}

function csvLines(statement: ReferralStatementRecord) {
  // Invoke the existing production CSV renderer, including its arithmetic and
  // CSV writer, without constructing unrelated auth/booking dependencies.
  const csv =
    TenantPartnerController.prototype["renderReferralStatementArtifact"](
      statement,
    );
  return csv
    .split("\r\n")
    .slice(1)
    .map((row) => row.slice(1, -1).split('","'));
}

async function renderedDetail() {
  const { default: Page } = loadDetailPage() as {
    default: (props: {
      params: Promise<{ period: string }>;
    }) => Promise<ReactElement>;
  };
  const element = await Page({ params: Promise.resolve({ period }) });
  return new JSDOM(renderToStaticMarkup(createElement("main", null, element)))
    .window.document;
}

describe("canonical channel statement minor precision", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_API_URL", "http://statement-transport.test");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    [10100, 1515],
    [10001, 1500],
    [1, 0],
    [10, 2],
    [123456789, 18518518],
  ])(
    "preserves fare %i and owed share %i through mapper and same-statement CSV",
    async (fare, share) => {
      const { statement } = services([fare]);
      expect(statement.lines[0]).toMatchObject({
        rateType: "percent",
        rateValue: 15,
        shareAmount: { amountMinor: share },
      });
      expect(statement.direction).toBe("drts_pays_partner");
      serve(statement);
      const detail = await loadReferralStatementDetail(period);
      expect(detail.source).toBe("live");
      const view = detail.statement!;
      const csv = csvLines(statement)[0]!;
      expect(minor(view.lines[0]!.fare)).toBe(fare);
      expect(minor(view.lines[0]!.share)).toBe(share);
      expect(minor(view.lines[0]!.fare)).toBe(minor(csv[5]!));
      expect(minor(view.lines[0]!.share)).toBe(minor(csv[8]!));
      expect(minor(view.gmv)).toBe(fare);
      expect(minor(view.share)).toBe(share);
    },
  );

  it("renders real detail table cells and period totals with the same CSV amounts", async () => {
    const { statement } = services([10100, 10001]);
    serve(statement);
    const document = await renderedDetail();
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    const csv = csvLines(statement);
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll("td");
      expect(minor(cells[4]!.textContent!)).toBe(minor(csv[index]![5]!));
      expect(minor(cells[5]!.textContent!)).toBe(minor(csv[index]![8]!));
    });
    const totalValue = (key: string) =>
      [...document.querySelectorAll("div")].find(
        (item) =>
          item.childElementCount === 0 && item.textContent === t(key, "zh"),
      )?.nextElementSibling?.textContent;
    expect(totalValue("referral.table.gmv")).toBe("NT$ 201.01");
    expect(totalValue("referral.statements.share")).toBe("NT$ 30.15");
    expect(
      document
        .querySelector('[data-drt-operation="channel-statement-download"]')
        ?.getAttribute("href"),
    ).toBe(
      `/control-plane-proxy/partner/referral/statements/${period}/artifact`,
    );
  });

  it("keeps statement-list and usage trip consumers precise, while dashboard remains explicitly estimated", async () => {
    const { statement } = services([10100]);
    serve(statement);
    expect((await loadReferralStatements()).rows[0]!.share).toBe("NT$ 15.15");
    expect((await loadReferralUsage()).tripRows[0]!.share).toBe("NT$ 15.15");
    expect((await loadReferralDashboard(period)).summary.estimatedShare).toBe(
      "NT$ 15",
    );
  });

  it("preserves original totals, partner/period isolation and null/unregistered rules", async () => {
    const { billing, partners, statement } = services();
    expect(statement.totals).toMatchObject({
      tripCount: 2,
      activeRiderCount: 2,
      gmv: { amountMinor: 150000 },
      shareTotal: { amountMinor: 22500 },
    });
    serve(statement);
    const view = (await loadReferralStatementDetail(period)).statement!;
    expect([view.trips, view.gmv, view.share]).toEqual([
      "2",
      "NT$ 1,500",
      "NT$ 225",
    ]);
    const csv = csvLines(statement);
    expect(csv.reduce((sum, row) => sum + minor(row[8]!), 0)).toBe(22500);
    expect(billing.getReferralStatement(slug, "2026-07").lines).toEqual([]);
    expect(billing.getReferralStatement("unregistered", period).lines).toEqual(
      [],
    );
    expect(
      billing.resolveReferralRevenueShareRule(
        "unregistered",
        "2026-06-15T00:00:00Z",
      ),
    ).toBeNull();
    expect(
      billing.resolveReferralRevenueShareRule(slug, "2000-01-01T00:00:00Z"),
    ).toBeNull();
    expect(() =>
      partners.getPartnerReferralStatement(null, billing, period),
    ).toThrow();
    expect(() =>
      partners.getPartnerReferralStatement(
        { ...identity, partnerEntrySlug: "other-partner" },
        billing,
        period,
      ),
    ).toThrow();
    expect(() =>
      partners.getPartnerReferralStatement(identity, billing, "not-a-month"),
    ).toThrow();
  });

  it("keeps legitimate empty live statements and transport error fallback distinct", async () => {
    const { billing } = services();
    serve(billing.getReferralStatement(slug, "2026-07"));
    const empty = await loadReferralStatementDetail("2026-07");
    expect(empty.source).toBe("live");
    expect(empty.statement).toMatchObject({
      period: "2026-07",
      trips: "0",
      gmv: "NT$ 0",
      share: "NT$ 0",
      lines: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const missing = await loadReferralStatementDetail("2099-01");
    expect(missing).toMatchObject({ source: "fallback", statement: null });
    expect((await loadReferralStatements()).source).toBe("fallback");
  });
});
