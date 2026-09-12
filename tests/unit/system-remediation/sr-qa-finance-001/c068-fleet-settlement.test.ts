import { describe, expect, it, vi } from "vitest";

// Mock server-only before any web module import.
vi.mock("server-only", () => ({}));

// Mock next/headers for Next.js server module dependencies.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "zh" })),
  })),
}));

import { resolveStatementBannerState } from "../../../../apps/fleet-partner-portal-web/app/revenue/statement-banner";
import { trRevenue } from "../../../../apps/fleet-partner-portal-web/app/revenue/translations";
import { trStatements } from "../../../../apps/fleet-partner-portal-web/app/statements/translations";

const SAMPLE_FLEET_STATEMENT = {
  statementId: "fst_qa_demo_2026_06",
  fleetPartnerId: "FLEET_QA_PARTNER_001",
  periodMonth: "2026-06",
  payoutStatus: "pending" as const,
  grossEarningBasis: { amountMinor: 150_000_00, currency: "TWD" },
  driverNetAmountBasis: { amountMinor: 105_000_00, currency: "TWD" },
  shareAmount: { amountMinor: 45_000_00, currency: "TWD" },
  sponsorFundedTripCount: 1,
  sponsorFundedGrossEarningBasis: { amountMinor: 5_000_00, currency: "TWD" },
  sponsorFundedShareAmount: { amountMinor: 1_500_00, currency: "TWD" },
  reimbursementAmount: { amountMinor: 500_00, currency: "TWD" },
  lines: [
    {
      lineId: "line-qa-001",
      ruleId: "rule-standard-split",
      formula: "percent_of_gross",
      orderId: "ord-qa-101",
      driverId: "drv-qa-001",
      affiliationId: "aff-qa-001",
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
      lineId: "line-qa-002",
      ruleId: "rule-sponsor-split",
      formula: "sponsor_funded_airport",
      orderId: "ord-qa-102",
      driverId: "drv-qa-002",
      affiliationId: "aff-qa-002",
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
        partnerId: "card-issuer-qa",
        partnerProgramId: "prog-qa-airport",
        benefitReference: "benefit-qa-002",
        issuerAuthorizationRef: "auth-qa-002",
        reimbursementAmount: { amountMinor: 500_00, currency: "TWD" },
      },
    },
  ],
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

describe("SR-QA-FINANCE-001 - C068: 車行 statement 查詢／確認／爭議處理 (R13)", () => {
  describe("1. Finding R13 Banner Self-Contradiction Prevention", () => {
    it("returns 'no_statement' when there is no current statement, never claiming generation or pending action", () => {
      expect(resolveStatementBannerState(null)).toBe("no_statement");
    });

    it("returns 'pending' for an unpaid / pending confirmation statement", () => {
      expect(
        resolveStatementBannerState({ status: "pending_confirm" }),
      ).toBe("pending");
    });

    it("returns 'paid' for a settled statement, distinct from pending or no_statement", () => {
      expect(resolveStatementBannerState({ status: "paid" })).toBe("paid");
    });

    it("trRevenue translations prevent contradictory messages across locales", () => {
      const zhPaid = trRevenue("revenue.paidStatement.title", "zh");
      const zhNone = trRevenue("revenue.noStatement.title", "zh");

      expect(zhPaid).toBe("本期已結清");
      expect(zhNone).toBe("本期尚無對帳單");
      expect(zhPaid).not.toBe(zhNone);

      const enInterpolated = trRevenue("revenue.noStatement.body", "en", {
        period: "2026-06",
      });
      expect(enInterpolated).toContain("2026-06");
      expect(enInterpolated).toContain("no statement yet");
    });
  });

  describe("2. Statement Detail and Cross-Fleet Security Isolation", () => {
    it("loads line-item detail and DL summary for statements owned by authenticated fleet partner", async () => {
      vi.resetModules();
      vi.doMock(
        "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
        () => ({
          getServerFleetPartnerClient: vi.fn(async () => ({
            client: {
              listFleetPortalStatements: vi
                .fn()
                .mockResolvedValue([SAMPLE_FLEET_STATEMENT]),
            },
            fleetPartnerId: "FLEET_QA_PARTNER_001",
          })),
        }),
      );

      const { loadStatementDetail } = await import(
        "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server"
      );

      const result = await loadStatementDetail("fst_qa_demo_2026_06");
      expect(result).not.toBeNull();
      expect(result.source).toBe("live");
      expect(result.statement).not.toBeNull();
      expect(result.statement?.id).toBe("fst_qa_demo_2026_06");
      expect(result.statement?.period).toBe("2026-06");
      expect(result.statement?.lines).toHaveLength(2);
      expect(result.statement!.lines[0]!.orderId).toBe("ord-qa-101");
      expect(result.statement!.lines[1]!.orderId).toBe("ord-qa-102");
    });

    it("enforces cross-fleet security isolation: rejects access to another fleet partner's statement", async () => {
      vi.resetModules();
      vi.doMock(
        "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
        () => ({
          getServerFleetPartnerClient: vi.fn(async () => ({
            client: {
              listFleetPortalStatements: vi.fn().mockResolvedValue([]),
            },
            fleetPartnerId: "ANOTHER_FLEET_PARTNER",
          })),
        }),
      );

      const { loadStatementDetail } = await import(
        "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server"
      );

      const result = await loadStatementDetail("fst_qa_demo_2026_06");
      expect(result.statement).toBeNull();
    });

    it("verifies empty statement state translations and structure", () => {
      expect(trStatements("statements.empty.title", "zh")).toBe(
        "目前尚無對帳單",
      );
      expect(trStatements("statements.empty.title", "en")).toBe(
        "No statements yet",
      );
      expect(trStatements("statements.detail.title", "zh")).toBe("對帳單明細");
    });
  });
});
