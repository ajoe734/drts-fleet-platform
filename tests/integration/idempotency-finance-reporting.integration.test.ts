import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../apps/api/src/common/idempotency";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ReportingFilingController } from "../../apps/api/src/modules/reporting-filing/reporting-filing.controller";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import type {
  ApproveReimbursementBatchCommand,
  CreateReportJobCommand,
  GenerateDriverStatementCommand,
  GenerateFilingPackageCommand,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";

const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  CONFLICT: 409,
};

function setupFinanceAndReportingHarness() {
  const auditService = new AuditNotificationService();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);

  const billingSettlementService = new BillingSettlementService(auditService);
  billingSettlementService.publishDriverFeePlan({
    planName: "standard-fee-plan",
    version: "v1",
    serviceFeeBps: 1000,
    reimbursementMode: "platform_funded",
  });

  const billingSettlementController = new BillingSettlementController(
    billingSettlementService,
    idempotencyService,
  );

  const reportingFilingService = new ReportingFilingService(auditService);
  const reportingFilingController = new ReportingFilingController(
    reportingFilingService,
    idempotencyService,
  );

  return {
    auditService,
    idempotencyRepository,
    idempotencyService,
    billingSettlementService,
    billingSettlementController,
    reportingFilingService,
    reportingFilingController,
  };
}

describe("CONF-IDEM-003: Idempotency for Finance & Reporting Commands", () => {
  describe("Driver Statement / Payout Generation (POST /driver-statements/generate)", () => {
    it("rejects request when Idempotency-Key header is missing", async () => {
      const { billingSettlementController } = setupFinanceAndReportingHarness();

      const command: GenerateDriverStatementCommand = {
        periodMonth: "2026-03",
        driverId: "drv-demo-001",
      };

      await expect(
        billingSettlementController.generateDriverStatements(
          command,
          undefined,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await billingSettlementController.generateDriverStatements(
          command,
          undefined,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      }
    });

    it("rejects request when Idempotency-Key exceeds 255 characters", async () => {
      const { billingSettlementController } = setupFinanceAndReportingHarness();

      const command: GenerateDriverStatementCommand = {
        periodMonth: "2026-03",
        driverId: "drv-demo-001",
      };
      const oversizedKey = "k".repeat(256);

      await expect(
        billingSettlementController.generateDriverStatements(
          command,
          oversizedKey,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await billingSettlementController.generateDriverStatements(
          command,
          oversizedKey,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_TOO_LONG");
      }
    });

    it("executes fresh on unseen key and replays identical response on repeated key", async () => {
      const { billingSettlementController, idempotencyRepository } =
        setupFinanceAndReportingHarness();

      const command: GenerateDriverStatementCommand = {
        periodMonth: "2026-03",
        driverId: "drv-demo-001",
      };
      const idempotencyKey = "driver-payout-key-001";

      // 1. First execution
      const firstResponse =
        await billingSettlementController.generateDriverStatements(
          command,
          idempotencyKey,
          "req-001",
        );

      expect(firstResponse.data.items).toBeDefined();
      expect(firstResponse.data.items.length).toBeGreaterThan(0);
      const generatedStatementId = firstResponse.data.items[0]?.statementId;

      // Verify stored record in repository
      const record = await idempotencyRepository.findByKey(
        "billing:payout:driver:drv-demo-001",
        idempotencyKey,
      );
      expect(record).not.toBeNull();
      expect(record?.status).toBe("completed");
      expect(record?.statusCode).toBe(200);

      // 2. Second execution with identical key and payload (Replay)
      const replayResponse =
        await billingSettlementController.generateDriverStatements(
          command,
          idempotencyKey,
          "req-002",
        );

      expect(replayResponse.data.items).toBeDefined();
      expect(replayResponse.data.items[0]?.statementId).toBe(
        generatedStatementId,
      );
      expect(replayResponse.data.reimbursementBatchIds).toEqual(
        firstResponse.data.reimbursementBatchIds,
      );
    });

    it("rejects repeated key with differing payload with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const { billingSettlementController } = setupFinanceAndReportingHarness();

      const idempotencyKey = "driver-payout-key-conflict";

      // First call
      await billingSettlementController.generateDriverStatements(
        {
          periodMonth: "2026-03",
          driverId: "drv-demo-001",
        },
        idempotencyKey,
      );

      // Second call with different payload for the same driver (different periodMonth)
      try {
        await billingSettlementController.generateDriverStatements(
          {
            periodMonth: "2026-04",
            driverId: "drv-demo-001",
          },
          idempotencyKey,
        );
        expect.unreachable("Should have thrown 409 conflict");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REUSED");
      }
    });
  });

  describe("Reimbursement Batch Approval (POST /reimbursements/:batchId/approve)", () => {
    it("rejects request when Idempotency-Key header is missing", async () => {
      const { billingSettlementController, billingSettlementService } =
        setupFinanceAndReportingHarness();

      // Generate statements to produce a reimbursement batch
      const genResult = await billingSettlementService.generateDriverStatements(
        {
          periodMonth: "2026-03",
          driverId: "drv-demo-001",
        },
      );
      const batchId = genResult.reimbursementBatchIds[0]!;
      const batch = billingSettlementService.getReimbursementBatch(batchId);

      const command: ApproveReimbursementBatchCommand = {
        statementId: batch.statementId,
      };

      try {
        await billingSettlementController.approveReimbursementBatch(
          batchId,
          command,
          undefined,
        );
        expect.unreachable("Should have thrown 400 IDEMPOTENCY_KEY_REQUIRED");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      }
    });

    it("approves on unseen key and replays without second audit/notice on repeat", async () => {
      const {
        billingSettlementController,
        billingSettlementService,
        auditService,
        idempotencyRepository,
      } = setupFinanceAndReportingHarness();

      const genResult = await billingSettlementService.generateDriverStatements(
        {
          periodMonth: "2026-03",
          driverId: "drv-demo-001",
        },
      );
      const batchId = genResult.reimbursementBatchIds[0]!;
      const batch = billingSettlementService.getReimbursementBatch(batchId);

      const command: ApproveReimbursementBatchCommand = {
        statementId: batch.statementId,
      };
      const idempotencyKey = "reimburse-approve-key-001";

      // First execution
      const firstResponse =
        await billingSettlementController.approveReimbursementBatch(
          batchId,
          command,
          idempotencyKey,
          "req-approve-1",
        );

      expect(firstResponse.data.approvedAt).toBeTruthy();

      const approveAudits = auditService
        .listAuditLogs()
        .filter((l) => l.actionName === "approve_reimbursement_batch");
      expect(approveAudits).toHaveLength(1);

      // Verify idempotency record
      const record = await idempotencyRepository.findByKey(
        `billing:reimbursement_batch:${batchId}:approve`,
        idempotencyKey,
      );
      expect(record?.status).toBe("completed");

      // Repeated execution (Replay)
      const replayResponse =
        await billingSettlementController.approveReimbursementBatch(
          batchId,
          command,
          idempotencyKey,
          "req-approve-2",
        );

      expect(replayResponse.data.approvedAt).toBe(
        firstResponse.data.approvedAt,
      );

      // No duplicate approve audit was recorded on replay
      const approveAuditsAfterReplay = auditService
        .listAuditLogs()
        .filter((l) => l.actionName === "approve_reimbursement_batch");
      expect(approveAuditsAfterReplay).toHaveLength(1);
    });

    it("rejects repeated key with differing statementId payload with 409 conflict", async () => {
      const { billingSettlementController, billingSettlementService } =
        setupFinanceAndReportingHarness();

      const genResult = await billingSettlementService.generateDriverStatements(
        {
          periodMonth: "2026-03",
          driverId: "drv-demo-001",
        },
      );
      const batchId = genResult.reimbursementBatchIds[0]!;
      const batch = billingSettlementService.getReimbursementBatch(batchId);

      const idempotencyKey = "reimburse-conflict-key";

      await billingSettlementController.approveReimbursementBatch(
        batchId,
        { statementId: batch.statementId },
        idempotencyKey,
      );

      try {
        await billingSettlementController.approveReimbursementBatch(
          batchId,
          { statementId: "statement-different-999" },
          idempotencyKey,
        );
        expect.unreachable("Should have thrown 409 conflict");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REUSED");
      }
    });
  });

  describe("Report Job Creation (POST /reports/jobs and POST /tenant/reports/jobs)", () => {
    it("rejects request when Idempotency-Key header is missing", async () => {
      const { reportingFilingController } = setupFinanceAndReportingHarness();

      const command: CreateReportJobCommand = {
        jobType: "six_month_operations_summary",
        format: "csv",
      };

      try {
        await reportingFilingController.createReportJob(
          command,
          null,
          undefined,
        );
        expect.unreachable("Should have thrown 400 IDEMPOTENCY_KEY_REQUIRED");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      }
    });

    it("creates one job on first call and creates no second job on repeat", async () => {
      const { reportingFilingController, reportingFilingService } =
        setupFinanceAndReportingHarness();

      const command: CreateReportJobCommand = {
        jobType: "six_month_operations_summary",
        format: "csv",
        filters: { region: "north" },
      };
      const idempotencyKey = "report-job-key-001";

      const firstResponse = await reportingFilingController.createReportJob(
        command,
        null,
        idempotencyKey,
      );

      expect(firstResponse.data.jobId).toBeTruthy();
      expect(firstResponse.data.status).toBe("queued");

      const jobsAfterFirst = reportingFilingService.listReportJobs();
      expect(jobsAfterFirst).toHaveLength(1);

      // Replay
      const replayResponse = await reportingFilingController.createReportJob(
        command,
        null,
        idempotencyKey,
      );

      expect(replayResponse.data.jobId).toBe(firstResponse.data.jobId);
      expect(replayResponse.data.status).toBe("queued");

      // Critical: No second job was added to reportingFilingService
      const jobsAfterReplay = reportingFilingService.listReportJobs();
      expect(jobsAfterReplay).toHaveLength(1);
    });

    it("isolates tenant report jobs by tenant scope", async () => {
      const { reportingFilingController, reportingFilingService } =
        setupFinanceAndReportingHarness();

      const command: CreateReportJobCommand = {
        // Was "tenant_operations_summary", which is not a report type at all.
        // This case is about idempotency scoping between tenants, so it needs
        // any real tenant-scoped report.
        jobType: "monthly_trip_report",
        format: "csv",
      };
      const sharedKey = "tenant-shared-report-key";

      // Tenant A
      const tenantAResp = await reportingFilingController.createTenantReportJob(
        command,
        null,
        "tenant-alpha",
        sharedKey,
      );

      // Tenant B using same key name should not collide because scope is tenant-isolated
      const tenantBResp = await reportingFilingController.createTenantReportJob(
        command,
        null,
        "tenant-beta",
        sharedKey,
      );

      expect(tenantAResp.data.jobId).not.toBe(tenantBResp.data.jobId);

      const allJobs = reportingFilingService.listReportJobs();
      expect(allJobs).toHaveLength(2);
    });

    it("rejects repeated key with differing payload with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const { reportingFilingController } = setupFinanceAndReportingHarness();

      const idempotencyKey = "report-job-conflict-key";

      await reportingFilingController.createReportJob(
        {
          jobType: "six_month_operations_summary",
          format: "csv",
          filters: { region: "north" },
        },
        null,
        idempotencyKey,
      );

      try {
        await reportingFilingController.createReportJob(
          {
            jobType: "six_month_operations_summary",
            format: "xlsx", // differing format
            filters: { region: "north" },
          },
          null,
          idempotencyKey,
        );
        expect.unreachable("Should have thrown 409 conflict");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REUSED");
      }
    });
  });

  describe("Filing Package Generation (POST /filing-packages/generate)", () => {
    it("rejects request when Idempotency-Key header is missing", async () => {
      const { reportingFilingController } = setupFinanceAndReportingHarness();

      const command: GenerateFilingPackageCommand = {
        packageType: "monthly_report",
        scope: { month: "2026-04" },
      };

      try {
        await reportingFilingController.generateFilingPackage(
          command,
          null,
          undefined,
        );
        expect.unreachable("Should have thrown 400 IDEMPOTENCY_KEY_REQUIRED");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      }
    });

    it("creates exactly one filing package and preserves manifest/checksum immutability on replay", async () => {
      const { reportingFilingController, reportingFilingService } =
        setupFinanceAndReportingHarness();

      const command: GenerateFilingPackageCommand = {
        packageType: "monthly_report",
        scope: { month: "2026-04" },
        period: { month: "2026-04" },
      };
      const idempotencyKey = "filing-pkg-key-001";

      const firstResponse =
        await reportingFilingController.generateFilingPackage(
          command,
          null,
          idempotencyKey,
        );

      expect(firstResponse.data.packageId).toBeTruthy();
      expect(firstResponse.data.status).toBe("queued");

      const packagesAfterFirst = reportingFilingService.listFilingPackages();
      expect(packagesAfterFirst).toHaveLength(1);

      // Replay
      const replayResponse =
        await reportingFilingController.generateFilingPackage(
          command,
          null,
          idempotencyKey,
        );

      expect(replayResponse.data.packageId).toBe(firstResponse.data.packageId);

      // Critical: No second filing package was generated
      const packagesAfterReplay = reportingFilingService.listFilingPackages();
      expect(packagesAfterReplay).toHaveLength(1);

      // Allow background completion
      await Promise.resolve();
      await Promise.resolve();

      const completedPackage = reportingFilingService.getFilingPackage(
        firstResponse.data.packageId,
      );
      expect(completedPackage.status).toBe("completed");
      expect(completedPackage.immutable).toBe(true);
      expect(completedPackage.manifestHash).toBeTruthy();
      expect(completedPackage.manifest?.checksum).toBe(
        completedPackage.manifestHash,
      );
    });

    it("rejects repeated key with differing packageType with 409 conflict", async () => {
      const { reportingFilingController } = setupFinanceAndReportingHarness();

      const idempotencyKey = "filing-pkg-conflict-key";

      await reportingFilingController.generateFilingPackage(
        {
          packageType: "monthly_report",
          scope: { month: "2026-04" },
        },
        null,
        idempotencyKey,
      );

      try {
        await reportingFilingController.generateFilingPackage(
          {
            packageType: "filing",
            scope: { month: "2026-04" },
          },
          null,
          idempotencyKey,
        );
        expect.unreachable("Should have thrown 409 conflict");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError.code).toBe("IDEMPOTENCY_KEY_REUSED");
      }
    });
  });

  describe("Existing Payment Recovery Idempotency Path", () => {
    it("preserves payment recovery idempotency without interference", async () => {
      const auditService = new AuditNotificationService();
      const mockRepo = {
        isEnabled: vi.fn(() => true),
        findMultiTaxiPaymentException: vi.fn(async (orderId: string) => ({
          paymentId: `pay-${orderId}`,
          orderId,
          status: "exception",
          amount: { currency: "NTD", amountMinor: 50000 },
        })),
        findMultiTaxiPaymentRecoveryCommand: vi.fn(
          async (paymentId: string, action: string, idempotencyKey: string) => {
            if (idempotencyKey === "seen-payment-key") {
              return {
                commandId: "cmd-001",
                paymentId,
                orderId: "order-001",
                action,
                idempotencyKey,
                state: "completed",
                receipt: {
                  actionId: "seen-payment-key",
                  auditId: "audit-001",
                  resourceType: "multi_taxi_payment_exception",
                  resourceId: paymentId,
                  status: "completed" as const,
                  message: "Payment captured successfully",
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }
            return null;
          },
        ),
        recordMultiTaxiPaymentRecoveryCommand: vi.fn(async () => undefined),
        persistChanges: vi.fn(async () => undefined),
      } as unknown as BillingSettlementRepository;

      const service = new BillingSettlementService(auditService, mockRepo);
      const controller = new BillingSettlementController(service);

      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorId: "actor-ops-001",
        actorType: "platform_admin",
        realm: "platform",
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["billing:write"],
        tenantId: null,
        requestId: "req-001",
      };

      const result = await controller.executeMultiTaxiPaymentRecovery(
        "order-001",
        "retry_capture",
        { reason: "Network timeout retry" },
        identity,
        "seen-payment-key",
      );

      expect(result.data.actionId).toBe("seen-payment-key");
      expect(result.data.auditId).toBe("audit-001");
      expect(mockRepo.findMultiTaxiPaymentRecoveryCommand).toHaveBeenCalledWith(
        "pay-order-001",
        "retry_capture",
        "seen-payment-key",
      );
    });
  });
});
