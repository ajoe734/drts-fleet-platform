import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingCommandService } from "../../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { seedVoiceDispatchWorkFixture } from "../../support/voice-dispatch-workitem-postgres-fixture";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

// Only hosted full-migration PostgreSQL. Consent/contact/evidence ports are
// explicitly synthetic; callback/receipt/call/order rows are actual SQL state.
describe.skipIf(!hostedPaymentEnabled)(
  "callback create receipts on full PostgreSQL schema",
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
        contactPhoneEncrypted: "synthetic-receipt-contact",
        contactPhoneLookupToken: "synthetic-receipt-lookup",
        consentSnapshotHash: "explicit-synthetic-callback-consent",
        reason: "Synthetic callback requested by the caller",
        dueAt: "2026-10-19T00:00:00Z",
      };
      return { fixture, a, b, input };
    }

    it("a cold instance recovers the original order callback after call closure and an unreceived create response", async () => {
      const { fixture, a, b, input } = await setup();
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
      // The caller does not receive/use this returned acknowledgement. Recovery
      // reads the committed original SQL task and its receipt on a cold service.
      await a.createCallbackDurable(input);
      const stored = (
        await h.pool!.query(
          "SELECT task_id, create_command_id FROM voice.callback_task WHERE voice_session_id = $1",
          [input.voiceSessionId],
        )
      ).rows[0]!;
      const sessions = new VoiceSessionRepository(h.peerDatabase());
      const session = (await sessions.findSessionById(input.voiceSessionId))!;
      expect(
        await new VoiceSessionService(sessions).closeSession(
          input.voiceSessionId,
          session.sessionVersion,
        ),
      ).toMatchObject({ dialogState: "closed", mediaState: "ended" });
      const actionKey = `${input.voiceSessionId}:create_callback`;
      const recovered = await b.getReceiptByActionKeyForRead(actionKey);
      expect(recovered).toMatchObject({
        receipt: {
          commandId: stored.create_command_id,
          actionKey,
          taskId: stored.task_id,
          status: "succeeded",
        },
        task: {
          taskId: stored.task_id,
          callId: fixture.callId,
          brandId: fixture.authority.brandId,
          linkedOrderId: committed.orderId,
          status: "pending",
          consentSnapshotHash: input.consentSnapshotHash,
        },
      });
      const replay = await b.createCallbackDurable(input);
      expect(replay.replayed).toBe(true);
      expect(replay.receipt).toEqual(recovered.receipt);
      expect(replay.task).toEqual(recovered.task);
      expect(
        (
          await h.pool!.query(
            "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
            [input.voiceSessionId],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id = $1",
            [committed.orderId],
          )
        ).rowCount,
      ).toBe(1);
    });

    it.each(["completed", "cancelled", "unreachable"] as const)(
      "a repeated create keeps the original %s task and accepted receipt",
      async (status) => {
        const { a, b, input } = await setup();
        const original = await a.createCallbackDurable(input);
        if (status === "completed")
          await a.completeCallbackDurable({
            taskId: original.task.taskId,
            operatorId: "synthetic-operator",
            expectedVersion: 1,
          });
        else if (status === "cancelled")
          await a.cancelCallbackDurable({
            taskId: original.task.taskId,
            expectedVersion: 1,
            reason: "Synthetic cancellation",
          });
        else
          for (const version of [1, 2, 3])
            await a.recordAttemptForWrite({
              taskId: original.task.taskId,
              operatorId: "synthetic-operator",
              expectedVersion: version,
              outcome: "no_answer",
              hangupConfirmed: true,
            });
        const terminal = await b.getTaskForRead(original.task.taskId);
        expect(terminal?.status).toBe(status);
        const replay = await b.createCallbackDurable(input);
        expect(replay.replayed).toBe(true);
        expect(replay.task).toEqual(terminal);
        expect(replay.receipt).toEqual(original.receipt);
        expect(
          (
            await h.pool!.query(
              "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
              [input.voiceSessionId],
            )
          ).rowCount,
        ).toBe(1);
        expect((await b.getAttemptsForRead(original.task.taskId)).length).toBe(
          status === "unreachable" ? 3 : 0,
        );
      },
    );

    it.each([
      { contactPhoneEncrypted: "synthetic-different-contact" },
      { consentSnapshotHash: "synthetic-different-consent" },
      { dueAt: "2026-10-20T00:00:00Z" },
    ])(
      "the same action cannot silently replace accepted contact, consent or timing: %j",
      async (change) => {
        const { a, b, input } = await setup();
        const original = await a.createCallbackDurable(input);
        await expect(
          b.createCallbackDurable({ ...input, ...change }),
        ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
        expect(
          await b.getReceiptByActionKeyForRead(original.task.actionKey),
        ).toEqual({ receipt: original.receipt, task: original.task });
        expect(
          (
            await h.pool!.query(
              "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
              [input.voiceSessionId],
            )
          ).rowCount,
        ).toBe(1);
      },
    );

    it("parallel identical create requests commit one task and one stable receipt", async () => {
      const { a, b, input } = await setup();
      const results = await Promise.all([
        a.createCallbackDurable(input),
        b.createCallbackDurable(input),
      ]);
      expect(results.filter((row) => row.replayed)).toHaveLength(1);
      expect(results[0]!.task).toEqual(results[1]!.task);
      expect(results[0]!.receipt).toEqual(results[1]!.receipt);
      expect(results[0]!.receipt?.commandId).toBeTruthy();
      expect(
        (
          await h.pool!.query(
            "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
            [input.voiceSessionId],
          )
        ).rowCount,
      ).toBe(1);
    });

    it("an active different action is refused and a new action after completion keeps both histories", async () => {
      const { a, b, input } = await setup();
      const original = await a.createCallbackDurable({
        ...input,
        actionKey: `callback:${randomUUID()}`,
      });
      const next = { ...input, actionKey: `callback:${randomUUID()}` };
      await expect(b.createCallbackDurable(next)).rejects.toMatchObject({
        code: "CALLBACK_TASK_ALREADY_ACTIVE",
      });
      await a.completeCallbackDurable({
        taskId: original.task.taskId,
        operatorId: "synthetic-operator",
        expectedVersion: 1,
      });
      const created = await b.createCallbackDurable(next);
      expect(created.replayed).toBe(false);
      expect(created.task.taskId).not.toBe(original.task.taskId);
      expect(created.receipt?.commandId).not.toBe(original.receipt?.commandId);
      expect(await b.getTaskForRead(original.task.taskId)).toMatchObject({
        status: "completed",
      });
      expect(
        (
          await a.createCallbackDurable({
            ...input,
            actionKey: original.task.actionKey,
          })
        ).task.status,
      ).toBe("completed");
      expect(
        (
          await h.pool!.query(
            "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
            [input.voiceSessionId],
          )
        ).rowCount,
      ).toBe(2);
    });

    it("a database refusal leaves no accepted task or command receipt", async () => {
      const { a, b, input } = await setup();
      await h.pool!.query(
        "CREATE FUNCTION voice.callback_create_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic callback create refusal'; END $$",
      );
      await h.pool!.query(
        "CREATE TRIGGER callback_create_test_refuse BEFORE INSERT ON voice.callback_task FOR EACH ROW EXECUTE FUNCTION voice.callback_create_test_refuse()",
      );
      try {
        await expect(a.createCallbackDurable(input)).rejects.toThrow(
          "synthetic callback create refusal",
        );
        expect(
          await b.getReceiptByActionKeyForRead(
            `${input.voiceSessionId}:create_callback`,
          ),
        ).toEqual({ task: null, receipt: null });
        expect(
          (
            await h.pool!.query(
              "SELECT task_id FROM voice.callback_task WHERE voice_session_id = $1",
              [input.voiceSessionId],
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        await h.pool!.query(
          "DROP TRIGGER callback_create_test_refuse ON voice.callback_task",
        );
        await h.pool!.query(
          "DROP FUNCTION voice.callback_create_test_refuse()",
        );
      }
    });

    it("legacy active tasks remain readable without inventing a past command receipt", async () => {
      const { a, b, input } = await setup();
      const result = await h.pool!.query(
        "INSERT INTO voice.callback_task (voice_session_id,contact_phone_encrypted,contact_phone_lookup_token,consent_snapshot_hash,reason,due_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING task_id",
        [
          input.voiceSessionId,
          input.contactPhoneEncrypted,
          input.contactPhoneLookupToken,
          input.consentSnapshotHash,
          input.reason,
          input.dueAt,
        ],
      );
      const replay = await a.createCallbackDurable(input);
      expect(replay).toMatchObject({
        replayed: true,
        receipt: null,
        task: { taskId: result.rows[0]!.task_id },
      });
      expect(
        await b.getReceiptByActionKeyForRead(
          `${input.voiceSessionId}:create_callback`,
        ),
      ).toEqual({ task: null, receipt: null });
      await expect(
        b.createCallbackDurable({
          ...input,
          contactPhoneEncrypted: "synthetic-changed",
        }),
      ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
      expect(
        (
          await h.pool!.query(
            "SELECT create_command_id,create_action_key,create_payload_hash FROM voice.callback_task WHERE task_id = $1",
            [result.rows[0]!.task_id],
          )
        ).rows[0],
      ).toEqual({
        create_command_id: null,
        create_action_key: null,
        create_payload_hash: null,
      });
    });

    it("equivalent serialized timestamps recover the same accepted action", async () => {
      const { a, b, input } = await setup();
      const first = await a.createCallbackDurable(input);
      const replay = await b.createCallbackDurable({
        ...input,
        dueAt: "2026-10-19T00:00:00.000Z",
        priority: "normal",
      });
      expect(replay.replayed).toBe(true);
      expect(replay.task).toEqual(first.task);
      expect(replay.receipt).toEqual(first.receipt);
    });
  },
);
