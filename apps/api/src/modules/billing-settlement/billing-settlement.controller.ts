import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  AddReconciliationIssueCommentCommand,
  ApproveReimbursementBatchCommand,
  AssignReconciliationIssueCommand,
  CreateReconciliationIssueCommand,
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
  IdentityContext,
  MarkReimbursementPaidCommand,
  ResolveReconciliationIssueCommand,
  ReopenReconciliationIssueCommand,
  PublishDriverFeePlanCommand,
  UpdateTenantBillingProfileCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import { BillingSettlementService } from "./billing-settlement.service";

@Controller()
export class BillingSettlementController {
  constructor(
    private readonly billingSettlementService: BillingSettlementService,
  ) {}

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

  @Get("tenant/invoices")
  listTenantInvoices(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.billingSettlementService.listTenantInvoices(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
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
  listPlatformInvoices(@Headers("x-request-id") requestId?: string) {
    const items = this.billingSettlementService.listPlatformInvoices();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("settlement/matrix")
  listSettlementMatrix(@Headers("x-request-id") requestId?: string) {
    const items = this.billingSettlementService.listSettlementMatrix();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("ops/revenue-review")
  getOpsRevenueReviewRuntime(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getOpsRevenueReviewRuntime(identity),
      requestId,
    );
  }

  @Get("driver-fee-plans")
  listDriverFeePlans(@Headers("x-request-id") requestId?: string) {
    const items = this.billingSettlementService.listDriverFeePlans();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("driver-fee-plans/publish")
  publishDriverFeePlan(
    @Body() command: PublishDriverFeePlanCommand,
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
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.billingSettlementService.generateDriverStatements(
        command,
        requestId,
      ),
      requestId,
    );
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
  listReconciliationIssues(
    @Query("status") status?: "open" | "assigned" | "resolved" | "reopened",
    @Query("issueType")
    issueType?: "forwarder_status_mismatch" | "partner_sponsor_mismatch",
    @Query("channelKey") channelKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.billingSettlementService.listReconciliationIssues({
      ...(status ? { status } : {}),
      ...(issueType ? { issueType } : {}),
      ...(channelKey ? { channelKey } : {}),
    });
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("settlement/reconciliation-issues")
  createReconciliationIssue(
    @Body() command: CreateReconciliationIssueCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.createReconciliationIssue(
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("settlement/reconciliation-issues/:issueId/assign")
  assignReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: AssignReconciliationIssueCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
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
  addReconciliationIssueComment(
    @Param("issueId") issueId: string,
    @Body() command: AddReconciliationIssueCommentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
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
  resolveReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: ResolveReconciliationIssueCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
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
  reopenReconciliationIssue(
    @Param("issueId") issueId: string,
    @Body() command: ReopenReconciliationIssueCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
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
  approveReimbursementBatch(
    @Param("batchId") batchId: string,
    @Body() command: ApproveReimbursementBatchCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.approveReimbursementBatch(
        batchId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("reimbursements/:batchId/pay")
  markReimbursementPaid(
    @Param("batchId") batchId: string,
    @Body() command: MarkReimbursementPaidCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.markReimbursementPaid(
        batchId,
        command,
        requestId,
      ),
      requestId,
    );
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
}
