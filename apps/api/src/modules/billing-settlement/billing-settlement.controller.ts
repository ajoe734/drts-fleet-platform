import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  AddReconciliationIssueCommentCommand,
  ApproveReimbursementBatchCommand,
  AssignReconciliationIssueCommand,
  CreateReconciliationIssueCommand,
  DriverStatementRecord,
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
  MarkReimbursementPaidCommand,
  MarkReimbursementPaidWithProofCommand,
  RequestRemittanceProofReadbackCommand,
  ResolveReconciliationIssueCommand,
  ReopenReconciliationIssueCommand,
  TenantOrderListQuery,
  TenantPayableLineItem,
  PublishDriverFeePlanCommand,
  TenantPayableSummary,
  UpdateTenantBillingProfileCommand,
  UploadRemittanceProofCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  assertTenantVisibility,
  filterToTenantVisibility,
  resolveTenantVisibility,
} from "../../common/tenant-scope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../common/idempotency";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { BillingSettlementService } from "./billing-settlement.service";

@Controller()
export class BillingSettlementController {
  constructor(
    private readonly billingSettlementService: BillingSettlementService,
    @Optional()
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(
      new IdempotencyRepository(),
    ),
  ) {}

  @Get("payment-exceptions/:orderId")
  @RequireRealms("platform", "ops")
  @RequireScopes("billing:read")
  async getMultiTaxiPaymentException(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.billingSettlementService.getMultiTaxiPaymentException(
        orderId,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("payment-exceptions/:orderId/actions/:action")
  @RequireRealms("platform")
  @RequireScopes("billing:write")
  async executeMultiTaxiPaymentRecovery(
    @Param("orderId") orderId: string,
    @Param("action") action: string,
    @Body() command: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.billingSettlementService.executeMultiTaxiPaymentRecovery(
        orderId,
        action,
        command,
        identity,
        {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(requestId ? { requestId } : {}),
        },
      ),
      requestId,
    );
  }

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant billing endpoints.",
      );
    }

    return normalizedTenantId;
  }

  @Get("tenant/billing/profile")
  getTenantBillingProfile(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getTenantBillingProfile(
        this.requireTenantId(tenantId),
      ),
      requestId,
    );
  }

  @Post("tenant/billing/profile")
  updateTenantBillingProfile(
    @Body() command: UpdateTenantBillingProfileCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.updateTenantBillingProfile(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/invoices/generate")
  async generateTenantInvoice(
    @Body() command: GenerateTenantInvoiceCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.billingSettlementService.generateTenantInvoice(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/payables/summary")
  async getTenantPayablesSummary(
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const summary: TenantPayableSummary =
      await this.billingSettlementService.getTenantPayableSummary(
        this.requireTenantId(tenantId),
        periodMonth,
      );
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("tenant/payables/line-items")
  async listTenantPayableLineItems(
    @Query() query: TenantOrderListQuery & { periodMonth?: string },
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items: TenantPayableLineItem[] =
      await this.billingSettlementService.listTenantPayableLineItems(
        this.requireTenantId(tenantId),
        query,
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/statements")
  async listTenantStatements(
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items: DriverStatementRecord[] =
      await this.billingSettlementService.listTenantStatements(
        this.requireTenantId(tenantId),
        periodMonth,
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  // Card-benefit (CCAT) settlement statements — issuer-tenant scoped,
  // per-trip reconciliation in the issuer_pays_drts direction. Distinct
  // from the generic tenant `/invoices` surface.
  @Get("tenant/settlement-statements")
  async listTenantSettlementStatements(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items =
      await this.billingSettlementService.listTenantSettlementStatements(
        this.requireTenantId(tenantId),
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/settlement-statements/:period")
  async getTenantSettlementStatement(
    @Param("period") period: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.billingSettlementService.getTenantSettlementStatement(
        this.requireTenantId(tenantId),
        period,
      ),
      requestId,
    );
  }

  @Get("tenant/invoices")
  listTenantInvoices(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const data = this.billingSettlementService.listTenantInvoicesRuntime(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(data, requestId);
  }

  @Get("tenant/invoices/:invoiceId")
  getTenantInvoice(
    @Param("invoiceId") invoiceId: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getTenantInvoice(
        this.requireTenantId(tenantId),
        invoiceId,
      ),
      requestId,
    );
  }

  @Get("settlement/invoices")
  @RequireRealms("system", "platform", "tenant", "ops", "partner")
  @RequireScopes("billing:read")
  listPlatformInvoices(
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // `partner` is an allowed realm here and was never narrowed, so a partner
    // could list every tenant's invoices. Visibility is resolved once and
    // applies to whoever is asking.
    const items = filterToTenantVisibility(
      this.billingSettlementService.listPlatformInvoices(),
      resolveTenantVisibility(identity),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("settlement/matrix")
  @RequireRealms("system", "platform", "tenant", "ops", "partner")
  @RequireScopes("billing:read")
  listSettlementMatrix(
    @CurrentIdentity() _identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.billingSettlementService.listSettlementMatrix();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  // Read consumed on every Platform Admin pricing page load; READ_HEAVY
  // (180/min, no block) instead of the global default 60/min + 5-min block.
  @Get("driver-fee-plans")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listDriverFeePlans(@Headers("x-request-id") requestId?: string) {
    const items = this.billingSettlementService.listDriverFeePlans();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("driver-fee-plans/publish")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  publishDriverFeePlan(
    @Body() command: PublishDriverFeePlanCommand,
    @CurrentIdentity() _identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.publishDriverFeePlan(command, requestId),
      requestId,
    );
  }

  @Post("driver-statements/generate")
  async generateDriverStatements(
    @Body() command: GenerateDriverStatementCommand,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = `billing:payout:driver:${command.driverId?.trim() || "all"}`;

    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: command,
      execute: async () => {
        const data =
          await this.billingSettlementService.generateDriverStatements(
            command,
            requestId,
          );
        return {
          data,
          statusCode: 200,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Get("driver-statements")
  listDriverStatements(
    @Query("period") period?: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.billingSettlementService.listDriverStatements(
      periodMonth ?? period,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("driver-statements/:statementId")
  getDriverStatement(
    @Param("statementId") statementId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getDriverStatement(statementId),
      requestId,
    );
  }

  @Get("reimbursements")
  listReimbursementBatches(
    @Query("status") status?: "pending" | "paid",
    @Query("periodMonth") periodMonth?: string,
    @Query("driverId") driverId?: string,
    @Query("statementId") statementId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filters = {
      ...(status ? { status } : {}),
      ...(periodMonth ? { periodMonth } : {}),
      ...(driverId ? { driverId } : {}),
      ...(statementId ? { statementId } : {}),
    };
    const items =
      this.billingSettlementService.listReimbursementBatches(filters);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("settlement/reconciliation-issues")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:read")
  listReconciliationIssues(
    @Query("status") status?: "open" | "assigned" | "resolved" | "reopened",
    @Query("issueType")
    issueType?: "forwarder_status_mismatch" | "partner_sponsor_mismatch",
    @Query("channelKey") channelKey?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = filterToTenantVisibility(
      this.billingSettlementService.listReconciliationIssues({
        ...(status ? { status } : {}),
        ...(issueType ? { issueType } : {}),
        ...(channelKey ? { channelKey } : {}),
      }),
      resolveTenantVisibility(identity),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("settlement/reconciliation-issues")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  createReconciliationIssue(
    @Body() command: CreateReconciliationIssueCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const visibility = resolveTenantVisibility(identity);
    if (visibility.scope === "tenant") {
      if (command.tenantId && command.tenantId !== visibility.tenantId) {
        throw new ApiRequestError(
          403,
          "TENANT_BOUNDARY_VIOLATION",
          "Tenant caller cannot create reconciliation issues for another tenant.",
        );
      }
      command.tenantId = visibility.tenantId;
    }
    return toApiSuccessEnvelope(
      this.billingSettlementService.createReconciliationIssue(
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("settlement/reconciliation-issues/:issueId/assign")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  assignReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: AssignReconciliationIssueCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // `issue.tenantId && ...` let a tenant act on any issue whose tenant was
    // null -- platform-level records were open to everyone.
    assertTenantVisibility(
      this.billingSettlementService
        .listReconciliationIssues()
        .find((item) => item.issueId === issueId)?.tenantId,
      resolveTenantVisibility(identity),
      { issueId },
    );
    return toApiSuccessEnvelope(
      this.billingSettlementService.assignReconciliationIssue(
        issueId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("settlement/reconciliation-issues/:issueId/comment")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  addReconciliationIssueComment(
    @Param("issueId") issueId: string,
    @Body() command: AddReconciliationIssueCommentCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // `issue.tenantId && ...` let a tenant act on any issue whose tenant was
    // null -- platform-level records were open to everyone.
    assertTenantVisibility(
      this.billingSettlementService
        .listReconciliationIssues()
        .find((item) => item.issueId === issueId)?.tenantId,
      resolveTenantVisibility(identity),
      { issueId },
    );
    return toApiSuccessEnvelope(
      this.billingSettlementService.addReconciliationIssueComment(
        issueId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("settlement/reconciliation-issues/:issueId/resolve")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  resolveReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: ResolveReconciliationIssueCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // `issue.tenantId && ...` let a tenant act on any issue whose tenant was
    // null -- platform-level records were open to everyone.
    assertTenantVisibility(
      this.billingSettlementService
        .listReconciliationIssues()
        .find((item) => item.issueId === issueId)?.tenantId,
      resolveTenantVisibility(identity),
      { issueId },
    );
    return toApiSuccessEnvelope(
      this.billingSettlementService.resolveReconciliationIssue(
        issueId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("settlement/reconciliation-issues/:issueId/reopen")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("billing:write")
  reopenReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: ReopenReconciliationIssueCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // `issue.tenantId && ...` let a tenant act on any issue whose tenant was
    // null -- platform-level records were open to everyone.
    assertTenantVisibility(
      this.billingSettlementService
        .listReconciliationIssues()
        .find((item) => item.issueId === issueId)?.tenantId,
      resolveTenantVisibility(identity),
      { issueId },
    );
    return toApiSuccessEnvelope(
      this.billingSettlementService.reopenReconciliationIssue(
        issueId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("reimbursements/:batchId/approve")
  async approveReimbursementBatch(
    @Param("batchId") batchId: string,
    @Body() command: ApproveReimbursementBatchCommand,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = `billing:reimbursement_batch:${batchId}:approve`;
    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: { batchId, statementId: command.statementId },
      execute: async () => {
        const data =
          await this.billingSettlementService.approveReimbursementBatch(
            batchId,
            command,
            requestId,
          );
        return {
          data,
          statusCode: 200,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("reimbursements/:batchId/pay")
  async markReimbursementPaid(
    @Param("batchId") batchId: string,
    @Body() command: MarkReimbursementPaidCommand,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = `billing:reimbursement_batch:${batchId}:pay`;
    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: {
        batchId,
        paidAt: command.paidAt,
        remittanceProofId: command.remittanceProofId,
      },
      execute: async () => {
        const data = await this.billingSettlementService.markReimbursementPaid(
          batchId,
          command,
          requestId,
        );
        return {
          data,
          statusCode: 200,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Get("reimbursements/:batchId")
  getReimbursementBatch(
    @Param("batchId") batchId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getReimbursementBatch(batchId),
      requestId,
    );
  }

  // ── Remittance Proof (SR-PROOF-001) ──

  /**
   * Not part of the locked SR-RECOVERY-CONTRACTS-20260911 OpenAPI paths --
   * that contract's `UploadRemittanceProofCommand.stagedContentRef` is
   * deliberately opaque ("into the storage adapter's staged upload; not
   * the raw bytes") and assumes a prior staging call this task's
   * write_scopes never allocated an endpoint for. This route is the
   * missing first phase: it accepts the actual bytes (base64, to avoid a
   * multipart/`multer` dependency nothing else in this codebase uses) and
   * returns the `stagedContentRef` that `POST reimbursements/proofs`
   * expects. See `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md`
   * for why this exists and its boundary.
   */
  @Post("reimbursements/proofs/staged-content")
  @HttpCode(HttpStatus.OK)
  @RequireRealms("driver")
  @RequireScopes("driver:write")
  async stageRemittanceProofContent(
    @Body() body: { contentBase64?: string; contentType?: string },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const contentType = body?.contentType?.trim();
    if (!contentType) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "contentType is required.",
      );
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body?.contentBase64 ?? "", "base64");
    } catch {
      bytes = Buffer.alloc(0);
    }
    if (bytes.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "contentBase64 must decode to non-empty bytes.",
      );
    }
    const result = await this.idempotencyService.execute({
      scope: "billing:remittance_proof:staged_content:create",
      idempotencyKey,
      required: true,
      payload: { contentType, contentBase64: body?.contentBase64 ?? "" },
      execute: async () => {
        const data = await this.billingSettlementService.stageRemittanceProofContent(
          bytes,
          contentType,
        );
        return {
          data,
          statusCode: 200,
        };
      },
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("reimbursements/proofs")
  @RequireRealms("driver")
  @RequireScopes("driver:write")
  async uploadRemittanceProof(
    @Body() command: UploadRemittanceProofCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = `billing:remittance_proof:${command.batchId}:upload`;
    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: {
        batchId: command.batchId,
        originalFilename: command.originalFilename,
        stagedContentRef: command.stagedContentRef,
      },
      execute: async () => {
        const data = await this.billingSettlementService.uploadRemittanceProof(
          command,
          identity ?? null,
          requestId,
        );
        return {
          data,
          statusCode: 200,
        };
      },
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Get("reimbursements/proofs/:proofId")
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("billing:read")
  async getRemittanceProof(
    @Param("proofId") proofId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const data = await this.billingSettlementService.getRemittanceProof(
      proofId,
    );
    return toApiSuccessEnvelope(data, requestId);
  }

  @Post("reimbursements/proofs/:proofId/readback")
  @HttpCode(HttpStatus.OK)
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("billing:write")
  async requestRemittanceProofReadback(
    @Param("proofId") proofId: string,
    @Body() command: RequestRemittanceProofReadbackCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const data =
      await this.billingSettlementService.requestRemittanceProofReadback(
        { ...command, proofId },
        identity ?? null,
        requestId,
      );
    return toApiSuccessEnvelope(data, requestId);
  }

  @Post("reimbursements/:batchId/pay-with-proof")
  @HttpCode(HttpStatus.OK)
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("billing:write")
  async markReimbursementPaidWithProof(
    @Param("batchId") batchId: string,
    @Body() command: MarkReimbursementPaidWithProofCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const data =
      await this.billingSettlementService.markReimbursementPaidWithProof(
        batchId,
        { ...command, batchId },
        identity ?? null,
        requestId,
      );
    return toApiSuccessEnvelope(data, requestId);
  }
}
