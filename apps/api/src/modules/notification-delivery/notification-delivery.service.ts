import { createHash, randomUUID } from "node:crypto";

import {
  DeliveryTransportError,
  type DeliveryReceipt,
  type EnqueueMail,
  type MailOutbox,
  type MailTransport,
  type ProviderAcknowledgement,
  type StoredDelivery,
} from "./notification-delivery.types";

export type NotificationDeliveryOptions = {
  now?: () => Date;
  maxAttempts?: number;
  retryDelayMs?: number;
  leaseMs?: number;
};

/** Standalone core; callers explicitly enqueue and schedule drain after restart. */
export class NotificationDeliveryService {
  private readonly now: () => Date;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly leaseMs: number;

  constructor(
    private readonly outbox: MailOutbox,
    private readonly transport: MailTransport | null = null,
    options: NotificationDeliveryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    if (
      [this.maxAttempts, this.retryDelayMs, this.leaseMs].some(
        (value) => !Number.isSafeInteger(value) || value < 1,
      )
    ) {
      throw new Error("notification_invalid_retry_options");
    }
  }

  availability(): "available" | "unavailable" {
    return this.transport ? "available" : "unavailable";
  }

  async enqueue(request: EnqueueMail): Promise<DeliveryReceipt> {
    const input: EnqueueMail = {
      tenantId: request.tenantId,
      idempotencyKey: request.idempotencyKey,
      recipientEmail: request.recipientEmail,
      fromEmail: request.fromEmail,
      subject: request.subject,
      body: request.body,
    };
    this.validate(input);
    // Fixed field order makes payload comparison independent of caller key order.
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify([
          input.tenantId,
          input.idempotencyKey,
          input.recipientEmail,
          input.fromEmail,
          input.subject,
          input.body,
        ]),
      )
      .digest("hex");
    return this.outbox.transaction((state) => {
      const existing = Object.values(state.deliveries).find(
        (delivery) =>
          delivery.receipt.tenantId === input.tenantId &&
          delivery.receipt.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new Error("notification_idempotency_conflict");
        }
        return existing.receipt;
      }
      const deliveryId = randomUUID();
      const messageId = `<${deliveryId}@notification.drts.invalid>`;
      const receipt: DeliveryReceipt = {
        deliveryId,
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
        messageId,
        status: "queued",
        queuedAt: this.now().toISOString(),
        sentAt: null,
        nextAttemptAt: this.now().toISOString(),
        attempts: [],
      };
      state.deliveries[deliveryId] = {
        message: { ...input, deliveryId, messageId },
        payloadHash,
        receipt,
        lease: null,
      };
      return receipt;
    });
  }

  async get(tenantId: string, deliveryId: string) {
    return this.outbox.transaction((state) => {
      const entry = state.deliveries[deliveryId];
      return entry?.receipt.tenantId === tenantId ? entry.receipt : null;
    });
  }

  async dispatch(tenantId: string, deliveryId: string) {
    const claim = await this.outbox.transaction((state) => {
      const entry = state.deliveries[deliveryId];
      if (!entry || entry.receipt.tenantId !== tenantId) return null;
      const now = this.now();
      if (!this.isDue(entry, now)) return null;
      if (entry.lease) {
        const abandoned = entry.receipt.attempts.at(-1)!;
        abandoned.outcome = "uncertain";
        abandoned.errorCode = "delivery_outcome_unknown";
        abandoned.finishedAt = now.toISOString();
        abandoned.retryable = true;
        entry.lease = null;
      }
      if (entry.receipt.attempts.length >= this.maxAttempts) {
        entry.receipt.status = "failed";
        entry.receipt.nextAttemptAt = null;
        return null;
      }
      const attemptId = randomUUID();
      entry.receipt.status = "queued";
      entry.receipt.nextAttemptAt = null;
      entry.receipt.attempts.push({
        attemptId,
        attemptNo: entry.receipt.attempts.length + 1,
        startedAt: now.toISOString(),
        finishedAt: null,
        outcome: "started",
        errorCode: null,
        retryable: false,
        acknowledgement: null,
      });
      entry.lease = {
        attemptId,
        expiresAt: new Date(now.getTime() + this.leaseMs).toISOString(),
      };
      return { message: entry.message, attemptId };
    });
    if (!claim) return this.get(tenantId, deliveryId);

    let acknowledgement: ProviderAcknowledgement | null = null;
    let failure: DeliveryTransportError | null = null;
    try {
      if (!this.transport) {
        throw new DeliveryTransportError("provider_unavailable", true);
      }
      acknowledgement = structuredClone(
        await this.transport.send(claim.message),
      );
      if (
        !acknowledgement ||
        acknowledgement.provider !== this.transport.provider ||
        typeof acknowledgement.response !== "string" ||
        !acknowledgement.response.trim() ||
        !Number.isFinite(Date.parse(acknowledgement.acceptedAt)) ||
        (acknowledgement.providerMessageId !== null &&
          typeof acknowledgement.providerMessageId !== "string")
      ) {
        throw new DeliveryTransportError(
          "provider_acknowledgement_invalid",
          false,
        );
      }
    } catch (error) {
      acknowledgement = null;
      failure =
        error instanceof DeliveryTransportError
          ? error
          : new DeliveryTransportError("transport_error", true);
    }

    // Keep persistence errors outside the transport catch. An accepted send whose
    // receipt cannot commit remains uncertain; never manufacture a failure/success.
    return this.outbox.transaction((state) => {
      const entry = state.deliveries[deliveryId]!;
      const attempt = entry.receipt.attempts.find(
        (item) => item.attemptId === claim.attemptId,
      )!;
      const ownsLease = entry.lease?.attemptId === claim.attemptId;
      if (!ownsLease && !acknowledgement) return entry.receipt;
      const finishedAt = this.now();
      attempt.finishedAt = finishedAt.toISOString();
      if (ownsLease) entry.lease = null;
      if (acknowledgement) {
        // Late provider evidence belongs to its original attempt even if a lease
        // expired. Fencing stale failures must never discard known acceptance.
        attempt.outcome = "sent";
        attempt.errorCode = null;
        attempt.retryable = false;
        attempt.acknowledgement = acknowledgement;
        entry.receipt.status = "sent";
        entry.receipt.sentAt ??= acknowledgement.acceptedAt;
        entry.receipt.nextAttemptAt = null;
      } else {
        attempt.outcome = "failed";
        // Only bounded machine codes survive; provider exception text can contain PII.
        attempt.errorCode = /^[a-z][a-z0-9_]{0,99}$/i.test(failure!.code)
          ? failure!.code
          : "transport_error";
        attempt.retryable = failure!.retryable;
        if (entry.receipt.status === "sent") return entry.receipt;
        entry.receipt.status = "failed";
        const delay = Math.min(
          this.retryDelayMs * 2 ** (attempt.attemptNo - 1),
          3_600_000,
        );
        entry.receipt.nextAttemptAt =
          failure!.retryable && attempt.attemptNo < this.maxAttempts
            ? new Date(finishedAt.getTime() + delay).toISOString()
            : null;
      }
      return entry.receipt;
    });
  }

  async drain(limit = 100): Promise<DeliveryReceipt[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("notification_invalid_drain_limit");
    }
    const due = await this.outbox.transaction((state) =>
      Object.values(state.deliveries)
        .filter((entry) => this.isDue(entry, this.now()))
        .sort((a, b) => a.receipt.queuedAt.localeCompare(b.receipt.queuedAt))
        .slice(0, limit)
        .map((entry) => ({
          tenantId: entry.receipt.tenantId,
          deliveryId: entry.receipt.deliveryId,
        })),
    );
    const receipts: DeliveryReceipt[] = [];
    for (const entry of due) {
      const receipt = await this.dispatch(entry.tenantId, entry.deliveryId);
      if (receipt) receipts.push(receipt);
    }
    return receipts;
  }

  private isDue(entry: StoredDelivery, now: Date) {
    if (entry.receipt.status === "sent") return false;
    if (entry.lease) return Date.parse(entry.lease.expiresAt) <= now.getTime();
    return (
      entry.receipt.nextAttemptAt !== null &&
      Date.parse(entry.receipt.nextAttemptAt) <= now.getTime()
    );
  }

  private validate(input: EnqueueMail) {
    for (const value of [input.tenantId, input.idempotencyKey]) {
      if (typeof value !== "string" || !value.trim() || value.length > 255) {
        throw new Error("notification_invalid_identity");
      }
    }
    for (const address of [input.fromEmail, input.recipientEmail]) {
      if (
        typeof address !== "string" ||
        address.length > 254 ||
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(address)
      ) {
        throw new Error("notification_invalid_address");
      }
    }
    if (
      typeof input.subject !== "string" ||
      !input.subject.trim() ||
      input.subject.length > 500 ||
      /[\r\n\0]/.test(input.subject) ||
      typeof input.body !== "string" ||
      Buffer.byteLength(input.body, "utf8") > 1_000_000
    ) {
      throw new Error("notification_invalid_content");
    }
  }
}
