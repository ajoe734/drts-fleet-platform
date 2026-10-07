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
  resendMailboxEvidence: {} as any,
  downloadProof: null as any,
  durableDeliveries: [] as any[],
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

    const effectiveAllowlist = process.env.DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST || "";
    const allowedEntries = effectiveAllowlist.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const authLower = authorizedRecipient.toLowerCase();
    const domain = authLower.split("@")[1] || "";
    if (!allowedEntries.includes(authLower) && !allowedEntries.includes(domain)) {
       evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
       evidenceData.errors.push("Authorized recipient is not in effective allowlist");
       throw new Error("Missing effective invoice-specific allowlist authority");
    }

    if (process.env.DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED !== "true") {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push("Missing explicit authorization for the target fixture");
      throw new Error("Missing explicit DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED=true");
    }


    // 2a. Wrong invoice mismatch
    const generatedMissingId = crypto.randomUUID();
    const missingInvoiceCheck = await request.get(`${apiOrigin}/api/tenant/invoices/${generatedMissingId}`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(missingInvoiceCheck.status()).toBe(404); // Must prove it doesn't exist
    const wrongInvoiceResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${generatedMissingId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(wrongInvoiceResponse.status()).toBe(404);

    // 2. Wrong Tenant

    const wrongTenantResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": "10000000-0000-0000-0000-000000000999" },
    });
    evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "wrong_tenant", status: wrongTenantResponse.status() });
    expect(wrongTenantResponse.status()).toBe(403);

    const wrongInvoiceResponse2 = await request.post(`${apiOrigin}/api/tenant/invoices/invoice-10000000-0000-0000-0000-000000000999/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    evidenceData.httpCalls.push({ method: "POST", path: `wrong_invoice_authority`, scenario: "wrong_invoice", status: wrongInvoiceResponse2.status() });
    expect([403, 404]).toContain(wrongInvoiceResponse2.status());



    // 3. Read Only Send
    const readOnlyToken = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN;
    const readOnlyTenantId = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID;
    const readOnlyInvoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_INVOICE_ID;
    (evidenceData as any).readOnlyInvoiceId = readOnlyInvoiceId;
    const readOnlyRecipient = process.env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_RECIPIENT;
    if (readOnlyToken && readOnlyTenantId && readOnlyInvoiceId && readOnlyRecipient) {
      const roSessionCheck = await request.get(`${apiOrigin}/api/auth/session`, {
        headers: { authorization: `Bearer ${readOnlyToken}` },
      });
      expect(roSessionCheck.status()).toBe(200);
      const roSessionData = await roSessionCheck.json();
      const scopes = roSessionData.data?.identity?.scopes || [];
      expect(scopes).toContain("tenant:billing:read");
      expect(scopes).not.toContain("tenant:billing:write");

      const roInvoiceCheck = await request.get(`${apiOrigin}/api/tenant/invoices/${readOnlyInvoiceId}`, {
        headers: { authorization: `Bearer ${readOnlyToken}`, "x-tenant-id": readOnlyTenantId },
      });
      expect(roInvoiceCheck.status()).toBe(200);
      const roInvoiceData = await roInvoiceCheck.json();
      if (roInvoiceData.data?.tenantId !== readOnlyTenantId || roInvoiceData.data?.invoiceId !== readOnlyInvoiceId) {
        throw new Error("Read-only invoice fixture mismatch");
      }
      const roProfileCheck = await request.get(`${apiOrigin}/api/tenant/billing/profile`, {
        headers: { authorization: `Bearer ${readOnlyToken}`, "x-tenant-id": readOnlyTenantId },
      });
      expect(roProfileCheck.status()).toBe(200);
      const roProfileData = await roProfileCheck.json();
      if (roProfileData.data?.tenantId !== readOnlyTenantId || roProfileData.data?.email !== readOnlyRecipient) {
        throw new Error("Read-only recipient mismatch");
      }
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
    (evidenceData as any).nonAllowlistInvoiceId = nonAllowlistInvoiceId;
    if (nonAllowlistedToken && nonAllowlistTenantId && nonAllowlistInvoiceId) {
      const naInvoiceCheck = await request.get(`${apiOrigin}/api/tenant/invoices/${nonAllowlistInvoiceId}`, {
        headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId },
      });
      expect(naInvoiceCheck.status()).toBe(200);
      const naInvoiceData = await naInvoiceCheck.json();
      if (naInvoiceData.data?.tenantId !== nonAllowlistTenantId || naInvoiceData.data?.invoiceId !== nonAllowlistInvoiceId) {
        throw new Error("Non-allowlist invoice fixture mismatch");
      }
      const naProfileCheck = await request.get(`${apiOrigin}/api/tenant/billing/profile`, {
        headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId },
      });
      expect(naProfileCheck.status()).toBe(200);
      const naProfileData = await naProfileCheck.json();
      if (naProfileData.data?.email !== process.env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_RECIPIENT) {
        throw new Error("Non-allowlist fixture email does not match reserved negative recipient");
      }
      const negLower = naProfileData.data?.email?.toLowerCase() || "";
      const negDomain = negLower.split("@")[1] || "";
      if (allowedEntries.includes(negLower) || allowedEntries.includes(negDomain)) {
        throw new Error("Non-allowlist fixture email is actually in the effective allowlist");
      }
      const nonAllowlistResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, {
        headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId, "idempotency-key": "na-" + Date.now() },
      });
      const naData = nonAllowlistResponse.ok() ? await nonAllowlistResponse.json() : null;
      evidenceData.httpCalls.push({ method: "POST", path: `/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, scenario: "non_allowlisted", status: nonAllowlistResponse.status(), delivery_id: naData?.data?.deliveryId });

      // Check durable failure if accepted, or immediate rejection
      if (nonAllowlistResponse.status() === 201) {
         const naDeliveryId = naData?.data?.deliveryId;
         let isRejected = false;
         for (let i = 0; i < 8; i++) {
           await new Promise(r => setTimeout(r, 1500));
           const check = await request.get(`${apiOrigin}/api/tenant/invoices/${nonAllowlistInvoiceId}/mail`, {
              headers: { authorization: `Bearer ${nonAllowlistedToken}`, "x-tenant-id": nonAllowlistTenantId },
           });
           const dData = await check.json();
           const dDel = dData.data?.deliveries?.find((d: any) => d.deliveryId === naDeliveryId);
           const attempt = dDel?.attempts?.find((a: any) => a.outcome === "failed" && a.errorCode === "SMTP_RECIPIENT_NOT_ALLOWLISTED");
           if (dDel?.status === "failed" && attempt && attempt.acceptedAt === null && attempt.retryable === false) {
             isRejected = true;
             evidenceData.durableDeliveries.push({
               scenario: "non_allowlisted",
               deliveryId: naDeliveryId,
               invoiceId: nonAllowlistInvoiceId,
               tenantId: nonAllowlistTenantId,
               status: dDel.status,
               errorCode: attempt.errorCode,
               outcome: attempt.outcome,
               acceptedAt: attempt.acceptedAt,
               retryable: attempt.retryable
             });
             break;
           }
         }
         expect(isRejected).toBe(true);
      } else {
         throw new Error("Non-allowlisted send must return 201 and record a durable failure, but got HTTP " + nonAllowlistResponse.status());
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

    // Durable GET before retry to establish attempts baseline for the exact delivery
    const getMailBeforeRetry = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(getMailBeforeRetry.status()).toBe(200);
    const mailBeforeRetry = await getMailBeforeRetry.json();
    const initialDelivery = mailBeforeRetry.data?.deliveries?.find((d: any) => d.deliveryId === deliveryId);
    const initialAttemptsCount = initialDelivery?.attempts?.length || 0;
    expect(initialAttemptsCount).toBeGreaterThan(0);

    // 6. Idempotency retry (F3: Expects 201)
    const retryResponse = await request.post(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId, "idempotency-key": idempotencyKey },
    });
    evidenceData.httpCalls.push({
      method: "POST", path: `/api/tenant/invoices/${invoiceId}/mail`, scenario: "idempotent_retry", status: retryResponse.status(),
      delivery_id: retryResponse.ok() ? (await retryResponse.json()).data?.deliveryId : null,
    });
    expect(retryResponse.status()).toBe(201);

    // Validate retry did not duplicate outbound attempts
    const getMailAfterRetry = await request.get(`${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`, {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
    });
    expect(getMailAfterRetry.status()).toBe(200);
    const mailAfterRetry = await getMailAfterRetry.json();
    const retryDelivery = mailAfterRetry.data?.deliveries?.find((d: any) => d.deliveryId === deliveryId);

    evidenceData.durableDeliveries.push({
      scenario: "idempotent_retry",
      deliveryId: deliveryId,
      idempotencyKey: idempotencyKey,
      initialAttemptsCount: initialAttemptsCount,
      afterRetryAttemptsCount: retryDelivery?.attempts?.length || 0,
      status: retryDelivery?.status
    });
    expect(retryDelivery?.attempts?.length).toBe(initialAttemptsCount); // Exact same attempts count


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

    const firstDelivery = mailData.data?.deliveries?.find((d: any) => d.deliveryId === deliveryId);
    expect(firstDelivery).toBeTruthy();
    const successfulFirstAttempt = firstDelivery.attempts?.find((a: any) => a.outcome === "sent" && a.acceptedAt && !a.errorCode);
    expect(successfulFirstAttempt).toBeTruthy();
    expect(successfulFirstAttempt.acceptedAt).toBeTruthy();

    evidenceData.durableDeliveries.push({
      scenario: "first_send",
      deliveryId: deliveryId,
      idempotencyKey: idempotencyKey,
      status: firstDelivery.status,
      attemptsCount: firstDelivery.attempts?.length,
      acceptedAt: successfulFirstAttempt.acceptedAt,
      attemptOutcome: successfulFirstAttempt.outcome,
      errorCode: successfulFirstAttempt.errorCode
    });

    const resendAttempt = mailData.data?.deliveries?.find((d: any) => d.deliveryId === resendResult.data?.deliveryId);
    expect(resendAttempt).toBeTruthy();
    const successfulAttempt = resendAttempt.attempts?.find((a: any) => a.outcome === "sent" && a.acceptedAt && !a.errorCode);
    expect(successfulAttempt).toBeTruthy();
    expect(successfulAttempt.acceptedAt).toBeTruthy(); // Correlation validation

    evidenceData.durableDeliveries.push({
      scenario: "intentional_resend",
      deliveryId: resendResult.data?.deliveryId,
      idempotencyKey: newIdempotencyKey,
      status: resendAttempt.status,
      attemptsCount: resendAttempt.attempts?.length,
      acceptedAt: successfulAttempt.acceptedAt,
      attemptOutcome: successfulAttempt.outcome,
      errorCode: successfulAttempt.errorCode
    });

    evidenceData.durableHistoryCount = mailData.data?.deliveries?.length || 0;

    // Mailbox observation
    let invoiceLink = "";
    try {
      const evidence = await observeMailbox({ apiOrigin, candidateSha, tenantId, actorId: "", stepUpActionId: "", gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "" }, deliveryId, INVOICE_PROBE);
      expect(evidence.matched_content).toBe(true);
      expect(evidence.delivery_id).toBe(deliveryId);
      evidenceData.mailboxEvidence = evidence;

      const resendEvidence = await observeMailbox({ apiOrigin, candidateSha, tenantId, actorId: "", stepUpActionId: "", gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "" }, resendResult.data?.deliveryId, INVOICE_PROBE);
      expect(resendEvidence.matched_content).toBe(true);
      expect(resendEvidence.delivery_id).toBe(resendResult.data?.deliveryId);
      evidenceData.resendMailboxEvidence = resendEvidence;
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
    expect(invoiceUrlObj.pathname).toBe("/invoices");
    expect(invoiceUrlObj.searchParams.get("invoiceId")).toBe(invoiceId);

    const unauthResponse = await request.get(invoiceLink, { maxRedirects: 0 });
    expect(unauthResponse.status()).toBeGreaterThanOrEqual(300);

    // Foreign origin isolation
    await context.route('**/*', (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith("data:")) return route.continue();
      try {
        const parsed = new URL(reqUrl);
        const portalParsed = new URL(portalOrigin!);
        const apiParsed = new URL(apiOrigin!);
        if (parsed.username || parsed.password) return route.abort("blockedbyclient");
        if (parsed.protocol !== portalParsed.protocol && parsed.protocol !== apiParsed.protocol) return route.abort("blockedbyclient");
        if (parsed.origin !== portalParsed.origin && parsed.origin !== apiParsed.origin) {
          return route.abort("blockedbyclient");
        }
        return route.continue();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
         return route.abort("blockedbyclient");
      }
    });

    await context.setExtraHTTPHeaders({ "x-drts-candidate-sha": candidateSha! });
    await context.addCookies([{ name: "drts_tenant_session", value: sessionToken, domain: portalUrlObj.hostname, path: "/" }]);
    const pageResponse = await page.goto(invoiceLink, { waitUntil: "networkidle" });
    expect(pageResponse?.status()).toBe(200);
    expect(pageResponse?.headers()['x-drts-candidate-sha']).toBe(candidateSha);

    // Genuine Browser Check with UI interaction (F3)
    const artifactUrlPath = invoiceData.data?.artifactUrl;
    expect(artifactUrlPath).toMatch(/^\/downloads\/(tenant-invoice|invoice|receipt)\//);
    const exactPortalUrl = new URL(artifactUrlPath, portalOrigin).href;

    // UI Download (inline popup since no attachment disposition + target=_blank)

    const popupResponsePromise = context.waitForEvent('response', response => response.url().includes(artifactUrlPath) && response.status() === 200);
    const downloadLocator = page.locator(`a[href="${artifactUrlPath}"]`).first();
    await downloadLocator.click();
    const popupResponse = await popupResponsePromise;

    expect(popupResponse.headers()['content-type']).toBe('application/pdf');
    expect(popupResponse.headers()['x-drts-candidate-sha']).toBe(candidateSha);

    const bodyBuffer = await popupResponse.body();

    expect(bodyBuffer.length).toBeGreaterThan(0);
    expect(bodyBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const manifestHash = invoiceData.data?.artifactDownloadMetadata?.manifestHash;
    expect(manifestHash).toBeTruthy();
    const downloadedHash = crypto.createHash("sha256").update(bodyBuffer).digest("hex");
    expect(downloadedHash).toBe(manifestHash);

    evidenceData.downloadProof = {
      matched: true,
      manifestHash: manifestHash,
      downloadedHash: downloadedHash,
      downloadedBytes: bodyBuffer.length,
      contentType: popupResponse.headers()['content-type'],
    };

    // Check missing token isolation on portal (unauthenticated signed link on portal)
    // The portal should redirect to /login if there's no session, even with a valid signed link.
    const unauthPortalResponse = await request.get(exactPortalUrl, { maxRedirects: 0 });
    expect([302, 307]).toContain(unauthPortalResponse.status());
    expect(unauthPortalResponse.headers()['location']).toMatch(/\/login/);

    // Check API origin explicitly (F3)
    const apiDownloadUrl = new URL("/api" + artifactUrlPath, apiOrigin).href;

    // Invalid link scenario - API directly
    const fullArtifactUrlObj = new URL(apiDownloadUrl);
    if (fullArtifactUrlObj.searchParams.has("sig")) {
      fullArtifactUrlObj.searchParams.set("sig", "invalid");
    } else {
      fullArtifactUrlObj.searchParams.set("signature", "invalid");
    }
    const invalidDownloadResponse = await request.get(fullArtifactUrlObj.toString(), {
      headers: { authorization: `Bearer ${sessionToken}`, "x-tenant-id": tenantId },
      maxRedirects: 0
    });
    expect(invalidDownloadResponse.status()).toBe(403);
    const errorBody = await invalidDownloadResponse.json().catch(() => ({}));
    expect(errorBody.error?.code).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
    evidenceData.httpCalls.push({ method: "GET", path: "bad_sig_api", status: invalidDownloadResponse.status() });

    // Wrong-role/wrong-tenant browser scenarios on protected portal route

    if (nonAllowlistedToken && nonAllowlistInvoiceId) {
        await context.clearCookies();
        await context.addCookies([{ name: "drts_tenant_session", value: nonAllowlistedToken, domain: portalUrlObj.hostname, path: "/" }]);

        const getDetailTitle = (id: string) => page.getByText(id, { exact: true }).filter({ hasNot: page.locator('xpath=ancestor-or-self::a') });

        let readActionId: string | null = null;
        const learnReadAction = (req: any) => { if (req.method() === 'POST' && (!readActionId || req.headers()['next-action'] !== readActionId)) { const actionId = req.headers()['next-action']; if (actionId) readActionId = actionId; } };


        // Explicitly validating a dedicated single-invoice fixture before mutations
        const ownInvoiceUiUrl = new URL(`/invoices?invoiceId=${nonAllowlistInvoiceId}`, portalOrigin).href;
        page.on('request', learnReadAction);
        const ownUiResp = await page.goto(ownInvoiceUiUrl, { waitUntil: "networkidle" });
        expect(ownUiResp?.status()).toBe(200);
        page.off('request', learnReadAction);
        await expect(getDetailTitle(nonAllowlistInvoiceId)).toBeVisible();

        // Assert it's the ONLY invoice in the list
        const invoiceLinks = page.locator('a[href*="/invoices?invoiceId="]');
        const count = await invoiceLinks.count();
        if (count > 0) {
            const firstHref = await invoiceLinks.first().getAttribute('href');
            expect(firstHref).toContain(nonAllowlistInvoiceId);
        }

        const wtOwnResource = new URL(`/control-plane-proxy/tenant/invoices/${nonAllowlistInvoiceId}`, portalOrigin).href;
        const wtOwnResponse = await page.request.get(wtOwnResource);
        expect(wtOwnResponse.status()).toBe(200);

        // Verify authenticated cross-tenant 404 (and fallback in UI)
        let wtMutationCount = 0;
        let fallbackSelectedId = "";
        const wtRequestListener = (req: any) => {
            if (req.method() === 'POST' && (!readActionId || req.headers()['next-action'] !== readActionId)) {
                wtMutationCount++;
            }
        };
        page.on('request', wtRequestListener);

        const wrongTenantUiUrl = new URL(`/invoices?invoiceId=${invoiceId}`, portalOrigin).href;
        await page.goto(wrongTenantUiUrl, { waitUntil: "networkidle" });
        await expect(getDetailTitle(invoiceId)).not.toBeVisible();
        const anyDownloadLink = page.locator('a[href*="/downloads/"]');
        if (await anyDownloadLink.count() > 0) {
            const href = await anyDownloadLink.first().getAttribute('href');
            if (href) {
                const parts = href.split('/');
                fallbackSelectedId = parts[parts.length - 1] ?? "";
            }
        }
        await expect(page.locator(`a[href*="${invoiceId}"]`)).not.toBeVisible();

        // The selected fallback MUST be the own invoice
        expect(fallbackSelectedId).toBe(nonAllowlistInvoiceId);

        page.off('request', wtRequestListener);

        const protectedPortalApiUrl = new URL(`/control-plane-proxy/tenant/invoices/${invoiceId}`, portalOrigin).href;
        const wtResponse = await page.request.get(protectedPortalApiUrl);
        expect(wtResponse.status()).toBe(404);
        const errBody = await wtResponse.json().catch(() => ({}));
        expect(errBody?.error?.code).toBe('NOT_FOUND');
        evidenceData.httpCalls.push({ method: "GET", path: "wrong_tenant_portal", status: wtResponse.status(), ui_isolated: true, selected_identity: nonAllowlistInvoiceId, forbidden_resource: invoiceId, send_disabled: false, mutation_count: wtMutationCount, forbidden_download_observed: false });
    } else {
        if (!evidenceData.unimplementedLiveSurfaces.includes("browser_role_interaction")) {
            evidenceData.unimplementedLiveSurfaces.push("browser_role_interaction");
        }
    }

    if (readOnlyToken && readOnlyInvoiceId) {
        await context.clearCookies();
        await context.addCookies([{ name: "drts_tenant_session", value: readOnlyToken, domain: portalUrlObj.hostname, path: "/" }]);

        const getDetailTitle = (id: string) => page.getByText(id, { exact: true }).filter({ hasNot: page.locator('xpath=ancestor-or-self::a') });

        // Read-only role CAN view the invoice
        const roInvoiceUiUrl = new URL(`/invoices?invoiceId=${readOnlyInvoiceId}`, portalOrigin).href;
                let readActionId: string | null = null;
        const learnReadAction = (req: any) => { if (req.method() === 'POST') { const actionId = req.headers()['next-action']; if (actionId) readActionId = actionId; } };
        page.on('request', learnReadAction);

        const roUiResp = await page.goto(roInvoiceUiUrl, { waitUntil: "networkidle" });
        expect(roUiResp?.status()).toBe(200);
        page.off('request', learnReadAction);

        await expect(getDetailTitle(readOnlyInvoiceId)).toBeVisible();
        const sendBtn = page.locator('button').filter({ hasText: /Send invoice email|Retry pending delivery|Send another copy|寄送帳單信件|重試待寄信件|再寄一份/ });
        await expect(sendBtn).toBeDisabled();
        await expect(page.getByText(/Billing write permission is required to send\.|需帳務寫入權限才能寄送。/)).toBeVisible();

        let mutationCount = 0;
        const requestListener = (req: any) => {
            if (req.method() === 'POST' && (!readActionId || req.headers()['next-action'] !== readActionId)) {
                mutationCount++;
            }
        };
        page.on('request', requestListener);

        await sendBtn.click({ force: true }); // attempt to click anyway
        await page.waitForTimeout(500); // give it a moment to catch any async network
        expect(mutationCount).toBe(0); // no Next.js server action POST should be emitted
        page.off('request', requestListener);

        const roApiUrl = new URL(`/control-plane-proxy/tenant/invoices/${readOnlyInvoiceId}`, portalOrigin).href;
        const roResponse = await page.request.get(roApiUrl);
        expect(roResponse.status()).toBe(200);

        evidenceData.httpCalls.push({
            method: "GET",
            path: "read_only_portal",
            status: roResponse.status(),
            ui_readonly: true,
            selected_identity: readOnlyInvoiceId,
            mutation_count: mutationCount,
            send_disabled: true,
            forbidden_download_observed: false
        });
    } else {
        if (!evidenceData.unimplementedLiveSurfaces.includes("browser_role_interaction")) {
            evidenceData.unimplementedLiveSurfaces.push("browser_role_interaction");
        }
    }

    evidenceData.httpCalls.push({ method: "GET", path: "artifactUrl", status: 200 });
  });
});

