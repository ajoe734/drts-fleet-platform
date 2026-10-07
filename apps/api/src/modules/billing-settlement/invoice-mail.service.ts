import { createHash } from "node:crypto";
import type {
  TenantInvoiceMailReceipt,
  TenantInvoiceMailView,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { ApiRequestError } from "../../common/api-envelope";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import type {
  DeliveryReceipt,
  MailOutbox,
} from "../notification-delivery/notification-delivery.types";

/** The selector is never an identity. All invoice/profile entry points use this. */
export function authorizeInvoiceTenant(
  identity: BootstrapRequestIdentity | null | undefined,
  tenantId: string | undefined,
  scope: "tenant:billing:read" | "tenant:billing:write",
): string {
  if (
    !identity ||
    identity.realm !== "tenant" ||
    !identity.tenantId?.trim() ||
    !identity.scopes.includes(scope)
  ) {
    throw new ApiRequestError(
      403,
      "INVOICE_ACCESS_DENIED",
      "Tenant billing authority is required.",
    );
  }
  if (tenantId?.trim() && tenantId.trim() !== identity.tenantId) {
    throw new ApiRequestError(
      403,
      "TENANT_SCOPE_MISMATCH",
      "Tenant selector does not match the authenticated tenant.",
    );
  }
  return identity.tenantId;
}

const keyPrefix = (invoiceId: string) =>
  `tenant-invoice-mail:v2:${createHash("sha256").update(invoiceId).digest("hex")}:`;
const keyForInvoice = (invoiceId: string, operationKey = "default") =>
  `${keyPrefix(invoiceId)}${operationKey}`;

export class InvoiceMailService {
  constructor(
    private readonly repository: BillingSettlementRepository,
    private readonly outbox: MailOutbox | null,
    private readonly delivery: NotificationDeliveryService | null,
    private readonly config: {
      fromEmail?: string | undefined;
      portalOrigin?: string | undefined;
    },
  ) {}

  async read(
    tenantId: string,
    invoiceId: string,
  ): Promise<TenantInvoiceMailView> {
    await this.requireInvoice(tenantId, invoiceId);
    const receipts = await this.findReceipts(tenantId, invoiceId);
    return this.toView(invoiceId, receipts[0] ?? null, receipts);
  }

  async send(
    tenantId: string,
    invoiceId: string,
    operationKey?: string,
  ): Promise<TenantInvoiceMailView> {
    if (
      operationKey !== undefined &&
      !/^[A-Za-z0-9_-]{8,100}$/.test(operationKey)
    ) {
      throw new ApiRequestError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Use an 8-100 character key for an intentional send.",
      );
    }
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    // Retries reuse the original authorized recipient/content across restart.
    let receipt = await this.findReceipt(tenantId, invoiceId, operationKey);
    if (!receipt) {
      if (invoice.status !== "issued" && invoice.status !== "paid") {
        throw new ApiRequestError(
          409,
          "INVOICE_NOT_ISSUED",
          "Only issued invoices can be mailed.",
        );
      }
      const profile =
        await this.repository.findInvoiceMailBillingProfile(tenantId);
      const recipientEmail = profile?.email?.trim();
      const fromEmail = this.config.fromEmail?.trim();
      const validAddress = (value: string | undefined): value is string =>
        Boolean(
          value &&
          value.length <= 254 &&
          /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
            value,
          ),
        );
      if (!validAddress(recipientEmail)) {
        throw new ApiRequestError(
          409,
          "INVOICE_BILLING_RECIPIENT_REQUIRED",
          "Configure a valid billing contact email first.",
        );
      }
      if (!validAddress(fromEmail)) {
        throw new ApiRequestError(
          503,
          "INVOICE_MAIL_CONFIG_UNAVAILABLE",
          "Invoice mail sender is unavailable.",
        );
      }
      const url = this.invoiceLink(invoiceId);
      try {
        receipt = await this.delivery!.enqueue({
          tenantId,
          idempotencyKey: keyForInvoice(invoiceId, operationKey),
          recipientEmail,
          fromEmail,
          subject: "DRTS monthly invoice",
          body: [
            "Your monthly invoice is available in the Tenant Console.",
            `Invoice: ${invoice.invoiceId}`,
            `Period: ${invoice.periodStart} to ${invoice.periodEnd}`,
            "Sign in with your authorized tenant finance account to view and download it:",
            url,
          ].join("\n"),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "notification_idempotency_conflict"
        ) {
          // A concurrent request won the invoice key; retain its immutable payload.
          receipt = await this.findReceipt(tenantId, invoiceId, operationKey);
          if (!receipt) throw this.unavailable();
        } else {
          throw this.unavailable();
        }
      }
    }
    try {
      const current = await this.delivery!.dispatch(
        tenantId,
        receipt.deliveryId,
      );
      if (!current) throw this.unavailable();
      return this.toView(
        invoiceId,
        current,
        await this.findReceipts(tenantId, invoiceId),
      );
    } catch {
      // Never fabricate success/failure when persistence fails after acceptance.
      // The existing lease/drain own recovery of the uncertain attempt.
      throw this.unavailable();
    }
  }

  private async requireInvoice(tenantId: string, invoiceId: string) {
    if (!invoiceId || invoiceId.length > 200) {
      throw new ApiRequestError(
        400,
        "INVALID_INVOICE_ID",
        "Invalid invoice identifier.",
      );
    }
    if (!this.repository.isEnabled()) throw this.unavailable();
    const invoice = await this.repository.findInvoiceForMail(
      tenantId,
      invoiceId,
    );
    if (!invoice)
      throw new ApiRequestError(404, "NOT_FOUND", "Invoice not found.");
    return invoice;
  }

  private async findReceipt(
    tenantId: string,
    invoiceId: string,
    operationKey?: string,
  ) {
    if (!this.outbox || !this.delivery) throw this.unavailable();
    try {
      return await this.outbox.transaction(
        (state) =>
          Object.values(state.deliveries).find(
            (entry) =>
              entry.receipt.tenantId === tenantId &&
              entry.receipt.idempotencyKey ===
                keyForInvoice(invoiceId, operationKey),
          )?.receipt ?? null,
      );
    } catch {
      throw this.unavailable();
    }
  }

  private async findReceipts(tenantId: string, invoiceId: string) {
    if (!this.outbox || !this.delivery) throw this.unavailable();
    try {
      return await this.outbox.transaction((state) =>
        Object.values(state.deliveries)
          .map((entry) => entry.receipt)
          .filter(
            (receipt) =>
              receipt.tenantId === tenantId &&
              receipt.idempotencyKey.startsWith(keyPrefix(invoiceId)),
          )
          .sort(
            (a, b) =>
              b.queuedAt.localeCompare(a.queuedAt) ||
              b.deliveryId.localeCompare(a.deliveryId),
          )
          .slice(0, 20),
      );
    } catch {
      throw this.unavailable();
    }
  }

  private invoiceLink(invoiceId: string): string {
    try {
      const origin = new URL(this.config.portalOrigin ?? "");
      if (origin.protocol !== "https:" || origin.username || origin.password)
        throw new Error();
      const link = new URL("/invoices", origin.origin);
      link.searchParams.set("invoiceId", invoiceId);
      return link.toString();
    } catch {
      throw new ApiRequestError(
        503,
        "INVOICE_MAIL_CONFIG_UNAVAILABLE",
        "Invoice mail portal is unavailable.",
      );
    }
  }

  private toView(
    invoiceId: string,
    receipt: DeliveryReceipt | null,
    receipts: DeliveryReceipt[],
  ): TenantInvoiceMailView {
    return {
      ...this.toReceipt(invoiceId, receipt),
      canSend: false,
      deliveries: receipts.map((entry) => this.toReceipt(invoiceId, entry)),
    };
  }

  private toReceipt(
    invoiceId: string,
    receipt: DeliveryReceipt | null,
  ): TenantInvoiceMailReceipt {
    return {
      invoiceId,
      deliveryId: receipt?.deliveryId ?? null,
      status: receipt?.status ?? "not_requested",
      queuedAt: receipt?.queuedAt ?? null,
      sentAt: receipt?.sentAt ?? null,
      nextAttemptAt: receipt?.nextAttemptAt ?? null,
      // No recipient, payload, raw provider response or opaque provider IDs.
      attempts:
        receipt?.attempts.map((attempt) => ({
          attemptNo: attempt.attemptNo,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt,
          outcome: attempt.outcome,
          errorCode: attempt.errorCode,
          retryable: attempt.retryable,
          acceptedAt: attempt.acknowledgement?.acceptedAt ?? null,
        })) ?? [],
    };
  }

  private unavailable() {
    return new ApiRequestError(
      503,
      "INVOICE_MAIL_UNAVAILABLE",
      "Invoice mail storage is unavailable.",
    );
  }
}
