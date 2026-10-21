import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { PostgresMailOutbox } from "../../../apps/api/src/modules/notification-delivery/postgres-mail-outbox";
import type { OutboxState } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { legacyExpiryRegistryStorage } from "../registry-driver-master-durable-ack-20261014/storage-fixture";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";

// Load the API's actual installed pg package. Only the external client/socket is
// controlled; Pool acquisition/timeout, Outbox, Notification and Registry run.
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Pool } = apiRequire("pg") as typeof import("pg");
const asOf = "2030-06-01T00:00:00.000Z";
const columns = [
  "delivery_id",
  "tenant_id",
  "idempotency_key",
  "message_id",
  "payload_hash",
  "status",
  "recipient_email",
  "from_email",
  "subject",
  "body",
  "queued_at",
  "sent_at",
  "next_attempt_at",
  "lease_attempt_id",
  "lease_expires_at",
  "attempts",
];

function service(
  storage: ReturnType<typeof legacyExpiryRegistryStorage>,
  notification: NotificationDeliveryService,
) {
  const audit = new AuditNotificationService();
  const result = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
    storage.repository,
    notification,
  );
  const driver = result.listDrivers()[0]!;
  Object.assign(result, {
    drivers: [
      {
        ...driver,
        licenseExpiry: "2020-01-01T00:00:00.000Z",
        professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
        taxiDriverRegistrationExpiry: "2099-01-01T00:00:00.000Z",
      },
    ],
    policies: [],
  });
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("Registry actual installed pg-pool acquisition recovery (socket-free)", () => {
  it.each(["queue", "connect"] as const)(
    "recovers the same Registry intent after actual uncoded %s timeout, then replays one receipt",
    async (mode) => {
      const rows = new Map<string, Record<string, unknown>>();
      const control = { stall: mode === "connect" };
      class SocketFreeClient extends EventEmitter {
        _queryable = true;
        _ending = false;
        private connected = false;
        private waiting: ((error?: Error) => void) | null = null;
        isConnected() {
          return this.connected;
        }
        connect(callback: (error?: Error) => void) {
          if (control.stall) {
            this.waiting = callback;
            return;
          }
          this.connected = true;
          queueMicrotask(() => callback());
        }
        end(callback?: () => void) {
          this._ending = true;
          const waiting = this.waiting;
          this.waiting = null;
          waiting?.(new Error("controlled client ended before connecting"));
          this.emit("end");
          callback?.();
        }
        async query(text: string, values: unknown[] = []) {
          if (/SELECT\s+delivery_id,/.test(text))
            return { rows: [...rows.values()] };
          if (
            text.includes("INSERT INTO ops.phase1_notification_mail_deliveries")
          ) {
            rows.set(
              String(values[0]),
              Object.fromEntries(columns.map((name, i) => [name, values[i]])),
            );
          }
          return { rows: [] };
        }
      }
      const pool = new Pool({
        Client: SocketFreeClient,
        max: 1,
        connectionTimeoutMillis: 10,
        idleTimeoutMillis: 0,
      } as never);
      const held = mode === "queue" ? await pool.connect() : null;
      let released = false;
      const acquire = vi.spyOn(pool, "connect"); // Call-through observation, never a fake Pool result.
      const notification = new NotificationDeliveryService(
        new PostgresMailOutbox(pool),
      );
      const storage = legacyExpiryRegistryStorage();
      const originalService = service(storage, notification);
      const observed: Record<string, unknown> = {
        mode,
        installedPg: apiRequire("pg/package.json").version,
        socketFree: true,
        noPostgresEngine: true,
      };
      try {
        await originalService.reconcileExpiredCredentials({ asOf, limit: 1 });
        const first = structuredClone(
          (await originalService.getExpiryBacklog())[0]!,
        );
        const failure = await (
          acquire.mock.results[0]!.value as Promise<unknown>
        ).then(
          () => null,
          (error: unknown) => error,
        );
        observed.afterTimeout = first;
        observed.actualError = {
          message: (failure as Error).message,
          code: (failure as NodeJS.ErrnoException).code ?? null,
          causeCode:
            (failure as { cause?: NodeJS.ErrnoException }).cause?.code ?? null,
        };
        expect(failure).toBeInstanceOf(Error);
        const expectedMessage =
          mode === "queue"
            ? "timeout exceeded when trying to connect"
            : "Connection terminated due to connection timeout";
        expect((failure as Error).message).toBe(expectedMessage);
        expect((failure as NodeJS.ErrnoException).code).toBeUndefined();
        expect(
          (failure as { cause?: NodeJS.ErrnoException }).cause?.code,
        ).toBeUndefined();
        expect(first.intent?.last_error).toBe(expectedMessage);
        expect(acquire).toHaveBeenCalledTimes(1);
        expect(rows.size).toBe(0);
        held?.release();
        released = true;
        control.stall = false;
        const restarted = service(storage, notification);
        await restarted.reconcileExpiredCredentials({ asOf, limit: 1 });
        const second = structuredClone(
          (await restarted.getExpiryBacklog())[0]!,
        );
        observed.afterRecovery = second;
        observed.acceptedRows = rows.size;
        expect(second.intent?.delivery_status).toBe("enqueued");
        expect(second.status).toBe("completed");
        expect(second.event_id).toBe(first.event_id);
        expect(second.intent).toMatchObject({
          intent_id: first.intent!.intent_id,
          event_id: first.intent!.event_id,
          scope: first.intent!.scope,
          tenant_id: first.intent!.tenant_id,
          idempotency_key: first.intent!.idempotency_key,
          recipient_email: first.intent!.recipient_email,
          from_email: first.intent!.from_email,
          subject: first.intent!.subject,
          body: first.intent!.body,
          last_error: expectedMessage,
        });
        expect(second.intent!.outbox_delivery_id).toBeTruthy();
        expect(rows.size).toBe(1);
        expect(acquire).toHaveBeenCalledTimes(2);
        await restarted.reconcileExpiredCredentials({ asOf, limit: 1 });
        expect(acquire).toHaveBeenCalledTimes(2);
        const intent = second.intent!;
        const replay = await notification.enqueue({
          tenantId: intent.tenant_id,
          idempotencyKey: intent.idempotency_key,
          recipientEmail: intent.recipient_email,
          fromEmail: intent.from_email,
          subject: intent.subject,
          body: intent.body,
        });
        expect(replay.deliveryId).toBe(intent.outbox_delivery_id);
        expect(rows.size).toBe(1);
        observed.replayReceipt = replay.deliveryId;
        observed.actualPoolAcquisitions = acquire.mock.calls.length;
      } finally {
        if (process.env.REGISTRY_EXPIRY_POOL_OBSERVATION_DIR)
          writeFileSync(
            join(
              process.env.REGISTRY_EXPIRY_POOL_OBSERVATION_DIR,
              `R1-pool-${mode}-observation.json`,
            ),
            JSON.stringify(observed, null, 2) + "\n",
          );
        if (!released) held?.release();
        await pool.end();
      }
    },
  );

  it.each([
    new Error("unknown handoff failure"),
    new Error("timeout exceeded when trying to connect to another service"),
    Object.assign(new Error("timeout exceeded when trying to connect"), {
      code: "INVALID_POOL_OPTIONS",
    }),
  ])("retains terminal unknown or nontransient errors: %s", async (failure) => {
    class FailedStorage extends MemoryMailOutbox {
      calls = 0;
      override async transaction<T>(
        _operation: (state: OutboxState) => T,
      ): Promise<T> {
        void _operation;
        this.calls++;
        throw failure;
      }
    }
    const outbox = new FailedStorage();
    const notification = new NotificationDeliveryService(outbox);
    const storage = legacyExpiryRegistryStorage();
    const f = service(storage, notification);
    await f.reconcileExpiredCredentials({ asOf });
    const original = structuredClone((await f.getExpiryReceipts())[0]!);
    expect(original).toMatchObject({
      delivery_status: "failed",
      last_error: failure.message,
      outbox_delivery_id: null,
    });
    await service(storage, notification).reconcileExpiredCredentials({ asOf });
    expect(await f.getExpiryReceipts()).toEqual([original]);
    expect(outbox.calls).toBe(1);
  });
});
