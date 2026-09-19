import { EventEmitter } from "node:events";
import { lookup } from "node:dns";
import { request, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { partnerNotificationHttpsFetch } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-https";
import {
  WebhookDispatchService,
  type WebhookDispatchAttemptCommand,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import { harness as transportHarness } from "./transport-harness";
vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:dns", () => ({ lookup: vi.fn() }));

function harness(status = 202) {
  const response = new EventEmitter() as IncomingMessage;
  response.statusCode = status;
  response.destroy = vi.fn(() => response);
  const req = new EventEmitter() as ReturnType<typeof request>;
  let options: RequestOptions;
  req.end = vi.fn(() => req) as typeof req.end;
  vi.mocked(request).mockImplementation(((
    url: URL,
    supplied: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    options = supplied;
    req.end = vi.fn(() => {
      callback(response);
      return req;
    }) as typeof req.end;
    return req;
  }) as typeof request);
  return { response, req, options: () => options };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
describe("bounded HTTPS client without a network server", () => {
  it("stops reading after 4 KiB and returns an invalid oversized ack", async () => {
    const h = harness();
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
      { body: "signed bytes" },
    );
    h.response.emit("data", Buffer.alloc(4096));
    h.response.emit("data", Buffer.from("x"));
    expect(h.response.destroy).toHaveBeenCalledOnce();
    expect((await (await result).text!()).length).toBe(4097);
    expect(h.req.end).toHaveBeenCalledWith("signed bytes");
  });
  it("never follows a redirect", async () => {
    const h = harness(302);
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
    );
    h.response.emit("end");
    expect(await result).toMatchObject({ ok: false, status: 302 });
    expect(request).toHaveBeenCalledOnce();
  });
  it("validates all DNS answers at the socket lookup and rejects mixed public/private results", async () => {
    const h = harness();
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
    );
    const dns = h.options().lookup!;
    const callback = vi.fn();
    vi.mocked(lookup).mockImplementation(((
      _host: string,
      _options: unknown,
      done: (
        error: Error | null,
        addresses: { address: string; family: number }[],
      ) => void,
    ) =>
      done(null, [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ])) as typeof lookup);
    dns("partner.example.test", { all: true }, callback);
    expect(callback.mock.calls[0]![0]).toBeInstanceOf(Error);
    h.response.emit("end");
    await result;
  });
});

const command: WebhookDispatchAttemptCommand = {
  url: "https://partner.example.test/notify",
  deliveryId: "delivery-1",
  eventType: "passenger.receipt_ready.v1",
  tenantId: "tenant-1",
  secretValue: "test-secret",
  secretVersion: 1,
  payload: { deliveryId: "delivery-1" },
  attempt: 1,
  retryPolicy: {
    maxAttempts: 5,
    initialBackoffSeconds: 30,
    backoffMultiplier: 2,
    maxBackoffSeconds: 300,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  partnerAckV1: {
    mode: "partner_ack_v1",
    expected: {
      notificationId: "notification-1",
      deliveryId: "delivery-1",
      partnerEntrySlug: "entry-1",
    },
  },
};

describe("production HTTPS status preservation through dispatch and the facade", () => {
  it.each([401, 403, 404, 410])(
    "retains HTTP %i after a body connection reset",
    async (status) => {
      const socket = harness(status);
      const pending = new WebhookDispatchService().dispatchAttempt(command);
      socket.response.emit("error", new Error("ECONNRESET"));
      socket.req.emit("error", new Error("socket closed after headers"));
      expect(await pending).toMatchObject({
        httpStatus: status,
        status: "delivery_failed",
        nextAttemptAt: null,
      });
      expect(socket.response.destroy).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each([401, 403, 404, 410])(
    "classifies HTTP %i as configuration blocked without waiting for body end",
    async (status) => {
      vi.useFakeTimers();
      const socket = harness(status);
      const h = transportHarness(true);
      const pending = h.service.deliverPassengerNotification(h.row);
      await vi.advanceTimersByTimeAsync(0);
      // There is deliberately no 'end'. A stalled body cannot obscure headers.
      expect(h.row.status).toBe("failed");
      socket.response.emit("error", new Error("ECONNRESET"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toMatchObject({
        failureReason:
          status < 404 ? "credential_rejected" : "endpoint_unavailable",
        retryDisposition: "configuration_blocked",
        deliveredAt: null,
      });
      expect(h.getContext()?.retryDisposition).toBe("configuration_blocked");
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each([200, 201, 202])(
    "keeps HTTP %i but retries an interrupted eligible ack body",
    async (status) => {
      const socket = harness(status);
      const pending = new WebhookDispatchService().dispatchAttempt(command);
      socket.response.emit("data", Buffer.from('{"status":'));
      socket.response.emit("error", new Error("ECONNRESET"));
      expect(await pending).toMatchObject({
        httpStatus: status,
        status: "queued",
        partnerAckV1: { kind: "invalid", reason: "read_aborted" },
      });
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it("includes the eligible ack body in the platform deadline and retains its status", async () => {
    vi.useFakeTimers();
    harness(202);
    const pending = new WebhookDispatchService().dispatchAttempt(command);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ httpStatus: 202, status: "queued" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("accepts a complete matching ack through the production HTTPS client", async () => {
    const socket = harness(202);
    const pending = new WebhookDispatchService().dispatchAttempt(command);
    socket.response.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          notification_id: "notification-1",
          delivery_id: "delivery-1",
          partner_entry_slug: "entry-1",
          status: "duplicate",
          receipt_id: "real-receipt",
        }),
      ),
    );
    socket.response.emit("end");
    expect(await pending).toMatchObject({
      httpStatus: 202,
      status: "delivered",
      partnerAckV1: {
        kind: "accepted",
        ack: { receiptId: "real-receipt", status: "duplicate" },
      },
    });
  });
});
