import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ControlledReceiver,
  type ReceiverScope,
} from "../../../e2e/system-remediation/sr-partner-notify-qa-20260917/controlled-receiver";
import {
  WebhookDispatchService,
  type WebhookDispatchAttemptCommand,
  type WebhookFetch,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const scopes: ReceiverScope[] = [
  {
    tenantId: "tenant-a",
    secret: "disposable-a",
    secretVersion: 1,
    entries: new Map([
      ["entry-a", new Set(["resident"])],
      ["entry-b", new Set(["resident"])],
    ]),
  },
  {
    tenantId: "tenant-b",
    secret: "disposable-b",
    secretVersion: 1,
    entries: new Map([["entry-c", new Set(["resident"])]]),
  },
];

function command(): WebhookDispatchAttemptCommand {
  const event = "passenger.receipt_ready.v1";
  return {
    url: "https://controlled.example.test/notify",
    deliveryId: "delivery-1",
    eventType: event,
    tenantId: "tenant-a",
    secretValue: scopes[0]!.secret,
    secretVersion: 1,
    attempt: 1,
    retryPolicy: {
      maxAttempts: 5,
      initialBackoffSeconds: 1,
      backoffMultiplier: 2,
      maxBackoffSeconds: 60,
      retryableStatusCodes: [503],
    },
    payload: {
      event,
      deliveryId: "delivery-1",
      tenantId: "tenant-a",
      occurredAt: new Date().toISOString(),
      data: {
        schemaVersion: "1.0",
        notificationId: "notification-1",
        partnerEntrySlug: "entry-a",
        recipient: { partnerUserRef: "resident" },
        message: "Ride receipt ready",
      },
    },
    partnerAckV1: {
      mode: "partner_ack_v1",
      expected: {
        notificationId: "notification-1",
        deliveryId: "delivery-1",
        partnerEntrySlug: "entry-a",
      },
    },
  };
}

describe("controlled receiver with production dispatch", () => {
  let directory: string;
  let receiver: ControlledReceiver;
  let captured: RequestInit;
  // Only HTTP IO is replaced; product signing, serialization and ack parsing run.
  const fetch: WebhookFetch = async (_url, init) => {
    captured = init!;
    const response = await receiver.handle(
      Object.fromEntries(new Headers(init!.headers)),
      Buffer.from(String(init!.body)),
    );
    return {
      ok: response.status < 300,
      status: response.status,
      text: async () => response.body,
    };
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "partner-receiver-unit-"));
    receiver = new ControlledReceiver(directory, scopes);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("commits pending delivery before accepted and reopens with the same duplicate receipt", async () => {
    const dispatch = new WebhookDispatchService(fetch);
    const attempt = command();
    const first = await dispatch.dispatchAttempt(attempt);
    expect(first.partnerAckV1).toMatchObject({
      kind: "accepted",
      ack: { status: "accepted" },
    });
    const committed = JSON.parse(
      await readFile(join(directory, "inbox.json"), "utf8"),
    );
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({
      notificationId: "notification-1",
      nativeDelivery: "pending",
    });
    receiver = new ControlledReceiver(directory, scopes);
    const repeated = await dispatch.dispatchAttempt({ ...attempt, attempt: 2 });
    expect(repeated.partnerAckV1).toMatchObject({
      kind: "accepted",
      ack: {
        status: "duplicate",
        receiptId: committed[0].receiptId,
      },
    });
    expect(await receiver.records()).toEqual(committed);
  });

  it("serializes concurrent duplicate requests into one durable pending delivery", async () => {
    const dispatch = new WebhookDispatchService(fetch);
    const attempt = command();
    const replies = await Promise.all([
      dispatch.dispatchAttempt(attempt),
      dispatch.dispatchAttempt(attempt),
    ]);
    expect(
      replies.every((reply) => reply.partnerAckV1?.kind === "accepted"),
    ).toBe(true);
    expect(await receiver.records()).toHaveLength(1);
  });

  it("rejects changed bytes under an existing notification identity with 409", async () => {
    const dispatch = new WebhookDispatchService(fetch);
    const attempt = command();
    await dispatch.dispatchAttempt(attempt);
    attempt.payload.occurredAt = "2026-01-01T00:00:00.000Z";
    const response = await dispatch.dispatchAttempt(attempt);
    expect(response.httpStatus).toBe(409);
    expect(response.status).toBe("delivery_failed");
    expect(await receiver.records()).toHaveLength(1);
  });

  it("rejects altered raw bytes, stale signatures and unrecognized secret versions", async () => {
    await new WebhookDispatchService(fetch).dispatchAttempt(command());
    const headers = Object.fromEntries(new Headers(captured.headers));
    const raw = Buffer.from(String(captured.body));
    expect(
      (await receiver.handle(headers, Buffer.concat([raw, Buffer.from(" ")])))
        .status,
    ).toBe(401);
    for (const signature of [
      headers["x-drts-webhook-signature"]!.replace("v=1;", "v=2;"),
      headers["x-drts-webhook-signature"]!.replace(
        /t=[^;]+;/,
        "t=2020-01-01T00:00:00.000Z;",
      ),
    ])
      expect(
        (
          await receiver.handle(
            { ...headers, "x-drts-webhook-signature": signature },
            raw,
          )
        ).status,
      ).toBe(401);
    expect(await receiver.records()).toHaveLength(1);
  });

  it("keeps tenant, entry and recipient checks independent of valid signing", async () => {
    const dispatch = new WebhookDispatchService(fetch);
    for (const [entry, resident, status] of [
      ["entry-c", "resident", 403],
      ["entry-a", "stranger", 422],
    ] as const) {
      const attempt = command();
      attempt.payload.data = {
        ...(attempt.payload.data as object),
        partnerEntrySlug: entry,
        recipient: { partnerUserRef: resident },
      };
      expect((await dispatch.dispatchAttempt(attempt)).httpStatus).toBe(status);
    }
    const wrongSecret = command();
    wrongSecret.secretValue = scopes[1]!.secret;
    expect((await dispatch.dispatchAttempt(wrongSecret)).httpStatus).toBe(401);
    expect(await receiver.records()).toEqual([]);
  });

  it("returns 503 when durable storage is unavailable without an accepted receipt", async () => {
    const notDirectory = join(directory, "blocked");
    await writeFile(notDirectory, "cannot store an inbox here");
    receiver = new ControlledReceiver(notDirectory, scopes);
    const reply = await new WebhookDispatchService(fetch).dispatchAttempt(
      command(),
    );
    expect(reply.httpStatus).toBe(503);
    expect(reply.partnerAckV1?.kind).not.toBe("accepted");
  });

  it("accepts binding tests without scheduling native delivery and rejects the historical generic ack", async () => {
    const attempt = command();
    attempt.eventType = "passenger.notification.test.v1";
    attempt.payload.event = attempt.eventType;
    const reply = await new WebhookDispatchService(fetch).dispatchAttempt(
      attempt,
    );
    expect(reply.partnerAckV1?.kind).toBe("accepted");
    expect((await receiver.records())[0]!.nativeDelivery).toBe(
      "not_applicable",
    );
    // Exact external body in a24a4ca7 C201: no contract receipt identity.
    const historical = new WebhookDispatchService(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, received: true }),
    }));
    expect((await historical.dispatchAttempt(attempt)).partnerAckV1?.kind).toBe(
      "invalid",
    );
  });
});
