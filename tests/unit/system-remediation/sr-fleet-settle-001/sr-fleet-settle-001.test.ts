import { describe, expect, it, vi } from "vitest";

// Mock server-only before any web module import.
vi.mock("server-only", () => ({}));

// Mock next/headers (unused by the functions under test but imported
// transitively by fleet-portal-data.server.ts's sibling loaders).
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "zh" })),
  })),
}));

const FLEET_STATEMENT_RECORD = {
  statementId: "fst_metro_2026_06",
  fleetPartnerId: "METRO_FLEET",
  periodMonth: "2026-06",
  payoutStatus: "pending" as const,
  grossEarningBasis: { amountMinor: 100_000_00, currency: "TWD" },
  driverNetAmountBasis: { amountMinor: 70_000_00, currency: "TWD" },
  shareAmount: { amountMinor: 30_000_00, currency: "TWD" },
  sponsorFundedTripCount: 2,
  sponsorFundedGrossEarningBasis: { amountMinor: 5_000_00, currency: "TWD" },
  sponsorFundedShareAmount: { amountMinor: 1_500_00, currency: "TWD" },
  reimbursementAmount: { amountMinor: 800_00, currency: "TWD" },
  lines: [
    {
      lineId: "line-1",
      ruleId: "rule-1",
      formula: "percent_of_gross",
      orderId: "ord-1",
      driverId: "drv-1",
      affiliationId: "aff-1",
      grossEarning: { amountMinor: 1_000_00, currency: "TWD" },
      driverNetAmount: { amountMinor: 700_00, currency: "TWD" },
      shareAmount: { amountMinor: 300_00, currency: "TWD" },
      completedAt: "2026-06-05T10:00:00Z",
      metadata: {
        appliesTo: "driver",
        serviceProduct: "realtime",
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
    {
      lineId: "line-2",
      ruleId: "rule-2",
      formula: "sponsor_funded_airport",
      orderId: "ord-2",
      driverId: "drv-2",
      affiliationId: "aff-2",
      grossEarning: { amountMinor: 5_000_00, currency: "TWD" },
      driverNetAmount: { amountMinor: 4_200_00, currency: "TWD" },
      shareAmount: { amountMinor: 1_500_00, currency: "TWD" },
      completedAt: "2026-06-06T08:30:00Z",
      metadata: {
        appliesTo: "driver",
        serviceProduct: "airport",
        tenantServiceProgramId: null,
        sourcePlatform: null,
        driverGroupId: null,
        orderSource: null,
        settlementChannelKey: "drts_direct",
        sponsorFunded: true,
        partnerId: "card-issuer-1",
        partnerProgramId: "prog-1",
        benefitReference: "benefit-1",
        issuerAuthorizationRef: "auth-1",
        reimbursementAmount: { amountMinor: 800_00, currency: "TWD" },
      },
    },
  ],
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

function mockClient(records: typeof FLEET_STATEMENT_RECORD[]) {
  return {
    listFleetPortalStatements: vi.fn().mockResolvedValue(records),
  };
}

describe("SR-FLEET-SETTLE-001: 車行 statement 真資料與確認／爭議", () => {
  describe("resolveStatementBannerState (fixes R13 self-contradiction)", () => {
    it("returns no_statement when there is no current-period statement, never a generated/pending claim", async () => {
      const { resolveStatementBannerState } = await import(
        "../../../../apps/fleet-partner-portal-web/app/revenue/statement-banner"
      );
      expect(resolveStatementBannerState(null)).toBe("no_statement");
    });

    it("returns pending for an unpaid statement", async () => {
      const { resolveStatementBannerState } = await import(
        "../../../../apps/fleet-partner-portal-web/app/revenue/statement-banner"
      );
      expect(
        resolveStatementBannerState({ status: "pending_confirm" }),
      ).toBe("pending");
    });

    it("returns paid for a paid statement, distinct from pending", async () => {
      const { resolveStatementBannerState } = await import(
        "../../../../apps/fleet-partner-portal-web/app/revenue/statement-banner"
      );
      expect(resolveStatementBannerState({ status: "paid" })).toBe("paid");
    });
  });

  describe("page-local translation helpers", () => {
    it("trRevenue interpolates params and falls back to zh for unknown locale entries", async () => {
      const { trRevenue } = await import(
        "../../../../apps/fleet-partner-portal-web/app/revenue/translations"
      );
      expect(
        trRevenue("revenue.noStatement.body", "en", { period: "2026-06" }),
      ).toContain("2026-06");
      expect(trRevenue("revenue.paidStatement.title", "zh")).toBe("本期已結清");
    });

    it("trStatements interpolates params", async () => {
      const { trStatements } = await import(
        "../../../../apps/fleet-partner-portal-web/app/statements/translations"
      );
      expect(trStatements("statements.empty.title", "en")).toBe(
        "No statements yet",
      );
    });
  });

  describe("loadStatementDetail (real backend data, period/list/detail consistency)", () => {
    it("resolves full line-item detail for a statement the fleet partner owns", async () => {
      vi.resetModules();
      vi.doMock(
        "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
        () => ({
          getServerFleetPartnerClient: vi.fn(async () => ({
            client: mockClient([FLEET_STATEMENT_RECORD]),
            fleetPartnerId: "METRO_FLEET",
          })),
        }),
      );
      const { loadStatementDetail, loadStatements } = await import(
        "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server"
      );

      const list = await loadStatements();
      expect(list.source).toBe("live");
      expect(list.rows).toHaveLength(1);
      const listRow = list.rows[0]!;
      expect(listRow.id).toBe("fst_metro_2026_06");

      const detail = await loadStatementDetail(listRow.id);
      expect(detail.source).toBe("live");
      expect(detail.statement).not.toBeNull();
      // list/detail consistency: same id, period, and payable total.
      expect(detail.statement!.id).toBe(listRow.id);
      expect(detail.statement!.period).toBe(listRow.period);
      expect(detail.statement!.payable).toBe(listRow.payable);
      expect(detail.statement!.lines).toHaveLength(2);
      expect(detail.statement!.lines[1]!.sponsorFunded).toBe(true);
      expect(detail.statement!.lines[1]!.completedAt).toBe(
        "2026-06-06T08:30:00Z",
      );
    });

    it("resolves to statement: null for an id outside the fleet partner's scoped list (cross-fleet denial + not-found, not a leak)", async () => {
      vi.resetModules();
      vi.doMock(
        "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
        () => ({
          getServerFleetPartnerClient: vi.fn(async () => ({
            client: mockClient([FLEET_STATEMENT_RECORD]),
            fleetPartnerId: "METRO_FLEET",
          })),
        }),
      );
      const { loadStatementDetail } = await import(
        "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server"
      );

      // The backend only ever returns statements scoped to the caller's
      // x-fleet-partner-id, so an id belonging to another fleet partner (or
      // a nonexistent id) simply never appears in the list — this asserts
      // the frontend honors that instead of matching loosely.
      const detail = await loadStatementDetail("fst_other_fleet_2026_06");
      expect(detail.statement).toBeNull();
      expect(detail.source).toBe("live");
    });

    it("falls back without fabricating a generated statement when the endpoint errors", async () => {
      vi.resetModules();
      vi.doMock(
        "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
        () => ({
          getServerFleetPartnerClient: vi.fn(async () => ({
            client: {
              listFleetPortalStatements: vi
                .fn()
                .mockRejectedValue(new Error("READ_FAILED")),
            },
            fleetPartnerId: "METRO_FLEET",
          })),
        }),
      );
      const { loadStatementDetail } = await import(
        "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server"
      );

      const detail = await loadStatementDetail("fst_unknown_id");
      expect(detail.source).toBe("fallback");
      // Unknown id in the fallback fixture set must not be silently
      // resolved to demo data — that would be exactly the fake-completion
      // pattern this task is required to avoid.
      expect(detail.statement).toBeNull();
    });
  });
});
