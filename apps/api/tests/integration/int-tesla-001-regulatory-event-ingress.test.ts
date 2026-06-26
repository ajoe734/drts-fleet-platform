import { createSign, generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function buildDetachedSignature(payload: string, privateKeyPem: string) {
  const protectedHeader = toBase64Url(
    JSON.stringify({
      alg: "ES256",
      kid: "tesla-int-kid",
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const signer = createSign("SHA256");
  signer.update(`${protectedHeader}.${toBase64Url(payload)}`);
  signer.end();
  return `${protectedHeader}..${toBase64Url(signer.sign(privateKeyPem))}`;
}

describe("INT-TESLA-001 regulatory ingress", () => {
  const originalEnv = { ...process.env };
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TESLA_REGULATORY_PROVIDER_IDENTITIES: "tesla-regulatory-sandbox",
      TESLA_REGULATORY_JWS_PUBLIC_KEYS_JSON: JSON.stringify({
        "tesla-int-kid": publicKey.export({ format: "pem", type: "spki" }),
      }),
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps valid/duplicate/quarantined paths coherent across the ingress slice", async () => {
    const service = new TeslaRegulatoryEventsService(
      new TeslaRegulatoryEventsRepository(),
      new AuditNotificationService(),
    );
    const signedPayload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v1",
      providerEventId: "evt-int-001",
      vehicleId: "veh-int-001",
      eventType: "safety_intervention",
      occurredAt: "2026-06-26T03:00:00.000Z",
    });
    const quarantinedPayload = JSON.stringify({
      schemaVersion: "tesla.regulatory-event.v404",
      providerEventId: "evt-int-002",
      vehicleId: "veh-int-002",
      eventType: "remote_assist_resolved",
      occurredAt: "2026-06-26T03:01:00.000Z",
    });

    const accepted = await service.ingest({
      body: JSON.parse(signedPayload) as unknown,
      rawBody: Buffer.from(signedPayload),
      headers: {
        "x-forwarded-client-cert": "CN=tesla-regulatory-sandbox",
        "x-jws-signature": buildDetachedSignature(
          signedPayload,
          privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        ),
      },
    });
    const duplicate = await service.ingest({
      body: JSON.parse(signedPayload) as unknown,
      rawBody: Buffer.from(signedPayload),
      headers: {
        "x-forwarded-client-cert": "CN=tesla-regulatory-sandbox",
        "x-jws-signature": buildDetachedSignature(
          signedPayload,
          privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        ),
      },
    });
    const quarantined = await service.ingest({
      body: JSON.parse(quarantinedPayload) as unknown,
      rawBody: Buffer.from(quarantinedPayload),
      headers: {
        "x-forwarded-client-cert": "CN=tesla-regulatory-sandbox",
        "x-jws-signature": buildDetachedSignature(
          quarantinedPayload,
          privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        ),
      },
    });

    expect(accepted.status).toBe("accepted");
    expect(duplicate.status).toBe("duplicate");
    expect(quarantined.status).toBe("quarantined");
    expect(service.listRawEvents()).toHaveLength(2);
    expect(service.listCanonicalEvents()).toHaveLength(1);
  });
});
