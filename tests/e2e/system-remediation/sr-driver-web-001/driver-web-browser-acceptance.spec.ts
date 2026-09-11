// SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911: real Chromium acceptance for the
// real, `expo export -p web` static build of apps/driver-app, served by
// driver-web-static-server.mjs (see that file for why the COOP/COEP headers
// and index.html SPA fallback both exist).
//
// This runs with EXPO_PUBLIC_API_URL pointed at an intentionally-unreachable
// loopback address (see .github/workflows/driver-web-acceptance.yml), so the
// driver app never reaches a real backend here. That is deliberate, not a
// gap this spec hides: `driver-identity-bootstrap.ts`'s
// `syncDriverIdentityBootstrap` catches every identity-fetch failure and
// funnels it into `onWarning` -> `console.warn` (app/_layout.tsx:60-65), and
// `app/onboarding.tsx`'s own `initializeDriverIdentity().catch(...)` never
// reaches `console.error` either — so an unreachable backend on its own must
// never produce a console error or page error here. `/` and `/sos` are both
// in `PROTECTED_DRIVER_ROUTES` (driver-identity-routing.ts); with no
// provisioned identity, `resetDriverAppToOnboarding` client-side-redirects
// both of them to `/onboarding`, which is the real auth-boundary behavior
// this spec exercises and asserts, not a limitation of the test.
//
// What a genuine defect looks like here: `initializeDriverLocationOfflineQueue()`
// (driver-location-heartbeat.ts's `initializeDriverLocationHeartbeat`, called
// unconditionally from `_layout.tsx` on mount) is invoked with a bare `void`
// — no `.catch`. If expo-sqlite's web WASM/worker runtime fails to
// initialize (e.g. the COOP/COEP headers are missing, or the wasm asset
// 404s), that surfaces as an unhandled promise rejection, which Chromium
// reports as a page error / console error. The zero-console-error and
// zero-page-error assertions below are what actually catch that, not
// decoration.
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const BASE_URL =
  process.env.DRIVER_WEB_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3101";

const NOT_PROVISIONED_HEADING = "裝置未啟用";
const WASM_ASSET_PATTERN = /wa-sqlite.*\.wasm(\?.*)?$/i;

type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  wasmResponses: { url: string; status: number }[];
};

function attachDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    wasmResponses: [],
  };

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error: Error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on("response", (response) => {
    if (WASM_ASSET_PATTERN.test(response.url())) {
      diagnostics.wasmResponses.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  return diagnostics;
}

function assertCleanRun(diagnostics: PageDiagnostics): void {
  expect(
    diagnostics.consoleErrors,
    `expected zero browser console errors, got: ${JSON.stringify(diagnostics.consoleErrors)}`,
  ).toEqual([]);
  expect(
    diagnostics.pageErrors,
    `expected zero uncaught page errors (this is what an unhandled SQLite/WASM init rejection would show up as), got: ${JSON.stringify(diagnostics.pageErrors)}`,
  ).toEqual([]);
}

function assertSqliteWasmLoaded(diagnostics: PageDiagnostics): void {
  expect(
    diagnostics.wasmResponses.length,
    "expected at least one network response for expo-sqlite's wa-sqlite.wasm asset (the offline location queue must actually initialize, not be skipped)",
  ).toBeGreaterThan(0);
  for (const response of diagnostics.wasmResponses) {
    expect(
      [200, 304],
      `wa-sqlite wasm asset ${response.url} responded with ${response.status}`,
    ).toContain(response.status);
  }
}

for (const route of ["/", "/onboarding", "/sos"] as const) {
  test(`route ${route} renders the real unprovisioned auth boundary with a working SQLite offline queue`, async ({
    page,
  }) => {
    const diagnostics = attachDiagnostics(page);

    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(NOT_PROVISIONED_HEADING)).toBeVisible({
      timeout: 15_000,
    });

    // `/` and `/sos` are protected routes; with no provisioned identity the
    // real app client-side-redirects them to `/onboarding`. `/onboarding`
    // itself never redirects. Assert the real routing outcome instead of a
    // hardcoded expectation, so this fails loudly if the redirect logic ever
    // regresses to *not* redirecting (a broken auth boundary) rather than
    // silently passing either way.
    await expect(page).toHaveURL(new RegExp(`/onboarding/?$`));

    assertCleanRun(diagnostics);
    assertSqliteWasmLoaded(diagnostics);
  });
}
