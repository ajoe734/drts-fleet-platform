import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditService = new AuditNotificationService();
  const billingSettlementService = new BillingSettlementService(auditService);

  return {
    auditService,
    billingSettlementService,
  };
}

describe("billing settlement service", () => {
  it("updates the tenant billing profile and generates an invoice with artifact metadata for SC-030", async () => {
    const { auditService, billingSettlementService } = createService();

    const profile = billingSettlementService.updateTenantBillingProfile(
      {
        invoiceTitle: "Demo Tenant Co., Ltd.",
        taxId: "24567891",
        address: "Taichung Harbor",
        contactName: "Billing Owner",
        email: "ap@demo-tenant.example.com",
      },
      "billing-profile-request",
    );

    const invoice = await billingSettlementService.generateTenantInvoice(
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "invoice-generate-request",
    );

    expect(profile.invoiceTitle).toBe("Demo Tenant Co., Ltd.");
    expect(invoice.status).toBe("issued");
    expect(invoice.lines).toHaveLength(3);
    expect(invoice.artifactUrl).toContain("sig=");
    expect(invoice.artifactDownloadMetadata.kind).toBe("tenant-invoice");
    expect(invoice.artifactDownloadMetadata.signatureVersion).toBe(1);
    expect(invoice.amount.amountMinor).toBe(350000);
    expect(
      billingSettlementService.getTenantInvoice(invoice.invoiceId).invoiceId,
    ).toBe(invoice.invoiceId);
    expect(billingSettlementService.listTenantInvoices()).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_tenant_invoice",
    );
  });

  it("generates a tenant invoice from live completed owned trips when persistence is enabled", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        tenantBillingProfile: null,
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
      })),
      listLiveCompletedTenantTrips: vi.fn(async () => [
        {
          tenantId: "10000000-0000-0000-0000-000000000201",
          driverId: "drv-demo-001",
          orderId: "live-order-001",
          completedAt: "2026-04-17T02:49:22Z",
          grossEarning: {
            currency: "NTD",
            amountMinor: 150000,
          },
        },
      ]),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;
    const billingSettlementService = new BillingSettlementService(
      auditService,
      repository,
    );

    await billingSettlementService.onModuleInit();

    const invoice = await billingSettlementService.generateTenantInvoice(
      {
        tenantId: "10000000-0000-0000-0000-000000000201",
        periodStart: "2026-04-17T00:00:00Z",
        periodEnd: "2026-04-17T03:00:00Z",
      },
      "live-invoice-request",
    );

    expect(invoice.status).toBe("issued");
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]?.orderId).toBe("live-order-001");
    expect(invoice.amount.amountMinor).toBe(150000);
  });

  it("publishes an immutable fee plan and generates driver statements for SC-031", () => {
    const { auditService, billingSettlementService } = createService();

    const feePlan = billingSettlementService.publishDriverFeePlan(
      {
        planName: "Phase1 Driver Fee Plan",
        version: "drv-fee-v1",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      },
      "publish-fee-plan-request",
    );
    const statementsResult = billingSettlementService.generateDriverStatements(
      {
        periodMonth: "2026-03",
      },
      "statement-generate-request",
    );

    const statements = billingSettlementService.listDriverStatements();
    const driverOneStatement = statements.find(
      (statement) => statement.driverId === "drv-demo-001",
    );
    const driverTwoStatement = statements.find(
      (statement) => statement.driverId === "drv-demo-002",
    );

    expect(feePlan.status).toBe("published");
    expect(statementsResult.items).toHaveLength(2);
    expect(driverOneStatement?.feePlanVersion).toBe("drv-fee-v1");
    expect(driverOneStatement?.grossEarning.amountMinor).toBe(200000);
    expect(driverOneStatement?.serviceFee.amountMinor).toBe(30000);
    expect(driverOneStatement?.subsidy.amountMinor).toBe(5000);
    expect(driverOneStatement?.netAmount.amountMinor).toBe(175000);
    expect(driverTwoStatement?.grossEarning.amountMinor).toBe(150000);
    expect(driverTwoStatement?.serviceFee.amountMinor).toBe(22500);
    expect(driverTwoStatement?.subsidy.amountMinor).toBe(10000);
    expect(driverTwoStatement?.netAmount.amountMinor).toBe(137500);
    expect(
      auditService
        .listNotifications()
        .some((notification) => notification.channel === "driver_task"),
    ).toBe(true);

    try {
      billingSettlementService.publishDriverFeePlan({
        planName: "Phase1 Driver Fee Plan",
        version: "drv-fee-v1",
        serviceFeeBps: 1800,
        reimbursementMode: "platform_funded",
      });
      expect.unreachable("published fee plan versions must stay immutable");
    } catch (error) {
      const response = (
        error as {
          getResponse?: () => {
            error?: {
              code?: string;
            };
          };
        }
      ).getResponse?.();

      expect(response?.error?.code).toBe("FEE_PLAN_IMMUTABLE");
    }
  });

  it("creates reimbursement instead of reducing driver net for SC-032", () => {
    const { auditService, billingSettlementService } = createService();

    billingSettlementService.publishDriverFeePlan({
      planName: "Phase1 Driver Fee Plan",
      version: "drv-fee-v1",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });

    const result = billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const driverOneStatement = billingSettlementService
      .listDriverStatements()
      .find((statement) => statement.driverId === "drv-demo-001");
    const reimbursementBatch = billingSettlementService.getReimbursementBatch(
      result.reimbursementBatchIds[0]!,
    );
    const discountedLine = driverOneStatement?.lines.find(
      (line) => line.orderId === "order-demo-032",
    );

    expect(discountedLine?.netAmount.amountMinor).toBe(68000);
    expect(discountedLine?.reimbursementRequired).toBe(true);
    expect(driverOneStatement?.netAmount.amountMinor).toBe(175000);
    expect(reimbursementBatch.totalAmount.amountMinor).toBe(20000);
    expect(reimbursementBatch.items[0]?.orderId).toBe("order-demo-032");
    expect(
      auditService
        .listAuditLogs()
        .some(
          (auditLog) => auditLog.actionName === "generate_reimbursement_batch",
        ),
    ).toBe(true);
  });

  it("approves and marks reimbursement paid without moving finance truth into the UI", () => {
    const { auditService, billingSettlementService } = createService();

    billingSettlementService.publishDriverFeePlan({
      planName: "Phase1 Driver Fee Plan",
      version: "drv-fee-v1",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });

    const result = billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const batchId = result.reimbursementBatchIds[0]!;
    const pendingBatch =
      billingSettlementService.getReimbursementBatch(batchId);

    const approvedBatch = billingSettlementService.approveReimbursementBatch(
      batchId,
      {
        statementId: pendingBatch.statementId,
      },
      "reimbursement-approve-request",
    );
    const paidBatch = billingSettlementService.markReimbursementPaid(
      batchId,
      {
        remittanceProofId: "remit-proof-001",
        paidAt: "2026-04-01T10:30:00Z",
      },
      "reimbursement-paid-request",
    );
    const statement = billingSettlementService.getDriverStatement(
      pendingBatch.statementId,
    );

    expect(approvedBatch.approvedAt).toBeTruthy();
    expect(paidBatch.status).toBe("paid");
    expect(paidBatch.remittanceProofId).toBe("remit-proof-001");
    expect(paidBatch.paidAt).toBe("2026-04-01T10:30:00Z");
    expect(statement.payoutStatus).toBe("paid");
    expect(
      billingSettlementService.listReimbursementBatches({
        driverId: paidBatch.driverId,
      }),
    ).toHaveLength(1);
    expect(
      auditService.listAuditLogs().map((record) => record.actionName),
    ).toEqual(
      expect.arrayContaining([
        "approve_reimbursement_batch",
        "mark_reimbursement_paid",
      ]),
    );
  });

  it("rehydrates persisted billing state and writes fee-plan and statement updates through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        tenantBillingProfile: {
          tenantId: "tenant-demo-001",
          invoiceTitle: "Persisted Billing Profile",
          taxId: "99887766",
          address: "Taichung Harbor",
          contactName: "Persisted Owner",
          email: "persisted@example.com",
          updatedAt: "2026-03-01T00:00:00Z",
        },
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;

    const billingSettlementService = new BillingSettlementService(
      auditService,
      repository,
    );

    await billingSettlementService.onModuleInit();

    expect(
      billingSettlementService.getTenantBillingProfile().invoiceTitle,
    ).toBe("Persisted Billing Profile");

    billingSettlementService.publishDriverFeePlan({
      planName: "Persisted Driver Fee Plan",
      version: "drv-fee-v2",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });
    billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });

    await Promise.resolve();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        driverFeePlans: [
          expect.objectContaining({
            version: "drv-fee-v2",
            status: "published",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        driverStatements: expect.arrayContaining([
          expect.objectContaining({
            periodMonth: "2026-03",
          }),
        ]),
      }),
    );
  });
});
