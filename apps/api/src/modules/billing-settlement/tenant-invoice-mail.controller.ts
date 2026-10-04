import { Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TenantInvoiceMailService } from "./tenant-invoice-mail.service";

@Controller("tenant/invoices")
@RequireRealms("system", "platform", "tenant")
export class TenantInvoiceMailController {
  constructor(private readonly mail: TenantInvoiceMailService) {}

  @Post(":invoiceId/mail-deliveries")
  @RequireScopes("tenant:billing:write")
  async send(
    @Param("invoiceId") invoiceId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.mail.send(
        tenantId?.trim() ?? "",
        invoiceId,
        idempotencyKey,
        identity,
      ),
      requestId,
    );
  }

  @Get(":invoiceId/mail-deliveries")
  @RequireScopes("tenant:billing:read")
  async list(
    @Param("invoiceId") invoiceId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.mail.list(tenantId?.trim() ?? "", invoiceId, identity),
      requestId,
    );
  }
}
