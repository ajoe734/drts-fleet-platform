import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import { phoneCommand, productionServices } from "./production-services";

// The inherited harness refuses to open sockets on the worker VM, applies the
// complete production migration ledger on GitHub, and fails on missing PG config.
// These local skips are explicitly pending, never source acceptance credit.
describe.skipIf(!hostedPaymentEnabled)(
  "phone ACK on formal migrated PG",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);
    const response = () => ({ setHeader: vi.fn(), status: vi.fn() });

    it("returns the same order/call/recording on a cold peer immediately after each ACK", async () => {
      const writer = productionServices(h.database);
      const peer = productionServices(h.peerDatabase());
      const session = await writer.controller.openCallSession({
        callType: "booking",
        callerPhone: "+886900000203",
        agentId: "synthetic-agent",
      });
      expect(
        await peer.controller.getCallSession(session.data.callId, null),
      ).toMatchObject({
        data: { callId: session.data.callId, recordingState: "pending" },
      });
      const command = phoneCommand(session.data.callId);
      const created = await writer.orderController.createCallCenterOrder(
        command,
        response() as never,
        "synthetic-create-key",
      );
      const orderId = created.data.orderId;
      expect(await peer.owned.getOrderForRead(orderId)).toMatchObject({
        orderId,
        callId: command.callId,
        orderSource: "phone",
        status: "recording_pending",
      });
      expect(
        await peer.controller.getCallSession(command.callId, null),
      ).toMatchObject({ data: { linkedOrderId: orderId } });
      const callback = {
        recordingId: "synthetic-recording-pg",
        providerRecordingRef: "synthetic-provider-ref",
        recordingUrl: "https://recordings.example.com/synthetic-recording-pg",
      };
      // Peer has never hydrated the order/session caches. Callback target resolution
      // and propagation must use the same real PG linkage as the canonical GET.
      await peer.controller.attachRecordingCallback(command.callId, callback);
      expect(await writer.owned.getOrderForRead(orderId)).toMatchObject({
        callId: command.callId,
        recordingId: callback.recordingId,
        status: "ready_for_dispatch",
        complianceFlags: ["recording_bound"],
      });
      expect(
        await writer.controller.getCallSession(command.callId, null),
      ).toMatchObject({
        data: { linkedOrderId: orderId, ...callback, recordingState: "ready" },
      });
      const other = await peer.controller.openCallSession({
        callType: "booking",
        callerPhone: "+886900000204",
      });
      expect(other.data.callId).not.toBe(command.callId);
      expect(
        await peer.calls.getCallSessionForRead(command.callId),
      ).toMatchObject({
        linkedOrderId: orderId,
        recordingId: callback.recordingId,
      });
      const replay = await writer.orderController.createCallCenterOrder(
        command,
        response() as never,
        "synthetic-create-key",
      );
      expect(replay.data.orderId).toBe(orderId);
      await peer.controller.attachRecordingCallback(command.callId, callback);
      const rows = await h.pool!.query(
        "SELECT order_id FROM ops.phase1_owned_orders WHERE record->>'callId'=$1",
        [command.callId],
      );
      expect(rows.rows).toEqual([{ order_id: orderId }]);
      await writer.calls.markRecordingFailedForWrite(command.callId);
      expect(await peer.owned.getOrderForRead(orderId)).toMatchObject({
        recordingId: null,
        status: "recording_pending",
        complianceFlags: ["recording_missing"],
      });
      expect(
        await peer.calls.getCallSessionForRead(command.callId),
      ).toMatchObject({ recordingState: "missing" });
      await writer.calls.markRecordingPendingForWrite(command.callId);
      expect(await peer.owned.getOrderForRead(orderId)).toMatchObject({
        complianceFlags: ["recording_pending"],
      });
    });

    it("real PG session-link rejection rolls back the order and never stores a successful idempotency response", async () => {
      const writer = productionServices(h.database);
      const session = await writer.controller.openCallSession({
        callType: "booking",
        callerPhone: "+886900000203",
      });
      const command = phoneCommand(session.data.callId);
      await h.pool!.query(
        `CREATE FUNCTION crm.phone_ack_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record->>'linkedOrderId' IS NOT NULL THEN RAISE EXCEPTION 'synthetic phone session rejection'; END IF; RETURN NEW; END $$`,
      );
      await h.pool!.query(
        `CREATE TRIGGER phone_ack_test_reject BEFORE INSERT OR UPDATE ON crm.phase1_call_sessions FOR EACH ROW EXECUTE FUNCTION crm.phone_ack_test_reject()`,
      );
      await expect(
        writer.orderController.createCallCenterOrder(
          command,
          response() as never,
          "synthetic-failed-key",
        ),
      ).rejects.toThrow();
      expect(
        (await h.pool!.query("SELECT order_id FROM ops.phase1_owned_orders"))
          .rows,
      ).toEqual([]);
      expect(
        await writer.calls.getCallSessionForRead(command.callId),
      ).toMatchObject({ linkedOrderId: null });
      expect(writer.owned.listOrders()).toEqual([]);
      expect(
        (
          await writer.idempotency.findByKey(
            `crm:callcenter:session:${command.callId}:order_create`,
            "synthetic-failed-key",
          )
        )?.status,
      ).not.toBe("completed");
      await h.pool!.query(
        "DROP TRIGGER phone_ack_test_reject ON crm.phase1_call_sessions",
      );
      await h.pool!.query("DROP FUNCTION crm.phone_ack_test_reject()");
      const created = await writer.orderController.createCallCenterOrder(
        command,
        response() as never,
        "synthetic-failed-key",
      );
      expect(
        await writer.owned.getOrderForRead(created.data.orderId),
      ).toMatchObject({ callId: command.callId });
    });

    it("real PG recording propagation rejection rolls back both records, then the identical callback succeeds", async () => {
      const writer = productionServices(h.database);
      const peer = productionServices(h.peerDatabase());
      const command = phoneCommand("synthetic-recording-failure-pg");
      const created = await writer.orderController.createCallCenterOrder(
        command,
        response() as never,
        "synthetic-rec-key",
      );
      await h.pool!.query(
        `CREATE FUNCTION ops.phone_ack_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record->>'recordingId' IS NOT NULL THEN RAISE EXCEPTION 'synthetic recording rejection'; END IF; RETURN NEW; END $$`,
      );
      await h.pool!.query(
        `CREATE TRIGGER phone_ack_test_reject BEFORE INSERT OR UPDATE ON ops.phase1_owned_orders FOR EACH ROW EXECUTE FUNCTION ops.phone_ack_test_reject()`,
      );
      const callback = { recordingId: "synthetic-recording-retry-pg" };
      await expect(
        peer.controller.attachRecordingCallback(command.callId, callback),
      ).rejects.toThrow();
      expect(
        await peer.calls.getCallSessionForRead(command.callId),
      ).toMatchObject({ recordingId: null, recordingState: "pending" });
      expect(
        await writer.owned.getOrderForRead(created.data.orderId),
      ).toMatchObject({ recordingId: null, status: "recording_pending" });
      await h.pool!.query(
        "DROP TRIGGER phone_ack_test_reject ON ops.phase1_owned_orders",
      );
      await h.pool!.query("DROP FUNCTION ops.phone_ack_test_reject()");
      await peer.controller.attachRecordingCallback(command.callId, callback);
      expect(
        await writer.owned.getOrderForRead(created.data.orderId),
      ).toMatchObject({
        recordingId: callback.recordingId,
        status: "ready_for_dispatch",
      });
    });
  },
);
