import { describe, expect, it } from "vitest";

import { PostgresMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/postgres-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  EnqueueMail,
  MailTransport,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

describe("SR-CREDENTIAL-EXPIRY-20260913: PostgresMailOutbox Invariants (§B5 / V0103)", () => {
  class FakePoolClient {
    public queries: Array<{ text: string; values?: unknown[] }> = [];
    public inTransaction = false;
    public rows: any[] = [];
    public deliveriesStore: Map<string, any> = new Map();

    async query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }> {
      this.queries.push({ text: text.trim(), values });
      const normalized = text.trim();

      if (normalized === "BEGIN") {
        this.inTransaction = true;
        return { rows: [], rowCount: 0 };
      }
      if (normalized === "COMMIT") {
        this.inTransaction = false;
        return { rows: [], rowCount: 0 };
      }
      if (normalized === "ROLLBACK") {
        this.inTransaction = false;
        return { rows: [], rowCount: 0 };
      }

      // Lock acquisition query
      if (normalized.includes("ops.phase1_notification_mail_outbox_lock")) {
        return { rows: [{ lock_key: "mail_outbox_master" }], rowCount: 1 };
      }

      // Read deliveries query
      if (normalized.includes("SELECT") && normalized.includes("ops.phase1_notification_mail_deliveries")) {
        return { rows: Array.from(this.deliveriesStore.values()), rowCount: this.deliveriesStore.size };
      }

      // Insert delivery query
      if (normalized.startsWith("INSERT INTO ops.phase1_notification_mail_deliveries")) {
        const id = values![0] as string;
        const row = {
          delivery_id: values![0],
          tenant_id: values![1],
          idempotency_key: values![2],
          message_id: values![3],
          payload_hash: values![4],
          status: values![5],
          recipient_email: values![6],
          from_email: values![7],
          subject: values![8],
          body: values![9],
          queued_at: values![10],
          sent_at: values![11],
          next_attempt_at: values![12],
          lease_attempt_id: values![13],
          lease_expires_at: values![14],
          attempts: values![15],
        };
        this.deliveriesStore.set(id, row);
        return { rows: [row], rowCount: 1 };
      }

      // Update delivery query
      if (normalized.startsWith("UPDATE ops.phase1_notification_mail_deliveries")) {
        const id = values![6] as string;
        const existing = this.deliveriesStore.get(id);
        if (existing) {
          existing.status = values![0];
          existing.sent_at = values![1];
          existing.next_attempt_at = values![2];
          existing.lease_attempt_id = values![3];
          existing.lease_expires_at = values![4];
          existing.attempts = values![5];
        }
        return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
      }

      // Delete delivery query
      if (normalized.startsWith("DELETE FROM ops.phase1_notification_mail_deliveries")) {
        const id = values![0] as string;
        this.deliveriesStore.delete(id);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }

    release() {}
  }

  const createFakePool = () => {
    const client = new FakePoolClient();
    return {
      client,
      pool: {
        connect: async () => client,
      } as any,
    };
  };

  describe("Transaction Contract & Serialization", () => {
    it("acquires exclusive lock on ops.phase1_notification_mail_outbox_lock within BEGIN/COMMIT", async () => {
      const { pool, client } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });

      const result = await outbox.transaction((state) => {
        expect(state.version).toBe(1);
        expect(state.deliveries).toEqual({});
        return "success";
      });

      expect(result).toBe("success");

      // Verify serialization lock was acquired
      const queryTexts = client.queries.map((q) => q.text);
      expect(queryTexts).toContain("BEGIN");
      expect(queryTexts.some((t) => t.includes("ops.phase1_notification_mail_outbox_lock") && t.includes("FOR UPDATE"))).toBe(true);
      expect(queryTexts).toContain("COMMIT");
    });

    it("rejects asynchronous operations inside transaction callback", async () => {
      const { pool } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });

      await expect(
        outbox.transaction((() => Promise.resolve("async-promise")) as any),
      ).rejects.toThrow("notification_outbox_requires_synchronous_transaction");
    });

    it("rolls back transaction on error inside callback", async () => {
      const { pool, client } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });

      await expect(
        outbox.transaction(() => {
          throw new Error("simulated_domain_failure");
        }),
      ).rejects.toThrow("simulated_domain_failure");

      const queryTexts = client.queries.map((q) => q.text);
      expect(queryTexts).toContain("BEGIN");
      expect(queryTexts).toContain("ROLLBACK");
      expect(queryTexts).not.toContain("COMMIT");
    });
  });

  describe("Single Persisted Attempt Authority in JSONB (attempts array)", () => {
    it("persists attempts JSONB to ops.phase1_notification_mail_deliveries on enqueue and dispatch", async () => {
      const { pool, client } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });

      const transport: MailTransport = {
        provider: "mailpit",
        send: async (msg) => ({
          provider: "mailpit",
          providerMessageId: `msg-${msg.deliveryId}`,
          response: "250 OK",
          acceptedAt: new Date().toISOString(),
        }),
      };

      const deliveryService = new NotificationDeliveryService(outbox, transport);

      const request: EnqueueMail = {
        tenantId: "tenant-corp",
        idempotencyKey: "key-12345",
        recipientEmail: "fleet-mgr@company.com",
        fromEmail: "alerts@drts.local",
        subject: "Driver Credential Alert",
        body: "Your driver license has expired.",
      };

      const receipt = await deliveryService.enqueue(request);
      expect(receipt.status).toBe("queued");
      expect(receipt.attempts).toEqual([]);

      // Verify row in fake DB
      expect(client.deliveriesStore.has(receipt.deliveryId)).toBe(true);
      const rowAfterEnqueue = client.deliveriesStore.get(receipt.deliveryId);
      expect(rowAfterEnqueue.status).toBe("queued");
      expect(JSON.parse(rowAfterEnqueue.attempts)).toEqual([]);

      // Now dispatch the queued delivery
      const dispatched = await deliveryService.dispatch("tenant-corp", receipt.deliveryId);
      expect(dispatched).not.toBeNull();
      expect(dispatched!.status).toBe("sent");
      expect(dispatched!.attempts).toHaveLength(1);
      expect(dispatched!.attempts[0]!.outcome).toBe("sent");
      expect(dispatched!.attempts[0]!.acknowledgement?.provider).toBe("mailpit");

      // Verify that the attempt was persisted into the JSONB attempts column
      const rowAfterDispatch = client.deliveriesStore.get(receipt.deliveryId);
      expect(rowAfterDispatch.status).toBe("sent");
      const storedAttempts = JSON.parse(rowAfterDispatch.attempts);
      expect(storedAttempts).toHaveLength(1);
      expect(storedAttempts[0].attemptId).toBe(dispatched!.attempts[0]!.attemptId);
      expect(storedAttempts[0].acknowledgement.providerMessageId).toBe(`msg-${receipt.deliveryId}`);
    });
  });

  describe("Tenant Idempotency Invariants", () => {
    it("returns existing receipt when identical request is enqueued", async () => {
      const { pool } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });
      const deliveryService = new NotificationDeliveryService(outbox);

      const request: EnqueueMail = {
        tenantId: "tenant-001",
        idempotencyKey: "idem-abc",
        recipientEmail: "driver@local.test",
        fromEmail: "admin@local.test",
        subject: "Subject",
        body: "Body",
      };

      const r1 = await deliveryService.enqueue(request);
      const r2 = await deliveryService.enqueue(request);

      expect(r1.deliveryId).toBe(r2.deliveryId);
      expect(r1.messageId).toBe(r2.messageId);
    });

    it("throws notification_idempotency_conflict on conflicting payload hash with same key", async () => {
      const { pool } = createFakePool();
      const outbox = new PostgresMailOutbox({ pool });
      const deliveryService = new NotificationDeliveryService(outbox);

      const request1: EnqueueMail = {
        tenantId: "tenant-001",
        idempotencyKey: "idem-abc",
        recipientEmail: "driver@local.test",
        fromEmail: "admin@local.test",
        subject: "Original Subject",
        body: "Body",
      };

      const request2: EnqueueMail = {
        ...request1,
        subject: "Conflicting Subject",
      };

      await deliveryService.enqueue(request1);
      await expect(deliveryService.enqueue(request2)).rejects.toThrow("notification_idempotency_conflict");
    });
  });
});
