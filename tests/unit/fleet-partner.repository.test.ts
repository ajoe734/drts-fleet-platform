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
    const calls = client.query.mock.calls as unknown as [
      string,
      unknown[] | undefined,
    ][];
    const deleteIndex = calls.findIndex(([sql]) =>
      sql.includes("DELETE FROM billing.phase1_fleet_partner_statements"),
    );
    const insertIndex = calls.findIndex(([sql]) =>
      sql.includes("INSERT INTO billing.phase1_fleet_partner_statements"),
    );
    const lockIndex = calls.findIndex(([sql]) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    const payoutReadIndex = calls.findIndex(
      ([sql]) => sql.includes("payout_status") && sql.includes("FOR UPDATE"),
    );
    expect(lockIndex).toBeGreaterThan(0);
    expect(calls[lockIndex]![1]).toEqual([
      "fleet-statement-decision:fleet-statement-fleet-demo-001-2026-03",
    ]);
    expect(payoutReadIndex).toBeGreaterThan(lockIndex);
    expect(deleteIndex).toBeGreaterThan(payoutReadIndex);
    expect(calls[deleteIndex]![1]).toEqual(["2026-03", "fleet-demo-001"]);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(calls[insertIndex]![1]).toEqual(
      expect.arrayContaining([
        "fleet-statement-fleet-demo-001-2026-03",
        "fleet-demo-001",
        "2026-03",
      ]),
    );
    expect(calls.at(-1)).toEqual(["COMMIT"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
