import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3002";

const entry = {
  partnerId: "partner_ctbc_world_elite",
  partnerCode: "ctbc",
  partnerType: "bank",
  programId: "world-elite",
  programCode: "WE",
  tenantId: "tnt_003",
  bankCode: "CTBC",
  entrySlug: "ctbc-elite",
  displayName: "CTBC World Elite",
  businessDispatchSubtype: "wheelchair",
  authMode: "partner_api_key",
  eligibilityMode: "card_bin",
  entryHost: "partners.ctbc.example",
  entryPath: "/world-elite",
  themeAccent: "#0f766e",
  brandingMetadata: {
    displayName: "CTBC World Elite",
    supportEmail: "biz-card@ctbcbank.com",
    supportPhone: "02-2655-7788",
  },
  eligibilityContract: {
    contractId: "elig_ctbc_world_elite",
    adapterCode: "card-bin",
    adapterVersion: "2026.05",
    adapterKind: "real_time_api",
    manualFallbackPolicy: {
      requiredOnTimeout: true,
    },
    notes: ["BIN ranges synced with issuer on 2026-05-25."],
  },
  status: "active",
  activeFlag: true,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  createdAt: "2026-05-25T03:45:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
  auditMetadata: {
    source: "platform_admin",
    requestId: "req_partner_detail_001",
    createdBy: "ops.lead@drts.io",
    updatedBy: "ops.lead@drts.io",
  },
} as const;

test("platform admin partner detail route renders parity body and plaintext-once modal", async ({
  page,
}) => {
  let credentials = [
    {
      keyId: "cred_live_001",
      entrySlug: "ctbc-elite",
      keyPrefix: "pk_live_a1b2",
      maskedSuffix: "c3d4",
      source: "platform_admin",
      createdAt: "2026-06-01T09:00:00.000Z",
      lastUsedAt: "2026-06-01T10:30:00.000Z",
      revokedAt: null,
      issuedBy: "ops.lead@drts.io",
      revokedBy: null,
      rotationReason: "Initial production issuance.",
      revokeReason: null,
    },
  ];

  await page.route(`${baseUrl}/control-plane-proxy/health`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          status: "healthy",
        },
      }),
    });
  });

  await page.route(
    `${baseUrl}/control-plane-proxy/platform-admin/partner-entries`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [entry],
          },
        }),
      });
    },
  );

  await page.route(
    `${baseUrl}/control-plane-proxy/platform-admin/partner-entries/ctbc-elite/credentials`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: credentials,
          },
        }),
      });
    },
  );

  await page.route(
    `${baseUrl}/control-plane-proxy/platform-admin/partner-entries/ctbc-elite/credentials/issue`,
    async (route) => {
      const issuedCredential = {
        keyId: "cred_live_002",
        entrySlug: "ctbc-elite",
        keyPrefix: "pk_live_z9y8",
        maskedSuffix: "x7w6",
        source: "platform_admin",
        createdAt: "2026-06-02T15:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        issuedBy: "ops.lead@drts.io",
        revokedBy: null,
        rotationReason: "Compromised secret rotation.",
        revokeReason: null,
      };

      credentials = [issuedCredential, ...credentials];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            credential: issuedCredential,
            plaintextKey:
              "pk_live_z9y8m6n4b2r0_plaintext_secret_value_123456789",
            revokedCredentialId: null,
          },
        }),
      });
    },
  );

  const response = await page.goto(`${baseUrl}/partners/ctbc-elite`, {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /CTBC · world-elite/ }),
  ).toBeVisible();
  await expect(page.getByText("Overview").first()).toBeVisible();
  await expect(page.getByText("Branding").first()).toBeVisible();
  await expect(page.getByText("Auth").first()).toBeVisible();
  await expect(page.getByText("Eligibility").first()).toBeVisible();
  await expect(page.getByText("Credentials").first()).toBeVisible();
  await expect(page.getByText("Audit").first()).toBeVisible();
  await expect(page.getByText(/Entry basics|Entry 基本資料/)).toBeVisible();
  await expect(page.getByText("Readiness").first()).toBeVisible();
  await expect(
    page.getByText(/Active credentials|僅顯示遮罩/).first(),
  ).toBeVisible();
  await expect(page.getByText("pk_live_a1b2c3d4")).toBeVisible();
  await expect(page.getByText("plaintext_secret_value_123456789")).toHaveCount(
    0,
  );

  await page
    .getByRole("button", { name: /Issue credential|發行 credential/ })
    .click();
  await page
    .getByPlaceholder(
      /Explain why this credential is being issued or rotated.|說明為何要發行或輪替這筆 credential。/,
    )
    .fill("Compromised secret rotation.");
  await page
    .getByRole("dialog", { name: /Issue credential|發行 credential/ })
    .getByRole("button", { name: /Issue|發行/ })
    .click();

  const secretDialog = page.getByRole("dialog", {
    name: /Ingress credential · plaintext-once reveal|Ingress credential · 明文一次性顯示/,
  });

  await expect(secretDialog).toBeVisible();
  await expect(
    secretDialog.getByText(
      "pk_live_z9y8m6n4b2r0_plaintext_secret_value_123456789",
    ),
  ).toBeVisible();
  await expect(secretDialog.getByText("partner.ingress:write")).toBeVisible();
  await expect(
    secretDialog.getByText("cardholder.eligibility:verify"),
  ).toBeVisible();
  await expect(
    secretDialog.getByRole("button", { name: "關閉" }).first(),
  ).toBeDisabled();

  await page
    .getByLabel(
      /I stored this key and understand it will not be shown again.|我已妥善保存此 key，且理解之後不會再顯示。/,
    )
    .check();
  await page.getByRole("button", { name: /Acknowledge|確認並關閉/ }).click();

  await expect(secretDialog).toHaveCount(0);
  await expect(
    page.getByText("pk_live_z9y8m6n4b2r0_plaintext_secret_value_123456789"),
  ).toHaveCount(0);
  await expect(page.getByText("pk_live_z9y8x7w6")).toBeVisible();
});
