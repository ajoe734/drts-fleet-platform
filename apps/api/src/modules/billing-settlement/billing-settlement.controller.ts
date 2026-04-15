import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
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
    return toApiSuccessEnvelope(
      {
        items: this.billingSettlementService.listDriverFeePlans(),
      },
      requestId,
    );
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
  listDriverStatements(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.billingSettlementService.listDriverStatements(),
      },
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
