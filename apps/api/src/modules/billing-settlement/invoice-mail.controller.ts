import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  authorizeInvoiceTenant,
  InvoiceMailService,
} from "./invoice-mail.service";

@Controller("tenant/invoices/:invoiceId/mail")
@RequireRealms("tenant")
export class InvoiceMailController {
  constructor(private readonly mail: InvoiceMailService) {}

  @Get()
  @RequireScopes("tenant:billing:read")
  async read(
    @Param("invoiceId") invoiceId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const tenant = authorizeInvoiceTenant(
      identity,
      tenantId,
      "tenant:billing:read",
    );
    return toApiSuccessEnvelope(
      {
        ...(await this.mail.read(tenant, invoiceId)),
        canSend: Boolean(identity?.scopes.includes("tenant:billing:write")),
      },
      requestId,
    );
  }

  @Post()
  @RequireScopes("tenant:billing:write")
  async send(
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") operationKey?: string,
  ) {
    const tenant = authorizeInvoiceTenant(
      identity,
      tenantId,
      "tenant:billing:write",
    );
    if (
      body !== undefined &&
      (!body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length)
    ) {
      throw new ApiRequestError(
        400,
        "INVOICE_MAIL_BODY_NOT_ALLOWED",
        "Invoice mail does not accept recipient or content overrides.",
      );
    }
    return toApiSuccessEnvelope(
      {
        ...(await this.mail.send(tenant, invoiceId, operationKey)),
        canSend: true,
      },
      requestId,
    );
  }
}
