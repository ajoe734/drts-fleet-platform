import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingCommandService } from "../../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { seedVoiceDispatchWorkFixture } from "../../support/voice-dispatch-workitem-postgres-fixture";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

// Full migrations and real separate PostgreSQL connections on GitHub only.
// Fixture contact/consent/provider ports are explicitly synthetic, with no PSTN
// or real-consent claim. Callback task/attempt/lease/order state stays real.
describe.skipIf(!hostedPaymentEnabled)(
  "durable voice callback operations on full PostgreSQL schema",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    async function setup() {
      const fixture = await seedVoiceDispatchWorkFixture(h.pool!);
      const a = new VoiceCallbackService(undefined, h.database);
      const b = new VoiceCallbackService(undefined, h.peerDatabase());
      const input = {
        voiceSessionId: fixture.request.voiceSessionId,
        contactPhoneEncrypted: "synthetic-callback-ciphertext",
        contactPhoneLookupToken: "synthetic-callback-lookup",
        consentSnapshotHash: "explicit-synthetic-callback-consent-hash",
        reason: "Synthetic callback request",
        dueAt: "2026-10-19T00:00:00Z",
      };
      const { task } = await a.createCallbackDurable(input);
      return { fixture, a, b, input, task };
    }

    it("a missing callback task is retried instead of acknowledging a placeholder success", async () => {
      const { fixture, a, b, task } = await setup();
      const repository = new VoiceBookingRepository(h.peerDatabase());
      const commands = new VoiceBookingCommandService(
        repository,
        fixture.makeEvidence(repository) as never,
        fixture.products as never,
        fixture.areas as never,
        fixture.access,
      );
      const runner = new VoiceCommandRunnerService(
        commands,
        new OwnedMobilityRepository(h.peerDatabase()),
        undefined,
        b,
      );
      const work = await h.pool!.query<{ work_id: string }>(
        "INSERT INTO voice.work_item (voice_session_id,work_type,dedupe_key,payload_ref,run_after) VALUES ($1,'execute_callback',$2,$3,now()) RETURNING work_id",
        [
          fixture.request.voiceSessionId,
          "execute_callback:missing-task",
          JSON.stringify({ taskId: randomUUID() }),
        ],
      );
      expect(
        await runner.runOnce({ supportedTypes: ["execute_callback"] }),
      ).toMatchObject({
        workType: "execute_callback",
        success: false,
        error: "Callback task unavailable",
      });
      expect(
        (
          await h.pool!.query(
            "SELECT status, last_error FROM voice.work_item WHERE work_id = $1",
            [work.rows[0]!.work_id],
          )
        ).rows[0],
      ).toMatchObject({
        status: "pending",
        last_error: "Callback task unavailable",
      });
      expect(await a.getTaskForRead(task.taskId)).toMatchObject({
        status: "pending",
        version: 1,
        attemptCount: 0,
      });
    });

    it("cold peers read the actual call, brand, owner, attempts and original bound order", async () => {
      const { fixture, a, b, task } = await setup();
      const repository = new VoiceBookingRepository(h.database);
      const commands = new VoiceBookingCommandService(
        repository,
        fixture.makeEvidence(repository) as never,
        fixture.products as never,
        fixture.areas as never,
        fixture.access,
      );
      const accepted = await commands.accept(
        "fixture-provider",
        fixture.request,
      );
      const committed = await new VoiceCommandRunnerService(
        commands,
        new OwnedMobilityRepository(h.database),
      ).execute(accepted.commandId);
      expect(committed.status).toBe("succeeded");
      const orderId = committed.orderId!;
      expect(orderId).toBeTruthy();
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id = $1",
            [orderId],
          )
        ).rowCount,
      ).toBe(1);
      const claimed = await b.claimCallbackForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-A",
        expectedVersion: 1,
      });
      expect(claimed).toMatchObject({
        brandId: fixture.authority.brandId,
        callId: fixture.callId,
        linkedOrderId: orderId,
        resourceScopeId: fixture.scopeId,
        assignedOperatorId: "synthetic-A",
        status: "claimed",
        version: 2,
      });
      expect(Date.parse(claimed.claimExpiresAt!)).toBeGreaterThan(Date.now());
      const result = await a.recordAttemptForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-A",
        expectedVersion: 2,
        outcome: "answered",
        dialOperationKey: "synthetic-dial-operation",
        dialStatus: "bridged",
        notes: "Synthetic provider observation",
        hangupConfirmed: false,
      });
      expect(result.task).toMatchObject({
        status: "in_progress",
        attemptCount: 1,
        lastOutcome: "answered",
        linkedOrderId: orderId,
        version: 3,
      });
      expect(await b.getTaskForRead(task.taskId)).toEqual(result.task);
      expect(await b.getAttemptsForRead(task.taskId)).toEqual([result.attempt]);
      expect(result.attempt).toMatchObject({
        dialOperationKey: "synthetic-dial-operation",
        dialStatus: "bridged",
        notes: "Synthetic provider observation",
        hangupConfirmed: false,
        endedAt: null,
      });
    });

    it("only one same-version claim wins and an active other-operator lease remains visible", async () => {
      const { a, b, task } = await setup();
      const results = await Promise.allSettled([
        a.claimCallbackForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-A",
          expectedVersion: 1,
        }),
        b.claimCallbackForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-B",
          expectedVersion: 1,
        }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const current = (await b.getTaskForRead(task.taskId))!;
      const other =
        current.assignedOperatorId === "synthetic-A"
          ? "synthetic-B"
          : "synthetic-A";
      await expect(
        a.claimCallbackForWrite({
          taskId: task.taskId,
          operatorId: other,
          expectedVersion: current.version,
        }),
      ).rejects.toMatchObject({ code: "CALLBACK_TASK_ALREADY_CLAIMED" });
      expect(await b.getTaskForRead(task.taskId)).toEqual(current);
    });

    it("an expired existing claim can be recovered by a cold peer", async () => {
      const { a, b, task } = await setup();
      await a.claimCallbackForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-A",
        expectedVersion: 1,
      });
      await h.pool!.query(
        "UPDATE voice.callback_task SET owner_claim_lease = $2 WHERE task_id = $1",
        [task.taskId, "synthetic-A:2026-01-01T00:00:00.000Z"],
      );
      const recovered = await b.claimCallbackForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-B",
        expectedVersion: 2,
      });
      expect(recovered).toMatchObject({
        assignedOperatorId: "synthetic-B",
        version: 3,
      });
    });

    it("parallel attempts with the same version cannot create duplicate or uncommitted history", async () => {
      const { a, b, task } = await setup();
      const results = await Promise.allSettled([
        a.recordAttemptForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-A",
          expectedVersion: 1,
          outcome: "busy",
          notes: "Synthetic A",
        }),
        b.recordAttemptForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-B",
          expectedVersion: 1,
          outcome: "no_answer",
          notes: "Synthetic B",
        }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(await a.getTaskForRead(task.taskId)).toMatchObject({
        attemptCount: 1,
        version: 2,
      });
      expect(await b.getAttemptsForRead(task.taskId)).toHaveLength(1);
    });

    it("a rejected attempt rolls back both its row and the task version", async () => {
      const { a, b, task } = await setup();
      await h.pool!.query(
        "CREATE FUNCTION voice.callback_attempt_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic callback attempt failure'; END $$",
      );
      await h.pool!.query(
        "CREATE TRIGGER callback_attempt_test_reject BEFORE INSERT ON voice.callback_attempt FOR EACH ROW EXECUTE FUNCTION voice.callback_attempt_test_reject()",
      );
      try {
        await expect(
          a.recordAttemptForWrite({
            taskId: task.taskId,
            operatorId: "synthetic-A",
            expectedVersion: 1,
            outcome: "busy",
          }),
        ).rejects.toThrow();
        expect(await b.getTaskForRead(task.taskId)).toMatchObject({
          status: "pending",
          attemptCount: 0,
          version: 1,
        });
        expect(await b.getAttemptsForRead(task.taskId)).toEqual([]);
      } finally {
        await h.pool!.query(
          "DROP TRIGGER callback_attempt_test_reject ON voice.callback_attempt",
        );
        await h.pool!.query(
          "DROP FUNCTION voice.callback_attempt_test_reject()",
        );
      }
    });

    it("three failed real task attempts reach unreachable without resetting count on a peer", async () => {
      const { a, b, task } = await setup();
      for (const version of [1, 2, 3]) {
        const result = await (version % 2 ? a : b).recordAttemptForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-A",
          expectedVersion: version,
          outcome: "no_answer",
          hangupConfirmed: true,
        });
        expect(result.task).toMatchObject({
          attemptCount: version,
          version: version + 1,
          status: version === 3 ? "unreachable" : "pending",
        });
      }
      const terminal = (await a.getTaskForRead(task.taskId))!;
      expect(terminal.closedAt).not.toBeNull();
      await expect(
        b.claimCallbackForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-B",
          expectedVersion: 4,
        }),
      ).rejects.toMatchObject({ code: "CALLBACK_TASK_TERMINAL" });
      await expect(
        b.recordAttemptForWrite({
          taskId: task.taskId,
          operatorId: "synthetic-B",
          expectedVersion: 4,
          outcome: "answered",
        }),
      ).rejects.toMatchObject({ code: "CALLBACK_TASK_TERMINAL" });
      expect(await a.getAttemptsForRead(task.taskId)).toHaveLength(3);
    });

    it("cancel preserves its reason and unfinished dial evidence without claiming physical hangup", async () => {
      const { a, b, task } = await setup();
      await a.recordAttemptForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-A",
        expectedVersion: 1,
        outcome: "answered",
        notes: "Synthetic unfinished dial",
      });
      const result = await b.cancelCallbackDurable({
        taskId: task.taskId,
        expectedVersion: 2,
        reason: "Synthetic customer cancellation",
      });
      expect(result).toMatchObject({
        actualPhoneHungUp: false,
        dialReconcileRequired: true,
        task: {
          status: "cancelled",
          cancellationReason: "Synthetic customer cancellation",
          attemptCount: 1,
          assignedOperatorId: null,
        },
      });
      expect(await a.getTaskForRead(task.taskId)).toMatchObject(result.task);
      const replay = await a.cancelCallbackDurable({
        taskId: task.taskId,
        expectedVersion: 2,
        reason: "Synthetic retry",
      });
      expect(replay.task.cancellationReason).toBe(
        "Synthetic customer cancellation",
      );
    });

    it("the existing runner claims the persisted task on a cold instance after the call closes", async () => {
      const { fixture, a, b, task } = await setup();
      const sessions = new VoiceSessionRepository(h.peerDatabase());
      const currentSession = await sessions.findSessionById(
        fixture.request.voiceSessionId,
      );
      expect(currentSession).not.toBeNull();
      const closed = await new VoiceSessionService(sessions).closeSession(
        fixture.request.voiceSessionId,
        currentSession!.sessionVersion,
      );
      expect(closed).toMatchObject({
        mediaState: "ended",
        dialogState: "closed",
        recordingState: "finalizing",
      });
      const repository = new VoiceBookingRepository(h.peerDatabase());
      const commands = new VoiceBookingCommandService(
        repository,
        fixture.makeEvidence(repository) as never,
        fixture.products as never,
        fixture.areas as never,
        fixture.access,
      );
      const runner = new VoiceCommandRunnerService(
        commands,
        new OwnedMobilityRepository(h.peerDatabase()),
        undefined,
        b,
      );
      await h.pool!.query(
        "INSERT INTO voice.work_item (voice_session_id,work_type,dedupe_key,payload_ref,run_after) VALUES ($1,'execute_callback',$2,$3,now())",
        [
          fixture.request.voiceSessionId,
          `execute_callback:${task.taskId}`,
          JSON.stringify({ taskId: task.taskId }),
        ],
      );
      const result = await runner.runOnce({
        supportedTypes: ["execute_callback"],
      });
      expect(result).toMatchObject({
        workType: "execute_callback",
        success: true,
      });
      expect(
        (
          await h.pool!.query(
            "SELECT status FROM voice.work_item WHERE work_id = $1",
            [result!.workId],
          )
        ).rows[0],
      ).toMatchObject({ status: "completed" });
      expect(await a.getTaskForRead(task.taskId)).toMatchObject({
        taskId: task.taskId,
        status: "claimed",
        assignedOperatorId: "voice-runner-system",
      });
    });
  },
);
