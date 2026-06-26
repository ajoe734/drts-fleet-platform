import { describe, expect, it, vi } from "vitest";

import { TeslaRegulatoryEventsController } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.controller";

describe("TeslaRegulatoryEventsController", () => {
  it("wraps ingress receipts in the standard API envelope and forwards raw request context", async () => {
    const service = {
      ingest: vi.fn(async () => ({
        receiptId: "receipt-001",
        providerCode: "tesla",
        providerEventId: "evt-001",
        schemaVersion: "tesla.regulatory-event.v1",
        payloadSha256: "abc123",
        rawEventId: "raw-001",
        canonicalEventId: "canonical-001",
        status: "accepted",
        duplicate: false,
        receivedAt: "2026-06-26T02:20:00.000Z",
      })),
    };
    const controller = new TeslaRegulatoryEventsController(service as never);
    const body = {
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-001",
    };
    const rawBody = Buffer.from(JSON.stringify(body));

    const response = await controller.ingest(
      body,
      { "x-jws-signature": "sig" },
      "req-controller-001",
      {
        rawBody,
        rawHeaders: ["x-jws-signature", "sig"],
      },
    );

    expect(service.ingest).toHaveBeenCalledWith({
      body,
      headers: { "x-jws-signature": "sig" },
      rawBody,
      rawHeaders: ["x-jws-signature", "sig"],
      requestId: "req-controller-001",
    });
    expect(response).toEqual({
      data: expect.objectContaining({
        receiptId: "receipt-001",
        status: "accepted",
      }),
      meta: {
        requestId: "req-controller-001",
        timestamp: expect.any(String),
      },
    });
  });
});
