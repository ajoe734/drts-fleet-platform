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
  ApproveReimbursementBatchCommand,
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
  MarkReimbursementPaidCommand,
  PublishDriverFeePlanCommand,
  UpdateTenantBillingProfileCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { BillingSettlementService } from "./billing-settlement.service";

@Controller()
export class BillingSettlementController {
  constructor(
    private readonly billingSettlementService: BillingSettlementService,
  ) {}

  @Get("tenant/billing/profile")
  getTenantBillingProfile(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getTenantBillingProfile(),
      requestId,
    );
  }

  @Post("tenant/billing/profile")
  updateTenantBillingProfile(
    @Body() command: UpdateTenantBillingProfileCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.updateTenantBillingProfile(
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/invoices/generate")
  generateTenantInvoice(
    @Body() command: GenerateTenantInvoiceCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.generateTenantInvoice(command, requestId),
      requestId,
    );
  }

  @Get("tenant/invoices")
  listTenantInvoices(@Headers("x-request-id") requestId?: string) {
    const items = this.billingSettlementService.listTenantInvoices();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/invoices/:invoiceId")
  getTenantInvoice(
    @Param("invoiceId") invoiceId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.getTenantInvoice(invoiceId),
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
  generateDriverStatements(
    @Body() command: GenerateDriverStatementCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.billingSettlementService.generateDriverStatements(
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
