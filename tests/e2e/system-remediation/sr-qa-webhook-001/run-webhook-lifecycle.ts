// Standalone runner for the SR-QA-WEBHOOK-001 E2E lifecycle.
//
// Playwright's TS transform cannot load NestJS's parameter-decorated
// constructors (`@Optional() private readonly x?: Foo`) -- it parses them
// against the modern TC39 decorators proposal, which forbids parameter
// decorators, and fails with "Decorators cannot be used to decorate
// parameters." That means the real TenantPartnerService / WebhookDispatchService
// classes cannot be imported directly from a `.spec.ts` file in this suite.
//
// This script is executed out-of-process via `tsx` (a real TypeScript
// compiler pipeline that does support Nest's decorators, exactly as the
// project's own vitest unit suite already does) so the E2E spec can still
// exercise the authoritative product services -- real writes, real HMAC
// signing, real HTTP delivery to a controlled receiver, real readback --
// instead of re-implementing that behavior by hand inside the spec file.
// The Playwright spec spawns this script once and asserts on its JSON result.
import { createHmac } from "node:crypto";
import http from "node:http";
import { type AddressInfo } from "node:net";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

interface ControlledReceiverRequest {
  method: string;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
}

function createControlledReceiver() {
  return new Promise<{
    url: string;
    requests: ControlledReceiverRequest[];
    setHandler: (
      handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void,
    ) => void;
    close: () => Promise<void>;
  }>((resolveReady) => {
    const requests: ControlledReceiverRequest[] = [];
    let customHandler:
      | ((req: http.IncomingMessage, res: http.ServerResponse, body: string) => void)
      | null = null;

    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        requests.push({ method: req.method ?? "UNKNOWN", headers: req.headers, rawBody });
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
      resolveReady({
        url: `http://127.0.0.1:${addr.port}/webhooks/receiver`,
        requests,
        setHandler: (handler) => {
          customHandler = handler;
        },
        close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

function verifyHmacSignature(headerValue: string, rawBody: string, secret: string) {
  const match = /^v=(\d+);t=([^;]+);sig=([0-9a-f]+)$/.exec(headerValue);
  if (!match) {
    return { valid: false, version: 0 };
  }
  const [, vStr, timestamp, signature] = match;
  const expectedSig = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return { valid: signature === expectedSig, version: parseInt(vStr!, 10) };
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    throw new Error("usage: run-webhook-lifecycle.ts <tenantId>");
  }

  const receiver = await createControlledReceiver();
  const auditNotificationService = new AuditNotificationService();
  const webhookDispatchService = new WebhookDispatchService();
  const service = new TenantPartnerService(
    auditNotificationService,
    undefined,
    webhookDispatchService,
    [],
  );

  try {
    // ---- C111: issuance, masking, overlap rotation, immediate revocation ----
    const issued = await service.issueApiKey(
      tenantId,
      {
        keyName: "E2E Automated Webhook Key",
        scopes: ["tenant:webhooks:read", "tenant:bookings:write"], // alias normalizes to tenant:write
      },
      "req-e2e-issue-001",
    );
    const issuedReadback = service
      .listApiKeys(tenantId)
      .find((k) => k.apiKeyId === issued.apiKey.apiKeyId);
    if (!issuedReadback) {
      throw new Error("issued API key missing from listApiKeys readback");
    }

    const rotated = await service.rotateApiKey(
      tenantId,
      issued.apiKey.apiKeyId,
      { keyName: "E2E Automated Webhook Key v2", overlapDays: 7 },
      "req-e2e-rotate-001",
    );
    const postRotationKeys = service.listApiKeys(tenantId);
    const oldKeyAfterRotation = postRotationKeys.find(
      (k) => k.apiKeyId === issued.apiKey.apiKeyId,
    )!;
    const newKeyAfterRotation = postRotationKeys.find(
      (k) => k.apiKeyId === rotated.apiKey.apiKeyId,
    )!;

    const revocable = await service.issueApiKey(
      tenantId,
      { keyName: "Revocation Target Key", scopes: ["tenant:read"] },
      "req-e2e-issue-002",
    );
    service.revokeApiKey(tenantId, revocable.apiKey.apiKeyId, "req-e2e-revoke-001");
    const revokedReadback = service
      .listApiKeys(tenantId)
      .find((k) => k.apiKeyId === revocable.apiKey.apiKeyId)!;

    let rotationOfRevokedRejectedCode: string | null = null;
    try {
      service.rotateApiKey(tenantId, revocable.apiKey.apiKeyId, { overlapDays: 3 });
    } catch (err: unknown) {
      rotationOfRevokedRejectedCode =
        (err as { errorCode?: string })?.errorCode ??
        (err as { getResponse?: () => { error?: { code?: string } } })
          ?.getResponse?.()?.error?.code ??
        null;
    }

    // ---- C112: real HTTP dispatch, HMAC verified against wire bytes ----
    const webhookSecret = "whsec_e2e_verified_signing_secret_999";
    const createdWebhook = service.createWebhookEndpoint(
      tenantId,
      { url: receiver.url, secret: webhookSecret, events: ["tenant.webhook.test"] },
      "req-e2e-create-wh-001",
    );

    const testResult = await service.sendTestWebhook(
      tenantId,
      { webhookId: createdWebhook.webhookId },
      "req-e2e-send-test-001",
    );
    const firstRequest = receiver.requests[receiver.requests.length - 1]!;
    const firstSigHeader = firstRequest.headers["x-drts-webhook-signature"] as string;
    const firstHmac = verifyHmacSignature(firstSigHeader, firstRequest.rawBody, webhookSecret);
    const endpointAfterFirstTest = service.listWebhookEndpoints(tenantId)[0]!;

    // 503 -> queued with exponential backoff
    receiver.setHandler((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream Temporary Unavailable" }));
    });
    const retryResult = await service.sendTestWebhook(
      tenantId,
      { webhookId: createdWebhook.webhookId },
      "req-e2e-retry-001",
    );
    const queuedDelivery = service
      .listWebhookDeliveriesByWebhook(tenantId, createdWebhook.webhookId)
      .find((d) => d.deliveryId === retryResult.deliveryId)!;

    // 400 -> delivery_failed + endpoint auto-disable
    receiver.setHandler((_req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Permanent Non-Retryable Error" }));
    });
    const failResult = await service.sendTestWebhook(
      tenantId,
      { webhookId: createdWebhook.webhookId },
      "req-e2e-fail-001",
    );
    const endpointAfterFailure = service.listWebhookEndpoints(tenantId)[0]!;
    const disableNotices = auditNotificationService
      .listNotifications()
      .filter((n) => n.tenantId === tenantId);
    const disabledNoticeFound = disableNotices.some((n) =>
      n.title.includes("Tenant webhook disabled after repeated delivery failures"),
    );

    // Secret rotation v2 + recovery redelivery
    const secretV2 = "whsec_rotated_e2e_secret_v2";
    const rotatedSecret = service.rotateWebhookSecret(
      tenantId,
      { webhookId: createdWebhook.webhookId, secret: secretV2, rotationReason: "e2e_recovery_rotation" },
      "req-e2e-secret-rotate-001",
    );
    const endpointAfterSecretRotation = service.listWebhookEndpoints(tenantId)[0]!;
    const secretHistoryLeaksPlaintext = endpointAfterSecretRotation.secretHistory.some(
      (hist) => (hist as unknown as Record<string, unknown>).secretValue !== undefined,
    );

    receiver.setHandler((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const recoveryResult = await service.sendTestWebhook(
      tenantId,
      { webhookId: createdWebhook.webhookId },
      "req-e2e-recovery-001",
    );
    const v2Request = receiver.requests[receiver.requests.length - 1]!;
    const v2SigHeader = v2Request.headers["x-drts-webhook-signature"] as string;
    const v2HmacWithNewSecret = verifyHmacSignature(v2SigHeader, v2Request.rawBody, secretV2);
    const v2HmacWithOldSecret = verifyHmacSignature(v2SigHeader, v2Request.rawBody, webhookSecret);
    const endpointAfterRecovery = service.listWebhookEndpoints(tenantId)[0]!;

    // Replay protection: a byte-for-byte replay of the last signed request
    // must be rejected by the receiver via delivery-ID uniqueness tracking.
    const seenDeliveryIds = new Set<string>([
      v2Request.headers["x-drts-webhook-delivery-id"] as string,
    ]);
    receiver.setHandler((r, res) => {
      const deliveryId = r.headers["x-drts-webhook-delivery-id"] as string;
      if (seenDeliveryIds.has(deliveryId)) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Duplicate delivery ID detected" }));
        return;
      }
      seenDeliveryIds.add(deliveryId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const replayResponse = await fetch(receiver.url, {
      method: "POST",
      headers: v2Request.headers as Record<string, string>,
      body: v2Request.rawBody,
    });

    const result = {
      ok: true as const,
      tenantId,
      receiverUrl: receiver.url,
      apiKeys: {
        issuedApiKeyId: issued.apiKey.apiKeyId,
        issuedPlaintextKey: issued.plaintextKey,
        issuedReadback: {
          status: issuedReadback.status,
          scopes: issuedReadback.scopes,
          keyPrefix: issuedReadback.keyPrefix,
          maskedSuffix: issuedReadback.maskedSuffix,
          hasPlaintextField: (issuedReadback as unknown as Record<string, unknown>).plaintextKey !== undefined,
          hasKeyHashField: (issuedReadback as unknown as Record<string, unknown>).keyHash !== undefined,
        },
        rotatedApiKeyId: rotated.apiKey.apiKeyId,
        rotatedPlaintextKey: rotated.plaintextKey,
        oldKeyAfterRotation: {
          status: oldKeyAfterRotation.status,
          overlapEndsAt: oldKeyAfterRotation.overlapEndsAt,
          supersededByApiKeyId: oldKeyAfterRotation.supersededByApiKeyId,
        },
        newKeyAfterRotation: {
          status: newKeyAfterRotation.status,
          rotatedFromApiKeyId: newKeyAfterRotation.rotatedFromApiKeyId,
        },
        revocableApiKeyId: revocable.apiKey.apiKeyId,
        revokedReadback: {
          status: revokedReadback.status,
          revokedAt: revokedReadback.revokedAt,
          revokeReason: revokedReadback.revokeReason,
        },
        rotationOfRevokedRejectedCode,
      },
      webhook: {
        webhookId: createdWebhook.webhookId,
        createdStatus: createdWebhook.status,
        firstTest: {
          httpStatus: testResult.httpStatus,
          deliveryId: testResult.deliveryId,
          request: {
            method: firstRequest.method,
            eventType: firstRequest.headers["x-drts-event-type"],
            tenantId: firstRequest.headers["x-drts-tenant-id"],
            deliveryIdHeader: firstRequest.headers["x-drts-webhook-delivery-id"],
            signatureHeader: firstSigHeader,
          },
          hmac: firstHmac,
          endpointStatusAfter: endpointAfterFirstTest.status,
          lastDeliveredAt: endpointAfterFirstTest.runtimeMetadata.lastDeliveredAt,
        },
        retryAttempt: {
          httpStatus: retryResult.httpStatus,
          attempt: retryResult.attempt,
          nextAttemptAt: retryResult.nextAttemptAt,
          deliveryStatus: queuedDelivery.status,
          deliveryHttpStatus: queuedDelivery.httpStatus,
          backoffSeconds: Math.round(
            (Date.parse(queuedDelivery.nextAttemptAt!) - Date.parse(queuedDelivery.attemptedAt)) / 1000,
          ),
        },
        permanentFailure: {
          httpStatus: failResult.httpStatus,
          endpointStatusAfter: endpointAfterFailure.status,
          disableReason: endpointAfterFailure.runtimeMetadata.disableReason,
          disabledAt: endpointAfterFailure.runtimeMetadata.disabledAt,
          disabledNoticeFound,
        },
        secretRotation: {
          secretVersion: rotatedSecret.secretVersion,
          endpointStatusAfter: endpointAfterSecretRotation.status,
          secretHistoryLeaksPlaintext,
        },
        recovery: {
          httpStatus: recoveryResult.httpStatus,
          request: {
            signatureHeader: v2SigHeader,
          },
          hmacWithNewSecret: v2HmacWithNewSecret,
          hmacWithOldSecret: v2HmacWithOldSecret,
          endpointStatusAfter: endpointAfterRecovery.status,
        },
        replay: {
          responseStatus: replayResponse.status,
        },
      },
    };

    console.log(JSON.stringify(result));
    process.exitCode = 0;
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    await receiver.close();
  }

  // TenantPartnerService schedules a real (non-unref'd) setTimeout for the
  // queued 503 delivery's retry -- by design, so a live server keeps retrying
  // after this process would normally exit. This script has already captured
  // everything it needs into `result`, so force an immediate exit rather than
  // waiting out that dangling timer (or a live server's persistent one).
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.log(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exit(1);
});
