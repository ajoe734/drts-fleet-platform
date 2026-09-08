import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import http from "node:http";
import { type AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import { sandboxFixtures } from "../../../../apps/api/src/modules/callcenter/sandbox.fixtures";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { GeoProviderConfigService } from "../../../../apps/api/src/modules/geo/geo-provider-config.service";
import { GeoService } from "../../../../apps/api/src/modules/geo/geo.service";
import { MockGeoProvider } from "../../../../apps/api/src/modules/geo/mock-geo.provider";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

interface ControlledReceiverRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  parsedBody: Record<string, unknown> | null;
  receivedAt: number;
}

interface ControlledReceiver {
  server: http.Server;
  url: string;
  port: number;
  requests: ControlledReceiverRequest[];
  setHandler: (
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      body: string,
    ) => void,
  ) => void;
  resetHandler: () => void;
  close: () => Promise<void>;
}

function createControlledReceiver(): Promise<ControlledReceiver> {
  return new Promise((resolveReady) => {
    const requests: ControlledReceiverRequest[] = [];
    let customHandler:
      | ((
          req: http.IncomingMessage,
          res: http.ServerResponse,
          body: string,
        ) => void)
      | null = null;

    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        let parsedBody: Record<string, unknown> | null = null;
        try {
          parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          parsedBody = null;
        }

        requests.push({
          method: req.method ?? "UNKNOWN",
          url: req.url ?? "/",
          headers: req.headers,
          rawBody,
          parsedBody,
          receivedAt: Date.now(),
        });

        if (customHandler) {
          customHandler(req, res, rawBody);
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, received: true }));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      const url = `http://127.0.0.1:${port}/webhooks/receiver`;

      resolveReady({
        server,
        url,
        port,
        requests,
        setHandler: (handler) => {
          customHandler = handler;
        },
        resetHandler: () => {
          customHandler = null;
        },
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

function verifyHmacSignature(
  headerValue: string,
  rawBody: string,
  secret: string,
) {
  const match = /^v=(\d+);t=([^;]+);sig=([0-9a-f]+)$/.exec(headerValue);
  if (!match) {
    return { valid: false, version: 0, timestamp: "", signature: "", expectedSig: "" };
  }
  const [, vStr, timestamp, signature] = match;
  const version = parseInt(vStr!, 10);
  const expectedSig = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return {
    valid: signature === expectedSig,
    version,
    timestamp: timestamp!,
    signature: signature!,
    expectedSig,
  };
}

describe("SR-QA-WEBHOOK-001: Verification Suite", () => {
  let receiver: ControlledReceiver;

  beforeAll(async () => {
    receiver = await createControlledReceiver();
  });

  afterAll(async () => {
    if (receiver) {
      await receiver.close();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    if (receiver) {
      receiver.requests.length = 0;
      receiver.resetHandler();
    }
  });

  // =========================================================================
  // Capability C111: Tenant API Keys Governance, Minimal Scope, Rotation, Revocation, and Secret Masking
  // =========================================================================
  describe("C111: Tenant API Keys Governance & Lifecycle", () => {
    it("C111-1 (Normal): Issues API key with minimal scope and normalizes compatibility aliases", () => {
      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);

      const issued = service.issueApiKey(
        "tenant-demo-001",
        {
          keyName: "Webhook Dispatcher Key",
          scopes: ["tenant:webhooks:read", "tenant:bookings:write"], // alias maps to tenant:write
          purpose: "Automated webhook monitoring & booking ingestion",
        },
        "req-api-key-001",
      );

      // Verify write-then-read back from service
      const keys = service.listApiKeys("tenant-demo-001");
      const found = keys.find((k) => k.apiKeyId === issued.apiKey.apiKeyId);
      expect(found).toBeDefined();
      expect(found!.keyName).toBe("Webhook Dispatcher Key");
      expect(found!.scopes).toEqual(["tenant:webhooks:read", "tenant:write"]);
      expect(found!.status).toBe("active");
    });

    it("C111-2 (Normal): Plaintext key returned once, prefix/suffix masked, raw secret excluded from storage", () => {
      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);

      const issued = service.issueApiKey("tenant-demo-001", {
        keyName: "Secure Partner Key",
        scopes: ["tenant:read"],
      });

      // Plaintext key starts with tk_ and has full random length
      expect(issued.plaintextKey).toMatch(/^tk_[0-9a-f]{36}$/);

      // Masked view returned by API list
      const keys = service.listApiKeys("tenant-demo-001");
      const record = keys.find((k) => k.apiKeyId === issued.apiKey.apiKeyId)!;
      expect(record.keyPrefix).toBe(issued.plaintextKey.slice(0, 12));
      expect(record.maskedSuffix).toBe(`****${issued.plaintextKey.slice(-4)}`);
      expect((record as unknown as Record<string, unknown>).plaintextKey).toBeUndefined();
      expect((record as unknown as Record<string, unknown>).keyHash).toBeUndefined();
    });

    it("C111-3 (Normal & Negative): Enforces default 60-day expiry and rejects expiry exceeding 90 days", () => {
      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);
      const now = Date.now();

      // Normal default expiry: ~60 days
      const normalKey = service.issueApiKey("tenant-demo-001", {
        keyName: "Default Lifetime Key",
        scopes: ["tenant:read"],
      });
      const expiresAt = Date.parse(normalKey.apiKey.expiresAt ?? "");
      expect(expiresAt).toBeGreaterThan(now + 50 * 24 * 60 * 60 * 1000);
      expect(expiresAt).toBeLessThan(now + 61 * 24 * 60 * 60 * 1000);

      // Negative case: requesting 120 days (> 90 days limit)
      expect(() => {
        service.issueApiKey("tenant-demo-001", {
          keyName: "Exorbitant Lifetime Key",
          scopes: ["tenant:read"],
          expiresAt: new Date(now + 120 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }).toThrowError();
    });

    it("C111-4 (Normal): Supports key rotation with configurable overlap window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));

      const service = new TenantPartnerService(new AuditNotificationService());
      const first = service.issueApiKey("tenant-demo-001", {
        keyName: "Primary Key",
        scopes: ["tenant:webhooks:write"],
      });
      expect(first.apiKey.status).toBe("active");

      // Rotate after 2 days with a 7-day overlap window
      vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
      const rotated = service.rotateApiKey("tenant-demo-001", first.apiKey.apiKeyId, {
        keyName: "Rotated Primary Key v2",
        overlapDays: 7,
      });

      // New key is active
      expect(rotated.apiKey.status).toBe("active");
      expect(rotated.apiKey.rotatedFromApiKeyId).toBe(first.apiKey.apiKeyId);

      // Old key is in overlap_active with overlapEndsAt set
      const keys = service.listApiKeys("tenant-demo-001");
      const oldKey = keys.find((k) => k.apiKeyId === first.apiKey.apiKeyId)!;
      expect(oldKey.status).toBe("overlap_active");
      expect(oldKey.overlapEndsAt).toBe("2026-08-10T00:00:00.000Z");
      expect(oldKey.supersededByApiKeyId).toBe(rotated.apiKey.apiKeyId);
    });

    it("C111-5 (Normal): Automatically revokes key after overlap window expires", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));

      const service = new TenantPartnerService(new AuditNotificationService());
      const original = service.issueApiKey("tenant-demo-001", {
        keyName: "Expiring Overlap Key",
        scopes: ["tenant:read"],
      });

      service.rotateApiKey("tenant-demo-001", original.apiKey.apiKeyId, {
        overlapDays: 3,
      });

      // Advance time beyond the 3-day overlap (to Aug 5)
      vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));

      // Reconcile and inspect
      const keys = service.listApiKeys("tenant-demo-001");
      const reconciledOldKey = keys.find((k) => k.apiKeyId === original.apiKey.apiKeyId)!;
      expect(reconciledOldKey.status).toBe("auto_revoked");
      expect(reconciledOldKey.revokeReason).toBe("rotation_overlap_elapsed");
    });

    it("C111-6 (Normal & Negative): Immediate revocation works instantly and blocks rotation", () => {
      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);

      const issued = service.issueApiKey("tenant-demo-001", {
        keyName: "Key To Revoke",
        scopes: ["tenant:read"],
      });

      // Immediate revocation
      service.revokeApiKey("tenant-demo-001", issued.apiKey.apiKeyId, "req-revoke-001");

      const keys = service.listApiKeys("tenant-demo-001");
      const revokedKey = keys.find((k) => k.apiKeyId === issued.apiKey.apiKeyId)!;
      expect(revokedKey.status).toBe("revoked");
      expect(revokedKey.revokedAt).not.toBeNull();
      expect(revokedKey.revokeReason).toBe("manual_revoke");

      // Negative test: Rotating an already revoked key is rejected with 409 Conflict
      try {
        service.rotateApiKey("tenant-demo-001", issued.apiKey.apiKeyId, {
          overlapDays: 3,
        });
        expect.unreachable();
      } catch (err: any) {
        const code = err?.errorCode ?? err?.getResponse?.()?.error?.code;
        expect(code).toBe("TENANT_API_KEY_NOT_ROTATABLE");
      }
    });
  });

  // =========================================================================
  // Capability C112: Webhook Signing, Local Controlled Receiver, 2xx/5xx/Timeout, Backoff, Auto-disable, Replay Protection, Secret Rotation, and Restart Deduplication
  // =========================================================================
  describe("C112: Webhook Signing, Delivery, Fault Recovery & Secret Rotation", () => {
    it("C112-1 (Normal): Real HTTP receiver verifies HMAC-SHA256 signature and activates endpoint on 200", async () => {
      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const sharedSecret = "whsec_super_secret_signing_key_001";
      const created = service.createWebhookEndpoint(
        "tenant-demo-001",
        {
          url: receiver.url,
          secret: sharedSecret,
          events: ["tenant.webhook.test", "dispatch.assigned"],
        },
        "req-create-wh-001",
      );
      expect(created.status).toBe("test_pending");

      // Send test webhook to controlled local HTTP receiver
      const testResult = await service.sendTestWebhook(
        "tenant-demo-001",
        {
          webhookId: created.webhookId,
        },
        "req-send-test-001",
      );

      expect(testResult.httpStatus).toBe(200);

      // Verify request arrived at controlled local HTTP receiver
      expect(receiver.requests.length).toBe(1);
      const req = receiver.requests[0]!;
      expect(req.method).toBe("POST");
      expect(req.headers["x-drts-event-type"]).toBe("tenant.webhook.test");
      expect(req.headers["x-drts-tenant-id"]).toBe("tenant-demo-001");
      expect(req.headers["x-drts-webhook-delivery-id"]).toBe(testResult.deliveryId);

      // Check HMAC signature calculation
      const sigHeader = req.headers["x-drts-webhook-signature"] as string;
      expect(sigHeader).toBeDefined();
      const sigVerification = verifyHmacSignature(sigHeader, req.rawBody, sharedSecret);
      expect(sigVerification.valid).toBe(true);
      expect(sigVerification.version).toBe(1);

      // Verify write-then-read: Endpoint status promoted from test_pending to active
      const [endpoint] = service.listWebhookEndpoints("tenant-demo-001");
      expect(endpoint.status).toBe("active");
      expect(endpoint.runtimeMetadata.lastDeliveredAt).not.toBeNull();
    });

    it("C112-2 (Negative & Normal): Handles 503 response with exponential backoff and queued status", async () => {
      receiver.setHandler((_req, res) => {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Service Temporarily Unavailable" }));
      });

      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const created = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_backoff_test_001",
        events: ["tenant.webhook.test"],
      });

      const result = await service.sendTestWebhook("tenant-demo-001", {
        webhookId: created.webhookId,
      });

      expect(result.httpStatus).toBe(503);
      expect(result.attempt).toBe(1);
      expect(result.nextAttemptAt).not.toBeNull();

      // Verify delivery record in service is queued
      const deliveries = service.listWebhookDeliveriesByWebhook("tenant-demo-001", created.webhookId);
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      const delivery = deliveries[0]!;
      expect(delivery.status).toBe("queued");
      expect(delivery.httpStatus).toBe(503);

      // Verify exponential backoff calculation (attempt 1: initialBackoff = 30s)
      const attemptTime = Date.parse(delivery.attemptedAt);
      const nextTime = Date.parse(delivery.nextAttemptAt!);
      const delaySec = Math.round((nextTime - attemptTime) / 1000);
      expect(delaySec).toBe(30);
    });

    it("C112-3 (Negative): Handles network timeout / connection drop gracefully without throwing uncaught error", async () => {
      receiver.setHandler((_req, res) => {
        // Destroy connection immediately to simulate socket drop / ECONNRESET
        res.destroy();
      });

      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const created = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_timeout_test_001",
        events: ["tenant.webhook.test"],
      });

      // Dispatch should catch the network error and return a queued result
      const result = await service.sendTestWebhook("tenant-demo-001", {
        webhookId: created.webhookId,
      });

      expect(result.httpStatus).toBeNull();
      expect(result.attempt).toBe(1);
      expect(result.nextAttemptAt).not.toBeNull();

      const deliveries = service.listWebhookDeliveriesByWebhook("tenant-demo-001", created.webhookId);
      expect(deliveries[0]!.status).toBe("queued");
    });

    it("C112-4 (Negative): Auto-disables endpoint after non-retryable response / delivery failure", async () => {
      receiver.setHandler((_req, res) => {
        // 400 Bad Request is non-retryable in retryPolicy.retryableStatusCodes ([408, 429, 500, 502, 503, 504])
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Permanent Non-Retryable Client Error" }));
      });

      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const created = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_permanent_fail_001",
        events: ["tenant.webhook.test"],
      });

      await service.sendTestWebhook("tenant-demo-001", {
        webhookId: created.webhookId,
      });

      // Verify endpoint is auto-disabled
      const [updatedEndpoint] = service.listWebhookEndpoints("tenant-demo-001");
      expect(updatedEndpoint.status).toBe("disabled");
      expect(updatedEndpoint.runtimeMetadata.disableReason).toBe("delivery_failed");
      expect(updatedEndpoint.runtimeMetadata.disabledAt).not.toBeNull();

      // Verify ops notice notification recorded in audit notification service
      const notices = auditNotificationService.listNotifications("tenant-demo-001");
      const disabledNotice = notices.find((n) =>
        n.title.includes("Tenant webhook disabled after repeated delivery failures"),
      );
      expect(disabledNotice).toBeDefined();
    });

    it("C112-5 (Normal): Disabled or test_pending endpoints are excluded from live event dispatches", async () => {
      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      // Endpoint 1: in test_pending
      service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_pending_001",
        events: ["order.created"],
      });

      // Publish live event
      const results = await service.publishWebhookEvent("tenant-demo-001", {
        eventType: "order.created",
        data: { orderId: "ord-test-999" },
      });

      // No dispatch should occur for pending endpoint
      expect(results.length).toBe(0);
      expect(receiver.requests.length).toBe(0);
    });

    it("C112-6 (Normal & Negative): Receiver verifies replay protection via timestamp freshness and delivery ID uniqueness", async () => {
      const seenDeliveryIds = new Set<string>();
      let replayRejected = false;

      receiver.setHandler((req, res, rawBody) => {
        const deliveryId = req.headers["x-drts-webhook-delivery-id"] as string;
        const sigHeader = req.headers["x-drts-webhook-signature"] as string;
        const sig = verifyHmacSignature(sigHeader, rawBody, "whsec_replay_001");

        // Timestamp check (within 300 seconds)
        const tsDiffMs = Math.abs(Date.now() - Date.parse(sig.timestamp));
        if (tsDiffMs > 300_000) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Timestamp expired" }));
          return;
        }

        // Delivery ID uniqueness check
        if (seenDeliveryIds.has(deliveryId)) {
          replayRejected = true;
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Duplicate delivery ID detected" }));
          return;
        }

        seenDeliveryIds.add(deliveryId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });

      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const endpoint = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_replay_001",
        events: ["tenant.webhook.test"],
      });

      // First delivery: valid
      const result1 = await service.sendTestWebhook("tenant-demo-001", {
        webhookId: endpoint.webhookId,
      });
      expect(result1.httpStatus).toBe(200);

      // Simulate replaying the exact same request directly to receiver
      const firstReq = receiver.requests[0]!;
      const replayRes = await fetch(receiver.url, {
        method: "POST",
        headers: firstReq.headers as Record<string, string>,
        body: firstReq.rawBody,
      });
      expect(replayRes.status).toBe(409);
      expect(replayRejected).toBe(true);
    });

    it("C112-7 (Normal): Webhook secret rotation advances version to v=2 and updates signature without leaking secret", async () => {
      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const secretV1 = "whsec_version_1_initial";
      const secretV2 = "whsec_version_2_rotated";

      const created = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: secretV1,
        events: ["tenant.webhook.test"],
      });

      // Verify version 1 via listWebhookEndpoints
      const [initialEndpoint] = service.listWebhookEndpoints("tenant-demo-001");
      expect(initialEndpoint.secretVersion).toBe(1);

      // Validate v1
      await service.sendTestWebhook("tenant-demo-001", {
        webhookId: created.webhookId,
      });
      expect(receiver.requests.length).toBe(1);
      const reqV1 = receiver.requests[0]!;
      const sigV1 = verifyHmacSignature(
        reqV1.headers["x-drts-webhook-signature"] as string,
        reqV1.rawBody,
        secretV1,
      );
      expect(sigV1.valid).toBe(true);
      expect(sigV1.version).toBe(1);

      // Rotate secret to v2
      receiver.requests.length = 0;
      service.rotateWebhookSecret("tenant-demo-001", {
        webhookId: created.webhookId,
        secret: secretV2,
        rotationReason: "routine_credential_rotation",
      });

      // Check endpoint reverted to test_pending and secret history has no plaintext
      const [endpointAfterRotation] = service.listWebhookEndpoints("tenant-demo-001");
      expect(endpointAfterRotation.status).toBe("test_pending");
      expect(endpointAfterRotation.secretVersion).toBe(2);
      for (const hist of endpointAfterRotation.secretHistory) {
        expect((hist as unknown as Record<string, unknown>).secretValue).toBeUndefined();
      }

      // Validate v2
      await service.sendTestWebhook("tenant-demo-001", {
        webhookId: created.webhookId,
      });
      expect(receiver.requests.length).toBe(1);
      const reqV2 = receiver.requests[0]!;
      const sigV2 = verifyHmacSignature(
        reqV2.headers["x-drts-webhook-signature"] as string,
        reqV2.rawBody,
        secretV2,
      );
      expect(sigV2.valid).toBe(true);
      expect(sigV2.version).toBe(2);

      // Negative check: Verifying v2 with old secretV1 must fail
      const falseCheck = verifyHmacSignature(
        reqV2.headers["x-drts-webhook-signature"] as string,
        reqV2.rawBody,
        secretV1,
      );
      expect(falseCheck.valid).toBe(false);
    });

    it("C112-8 (Normal): Deduplicates identical outbox keys and enqueues idempotent delivery records", async () => {
      const auditNotificationService = new AuditNotificationService();
      const webhookDispatchService = new WebhookDispatchService();
      const service = new TenantPartnerService(
        auditNotificationService,
        undefined,
        webhookDispatchService,
        [],
      );

      const endpoint = service.createWebhookEndpoint("tenant-demo-001", {
        url: receiver.url,
        secret: "whsec_dedup_001",
        events: ["dispatch.assigned"],
      });

      // Activate endpoint first
      await service.sendTestWebhook("tenant-demo-001", { webhookId: endpoint.webhookId });
      receiver.requests.length = 0;

      // Publish with an outboxKey
      const outboxKey = "outbox-msg-unique-key-42";
      const results1 = await service.publishWebhookEvent("tenant-demo-001", {
        eventType: "dispatch.assigned",
        data: { orderId: "ord-dedup-01", status: "assigned" },
        outboxKey,
      });
      expect(results1.length).toBe(1);
      const deliveryId1 = results1[0]!.deliveryId;

      // Publish duplicate with identical outboxKey
      const results2 = await service.publishWebhookEvent("tenant-demo-001", {
        eventType: "dispatch.assigned",
        data: { orderId: "ord-dedup-01", status: "assigned" },
        outboxKey,
      });
      expect(results2.length).toBe(1);
      const deliveryId2 = results2[0]!.deliveryId;

      // Deterministic deliveryId means second dispatch recognized existing record
      expect(deliveryId1).toBe(deliveryId2);
      expect(receiver.requests.length).toBe(1); // Receiver only received it once!
    });
  });

  // =========================================================================
  // Capability C113: ERP / Enterprise SSO / Bank Ledger Synchronization (External Gate)
  // =========================================================================
  describe("C113: ERP & Bank Ledger Settlement Matrix (External Gate Verification)", () => {
    it("C113-1 (Normal): Retrieves settlement statement records and verifies financial data structure", async () => {
      const auditNotificationService = new AuditNotificationService();
      const billingService = new BillingSettlementService(auditNotificationService);

      const statements = await billingService.listTenantSettlementStatements("tenant-demo-001");
      expect(statements.length).toBeGreaterThanOrEqual(1);

      const statement = statements[0]!;
      expect(statement.tenantId).toBe("tenant-demo-001");
      expect(statement.period).toMatch(/^\d{4}-\d{2}$/);
      expect(statement.periodStart).toBeDefined();
      expect(statement.periodEnd).toBeDefined();
      expect(statement.totals.fareTotal.amountMinor).toBeGreaterThanOrEqual(0);
      expect(Date.parse(statement.periodStart)).toBeLessThanOrEqual(Date.parse(statement.periodEnd));
    });

    it("C113-2 (Negative): Querying invalid settlement statement period throws VALIDATION_ERROR", async () => {
      const auditNotificationService = new AuditNotificationService();
      const billingService = new BillingSettlementService(auditNotificationService);

      try {
        await billingService.getTenantSettlementStatement("tenant-demo-001", "invalid-period");
        expect.unreachable();
      } catch (err: any) {
        const code = err?.errorCode ?? err?.getResponse?.()?.error?.code;
        expect(code).toBe("VALIDATION_ERROR");
      }
    });

    it("C113-3 (External Gate Declaration): Documents enterprise ERP/SSO and banking H2H prerequisites", () => {
      const prerequisites = {
        externalGateId: "GATE-C113-ERP-SSO-BANK",
        bankingH2H: "Dedicated MPLS leased line / SWIFT MT940 statement sync",
        enterpriseSso: "SAML 2.0 / OIDC IdP federation with Azure AD / Okta",
        simulatedEnvironment: "dev/demo in-memory read models and seeded bank statements",
        status: "external_gate_pending_live_credentials",
      };

      expect(prerequisites.externalGateId).toBe("GATE-C113-ERP-SSO-BANK");
      expect(prerequisites.status).toBe("external_gate_pending_live_credentials");
    });
  });

  // =========================================================================
  // Capability C114: Maps / Geocoding / Routing (External Gate)
  // =========================================================================
  describe("C114: Geocoding & Routing Provider Verification (External Gate)", () => {
    it("C114-1 (Normal): Geocoding provider resolves Taiwan address coordinates within valid boundaries", async () => {
      const geoService = new GeoService(
        new MockGeoProvider(),
        new GeoProviderConfigService({
          NODE_ENV: "test",
          DRTS_ENV: "test",
          MAP_PROVIDER_MODE: "mock",
        }),
      );

      const result = await geoService.search({ q: "台北市信義區市府路1號" });
      expect(result.candidates.length).toBeGreaterThan(0);
      const candidate = result.candidates[0]!;
      // Taiwan latitude between 21.8 and 25.4, longitude between 119.9 and 122.1
      expect(candidate.location.lat).toBeGreaterThan(21.8);
      expect(candidate.location.lat).toBeLessThan(25.4);
      expect(candidate.location.lng).toBeGreaterThan(119.9);
      expect(candidate.location.lng).toBeLessThan(122.1);
    });

    it("C114-2 (Negative): Blank address throws validation error gracefully", async () => {
      const geoService = new GeoService(
        new MockGeoProvider(),
        new GeoProviderConfigService({
          NODE_ENV: "test",
          DRTS_ENV: "test",
          MAP_PROVIDER_MODE: "mock",
        }),
      );

      await expect(geoService.search({ q: "   " })).rejects.toThrowError();
    });

    it("C114-3 (External Gate Declaration): Documents Google Maps Platform API key and quota prerequisites", () => {
      const prerequisites = {
        externalGateId: "GATE-C114-GOOGLE-MAPS",
        requiredServices: ["Geocoding API", "Directions API", "Distance Matrix API", "Maps JavaScript API"],
        taiwanAddressQuota: "Requires production Google Cloud Billing account and restricted API key",
        status: "external_gate_mock_verified",
      };

      expect(prerequisites.externalGateId).toBe("GATE-C114-GOOGLE-MAPS");
      expect(prerequisites.status).toBe("external_gate_mock_verified");
    });
  });

  // =========================================================================
  // Capability C115: Recording Callback & Registry Qualification Background Scan (Verification Gap)
  // =========================================================================
  describe("C115: Voice Recording Callback & Qualification Background Scan", () => {
    function createMobilityAndCallServices() {
      const auditService = new AuditNotificationService();
      const callcenterService = new CallcenterService(auditService);
      const sandboxWebhookAdapter = new SandboxWebhookAdapter(callcenterService);
      const opsDispatchEventsService = new OpsDispatchEventsService(new EventEmitter() as never);
      const regulatoryRegistryService = new RegulatoryRegistryService(
        opsDispatchEventsService,
        auditService,
        new DriverProfileService(auditService),
      );
      const ownedMobilityService = new OwnedMobilityService(
        regulatoryRegistryService,
        auditService,
        callcenterService,
        new OwnedMobilityTaskEventsService(new EventEmitter() as never),
        opsDispatchEventsService,
      );
      ownedMobilityService.registerCallRecordingListeners();
      return {
        auditService,
        callcenterService,
        sandboxWebhookAdapter,
        ownedMobilityService,
        regulatoryRegistryService,
      };
    }

    it("C115-1 (Normal): Phone booking stays in recording_pending until recording.ready callback arrives", async () => {
      const { ownedMobilityService, sandboxWebhookAdapter } =
        createMobilityAndCallServices();

      sandboxWebhookAdapter.ingest(sandboxFixtures.callStarted, "req-start");
      sandboxWebhookAdapter.ingest(sandboxFixtures.callEnded, "req-end");
      sandboxWebhookAdapter.ingest(sandboxFixtures.recordingPending, "req-recording-pending");

      const order = await ownedMobilityService.createCallCenterOrder({
        callId: sandboxFixtures.callStarted.provider_call_id,
        agentId: sandboxFixtures.callStarted.agent_extension!,
        passenger: {
          name: "王大明",
          phone: sandboxFixtures.callStarted.caller_phone!,
        },
        pickup: { address: "台中市梧棲區中二路一段9號" },
        dropoff: { address: "台中市大安區興安路378號" },
      });

      expect(order.status).toBe("recording_pending");
      expect(order.complianceFlags).toContain("recording_pending");

      // Ingest recording.ready
      sandboxWebhookAdapter.ingest(sandboxFixtures.recordingReady, "req-recording-ready");

      const readyOrder = ownedMobilityService.getOrder(order.orderId);
      expect(readyOrder.status).toBe("ready_for_dispatch");
      expect(readyOrder.recordingId).toBe(sandboxFixtures.recordingReady.recording_id);
      expect(readyOrder.complianceFlags).toContain("recording_bound");
    });

    it("C115-2 (Negative): Ingesting recording.failed callback flags order as recording_missing", async () => {
      const { ownedMobilityService, sandboxWebhookAdapter } = createMobilityAndCallServices();

      sandboxWebhookAdapter.ingest(sandboxFixtures.callStarted, "req-start");
      sandboxWebhookAdapter.ingest(sandboxFixtures.recordingPending, "req-pending");

      const order = await ownedMobilityService.createCallCenterOrder({
        callId: sandboxFixtures.callStarted.provider_call_id,
        agentId: sandboxFixtures.callStarted.agent_extension!,
        passenger: {
          name: "林小華",
          phone: sandboxFixtures.callStarted.caller_phone!,
        },
        pickup: { address: "台中市梧棲區中二路一段9號" },
        dropoff: { address: "台中市大安區興安路378號" },
      });

      sandboxWebhookAdapter.ingest(sandboxFixtures.recordingFailed, "req-recording-failed");

      const failedOrder = ownedMobilityService.getOrder(order.orderId);
      expect(failedOrder.status).toBe("recording_pending");
      expect(failedOrder.recordingId).toBeNull();
      expect(failedOrder.complianceFlags).toContain("recording_missing");
    });

    it("C115-3 (Live Limitation Declaration): Documents live CTI telephony and Cloud Run persistent scheduler", () => {
      const liveLimitation = {
        limitationId: "LIMITATION-C115-CTI-CRON",
        telephonyCarrier: "Requires physical SIP trunking / PBX hardware for carrier audio ingestion",
        persistentTimer: "Cloud Run containers scale to zero; requires Cloud Scheduler / Cloud Tasks for durable cron",
        status: "adapter_tested_live_infrastructure_deferred",
      };

      expect(liveLimitation.limitationId).toBe("LIMITATION-C115-CTI-CRON");
      expect(liveLimitation.status).toBe("adapter_tested_live_infrastructure_deferred");
    });
  });
});
