import { test, expect } from "@playwright/test";
import { observeMailbox, type MailboxProbe } from "../sr-live-mail-001/mailbox-observer";
import fs from "node:fs";
import path from "node:path";

const INVOICE_PROBE = {
  flow: "invoice",
  subject: "DRTS monthly invoice",
  required_text: [
    "Your monthly invoice is available in the Tenant Console.",
    "Sign in with your authorized tenant finance account to view and download it"
  ],
} as unknown as MailboxProbe;

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
  test.afterAll(() => {
    // If the test passed without pushing errors, and we haven't failed yet
    if (evidenceData.errors.length === 0 && evidenceData.httpCalls.length > 0) {
      evidenceData.status = "passed";
      evidenceData.exitCode = 0;
    }
    const artifactsDir = path.resolve(".artifacts", "live-invoice-mail-acceptance");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "evidence-mail.json"), JSON.stringify(evidenceData, null, 2));
  });

  test("genuine invoice mail provider inbox and download", async ({ request, context }) => {
    const apiOrigin = process.env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN;
    const candidateSha = process.env.DRTS_CANDIDATE_SHA;
    const sessionToken = process.env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN;
    const tenantId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID;
    
    if (!apiOrigin || !candidateSha || !sessionToken || !tenantId) {
      evidenceData.errors.push("Missing required environment variables for live invoice mail test.");
      throw new Error("Missing required environment variables");
    }

    // Since this is a test, we require an invoice ID to be tested
    const invoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID;
    if (!invoiceId) {
      // We block here, stating we need a test fixture / invoice authority
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

    // Verify Idempotency
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

    // Block: We need the mailbox observer to support the "invoice" flow.
    // When executing this, mailbox observer will fail with "Unauthorized alias" since it only accepts "invite" and "approve".
    try {
      const evidence = await observeMailbox(
        { apiOrigin, candidateSha, tenantId, actorId: "", stepUpActionId: "", gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "" },
        deliveryId,
        INVOICE_PROBE
      );
      expect(evidence.matched_content).toBe(true);
      expect(evidence.delivery_id).toBe(deliveryId);
    } catch (e) {
      evidenceData.errors.push("Mailbox observation blocked by missing invoice flow in observer script.");
      throw e;
    }

    // Verify download using browser
    await context.addCookies([{
      name: "tenant_session",
      value: sessionToken,
      url: apiOrigin,
      httpOnly: true,
      secure: true,
    }]);

    const page = await context.newPage();
    evidenceData.httpCalls.push({ method: "GET", path: `/invoices?invoiceId=${invoiceId}` });
    const invoiceUrl = `${apiOrigin}/invoices?invoiceId=${invoiceId}`;
    await page.goto(invoiceUrl);
    
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(invoiceId);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
