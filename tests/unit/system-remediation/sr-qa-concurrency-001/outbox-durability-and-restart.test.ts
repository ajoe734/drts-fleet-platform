import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  EnqueueMail,
  MailTransport,
  ProviderAcknowledgement,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

describe("SR-QA-CONCURRENCY-001: Background Outbox Durability & Restart Recovery Verification", () => {
  let spoolDir: string;

  beforeEach(async () => {
    spoolDir = await mkdtemp(join(tmpdir(), "sr-qa-concurrency-outbox-"));
  });

  afterEach(async () => {
    try {
      await rm(spoolDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function createMockTransport(options?: {
    failAttempts?: number;
    delayMs?: number;
  }): {
    transport: MailTransport;
    sentMessages: EnqueueMail[];
  } {
    const sentMessages: EnqueueMail[] = [];
    let attemptCounter = 0;

    const transport: MailTransport = {
      provider: "test-smtp-provider",
      async send(message) {
        attemptCounter++;
        if (options?.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (options?.failAttempts && attemptCounter <= options.failAttempts) {
          throw new Error(
            `Simulated transient provider network failure (attempt ${attemptCounter})`,
          );
        }
        sentMessages.push(message);
        const ack: ProviderAcknowledgement = {
          provider: "test-smtp-provider",
          response: "250 2.0.0 Ok: queued",
          providerMessageId: `msg-${message.deliveryId}`,
          acceptedAt: new Date().toISOString(),
        };
        return ack;
      },
    };

    return { transport, sentMessages };
  }

  it("Case 1 (Positive): Deduplicates concurrent enqueue requests across two workers to a single delivery record", async () => {
    const outboxA = new FileMailOutbox(spoolDir);
    const outboxB = new FileMailOutbox(spoolDir);
    const workerA = new NotificationDeliveryService(outboxA);
    const workerB = new NotificationDeliveryService(outboxB);

    const mailRequest: EnqueueMail = {
      tenantId: "tenant-concurrency-001",
      idempotencyKey: "invite-worker-alpha-001",
      recipientEmail: "driver01@example.com",
      fromEmail: "noreply@drts.example.com",
      subject: "Driver Activation Invitation",
      body: "Please click to activate your driver portal account.",
    };

    // Both workers attempt to enqueue concurrently
    const [receiptA, receiptB] = await Promise.all([
      workerA.enqueue(mailRequest),
      workerB.enqueue(mailRequest),
    ]);

    expect(receiptA.deliveryId).toBeDefined();
    expect(receiptB.deliveryId).toBe(receiptA.deliveryId);
    expect(receiptB.messageId).toBe(receiptA.messageId);
    expect(receiptA.status).toBe("queued");
    expect(receiptB.status).toBe("queued");

    // Inspection of outbox state verifies exactly one delivery entry
    await outboxA.transaction((state) => {
      expect(Object.keys(state.deliveries)).toHaveLength(1);
    });
  });

  it("Case 2 (Negative): Rejects re-enqueue with same key but altered payload (immutable payload enforcement)", async () => {
    const outbox = new FileMailOutbox(spoolDir);
    const worker = new NotificationDeliveryService(outbox);

    const initialRequest: EnqueueMail = {
      tenantId: "tenant-concurrency-001",
      idempotencyKey: "invoice-alert-002",
      recipientEmail: "billing@tenant.com",
      fromEmail: "billing@drts.example.com",
      subject: "Monthly Statement August 2026",
      body: "Original statement summary.",
    };

    await worker.enqueue(initialRequest);

    // Attempt to alter recipient email with same key
    const conflictingRequest: EnqueueMail = {
      ...initialRequest,
      recipientEmail: "attacker@tenant.com",
    };

    let caughtError: unknown;
    try {
      await worker.enqueue(conflictingRequest);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe(
      "notification_idempotency_conflict",
    );
  });

  it("Case 3 (Restart Recovery): Recovers abandoned attempt as 'uncertain' after worker crash and completes on restart drain", async () => {
    let simulatedTime = new Date("2026-09-10T12:00:00.000Z");
    const getTime = () => simulatedTime;

    const outboxInstanceA = new FileMailOutbox(spoolDir);
    const { transport, sentMessages } = createMockTransport();

    const workerA = new NotificationDeliveryService(
      outboxInstanceA,
      transport,
      {
        now: getTime,
        leaseMs: 10_000, // 10 second lease
      },
    );

    const receipt = await workerA.enqueue({
      tenantId: "tenant-concurrency-001",
      idempotencyKey: "driver-trip-receipt-003",
      recipientEmail: "passenger@example.com",
      fromEmail: "trips@drts.example.com",
      subject: "Trip Receipt #TR-1001",
      body: "Thank you for riding with DRTS.",
    });

    // Simulate crash: Worker A starts dispatch (leases attempt), but process crashes before transport returns
    await outboxInstanceA.transaction((state) => {
      const entry = state.deliveries[receipt.deliveryId]!;
      const attemptId = "attempt-crashed-worker-a";
      entry.lease = {
        attemptId,
        expiresAt: new Date(simulatedTime.getTime() + 10_000).toISOString(),
      };
      entry.receipt.attempts.push({
        attemptId,
        attemptNo: 1,
        startedAt: simulatedTime.toISOString(),
        finishedAt: null,
        outcome: "started",
        errorCode: null,
        retryable: false,
        acknowledgement: null,
      });
    });

    // Advance simulated time past lease expiration (simulating container restart delay)
    simulatedTime = new Date("2026-09-10T12:00:15.000Z"); // +15s (lease was 10s)

    // Instance B (or restarted container) starts up with fresh service instance
    const outboxInstanceB = new FileMailOutbox(spoolDir);
    const workerB = new NotificationDeliveryService(
      outboxInstanceB,
      transport,
      {
        now: getTime,
        leaseMs: 10_000,
      },
    );

    // Restart recovery drain
    const drainedReceipts = await workerB.drain();
    expect(drainedReceipts).toHaveLength(1);
    const finalReceipt = drainedReceipts[0]!;

    expect(finalReceipt.status).toBe("sent");
    expect(finalReceipt.sentAt).toBeDefined();
    // Verify attempt history:
    // Attempt 1 was marked "uncertain" due to expired lease from crashed worker
    // Attempt 2 succeeded
    expect(finalReceipt.attempts).toHaveLength(2);
    expect(finalReceipt.attempts[0]?.outcome).toBe("uncertain");
    expect(finalReceipt.attempts[0]?.errorCode).toBe(
      "delivery_outcome_unknown",
    );
    expect(finalReceipt.attempts[1]?.outcome).toBe("sent");
    expect(finalReceipt.attempts[1]?.acknowledgement?.response).toBe(
      "250 2.0.0 Ok: queued",
    );

    // Verify exactly 1 message was transmitted over network
    expect(sentMessages).toHaveLength(1);
  });

  it("Case 4 (Deduplication): Already sent deliveries are skipped by subsequent drain operations", async () => {
    const outbox = new FileMailOutbox(spoolDir);
    const { transport, sentMessages } = createMockTransport();
    const service = new NotificationDeliveryService(outbox, transport);

    await service.enqueue({
      tenantId: "tenant-concurrency-001",
      idempotencyKey: "scheduled-report-004",
      recipientEmail: "compliance@gov.tw",
      fromEmail: "reports@drts.example.com",
      subject: "Daily Audit Report",
      body: "Audit hash bundle.",
    });

    // First drain delivers the email
    const firstDrain = await service.drain();
    expect(firstDrain).toHaveLength(1);
    expect(firstDrain[0]?.status).toBe("sent");
    expect(sentMessages).toHaveLength(1);

    // Second drain occurs immediately after (or by another parallel worker)
    const secondDrain = await service.drain();
    // Must find zero due items
    expect(secondDrain).toHaveLength(0);
    // Transport was NOT called again
    expect(sentMessages).toHaveLength(1);
  });

  it("Case 5 (Multi-Worker Mutex): Linux flock guarantees strict serialization of concurrent state updates", async () => {
    const outbox = new FileMailOutbox(spoolDir);
    const concurrentCount = 10;
    const executionOrder: number[] = [];

    // 10 concurrent async operations executing outbox transactions
    await Promise.all(
      Array.from({ length: concurrentCount }).map(async (_, idx) => {
        return outbox.transaction((state) => {
          executionOrder.push(idx);
          // Mutate state in transaction
          (state as unknown as { counter?: number }).counter =
            ((state as unknown as { counter?: number }).counter ?? 0) + 1;
        });
      }),
    );

    expect(executionOrder).toHaveLength(concurrentCount);
    await outbox.transaction((state) => {
      expect((state as unknown as { counter?: number }).counter).toBe(
        concurrentCount,
      );
    });
  });
});
