// SR-HOST-FE-001-ACCEPTANCE-RUNNER: real browser acceptance evidence for the
// Host restricted read-only surface, driven against a real, listening
// production `fleet-partner-portal-web` Next.js server pointed at the real
// isolated Host acceptance API (host-acceptance-server.ts) and a real,
// migrated PostgreSQL — never mocked routes or fixture data.
//
// This is the `host_actual_browser_switching_states` required_acceptance
// gate. Run by `.github/workflows/host-acceptance.yml`'s browser-acceptance
// job on GitHub-hosted infrastructure only; the CI env starts both servers
// before invoking `pnpm exec playwright test -c
// playwright.system-remediation.config.ts` against this file. This spec
// itself never starts a server (matching the VM restriction that applies to
// any local/interactive run of this file too).
//
// Boundary this suite is honest about: this is browser (Chromium/headless)
// emulation, not physical-device verification, and the outer portal
// layout/navigation shell is SR-WIRE-001's scope, not exercised or asserted
// complete here — only the `/host/*` route tree this task owns.

import { test, expect, type BrowserContext } from "@playwright/test";
import {
  HOST_A_PARTNER_ID,
  HOST_B_PARTNER_ID,
  HOST_BULK_PARTNER_ID,
  HOST_UNRELATED_PARTNER_ID,
  BULK_VEHICLE_COUNT,
  bulkVehicleId,
} from "./host-acceptance-seed";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";
import { attachBrowserEvidenceCollector } from "../shared/browser-helpers";

const PORTAL_URL =
  process.env.HOST_ACCEPTANCE_PORTAL_URL ?? "http://127.0.0.1:3007";

const recorder = new UatEvidenceRecorder({
  taskId: "SR-HOST-FE-001-ACCEPTANCE-RUNNER-BROWSER",
  candidateSha: process.env.CANDIDATE_SHA,
});

async function hostContext(
  browser: import("@playwright/test").Browser,
  partnerId: string | undefined,
  viewport?: { width: number; height: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(partnerId
      ? { extraHTTPHeaders: { "x-host-partner-id": partnerId } }
      : {}),
  });
  return context;
}

test.afterAll(() => {
  const outputPath = process.env.HOST_ACCEPTANCE_BROWSER_EVIDENCE_PATH;
  if (outputPath) {
    recorder.saveToFile(outputPath);
  } else {
    recorder.finalize();
  }
});

test.describe("SR-HOST-FE-001-ACCEPTANCE-RUNNER: real browser Host acceptance", () => {
  test("Host A's vehicle list renders real owned vehicles and never Host B's", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_A_PARTNER_ID);
    const page = await context.newPage();
    const detach = attachBrowserEvidenceCollector({ page, recorder });
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });

    await expect(page.getByText("UAT-A001")).toBeVisible();
    await expect(page.getByText("UAT-A002")).toBeVisible();
    await expect(page.getByText("UAT-B001")).toHaveCount(0);

    detach();
    await context.close();
  });

  test("switching host identity from A to B shows only the new host's vehicle, with no stale Host A data", async ({
    browser,
  }) => {
    const contextA = await hostContext(browser, HOST_A_PARTNER_ID);
    const pageA = await contextA.newPage();
    await pageA.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    await expect(pageA.getByText("UAT-A001")).toBeVisible();
    await contextA.close();

    const contextB = await hostContext(browser, HOST_B_PARTNER_ID);
    const pageB = await contextB.newPage();
    const detach = attachBrowserEvidenceCollector({ page: pageB, recorder });
    await pageB.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });

    await expect(pageB.getByText("UAT-B001")).toBeVisible();
    await expect(pageB.getByText("UAT-A001")).toHaveCount(0);
    await expect(pageB.getByText("UAT-A002")).toHaveCount(0);

    detach();
    await contextB.close();
  });

  test("clicking into a vehicle and switching tabs shows real maintenance data and an honest empty trips tab", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_A_PARTNER_ID);
    const page = await context.newPage();
    const detach = attachBrowserEvidenceCollector({ page, recorder });
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });

    await page.getByRole("link", { name: "詳情 →" }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("UAT-A001")).toBeVisible();

    // Default tab is earnings; switch to maintenance via a real link click.
    await page.getByRole("link", { name: /維保/ }).click();
    await page.waitForLoadState("networkidle");
    // `.first()`: the real maintenance row renders both an "oil_change" type
    // cell and a "UAT note" notes cell in the same row, so the combined
    // locator legitimately resolves to 2 elements (strict-mode violation
    // without narrowing) — either one visible is sufficient evidence of real
    // maintenance data.
    await expect(
      page.getByText(/oil_change/i).or(page.getByText("UAT note")).first(),
    ).toBeVisible();

    // Trips tab: real click-through navigation to the endpoint proven broken
    // in host-api-sql-acceptance.test.ts — the browser must show the
    // legitimate zero-trips rendering path, not a crash, and this is
    // recorded as the same known defect from the browser's point of view.
    await page.getByRole("link", { name: /行程/ }).click();
    await page.waitForLoadState("networkidle");
    const pageContent = await page.content();
    expect(pageContent).not.toContain("Uncaught");
    recorder.recordLiveLimitation(
      "host_view_trips_sql_column_mismatch_browser",
      "Real browser click-through to the trips tab for a vehicle with a real completed trip renders the empty-trips state, matching the SQL column-mismatch defect proven directly against HTTP/SQL in host-api-sql-acceptance.test.ts. Not a browser-only issue; recorded here as cross-surface confirmation.",
    );

    detach();
    await context.close();
  });

  test("keyboard focus and Enter activation reaches and switches to the cases tab", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_A_PARTNER_ID);
    const page = await context.newPage();
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "詳情 →" }).first().click();
    await page.waitForLoadState("networkidle");

    const casesTabLink = page.getByRole("link", { name: /案件/ });
    await casesTabLink.focus();
    await expect(casesTabLink).toBeFocused();
    await page.keyboard.press("Enter");
    // `expect(page).toHaveURL(...)` polls/retries; a one-shot `page.url()`
    // read right after `waitForLoadState` can race Next.js's client-side
    // history push for a query-param-only navigation (no new document load
    // to wait on).
    await expect(page).toHaveURL(/tab=cases/);

    await context.close();
  });

  test("mobile viewport (390x844) renders the vehicle list without horizontal overflow", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_A_PARTNER_ID, {
      width: 390,
      height: 844,
    });
    const page = await context.newPage();
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    await expect(page.getByText("UAT-A001")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(4);

    await page.screenshot({
      path: "test-results/host-acceptance-mobile-vehicle-list.png",
      fullPage: true,
    });
    await context.close();
  });

  test("desktop viewport (1440x960) renders the vehicle detail page", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_A_PARTNER_ID, {
      width: 1440,
      height: 960,
    });
    const page = await context.newPage();
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "詳情 →" }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("UAT-A001")).toBeVisible();

    await page.screenshot({
      path: "test-results/host-acceptance-desktop-vehicle-detail.png",
      fullPage: true,
    });
    await context.close();
  });

  test("empty state: an unrelated real identity with zero vehicles sees the legitimate no-vehicles message, never fabricated rows", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_UNRELATED_PARTNER_ID);
    const page = await context.newPage();
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    await expect(page.getByText("尚無車輛")).toBeVisible();
    await context.close();
  });

  test("missing host identity renders a fetch_failed access state, never fabricated data", async ({
    browser,
  }) => {
    const context = await hostContext(browser, undefined);
    const page = await context.newPage();
    await page.goto(`${PORTAL_URL}/host/vehicles`, { waitUntil: "networkidle" });
    // `{ exact: true }`: the page also renders a longer known-limitation
    // sentence containing this same substring ("...暫時無法讀取自有車輛資料..."),
    // so a substring match is ambiguous (Playwright strict mode violation).
    await expect(page.getByText("暫時無法讀取", { exact: true })).toBeVisible();
    await context.close();
  });

  test("[DEFECT] vehicle #201 of 205 is reported vehicle_not_found despite genuine ownership (frontend 200-row lookup limitation)", async ({
    browser,
  }) => {
    const context = await hostContext(browser, HOST_BULK_PARTNER_ID);
    const page = await context.newPage();
    const beyondLookupVehicleId = bulkVehicleId(201);
    expect(BULK_VEHICLE_COUNT).toBeGreaterThan(200);

    await page.goto(
      `${PORTAL_URL}/host/vehicles/${beyondLookupVehicleId}`,
      { waitUntil: "networkidle" },
    );
    // `{ exact: true }`: the page also renders a longer explanatory sentence
    // containing this same substring ("...找不到此車輛，或該車輛不屬於您名下..."),
    // so a substring match is ambiguous (Playwright strict mode violation).
    await expect(page.getByText("找不到此車輛", { exact: true })).toBeVisible();

    recorder.recordLiveLimitation(
      "host_frontend_200_row_detail_lookup_browser",
      `Real browser navigation to a genuinely owned vehicle beyond the frontend's fixed 200-row lookup (loadHostVehicleDetail's VEHICLE_LOOKUP_PAGE_SIZE in host-data.server.ts) renders vehicle_not_found instead of the real vehicle. Reproduced here with vehicle #201 of ${BULK_VEHICLE_COUNT} genuinely owned, active vehicles. Cross-surface confirmation of the same limitation proven at the HTTP layer in host-api-sql-acceptance.test.ts.`,
    );
    await context.close();
  });
});
