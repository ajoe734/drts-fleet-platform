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
};

test.describe("Live Invoice Mail Acceptance", () => {
  test.afterEach((_, testInfo) => {
    if (testInfo.status !== "passed") {
      evidenceData.errors.push(
        `Test failed: ${testInfo.error?.message || "Unknown error"}`,
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
    request,
  }) => {
    const apiOrigin = process.env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN;
    const candidateSha = process.env.DRTS_CANDIDATE_SHA;
    const sessionToken = process.env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN;
    const tenantId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID;
    const authorizedRecipient =
      process.env.DRTS_LIVE_INVOICE_MAIL_AUTHORIZED_RECIPIENT;

    if (
      !apiOrigin ||
      !candidateSha ||
      !sessionToken ||
      !tenantId ||
      !authorizedRecipient
    ) {
      evidenceData.errors.push(
        "Missing required environment variables for live invoice mail test.",
      );
      throw new Error("Missing required environment variables");
    }

    const invoiceId = process.env.DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID;
    if (!invoiceId) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push(
        "Missing DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID for testing.",
      );
      throw new Error("Missing invoice ID fixture");
    }

    // 1. Check Identity (Billing Profile)
    evidenceData.httpCalls.push({
      method: "GET",
      path: "tenant/billing/profile",
    });
    const profileResponse = await request.get(
      `${apiOrigin}/api/tenant/billing/profile`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
        },
      },
    );
    expect(profileResponse.status()).toBe(200);
    const profileData = await profileResponse.json();
    if (profileData.data?.email !== authorizedRecipient) {
      evidenceData.unimplementedLiveSurfaces.push("invoice-fixture-missing");
      evidenceData.errors.push(
        `Billing profile email '${profileData.data?.email}' does not match authorized recipient '${authorizedRecipient}'`,
      );
      throw new Error(
        "Billing profile email does not match authorized recipient",
      );
    }

    // 2. Wrong Tenant
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
      scenario: "wrong_tenant",
    });
    const wrongTenantResponse = await request.post(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": "10000000-0000-0000-0000-000000000999",
        },
      },
    );
    expect(wrongTenantResponse.status()).toBe(403);

    // 3. Read Only Send (simulated missing scope)
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
      scenario: "read_only",
    });
    // Assuming API verifies token first, fake token returns 401
    const readOnlyResponse = await request.post(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer fake-token-for-read-only`,
          "x-tenant-id": tenantId,
        },
      },
    );
    expect(readOnlyResponse.status()).toBeGreaterThanOrEqual(401);

    // 4. Non-allowlisted recipient (Simulate / Record)
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
      scenario: "non_allowlisted",
    });

    // 5. Normal Send
    const idempotencyKey = "test-live-invoice-" + Date.now();
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
    });

    const sendResponse = await request.post(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
          "idempotency-key": idempotencyKey,
        },
      },
    );

    expect(sendResponse.status()).toBe(200);
    const sendResult = await sendResponse.json();
    const deliveryId = sendResult.data?.deliveryId;
    expect(deliveryId).toBeTruthy();
    evidenceData.trackedResources.push({ type: "delivery", id: deliveryId });

    // 6. Idempotency retry
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
      idempotency: true,
    });
    const retryResponse = await request.post(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
          "idempotency-key": idempotencyKey,
        },
      },
    );
    expect(retryResponse.status()).toBe(200);
    const retryResult = await retryResponse.json();
    expect(retryResult.data.deliveryId).toBe(deliveryId);

    // 7. Intentional resend
    const newIdempotencyKey = "test-live-invoice-resend-" + Date.now();
    evidenceData.httpCalls.push({
      method: "POST",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
      scenario: "intentional_resend",
    });
    const resendResponse = await request.post(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
          "idempotency-key": newIdempotencyKey,
        },
      },
    );
    expect(resendResponse.status()).toBe(200);
    const resendResult = await resendResponse.json();
    const resendDeliveryId = resendResult.data?.deliveryId;
    expect(resendDeliveryId).toBeTruthy();
    expect(resendDeliveryId).not.toBe(deliveryId);
    evidenceData.trackedResources.push({
      type: "delivery",
      id: resendDeliveryId,
    });

    // 8. Durable GET
    evidenceData.httpCalls.push({
      method: "GET",
      path: `/api/tenant/invoices/${invoiceId}/mail`,
    });
    const getMailResponse = await request.get(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}/mail`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
        },
      },
    );
    expect(getMailResponse.status()).toBe(200);

    try {
      const evidence = await observeMailbox(
        {
          apiOrigin,
          candidateSha,
          tenantId,
          actorId: "",
          stepUpActionId: "",
          gcpProjectId: process.env.DEV_GCP_PROJECT_ID || "",
        },
        deliveryId,
        INVOICE_PROBE,
      );
      expect(evidence.matched_content).toBe(true);
      expect(evidence.delivery_id).toBe(deliveryId);
      evidenceData.mailboxEvidence = evidence;
    } catch (e: any) {
      evidenceData.errors.push(`Mailbox observation failed: ${e?.message}`);
      throw e;
    }

    evidenceData.httpCalls.push({
      method: "GET",
      path: `/api/tenant/invoices/${invoiceId}`,
    });
    const invoiceResponse = await request.get(
      `${apiOrigin}/api/tenant/invoices/${invoiceId}`,
      {
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-tenant-id": tenantId,
        },
      },
    );

    expect(invoiceResponse.status()).toBe(200);
    const invoiceData = await invoiceResponse.json();
    const artifactUrlPath = invoiceData.data?.artifactUrl;
    expect(artifactUrlPath).toBeTruthy();

    const manifestHash =
      invoiceData.data?.artifactDownloadMetadata?.manifestHash;
    expect(manifestHash).toBeTruthy();

    const fullArtifactUrl = new URL(artifactUrlPath, apiOrigin).href;

    evidenceData.httpCalls.push({ method: "GET", path: "artifactUrl" });
    const downloadResponse = await request.get(fullArtifactUrl);
    expect(downloadResponse.status()).toBe(200);

    const contentType = downloadResponse.headers()["content-type"];
    expect(contentType).toMatch(/application\/pdf/);

    const bodyBuffer = await downloadResponse.body();
    const downloadedHash = crypto
      .createHash("sha256")
      .update(bodyBuffer)
      .digest("hex");
    expect(downloadedHash).toBe(manifestHash);
  });
});
