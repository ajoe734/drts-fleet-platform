import { test, expect } from "@playwright/test";
import { observeMailbox, type MailboxProbe } from "./invoice-mailbox-adapter";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const INVOICE_PROBE: MailboxProbe = {
  flow: "invoice",
  subject: "DRTS monthly invoice",
  required_text: [
    "Your monthly invoice is available in the Tenant Console.",
    "Sign in with your authorized tenant finance account to view and download it"
  ],
};

let evidenceData = {
  status: "failed",
  candidateSha: process.env.DRTS_CANDIDATE_SHA || "",
  headSha: process.env.DRTS_CANDIDATE_SHA || "",
  exitCode: 1,
  unimplementedLiveSurfaces: [] as string[],
  errors: [] as string[],
  httpCalls: [] as any[],
  trackedResources: [] as any[],
};

test.describe("Live Invoice Mail Acceptance", () => {
  test.afterEach(({}, testInfo) => {
    if (testInfo.status !== "passed") {
      evidenceData.errors.push(`Test failed: ${testInfo.error?.message || "Unknown error"}`);
    }
  });

  test.afterAll(() => {
    if (evidenceData.errors.length === 0 && evidenceData.httpCalls.length > 0) {
      evidenceData.status = "passed";
      evidenceData.exitCode = 0;
    }
    const artifactsDir = path.resolve(".artifacts", "live-invoice-mail-acceptance");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "evidence-mail.json"), JSON.stringify(evidenceData, null, 2));
  });

  test("genuine invoice mail provider inbox and download", async ({ request }) => {
    const apiOrigin = process.env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN;
    const candidateSha = process.env.DRTS_CANDIDATE_SHA;
    const sessionToken = process.env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN;
    const tenantId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID;
    
    if (!apiOrigin || !candidateSha || !sessionToken || !tenantId) {
      evidenceData.errors.push("Missing required environment variables for live invoice mail test.");
      throw new Error("Missing required environment variables");
    }

    const invoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID;
    if (!invoiceId) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push("Missing DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID for testing.");
      throw new Error("Missing invoice ID fixture");
    }

    const idempotencyKey = "test-live-invoice-" + Date.now();
    evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail` });
    
    const sendResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "x-tenant-id": tenantId,
        "idempotency-key": idempotencyKey,
      },
    });

    expect(sendResponse.status()).toBe(200);
    const sendResult = await sendResponse.json();
    const deliveryId = sendResult.data?.deliveryId;
    expect(deliveryId).toBeTruthy();

    evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, idempotency: true });
    const retryResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "x-tenant-id": tenantId,
        "idempotency-key": idempotencyKey,
      },
    });
    expect(retryResponse.status()).toBe(200);
    const retryResult = await retryResponse.json();
    expect(retryResult.data.deliveryId).toBe(deliveryId);
    
    evidenceData.trackedResources.push({ type: "delivery", id: deliveryId });

    try {
      const evidence = await observeMailbox(
        { apiOrigin, candidateSha, tenantId, actorId: "", stepUpActionId: "", gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "" },
        deliveryId,
        INVOICE_PROBE
      );
      expect(evidence.matched_content).toBe(true);
      expect(evidence.delivery_id).toBe(deliveryId);
    } catch (e: any) {
      evidenceData.errors.push(`Mailbox observation failed: ${e?.message}`);
      throw e;
    }

    evidenceData.httpCalls.push({ method: "GET", path: `/api/tenant/invoices/${invoiceId}` });
    const invoiceResponse = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}`, {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "x-tenant-id": tenantId,
      },
    });
    
    expect(invoiceResponse.status()).toBe(200);
    const invoiceData = await invoiceResponse.json();
    const artifactUrl = invoiceData.data?.artifactUrl;
    expect(artifactUrl).toBeTruthy();
    
    const manifestHash = invoiceData.data?.artifactDownloadMetadata?.manifestHash;
    expect(manifestHash).toBeTruthy();

    evidenceData.httpCalls.push({ method: "GET", path: "artifactUrl" });
    const downloadResponse = await request.get(artifactUrl);
    expect(downloadResponse.status()).toBe(200);
    
    const contentType = downloadResponse.headers()['content-type'];
    expect(contentType).toMatch(/application\/pdf/);

    const bodyBuffer = await downloadResponse.body();
    const downloadedHash = crypto.createHash('sha256').update(bodyBuffer).digest('hex');
    expect(downloadedHash).toBe(manifestHash);
  });
});
