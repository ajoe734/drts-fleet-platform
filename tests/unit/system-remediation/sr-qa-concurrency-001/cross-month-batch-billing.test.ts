import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

describe("SR-QA-CONCURRENCY-001: C089 Cross-Month Batch Billing, Rerun & Reconciliation Verification", () => {
  const DEMO_TENANT_ID = "tenant-demo-001";

  function setupService() {
    const store = new InMemoryDocumentArtifactStore();
    const auditService = new AuditNotificationService();
    const service = new BillingSettlementService(
      auditService,
      undefined,
      undefined,
      undefined,
      store,
    );
    return { service, store };
  }

  it("Case 1 (Boundary & Timezone): Computes precise UTC month boundaries across 28/30/31-day months and rejects invalid periods", async () => {
    const { service } = setupService();

    // Call private getPeriodMonthRange through service indexing
    const getRange = (
      service as unknown as {
        getPeriodMonthRange: (periodMonth: string) => {
          periodStart: string;
          periodEnd: string;
        };
      }
    ).getPeriodMonthRange.bind(service);

    // 1. 31-day month (August 2026)
    const aug = getRange("2026-08");
    expect(aug.periodStart).toBe("2026-08-01T00:00:00.000Z");
    expect(aug.periodEnd).toBe("2026-08-31T23:59:59.999Z");

    // 2. 30-day month (September 2026)
    const sep = getRange("2026-09");
    expect(sep.periodStart).toBe("2026-09-01T00:00:00.000Z");
    expect(sep.periodEnd).toBe("2026-09-30T23:59:59.999Z");

    // 3. 28-day February (2026 non-leap year)
    const feb = getRange("2026-02");
    expect(feb.periodStart).toBe("2026-02-01T00:00:00.000Z");
    expect(feb.periodEnd).toBe("2026-02-28T23:59:59.999Z");

    // 4. Year boundary (December 2026 -> January 2027)
    const dec = getRange("2026-12");
    expect(dec.periodStart).toBe("2026-12-01T00:00:00.000Z");
    expect(dec.periodEnd).toBe("2026-12-31T23:59:59.999Z");

    // 5. Negative: invalid formats
    const invalidFormats = [
      "2026-13",
      "2026-00",
      "2026-8",
      "2026/08",
      "invalid",
    ];
    for (const fmt of invalidFormats) {
      expect(() => getRange(fmt)).toThrowError(ApiRequestError);
    }
  });

  it("Case 2 (Boundary Partition): Strictly partitions trips across millisecond month boundaries with zero overlap", async () => {
    const { service } = setupService();
    const getRange = (
      service as unknown as {
        getPeriodMonthRange: (periodMonth: string) => {
          periodStart: string;
          periodEnd: string;
        };
      }
    ).getPeriodMonthRange.bind(service);

    const aug = getRange("2026-08");
    const sep = getRange("2026-09");

    // Millisecond-adjacent timestamps
    const lastMsJuly = "2026-07-31T23:59:59.999Z";
    const firstMsAugust = "2026-08-01T00:00:00.000Z";
    const lastMsAugust = "2026-08-31T23:59:59.999Z";
    const firstMsSeptember = "2026-09-01T00:00:00.000Z";

    function isInRange(
      time: string,
      range: { periodStart: string; periodEnd: string },
    ) {
      const t = Date.parse(time);
      return (
        t >= Date.parse(range.periodStart) && t <= Date.parse(range.periodEnd)
      );
    }

    // July last ms
    expect(isInRange(lastMsJuly, aug)).toBe(false);
    expect(isInRange(lastMsJuly, sep)).toBe(false);

    // August first ms
    expect(isInRange(firstMsAugust, aug)).toBe(true);
    expect(isInRange(firstMsAugust, sep)).toBe(false);

    // August last ms
    expect(isInRange(lastMsAugust, aug)).toBe(true);
    expect(isInRange(lastMsAugust, sep)).toBe(false);

    // September first ms
    expect(isInRange(firstMsSeptember, aug)).toBe(false);
    expect(isInRange(firstMsSeptember, sep)).toBe(true);
  });

  it("Case 3 (Rerun Idempotency): Running tenant invoice generation twice produces identical invoice and artifact without duplication", async () => {
    const { service, store } = setupService();

    // Use seed period with eligible trips (March 2026)
    const periodStart = "2026-03-01T00:00:00.000Z";
    const periodEnd = "2026-03-31T23:59:59.999Z";

    // Run 1
    const invoice1 = await service.generateTenantInvoice(DEMO_TENANT_ID, {
      tenantId: DEMO_TENANT_ID,
      periodStart,
      periodEnd,
    });

    expect(invoice1.invoiceId).toBeDefined();
    expect(invoice1.tenantId).toBe(DEMO_TENANT_ID);
    expect(invoice1.lines.length).toBeGreaterThan(0);
    expect(invoice1.amount.amountMinor).toBeGreaterThan(0);

    const artifactBytes1 = store.get(
      "tenant-invoice",
      invoice1.invoiceId,
    )?.bytes;
    expect(artifactBytes1).toBeDefined();

    // Run 2 (re-run of the exact same month batch)
    const invoice2 = await service.generateTenantInvoice(DEMO_TENANT_ID, {
      tenantId: DEMO_TENANT_ID,
      periodStart,
      periodEnd,
    });

    // Verify identical invoice returned
    expect(invoice2.invoiceId).toBe(invoice1.invoiceId);
    expect(invoice2.amount).toEqual(invoice1.amount);
    expect(invoice2.lines).toEqual(invoice1.lines);
    expect(invoice2.createdAt).toBe(invoice1.createdAt);

    // Verify invoice list contains exactly 1 invoice for this period
    const allInvoices = await service.listTenantInvoices(DEMO_TENANT_ID);
    const matchingInvoices = allInvoices.filter(
      (inv) => inv.periodStart === periodStart && inv.periodEnd === periodEnd,
    );
    expect(matchingInvoices).toHaveLength(1);
  });

  it("Case 4 (Rerun & Driver Statements): Generates driver statements idempotently and skips duplicate generation on rerun", async () => {
    const { service } = setupService();
    const periodMonth = "2026-03";

    // Publish active driver fee plan first (prerequisite for driver statements)
    await service.publishDriverFeePlan({
      planName: "Standard Driver Fee Plan",
      version: "v2026.03",
      serviceFeeBps: 1200,
      reimbursementMode: "automatic_bank_transfer",
    });

    // First batch generation
    const batchResult1 = await service.generateDriverStatements({
      periodMonth,
    });

    expect(batchResult1.items.length).toBeGreaterThan(0);
    const firstStatement = batchResult1.items[0]!;
    expect(firstStatement.periodMonth).toBe(periodMonth);
    expect(firstStatement.statementId).toBeDefined();

    // Re-run batch generation for the same period
    const batchResult2 = await service.generateDriverStatements({
      periodMonth,
    });

    // Re-run returns the same existing statements without duplicating
    expect(batchResult2.items.length).toBe(batchResult1.items.length);
    expect(batchResult2.items[0]?.statementId).toBe(firstStatement.statementId);

    // List driver statements shows no duplicated statements for that period
    const statements = await service.listDriverStatements(
      firstStatement.tenantId,
      periodMonth,
    );
    const driverStatements = statements.filter(
      (s) => s.driverId === firstStatement.driverId,
    );
    expect(driverStatements).toHaveLength(1);
  });

  it("Case 5 (Financial Reconciliation): Sum of individual trip lines matches invoice amount exactly with 1:1 order traceability", async () => {
    const { service } = setupService();

    const periodStart = "2026-03-01T00:00:00.000Z";
    const periodEnd = "2026-03-31T23:59:59.999Z";

    const invoice = await service.generateTenantInvoice(DEMO_TENANT_ID, {
      tenantId: DEMO_TENANT_ID,
      periodStart,
      periodEnd,
    });

    // Reconcile: Sum of lines must equal total amount
    const sumLineAmountMinor = invoice.lines.reduce(
      (acc, line) => acc + line.amount.amountMinor,
      0,
    );
    expect(sumLineAmountMinor).toBe(invoice.amount.amountMinor);

    // Traceability: every line must link to a valid non-empty orderId
    for (const line of invoice.lines) {
      expect(line.orderId).toBeTruthy();
      expect(typeof line.orderId).toBe("string");
      expect(line.amount.currency).toBe(invoice.amount.currency);
      expect(line.channelKey).toBeDefined();
    }

    // Card-benefit settlement statement reconciliation
    const statement = await service.getTenantSettlementStatement(
      DEMO_TENANT_ID,
      "2026-03",
    );
    expect(statement.lines.length).toBeGreaterThan(0);

    const sumStatementPaidMinor = statement.lines.reduce(
      (acc, line) => acc + line.paidAmount.amountMinor,
      0,
    );
    const sumStatementSubsidisedMinor = statement.lines.reduce(
      (acc, line) => acc + line.subsidisedAmount.amountMinor,
      0,
    );
    const sumStatementFareMinor = statement.lines.reduce(
      (acc, line) => acc + line.fare.amountMinor,
      0,
    );

    // Fundamental accounting constraint: Paid + Subsidised = Fare
    expect(sumStatementPaidMinor + sumStatementSubsidisedMinor).toBe(
      sumStatementFareMinor,
    );
  });
});
