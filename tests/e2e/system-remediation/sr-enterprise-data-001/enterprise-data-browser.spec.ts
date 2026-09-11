import { test, expect, type Browser } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { enterpriseTenant } from "../../../../apps/enterprise-dispatch-web/lib/enterprise-fixtures";
import { t as translate } from "../../../../apps/enterprise-dispatch-web/lib/translations";

// Drives a real built enterprise-dispatch-web production server against a
// real, unmodified AppModule + migrated PostgreSQL (see
// enterprise-data-browser-server.mjs). Proves SR-ENTERPRISE-DATA-001's two
// required_acceptance items with real HTTP/browser evidence:
//  - enterprise_booking_identity_empty_and_error_ui
//  - enterprise_authorized_driver_and_support_contact_actions

const portal = process.env.ENTERPRISE_DATA_PORTAL_URL || "http://127.0.0.1:3011";
const evidenceDir = resolve(
  process.env.ENTERPRISE_DATA_BROWSER_EVIDENCE_DIR ||
    ".artifacts/enterprise-data-acceptance/browser",
);
const sessions: Record<"active" | "empty", { token: string; tenantId: string }> =
  JSON.parse(readFileSync(resolve(evidenceDir, "sessions.private.json"), "utf8"));
const seed: {
  bookingId: string;
  nonexistentBookingId: string;
  tenants: { active: string; empty: string };
} = JSON.parse(readFileSync(resolve(evidenceDir, "seed-data.json"), "utf8"));

const expectedSupportTelHref = `tel:${enterpriseTenant.supportPhone.replace(/[^+0-9]/g, "")}`;
const expectedSupportMailtoHref = `mailto:${enterpriseTenant.supportEmail}`;

test.use({ trace: "off" }); // Do not upload session-cookie contents in traces.

async function contextFor(browser: Browser, token?: string) {
  const context = await browser.newContext({ locale: "zh-TW" });
  if (token) {
    await context.addCookies([
      {
        name: "drts_tenant_session",
        value: token,
        url: portal,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  return context;
}

test("home upcoming list, trip page, and booking detail all resolve to the exact same real booking", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.active.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/`);
    const row = page.getByTestId(`enterprise-home-upcoming-${seed.bookingId}`);
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(
      new RegExp(`/bookings/${seed.bookingId}$`),
    );
    await expect(
      page.getByTestId("enterprise-booking-detail-id"),
    ).toContainText(seed.bookingId);

    await page.goto(`${portal}/trip`);
    await page.getByTestId("enterprise-trip-detail-link").click();
    await expect(page).toHaveURL(
      new RegExp(`/bookings/${seed.bookingId}$`),
    );
    await expect(
      page.getByTestId("enterprise-booking-detail-id"),
    ).toContainText(seed.bookingId);

    await page.screenshot({
      path: resolve(evidenceDir, "identity-home-trip-detail.png"),
      fullPage: true,
    });
    writeFileSync(
      resolve(evidenceDir, "identity-evidence.json"),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          bookingId: seed.bookingId,
          resolvedFromHomeUrl: page.url(),
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("trip page shows an honest disabled driver-contact state and a real support tel action, never a fabricated driver number", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.active.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/trip`);
    const driverButton = page.getByTestId("enterprise-trip-contact-driver");
    await expect(driverButton).toBeDisabled();

    const supportLink = page.getByTestId("enterprise-trip-contact-support");
    await expect(supportLink).toHaveAttribute("href", expectedSupportTelHref);

    writeFileSync(
      resolve(evidenceDir, "contact-actions-trip-evidence.json"),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          driverContactDisabled: await driverButton.isDisabled(),
          supportHref: await supportLink.getAttribute("href"),
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("help page support actions are real tel/mailto actions built from the tenant's own contact data", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.active.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/help`);
    const callLink = page.getByTestId("enterprise-help-call");
    const onlineLink = page.getByTestId("enterprise-help-online");
    await expect(callLink).toHaveAttribute("href", expectedSupportTelHref);
    await expect(onlineLink).toHaveAttribute("href", expectedSupportMailtoHref);

    writeFileSync(
      resolve(evidenceDir, "contact-actions-help-evidence.json"),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          callHref: await callLink.getAttribute("href"),
          onlineHref: await onlineLink.getAttribute("href"),
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("a genuinely nonexistent booking id resolves to an honest not-found state, never a retryable degraded banner", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.active.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/bookings/${seed.nonexistentBookingId}`);
    await expect(
      page.getByTestId("enterprise-booking-not-found"),
    ).toBeVisible();
    await expect(page.getByTestId("enterprise-booking-api-state")).toHaveCount(
      0,
    );
    await page.screenshot({
      path: resolve(evidenceDir, "not-found-state.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("a tenant with zero upcoming bookings sees an honest empty state on home and trip, never a fabricated trip", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.empty.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/`);
    await expect(
      page.getByTestId("enterprise-home-upcoming-empty"),
    ).toBeVisible();

    await page.goto(`${portal}/trip`);
    await expect(page.getByTestId("enterprise-trip-empty")).toBeVisible();

    writeFileSync(
      resolve(evidenceDir, "empty-tenant-evidence.json"),
      JSON.stringify(
        { candidateSha: process.env.CANDIDATE_SHA, tenantId: sessions.empty.tenantId },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("a missing session cannot render the tenant home dashboard or leak any booking row", async ({
  browser,
}) => {
  const context = await contextFor(browser, undefined);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/`);
    await expect(
      page.getByText(translate("gate.authRequired.title", undefined, "zh")),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="enterprise-home-upcoming-"]'),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
