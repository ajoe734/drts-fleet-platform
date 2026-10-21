export type DeliveryStatus = "queued" | "sent" | "failed";

/** One recipient per durable key. Callers retain responsibility for authorization. */
export type EnqueueMail = {
  tenantId: string;
  idempotencyKey: string;
  recipientEmail: string;
  fromEmail: string;
  subject: string;
  body: string;
};

/** Platform messages deliberately carry null rather than a fabricated tenant. */
export type PlatformMail = Omit<EnqueueMail, "tenantId" | "idempotencyKey">;

export type TransportMessage = EnqueueMail & {
  deliveryId: string;
  messageId: string;
};

export type PlatformTransportMessage = Omit<TransportMessage, "tenantId"> & {
  tenantId: null;
};
export type OutgoingMailMessage = TransportMessage | PlatformTransportMessage;

/** Acceptance by the provider, never a claim of delivery to a human inbox. */
export type ProviderAcknowledgement = {
  provider: string;
  response: string;
  providerMessageId: string | null;
  acceptedAt: string;
};

export interface MailTransport {
  readonly provider: string;
  send(message: TransportMessage): Promise<ProviderAcknowledgement>;
  /** Optional extension: existing tenant-only adapters retain their send contract. */
  sendPlatform?(
    message: PlatformTransportMessage,
  ): Promise<ProviderAcknowledgement>;
}

export class DeliveryTransportError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "DeliveryTransportError";
  }
}

export type DeliveryAttempt = {
  attemptId: string;
  attemptNo: number;
  startedAt: string;
  finishedAt: string | null;
  outcome: "started" | "sent" | "failed" | "uncertain";
  errorCode: string | null;
  retryable: boolean;
  acknowledgement: ProviderAcknowledgement | null;
};

/** Safe caller receipt: message content (including invitation tokens) stays private. */
export type DeliveryReceipt = {
  deliveryId: string;
  tenantId: string;
  idempotencyKey: string;
  messageId: string;
  status: DeliveryStatus;
  queuedAt: string;
  sentAt: string | null;
  nextAttemptAt: string | null;
  attempts: DeliveryAttempt[];
};

export type StoredDelivery = {
  message: TransportMessage;
  payloadHash: string;
  receipt: DeliveryReceipt;
  lease: { attemptId: string; expiresAt: string } | null;
};

export type OutboxState = {
  version: 1;
  deliveries: Record<string, StoredDelivery>;
};

export interface MailOutbox {
  /** Must serialize across all writers and commit durably before resolving. */
  transaction<T>(operation: (state: OutboxState) => T): Promise<T>;
}
