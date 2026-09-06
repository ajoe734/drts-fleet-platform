/**
 * Supplemental browser regression against a running local platform-admin Next app.
 * Run from the repository root:
 *   node tests/unit/system-remediation/sr-admin-verify-001/browser-check.mjs
 * Optional SR_ADMIN_BROWSER_BASE_URL (default http://127.0.0.1:3312).
 * This intercepts API transport with explicitly test-only data. It does not prove
 * live backend authorization, persisted resources, deployment, or device acceptance.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const baseURL =
  process.env.SR_ADMIN_BROWSER_BASE_URL ?? "http://127.0.0.1:3312";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
  "Run this transport-mocked regression only against a local Next server.",
);
const gitSha = (ref) =>
  execFileSync("git", ["rev-parse", ref], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
const FLEET_API = "/api/admin/fleet-partners";
const RECORDS_API = "/api/platform-admin/multi-taxi-trip-records";
const EMPTY_RECORDS = "No operational records match this scope";
const fleet = {
  fleet_partner_id: "browser-only-fleet-partner-001",
  legal_name: "Browser-only Fleet Legal Name",
  display_name: "Browser-only Fleet Partner",
  business_registration_no: "TEST-ONLY-001",
  contact_name: "Browser-only Contact",
  contact_phone: "TEST-ONLY-PHONE",
  active: true,
  partnership_type: "fleet_management",
  created_at: "2026-09-06T00:00:00.000Z",
  updated_at: "2026-09-06T00:00:00.000Z",
};
const records = [730, 729].map((retentionDays, index) => {
  const id = `browser-only-${index + 1}`;
  const generatedAt = "2026-09-06T00:00:00.000Z";
  return {
    recordId: `${id}-record`,
    orderId: `${id}-order`,
    orderNo: `${id}-order-number`,
    tripId: `${id}-trip`,
    assignmentId: `${id}-assignment`,
    vehicleId: `${id}-vehicle`,
    plateNo: `TEST-ONLY-${index + 1}`,
    reservedAt: "2026-09-05T08:00:00.000Z",
    pickupAt: "2026-09-05T08:10:00.000Z",
    dropoffAt: "2026-09-05T08:30:00.000Z",
    route: {
      encodedPolyline: null,
      pointCount: 0,
      distanceMeters: 5000,
      durationSeconds: 1200,
      source: "driver_gps",
    },
    payableFareMinor: 20000,
    actualFareMinor: 20000,
    tollMinor: 0,
    currency: "TWD",
    farePolicyVersion: "browser-only-fare-version",
    chargingMode: "platform_quote",
    generatedAt,
    retainUntil: new Date(
      Date.parse(generatedAt) + retentionDays * 86400000,
    ).toISOString(),
    legalHold: {
      state: "none",
      family: "proof_bundle",
      subjectId: `${id}-order`,
      activeHoldCount: 0,
      activeHolds: [],
    },
  };
});

const report = {
  taskId: "SR-ADMIN-VERIFY-001",
  evidenceKind: "local Chromium UI regression; API transport mocked",
  liveBackendVerified: false,
  physicalDeviceVerified: false,
  baseURL,
  baseSha: process.env.SR_ADMIN_BASE_SHA ?? gitSha("origin/dev"),
  candidateSha: gitSha("HEAD"),
  startedAt: new Date().toISOString(),
  testOnlyResourceIds: [
    fleet.fleet_partner_id,
    ...records.map((r) => r.recordId),
  ],
  scenarios: [],
};
const browser = await chromium.launch({ headless: true });
report.browserVersion = browser.version();

function canonicalPath(url) {
  const path = new URL(url).pathname;
  return path.startsWith("/control-plane-proxy/")
    ? `/api${path.slice("/control-plane-proxy".length)}`
    : path;
}

async function scenario(name, endpoint, responseForRequest, verify) {
  const evidence = { name, status: "running", requests: [], pageErrors: [] };
  const context = await browser.newContext({
    baseURL,
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  await context.addCookies([
    { name: "drts-locale-v2", value: "en", url: baseURL },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const path = canonicalPath(request.url());
    if (path === endpoint) {
      const entry = {
        method: request.method(),
        path,
        query: new URL(request.url()).search,
        clientRequestId: request.headers()["x-request-id"] ?? null,
      };
      evidence.requests.push(entry);
      const response = await responseForRequest(entry);
      entry.status = response.status ?? 200;
      entry.testOnlyResponseId = `browser-only-${name}-${evidence.requests.length}`;
      entry.resourceIds = (response.items ?? []).map(
        (item) => item.recordId ?? item.fleet_partner_id,
      );
      await route.fulfill({
        status: entry.status,
        contentType: "application/json",
        body: JSON.stringify(
          entry.status === 200
            ? {
                data: {
                  items: response.items,
                  pageInfo: {
                    page: 1,
                    pageSize: response.items.length || 20,
                    totalItems: response.items.length,
                    totalPages: response.items.length ? 1 : 0,
                  },
                },
                meta: {
                  requestId: entry.testOnlyResponseId,
                  timestamp: "2026-09-06T00:00:00.000Z",
                },
              }
            : {
                error: {
                  code: response.code,
                  message: response.message,
                  retryable: entry.status === 503,
                  traceId: entry.testOnlyResponseId,
                },
              },
        ),
      });
    } else if (path === "/api/health" || path === "/health") {
      // The shell health badge is outside this task's assertions and is mocked too.
      await route.fulfill({ json: { status: "ok" } });
    } else if (
      path.startsWith("/api/") ||
      new URL(request.url()).origin !== new URL(baseURL).origin
    ) {
      evidence.pageErrors.push(
        `Unexpected backend request: ${request.method()} ${path}`,
      );
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  try {
    await verify(page, evidence);
    assert.ok(evidence.requests.length > 0, "Expected a canonical API request");
    assert.ok(evidence.requests.every((r) => r.method === "GET"));
    assert.deepEqual(evidence.pageErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    process.exitCode = 1;
  } finally {
    await context.close();
    report.scenarios.push(evidence);
  }
}

async function p5Page(page) {
  await page.goto("/platform-admin/p5/records");
  await expect(page.getByTestId("p5-records-page")).toBeVisible();
  return page.getByTestId("p5-records-page");
}

async function expectUnavailableCoverage(surface) {
  const hero = surface.locator(":scope > header");
  const statistic = hero
    .getByText("730-day coverage", { exact: true })
    .locator("..");
  await expect(statistic).toContainText("Unavailable");
  await expect(hero).not.toContainText(/\d+%/);
}

try {
  let fleetReloadDenied = false;
  await scenario(
    "fleet-populated",
    FLEET_API,
    () =>
      fleetReloadDenied
        ? {
            status: 403,
            code: "AUTH_SCOPE_DENIED",
            message: "Browser-only fleet reload denial",
          }
        : { items: [fleet] },
    async (page, evidence) => {
      await page.goto("/fleet-partners");
      await expect(
        page.getByRole("link", { name: /Browser-only Fleet Partner/ }),
      ).toBeVisible();
      await expect(
        page.getByText(fleet.fleet_partner_id, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("No fleet partners found.", { exact: true }),
      ).toHaveCount(0);
      const beforeRefresh = evidence.requests.length;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect.poll(() => evidence.requests.length).toBe(beforeRefresh + 1);
      await expect(
        page.getByRole("link", { name: /Browser-only Fleet Partner/ }),
      ).toBeVisible();
      evidence.successfulRefreshObserved = true;
      fleetReloadDenied = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect.poll(() => evidence.requests.length).toBe(beforeRefresh + 2);
      await expect(
        page.getByText(/API error 403:.*Browser-only fleet reload denial/),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browser-only Fleet Partner/ }),
      ).toBeVisible();
      await expect(
        page.getByText("No fleet partners found.", { exact: true }),
      ).toHaveCount(0);
      evidence.existingRowsPreservedOnReloadFailure = true;
    },
  );
  await scenario(
    "fleet-empty",
    FLEET_API,
    () => ({ items: [] }),
    async (page) => {
      await page.goto("/fleet-partners");
      await expect(
        page.getByText("No fleet partners found.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    },
  );
  await scenario(
    "fleet-denied",
    FLEET_API,
    () => ({
      status: 403,
      code: "AUTH_SCOPE_DENIED",
      message: "Browser-only fleet permission denial",
    }),
    async (page) => {
      await page.goto("/fleet-partners");
      await expect(
        page.getByText("Unable to load fleet partner data", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/API error 403:.*Browser-only fleet permission denial/),
      ).toBeVisible();
      await expect(
        page.getByText("No fleet partners found.", { exact: true }),
      ).toHaveCount(0);
    },
  );
  await scenario(
    "p5-populated-mixed-retention",
    RECORDS_API,
    () => ({ items: records }),
    async (page) => {
      const surface = await p5Page(page);
      await expect(
        surface.locator("header").getByText("50%", { exact: true }),
      ).toBeVisible();
      for (const record of records) {
        await expect(
          surface.getByRole("table").getByText(record.orderNo, { exact: true }),
        ).toBeVisible();
      }
      await expect(surface.getByTestId("record-detail")).toContainText(
        records[0].orderId,
      );
      await expect(
        surface.getByText(EMPTY_RECORDS, { exact: true }),
      ).toHaveCount(0);
    },
  );
  await scenario(
    "p5-empty",
    RECORDS_API,
    () => ({ items: [] }),
    async (page) => {
      const surface = await p5Page(page);
      await expect(
        surface.getByText(EMPTY_RECORDS, { exact: true }),
      ).toBeVisible();
      await expectUnavailableCoverage(surface);
      await expect(
        surface
          .locator("header")
          .getByText("records in view", { exact: true })
          .locator("..")
          .locator("span")
          .first(),
      ).toHaveText("0");
    },
  );
  for (const failure of [
    {
      name: "p5-denied",
      status: 403,
      code: "AUTH_SCOPE_DENIED",
      title: "Record permission denied",
    },
    {
      name: "p5-unavailable",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      title: "Record authority unavailable",
    },
  ]) {
    await scenario(
      failure.name,
      RECORDS_API,
      () => ({
        ...failure,
        message: `Browser-only ${failure.name}`,
      }),
      async (page) => {
        const surface = await p5Page(page);
        await expect(
          surface.getByText(failure.title, { exact: true }),
        ).toBeVisible();
        await expectUnavailableCoverage(surface);
        await expect(
          surface.getByText(EMPTY_RECORDS, { exact: true }),
        ).toHaveCount(0);
        await expect(surface.getByRole("table")).toHaveCount(0);
        await expect(
          surface
            .locator("header")
            .getByText("records in view", { exact: true })
            .locator(".."),
        ).toContainText("Unavailable");
        if (failure.status === 403) {
          await expect(
            surface.getByText(/Request multi_taxi_records:read/),
          ).toBeVisible();
          await expect(
            surface.getByText("Read authority · not granted", { exact: true }),
          ).toBeVisible();
        } else {
          await expect(
            surface.getByText("Record permission denied", { exact: true }),
          ).toHaveCount(0);
        }
      },
    );
  }

  let releasePending;
  const pendingResponse = new Promise((resolve) => {
    releasePending = resolve;
  });
  await scenario(
    "p5-refresh-pending",
    RECORDS_API,
    (entry) =>
      entry.query.includes("q=browser-only-refresh")
        ? pendingResponse
        : { items: records },
    async (page, evidence) => {
      const surface = await p5Page(page);
      await expect(
        surface.locator("header").getByText("50%", { exact: true }),
      ).toBeVisible();
      await surface.getByRole("searchbox").fill("browser-only-refresh");
      await surface
        .getByRole("button", { name: "Run query", exact: true })
        .click();
      try {
        await expect
          .poll(() =>
            evidence.requests.some((r) =>
              r.query.includes("q=browser-only-refresh"),
            ),
          )
          .toBe(true);
        await expect(
          surface.getByRole("button", {
            name: "Loading records...",
            exact: true,
          }),
        ).toBeDisabled();
        await expectUnavailableCoverage(surface);
        await expect(
          surface.getByText(EMPTY_RECORDS, { exact: true }),
        ).toHaveCount(0);
        evidence.pendingStateObserved = true;
      } finally {
        releasePending({ items: [] });
      }
      await expect(
        surface.getByText(EMPTY_RECORDS, { exact: true }),
      ).toBeVisible();
      await expectUnavailableCoverage(surface);
    },
  );
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.passed = report.scenarios.filter((s) => s.status === "passed").length;
  report.failed = report.scenarios.filter((s) => s.status === "failed").length;
  console.log(JSON.stringify(report, null, 2));
}
