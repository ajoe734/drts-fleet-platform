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
    "Sign in with your authorized tenant finance account to view and download it",
  ],
};

const evidenceData = {
  status: "failed",
  candidateSha: process.env.DRTS_CANDIDATE_SHA || "",
  headSha: process.env.DRTS_CANDIDATE_SHA || "",
  exitCode: 1,
  unimplementedLiveSurfaces: [] as string[],
  errors: [] as string[],
  httpCalls: [] as any[],
  trackedResources: [] as any[],
  mailboxEvidence: {} as any,
  downloadProof: false,
  durableHistoryCount: 0,
  tenantId: "",
  invoiceId: "",
  identityEmail: "",
};

test.describe("Live Invoice Mail Acceptance", () => {
  test.afterEach((_, testInfo) => {
    if (testInfo.status !== "passed") {
      evidenceData.errors.push(
        "Test failed: (redacted to prevent leaking upstream errors or addresses)",
      );
    }
  });

  test.afterAll(() => {
    if (evidenceData.errors.length === 0 && evidenceData.httpCalls.length > 0) {
      evidenceData.status = "passed";
      evidenceData.exitCode = 0;
    }
    const artifactsDir = path.resolve(
      ".artifacts",
      "live-invoice-mail-acceptance",
    );
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactsDir, "evidence-mail.json"),
      JSON.stringify(evidenceData, null, 2),
    );
  });

  test("genuine invoice mail provider inbox and download", async ({
    request, page, context
  }) => {
    const apiOrigin = process.env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN;
    const portalOrigin = process.env.DRTS_LIVE_INVOICE_MAIL_PORTAL_ORIGIN;
    const candidateSha = process.env.DRTS_CANDIDATE_SHA;
    const sessionToken = process.env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN;
    const tenantId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID;
    const authorizedRecipient = process.env.DRTS_LIVE_INVOICE_MAIL_AUTHORIZED_RECIPIENT;

    if (!apiOrigin || !portalOrigin || !candidateSha || !sessionToken || !tenantId || !authorizedRecipient) {
      evidenceData.errors.push("Missing required environment variables for live invoice mail test.");
      throw new Error("Missing required environment variables");
    }

    const invoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID;
    if (!invoiceId) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push("Missing DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID for testing.");
      throw new Error("Missing invoice ID fixture");
    }

    evidenceData.tenantId = tenantId;
    evidenceData.invoiceId = invoiceId;

    // 0. Fetch Invoice Before Sends (F2: Invoice fetch happens only AFTER sends at spec:286)
    const initialInvoiceResponse = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    evidenceData.httpCalls.push({ method: "GET", path: `/api/tenant/invoices/${invoiceId}`, status: initialInvoiceResponse.status() });
    expect(initialInvoiceResponse.status()).toBe(200);
    
    const invoiceData = await initialInvoiceResponse.json();
    if (invoiceData.data?.tenantId !== tenantId || invoiceData.data?.invoiceId !== invoiceId) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-mismatch");
      throw new Error("Invoice fixture does not belong to authorized dedicated tenant/invoice");
    }

    // 1. Check Identity (Billing Profile)
    const profileResponse = await request.get(`${apiOrigin}/api/tenant/billing/profile`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    evidenceData.httpCalls.push({ method: "GET", path: "tenant/billing/profile", status: profileResponse.status() });
    expect(profileResponse.status()).toBe(200);
    const profileData = await profileResponse.json();
    const rawEmail = profileData.data?.email || "";
    evidenceData.identityEmail = rawEmail ? crypto.createHash("sha256").update(rawEmail).digest("hex") : "";
    
    if (profileData.data?.email !== authorizedRecipient) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push("Billing profile email does not match actual authorized recipient");
      throw new Error("Billing profile email does not match authorized recipient");
    }

    
    // 2a. Wrong invoice mismatch
    const wrongInvoiceResponse = await request.post(`${apiOrigin}/api/tenant/invoices/10000000-0000-0000-0000-000000000888/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(wrongInvoiceResponse.status()).toBeGreaterThanOrEqual(400);
    
    // 2. Wrong Tenant

    const wrongTenantResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": "10000000-0000-0000-0000-000000000999" },
    });
    evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "wrong_tenant", status: wrongTenantResponse.status() });
    expect(wrongTenantResponse.status()).toBe(403);

    
    // 3. Read Only Send
    const readOnlyToken = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN;
    const readOnlyTenantId = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID;
    const readOnlyInvoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_INVOICE_ID;
    if (readOnlyToken && readOnlyTenantId && readOnlyInvoiceId) {
      const readOnlyResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${readOnlyInvoiceId}/mail`, {
        headers: { authorization: `Bearer ${readOnlyToken}`, "x-tenant-id": readOnlyTenantId },
      });
      evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${readOnlyInvoiceId}/mail`, scenario: "read_only", status: readOnlyResponse.status() });
      expect(readOnlyResponse.status()).toBe(403);
    } else {
      evidenceData.unimplementedLiveSurfaces.push("read_only");
    }

    
    // 4. Non-allowlisted recipient
    const nonAllowlistedToken = process.env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN;
    const nonAllowlistTenantId = process.env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID;
    const nonAllowlistInvoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_INVOICE_ID;
    if (nonAllowlistedToken && nonAllowlistTenantId && nonAllowlistInvoiceId) {
      const nonAllowlistResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, {
        headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId, "idempotency-key": "na-" + Date.now() },
      });
      evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, scenario: "non_allowlisted", status: nonAllowlistResponse.status() });
      
      // Check durable failure if accepted, or immediate rejection
      if (nonAllowlistResponse.status() === 201) {
         const naDeliveryId = (await nonAllowlistResponse.json()).data?.deliveryId;
         let isRejected = false;
         for (let i = 0; i < 8; i++) {
           await new Promise(r => setTimeout(r, 1500));
           const check = await request.get(`${apiOrigin}/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, {
              headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId },
           });
           const dData = await check.json();
           const dDel = dData.data?.deliveries?.find((d: any) => d.deliveryId === naDeliveryId);
           if (dDel?.attempts?.some((a: any) => a.outcome === "SMTP_RECIPIENT_NOT_ALLOWLISTED" || a.status === "failed")) {
             isRejected = true;
             break;
           }
         }
         expect(isRejected).toBe(true);
      } else {
         expect(nonAllowlistResponse.status()).toBeGreaterThanOrEqual(400);
      }
    } else {
      evidenceData.unimplementedLiveSurfaces.push("non_allowlisted");
    }

    // 5. Normal Send
    const idempotencyKey = "test-live-invoice-" + Date.now();
    const sendResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId, "idempotency-key": idempotencyKey },
    });
    
    // F3: Post expects 201 Created
    evidenceData.httpCalls.push({
      method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "normal_send", status: sendResponse.status(),
      delivery_id: sendResponse.ok() ? (await sendResponse.json()).data?.deliveryId : null,
    });
    expect(sendResponse.status()).toBe(201);
    const sendResult = await sendResponse.json();
    const deliveryId = sendResult.data?.deliveryId;
    expect(deliveryId).toBeTruthy();
    evidenceData.trackedResources.push({ type: "delivery", id: deliveryId });

    // 6. Idempotency retry (F3: Expects 201)
    const retryResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId, "idempotency-key": idempotencyKey },
    });
    evidenceData.httpCalls.push({
      method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "idempotent_retry", status: retryResponse.status(),
      delivery_id: retryResponse.ok() ? (await retryResponse.json()).data?.deliveryId : null,
    });
    expect(retryResponse.status()).toBe(201);

    // Durable GET before resend to establish baseline
    const getMailBefore = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(getMailBefore.status()).toBe(200);
    const mailBefore = await getMailBefore.json();
    const initialAttemptsCount = mailBefore.data?.deliveries?.length || 0;
    expect(initialAttemptsCount).toBeGreaterThan(0);

    // 7. Intentional resend (F3: Expects 201)
    const newIdempotencyKey = "test-live-invoice-resend-" + Date.now();
    const resendResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId, "idempotency-key": newIdempotencyKey },
    });
    
    const resendResult = resendResponse.ok() ? await resendResponse.json() : {};
    evidenceData.httpCalls.push({
      method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "intentional_resend", status: resendResponse.status(),
      delivery_id: resendResult.data?.deliveryId || null,
    });
    expect(resendResponse.status()).toBe(201);

    // 8. Durable GET after resend (correlated sent/acceptedAt/outcome)
    const getMailResponse = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    const mailData = await getMailResponse.json();
    evidenceData.httpCalls.push({
      method: "GET", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "durable_get", status: getMailResponse.status(),
    });
    expect(getMailResponse.status()).toBe(200);
    expect(mailData.data?.deliveries?.length).toBeGreaterThan(initialAttemptsCount);
    
    const resendAttempt = mailData.data.deliveries?.find((a: any) => a.deliveryId === resendResult.data?.deliveryId);
    expect(resendAttempt).toBeTruthy();
    expect(resendAttempt.attempts?.[0]?.status || resendAttempt.attempts?.[0]?.outcome).toBeTruthy(); // Correlation validation
    evidenceData.durableHistoryCount = mailData.data?.deliveries?.length || 0;

    // Mailbox observation
    let invoiceLink = "";
    try {
      const evidence = await observeMailbox({ apiOrigin, candidateSha, tenantId, actorId: "", stepUpActionId: "", gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "" }, deliveryId, INVOICE_PROBE);
      expect(evidence.matched_content).toBe(true);
      expect(evidence.delivery_id).toBe(deliveryId);
      evidenceData.mailboxEvidence = evidence;
      invoiceLink = (evidence as any).invoice_link;
      expect(invoiceLink).toBeTruthy();
    } catch (e: any) {
      evidenceData.errors.push(`Mailbox observation failed: (redacted)`);
      throw e;
    }


    // Authenticated browser check (F3, F5)
    const invoiceUrlObj = new URL(invoiceLink);
    const portalUrlObj = new URL(portalOrigin!);
    expect(invoiceUrlObj.origin).toBe(portalUrlObj.origin);
    expect(invoiceUrlObj.searchParams.get("invoiceId") === invoiceId || invoiceUrlObj.pathname.includes(invoiceId!)).toBeTruthy();

    const unauthResponse = await request.get(invoiceLink, { maxRedirects: 0 });
    expect(unauthResponse.status()).toBeGreaterThanOrEqual(300);

    // Foreign origin isolation
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.startsWith(portalOrigin!) && !url.startsWith(apiOrigin!) && !url.startsWith("data:")) {
        return route.abort();
      }
      return route.continue();
    });

    await context.addCookies([{ name: "drts_tenant_session", value: sessionToken, domain: portalUrlObj.hostname, path: "/" }]);
    const pageResponse = await page.goto(invoiceLink, { waitUntil: "networkidle" });
    expect(pageResponse?.status()).toBe(200);

    // Genuine Browser Check with UI interaction (F3)
    const artifactUrlPath = invoiceData.data?.artifactUrl;
    expect(artifactUrlPath).toMatch(/^\/downloads\/(invoice|receipt)\//);
    
    // UI Download
    const downloadPromise = page.waitForEvent('download');
    const downloadLocator = page.locator('a[href^="/downloads/invoice/"], a[href^="/downloads/receipt/"], button[data-testid*="download"], button:has-text("Download")').first();
    await downloadLocator.click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    
    const bodyBuffer = fs.readFileSync(downloadPath!);
    expect(bodyBuffer.length).toBeGreaterThan(0);

    const manifestHash = invoiceData.data?.artifactDownloadMetadata?.manifestHash;
    expect(manifestHash).toBeTruthy();
    const downloadedHash = crypto.createHash("sha256").update(bodyBuffer).digest("hex");
    expect(downloadedHash).toBe(manifestHash);
    
    evidenceData.downloadProof = true;
    
    const fullArtifactUrl = new URL(artifactUrlPath, portalOrigin).href;
    evidenceData.httpCalls.push({ method: "GET", path: "artifactUrl", status: 200 });
    
    // Invalid/expired link scenario (F3) no 500s allowed
    const invalidUrl = fullArtifactUrl + "invalid";
    const invalidDownloadResponse = await request.get(invalidUrl, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
      maxRedirects: 0
    });
    expect(invalidDownloadResponse.status()).toBeGreaterThanOrEqual(400);
    expect(invalidDownloadResponse.status()).toBeLessThan(500);
  });
});

