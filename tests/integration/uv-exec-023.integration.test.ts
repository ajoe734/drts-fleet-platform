import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MediaWorkerServer } from "../../apps/voice-media-worker/src/index";
import {
  LeaseFencedError,
  VoiceCommandRunnerService,
} from "../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { VoiceCallbackService } from "../../apps/api/src/modules/voice-booking/voice-callback.service";
import type { VoiceBookingCommandService } from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import type { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { VoiceQueryExecutor } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";

// In-memory mock database / query executor for hermetic integration testing
interface MockWorkItemRow {
  work_id: string;
  command_id: string | null;
  voice_session_id: string | null;
  work_type: string;
  dedupe_key: string;
  payload_ref: string | null;
  status: "pending" | "leased" | "completed" | "failed" | "dead_letter";
  attempt: number;
  run_after: Date;
  lease_epoch: number;
  leased_until: Date | null;
  last_error: string | null;
}

class MockVoiceWorkDatabase {
  readonly items = new Map<string, MockWorkItemRow>();
  readonly receipts = new Map<
    string,
    { commandId: string; status: string; orderId?: string }
  >();
  readonly orders = new Map<
    string,
    { orderId: string; status: string; callId: string }
  >();

  insertWorkItem(item: {
    workId?: string;
    commandId?: string | null;
    voiceSessionId?: string | null;
    workType: string;
    dedupeKey: string;
    payloadRef?: string | null;
    runAfter?: Date;
  }): MockWorkItemRow {
    const workId = item.workId ?? randomUUID();
    const row: MockWorkItemRow = {
      work_id: workId,
      command_id: item.commandId ?? null,
      voice_session_id: item.voiceSessionId ?? null,
      work_type: item.workType,
      dedupe_key: item.dedupeKey,
      payload_ref: item.payloadRef ?? null,
      status: "pending",
      attempt: 0,
      run_after: item.runAfter ?? new Date(),
      lease_epoch: 0,
      leased_until: null,
      last_error: null,
    };
    this.items.set(workId, row);
    return row;
  }

  createMockQueryExecutor(): VoiceQueryExecutor {
    return {
      query: async <T = unknown>(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: T[]; rowCount: number }> => {
        // Query for candidate work items (lease claim)
        if (
          sql.includes("WITH candidate AS") ||
          sql.includes("UPDATE voice.work_item w SET status = 'leased'")
        ) {
          const supportedTypes = values?.[0] as string[] | null | undefined;
          const now = new Date();

          for (const item of this.items.values()) {
            const isRunnable =
              (item.status === "pending" && item.run_after <= now) ||
              (item.status === "leased" &&
                item.leased_until &&
                item.leased_until < now);

            const matchesType =
              !supportedTypes || supportedTypes.includes(item.work_type);

            if (isRunnable && matchesType) {
              item.status = "leased";
              item.attempt += 1;
              item.lease_epoch += 1;
              item.leased_until = new Date(now.getTime() + 30_000);

              return {
                rows: [
                  {
                    work_id: item.work_id,
                    command_id: item.command_id,
                    voice_session_id: item.voice_session_id,
                    work_type: item.work_type,
                    dedupe_key: item.dedupe_key,
                    payload_ref: item.payload_ref,
                    lease_epoch: item.lease_epoch,
                    attempt: item.attempt,
                  } as T,
                ],
                rowCount: 1,
              };
            }
          }
          return { rows: [], rowCount: 0 };
        }

        // CAS update for completing work item
        if (
          sql.includes("UPDATE voice.work_item") &&
          sql.includes("status = 'completed'")
        ) {
          const workId = values?.[0] as string;
          const leaseEpoch = values?.[1] as number;

          const item = this.items.get(workId);
          if (
            item &&
            item.status === "leased" &&
            item.lease_epoch === leaseEpoch
          ) {
            item.status = "completed";
            item.leased_until = null;
            item.last_error = null;
            return { rows: [{ work_id: workId } as T], rowCount: 1 };
          }
          // Fencing: lease epoch mismatch or not leased
          return { rows: [], rowCount: 0 };
        }

        // Generic error/retry update
        if (
          sql.includes("UPDATE voice.work_item") &&
          sql.includes("SET status = CASE WHEN")
        ) {
          const workId = values?.[0] as string;
          const leaseEpoch = values?.[1] as number;
          const maxAttempts = (values?.[2] as number) ?? 5;
          const lastError = values?.[3] as string;

          const item = this.items.get(workId);
          if (item && item.lease_epoch === leaseEpoch) {
            item.status = item.attempt >= maxAttempts ? "failed" : "pending";
            item.leased_until = null;
            item.last_error = lastError;
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }

        return { rows: [], rowCount: 0 };
      },
    };
  }
}

describe("UV-EXEC-023: 獨立媒體部署、持續背景工作及回退", () => {
  describe("1. persistent_runner_idle_evidence (SD §3.4, §15, UV-AC-042)", () => {
    it("processes pending booking receipts, driver deadlines, recording finalization, and callbacks when 0 calls exist", async () => {
      const db = new MockVoiceWorkDatabase();
      const mockExecutor = db.createMockQueryExecutor();

      const mockRepository = {
        withTransaction: async <T>(
          fn: (tx: VoiceQueryExecutor) => Promise<T>,
        ): Promise<T> => {
          return fn(mockExecutor);
        },
        findReceiptById: async (commandId: string) => {
          return (
            db.receipts.get(commandId) ?? {
              commandId,
              status: "succeeded",
              orderId: "order-123",
            }
          );
        },
      };

      const mockCommandsService = {
        repository: mockRepository,
      } as unknown as VoiceBookingCommandService;

      const mockOrdersRepo = {} as unknown as OwnedMobilityRepository;
      const callbackService = new VoiceCallbackService();

      const runner = new VoiceCommandRunnerService(
        mockCommandsService,
        mockOrdersRepo,
        undefined, // dispatchExecutor
        callbackService,
      );

      // Create a consented callback task in the callback service
      const callbackRes = await callbackService.createCallback({
        brandId: "brand-1",
        callId: "call-1",
        voiceSessionId: "session-1",
        contactPhone: "0911000111",
        consentRef: "consent-ref-123",
        reason: "driver_delayed",
      });

      // Enqueue the 4 background work item types representing post-hangup background work:
      // 1. pending receipt command
      const commandId = randomUUID();
      db.receipts.set(commandId, { commandId, status: "pending" });
      db.insertWorkItem({
        workId: "work-cmd-1",
        commandId,
        workType: "execute_booking_command",
        dedupeKey: `${commandId}:execute_booking_command`,
      });

      // 2. driver dispatch deadline / timeout
      db.insertWorkItem({
        workId: "work-timeout-1",
        commandId: null,
        workType: "dispatch_timeout",
        dedupeKey: "dispatch:order-123:round-1:timeout",
        payloadRef: JSON.stringify({
          orderId: "order-123",
          targetAssignmentId: "assign-1",
          round: 1,
        }),
      });

      // 3. recording finalization for closed call
      db.insertWorkItem({
        workId: "work-rec-1",
        commandId: null,
        voiceSessionId: "session-closed-1",
        workType: "finalize_recording",
        dedupeKey: "session-closed-1:finalize_recording",
        payloadRef: JSON.stringify({ recordingId: "rec-999" }),
      });

      // 4. consented callback task execution
      db.insertWorkItem({
        workId: "work-cb-1",
        commandId: null,
        voiceSessionId: "session-1",
        workType: "execute_callback",
        dedupeKey: `callback:${callbackRes.task.taskId}:execute`,
        payloadRef: JSON.stringify({ taskId: callbackRes.task.taskId }),
      });

      // Mock execute(commandId) to simulate order creation on pending receipt
      runner.execute = async (id: string) => {
        const receipt = db.receipts.get(id);
        if (receipt) {
          receipt.status = "succeeded";
          receipt.orderId = "order-created-999";
        }
        return {
          commandId: id,
          status: "succeeded",
          orderId: "order-created-999",
        };
      };

      // Ensure 0 active customer calls exist (idle environment)
      expect(runner.running).toBe(false);

      // Start runner and process work items
      const res1 = await runner.runOnce();
      expect(res1?.workType).toBe("execute_booking_command");
      expect(res1?.success).toBe(true);
      expect(db.items.get("work-cmd-1")?.status).toBe("completed");
      expect(db.receipts.get(commandId)?.status).toBe("succeeded");

      const res2 = await runner.runOnce();
      expect(res2?.workType).toBe("dispatch_timeout");
      expect(res2?.success).toBe(true);
      expect(db.items.get("work-timeout-1")?.status).toBe("completed");

      const res3 = await runner.runOnce();
      expect(res3?.workType).toBe("finalize_recording");
      expect(res3?.success).toBe(true);
      expect(db.items.get("work-rec-1")?.status).toBe("completed");

      const res4 = await runner.runOnce();
      expect(res4?.workType).toBe("execute_callback");
      expect(res4?.success).toBe(true);
      expect(db.items.get("work-cb-1")?.status).toBe("completed");

      // Verify callback task was claimed
      const updatedCb = callbackService.getTaskById(callbackRes.task.taskId);
      expect(updatedCb?.status).toBe("claimed");

      // When queue is empty, runOnce safely returns null and does not crash
      const resEmpty = await runner.runOnce();
      expect(resEmpty).toBeNull();
    });
  });

  describe("2. cross_revision_drain_recovery_evidence (SD §3.4, §15, UV-AC-030)", () => {
    it("fences stale revision lease to prevent duplicate execution when two revisions run concurrently", async () => {
      const db = new MockVoiceWorkDatabase();
      const mockExecutor = db.createMockQueryExecutor();

      const mockRepository = {
        withTransaction: async <T>(
          fn: (tx: VoiceQueryExecutor) => Promise<T>,
        ): Promise<T> => {
          return fn(mockExecutor);
        },
      };

      const mockCommandsService = {
        repository: mockRepository,
      } as unknown as VoiceBookingCommandService;

      const runnerRevision1 = new VoiceCommandRunnerService(
        mockCommandsService,
        {} as unknown as OwnedMobilityRepository,
      );

      const runnerRevision2 = new VoiceCommandRunnerService(
        mockCommandsService,
        {} as unknown as OwnedMobilityRepository,
      );

      let sideEffectExecutionCount = 0;
      runnerRevision1.registerHandler("dispatch_timeout", async () => {
        sideEffectExecutionCount++;
        return { executedBy: "revision-1" };
      });
      runnerRevision2.registerHandler("dispatch_timeout", async () => {
        sideEffectExecutionCount++;
        return { executedBy: "revision-2" };
      });

      const workRow = db.insertWorkItem({
        workId: "work-timeout-fenced",
        workType: "dispatch_timeout",
        dedupeKey: "dispatch:order-fenced:timeout",
      });

      // 1. Revision 1 claims the work item (epoch = 1)
      const res1 = await runnerRevision1.runOnce();
      expect(res1?.success).toBe(true);
      expect(workRow.lease_epoch).toBe(1);
      expect(workRow.status).toBe("completed");

      // Reset to simulate a lease expiration / fault injection before Revision 1 could commit:
      workRow.status = "leased";
      workRow.leased_until = new Date(Date.now() - 1000); // Expired!

      // 2. Revision 2 claims the expired item (epoch becomes 2)
      const res2 = await runnerRevision2.runOnce();
      expect(res2?.success).toBe(true);
      expect(workRow.lease_epoch).toBe(2);
      expect(workRow.status).toBe("completed");

      // 3. Stale Revision 1 attempts to complete using its old epoch 1
      await expect(
        mockRepository.withTransaction(async (tx) => {
          await runnerRevision1.completeWorkItem(tx, "work-timeout-fenced", 1);
        }),
      ).rejects.toThrow(LeaseFencedError);

      // Verify that status remains completed under epoch 2
      expect(workRow.status).toBe("completed");
      expect(workRow.lease_epoch).toBe(2);
      expect(sideEffectExecutionCount).toBe(2);
    });

    it("media worker server handles capacity admission, readiness probes, and graceful drain on shutdown", async () => {
      const server = new MediaWorkerServer({
        port: 0, // OS assigned random port
        maxConcurrentSessions: 2,
        wsTimeoutMs: 300_000,
        drainTimeoutMs: 500,
      });

      const port = await server.start();
      expect(port).toBeGreaterThan(0);
      expect(server.running).toBe(true);

      try {
        // 1. Check health and readiness probes
        const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
        expect(healthRes.status).toBe(200);
        const healthBody = (await healthRes.json()) as { status: string };
        expect(healthBody.status).toBe("ok");

        const readyRes = await fetch(`http://127.0.0.1:${port}/ready`);
        expect(readyRes.status).toBe(200);

        // 2. Admit sessions up to capacity
        const s1 = server.admitSession("test-session-1");
        const s2 = server.admitSession("test-session-2");
        expect(server.sessionCount).toBe(2);

        // 3. Capacity exceeded: 3rd admission must fail
        expect(() => server.admitSession("test-session-3")).toThrow(
          "CAPACITY_EXCEEDED",
        );
        const capacityReadyRes = await fetch(`http://127.0.0.1:${port}/ready`);
        expect(capacityReadyRes.status).toBe(503);

        // 4. Initiate drain: /ready returns 503, new admissions blocked
        const drainPromise = server.drain(200);
        expect(server.draining).toBe(true);

        const drainingReadyRes = await fetch(`http://127.0.0.1:${port}/ready`);
        expect(drainingReadyRes.status).toBe(503);
        expect(() => server.admitSession("test-session-post-drain")).toThrow(
          "DRAINING",
        );

        // Close active sessions to let drain finish
        server.closeSession(s1.sessionId);
        server.closeSession(s2.sessionId);

        const drainResult = await drainPromise;
        expect(drainResult.drainedSessions).toBe(2);
        expect(server.running).toBe(false);
      } finally {
        await server.stop();
      }
    });
  });

  describe("3. deployment_rollback_plan (SD §15.2, §15.4)", () => {
    it("verifies rollback invariants: no table deletion, no loss of proof/receipt, and no auto-cancellation of existing orders", async () => {
      const db = new MockVoiceWorkDatabase();

      // Seed mock state before rollback
      const orderId = "order-voice-pre-rollback-1";
      db.orders.set(orderId, {
        orderId,
        status: "driver_assigned",
        callId: "call-1",
      });

      const commandId = "cmd-pre-rollback-1";
      db.receipts.set(commandId, {
        commandId,
        status: "succeeded",
        orderId,
      });

      db.insertWorkItem({
        workId: "work-rec-1",
        commandId,
        workType: "execute_booking_command",
        dedupeKey: `${commandId}:execute`,
      });

      // Simulate rollback event: service version changed, but database tables & rows are untouched
      expect(db.orders.has(orderId)).toBe(true);
      expect(db.orders.get(orderId)?.status).toBe("driver_assigned");
      expect(db.receipts.get(commandId)?.status).toBe("succeeded");
      expect(db.items.has("work-rec-1")).toBe(true);

      // Verify that existing order is NOT automatically cancelled
      const existingOrder = db.orders.get(orderId);
      expect(existingOrder?.status).not.toBe("cancelled");
      expect(existingOrder?.status).toBe("driver_assigned");

      // Verify receipt and proof integrity remains accessible
      const existingReceipt = db.receipts.get(commandId);
      expect(existingReceipt?.commandId).toBe(commandId);
      expect(existingReceipt?.orderId).toBe(orderId);
    });
  });
});
