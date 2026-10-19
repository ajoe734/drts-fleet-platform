import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { Duplex, Readable } from "node:stream";
import { Server as NetServer } from "node:net";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { createVoiceSessionBindingResolver } from "../../../apps/voice-media-worker/src/server";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import {
  SandboxSpeechToTextAdapter,
  SandboxTextToSpeechAdapter,
} from "../../../apps/voice-media-worker/src/media-provider";
import {
  RecordingContinuation,
  type RecordingContinuationJournal,
  type RecordingContinuationSource,
} from "../../../apps/voice-media-worker/src/recording/recording-continuation";
import { ObjectStoreRecorderObjectStore } from "../../../apps/voice-media-worker/src/recording/object-store-recorder";
import {
  ImmutableRecordingManifests,
  type RecordingManifestRef,
} from "../../../apps/voice-media-worker/src/recording/immutable-manifest";
import { FirstPartyVoiceMediaRecordingAdapter } from "../../../apps/api/src/modules/voice-booking/voice-media-recording.adapter";
import { FakeCallAuthority } from "../audit-voice-runtime-20261002/fake-call-authority";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

    it("original Voice F4-F8: two real repositories serialize contact initialization/revisions and preserve sealed original/replacement callbacks after restart", async () => {
      const previousKey = process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY,
        previousVersion = process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
      process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION =
        "voice-contact-hosted-fixture";
      process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
        randomBytes(32).toString("base64");
      try {
        const fixture = await seedVoiceDispatchWorkFixture(h.pool!);
        const session = fixture.request.voiceSessionId;
        const repoA = new VoiceSessionRepository(h.database),
          repoB = new VoiceSessionRepository(h.peerDatabase());
        const a = new VoiceContactService(repoA),
          b = new VoiceContactService(repoB);
        const initial = {
          voiceSessionId: session,
          callerPhone: "0911000111",
          bookerName: "A",
          passengerName: "B",
          passengerPhone: "0922000222",
          isSelfBooking: false,
          consentRef: "SIM-explicit-consent-A",
        };
        await Promise.all([
          a.initializeContacts(initial),
          b.initializeContacts(initial),
        ]);
        expect(
          (
            await h.pool!.query(
              "SELECT revision_number FROM voice.contact_role_revision WHERE voice_session_id = $1 ORDER BY revision_number",
              [session],
            )
          ).rows.map((row) => row.revision_number),
        ).toEqual([1, 2, 3, 4, 5]);
        await h.pool!.query(
          `CREATE FUNCTION voice.contact_test_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='SIM-failed-revision' THEN RAISE EXCEPTION 'SIM-contact-transaction-refusal'; END IF; RETURN NEW; END $$`,
        );
        await h.pool!.query(
          `CREATE TRIGGER contact_test_refusal AFTER INSERT ON voice.contact_role_revision FOR EACH ROW EXECUTE FUNCTION voice.contact_test_refusal()`,
        );
        const correction = {
          voiceSessionId: session,
          role: "booker" as const,
          name: "A",
          phone: "0911000111",
          consentRef: "SIM-explicit-consent-A",
          reason: "SIM-failed-revision",
        };
        try {
          await expect(a.updateContactRole(correction)).rejects.toThrow(
            "SIM-contact-transaction-refusal",
          );
          expect(
            (
              await h.pool!.query(
                "SELECT COUNT(*)::integer AS n FROM voice.contact_role_revision WHERE voice_session_id=$1",
                [session],
              )
            ).rows[0].n,
          ).toBe(5);
          expect(a.getEffectiveContacts(session).bookerContact.name).toBe("A");
        } finally {
          await h.pool!.query(
            "DROP TRIGGER contact_test_refusal ON voice.contact_role_revision",
          );
          await h.pool!.query("DROP FUNCTION voice.contact_test_refusal()");
        }
        expect(
          (await a.updateContactRole(correction)).newRevision.revision,
        ).toBe(6);
        await b.getEffectiveContactsDurable(session);
        await Promise.all([
          a.updateContactRole({
            voiceSessionId: session,
            role: "booker",
            name: "A corrected",
            phone: "0933000333",
            consentRef: "SIM-fresh-consent-A",
            reason: "booker corrected",
          }),
          b.updateContactRole({
            voiceSessionId: session,
            role: "passenger",
            name: "B corrected",
            phone: "0944000444",
            reason: "passenger corrected",
          }),
        ]);
        const current = await b.getEffectiveContactsDurable(session);
        expect(current?.bookerContact.phone).toBe("0933000333");
        expect(current?.passengerContact.phone).toBe("0944000444");
        const callbackA = new VoiceCallbackService(repoA, h.database, a),
          callbackB = new VoiceCallbackService(
            repoB,
            h.peerDatabase(),
            new VoiceContactService(repoB),
          );
        const input = {
          voiceSessionId: session,
          actionKey: "hosted-sealed-original",
          contactRevisionNumber: current!.callbackRecipientRevisionNumber!,
          consentRef: current!.callbackRecipientConsentRef!,
        };
        const original = await callbackA.createCallbackDurable(input);
        await a.updateContactRole({
          voiceSessionId: session,
          role: "callbackRecipient",
          name: "C",
          phone: "0955000555",
          consentRef: "SIM-fresh-consent-C",
          reason: "default_role:passenger",
        });
        const cold = await new VoiceContactService(
          repoB,
        ).getEffectiveContactsDurable(session);
        expect(cold?.callbackRecipient).toEqual({
          name: "C",
          phone: "0955000555",
        });
        const replay = await callbackB.createCallbackDurable(input);
        expect(replay.receipt).toEqual(original.receipt);
        expect(replay.replayed).toBe(true);
        expect(replay.task).toMatchObject({
          contactName: "A corrected",
          contactPhone: "0933000333",
          consentRef: "SIM-fresh-consent-A",
          contactRevisionNumber: input.contactRevisionNumber,
        });
        expect(
          (
            await h.pool!.query(
              "SELECT COUNT(*)::integer AS n FROM voice.callback_task_contact_binding WHERE task_id = $1",
              [original.task.taskId],
            )
          ).rows[0].n,
        ).toBe(1);
        await callbackA.cancelCallbackDurable({
          taskId: original.task.taskId,
          operatorId: "SIM-operator",
          expectedVersion: 1,
          reason: "recipient replacement",
        });
        const replacement = await callbackB.createCallbackDurable({
          voiceSessionId: session,
          actionKey: "hosted-sealed-replacement",
          contactRevisionNumber: cold!.callbackRecipientRevisionNumber!,
          consentRef: "SIM-fresh-consent-C",
          replacesTaskId: original.task.taskId,
        });
        expect(replacement.task).toMatchObject({
          contactPhone: "0955000555",
          replacesTaskId: original.task.taskId,
        });
        expect(
          (await callbackA.getTaskForRead(original.task.taskId))?.contactPhone,
        ).toBe("0933000333");
        await expect(
          h.pool!.query(
            "UPDATE voice.contact_role_revision SET name = 'tamper' WHERE voice_session_id = $1",
            [session],
          ),
        ).rejects.toThrow();
        await expect(
          h.pool!.query(
            "DELETE FROM voice.callback_task_contact_binding WHERE task_id = $1",
            [original.task.taskId],
          ),
        ).rejects.toThrow();
      } finally {
        if (previousKey === undefined)
          delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
        else process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY = previousKey;
        if (previousVersion === undefined)
          delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
        else process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = previousVersion;
      }
    });

    it("original C retention: finite session expiry, actual legal-hold-aware dry-run/apply and immutable receipt preservation on PostgreSQL", async () => {
      const priorKey = process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY,
        priorVersion = process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
      process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "SIM-retention-key";
      process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
        randomBytes(32).toString("base64");
      const clock = Date.now;
      try {
        const f = await seedVoiceDispatchWorkFixture(h.pool!);
        const session = f.request.voiceSessionId;
        const old = new Date(clock() - 100 * 86400000).toISOString();
        await h.pool!.query(
          "UPDATE voice.session SET created_at=$2 WHERE voice_session_id=$1",
          [session, old],
        );
        const repo = new VoiceSessionRepository(h.database),
          contacts = new VoiceContactService(repo);
        const historicalClock = vi
          .spyOn(Date, "now")
          .mockReturnValue(Date.parse(old));
        try {
          await contacts.initializeContacts({
            voiceSessionId: session,
            callerPhone: "0911000111",
          });
        } finally {
          historicalClock.mockRestore();
        }
        expect(await contacts.getEffectiveContactsDurable(session)).toBeNull();
        await expect(
          contacts.initializeContacts({
            voiceSessionId: session,
            callerPhone: "0911000111",
          }),
        ).rejects.toMatchObject({ code: "VOICE_CONTACT_RETENTION_EXPIRED" });
        const legacy = await new VoiceCallbackService(
          undefined,
          h.database,
        ).createCallbackDurable({
          voiceSessionId: session,
          contactPhoneEncrypted: "SIM-existing-task-envelope",
          contactPhoneLookupToken: "SIM-existing-task-lookup",
          consentSnapshotHash: "SIM-explicit-consent",
          reason: "SIM historical callback",
        });
        await repo.insertCallbackTaskContactBinding(
          legacy.task.taskId,
          session,
          2,
          "SIM-historical-binding",
        );
        const before = (
          await h.pool!.query(
            "SELECT * FROM voice.callback_task WHERE task_id=$1",
            [legacy.task.taskId],
          )
        ).rows[0];
        const original = await repo.findSessionById(session);
        await new VoiceSessionService(repo).closeSession(
          session,
          original!.sessionVersion,
        );
        await h.pool!.query(
          "INSERT INTO voice.legal_hold(case_number,evidence_family,subject_ref,reason_code,placed_by) VALUES ('SIM-retention-case','voice_booking_evidence',$1,'internal_investigation','SIM-operator')",
          [session],
        );
        expect(
          await contacts.purgeExpiredContactRevisions("SIM-operator", false),
        ).toMatchObject({ deletedRevisions: 0, deletedBindings: 0 });
        await h.pool!.query(
          "UPDATE voice.legal_hold SET status='released' WHERE subject_ref=$1",
          [session],
        );
        expect(
          await contacts.purgeExpiredContactRevisions("SIM-operator", true),
        ).toMatchObject({
          examinedSessions: 1,
          deletedRevisions: 0,
          deletedBindings: 0,
        });
        expect(
          await contacts.purgeExpiredContactRevisions("SIM-operator", false),
        ).toMatchObject({ deletedRevisions: 5, deletedBindings: 1 });
        expect(
          (
            await h.pool!.query(
              "SELECT * FROM voice.callback_task WHERE task_id=$1",
              [legacy.task.taskId],
            )
          ).rows[0],
        ).toEqual(before);
        expect(
          (
            await h.pool!.query(
              "SELECT details FROM voice.retention_execution_log WHERE details->>'kind'='contact_role_revision'",
            )
          ).rows,
        ).toHaveLength(3);
        expect(await contacts.getEffectiveContactsDurable(session)).toBeNull();
        await expect(
          contacts.initializeContacts({
            voiceSessionId: session,
            callerPhone: "0911000111",
          }),
        ).rejects.toMatchObject({ code: "VOICE_CONTACT_RETENTION_EXPIRED" });
      } finally {
        if (priorKey === undefined)
          delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
        else process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY = priorKey;
        if (priorVersion === undefined)
          delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
        else process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = priorVersion;
      }
    });

    it("original F2: actual finalization before control close stays finalized with one original work item", async () => {
      const fixture = await seedVoiceDispatchWorkFixture(h.pool!);
      const repository = new VoiceBookingRepository(h.database),
        session = fixture.request.voiceSessionId;
      const scope = {
        brandId: fixture.authority.brandId,
        callId: fixture.callId,
        recordingId: "SIM-late-close-recording",
        legId: "SIM-late-close-leg",
      };
      const endedAt = new Date(Date.now() - 1000).toISOString();
      await repository.appendRecordingContinuation(session, {
        kind: "closure",
        eventKey: "closure",
        scope,
        payload: {
          endMs: 1000,
          endedAt,
          closedEventId: "SIM-late-close-event",
          checkpointRefs: [],
        },
      });
      const commands = new VoiceBookingCommandService(
        repository,
        fixture.makeEvidence(repository) as never,
        fixture.products as never,
        fixture.areas as never,
        fixture.access,
      );
      const runner = new VoiceCommandRunnerService(
        commands,
        new OwnedMobilityRepository(h.database),
        undefined,
        undefined,
        undefined,
        {
          async finalizeRecording(params) {
            const durableAt = new Date().toISOString();
            return {
              recordingId: params.scope.recordingId,
              scope: { ...params.scope, legId: params.scope.legId! },
              manifestRef: {
                objectKey: "SIM/late-close-manifest",
                objectVersion: "SIM-late-close-version",
                checksum: "a".repeat(64),
                byteLength: 128,
                durableAt,
              },
              coverage: {
                startMs: 0,
                endMs: 1000,
                endedAt,
                closedEventId: "SIM-late-close-event",
                channels: ["inbound", "outbound"],
              },
              verifiedAt: durableAt,
            };
          },
        },
      );
      expect(
        await runner.runOnce({ supportedTypes: ["finalize_recording"] }),
      ).toMatchObject({ success: true });
      const sessions = new VoiceSessionRepository(h.peerDatabase()),
        original = await sessions.findSessionById(session);
      expect(original?.recordingState).toBe("finalized");
      const closed = await new VoiceSessionService(sessions).closeSession(
        session,
        original!.sessionVersion,
      );
      expect(closed).toMatchObject({
        dialogState: "closed",
        recordingState: "finalized",
      });
      expect(
        (
          await h.pool!.query(
            "SELECT status FROM voice.work_item WHERE voice_session_id=$1 AND work_type='finalize_recording'",
            [session],
          )
        ).rows,
      ).toEqual([{ status: "completed" }]);
      expect(
        await runner.runOnce({ supportedTypes: ["finalize_recording"] }),
      ).toBeNull();
    });

    it("original Voice B: actual API binding, consumed admission, sealed-byte journal and cold finalize survive committed ACK loss on formal PostgreSQL", async () => {
      const noListener = vi
        .spyOn(NetServer.prototype, "listen")
        .mockImplementation(() => {
          throw new Error("This test uses actual handlers without listening");
        });
      const fixture = await seedVoiceDispatchWorkFixture(h.pool!);
      const sessionId = fixture.request.voiceSessionId;
      const scope = {
        brandId: fixture.authority.brandId,
        callId: fixture.callId,
        recordingId: `SIM-recording:${sessionId}`,
        legId: `SIM-leg:${sessionId}`,
      };
      const repository = new VoiceBookingRepository(h.database);
      const controller = new VoiceBookingController(
        {} as never,
        {} as never,
        undefined,
        undefined,
        undefined,
        new VoiceSessionService(new VoiceSessionRepository(h.database)),
        repository,
      );
      const client = new VoiceApiClient(
        {
          baseUrl: "https://SIM-api.test",
          fetchImpl: async (raw, init) => {
            const path = String(raw).split("/sessions/")[1]!;
            const response =
              init?.method === "POST"
                ? await controller.recordRecordingEvent(
                    sessionId,
                    JSON.parse(String(init.body)),
                  )
                : path.includes("/recording-events")
                  ? await controller.getRecordingEvents(sessionId)
                  : await controller.getSession(sessionId);
            return Response.json(deepToSnakeCase(response));
          },
        },
        { getToken: async () => "SIM-workload-identity" },
      );
      const lost = new Set<string>();
      const journal: RecordingContinuationJournal = {
        append: async (session, event) => {
          const saved = (await client.appendRecordingEvent(session, event))
            .event;
          if (
            ["admission", "attachment", "finalized"].includes(event.kind) &&
            !lost.has(event.kind)
          ) {
            lost.add(event.kind);
            throw new Error("SIM committed API response lost");
          }
          return saved;
        },
        read: async (session, requested) =>
          (await client.getRecordingEvents(session)).events.filter(
            (e) =>
              !requested ||
              JSON.stringify(e.scope) === JSON.stringify(requested),
          ),
      };
      // Only external object storage/issuer/normalized fork are SIM. Every
      // session, journal, original work item and domain write uses formal SQL.
      const objects = new Map<
        string,
        {
          body: Uint8Array;
          versionId: string;
          storedAt: string;
          metadata: Readonly<Record<string, string>>;
        }
      >();
      let puts = 0;
      const store = new ObjectStoreRecorderObjectStore({
        putObjectVersion: async (key, bytes, metadata) => {
          const versionId = String(++puts),
            storedAt = new Date().toISOString();
          objects.set(`${key}:${versionId}`, {
            body: Uint8Array.from(bytes),
            versionId,
            storedAt,
            metadata,
          });
          return { versionId, storedAt };
        },
        getObjectVersion: async (key, version) => {
          const object = objects.get(`${key}:${version}`);
          if (!object) throw new Error("SIM object absent");
          return object;
        },
      });
      let callbacks:
        | Parameters<RecordingContinuationSource["subscribe"]>[2]
        | undefined;
      let checkpointRefs: RecordingManifestRef[] = [];
      const endedAt = new Date(Date.now() - 1000).toISOString(),
        utcStart = new Date(Date.parse(endedAt) - 1000).toISOString();
      const source: RecordingContinuationSource = {
        subscribe: (_session, _scope, sink) => {
          callbacks = sink;
          return { close() {} };
        },
        ingress: {
          authorize: async () => ({
            source: "recording_fork",
            channels: ["inbound", "outbound"],
          }),
        },
        closure: {
          resolve: async () => ({
            closedEventId: "SIM-authoritative-close",
            endedAt,
            endMs: 1000,
            checkpointRefs,
          }),
        },
      };
      const runtime = () => new RecordingContinuation(store, journal, source);
      const composer = new VoiceSessionComposer(
        {
          createAdapters: () => ({
            asrAdapter: new SandboxSpeechToTextAdapter(),
            ttsAdapter: new SandboxTextToSpeechAdapter(),
          }),
        },
        undefined,
        runtime(),
      );
      const authority = new FakeCallAuthority();
      const admission = authority.issue(sessionId, {
        scope,
        allowedOperations: ["admit"],
      });
      const finalToken = authority.issue(sessionId, {
        scope,
        epoch: admission.claims.epoch,
        allowedOperations: ["finalize"],
      }).token;
      const warm = new MediaWorkerServer({
        internalKey: "SIM-workload-key",
        callAuthorityVerifier: authority,
        sessionBindingResolver: createVoiceSessionBindingResolver(client),
        sessionComposer: composer,
        recordingContinuation: runtime(),
        wsTimeoutMs: 0,
      });
      let cold: MediaWorkerServer | undefined,
        active = warm;
      class MemorySocket extends Duplex {
        _read() {}
        _write(
          _data: Buffer,
          _encoding: BufferEncoding,
          done: (error?: Error | null) => void,
        ) {
          done();
        }
      }
      const socket = new MemorySocket();
      const post = (server: MediaWorkerServer, path: string, body: unknown) =>
        new Promise<{ status: number; body: Record<string, unknown> }>(
          (resolve) => {
            server.httpServer.emit(
              "request",
              Object.assign(
                Readable.from([Buffer.from(JSON.stringify(body))]),
                {
                  method: "POST",
                  url: path,
                  headers: { "x-drts-internal-key": "SIM-workload-key" },
                },
              ),
              {
                statusCode: 200,
                setHeader() {},
                end(raw: string) {
                  resolve({ status: this.statusCode, body: JSON.parse(raw) });
                },
              },
            );
          },
        );
      try {
        const before = await repository.findSessionById(sessionId);
        const admitted = await post(warm, "/sessions", {
          callAuthorityToken: admission.token,
        });
        expect(admitted.status, JSON.stringify(admitted.body)).toBe(201);
        expect(
          (await repository.readRecordingContinuation(sessionId)).map(
            (e) => e.kind,
          ),
        ).toEqual(["admission"]);
        expect(
          (
            await post(warm, "/recording/finalize", {
              sessionId,
              callAuthorityToken: finalToken,
            })
          ).status,
        ).toBe(403);
        const connected = once(warm, "session.connected");
        warm.httpServer.emit(
          "upgrade",
          {
            method: "GET",
            url: `/ws?sessionId=${sessionId}&grant=${(admitted.body.grant as { token: string }).token}`,
            headers: {
              "x-drts-internal-key": "SIM-workload-key",
              "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
            },
          },
          socket,
          Buffer.alloc(0),
        );
        await connected;
        for (const channel of ["inbound", "outbound"] as const)
          await callbacks!.fork({
            credential: "SIM-ingress",
            input: {
              ...scope,
              channel,
              startMs: 0,
              endMs: 1000,
              utcStart,
              utcEnd: endedAt,
              bytes: Uint8Array.from([1, 2, 3]),
            },
          });
        const segments = (
          await repository.readRecordingContinuation(sessionId, scope)
        )
          .filter((e) => e.kind === "segment")
          .map((e) => e.payload);
        const checkpoint = await new ImmutableRecordingManifests(store).seal({
          schemaVersion: 1,
          scope,
          startMs: 0,
          endMs: 1000,
          segments,
        });
        checkpointRefs = [checkpoint];
        await callbacks!.checkpoint(checkpoint);
        await callbacks!.closed("SIM-call-close");
        const adapter = new FirstPartyVoiceMediaRecordingAdapter(
          repository,
          {
            resolve: async () => ({
              sessionId,
              callAuthorityToken: finalToken,
            }),
          },
          {
            baseUrl: "https://SIM-worker.test",
            internalKey: "SIM-workload-key",
            fetchImpl: async (raw, init) => {
              const response = await post(
                active,
                new URL(String(raw)).pathname,
                JSON.parse(String(init?.body)),
              );
              return Response.json(response.body, { status: response.status });
            },
          },
        );
        const first = await adapter.finalizeRecording({
          voiceSessionId: sessionId,
          scope,
        });
        const objectCount = puts;
        warm.closeSession(sessionId);
        socket.destroy();
        await warm.stop();
        cold = new MediaWorkerServer({
          internalKey: "SIM-workload-key",
          callAuthorityVerifier: authority,
          recordingContinuation: runtime(),
        });
        active = cold;
        const commands = new VoiceBookingCommandService(
          repository,
          fixture.makeEvidence(repository) as never,
          fixture.products as never,
          fixture.areas as never,
          fixture.access,
        );
        const runner = new VoiceCommandRunnerService(
          commands,
          new OwnedMobilityRepository(h.database),
          undefined,
          undefined,
          undefined,
          adapter,
        );
        expect(await runner.runOnce()).toMatchObject({
          workType: "finalize_recording",
          success: true,
        });
        expect(puts).toBe(objectCount);
        const events = await new VoiceBookingRepository(
          h.peerDatabase(),
        ).readRecordingContinuation(sessionId);
        expect(events.map((e) => e.kind)).toEqual([
          "admission",
          "attachment",
          "segment",
          "segment",
          "checkpoint",
          "closure",
          "finalized",
        ]);
        expect(events[1]!.payload).toEqual(events[0]!.payload);
        expect(events.find((e) => e.kind === "finalized")?.payload).toEqual(
          first,
        );
        expect([...lost].sort()).toEqual([
          "admission",
          "attachment",
          "finalized",
        ]);
        const work = await h.pool!.query(
          "SELECT work_type,status FROM voice.work_item WHERE voice_session_id=$1",
          [sessionId],
        );
        expect(work.rows).toEqual([
          { work_type: "finalize_recording", status: "completed" },
        ]);
        const after = await repository.findSessionById(sessionId);
        expect(after?.recordingState).toBe("finalized");
        expect(after?.inputEpoch).toBe(before?.inputEpoch);
        expect(after?.lastAppliedControlSequence).toBe(
          before?.lastAppliedControlSequence,
        );
        await expect(
          repository.appendRecordingContinuation(sessionId, {
            ...events[0]!,
            payload: {
              ...(events[0]!.payload as object),
              admissionId: "SIM-other-attempt",
            },
          }),
        ).rejects.toThrow("stale_or_conflicting");
        expect(warm.httpServer.address()).toBeNull();
        expect(cold.httpServer.address()).toBeNull();
      } finally {
        warm.closeSession(sessionId);
        socket.destroy();
        await warm.stop();
        await cold?.stop();
        noListener.mockRestore();
      }
    });

    it("original Voice B V0125: real session-locked event replay/conflict and finalize work survive two instances without consuming control watermarks", async () => {
      const fixture = await seedVoiceDispatchWorkFixture(h.pool!);
      const session = fixture.request.voiceSessionId;
      const a = new VoiceBookingRepository(h.database),
        b = new VoiceBookingRepository(h.peerDatabase());
      const before = await a.findSessionById(session);
      const scope = {
        brandId: fixture.authority.brandId,
        callId: fixture.callId,
        recordingId: "SIM-recording-1",
        legId: "SIM-recording-leg-1",
      };
      const event = {
        kind: "closure" as const,
        eventKey: "closure",
        scope,
        payload: {
          closedEventId: "SIM-authoritative-close",
          endMs: 1000,
          endedAt: new Date().toISOString(),
          checkpointRefs: [],
        },
      };
      const [first, replayed] = await Promise.all([
        a.appendRecordingContinuation(session, event),
        b.appendRecordingContinuation(session, event),
      ]);
      expect(first).toEqual(replayed);
      expect(await b.readRecordingContinuation(session, scope)).toEqual([
        event,
      ]);
      const tasks = await h.pool!.query(
        "SELECT * FROM voice.work_item WHERE voice_session_id = $1 AND work_type = 'finalize_recording'",
        [session],
      );
      expect(tasks.rows).toHaveLength(1);
      await expect(
        b.appendRecordingContinuation(session, {
          ...event,
          payload: { ...event.payload, endMs: 2000 },
        }),
      ).rejects.toThrow("voice_recording_event_payload_conflict");
      expect(await a.readRecordingContinuation(session, scope)).toEqual([
        event,
      ]);
      const after = await b.findSessionById(session);
      expect(after?.lastAppliedControlSequence).toBe(
        before?.lastAppliedControlSequence,
      );
      expect(after?.inputEpoch).toBe(before?.inputEpoch);
      expect(after?.sessionVersion).toBe(before?.sessionVersion);
      const sessionStore = new VoiceSessionRepository(h.database);
      await new VoiceSessionService(sessionStore).closeSession(
        session,
        after!.sessionVersion,
      );
      expect(
        (
          await h.pool!.query(
            "SELECT work_id FROM voice.work_item WHERE voice_session_id=$1 AND work_type='finalize_recording'",
            [session],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        h.pool!.query(
          "DELETE FROM voice.recording_continuation_event WHERE voice_session_id = $1",
          [session],
        ),
      ).rejects.toThrow();
    });
  },
);
