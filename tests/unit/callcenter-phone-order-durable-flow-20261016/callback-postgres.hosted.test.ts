import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import { phoneCommand, productionServices } from "./production-services";

// The inherited harness opens PostgreSQL only on GitHub Actions, with the full
// migration ledger. Local pending cases never count as real database evidence.
describe.skipIf(!hostedPaymentEnabled)(
  "callbacks on formal migrated PG",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    async function setup() {
      const writer = productionServices(h.database);
      const peer = productionServices(h.peerDatabase());
      const callId = "synthetic-durable-callback";
      const order = await writer.owned.createCallCenterOrder(
        phoneCommand(callId),
      );
      const created = await peer.controller.createCallbackTask(callId, {
        dueAt: "2026-10-19T00:00:00Z",
        note: "Synthetic callback",
      });
      return { writer, peer, callId, order, task: created.data };
    }

    it("cold peers create, list, claim, record two attempts and complete the original order callback", async () => {
      const { writer, peer, callId, order, task } = await setup();
      expect((await writer.controller.listCallbackTasks()).data.items).toEqual([
        task,
      ]);
      const claimed = await writer.controller.claimCallbackTask(
        task.callbackTaskId,
        { operatorId: "synthetic-A", expectedVersion: task.version! },
      );
      expect(claimed.data).toMatchObject({
        status: "claimed",
        assignedOperatorId: "synthetic-A",
        linkedOrderId: order.orderId,
      });
      await peer.controller.recordCallbackAttempt(task.callbackTaskId, {
        operatorId: "synthetic-A",
        outcome: "busy",
        hangupConfirmed: false,
      });
      const attempted = await writer.controller.recordCallbackAttempt(
        task.callbackTaskId,
        {
          operatorId: "synthetic-A",
          outcome: "answered",
          notes: "Synthetic provider result",
          hangupConfirmed: true,
        },
      );
      expect(attempted.data).toMatchObject({
        status: "in_progress",
        attemptCount: 2,
        lastOutcome: "answered",
        linkedOrderId: order.orderId,
      });
      expect(attempted.data.attempts).toEqual([
        expect.objectContaining({ outcome: "busy", hangupConfirmed: false }),
        expect.objectContaining({ outcome: "answered", hangupConfirmed: true }),
      ]);
      expect(
        new Set(attempted.data.attempts!.map((attempt) => attempt.attemptId))
          .size,
      ).toBe(2);
      const completed = await peer.controller.completeCallbackTask(
        task.callbackTaskId,
        {},
      );
      expect(completed.data.status).toBe("completed");
      expect((await writer.controller.listCallbackTasks()).data.items).toEqual([
        completed.data,
      ]);
      expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
        linkedOrderId: order.orderId,
        callbackTask: completed.data,
      });
      expect(await writer.owned.getOrderForRead(order.orderId)).toMatchObject({
        orderId: order.orderId,
        callId,
      });
    });

    it("concurrent attempts keep both records without overwriting each other", async () => {
      const { writer, peer, task } = await setup();
      await Promise.all([
        writer.controller.recordCallbackAttempt(task.callbackTaskId, {
          operatorId: "synthetic-A",
          outcome: "busy",
        }),
        peer.controller.recordCallbackAttempt(task.callbackTaskId, {
          operatorId: "synthetic-B",
          outcome: "no_answer",
        }),
      ]);
      const tasks = (await writer.controller.listCallbackTasks()).data.items;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ attemptCount: 2, version: 3 });
      expect(
        tasks[0]!.attempts!.map((attempt) => attempt.operatorId).sort(),
      ).toEqual(["synthetic-A", "synthetic-B"]);
    });

    it("only one concurrent claim with the same expected version succeeds", async () => {
      const { writer, peer, task } = await setup();
      const results = await Promise.allSettled([
        writer.controller.claimCallbackTask(task.callbackTaskId, {
          operatorId: "synthetic-A",
          expectedVersion: 1,
        }),
        peer.controller.claimCallbackTask(task.callbackTaskId, {
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
      expect(
        (await writer.controller.listCallbackTasks()).data.items[0],
      ).toMatchObject({ status: "claimed", version: 2 });
    });

    it.each(["complete", "cancel"] as const)(
      "%s remains terminal after a later callback is created for the same original order",
      async (action) => {
        const { writer, peer, callId, order, task } = await setup();
        const terminal =
          action === "complete"
            ? await writer.controller.completeCallbackTask(
                task.callbackTaskId,
                {},
              )
            : await writer.controller.cancelCallbackTask(task.callbackTaskId, {
                reason: "Synthetic resolved call",
              });
        const replacement = await peer.controller.createCallbackTask(callId, {
          dueAt: "2026-10-20T00:00:00Z",
        });
        expect(replacement.data.callbackTaskId).not.toBe(task.callbackTaskId);
        expect(replacement.data.linkedOrderId).toBe(order.orderId);
        const replay =
          action === "complete"
            ? await peer.controller.completeCallbackTask(
                task.callbackTaskId,
                {},
              )
            : await peer.controller.cancelCallbackTask(task.callbackTaskId, {
                reason: "Replay",
              });
        expect(replay.data).toEqual(terminal.data);
        await expect(
          writer.controller.claimCallbackTask(task.callbackTaskId, {
            operatorId: "synthetic-A",
          }),
        ).rejects.toMatchObject({ code: "CALLBACK_TERMINAL" });
        await expect(
          peer.controller.recordCallbackAttempt(task.callbackTaskId, {
            operatorId: "synthetic-A",
            outcome: "answered",
          }),
        ).rejects.toMatchObject({ code: "CALLBACK_TERMINAL" });
        const items = (await writer.controller.listCallbackTasks()).data.items;
        expect(items).toEqual([terminal.data, replacement.data]);
        expect(
          (await writer.calls.getCallSessionForRead(callId)).callbackTask,
        ).toEqual(replacement.data);
      },
    );

    it("a database rejection cannot return success or lose the original task and order link", async () => {
      const { writer, peer, callId, order, task } = await setup();
      await h.pool!.query(
        "CREATE FUNCTION crm.callback_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic callback write rejection'; END $$",
      );
      await h.pool!.query(
        "CREATE TRIGGER callback_test_reject BEFORE INSERT OR UPDATE ON crm.phase1_call_sessions FOR EACH ROW EXECUTE FUNCTION crm.callback_test_reject()",
      );
      try {
        await expect(
          peer.controller.recordCallbackAttempt(task.callbackTaskId, {
            operatorId: "synthetic-A",
            outcome: "busy",
          }),
        ).rejects.toThrow();
        expect(
          (await writer.controller.listCallbackTasks()).data.items,
        ).toEqual([task]);
        expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
          linkedOrderId: order.orderId,
          callbackTask: task,
        });
      } finally {
        await h.pool!.query(
          "DROP TRIGGER callback_test_reject ON crm.phase1_call_sessions",
        );
        await h.pool!.query("DROP FUNCTION crm.callback_test_reject()");
      }
      const retried = await peer.controller.recordCallbackAttempt(
        task.callbackTaskId,
        { operatorId: "synthetic-A", outcome: "busy" },
      );
      expect(retried.data).toMatchObject({
        attemptCount: 1,
        linkedOrderId: order.orderId,
      });
    });
  },
);
