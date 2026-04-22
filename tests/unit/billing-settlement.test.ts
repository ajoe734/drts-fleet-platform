import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  BillingSettlementRepository,
  type LiveSettlementTripRecord,
} from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";

const TENANT_ALPHA = "tenant-alpha";
const TENANT_BETA = "tenant-beta";

function createMarchLiveTrips(
  tenantId = TENANT_ALPHA,
): LiveSettlementTripRecord[] {
  return [
    {
      tenantId,
      driverId: "drv-live-001",
      orderId: "order-live-031",
      completedAt: "2026-03-05T09:40:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 120000,
      },
      subsidy: {
        currency: "NTD",
        amountMinor: 5000,
      },
      platformFundedDiscount: {
        currency: "NTD",
        amountMinor: 0,
      },
      pricingVersionSnapshot: "tenant-pricing-live-v1",
    },
    {
      tenantId,
      driverId: "drv-live-001",
      orderId: "order-live-032",
      completedAt: "2026-03-18T18:20:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 80000,
      },
      subsidy: {
        currency: "NTD",
        amountMinor: 0,
      },
      platformFundedDiscount: {
        currency: "NTD",
        amountMinor: 20000,
      },
      pricingVersionSnapshot: "tenant-pricing-live-v1",
    },
    {
      tenantId,
      driverId: "drv-live-002",
      orderId: "order-live-033",
      completedAt: "2026-03-22T12:00:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 150000,
      },
      subsidy: {
        currency: "NTD",
        amountMinor: 10000,
      },
      platformFundedDiscount: {
        currency: "NTD",
        amountMinor: 0,
      },
      pricingVersionSnapshot: "tenant-pricing-live-v1",
    },
  ];
}

function createRepository(
  overrides: Partial<BillingSettlementRepository> = {},
): BillingSettlementRepository {
  return {
    isEnabled: vi.fn(() => true),
    loadState: vi.fn(async () => ({
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: [],
      driverStatements: [],
      reimbursementBatches: [],
    })),
    listLiveCompletedTenantTrips: vi.fn(async () => []),
    listLiveDriverTripsInPeriod: vi.fn(async () => []),
    listLiveDriverTripsInPeriodForDriver: vi.fn(async () => []),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
    ...overrides,
  } as unknown as BillingSettlementRepository;
}

function createService(repository?: BillingSettlementRepository) {
  const auditService = new AuditNotificationService();
  const billingSettlementService = new BillingSettlementService(
    auditService,
    repository,
  );

  return {
    auditService,
    billingSettlementService,
    repository,
  };
}

describe("billing settlement service", () => {
  it("returns an explicit empty billing profile when no persisted profile exists", () => {
    const { billingSettlementService } = createService();

    const profile =
      billingSettlementService.getTenantBillingProfile(TENANT_ALPHA);

    expect(profile).toEqual({
      tenantId: TENANT_ALPHA,
      invoiceTitle: "",
      taxId: null,
      address: null,
      contactName: null,
      email: "",
      updatedAt: expect.any(String),
    });
  });

  it("updates the tenant billing profile and generates an invoice with artifact metadata for SC-030", async () => {
    const repository = createRepository({
      listLiveCompletedTenantTrips: vi.fn(async () => createMarchLiveTrips()),
    });
    const { auditService, billingSettlementService } =
      createService(repository);

    const profile = billingSettlementService.updateTenantBillingProfile(
      TENANT_ALPHA,
      {
        invoiceTitle: "Alpha Fleet Co., Ltd.",
        taxId: "24567891",
        address: "Taichung Harbor",
        contactName: "Billing Owner",
        email: "ap@alpha.example.com",
      },
      "billing-profile-request",
    );

    const invoice = await billingSettlementService.generateTenantInvoice(
      TENANT_ALPHA,
      {
        tenantId: TENANT_ALPHA,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "invoice-generate-request",
    );

    expect(profile.invoiceTitle).toBe("Alpha Fleet Co., Ltd.");
    expect(invoice.status).toBe("issued");
    expect(invoice.lines).toHaveLength(3);
    expect(invoice.artifactUrl).toContain("sig=");
    expect(invoice.artifactDownloadMetadata.kind).toBe("tenant-invoice");
    expect(invoice.artifactDownloadMetadata.signatureVersion).toBe(1);
    expect(invoice.amount.amountMinor).toBe(350000);
    expect(
      billingSettlementService.getTenantInvoice(TENANT_ALPHA, invoice.invoiceId)
        .invoiceId,
    ).toBe(invoice.invoiceId);
    expect(
      billingSettlementService.listTenantInvoices(TENANT_ALPHA),
    ).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_tenant_invoice",
    );
  });

  it("keeps tenant billing profiles and invoice reads isolated by tenant id", async () => {
    const repository = createRepository({
      listLiveCompletedTenantTrips: vi.fn(async (tenantId: string) =>
        tenantId === TENANT_ALPHA ? createMarchLiveTrips(TENANT_ALPHA) : [],
      ),
    });
    const { billingSettlementService } = createService(repository);

    billingSettlementService.updateTenantBillingProfile(TENANT_ALPHA, {
      invoiceTitle: "Tenant Alpha Billing",
      taxId: "11112222",
      address: "Alpha Road",
      contactName: "Alpha Owner",
      email: "billing@alpha.example.com",
    });
    billingSettlementService.updateTenantBillingProfile(TENANT_BETA, {
      invoiceTitle: "Tenant Beta Billing",
      taxId: "33334444",
      address: "Beta Road",
      contactName: "Beta Owner",
      email: "billing@beta.example.com",
    });

    const alphaInvoice = await billingSettlementService.generateTenantInvoice(
      TENANT_ALPHA,
      {
        tenantId: TENANT_ALPHA,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );

    expect(
      billingSettlementService.getTenantBillingProfile(TENANT_ALPHA)
        .invoiceTitle,
    ).toBe("Tenant Alpha Billing");
    expect(
      billingSettlementService.getTenantBillingProfile(TENANT_BETA)
        .invoiceTitle,
    ).toBe("Tenant Beta Billing");
    expect(billingSettlementService.listTenantInvoices(TENANT_ALPHA)).toEqual([
      expect.objectContaining({
        invoiceId: alphaInvoice.invoiceId,
        tenantId: TENANT_ALPHA,
      }),
    ]);
    expect(billingSettlementService.listTenantInvoices(TENANT_BETA)).toEqual(
      [],
    );

    expect(() =>
      billingSettlementService.getTenantInvoice(
        TENANT_BETA,
        alphaInvoice.invoiceId,
      ),
    ).toThrow();
  });

  it("rejects tenant invoice generation when x-tenant-id and command tenantId diverge", async () => {
    const { billingSettlementService } = createService();

    await expect(
      billingSettlementService.generateTenantInvoice(TENANT_ALPHA, {
        tenantId: TENANT_BETA,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "TENANT_SCOPE_MISMATCH",
        },
      },
    });
  });

  it("does not bootstrap demo billing profiles into persistence when hydrated with an empty store", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = createRepository({
      persistChanges,
      listLiveCompletedTenantTrips: vi.fn(async () => [
        {
          tenantId: "10000000-0000-0000-0000-000000000201",
          driverId: "drv-live-001",
          orderId: "live-order-001",
          completedAt: "2026-04-17T02:49:22Z",
          grossEarning: {
            currency: "NTD",
            amountMinor: 150000,
          },
        },
      ]),
    });
    const { billingSettlementService } = createService(repository);

    await billingSettlementService.onModuleInit();

    expect(persistChanges).not.toHaveBeenCalled();
    expect(
      billingSettlementService.getTenantBillingProfile(
        "10000000-0000-0000-0000-000000000201",
      ),
    ).toEqual({
      tenantId: "10000000-0000-0000-0000-000000000201",
      invoiceTitle: "",
      taxId: null,
      address: null,
      contactName: null,
      email: "",
      updatedAt: expect.any(String),
    });

    const invoice = await billingSettlementService.generateTenantInvoice(
      "10000000-0000-0000-0000-000000000201",
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

  it("publishes an immutable fee plan and generates driver statements for SC-031 from live settlement rows", async () => {
    const repository = createRepository({
      listLiveDriverTripsInPeriod: vi.fn(async () => createMarchLiveTrips()),
    });
    const { auditService, billingSettlementService } =
      createService(repository);

    const feePlan = billingSettlementService.publishDriverFeePlan(
      {
        planName: "Phase1 Driver Fee Plan",
        version: "drv-fee-v1",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      },
      "publish-fee-plan-request",
    );
    const statementsResult =
      await billingSettlementService.generateDriverStatements(
        {
          periodMonth: "2026-03",
        },
        "statement-generate-request",
      );

    const statements = billingSettlementService.listDriverStatements();
    const driverOneStatement = statements.find(
      (statement) => statement.driverId === "drv-live-001",
    );
    const driverTwoStatement = statements.find(
      (statement) => statement.driverId === "drv-live-002",
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

  it("creates reimbursement instead of reducing driver net for SC-032 from live settlement truth", async () => {
    const repository = createRepository({
      listLiveDriverTripsInPeriod: vi.fn(async () => createMarchLiveTrips()),
    });
    const { auditService, billingSettlementService } =
      createService(repository);

    billingSettlementService.publishDriverFeePlan({
      planName: "Phase1 Driver Fee Plan",
      version: "drv-fee-v1",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });

    const result = await billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const driverOneStatement = billingSettlementService
      .listDriverStatements()
      .find((statement) => statement.driverId === "drv-live-001");
    const reimbursementBatch = billingSettlementService.getReimbursementBatch(
      result.reimbursementBatchIds[0]!,
    );
    const discountedLine = driverOneStatement?.lines.find(
      (line) => line.orderId === "order-live-032",
    );

    expect(discountedLine?.netAmount.amountMinor).toBe(68000);
    expect(discountedLine?.reimbursementRequired).toBe(true);
    expect(driverOneStatement?.netAmount.amountMinor).toBe(175000);
    expect(reimbursementBatch.totalAmount.amountMinor).toBe(20000);
    expect(reimbursementBatch.items[0]?.orderId).toBe("order-live-032");
    expect(
      auditService
        .listAuditLogs()
        .some(
          (auditLog) => auditLog.actionName === "generate_reimbursement_batch",
        ),
    ).toBe(true);
  });

  it("approves and marks reimbursement paid without moving finance truth into the UI", async () => {
    const repository = createRepository({
      listLiveDriverTripsInPeriod: vi.fn(async () => createMarchLiveTrips()),
    });
    const { auditService, billingSettlementService } =
      createService(repository);

    billingSettlementService.publishDriverFeePlan({
      planName: "Phase1 Driver Fee Plan",
      version: "drv-fee-v1",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });

    const result = await billingSettlementService.generateDriverStatements({
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
    const persistChanges = vi.fn(async () => undefined);
    const repository = createRepository({
      loadState: vi.fn(async () => ({
        tenantBillingProfiles: [
          {
            tenantId: TENANT_ALPHA,
            invoiceTitle: "Persisted Billing Profile",
            taxId: "99887766",
            address: "Taichung Harbor",
            contactName: "Persisted Owner",
            email: "persisted@example.com",
            updatedAt: "2026-03-01T00:00:00Z",
          },
        ],
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
      })),
      listLiveDriverTripsInPeriod: vi.fn(async () => createMarchLiveTrips()),
      persistChanges,
    });
    const { billingSettlementService } = createService(repository);

    await billingSettlementService.onModuleInit();

    expect(
      billingSettlementService.getTenantBillingProfile(TENANT_ALPHA)
        .invoiceTitle,
    ).toBe("Persisted Billing Profile");

    billingSettlementService.publishDriverFeePlan({
      planName: "Persisted Driver Fee Plan",
      version: "drv-fee-v2",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
    });
    await billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });

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
