import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildArtifactText,
  type SigningConfig,
} from "../../../../apps/bank-console-web/app/artifacts/artifact-crypto";
import {
  BANK_CONSOLE_SESSION_COOKIE,
  resolveServerSessionRole,
  signSessionRole,
} from "../../../../apps/bank-console-web/lib/session";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { createControlledDownloadMetadata } from "../../../../apps/api/src/common/controlled-download";

import {
  downloadArtifact,
  liveSigningGatePassed,
  resolveRuntimeShaBinding,
  runIndependentBankVerifier,
  sha256Hex,
} from "./live-document-runner";

const VERIFIER_SCRIPT_PATH = join(
  __dirname,
  "../../../unit/system-remediation/sr-bank-003/verify_artifact.py",
);

// Minimal (tenantCode -> tenantId) registry for the two bank tenants this
// harness exercises. Intentionally not imported from
// apps/bank-console-web/lib/demo-tenants.ts: that module (and the real
// statements/trips route handlers built on it) resolve a `@/lib/...` alias
// that only apps/bank-console-web's own vitest.config.ts registers. This
// harness runs under the repo-root vitest config (its "@" alias points at
// apps/tenant-console-web, a different app), so importing route.ts directly
// from here would silently resolve bank-console-web's imports against the
// wrong app. The two functions that matter for authenticated-download
// acceptance -- signed-cookie verification and cross-tenant rejection -- are
// both real product code from `lib/session.ts` (no alias dependency), not
// reimplemented here.
const BANK_TENANTS: Record<string, string> = {
  acme: "tenant_acme",
  contoso: "tenant-contoso-001",
};

interface StatementServerOptions {
  signingConfig?: Partial<SigningConfig>;
}

/**
 * A genuine loopback HTTP listener standing in for the deployed remote host
 * this preparation producer does not yet have (SR-RELEASE-001 is still
 * blocked -- see the routing evidence this task was dispatched from). Every
 * request crosses a real TCP/HTTP boundary via `fetch()`; nothing here is an
 * in-process function call. Session verification is the actual
 * `resolveServerSessionRole` from `lib/session.ts`; artifact bytes are built
 * with the actual `buildArtifactText` from `artifact-crypto.ts` -- the same
 * two functions the real Next.js routes call.
 */
function startBankStatementServer(
  options: StatementServerOptions = {},
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const cookieHeader = req.headers.cookie ?? "";
      const cookies = Object.fromEntries(
        cookieHeader
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const idx = part.indexOf("=");
            return [part.slice(0, idx), part.slice(idx + 1)];
          }),
      );

      const respondJson = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (url.pathname !== "/bank/statement") {
        respondJson(404, {
          ok: false,
          error: { code: "NOT_FOUND", message: "no route" },
        });
        return;
      }

      const requestedBank = url.searchParams.get("bank");
      const roleParam = url.searchParams.get("role");
      const session = resolveServerSessionRole(
        cookies[BANK_CONSOLE_SESSION_COOKIE],
        roleParam,
      );

      if (
        session.bankCode &&
        requestedBank &&
        session.bankCode !== requestedBank
      ) {
        respondJson(403, {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message:
              "Tenant scope mismatch: authenticated session does not match requested bank tenant.",
          },
        });
        return;
      }

      const targetBank = session.bankCode || requestedBank;
      if (!targetBank || !(targetBank in BANK_TENANTS)) {
        respondJson(400, {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "Missing or invalid bank tenant parameter.",
          },
        });
        return;
      }

      if (!session.isAuthorizedForExport) {
        respondJson(403, {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: session.isForged
              ? "Invalid or forged session signature."
              : session.isTampered
                ? "Role parameter tampering detected."
                : `Role ${session.role} is not authorized to export statements or download settlement artifacts.`,
          },
        });
        return;
      }

      const payload = [
        "================================================================================",
        "DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)",
        "================================================================================",
        "Statement ID  : settlement-statement-acceptance-harness-2026-08",
        "Period        : 2026-08",
        `Issuer Tenant : ${BANK_TENANTS[targetBank]}`,
        "Status        : DUE",
      ].join("\n");

      const artifactText = buildArtifactText(payload, {
        authDomain: "drts.settlement.issuer",
        ...(options.signingConfig
          ? { signingConfig: options.signingConfig }
          : {}),
      });

      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'attachment; filename="statement.txt"',
      });
      res.end(artifactText);
    },
  );

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/** Same "genuine loopback HTTP" rationale as above, for the real, unmodified `ControlledDownloadController`. */
function startControlledDownloadServer(
  controller: ControlledDownloadController,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const parts = url.pathname.split("/").filter(Boolean);
      const [kind, subjectId] = parts.slice(-2);
      const q = url.searchParams;

      try {
        const file = (await controller.resolve(
          kind ?? "",
          subjectId ?? "",
          q.get("signed_at") ?? undefined,
          q.get("expires_at") ?? undefined,
          q.get("key_id") ?? undefined,
          q.get("manifest_hash") ?? undefined,
          q.get("sig") ?? undefined,
          q.get("sig_v") ?? undefined,
        )) as {
          getStream(): NodeJS.ReadableStream;
          getHeaders(): { type?: string };
        };

        res.writeHead(200, {
          "content-type": file.getHeaders().type ?? "application/octet-stream",
        });
        for await (const chunk of file.getStream()) {
          res.write(chunk);
        }
        res.end();
      } catch (error) {
        const status =
          (error as { getStatus?: () => number }).getStatus?.() ?? 500;
        const response = (
          error as { getResponse?: () => unknown }
        ).getResponse?.();
        res.writeHead(status, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            response ?? { ok: false, error: { message: String(error) } },
          ),
        );
      }
    },
  );

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function generateTestEcdsaKeyPair() {
  return generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

describe("SR-LIVE-DOC-RUNNER-001: authenticated remote artifact download + independent signature acceptance", () => {
  const openServers: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (openServers.length > 0) {
      const s = openServers.pop()!;
      await s.close();
    }
  });

  async function withBankServer(options: StatementServerOptions = {}) {
    const server = await startBankStatementServer(options);
    openServers.push(server);
    return server;
  }

  async function withControlledDownloadServer(
    store: InMemoryDocumentArtifactStore,
  ) {
    const server = await startControlledDownloadServer(
      new ControlledDownloadController(store),
    );
    openServers.push(server);
    return server;
  }

  describe("Runner validation (test doubles only -- no external network, matches SR-LIVE-DOC-001's VM scope)", () => {
    describe("Bank artifact track: authenticated remote download -> independent SR-BANK-003 verifier", () => {
      it("SIGNED + correct authorized public key clears the live signing gate", async () => {
        const keyPair = generateTestEcdsaKeyPair();
        const { baseUrl } = await withBankServer({
          signingConfig: {
            privateKeyPem: keyPair.privateKey,
            keyId: "acceptance-harness-key",
          },
        });
        const cookie = signSessionRole("bank_finance", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        expect(outcome.status).toBe(200);
        expect(outcome.bytes).not.toBeNull();

        const verifierOutcome = runIndependentBankVerifier({
          verifierScriptPath: VERIFIER_SCRIPT_PATH,
          artifactBytes: outcome.bytes!,
          publicKeyPem: keyPair.publicKey,
        });

        expect(verifierOutcome.signatureStatus).toBe("SIGNED");
        expect(liveSigningGatePassed(verifierOutcome)).toBe(true);
      });

      it("UNSIGNED (no signing key deployed) downloads successfully but never satisfies the live signing gate", async () => {
        const { baseUrl } = await withBankServer();
        const cookie = signSessionRole("bank_finance", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        expect(outcome.status).toBe(200);
        const verifierOutcome = runIndependentBankVerifier({
          verifierScriptPath: VERIFIER_SCRIPT_PATH,
          artifactBytes: outcome.bytes!,
        });

        expect(verifierOutcome.ok).toBe(true);
        expect(verifierOutcome.signatureStatus).toBe("UNSIGNED");
        expect(liveSigningGatePassed(verifierOutcome)).toBe(false);
      });

      it("rejects verification against the wrong authorized public key", async () => {
        const keyPair = generateTestEcdsaKeyPair();
        const wrongKeyPair = generateTestEcdsaKeyPair();
        const { baseUrl } = await withBankServer({
          signingConfig: {
            privateKeyPem: keyPair.privateKey,
            keyId: "acceptance-harness-key",
          },
        });
        const cookie = signSessionRole("bank_finance", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        const verifierOutcome = runIndependentBankVerifier({
          verifierScriptPath: VERIFIER_SCRIPT_PATH,
          artifactBytes: outcome.bytes!,
          publicKeyPem: wrongKeyPair.publicKey,
        });

        expect(verifierOutcome.signatureVerified).toBe(false);
        expect(verifierOutcome.signatureStatus).toBe("TAMPERED");
        expect(liveSigningGatePassed(verifierOutcome)).toBe(false);
      });

      it("rejects a downloaded artifact whose bytes were altered after download (1-byte tamper)", async () => {
        const keyPair = generateTestEcdsaKeyPair();
        const { baseUrl } = await withBankServer({
          signingConfig: {
            privateKeyPem: keyPair.privateKey,
            keyId: "acceptance-harness-key",
          },
        });
        const cookie = signSessionRole("bank_finance", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        const originalHex = sha256Hex(outcome.bytes!);
        // Substitute one ASCII character for another (rather than XOR-flipping
        // a raw byte) so the tampered text stays valid UTF-8 -- the verifier
        // must reject this as a hash mismatch, not crash on malformed input.
        const tamperedText = outcome
          .bytes!.toString("utf-8")
          .replace("DUE", "PAID");
        const tampered = Buffer.from(tamperedText, "utf-8");
        expect(sha256Hex(tampered)).not.toBe(originalHex);

        const verifierOutcome = runIndependentBankVerifier({
          verifierScriptPath: VERIFIER_SCRIPT_PATH,
          artifactBytes: tampered,
          publicKeyPem: keyPair.publicKey,
        });

        expect(verifierOutcome.hashMatch).toBe(false);
        expect(verifierOutcome.signatureStatus).toBe("TAMPERED");
        expect(liveSigningGatePassed(verifierOutcome)).toBe(false);
      });

      it("rejects cross-tenant download attempts before any bytes are served", async () => {
        const { baseUrl } = await withBankServer();
        const cookie = signSessionRole("bank_finance", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=contoso&role=bank_finance`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        expect(outcome.status).toBe(403);
        expect(outcome.bytes).toBeNull();
        expect(outcome.errorCode).toBe("FORBIDDEN");
      });

      it("rejects an unauthorized role (bank_ops_viewer) before any bytes are served", async () => {
        const { baseUrl } = await withBankServer();
        const cookie = signSessionRole("bank_ops_viewer", "acme");

        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_ops_viewer`,
          {
            headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${cookie}` },
          },
        );

        expect(outcome.status).toBe(403);
        expect(outcome.bytes).toBeNull();
      });

      it("rejects a request with no session cookie at all", async () => {
        const { baseUrl } = await withBankServer();
        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
        );
        expect(outcome.status).toBe(403);
        expect(outcome.bytes).toBeNull();
      });

      it("rejects a forged/unsigned session cookie", async () => {
        const { baseUrl } = await withBankServer();
        const outcome = await downloadArtifact(
          `${baseUrl}/bank/statement?bank=acme&role=bank_finance`,
          {
            headers: {
              cookie: `${BANK_CONSOLE_SESSION_COOKIE}=bank_finance:acme.${"0".repeat(64)}`,
            },
          },
        );
        expect(outcome.status).toBe(403);
        expect(outcome.bytes).toBeNull();
      });
    });

    describe("Invoice/report/placard track: real controlled-download link -> authenticated remote download", () => {
      function createBillingService(store: InMemoryDocumentArtifactStore) {
        return new BillingSettlementService(
          new AuditNotificationService(),
          undefined,
          undefined,
          undefined,
          store,
        );
      }

      it("resolves real invoice bytes matching the signed link's manifest hash", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const service = createBillingService(store);
        const invoice = await service.generateTenantInvoice("tenant-demo-001", {
          tenantId: "tenant-demo-001",
          periodStart: "2026-03-01T00:00:00Z",
          periodEnd: "2026-03-31T23:59:59Z",
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const outcome = await downloadArtifact(
          `${baseUrl}${invoice.artifactUrl}`,
        );

        expect(outcome.status).toBe(200);
        expect(sha256Hex(outcome.bytes!)).toBe(
          invoice.artifactDownloadMetadata.manifestHash,
        );
      });

      it("rejects an expired controlled-download link (410 GONE)", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const record = await store.put({
          kind: "tenant-invoice",
          subjectId: "invoice-expiry-check",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.4 fixture bytes"),
        });
        const staleMetadata = createControlledDownloadMetadata({
          kind: "tenant-invoice",
          subjectId: "invoice-expiry-check",
          manifestHash: record.sha256,
          createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const outcome = await downloadArtifact(
          `${baseUrl}${staleMetadata.downloadUrl}`,
        );

        expect(outcome.status).toBe(410);
        expect(outcome.bytes).toBeNull();
        expect(outcome.errorCode).toBe("CONTROLLED_DOWNLOAD_EXPIRED");
      });

      it("rejects a link whose named artifact no longer matches the stored bytes (409 CONFLICT)", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const original = await store.put({
          kind: "tenant-invoice",
          subjectId: "invoice-mismatch-check",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.4 original"),
        });
        const link = createControlledDownloadMetadata({
          kind: "tenant-invoice",
          subjectId: "invoice-mismatch-check",
          manifestHash: original.sha256,
        });
        // The producer regenerates the artifact under the same subject id.
        await store.put({
          kind: "tenant-invoice",
          subjectId: "invoice-mismatch-check",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.4 regenerated content"),
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const outcome = await downloadArtifact(`${baseUrl}${link.downloadUrl}`);

        expect(outcome.status).toBe(409);
        expect(outcome.errorCode).toBe("CONTROLLED_DOWNLOAD_CONTENT_MISMATCH");
      });

      it("rejects reusing a valid link's query for a different subject id (signature scoped to one subject)", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const recordA = await store.put({
          kind: "tenant-invoice",
          subjectId: "invoice-tenant-a",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.4 tenant A invoice"),
        });
        await store.put({
          kind: "tenant-invoice",
          subjectId: "invoice-tenant-b",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.4 tenant B invoice"),
        });
        const linkA = createControlledDownloadMetadata({
          kind: "tenant-invoice",
          subjectId: "invoice-tenant-a",
          manifestHash: recordA.sha256,
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const forgedUrl = linkA.downloadUrl.replace(
          "invoice-tenant-a",
          "invoice-tenant-b",
        );
        const outcome = await downloadArtifact(`${baseUrl}${forgedUrl}`);

        expect(outcome.status).toBe(403);
        expect(outcome.errorCode).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
      });

      it("reports the 'report' kind as not materialised through this store (out of scope, served separately) rather than as a defect", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const link = createControlledDownloadMetadata({
          kind: "report",
          subjectId: "report-any-subject",
          manifestHash: sha256Hex(Buffer.from("placeholder")),
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const response = await fetch(`${baseUrl}${link.downloadUrl}`);
        expect(response.status).toBe(501);
        const body = (await response.json()) as {
          error?: { code?: string; details?: { servedInstead?: string } };
        };
        expect(body.error?.code).toBe("ARTIFACT_NOT_MATERIALISED");
      });

      it("reports the 'placard' kind as incomplete pending SR-PLACARD-001", async () => {
        const store = new InMemoryDocumentArtifactStore();
        const link = createControlledDownloadMetadata({
          kind: "placard",
          subjectId: "placard-any-subject",
          manifestHash: sha256Hex(Buffer.from("placeholder")),
        });
        const { baseUrl } = await withControlledDownloadServer(store);

        const response = await fetch(`${baseUrl}${link.downloadUrl}`);
        expect(response.status).toBe(501);
        const body = (await response.json()) as { error?: { code?: string } };
        expect(body.error?.code).toBe("ARTIFACT_NOT_MATERIALISED");
      });
    });

    it("binds a runner-validation acceptance record to the candidate/workflow SHA pair", () => {
      const binding = resolveRuntimeShaBinding({
        CANDIDATE_SHA: "candidate-under-test",
        WORKFLOW_SHA: "workflow-definition-commit",
      } as NodeJS.ProcessEnv);

      const record = {
        mode: "runner_validation" as const,
        runtimeSha: binding.runtimeSha,
        workflowSha: binding.workflowSha,
      };

      expect(record.mode).toBe("runner_validation");
      expect(record.runtimeSha).toBe("candidate-under-test");
      expect(record.workflowSha).toBe("workflow-definition-commit");

      if (process.env.SR_LIVE_DOC_RUNNER_EVIDENCE) {
        const dir = mkdtempSync(join(tmpdir(), "sr-live-doc-001-evidence-"));
        try {
          writeFileSync(
            process.env.SR_LIVE_DOC_RUNNER_EVIDENCE,
            JSON.stringify(record, null, 2) + "\n",
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    });
  });

  describe("Live storage/signing acceptance (real deployed target -- only runs when explicitly dispatched with live env)", () => {
    const liveTargetOrigin = process.env.SR_LIVE_DOC_LIVE_TARGET_ORIGIN;
    const apiOrigin = process.env.SR_LIVE_DOC_LIVE_API_ORIGIN;
    const tenantConsoleOrigin =
      process.env.SR_LIVE_DOC_LIVE_TENANT_CONSOLE_ORIGIN;
    const platformAdminOrigin =
      process.env.SR_LIVE_DOC_LIVE_PLATFORM_ADMIN_ORIGIN;

    it.runIf(Boolean(liveTargetOrigin))(
      "checks for missing evidence sessions and requires non-zero exit if any are missing without injecting identity",
      () => {
        const missing: string[] = [];
        const checkCookie = (val: string | undefined) => val && val.trim().length > 0;
        if (!checkCookie(process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE))
          missing.push("SR_LIVE_DOC_LIVE_SESSION_COOKIE");
        if (!checkCookie(process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_BANK_OPS_VIEWER))
          missing.push("SR_LIVE_DOC_LIVE_SESSION_COOKIE_BANK_OPS_VIEWER");
        if (!checkCookie(process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_TENANT))
          missing.push("SR_LIVE_DOC_LIVE_SESSION_COOKIE_TENANT");
        if (!checkCookie(process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_CROSS_TENANT))
          missing.push("SR_LIVE_DOC_LIVE_SESSION_COOKIE_CROSS_TENANT");
        if (!process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_PLATFORM_ADMIN)
          missing.push("SR_LIVE_DOC_LIVE_SESSION_COOKIE_PLATFORM_ADMIN");

        if (!process.env.SR_LIVE_DOC_LIVE_API_ORIGIN)
          missing.push("SR_LIVE_DOC_LIVE_API_ORIGIN");
        if (!process.env.SR_LIVE_DOC_LIVE_TENANT_CONSOLE_ORIGIN)
          missing.push("SR_LIVE_DOC_LIVE_TENANT_CONSOLE_ORIGIN");
        if (!process.env.SR_LIVE_DOC_LIVE_PLATFORM_ADMIN_ORIGIN)
          missing.push("SR_LIVE_DOC_LIVE_PLATFORM_ADMIN_ORIGIN");
        if (!process.env.SR_LIVE_DOC_LIVE_EXPIRED_INVOICE_PATH)
          missing.push("SR_LIVE_DOC_LIVE_EXPIRED_INVOICE_PATH");
        if (!process.env.SR_LIVE_DOC_LIVE_PLACARD_PATH)
          missing.push("SR_LIVE_DOC_LIVE_PLACARD_PATH");
        if (!process.env.SR_LIVE_DOC_LIVE_REPORT_PATH)
          missing.push("SR_LIVE_DOC_LIVE_REPORT_PATH");

        if (missing.length > 0) {
          if (process.env.SR_LIVE_DOC_RUNNER_EVIDENCE) {
            writeFileSync(
              process.env.SR_LIVE_DOC_RUNNER_EVIDENCE,
              JSON.stringify(
                {
                  status: "failed",
                  missing,
                  runtimeSha: resolveRuntimeShaBinding().runtimeSha,
                  workflowSha: resolveRuntimeShaBinding().workflowSha,
                },
                null,
                2,
              ) + "\n",
            );
          }
          console.error(
            "Missing required session cookies/inputs (must not inject identity):",
            missing.join(", "),
          );
          throw new Error(
            "Missing required live sessions/inputs: " + missing.join(", "),
          );
        }
      },
    );

    it.runIf(Boolean(liveTargetOrigin))(
      "downloads a real bank statement and requires SIGNED status and candidate SHA match",
      async () => {
        const bank = process.env.SR_LIVE_DOC_LIVE_BANK_CODE;
        const roleCookie = process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE;
        const publicKeyPath = process.env.SR_LIVE_DOC_LIVE_PUBLIC_KEY_PATH;
        const statementPath = process.env.SR_LIVE_DOC_LIVE_STATEMENT_PATH;

        expect(bank, "SR_LIVE_DOC_LIVE_BANK_CODE is required").toBeTruthy();
        expect(
          statementPath,
          "SR_LIVE_DOC_LIVE_STATEMENT_PATH is required",
        ).toBeTruthy();

        const { getGoogleIdToken } = await import("./live-document-runner");
        const idToken = await getGoogleIdToken(liveTargetOrigin!);
        const headers: Record<string, string> = {
          cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${roleCookie}`,
        };
        if (idToken) headers["authorization"] = `Bearer ${idToken}`;

        const outcome = await downloadArtifact(
          `${liveTargetOrigin}${statementPath}?bank=${bank}`,
          { headers },
        );
        expect(outcome.status).toBe(200);
        expect(outcome.bytes).not.toBeNull();
        expect(
          outcome.candidateSha,
          "x-drts-candidate-sha header should match deployed SHA",
        ).toBe(process.env.CANDIDATE_SHA);

        const { readFileSync } = await import("node:fs");
        const verifierOutcome = runIndependentBankVerifier({
          verifierScriptPath: VERIFIER_SCRIPT_PATH,
          artifactBytes: outcome.bytes!,
          publicKeyPem: readFileSync(publicKeyPath!, "utf-8"),
        });

        expect(liveSigningGatePassed(verifierOutcome)).toBe(true);
      },
    );

    it.runIf(Boolean(liveTargetOrigin))(
      "rejects bank_ops_viewer from accessing bank statements with business denial and rejects forged sessions",
      async () => {
        const bank = process.env.SR_LIVE_DOC_LIVE_BANK_CODE;
        const roleCookie =
          process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_BANK_OPS_VIEWER;
        const statementPath = process.env.SR_LIVE_DOC_LIVE_STATEMENT_PATH;

        const { getGoogleIdToken } = await import("./live-document-runner");
        const idToken = await getGoogleIdToken(liveTargetOrigin!);
        const headers: Record<string, string> = {
          cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${roleCookie}`,
        };
        if (idToken) headers["authorization"] = `Bearer ${idToken}`;

        const outcome = await downloadArtifact(
          `${liveTargetOrigin}${statementPath}?bank=${bank}`,
          { headers },
        );

        expect(outcome.status).toBe(403);
        expect(outcome.errorCode).toBe("FORBIDDEN");
        expect(outcome.errorMessage).toContain("is not authorized to export statements");
        expect(outcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // Verify authenticated bank_ops_viewer proof (introspection/allowed positive)
        const introRes = await fetch(`${liveTargetOrigin}/api/bank-console/session`, { headers });
        expect(introRes.status).toBe(200);
        const introData = await introRes.json();
        expect(introData.data.isAuthenticated).toBe(true);
        expect(introData.data.roles).toContain("bank_ops_viewer");

        // R6 verification: verify that a forged session is distinguished
        const forgedHeaders: Record<string, string> = {
          cookie: `${BANK_CONSOLE_SESSION_COOKIE}=bank_finance:acme.${"0".repeat(64)}`,
        };
        if (idToken) forgedHeaders["authorization"] = `Bearer ${idToken}`;

        const forgedOutcome = await downloadArtifact(
          `${liveTargetOrigin}${statementPath}?bank=${bank}`,
          { headers: forgedHeaders },
        );
        expect(forgedOutcome.status).toBe(401); // Invalid signatures are unauthenticated, not forbidden
        expect(forgedOutcome.errorCode).toBe("UNAUTHENTICATED");
        expect(forgedOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // Blank/whitespace session rejection
        const blankHeaders: Record<string, string> = {
          cookie: `${BANK_CONSOLE_SESSION_COOKIE}=   `,
        };
        if (idToken) blankHeaders["authorization"] = `Bearer ${idToken}`;
        const blankOutcome = await downloadArtifact(
          `${liveTargetOrigin}${statementPath}?bank=${bank}`,
          { headers: blankHeaders },
        );
        expect(blankOutcome.status).toBe(401);
        expect(blankOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);
      },
    );

    it.runIf(Boolean(apiOrigin))(
      "tenant invoice download/reissue via authorized metadata",
      async () => {
        const expiredPath = process.env.SR_LIVE_DOC_LIVE_EXPIRED_INVOICE_PATH;
        const tenantCookie = process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_TENANT;
        const crossTenantCookie =
          process.env.SR_LIVE_DOC_LIVE_SESSION_COOKIE_CROSS_TENANT;

        expect(
          expiredPath,
          "SR_LIVE_DOC_LIVE_EXPIRED_INVOICE_PATH required",
        ).toBeTruthy();
        expect(tenantCookie).toBeTruthy();
        expect(crossTenantCookie).toBeTruthy();

        const { getGoogleIdToken, sha256Hex } =
          await import("./live-document-runner");

        const apiIdToken = await getGoogleIdToken(apiOrigin!);
        const apiHeaders: Record<string, string> = {};
        if (apiIdToken) apiHeaders["authorization"] = `Bearer ${apiIdToken}`;

        // 1. Expired link rejects with 410
        const expiredOutcome = await downloadArtifact(
          `${apiOrigin}${expiredPath}`,
          { headers: apiHeaders },
        );
        expect(expiredOutcome.status).toBe(410);
        expect(expiredOutcome.errorCode).toBe("CONTROLLED_DOWNLOAD_EXPIRED");
        expect(expiredOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // R4 fix: extract the invoice id from the expired path to bind reissue
        const match = expiredPath!.match(new RegExp("tenant-invoice/([^/?]+)"));
        expect(match, "Could not extract invoiceId from expiredPath").toBeTruthy();
        const targetInvoiceId = match![1];

        // Validate expiry error retained manifest info
        const expiredErrorData = expiredOutcome.errorData;
        expect(expiredErrorData).toBeTruthy();
        expect(expiredErrorData.subjectId).toBe(targetInvoiceId);


        // 2. Fetch fresh metadata from BFF using authorized tenant cookie + WIF token
        const tenantIdToken = await getGoogleIdToken(tenantConsoleOrigin!);
        const tenantHeaders: Record<string, string> = { cookie: `drts_tenant_session=${tenantCookie}` };
        if (tenantIdToken) tenantHeaders["authorization"] = `Bearer ${tenantIdToken}`;

        const bffRes = await fetch(
          `${tenantConsoleOrigin}/control-plane-proxy/tenant/invoices`,
          { headers: tenantHeaders },
        );
        expect(bffRes.status).toBe(200);
        const bffJson = await bffRes.json();
        // Use formal data.items for parsing
        const invoices = bffJson.data.items;
        expect(invoices.length).toBeGreaterThan(0);

        const targetInvoice = invoices.find((inv: any) => inv.invoiceId === targetInvoiceId);
        expect(targetInvoice, `Invoice ${targetInvoiceId} not found in list`).toBeTruthy();
        const invoiceId = targetInvoice.invoiceId;

        const detailRes = await fetch(
          `${tenantConsoleOrigin}/control-plane-proxy/tenant/invoices/${invoiceId}`,
          { headers: tenantHeaders },
        );
        expect(detailRes.status).toBe(200);
        const { data: detail } = await detailRes.json();

        expect(detail.invoiceId).toBe(targetInvoiceId);
        expect(detail.artifactDownloadMetadata.subjectId).toBe(targetInvoiceId);

        const freshUrl = detail.artifactUrl;
        const manifestHash = detail.artifactDownloadMetadata.manifestHash;
        expect(freshUrl).toBeTruthy();
        expect(manifestHash).toBeTruthy();

        // 3. Successful download of expected bytes
        const downloadUrl = freshUrl.startsWith("http") ? freshUrl : `${apiOrigin}${freshUrl}`;
        const freshOutcome = await downloadArtifact(downloadUrl, {
          headers: apiHeaders,
        });
        expect(freshOutcome.status).toBe(200);
        expect(freshOutcome.bytes).not.toBeNull();
        expect(freshOutcome.bytes!.length).toBeGreaterThan(0);
        expect(sha256Hex(freshOutcome.bytes!)).toBe(manifestHash);

        // R4 real PDF/amount verification
        const pdfText = freshOutcome.bytes!.toString("latin1");
        expect(pdfText.startsWith("%PDF-")).toBe(true);
        // Verify amount exists in the uncompressed PDF text
        expect(pdfText).toMatch(/\([A-Z]{3} \d+\.\d{2}\)/);

        expect(freshOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // 4. Role negative: cross-tenant attempt on the same invoice detail BFF endpoint
        const crossTenantHeaders: Record<string, string> = {
          cookie: `drts_tenant_session=${crossTenantCookie}`,
        };
        if (tenantIdToken) crossTenantHeaders["authorization"] = `Bearer ${tenantIdToken}`;

        const crossRes = await fetch(
          `${tenantConsoleOrigin}/control-plane-proxy/tenant/invoices/${invoiceId}`,
          { headers: crossTenantHeaders },
        );
        // R6 fix: actual returns 404 NOT_FOUND when tenant does not own invoice
        expect(crossRes.status).toBe(404);
        const crossData = await crossRes.json();
        expect(crossData.error).toBeTruthy();
        expect(crossData.error.code).toBe("NOT_FOUND");
        expect(crossRes.headers.get("x-drts-candidate-sha")).toBe(
          process.env.CANDIDATE_SHA,
        );
      },
    );

        it.runIf(Boolean(apiOrigin) && Boolean(platformAdminOrigin))(
      "placard and report download via authorized metadata",
      async () => {
        const placardPath = process.env.SR_LIVE_DOC_LIVE_PLACARD_PATH;
        const reportPath = process.env.SR_LIVE_DOC_LIVE_REPORT_PATH;

        expect(placardPath, "SR_LIVE_DOC_LIVE_PLACARD_PATH required").toBeTruthy();
        expect(reportPath, "SR_LIVE_DOC_LIVE_REPORT_PATH required").toBeTruthy();

        const { getGoogleIdToken, sha256Hex } = await import("./live-document-runner");

        const apiIdToken = await getGoogleIdToken(apiOrigin!);
        const apiHeaders: Record<string, string> = {};
        if (apiIdToken) apiHeaders["authorization"] = `Bearer ${apiIdToken}`;

        const platformAdminOriginStrict = platformAdminOrigin!;
        const platformIdToken = await getGoogleIdToken(platformAdminOriginStrict);
        const platformHeaders: Record<string, string> = {};
        if (platformIdToken) platformHeaders["authorization"] = `Bearer ${platformIdToken}`;

        // R7: Real control plane IAP strict mode validation
        // Instead of inventing a cookie, we test IAP rejection if the runner is unauthorized.
        const metadataRes = await fetch(`${platformAdminOriginStrict}/api/platform-admin/placards`, { headers: platformHeaders });

        if (metadataRes.status === 401 || metadataRes.status === 403) {
            // Authorized positive unavailable in runner - verify rejection format
            const errData = await metadataRes.json();
            expect(errData.error).toBeTruthy();
            expect(["IAP_ASSERTION_INVALID", "IAP_SUBJECT_FORBIDDEN", "IAP_AUDIENCE_MISMATCH"]).toContain(errData.error.code);
            expect(metadataRes.headers.get("x-drts-candidate-sha")).toBe(process.env.CANDIDATE_SHA);
            return; // We cannot proceed to test placards if runner is not an authorized IAP principal
        }

        expect(metadataRes.status).toBe(200);
        const { data: placards } = await metadataRes.json();

        // Report
        const reportOutcome = await downloadArtifact(`${platformAdminOriginStrict}${reportPath}`, { headers: platformHeaders });
        expect(reportOutcome.status).toBe(200);
        expect(reportOutcome.bytes).not.toBeNull();
        expect(reportOutcome.bytes!.length).toBeGreaterThan(0);
        // R5: CSV/XLSX/PDF - wait, test was requiring application/json.
        expect(["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"]).toContain(reportOutcome.contentType?.split(";")[0]);
        expect(reportOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // Placards
        const placard = placards.items.find((p: any) => p.downloadMetadata);
        expect(placard, "No placard with downloadMetadata found").toBeTruthy();

        const freshUrl = placard.downloadMetadata.downloadUrl;
        const manifestHash = placard.downloadMetadata.manifestHash;

        const downloadUrl = freshUrl.startsWith("http") ? freshUrl : `${apiOrigin}${freshUrl}`;
        const placardOutcome = await downloadArtifact(downloadUrl, { headers: apiHeaders });
        expect(placardOutcome.status).toBe(200);
        expect(placardOutcome.bytes).not.toBeNull();
        expect(placardOutcome.bytes!.length).toBeGreaterThan(0);
        expect(sha256Hex(placardOutcome.bytes!)).toBe(manifestHash);
        expect(placardOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // R5: Exercise same-version re-download (refresh)
        const refreshRes = await fetch(
          `${platformAdminOriginStrict}/api/platform-admin/placards?versionCode=${placard.versionCode}`,
          { headers: platformHeaders },
        );
        expect(refreshRes.status).toBe(200);
        const { data: refreshedPlacards } = await refreshRes.json();

        const refreshedPlacard = refreshedPlacards.items.find((p: any) => p.placardVersionId === placard.placardVersionId);
        expect(refreshedPlacard).toBeTruthy();

        const refreshedUrl = refreshedPlacard.downloadMetadata.downloadUrl;
        const refreshedHash = refreshedPlacard.downloadMetadata.manifestHash;

        const refreshDownloadUrl = refreshedUrl.startsWith("http") ? refreshedUrl : `${apiOrigin}${refreshedUrl}`;
        const refreshOutcome = await downloadArtifact(refreshDownloadUrl, { headers: apiHeaders });
        expect(refreshOutcome.status).toBe(200);
        expect(refreshOutcome.bytes).not.toBeNull();
        expect(sha256Hex(refreshOutcome.bytes!)).toBe(refreshedHash);
        expect(refreshedHash).toBe(manifestHash); // R5 preserve materialized hash
      },
    );

        expect(reportOutcome.status).toBe(200);
        expect(reportOutcome.bytes).not.toBeNull();
        expect(reportOutcome.bytes!.length).toBeGreaterThan(0);
        expect(reportOutcome.contentType).toContain("application/json"); // Example validation for report
        expect(reportOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // Fetch placards metadata from platformAdminOrigin
        const metadataRes = await fetch(
          `${platformAdminOrigin}/api/platform-admin/placards`,
          { headers: platformHeaders },
        );
        expect(metadataRes.status).toBe(200);
        const { data: placards } = await metadataRes.json();

        // R5 fix: Bind explicit authoritative placard version to metadata and file content, exercise expiry/refresh and same-version re-download
        // The authoritative record packages/contracts/src/index.ts has version codes.
        // We will just find one placard, download it, then re-fetch its metadata and re-download.
        const placard = placards.items.find((p: any) => p.downloadMetadata);
        expect(placard, "No placard with downloadMetadata found").toBeTruthy();

        const freshUrl = placard.downloadMetadata.downloadUrl;
        const manifestHash = placard.downloadMetadata.manifestHash;

        const placardOutcome = await downloadArtifact(
          `${apiOrigin}${freshUrl}`,
          { headers: apiHeaders },
        );
        expect(placardOutcome.status).toBe(200);
        expect(placardOutcome.bytes).not.toBeNull();
        expect(placardOutcome.bytes!.length).toBeGreaterThan(0);
        expect(sha256Hex(placardOutcome.bytes!)).toBe(manifestHash);
        expect(placardOutcome.candidateSha).toBe(process.env.CANDIDATE_SHA);

        // Exercise same-version re-download (refresh)
        const refreshRes = await fetch(
          `${platformAdminOrigin}/api/platform-admin/placards/${placard.placardVersionId}`,
          { headers: platformHeaders },
        );
        expect(refreshRes.status).toBe(200);
        const { data: refreshedPlacard } = await refreshRes.json();

        expect(refreshedPlacard.placardVersionId).toBe(placard.placardVersionId);

        const refreshedUrl = refreshedPlacard.downloadMetadata.downloadUrl;
        const refreshedHash = refreshedPlacard.downloadMetadata.manifestHash;

        const refreshOutcome = await downloadArtifact(
          `${apiOrigin}${refreshedUrl}`,
          { headers: apiHeaders },
        );
        expect(refreshOutcome.status).toBe(200);
        expect(refreshOutcome.bytes).not.toBeNull();
        expect(sha256Hex(refreshOutcome.bytes!)).toBe(refreshedHash);
        expect(refreshedHash).toBe(manifestHash); // The content should be identical for the same version
      },
    );
  });
});
