import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";

const DEMO_TENANT_ID = "tenant-demo-001";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createService() {
  return new BillingSettlementService(new AuditNotificationService());
}

describe("BillingSettlementService card-benefit settlement statements", () => {
  it("returns per-trip reconciliation for a period in the issuer_pays_drts direction", async () => {
    const service = createService();

    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2026-03",
    );

    expect(statement.tenantId).toBe(DEMO_TENANT_ID);
    expect(statement.period).toBe("2026-03");
    expect(statement.channelKey).toBe("partner_airport");
    expect(statement.direction).toBe("issuer_pays_drts");

    // Only the card-benefit airport trip (order-demo-032) qualifies; the
    // two enterprise_dispatch seed trips are excluded.
    expect(statement.lines).toHaveLength(1);
    const line = statement.lines[0];
    expect(line.tripId).toBe("order-demo-032");
    // fare = gross earning (driver payout stays whole)
    expect(line.fare.amountMinor).toBe(80000);
    // subsidised = platform-funded discount (20000) + subsidy (0)
    expect(line.subsidisedAmount.amountMinor).toBe(20000);
    // paid = fare - subsidised
    expect(line.paidAmount.amountMinor).toBe(60000);
  });

  it("includes benefit and issuer references plus a masked cardholder ref on every line", async () => {
    const service = createService();

    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2026-03",
    );

    for (const line of statement.lines) {
      expect(line.benefitReference).toBeTruthy();
      expect(line.issuerAuthorizationRef).toBeTruthy();
      expect(line.cardholderRefMasked).toBeTruthy();
      // masked, not the raw rider identifier
      expect(line.cardholderRefMasked).not.toBe("rider-demo-002");
      expect(line.cardholderRefMasked).toContain("...");
    }

    expect(statement.lines[0].benefitReference).toBe("benefit-bank-demo-032");
    expect(statement.lines[0].issuerAuthorizationRef).toBe(
      "issuer-auth-bank-demo-032",
    );
  });

  it("totals the issuer-payable (subsidised) amount across lines", async () => {
    const service = createService();

    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2026-03",
    );

    expect(statement.totals.tripCount).toBe(1);
    expect(statement.totals.fareTotal.amountMinor).toBe(80000);
    expect(statement.totals.subsidisedTotal.amountMinor).toBe(20000);
    expect(statement.totals.paidTotal.amountMinor).toBe(60000);
    // issuer reimburses DRTS for the subsidised portion
    expect(statement.totals.issuerPayable.amountMinor).toBe(20000);
  });

  it("exposes a stable, signed-style artifact reference and statement status", async () => {
    const service = createService();

    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2026-03",
    );

    expect(statement.artifactRef.kind).toBe("settlement_statement");
    expect(statement.artifactRef.artifactId).toBe(
      "settlement-statement-tenant-demo-001-2026-03",
    );
    expect(statement.artifactRef.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    // No tenant invoice issued for the period yet → reimbursement still due.
    expect(statement.status).toBe("due");
  });

  it("returns an empty (but well-formed) statement for a period with no card-benefit trips", async () => {
    const service = createService();

    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2025-01",
    );

    expect(statement.lines).toHaveLength(0);
    expect(statement.totals.tripCount).toBe(0);
    expect(statement.totals.issuerPayable.amountMinor).toBe(0);
    expect(statement.direction).toBe("issuer_pays_drts");
  });

  it("lists one statement per period that has card-benefit trips", async () => {
    const service = createService();

    const statements =
      await service.listTenantSettlementStatements(DEMO_TENANT_ID);

    expect(statements.map((statement) => statement.period)).toEqual([
      "2026-03",
    ]);
    expect(statements[0].lines).toHaveLength(1);
    expect(statements[0].lines[0].tripId).toBe("order-demo-032");
  });

  it("rejects a malformed period", async () => {
    const service = createService();

    await expect(
      service.getTenantSettlementStatement(DEMO_TENANT_ID, "2026/03"),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "VALIDATION_ERROR",
        },
      },
    });
  });
});
