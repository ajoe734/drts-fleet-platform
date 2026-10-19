import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  VoiceCallbackService,
  type VoiceCallbackOperationInput,
} from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceCallbackController } from "../../../apps/api/src/modules/voice-booking/voice-callback.controller";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { seedVoiceDispatchWorkFixture } from "../../support/voice-dispatch-workitem-postgres-fixture";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import { ApiClient } from "../../../packages/api-client/src/index";

// The VM never opens PostgreSQL or an HTTP listener. GitHub executes the actual
// controller/service/SQL, with only contact/consent/actor prerequisite fixtures.
// This does not qualify real consent, a real phone provider or auth acceptance.
describe.skipIf(!hostedPaymentEnabled)(
  "voice callback HTTP workbench on PostgreSQL",
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
        contactPhoneEncrypted: "SIM-contact-ciphertext",
        contactPhoneLookupToken: "SIM-contact-lookup",
        consentSnapshotHash: "SIM-consent-snapshot",
        reason: "SIM customer callback request",
        resourceScopeId: fixture.scopeId,
      };
      const { task } = await a.createCallbackDurable(input);
      const command = (
        action: VoiceCallbackOperationInput["action"],
        patch: Partial<VoiceCallbackOperationInput> = {},
      ): VoiceCallbackOperationInput => ({
        taskId: task.taskId,
        action,
        operatorId: "SIM-operator-A",
        expectedVersion: task.version,
        idempotencyKey: randomUUID(),
        ...patch,
      });
      return { fixture, a, b, input, task, command };
    }

    async function receipts(taskId: string) {
      return (
        await h.pool!.query(
          "SELECT * FROM ops.idempotency_records WHERE scope = ANY($1::varchar[]) ORDER BY created_at,record_id",
          [
            ["claim", "attempt", "complete", "cancel", "transfer"].map(
              (a) => `voice_callback:${taskId}:${a}`,
            ),
          ],
        )
      ).rows;
    }

    it("a cold peer replays a lost claim response without renewing the lease or incrementing the version", async () => {
      const { a, b, task, command } = await setup();
      const request = command("claim");
      const first = await a.executeTaskCommandForWrite(request);
      const recovered = await b.executeTaskCommandForWrite(request);
      expect(recovered).toEqual({ ...first, replayed: true });
      expect(await b.getTaskForRead(task.taskId)).toMatchObject({
        version: 2,
        ownerClaimLease: first.task.ownerClaimLease,
      });
      expect(await receipts(task.taskId)).toHaveLength(1);
    });

    it("parallel operators serialize one claim and one conflict, with exactly one receipt", async () => {
      const { a, b, task, command } = await setup();
      const results = await Promise.allSettled([
        a.executeTaskCommandForWrite(command("claim")),
        b.executeTaskCommandForWrite(
          command("claim", { operatorId: "SIM-operator-B" }),
        ),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((x) => x.status === "rejected");
      expect(rejected).toMatchObject({
        reason: { code: "CALLBACK_TASK_VERSION_MISMATCH" },
      });
      expect(await receipts(task.taskId)).toHaveLength(1);
    });

    it("parallel copies of one contact command create one attempt and one durable receipt", async () => {
      const { a, b, task, command } = await setup();
      const request = command("attempt", {
        outcome: "no_answer",
        notes: "SIM observed no answer",
        hangupConfirmed: true,
      });
      const values = await Promise.all([
        a.executeTaskCommandForWrite(request),
        b.executeTaskCommandForWrite(request),
      ]);
      expect(new Set(values.map((x) => x.receipt.commandId)).size).toBe(1);
      expect(values.filter((x) => x.replayed)).toHaveLength(1);
      expect(await b.getAttemptsForRead(task.taskId)).toHaveLength(1);
      expect(await b.getTaskForRead(task.taskId)).toMatchObject({
        version: 2,
        attemptCount: 1,
        status: "pending",
      });
    });

    it("a lost attempt response is recoverable after task completion, with its original notes and task snapshot", async () => {
      const { a, b, task, command } = await setup();
      const request = command("attempt", {
        outcome: "answered",
        notes: "SIM contact accepted",
        hangupConfirmed: true,
      });
      const first = await a.executeTaskCommandForWrite(request);
      await b.executeTaskCommandForWrite(
        command("complete", {
          expectedVersion: first.task.version,
          notes: "SIM resolved",
        }),
      );
      expect(await b.executeTaskCommandForWrite(request)).toEqual({
        ...first,
        replayed: true,
      });
      expect(await b.getTaskForRead(task.taskId)).toMatchObject({
        status: "completed",
        version: 3,
        attemptCount: 1,
      });
      expect(await b.getTaskCommandHistoryForRead(task.taskId)).toHaveLength(2);
    });

    it("a changed payload under an existing action key cannot add an attempt or overwrite notes", async () => {
      const { a, b, task, command } = await setup();
      const request = command("attempt", {
        outcome: "no_answer",
        notes: "SIM original observation",
      });
      await a.executeTaskCommandForWrite(request);
      await expect(
        b.executeTaskCommandForWrite({
          ...request,
          notes: "different observation",
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      expect(await b.getAttemptsForRead(task.taskId)).toMatchObject([
        { notes: request.notes },
      ]);
      expect(await receipts(task.taskId)).toHaveLength(1);
    });

    it("a receipt persistence failure rolls back both the contact attempt and task version before a successful retry", async () => {
      const { a, b, task, command } = await setup();
      const request = command("attempt", {
        outcome: "busy",
        hangupConfirmed: true,
      });
      // An injected database constraint fails the final real INSERT. No query,
      // result or transaction executor is mocked; all prior writes must roll back.
      await h.pool!.query(
        "ALTER TABLE ops.idempotency_records ADD CONSTRAINT test_callback_receipt_unavailable CHECK (scope !~ '^voice_callback:') NOT VALID",
      );
      await expect(a.executeTaskCommandForWrite(request)).rejects.toBeDefined();
      expect(await b.getAttemptsForRead(task.taskId)).toEqual([]);
      expect(await b.getTaskForRead(task.taskId)).toMatchObject({
        version: 1,
        attemptCount: 0,
        status: "pending",
      });
      expect(await receipts(task.taskId)).toEqual([]);
      await h.pool!.query(
        "ALTER TABLE ops.idempotency_records DROP CONSTRAINT test_callback_receipt_unavailable",
      );
      expect(await b.executeTaskCommandForWrite(request)).toMatchObject({
        task: { version: 2, attemptCount: 1 },
        replayed: false,
      });
    });

    it("a real transfer changes the owner and preserves both operators and the reason on a cold peer", async () => {
      const { a, b, task, command } = await setup();
      const claim = await a.executeTaskCommandForWrite(command("claim"));
      const request = command("transfer", {
        expectedVersion: claim.task.version,
        toOperatorId: "SIM-operator-B",
        reason: "SIM shift handoff",
      });
      const transferred = await a.executeTaskCommandForWrite(request);
      expect(transferred).toMatchObject({
        task: { assignedOperatorId: "SIM-operator-B", version: 3 },
        transfer: {
          fromOperatorId: "SIM-operator-A",
          toOperatorId: "SIM-operator-B",
          reason: "SIM shift handoff",
        },
      });
      expect(await b.executeTaskCommandForWrite(request)).toEqual({
        ...transferred,
        replayed: true,
      });
      expect(await b.getTaskCommandHistoryForRead(task.taskId)).toMatchObject([
        { receipt: { action: "claim" } },
        { transfer: transferred.transfer, receipt: { action: "transfer" } },
      ]);
      await expect(
        b.executeTaskCommandForWrite(command("claim", { expectedVersion: 3 })),
      ).rejects.toMatchObject({ code: "CALLBACK_TASK_ALREADY_CLAIMED" });
    });

    it("completion and cancellation race to one permanent terminal state with one receipt", async () => {
      const { a, b, task, command } = await setup();
      const results = await Promise.allSettled([
        a.executeTaskCommandForWrite(command("complete")),
        b.executeTaskCommandForWrite(
          command("cancel", { reason: "SIM cancelled" }),
        ),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(results.find((x) => x.status === "rejected")).toMatchObject({
        reason: { code: "CALLBACK_TERMINAL_RACE_CONFLICT" },
      });
      const terminal = await b.getTaskForRead(task.taskId);
      expect(["completed", "cancelled"]).toContain(terminal!.status);
      await expect(
        b.executeTaskCommandForWrite(
          command("attempt", {
            expectedVersion: terminal!.version,
            outcome: "answered",
          }),
        ),
      ).rejects.toMatchObject({ code: "CALLBACK_TASK_TERMINAL" });
      expect(await receipts(task.taskId)).toHaveLength(1);
    });

    it("cancelling an in-flight call persists the task cancellation without reporting a phone hangup", async () => {
      const { a, b, task, command } = await setup();
      const attempted = await a.executeTaskCommandForWrite(
        command("attempt", {
          outcome: "answered",
          dialStatus: "bridged",
          hangupConfirmed: false,
        }),
      );
      const request = command("cancel", {
        expectedVersion: attempted.task.version,
        reason: "SIM caller requested cancellation",
      });
      const result = await b.executeTaskCommandForWrite(request);
      expect(result).toMatchObject({
        task: { status: "cancelled", dialReconcileRequired: true },
        actualPhoneHungUp: false,
        dialReconcileRequired: true,
      });
      expect(await a.executeTaskCommandForWrite(request)).toEqual({
        ...result,
        replayed: true,
      });
      expect(await a.getAttemptsForRead(task.taskId)).toMatchObject([
        { endedAt: null, dialStatus: "bridged", hangupConfirmed: false },
      ]);
    });

    it("closed calls and legacy task scopes remain discoverable without leaking another scope into the queue", async () => {
      const { a, b, fixture, task } = await setup();
      const second = await seedVoiceDispatchWorkFixture(h.pool!);
      await a.createCallbackDurable({
        voiceSessionId: second.request.voiceSessionId,
        contactPhoneEncrypted: "SIM-other",
        contactPhoneLookupToken: "SIM-other",
        consentSnapshotHash: "SIM-other",
      });
      await h.pool!.query(
        "UPDATE voice.callback_task SET resource_scope_id=NULL WHERE task_id=$1",
        [task.taskId],
      );
      const sessions = new VoiceSessionRepository(h.peerDatabase());
      const session = (await sessions.findSessionById(
        fixture.request.voiceSessionId,
      ))!;
      await new VoiceSessionService(sessions).closeSession(
        session.voiceSessionId,
        session.sessionVersion,
      );
      expect(await b.listTaskScopesForRead()).toHaveLength(2);
      expect(
        await b.listTasksForRead({ resourceScopeId: fixture.scopeId }),
      ).toMatchObject([
        {
          taskId: task.taskId,
          callId: fixture.callId,
          resourceScopeId: fixture.scopeId,
        },
      ]);
      expect(
        await b.listTasksForRead({
          resourceScopeId: fixture.scopeId,
          status: "completed",
        }),
      ).toEqual([]);
      expect(
        await b.listTasksForRead({
          resourceScopeId: fixture.scopeId,
          voiceSessionId: second.request.voiceSessionId,
        }),
      ).toEqual([]);
    });

    it("the actual HTTP routes and SDK create, claim, record, transfer, complete and read durable history after call closure", async () => {
      const { a, b, fixture, task, input } = await setup();
      // Close the fixture's first task so HTTP creates a distinct new action.
      await a.completeCallbackDurable({
        taskId: task.taskId,
        operatorId: "SIM-operator-A",
        expectedVersion: 1,
      });
      const sessions = new VoiceSessionRepository(h.peerDatabase());
      const session = (await sessions.findSessionById(
        fixture.request.voiceSessionId,
      ))!;
      await new VoiceSessionService(sessions).closeSession(
        session.voiceSessionId,
        session.sessionVersion,
      );
      const require = createRequire(
        new URL("../../../apps/api/package.json", import.meta.url),
      );
      const { NestFactory } = require("@nestjs/core");
      const app = await NestFactory.create(
        {
          module: class HostedCallbackRoutes {},
          controllers: [VoiceCallbackController],
          providers: [
            { provide: VoiceCallbackService, useValue: b },
            { provide: VoiceSessionRepository, useValue: sessions },
          ],
        },
        { logger: false, abortOnError: false },
      );
      try {
        app.setGlobalPrefix("api");
        app.useGlobalInterceptors(new SnakeCaseInterceptor());
        app.useGlobalFilters(new SnakeCaseExceptionFilter());
        await app.listen(0, "127.0.0.1");
        const client = new ApiClient({
          baseUrl: await app.getUrl(),
          defaultHeaders: {
            "x-actor-type": "ops_user",
            "x-actor-id": "SIM-HTTP-operator",
            "x-realm": "ops",
          },
        });
        const contact = {
          contactPhoneEncrypted: input.contactPhoneEncrypted,
          contactPhoneLookupToken: input.contactPhoneLookupToken,
          consentSnapshotHash: input.consentSnapshotHash,
          reason: input.reason,
        };
        const key = randomUUID();
        const created = await client.createVoiceCallback(
          fixture.request.voiceSessionId,
          contact,
          key,
        );
        expect(created.task!.resourceScopeId).toBe(fixture.scopeId);
        expect(
          (
            await client.createVoiceCallback(
              fixture.request.voiceSessionId,
              contact,
              key,
            )
          ).receipt!.commandId,
        ).toBe(created.receipt!.commandId);
        expect(
          (
            await client.getVoiceCallbackCreateReceipt(
              `${fixture.request.voiceSessionId}:create_callback:${key}`,
            )
          ).task!.taskId,
        ).toBe(created.task!.taskId);
        const id = created.task!.taskId;
        const claimKey = randomUUID();
        const claimed = await client.executeVoiceCallbackCommand(
          id,
          "claim",
          { expectedVersion: 1 },
          claimKey,
        );
        expect(
          await client.executeVoiceCallbackCommand(
            id,
            "claim",
            { expectedVersion: 1 },
            claimKey,
          ),
        ).toMatchObject({ replayed: true, receipt: claimed.receipt });
        const attempted = await client.executeVoiceCallbackCommand(
          id,
          "attempt",
          {
            expectedVersion: claimed.task.version,
            outcome: "answered",
            notes: "SIM observed contact",
            hangupConfirmed: true,
          },
          randomUUID(),
        );
        const transfer = await client.executeVoiceCallbackCommand(
          id,
          "transfer",
          {
            expectedVersion: attempted.task.version,
            toOperatorId: "SIM-next-operator",
            reason: "SIM next shift",
          },
          randomUUID(),
        );
        await client.executeVoiceCallbackCommand(
          id,
          "complete",
          {
            expectedVersion: transfer.task.version,
            notes: "SIM resolved callback",
          },
          randomUUID(),
        );
        expect(await client.getVoiceCallbackTask(id)).toMatchObject({
          task: {
            status: "completed",
            callId: fixture.callId,
            attemptCount: 1,
          },
          attempts: [
            { notes: "SIM observed contact", operatorId: "SIM-HTTP-operator" },
          ],
        });
        expect((await client.getVoiceCallbackTask(id)).commands).toHaveLength(
          4,
        );
        expect(
          (
            await client.listVoiceCallbackTasks({
              resourceScopeId: fixture.scopeId,
              status: "completed",
            })
          ).map((t) => t.taskId),
        ).toContain(id);
        expect(await client.listVoiceCallbackScopes()).toMatchObject([
          {
            resourceScopeId: fixture.scopeId,
            brandId: fixture.authority.brandId,
          },
        ]);
      } finally {
        await app.close();
      }
    });
  },
);
