import { createHash, createSign, generateKeyPairSync } from "node:crypto";

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
  dsaEncoding: "ieee-p1363" | "der" = "ieee-p1363",
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
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding });
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

  it("rejects requests that present only x-provider-identity without an mTLS client certificate header", async () => {
    const { audit, service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-mtls-bypass-001",
      vehicleId: "veh-demo-007",
      eventType: "collision",
      occurredAt: "2026-06-26T02:17:00.000Z",
    });

    await expect(
      service.ingest({
        body: JSON.parse(payload) as unknown,
        rawBody: Buffer.from(payload),
        headers: {
          "x-provider-identity": "tesla-regulatory-sandbox",
          "x-jws-signature": signDetachedJws(
            payload,
            privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
          ),
        },
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "MTLS_IDENTITY_REQUIRED",
        },
      },
    });

    expect(audit.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "ingress.rejected_missing_mtls_identity",
          moduleName: "tesla-regulatory-events",
        }),
      ]),
    );
  });

  it("rejects DER-encoded ES256 detached signatures because JOSE requires P-1363", async () => {
    const { service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-der-001",
      vehicleId: "veh-demo-005",
      eventType: "collision",
      occurredAt: "2026-06-26T02:15:00.000Z",
    });

    await expect(
      service.ingest({
        body: JSON.parse(payload) as unknown,
        rawBody: Buffer.from(payload),
        headers: {
          "x-forwarded-client-cert": "CN=tesla-regulatory-sandbox",
          "x-jws-signature": signDetachedJws(
            payload,
            privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
            "tesla-test-kid",
            Math.floor(Date.now() / 1000),
            "der",
          ),
        },
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "INVALID_JWS_SIGNATURE",
        },
      },
    });
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

  it("rejects invalid known-schema payloads after preserving the raw vault entry", async () => {
    const { audit, service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-invalid-canonical-001",
      eventType: "collision",
      occurredAt: "2026-06-26T02:13:00.000Z",
    });
    const headers = buildHeaders(payload);

    await expect(
      service.ingest({
        body: JSON.parse(payload) as unknown,
        rawBody: Buffer.from(payload),
        headers,
        requestId: "req-invalid-canonical-001",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "INVALID_PAYLOAD",
          details: {
            field: "vehicleId",
          },
        },
      },
    });

    expect(service.listRawEvents()).toEqual([
      expect.objectContaining({
        providerEventId: "evt-invalid-canonical-001",
        schemaVersion: "tesla.regulatory-event.v1",
        normalizationStatus: "pending",
        canonicalEventId: null,
      }),
    ]);
    expect(service.listCanonicalEvents()).toHaveLength(0);
    expect(audit.listAuditLogs()).toContainEqual(
      expect.objectContaining({
        actionName: "ingress.rejected_invalid_payload",
        requestId: "req-invalid-canonical-001",
        moduleName: "tesla-regulatory-events",
      }),
    );

    await expect(
      service.ingest({
        body: JSON.parse(payload) as unknown,
        rawBody: Buffer.from(payload),
        headers,
        requestId: "req-invalid-canonical-002",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "INVALID_PAYLOAD",
          details: {
            field: "vehicleId",
          },
        },
      },
    });

    expect(service.listRawEvents()).toHaveLength(1);
    expect(service.listCanonicalEvents()).toHaveLength(0);
  });

  it("treats quarantined replays as idempotent duplicates while preserving the raw vault entry", async () => {
    const { service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v99",
      providerEventId: "evt-quarantine-duplicate-001",
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

    expect(firstReceipt.status).toBe("quarantined");
    expect(firstReceipt.duplicate).toBe(false);
    expect(secondReceipt.status).toBe("quarantined");
    expect(secondReceipt.duplicate).toBe(true);
    expect(secondReceipt.rawEventId).toBe(firstReceipt.rawEventId);
    expect(service.listRawEvents()).toEqual([
      expect.objectContaining({
        providerEventId: "evt-quarantine-duplicate-001",
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

  it("repairs a raw-only known-schema duplicate by attaching a canonical event on replay", async () => {
    const { repository, service } = buildService();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-recover-001",
      vehicleId: "veh-demo-006",
      eventType: "near_miss",
      occurredAt: "2026-06-26T02:16:00.000Z",
    });

    const seeded = await repository.createRawEvent({
      providerCode: "tesla",
      providerIdentity: "tesla-regulatory-sandbox",
      providerEventId: "evt-recover-001",
      schemaVersion: "tesla.regulatory-event.v1",
      payloadSha256: createHash("sha256")
        .update(Buffer.from(payload))
        .digest("hex"),
      payloadBody: payload,
      payloadBytes: Buffer.byteLength(payload),
      rawHeaders: [],
      jwsProtectedHeader: { alg: "ES256", kid: "tesla-test-kid" },
      jwsSignature: "seeded",
      jwsKid: "tesla-test-kid",
      jwsAlg: "ES256",
      jwsIssuedAt: "2026-06-26T02:16:00.000Z",
      mtlsClientCert: "CN=tesla-regulatory-sandbox",
      mtlsFingerprint: null,
      receivedAt: "2026-06-26T02:16:01.000Z",
      occurredAt: "2026-06-26T02:16:00.000Z",
      normalizationStatus: "pending",
      canonicalEventId: null,
    });

    const receipt = await service.ingest({
      body: JSON.parse(payload) as unknown,
      rawBody: Buffer.from(payload),
      headers: buildHeaders(payload),
    });

    expect(receipt.status).toBe("duplicate");
    expect(receipt.duplicate).toBe(true);
    expect(receipt.rawEventId).toBe(seeded.rawEventId);
    expect(receipt.canonicalEventId).toBeTruthy();
    expect(service.listCanonicalEvents()).toHaveLength(1);
    expect(service.listRawEvents()).toEqual([
      expect.objectContaining({
        rawEventId: seeded.rawEventId,
        canonicalEventId: receipt.canonicalEventId,
        normalizationStatus: "accepted",
      }),
    ]);
  });

  it("keeps duplicate raw inserts idempotent in the repository fallback path", async () => {
    const repository = new TeslaRegulatoryEventsRepository();
    const payload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-race-001",
      vehicleId: "veh-demo-008",
      eventType: "near_miss",
      occurredAt: "2026-06-26T02:18:00.000Z",
    });

    const input = {
      providerCode: "tesla",
      providerIdentity: "tesla-regulatory-sandbox",
      providerEventId: "evt-race-001",
      schemaVersion: "tesla.regulatory-event.v1",
      payloadSha256: createHash("sha256")
        .update(Buffer.from(payload))
        .digest("hex"),
      payloadBody: payload,
      payloadBytes: Buffer.byteLength(payload),
      rawHeaders: [],
      jwsProtectedHeader: { alg: "ES256", kid: "tesla-test-kid" },
      jwsSignature: "seeded",
      jwsKid: "tesla-test-kid",
      jwsAlg: "ES256",
      jwsIssuedAt: "2026-06-26T02:18:00.000Z",
      mtlsClientCert: "CN=tesla-regulatory-sandbox",
      mtlsFingerprint: null,
      receivedAt: "2026-06-26T02:18:01.000Z",
      occurredAt: "2026-06-26T02:18:00.000Z",
      normalizationStatus: "pending" as const,
      canonicalEventId: null,
    };

    const first = await repository.createRawEventIfAbsent(input);
    const second = await repository.createRawEventIfAbsent(input);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.rawEvent.rawEventId).toBe(first.rawEvent.rawEventId);
    expect(repository.listRawEvents()).toHaveLength(1);
  });
});
