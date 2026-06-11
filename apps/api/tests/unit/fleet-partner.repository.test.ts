import { describe, expect, it, vi } from "vitest";

import type { FleetPartnerStatementRecord } from "@drts/contracts";

import { FleetPartnerRepository } from "../../src/modules/fleet-partner/fleet-partner.repository";

function createStatement(
  overrides: Partial<FleetPartnerStatementRecord> = {},
): FleetPartnerStatementRecord {
  return {
    statementId: "fleet-statement-fleet-demo-001-2026-05",
    fleetPartnerId: "fleet-demo-001",
    periodMonth: "2026-05",
    payoutStatus: "pending",
    grossEarningBasis: { currency: "NTD", amountMinor: 250_000 },
    driverNetAmountBasis: { currency: "NTD", amountMinor: 180_000 },
    shareAmount: { currency: "NTD", amountMinor: 70_000 },
    sponsorFundedTripCount: 2,
    sponsorFundedGrossEarningBasis: { currency: "NTD", amountMinor: 120_000 },
    sponsorFundedShareAmount: { currency: "NTD", amountMinor: 35_000 },
    reimbursementAmount: { currency: "NTD", amountMinor: 20_000 },
    lines: [],
    createdAt: "2026-05-13T10:00:00.000Z",
    updatedAt: "2026-05-13T10:10:00.000Z",
    ...overrides,
  };
}

describe("fleet partner repository statement persistence", () => {
  it("persists sponsor-funded attribution columns alongside the JSON record", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new FleetPartnerRepository({
      isEnabled: () => true,
      query,
    } as never);
    const statement = createStatement();

    await repository.persistChanges({ statements: [statement] });

    const call = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        "INSERT INTO billing.phase1_fleet_partner_statements",
      ),
    ) as [string, unknown[]] | undefined;
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("sponsor_funded_trip_count");
    expect(call?.[0]).toContain(
      "sponsor_funded_gross_earning_basis_amount_minor",
    );
    expect(call?.[0]).toContain("reimbursement_amount_amount_minor");
    expect(call?.[1]).toEqual([
      statement.statementId,
      statement.fleetPartnerId,
      statement.periodMonth,
      statement.payoutStatus,
      statement.sponsorFundedTripCount,
      statement.sponsorFundedGrossEarningBasis.amountMinor,
      statement.sponsorFundedGrossEarningBasis.currency,
      statement.sponsorFundedShareAmount.amountMinor,
      statement.sponsorFundedShareAmount.currency,
      statement.reimbursementAmount.amountMinor,
      statement.reimbursementAmount.currency,
      statement.createdAt,
      statement.updatedAt,
      JSON.stringify(statement),
    ]);
  });

  it("hydrates sponsor-funded attribution from row columns when loading state", async () => {
    const statement = createStatement({
      sponsorFundedTripCount: 0,
      sponsorFundedGrossEarningBasis: { currency: "NTD", amountMinor: 0 },
      sponsorFundedShareAmount: { currency: "NTD", amountMinor: 0 },
      reimbursementAmount: { currency: "NTD", amountMinor: 0 },
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            record: statement,
            sponsor_funded_trip_count: 3,
            sponsor_funded_gross_earning_basis_amount_minor: 155_000,
            sponsor_funded_gross_earning_basis_currency: "NTD",
            sponsor_funded_share_amount_amount_minor: 44_000,
            sponsor_funded_share_amount_currency: "NTD",
            reimbursement_amount_amount_minor: 21_000,
            reimbursement_amount_currency: "NTD",
          },
        ],
      });
    const repository = new FleetPartnerRepository({
      isEnabled: () => true,
      query,
    } as never);

    const state = await repository.loadState();

    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]).toMatchObject({
      sponsorFundedTripCount: 3,
      sponsorFundedGrossEarningBasis: {
        currency: "NTD",
        amountMinor: 155_000,
      },
      sponsorFundedShareAmount: {
        currency: "NTD",
        amountMinor: 44_000,
      },
      reimbursementAmount: {
        currency: "NTD",
        amountMinor: 21_000,
      },
    });
  });
});
