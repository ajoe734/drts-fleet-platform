import { generateKeyPairSync, createSign } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { TeslaRegulatoryEventsRepository } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.repository";
import { TeslaRegulatoryEventsService } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.service";

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signDetachedJws(
  payload: string,
  privateKeyPem: string,
  kid = "tesla-test-kid",
  issuedAt = Math.floor(Date.now() / 1000),
) {
  const protectedHeader = toBase64Url(
    JSON.stringify({
      alg: "ES256",
      kid,
      iat: issuedAt,
    }),
  );
  const signer = createSign("SHA256");
  signer.update(`${protectedHeader}.${toBase64Url(payload)}`);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${protectedHeader}..${toBase64Url(signature)}`;
}

describe("TeslaRegulatoryEventsService", () => {
  const originalEnv = { ...process.env };
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TESLA_REGULATORY_PROVIDER_IDENTITIES: "tesla-regulatory-sandbox",
      TESLA_REGULATORY_JWS_PUBLIC_KEYS_JSON: JSON.stringify({
        "tesla-test-kid": publicKey.export({ format: "pem", type: "spki" }),
      }),
      TESLA_REGULATORY_MAX_PAYLOAD_BYTES: "65536",
      TESLA_REGULATORY_REPLAY_WINDOW_SECONDS: "300",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function buildService() {
    const repository = new TeslaRegulatoryEventsRepository();
    const audit = new AuditNotificationService();
    const service = new TeslaRegulatoryEventsService(repository, audit);

    return { repository, audit, service };
  }

  function buildHeaders(payload: string, overrides?: Record<string, string>) {
    return {
      "x-forwarded-client-cert": "CN=tesla-regulatory-sandbox",
      "x-jws-signature": signDetachedJws(
        payload,
        privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      ),
      ...overrides,
    };
  }

  it("accepts a valid signed Tesla regulatory event and populates raw + canonical stores", async () => {
    const { service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-accepted-001",
      vehicleId: "veh-demo-001",
      externalVehicleRef: "tesla-vin-001",
      eventType: "fsd_disengagement",
      occurredAt: "2026-06-26T02:10:00.000Z",
      location: { lat: 24.1477, lng: 120.6736 },
      disengagementCause: "system_initiated",
      providerReasonCode: "vision_fault",
    });

    const receipt = await service.ingest({
      body: JSON.parse(payload) as unknown,
      rawBody: Buffer.from(payload),
      rawHeaders: ["x-forwarded-client-cert", "CN=tesla-regulatory-sandbox"],
      headers: buildHeaders(payload),
      requestId: "req-tesla-accepted",
    });

    expect(receipt.status).toBe("accepted");
    expect(receipt.duplicate).toBe(false);
    expect(receipt.rawEventId).toBeTruthy();
    expect(receipt.canonicalEventId).toBeTruthy();
    expect(service.listRawEvents()).toHaveLength(1);
    expect(service.listCanonicalEvents()).toEqual([
      expect.objectContaining({
        providerEventId: "evt-accepted-001",
        eventType: "fsd_disengagement",
        rawEventId: receipt.rawEventId,
      }),
    ]);
  });

  it("rejects an invalid detached signature and records an audit event", async () => {
    const { audit, service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-invalid-001",
      vehicleId: "veh-demo-001",
      eventType: "collision",
      occurredAt: "2026-06-26T02:11:00.000Z",
    });

    await expect(
      service.ingest({
        body: JSON.parse(payload) as unknown,
        rawBody: Buffer.from(payload),
        headers: buildHeaders(payload, {
          "x-jws-signature": buildHeaders(JSON.stringify({ tampered: true }))[
            "x-jws-signature"
          ],
        }),
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "INVALID_JWS_SIGNATURE",
        },
      },
    });

    const auditLogs = audit.listAuditLogs();
    expect(
      auditLogs.some(
        (log) =>
          log.moduleName === "tesla-regulatory-events" &&
          log.actionName === "ingress.rejected_invalid_jws_signature",
      ),
    ).toBe(true);
  });

  it("replays duplicates idempotently when providerEventId and payload hash match", async () => {
    const { service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-duplicate-001",
      vehicleId: "veh-demo-002",
      eventType: "near_miss",
      occurredAt: "2026-06-26T02:12:00.000Z",
    });
    const headers = buildHeaders(payload);

    const firstReceipt = await service.ingest({
      body: JSON.parse(payload) as unknown,
      rawBody: Buffer.from(payload),
      headers,
    });
    const secondReceipt = await service.ingest({
      body: JSON.parse(payload) as unknown,
      rawBody: Buffer.from(payload),
      headers,
    });

    expect(firstReceipt.status).toBe("accepted");
    expect(secondReceipt.status).toBe("duplicate");
    expect(secondReceipt.duplicate).toBe(true);
    expect(secondReceipt.rawEventId).toBe(firstReceipt.rawEventId);
    expect(secondReceipt.canonicalEventId).toBe(firstReceipt.canonicalEventId);
    expect(service.listRawEvents()).toHaveLength(1);
    expect(service.listCanonicalEvents()).toHaveLength(1);
  });

  it("quarantines unknown schemas while preserving the raw vault entry", async () => {
    const { service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v99",
      providerEventId: "evt-quarantine-001",
      vehicleId: "veh-demo-003",
      eventType: "remote_assist_requested",
      occurredAt: "2026-06-26T02:13:00.000Z",
    });

    const receipt = await service.ingest({
      body: JSON.parse(payload) as unknown,
      rawBody: Buffer.from(payload),
      headers: buildHeaders(payload),
    });

    expect(receipt.status).toBe("quarantined");
    expect(receipt.canonicalEventId).toBeNull();
    expect(service.listRawEvents()).toEqual([
      expect.objectContaining({
        providerEventId: "evt-quarantine-001",
        normalizationStatus: "quarantined",
      }),
    ]);
    expect(service.listCanonicalEvents()).toHaveLength(0);
  });

  it("raises a security incident when the same providerEventId arrives with a different payload hash", async () => {
    const { service } = buildService();
    const originalPayload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-mismatch-001",
      vehicleId: "veh-demo-004",
      eventType: "collision",
      occurredAt: "2026-06-26T02:14:00.000Z",
    });
    const replayPayload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-mismatch-001",
      vehicleId: "veh-demo-004",
      eventType: "near_miss",
      occurredAt: "2026-06-26T02:14:00.000Z",
    });

    await service.ingest({
      body: JSON.parse(originalPayload) as unknown,
      rawBody: Buffer.from(originalPayload),
      headers: buildHeaders(originalPayload),
    });

    await expect(
      service.ingest({
        body: JSON.parse(replayPayload) as unknown,
        rawBody: Buffer.from(replayPayload),
        headers: buildHeaders(replayPayload),
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});
