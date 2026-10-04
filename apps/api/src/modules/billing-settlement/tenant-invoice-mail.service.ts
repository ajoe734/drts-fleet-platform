import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { TenantInvoiceMailDelivery } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import type { DeliveryReceipt } from "../notification-delivery/notification-delivery.types";
import { BillingSettlementRepository } from "./billing-settlement.repository";

function receiptView(receipt: DeliveryReceipt): TenantInvoiceMailDelivery {
  return {
    deliveryId: receipt.deliveryId,
    status: receipt.status,
    queuedAt: receipt.queuedAt,
    sentAt: receipt.sentAt,
    nextAttemptAt: receipt.nextAttemptAt,
    attempts: receipt.attempts.map((attempt) => ({
      attemptNo: attempt.attemptNo,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      outcome: attempt.outcome,
      errorCode: attempt.errorCode,
      retryable: attempt.retryable,
    })),
  };
}

function keyPrefix(invoiceId: string) {
  return `invoice-mail:${createHash("sha256").update(invoiceId).digest("hex")}:`;
}

function validMailbox(value: string) {
  return (
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(value) &&
    !/(?:@|\.)(?:example\.(?:com|net|org)|invalid|test|localhost)$/i.test(value)
  );
}

@Injectable()
export class TenantInvoiceMailService {
  constructor(
    private readonly repository: BillingSettlementRepository,
    @Optional()
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService | null = null,
  ) {}

  private authorize(
    tenantId: string,
    identity: BootstrapRequestIdentity | null,
    write: boolean,
  ) {
    if (
      !tenantId ||
      !identity ||
      !["tenant", "platform", "system"].includes(identity.realm)
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_REALM_DENIED",
        "Tenant billing identity is required.",
      );
    }
    if (identity.realm === "tenant" && identity.tenantId !== tenantId) {
      throw new ApiRequestError(
        403,
        "TENANT_SCOPE_MISMATCH",
        "Billing tenant does not match identity.",
      );
    }
    const scope = `tenant:billing:${write ? "write" : "read"}`;
    if (!identity.scopes.includes(scope)) {
      throw new ApiRequestError(
        403,
        "AUTH_SCOPE_DENIED",
        "Tenant billing permission is required.",
      );
    }
  }

  private async context(tenantId: string, invoiceId: string) {
    if (!this.repository.isEnabled()) {
      throw new ApiRequestError(
        503,
        "INVOICE_MAIL_AUTHORITY_UNAVAILABLE",
        "Durable billing authority is required.",
      );
    }
    const context = await this.repository.findTenantInvoiceMailContext(
      tenantId,
      invoiceId,
    );
    if (
      !context ||
      context.invoice.tenantId !== tenantId ||
      context.invoice.invoiceId !== invoiceId
    ) {
      throw new ApiRequestError(
        404,
        "NOT_FOUND",
        "Invoice not found for this tenant.",
      );
    }
    return context;
  }

  private requireDelivery() {
    if (!this.delivery) {
      throw new ApiRequestError(
        503,
        "INVOICE_MAIL_OUTBOX_UNAVAILABLE",
        "Invoice mail outbox is not configured.",
      );
    }
    return this.delivery;
  }

  async list(
    tenantId: string,
    invoiceId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    this.authorize(tenantId, identity, false);
    await this.context(tenantId, invoiceId);
    return (
      await this.requireDelivery().listByKeyPrefix(
        tenantId,
        keyPrefix(invoiceId),
      )
    ).map(receiptView);
  }

  async send(
    tenantId: string,
    invoiceId: string,
    idempotencyKey: string | undefined,
    identity: BootstrapRequestIdentity | null,
  ) {
    this.authorize(tenantId, identity, true);
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new ApiRequestError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Use an 8-100 character idempotency key for this intentional send.",
      );
    }
    const { invoice, profile } = await this.context(tenantId, invoiceId);
    if (invoice.status !== "issued" && invoice.status !== "paid") {
      throw new ApiRequestError(
        409,
        "INVOICE_NOT_ISSUED",
        "Only issued invoices can be mailed.",
      );
    }
    const recipient = profile?.email.trim() ?? "";
    if (profile?.tenantId !== tenantId || !validMailbox(recipient)) {
      throw new ApiRequestError(
        409,
        "INVOICE_BILLING_EMAIL_REQUIRED",
        "Configure a real billing recipient before sending.",
      );
    }
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim() ?? "";
    let portal: URL;
    try {
      portal = new URL(process.env.TENANT_INVOICE_PORTAL_ORIGIN ?? "");
      if (
        portal.protocol !== "https:" ||
        portal.username ||
        portal.password ||
        portal.search ||
        portal.hash ||
        portal.pathname !== "/" ||
        !validMailbox(fromEmail)
      )
        throw new Error("invalid_config");
    } catch {
      throw new ApiRequestError(
        503,
        "INVOICE_MAIL_CONFIG_UNAVAILABLE",
        "Configure the invoice portal HTTPS origin and mail sender.",
      );
    }
    // Stable authenticated navigation; no expiring bearer URL or attachment leaks.
    const link = new URL("/invoices", portal);
    link.searchParams.set("invoiceId", invoice.invoiceId);
    const delivery = this.requireDelivery();
    let queued: DeliveryReceipt;
    try {
      queued = await delivery.enqueue({
        tenantId,
        idempotencyKey: `${keyPrefix(invoiceId)}${idempotencyKey}`,
        recipientEmail: recipient,
        fromEmail,
        subject: `DRTS 月結帳單 / Invoice ${invoice.invoiceId}`,
        body: [
          "您的月結帳單已開立。 / Your invoice is available.",
          `帳單 / Invoice: ${invoice.invoiceId}`,
          `期間 / Period: ${invoice.periodStart} — ${invoice.periodEnd}`,
          `請登入企業租戶平台查看帳單與下載文件。 / Sign in to your tenant workspace to view and download the invoice:`,
          link.toString(),
        ].join("\n"),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "notification_idempotency_conflict"
      ) {
        throw new ApiRequestError(
          409,
          "INVOICE_MAIL_IDEMPOTENCY_CONFLICT",
          "This send key already belongs to a different mail snapshot. Use a new key for an intentional resend.",
        );
      }
      throw new ApiRequestError(
        503,
        "INVOICE_MAIL_ENQUEUE_FAILED",
        "Mail could not be durably queued. Retry with the same key.",
      );
    }
    try {
      return receiptView(
        (await delivery.dispatch(tenantId, queued.deliveryId)) ?? queued,
      );
    } catch {
      // Persistence failure after enqueue must retain the real receipt identity.
      // A transport acknowledgement whose commit failed is not a confirmed send.
      return receiptView(
        (await delivery.get(tenantId, queued.deliveryId).catch(() => null)) ??
          queued,
      );
    }
  }
}
