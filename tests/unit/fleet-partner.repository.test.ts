import { describe, expect, it, vi } from "vitest";

import { FleetPartnerRepository } from "../../apps/api/src/modules/fleet-partner/fleet-partner.repository";

describe("fleet partner repository", () => {
  it("replaces a period slice in a transaction and scopes deletion by fleet partner", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    const databaseService = {
      isEnabled: () => true,
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const repository = new FleetPartnerRepository(databaseService as never);

    await repository.replaceStatementsForPeriodMonth(
      "2026-03",
      [
        {
          statementId: "fleet-statement-fleet-demo-001-2026-03",
          fleetPartnerId: "fleet-demo-001",
          periodMonth: "2026-03",
          payoutStatus: "pending",
          grossEarningBasis: { currency: "NTD", amountMinor: 100000 },
          driverNetAmountBasis: { currency: "NTD", amountMinor: 90000 },
          shareAmount: { currency: "NTD", amountMinor: 8000 },
          sponsorFundedTripCount: 0,
          sponsorFundedGrossEarningBasis: { currency: "NTD", amountMinor: 0 },
          sponsorFundedShareAmount: { currency: "NTD", amountMinor: 0 },
          reimbursementAmount: { currency: "NTD", amountMinor: 0 },
          lines: [],
          createdAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
      ],
      "fleet-demo-001",
    );

    expect(databaseService.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "DELETE FROM billing.phase1_fleet_partner_statements",
      ),
      ["2026-03", "fleet-demo-001"],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        "INSERT INTO billing.phase1_fleet_partner_statements",
      ),
      expect.arrayContaining([
        "fleet-statement-fleet-demo-001-2026-03",
        "fleet-demo-001",
        "2026-03",
      ]),
    );
    expect(client.query).toHaveBeenNthCalledWith(4, "COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
