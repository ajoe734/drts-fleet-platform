// SR-PUSH-WEBPUSH-20260915 -- WebPushTransport availability, send, and the
// fix to PassengerPushAdapter.isAvailable() so an injected transport's mere
// presence no longer implies deliverability.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";

import {
  PassengerPushAdapter,
  type PassengerDeviceRecord,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import {
  PassengerPushDeviceRevokedError,
  PassengerPushNoSubscriptionError,
  PassengerPushProviderError,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";
import { WebPushTransport } from "../../../../apps/api/src/modules/multi-taxi/web-push.transport";

function vapidEnv() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const privateKeyRaw = ecdh.getPrivateKey();
  const privateKey32 = Buffer.concat([
    Buffer.alloc(Math.max(0, 32 - privateKeyRaw.length)),
    privateKeyRaw,
  ]).subarray(-32);
  return {
    PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY: privateKey32.toString("base64url"),
    PASSENGER_WEBPUSH_VAPID_SUBJECT: "mailto:ops@example.com",
  };
}

function subscriptionDevice(): PassengerDeviceRecord {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    deviceId: "https://push.example.com/s/abc",
    passengerSubjectRef: "passenger-1",
    deviceToken: "",
    status: "active",
    webPushSubscription: {
      endpoint: "https://push.example.com/s/abc",
      keys: {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    },
  };
}

const originalEnv = { ...process.env };

describe("SR-PUSH-WEBPUSH-20260915: WebPushTransport.isAvailable() real readiness", () => {
  beforeEach(() => {
    delete process.env.PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY;
    delete process.env.PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY;
    delete process.env.PASSENGER_WEBPUSH_VAPID_SUBJECT;
    // A stray, unrelated generic push env var must not fool availability —
    // this is the exact risk SR-PUSH-WEBPUSH-20260915 was asked to fix.
    process.env.PASSENGER_PUSH_API_KEY = "unrelated-generic-value";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is unavailable with no VAPID keys configured, even with an unrelated push env var set", () => {
    const transport = new WebPushTransport();
    expect(transport.isAvailable()).toBe(false);
  });

  it("is unavailable when VAPID keys are malformed", () => {
    process.env.PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY = "not-a-real-key";
    process.env.PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY = "also-not-real";
    process.env.PASSENGER_WEBPUSH_VAPID_SUBJECT = "mailto:ops@example.com";
    const transport = new WebPushTransport();
    expect(transport.isAvailable()).toBe(false);
  });

  it("is available once well-formed VAPID keys and a subject are configured", () => {
    Object.assign(process.env, vapidEnv());
    const transport = new WebPushTransport();
    expect(transport.isAvailable()).toBe(true);
  });

  it("PassengerPushAdapter defers to the transport's own isAvailable() instead of assuming presence means ready", () => {
    const transport = new WebPushTransport(); // no VAPID keys configured
    const adapter = new PassengerPushAdapter(null, transport);
    expect(adapter.isAvailable()).toBe(false);

    Object.assign(process.env, vapidEnv());
    expect(adapter.isAvailable()).toBe(true);
  });
});

describe("SR-PUSH-WEBPUSH-20260915: WebPushTransport.send()", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.assign(process.env, vapidEnv());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("throws PassengerPushNoSubscriptionError when no device is resolved", async () => {
    const transport = new WebPushTransport();
    await expect(
      transport.send({
        providerName: "webpush",
        message: {
          outboxId: "outbox-1",
          orderId: "order-1",
          passengerSubjectRef: "passenger-1",
          eventType: "driver_arrived",
          assignmentVersion: 1,
          payload: {},
        },
        device: null,
        context: {},
      }),
    ).rejects.toThrow(PassengerPushNoSubscriptionError);
  });

  it("posts an encrypted aes128gcm body with a VAPID Authorization header and never sends plaintext", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const transport = new WebPushTransport();
    const device = subscriptionDevice();

    const receipt = await transport.send({
      providerName: "webpush",
      message: {
        outboxId: "outbox-1",
        orderId: "order-1",
        passengerSubjectRef: "passenger-1",
        eventType: "driver_arrived",
        assignmentVersion: 1,
        payload: { secretDetail: "must-not-appear-in-plaintext" },
      },
      device,
      context: { requestId: "req-1" },
    });

    expect(receipt.providerName).toBe("webpush");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(device.webPushSubscription!.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(headers.authorization).toMatch(/^vapid t=/);
    const body = init.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.includes("must-not-appear-in-plaintext")).toBe(false);
  });

  it("maps a 410 Gone response to PassengerPushDeviceRevokedError", async () => {
    global.fetch = vi.fn(
      async () => new Response(null, { status: 410 }),
    ) as unknown as typeof fetch;
    const transport = new WebPushTransport();

    await expect(
      transport.send({
        providerName: "webpush",
        message: {
          outboxId: "outbox-1",
          orderId: "order-1",
          passengerSubjectRef: "passenger-1",
          eventType: "driver_arrived",
          assignmentVersion: 1,
          payload: {},
        },
        device: subscriptionDevice(),
        context: {},
      }),
    ).rejects.toThrow(PassengerPushDeviceRevokedError);
  });

  it("maps a non-2xx, non-gone response to PassengerPushProviderError", async () => {
    global.fetch = vi.fn(
      async () => new Response("upstream failure", { status: 500 }),
    ) as unknown as typeof fetch;
    const transport = new WebPushTransport();

    await expect(
      transport.send({
        providerName: "webpush",
        message: {
          outboxId: "outbox-1",
          orderId: "order-1",
          passengerSubjectRef: "passenger-1",
          eventType: "driver_arrived",
          assignmentVersion: 1,
          payload: {},
        },
        device: subscriptionDevice(),
        context: {},
      }),
    ).rejects.toThrow(PassengerPushProviderError);
  });
});
