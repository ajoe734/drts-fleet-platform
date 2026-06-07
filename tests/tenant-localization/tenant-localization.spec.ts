import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const TENANT_CONSOLE_PROJECT = "tenant-console-localization";
const TENANT_PORTAL_PROJECT = "tenant-portal-localization";
const LOCALE_STORAGE_KEY = "drts-locale-v2";
const TENANT_PORTAL_SESSION_COOKIE = "tenant-portal-session";
const PARTNER_SESSION_COOKIE = "drts_partner_session_v2";
const PARTNER_SESSION_SIGNATURE_VERSION = "v2";
const PARTNER_SESSION_DEV_SECRET =
  "drts-partner-session-dev-fallback-secret-do-not-use-in-prod";

const TENANT_CONSOLE_ROUTES = [
  "/",
  "/addresses",
  "/audit",
  "/billing",
  "/bookings",
  "/bookings/new",
  "/api-keys",
  "/cost-centers",
  "/feature-flags",
  "/integration-governance",
  "/invoices",
  "/notifications",
  "/passengers",
  "/reports",
  "/rules",
  "/settings",
  "/sla",
  "/users",
  "/webhooks",
  "/partner/login",
] as const;

const TENANT_PORTAL_ROUTES = [
  "/",
  "/booking-list",
  "/bookings/new",
  "/users",
  "/audit",
  "/settings",
  "/notifications",
  "/api-keys",
] as const;

const TENANT_PARTNER_AUTH_ROUTES = [
  "/partner/start",
  "/partner/eligibility",
  "/partner/booking/new",
] as const;

const LOCALIZATION_LEAK_PATTERNS = [
  /Unknown error/i,
  /Request failed/i,
  /Unable to /i,
  /Invalid JSON body/i,
  /Backend did not return/i,
  /Partner session expired or missing/i,
  /Tenant portal session required/i,
  /Partner bootstrap rejected/i,
  /Booking create rejected by backend/i,
  /Eligibility verification failed/i,
  /Both entrySlug and apiKey are required/i,
  /Open ops booking board/i,
  /Open platform audit view/i,
  /\bfetch_failed\b/i,
  /\bpermission_denied\b/i,
  /\bnot_provisioned\b/i,
  /\bexternal_unavailable\b/i,
  /\bacme-airport-vip\b/i,
  /\bacme-airport\b/i,
  /\bairport-vip\b/i,
  /\bev_\.\.\./i,
  /\bpartner-key-demo-001\b/i,
  /\/api\/tenant\/\*/i,
  /repo 內建/i,
] as const;

function buildPortalSessionCookieValue() {
  return Buffer.from(
    JSON.stringify({
      accessToken: "pw-tenant-portal-token",
      tenantId: "tenant-demo-001",
      email: "admin@acme.example",
      fullName: "Portal E2E Admin",
      roleCode: "tenant_admin",
    }),
    "utf8",
  ).toString("base64url");
}

function buildPartnerSessionCookieValue() {
  const session = {
    accessToken: "pw-partner-token",
    expiresIn: "PT8H",
    expiresAt: "2030-06-07T12:00:00.000Z",
    partnerEntry: {
      partnerId: "partner-demo-001",
      partnerCode: "acme-airport",
      partnerType: "bank",
      programId: "program-demo-001",
      programCode: "airport-vip",
      tenantId: "tenant-demo-001",
      bankCode: "ACME",
      entrySlug: "acme-airport-vip",
      displayName: "ACME 機場禮遇",
      businessDispatchSubtype: "credit_card_airport_transfer",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: null,
      entryPath: "/partner/acme-airport-vip",
      themeAccent: null,
      brandingMetadata: null,
      eligibilityContract: null,
      status: "active",
      activeFlag: true,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: "2026-06-07T00:00:00.000Z",
    },
    identity: {
      actorType: "partner_api_key",
      actorId: "partner-key-demo-001",
      realm: "partner",
      authMode: "jwt_bearer",
      roleFamilies: ["partner"],
      roles: [],
      scopes: [],
      tenantId: "tenant-demo-001",
      partnerId: "partner-demo-001",
    },
  };

  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", PARTNER_SESSION_DEV_SECRET)
    .update(`${PARTNER_SESSION_SIGNATURE_VERSION}.${payload}`)
    .digest("base64url");

  return `${PARTNER_SESSION_SIGNATURE_VERSION}.${payload}.${signature}`;
}

async function primeZhLocale(page: Page) {
  await page.addInitScript((localeStorageKey: string) => {
    window.localStorage.setItem(localeStorageKey, "zh");
    document.cookie = `${localeStorageKey}=zh;path=/;max-age=31536000;SameSite=Lax`;
  }, LOCALE_STORAGE_KEY);
}

async function addPortalSessionCookie(
  context: BrowserContext,
  baseURL: string,
) {
  await context.addCookies([
    {
      name: TENANT_PORTAL_SESSION_COOKIE,
      value: buildPortalSessionCookieValue(),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function addPartnerSessionCookie(
  context: BrowserContext,
  baseURL: string,
) {
  await context.addCookies([
    {
      name: PARTNER_SESSION_COOKIE,
      value: buildPartnerSessionCookieValue(),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function gotoAndSettle(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.ok() ?? response?.status() === 304).toBeTruthy();
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(600);
}

async function expectNoLocalizationLeaks(page: Page, route: string) {
  const [bodyText, placeholderText] = await Promise.all([
    page.locator("body").innerText(),
    page
      .locator("input[placeholder], textarea[placeholder]")
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("placeholder") ?? "")
          .filter(Boolean)
          .join("\n"),
      ),
  ]);

  for (const pattern of LOCALIZATION_LEAK_PATTERNS) {
    expect(
      bodyText,
      `Unexpected untranslated text on ${route}: ${pattern}`,
    ).not.toMatch(pattern);
    expect(
      placeholderText,
      `Unexpected untranslated placeholder on ${route}: ${pattern}`,
    ).not.toMatch(pattern);
  }
}

test.describe("tenant console localization", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);
    await primeZhLocale(page);
  });

  test("zh routes do not leak common English errors or internal codes", async ({
    page,
  }) => {
    for (const route of TENANT_CONSOLE_ROUTES) {
      await gotoAndSettle(page, route);
      await expectNoLocalizationLeaks(page, route);
    }
  });

  test("partner authenticated routes do not leak common English errors or internal codes", async ({
    context,
    page,
  }, testInfo) => {
    await addPartnerSessionCookie(
      context,
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );

    for (const route of TENANT_PARTNER_AUTH_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page).not.toHaveURL(/\/partner\/login(?:\?|$)/);
      await expectNoLocalizationLeaks(page, route);
    }
  });
});

test.describe("tenant portal localization", () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_PORTAL_PROJECT);
    await addPortalSessionCookie(
      context,
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3300"),
    );
    await primeZhLocale(page);
  });

  test("login error query does not leak raw English copy", async ({ page }) => {
    await page.context().clearCookies();
    await primeZhLocale(page);
    await gotoAndSettle(page, "/login?error=Unknown%20error");
    await expect(page.locator("body")).not.toContainText("Unknown error");
    await expectNoLocalizationLeaks(page, "/login?error=Unknown%20error");
  });

  test("zh authenticated routes do not leak common English errors or internal codes", async ({
    page,
  }) => {
    for (const route of TENANT_PORTAL_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
      await expectNoLocalizationLeaks(page, route);
    }
  });
});
