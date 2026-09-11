/**
 * SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911 -- GitHub-hosted real receiver
 * acceptance.
 *
 * This suite is intentionally NOT part of the local unit test surface: it
 * starts a real `node:http` server and drives the production
 * `WebhookDispatchService` against it over a real loopback TCP connection
 * with the real global `fetch`, so it must only run on a dedicated
 * GitHub-hosted disposable runner (see
 * `.github/workflows/webhook-transport-acceptance.yml`), never on this
 * repository's shared development VM.
 *
 * Because `tests/integration/**` is part of the default `vitest`/`test:unit`
 * include glob, this describe block self-gates on
 * `SR_WEBHOOK_TIMEOUT_EVIDENCE_PATH` (the same env var the dedicated hosted
 * workflow already sets only for this run), matching the existing
 * `it.skipIf(!<dedicated-env-var>)` convention used by
 * `tests/integration/system-remediation/sr-ops-proof-001` and
 * `sr-booking-verify` -- so a plain `pnpm test`/`pnpm run test:unit` sweep on
 * this VM or in normal CI never boots the receiver.
 *
 * Production surface under test:
 * - `WebhookDispatchService` is constructed with zero arguments (the exact
 *   production default: `globalThis.fetch`), configured only through the
 *   real `WEBHOOK_DISPATCH_TIMEOUT_MS` env var the production code already
 *   reads. No timeout/AbortController implementation is injected here.
 * - The receiver is a real HTTP server; a "hang" route never writes a
 *   response so the only thing that can end the request is the service's
 *   own bounded deadline aborting the real socket.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import type { WebhookRetryPolicy } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 3,
  initialBackoffSeconds: 5,
  backoffMultiplier: 2,
  maxBackoffSeconds: 60,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

const BOUNDED_TIMEOUT_MS = 800;
const TIMEOUT_UPPER_BOUND_SLACK_MS = 6_000;

type ReceivedRequest = {
  url: string;
  method: string | undefined;
  headers: IncomingMessage["headers"];
  body: string;
};

const isHostedAcceptanceConfigured = Boolean(
  process.env.SR_WEBHOOK_TIMEOUT_EVIDENCE_PATH,
);

describe.skipIf(!isHostedAcceptanceConfigured)(
  "SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911: real GitHub-hosted receiver proves bounded timeout and recovery",
  () => {
    let server: Server;
    let baseUrl: string;
    let retryAttemptsSeen = 0;
    const hangRequestClosed: Array<Promise<boolean>> = [];
    const received: ReceivedRequest[] = [];
    const originalTimeoutEnv = process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
    const evidence: Record<string, unknown> = {
      candidateSha: process.env.CANDIDATE_SHA ?? null,
      workflowSha: process.env.WORKFLOW_SHA ?? null,
      boundedTimeoutMs: BOUNDED_TIMEOUT_MS,
      recordedAt: new Date().toISOString(),
      cases: {},
    };

    beforeAll(async () => {
      server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if (req.url === "/hang") {
            const closed = new Promise<boolean>((resolve) => {
              req.on("close", () => resolve(true));
            });
            hangRequestClosed.push(closed);
            received.push({
              url: req.url,
              method: req.method,
              headers: req.headers,
              body,
            });
            // Deliberately never call res.end(): this stands in for a tenant
            // endpoint that accepts the connection but never responds.
            return;
          }

          if (req.url === "/retry-then-success") {
            retryAttemptsSeen += 1;
            received.push({
              url: req.url,
              method: req.method,
              headers: req.headers,
              body,
            });
            if (retryAttemptsSeen < 2) {
              res.writeHead(503, { "content-type": "text/plain" });
              res.end("unavailable");
              return;
            }
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          received.push({
            url: req.url ?? "",
            method: req.method,
            headers: req.headers,
            body,
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      });

      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected the acceptance receiver to bind a TCP port.");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;

      process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = String(BOUNDED_TIMEOUT_MS);
    });

    afterAll(async () => {
      if (originalTimeoutEnv === undefined) {
        delete process.env.WEBHOOK_DISPATCH_TIMEOUT_MS;
      } else {
        process.env.WEBHOOK_DISPATCH_TIMEOUT_MS = originalTimeoutEnv;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      const evidencePath = process.env.SR_WEBHOOK_TIMEOUT_EVIDENCE_PATH;
      if (evidencePath) {
        mkdirSync(dirname(evidencePath), { recursive: true });
        writeFileSync(
          evidencePath,
          `${JSON.stringify(evidence, null, 2)}\n`,
          "utf8",
        );
      }
    });

    it("bounds a hung tenant endpoint to the configured deadline and aborts the real socket", async () => {
      const service = new WebhookDispatchService();
      expect(service.timeoutMs).toBe(BOUNDED_TIMEOUT_MS);

      const startedAt = Date.now();
      const result = await service.dispatchAttempt({
        url: `${baseUrl}/hang`,
        deliveryId: "wd_sr_hosted_hang_001",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeGreaterThanOrEqual(BOUNDED_TIMEOUT_MS - 50);
      expect(elapsedMs).toBeLessThan(
        BOUNDED_TIMEOUT_MS + TIMEOUT_UPPER_BOUND_SLACK_MS,
      );
      expect(result.status).toBe("queued");
      expect(result.httpStatus).toBeNull();
      expect(result.nextAttemptAt).not.toBeNull();

      const closedWithinBudget = await Promise.race([
        hangRequestClosed[hangRequestClosed.length - 1],
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 5_000),
        ),
      ]);
      expect(closedWithinBudget).toBe(true);

      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      const connectionCount = await new Promise<number>((resolve, reject) => {
        server.getConnections((error, count) =>
          error ? reject(error) : resolve(count),
        );
      });
      expect(connectionCount).toBe(0);

      (evidence.cases as Record<string, unknown>).boundedTimeout = {
        elapsedMs,
        status: result.status,
        httpStatus: result.httpStatus,
        socketAbortedByClient: closedWithinBudget,
        lingeringConnectionsAfterAbort: connectionCount,
      };
    });

    it("marks a timed-out final attempt as delivery_failed once retries are exhausted", async () => {
      const service = new WebhookDispatchService();

      const result = await service.dispatchAttempt({
        url: `${baseUrl}/hang`,
        deliveryId: "wd_sr_hosted_hang_002",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: RETRY_POLICY.maxAttempts,
        retryPolicy: RETRY_POLICY,
      });

      expect(result.status).toBe("delivery_failed");
      expect(result.nextAttemptAt).toBeNull();

      (evidence.cases as Record<string, unknown>).exhaustedAfterTimeout = {
        status: result.status,
        nextAttemptAt: result.nextAttemptAt,
      };
    });

    it("recovers and delivers quickly to a healthy endpoint after a prior attempt timed out", async () => {
      const service = new WebhookDispatchService();

      const startedAt = Date.now();
      const result = await service.dispatchAttempt({
        url: `${baseUrl}/ok`,
        deliveryId: "wd_sr_hosted_recovery_001",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 7,
        payload: {
          deliveryId: "wd_sr_hosted_recovery_001",
          tenantId: "tenant-demo-001",
        },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });
      const elapsedMs = Date.now() - startedAt;

      expect(result.status).toBe("delivered");
      expect(result.httpStatus).toBe(200);
      expect(elapsedMs).toBeLessThan(BOUNDED_TIMEOUT_MS);

      const delivered = received.find((entry) => entry.url === "/ok");
      expect(delivered).toBeDefined();
      expect(delivered?.body).toBe(
        JSON.stringify({
          delivery_id: "wd_sr_hosted_recovery_001",
          tenant_id: "tenant-demo-001",
        }),
      );

      const expectedSignatureMatch = result.signatureHeader.match(
        /^v=7;t=(.*);sig=([0-9a-f]{64})$/,
      );
      expect(expectedSignatureMatch).not.toBeNull();
      const [, attemptedAt, signatureHex] = expectedSignatureMatch ?? [];
      const recomputed = createHmac("sha256", "dispatch-secret")
        .update(`${attemptedAt}.${delivered?.body ?? ""}`)
        .digest("hex");
      expect(signatureHex).toBe(recomputed);
      expect(delivered?.headers["x-drts-webhook-signature"]).toBe(
        result.signatureHeader,
      );

      (evidence.cases as Record<string, unknown>).recoveryAfterTimeout = {
        elapsedMs,
        status: result.status,
        httpStatus: result.httpStatus,
        hmacBytesMatched: signatureHex === recomputed,
      };
    });

    it("real HTTP status transitions from retryable to delivered across retry attempts (recovery via retry/backoff)", async () => {
      const service = new WebhookDispatchService();

      const firstAttempt = await service.dispatchAttempt({
        url: `${baseUrl}/retry-then-success`,
        deliveryId: "wd_sr_hosted_retry_001",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 1,
        retryPolicy: RETRY_POLICY,
      });
      expect(firstAttempt.status).toBe("queued");
      expect(firstAttempt.httpStatus).toBe(503);
      expect(firstAttempt.nextAttemptAt).not.toBeNull();

      const secondAttempt = await service.dispatchAttempt({
        url: `${baseUrl}/retry-then-success`,
        deliveryId: "wd_sr_hosted_retry_001",
        eventType: "tenant.webhook.test",
        tenantId: "tenant-demo-001",
        secretValue: "dispatch-secret",
        secretVersion: 1,
        payload: { event: "tenant.webhook.test" },
        attempt: 2,
        retryPolicy: RETRY_POLICY,
      });
      expect(secondAttempt.status).toBe("delivered");
      expect(secondAttempt.httpStatus).toBe(200);

      (evidence.cases as Record<string, unknown>).retryThenSuccess = {
        firstAttempt: {
          status: firstAttempt.status,
          httpStatus: firstAttempt.httpStatus,
        },
        secondAttempt: {
          status: secondAttempt.status,
          httpStatus: secondAttempt.httpStatus,
        },
      };
    });
  },
);
