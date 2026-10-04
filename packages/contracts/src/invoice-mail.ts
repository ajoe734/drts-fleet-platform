/** sent = provider acceptance; recipient mailbox delivery is verified separately. */
export interface TenantInvoiceMailView {
  invoiceId: string;
  canSend: boolean;
  deliveryId: string | null;
  status: "not_requested" | "queued" | "sent" | "failed";
  queuedAt: string | null;
  sentAt: string | null;
  nextAttemptAt: string | null;
  attempts: {
    attemptNo: number;
    startedAt: string;
    finishedAt: string | null;
    outcome: "started" | "sent" | "failed" | "uncertain";
    errorCode: string | null;
    retryable: boolean;
    acceptedAt: string | null;
  }[];
}
