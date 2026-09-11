import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const portal =
  process.env.ENTERPRISE_SEARCH_PORTAL_URL || "http://127.0.0.1:3010";
const evidenceDir = resolve(
  process.env.ENTERPRISE_SEARCH_BROWSER_EVIDENCE_DIR ||
    ".artifacts/enterprise-search-acceptance/browser",
);
const sessions: Record<
  "a" | "b" | "empty",
  { token: string; tenantId: string; expiredToken: string }
> & { wrongRealm: string } = JSON.parse(
  readFileSync(resolve(evidenceDir, "sessions.private.json"), "utf8"),
);
const seed: { rows: Array<{ bookingId: string; tenantId: string }> } =
  JSON.parse(readFileSync(resolve(evidenceDir, "seed-sql.json"), "utf8"));
const apiPath = "/control-plane-proxy/api/tenant/bookings";

test.use({ trace: "off" }); // Do not upload session-cookie contents in traces.

async function contextFor(
  browser: Browser,
  token = sessions.a.token,
): Promise<BrowserContext> {
  const context = await browser.newContext({ locale: "zh-TW" });
  if (token)
    await context.addCookies([
      {
        name: "drts_tenant_session",
        value: token,
        url: portal,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  return context;
}

function rowLocator(page: Page) {
  return page.locator('[data-testid^="enterprise-booking-row-"]');
}
async function rowIds(page: Page) {
  return rowLocator(page).evaluateAll((elements) =>
    elements.map((el) =>
      el.getAttribute("data-testid")!.replace("enterprise-booking-row-", ""),
    ),
  );
}
async function expectTotal(page: Page, total: number, count: number) {
  await expect(page.getByTestId("enterprise-result-count")).toHaveAttribute(
    "data-total-items",
    String(total),
  );
  await expect(rowLocator(page)).toHaveCount(count);
}

// Record actual browser requests/responses, not constructed test queries or fixture answers.
function observe(page: Page) {
  const responses: unknown[] = [];
  const pending: Promise<void>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (!response.url().includes(apiPath)) return;
    pending.push(
      (async () => {
        try {
          const payload = await response.json();
          const data = payload.data;
          responses.push({
            url: response.url(),
            status: response.status(),
            pagination: data?.pagination ?? null,
            bookingIds:
              data?.items?.map(
                (item: { booking_id?: string; bookingId?: string }) =>
                  item.booking_id ?? item.bookingId,
              ) ?? [],
            error: payload.error ?? null,
          });
        } catch {
          /* Aborted requests have no complete JSON body; successful assertions still require real responses. */
        }
      })(),
    );
  });
  return async (name: string) => {
    await Promise.all(pending);
    writeFileSync(
      resolve(evidenceDir, `${name}.json`),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          responses,
          browserErrors: errors,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  };
}

test("combined filters use actual HTTP totals, reset page, respect timezone boundaries, and clear", async ({
  browser,
}) => {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const save = observe(page);
  try {
    const healthRequest = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/control-plane-proxy/health",
    );
    const navigation = await page.goto(`${portal}/bookings`);
    const healthResponse = await healthRequest;
    expect(healthResponse.status()).toBe(200);
    const healthPayload = await healthResponse.json();
    expect(healthPayload.status).toBe("ok");
    expect(healthPayload.candidate_sha).toBe(process.env.CANDIDATE_SHA);
    writeFileSync(
      resolve(evidenceDir, "api-health-evidence.json"),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          status: healthResponse.status(),
          body: healthPayload,
        },
        null,
        2,
      ),
    );
    expect(navigation?.headers()["x-drts-candidate-sha"]).toBe(
      process.env.CANDIDATE_SHA,
    );
    await expectTotal(page, 25, 10);
    await page.getByTestId("enterprise-page-size").selectOption("5");
    await expectTotal(page, 25, 5);
    await page.getByTestId("enterprise-page-next").click();
    await expect(page.getByTestId("enterprise-result-count")).toContainText(
      "6-10",
    );
    await page.getByTestId("enterprise-search-input").fill("Alpha");
    await expectTotal(page, 12, 5);
    await expect(page.getByTestId("enterprise-page-prev")).toBeDisabled();
    await page.getByTestId("enterprise-status-select").selectOption("active");
    await expectTotal(page, 10, 5);
    await page.getByTestId("enterprise-date-from").fill("2026-09-10");
    await page.getByTestId("enterprise-date-to").fill("2026-09-11");
    await expectTotal(page, 10, 5);
    await expect(page.getByTestId("enterprise-search-timezone")).toHaveText(
      "Asia/Taipei",
    );
    const actualQuery = page.waitForResponse(
      (response) =>
        response.url().includes(apiPath) &&
        new URL(response.url()).searchParams.get("dateFrom") ===
          "2026-09-11T00:00:00+08:00",
    );
    await page.getByTestId("enterprise-date-from").fill("2026-09-11");
    const response = await actualQuery;
    expect(response.status()).toBe(200);
    const params = new URL(response.url()).searchParams;
    expect(params.get("dateFrom")).toBe("2026-09-11T00:00:00+08:00");
    expect(params.get("dateTo")).toBe("2026-09-12T00:00:00+08:00");
    expect(new Date(params.get("dateFrom")!).toISOString()).toBe(
      "2026-09-10T16:00:00.000Z",
    );
    expect(new Date(params.get("dateTo")!).toISOString()).toBe(
      "2026-09-11T16:00:00.000Z",
    );
    expect(params.get("passenger")).toBe("Alpha");
    expect(params.get("status")).toBe("active");
    expect(params.get("page")).toBe("1");
    await expectTotal(page, 5, 5);
    await page.getByTestId("enterprise-clear-filters").click();
    await expectTotal(page, 25, 5);
    await expect(page.getByTestId("enterprise-search-input")).toHaveValue("");
    await expect(page.getByTestId("enterprise-status-select")).toHaveValue("");
    await expect(page.getByTestId("enterprise-date-from")).toHaveValue("");
    await expect(page.getByTestId("enterprise-date-to")).toHaveValue("");
    await page.screenshot({
      path: resolve(evidenceDir, "filters-cleared.png"),
      fullPage: true,
    });
    await save("combined-filter-http-evidence");
  } finally {
    await context.close();
  }
});

test("all three UI pages contain exactly tenant A's persisted bookings without duplication or leakage", async ({
  browser,
}) => {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const save = observe(page);
  try {
    await page.goto(`${portal}/bookings`);
    await expectTotal(page, 25, 10);
    const all = [...(await rowIds(page))];
    await page.getByTestId("enterprise-page-next").click();
    await expect(page.getByTestId("enterprise-result-count")).toContainText(
      "11-20",
    );
    all.push(...(await rowIds(page)));
    await page.getByTestId("enterprise-page-next").click();
    await expectTotal(page, 25, 5);
    await expect(page.getByTestId("enterprise-result-count")).toContainText(
      "21-25",
    );
    all.push(...(await rowIds(page)));
    expect(new Set(all).size).toBe(25);
    expect(all.sort()).toEqual(
      seed.rows
        .filter((row) => row.tenantId === sessions.a.tenantId)
        .map((row) => row.bookingId)
        .sort(),
    );
    await expect(page.getByText("Other Tenant Secret")).toHaveCount(0);
    await expect(page.getByTestId("enterprise-page-next")).toBeDisabled();
    await save("pagination-http-evidence");
  } finally {
    await context.close();
  }
});

test("filtered empty and an actually empty authenticated tenant have distinct UI states", async ({
  browser,
}) => {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const save = observe(page);
  try {
    await page.goto(`${portal}/bookings`);
    await expectTotal(page, 25, 10);
    await page
      .getByTestId("enterprise-search-input")
      .fill("nonexistent-passenger-marker");
    await expect(
      page.getByTestId("enterprise-filtered-empty-state"),
    ).toBeVisible();
    await expect(page.getByTestId("enterprise-empty-state")).toHaveCount(0);
    await page.getByTestId("enterprise-filter-empty-clear").click();
    await expectTotal(page, 25, 10);
    await save("empty-filter-http-evidence");
  } finally {
    await context.close();
  }
  const emptyContext = await contextFor(browser, sessions.empty.token);
  const emptyPage = await emptyContext.newPage();
  try {
    await emptyPage.goto(`${portal}/bookings`);
    await expect(emptyPage.getByTestId("enterprise-empty-state")).toBeVisible();
    await expect(
      emptyPage.getByTestId("enterprise-filtered-empty-state"),
    ).toHaveCount(0);
    await emptyPage.screenshot({
      path: resolve(evidenceDir, "empty-tenant.png"),
      fullPage: true,
    });
  } finally {
    await emptyContext.close();
  }
});

test("real verified tenant B sees only its own data and cannot select tenant A", async ({
  browser,
}) => {
  const context = await contextFor(browser, sessions.b.token);
  const page = await context.newPage();
  try {
    await page.goto(`${portal}/bookings`);
    await expectTotal(page, 3, 3);
    expect((await rowIds(page)).sort()).toEqual(
      seed.rows
        .filter((row) => row.tenantId === sessions.b.tenantId)
        .map((row) => row.bookingId)
        .sort(),
    );
    const mismatch = await context.request.get(
      `${portal}${apiPath}?page=1&pageSize=10`,
      { headers: { "x-tenant-id": sessions.a.tenantId } },
    );
    expect(mismatch.status()).toBe(403);
    const mismatchBody = await mismatch.json();
    expect(mismatchBody.error).toBe("TENANT_SCOPE_MISMATCH");
    writeFileSync(
      resolve(evidenceDir, "tenant-isolation-evidence.json"),
      JSON.stringify(
        {
          candidateSha: process.env.CANDIDATE_SHA,
          visibleBookingIds: await rowIds(page),
          attemptedTenant: sessions.a.tenantId,
          verifiedTenant: sessions.b.tenantId,
          status: mismatch.status(),
          error: mismatchBody.error,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("missing, genuinely expired, and wrong-realm sessions cannot render or query tenant bookings", async ({
  browser,
}) => {
  const evidence: unknown[] = [];
  for (const [name, token, expected] of [
    ["missing", "", 401],
    ["expired", sessions.a.expiredToken, 401],
    ["wrong-realm", sessions.wrongRealm, 403],
  ] as const) {
    const context = await contextFor(browser, token);
    const page = await context.newPage();
    try {
      const response = await context.request.get(
        `${portal}${apiPath}?page=1&pageSize=10`,
      );
      expect(response.status(), name).toBe(expected);
      await page.goto(`${portal}/bookings`);
      await expect(
        page.getByTestId("enterprise-search-auth-required"),
      ).toBeVisible();
      await expect(rowLocator(page)).toHaveCount(0);
      evidence.push({
        name,
        status: response.status(),
        body: await response.json(),
        authRequired: true,
        visibleBookingIds: await rowIds(page),
      });
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    resolve(evidenceDir, "authentication-negatives-evidence.json"),
    JSON.stringify(
      { candidateSha: process.env.CANDIDATE_SHA, cases: evidence },
      null,
      2,
    ),
  );
});

test("invalid date range stops queries and rapidly changed filters do not retain stale results", async ({
  browser,
}) => {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const save = observe(page);
  try {
    await page.goto(`${portal}/bookings`);
    await expectTotal(page, 25, 10);
    await page.getByTestId("enterprise-date-to").fill("2026-09-10");
    await page.getByTestId("enterprise-date-from").fill("2026-09-20");
    await expect(page.getByTestId("enterprise-date-range-error")).toBeVisible();
    await expect(rowLocator(page)).toHaveCount(0);
    await page.getByTestId("enterprise-clear-filters").click();
    await expectTotal(page, 25, 10);
    // Delay only dispatch of an actual request; no response or API data is mocked.
    let observedAlpha!: () => void;
    const alphaRequested = new Promise<void>((resolve) => {
      observedAlpha = resolve;
    });
    await page.route(`**${apiPath}?**`, async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("passenger") === "Alpha"
      ) {
        observedAlpha();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await route.continue().catch(() => {}); // AbortController legitimately cancels an obsolete request.
    });
    await page.getByTestId("enterprise-search-input").fill("Alpha");
    await alphaRequested;
    await page.getByTestId("enterprise-search-input").fill("Beta");
    await expectTotal(page, 13, 10);
    await page.waitForTimeout(500);
    await expectTotal(page, 13, 10);
    await expect(
      page.getByText("Alpha Passenger", { exact: true }),
    ).toHaveCount(0);
    await save("date-and-stale-http-evidence");
  } finally {
    await context.close();
  }
});

test("loading and a real API validation failure are visible, and retry retrieves genuine data", async ({
  browser,
}) => {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const save = observe(page);
  let first = true;
  let releaseFirst!: () => void;
  const readyToFail = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route(`**${apiPath}?**`, async (route) => {
    if (first) {
      first = false;
      await readyToFail;
      // Fault injection changes an actual HTTP query; the real API returns its own 400.
      const url = new URL(route.request().url());
      url.searchParams.set("page", "0");
      await route.continue({ url: url.href });
    } else await route.continue();
  });
  try {
    await page.goto(`${portal}/bookings`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("enterprise-search-loading")).toBeVisible();
    releaseFirst();
    await expect(
      page.getByTestId("enterprise-booking-api-state"),
    ).toBeVisible();
    await page.getByTestId("enterprise-search-retry").click();
    await expectTotal(page, 25, 10);
    await save("loading-error-retry-http-evidence");
  } finally {
    releaseFirst();
    await context.close();
  }
});
