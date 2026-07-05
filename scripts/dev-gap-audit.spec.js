const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const PLATFORM_ADMIN_BASE_URL =
  "https://drts-dev-platform-admin-web-ne55h7sy3a-uc.a.run.app";
const OPS_BASE_URL = "https://drts-dev-ops-console-web-ne55h7sy3a-uc.a.run.app";
const ARTIFACT_DIR = path.join(process.cwd(), ".artifacts", "func-audit");

const platformAdminRoutes = [
  { key: "home", path: "/", app: "platform-admin" },
  { key: "tenants", path: "/tenants", app: "platform-admin" },
  { key: "tenant-detail", path: "/tenants/tnt-1", app: "platform-admin" },
  {
    key: "tenant-governance",
    path: "/tenant-governance",
    app: "platform-admin",
  },
  { key: "partners", path: "/partners", app: "platform-admin" },
  {
    key: "partner-detail",
    path: "/partners/acme-demo",
    app: "platform-admin",
  },
  { key: "users", path: "/users", app: "platform-admin" },
  { key: "fleet", path: "/fleet", app: "platform-admin" },
  { key: "switchboard", path: "/switchboard", app: "platform-admin" },
  { key: "pricing", path: "/pricing", app: "platform-admin" },
  { key: "payments", path: "/payments", app: "platform-admin" },
  {
    key: "reimbursements",
    path: "/payments/reimbursements",
    app: "platform-admin",
  },
  {
    key: "reimbursement-batch-detail",
    path: "/payments/reimbursements/batch-99",
    app: "platform-admin",
  },
  {
    key: "adapter-registry",
    path: "/adapter-registry",
    app: "platform-admin",
  },
  { key: "health", path: "/health", app: "platform-admin" },
  { key: "notices", path: "/notices", app: "platform-admin" },
  { key: "audit", path: "/audit", app: "platform-admin" },
  { key: "feature-flags", path: "/feature-flags", app: "platform-admin" },
];

const opsRoutes = [
  { key: "root", path: "/", app: "ops-console" },
  { key: "dashboard", path: "/dashboard", app: "ops-console" },
  { key: "dispatch-list", path: "/dispatch", app: "ops-console" },
  {
    key: "dispatch-detail",
    path: "/dispatch/OPS-SMOKE-DISPATCH",
    app: "ops-console",
  },
  { key: "callcenter", path: "/callcenter", app: "ops-console" },
  { key: "complaints-list", path: "/complaints", app: "ops-console" },
  {
    key: "complaints-detail",
    path: "/complaints/CMP-0908",
    app: "ops-console",
  },
  { key: "incidents-list", path: "/incidents", app: "ops-console" },
  {
    key: "incidents-detail",
    path: "/incidents/OPS-SMOKE-INCIDENT",
    app: "ops-console",
  },
  {
    key: "approval-requests",
    path: "/approval-requests",
    app: "ops-console",
  },
  { key: "reports", path: "/reports", app: "ops-console" },
  { key: "revenue", path: "/revenue", app: "ops-console" },
  { key: "attendance", path: "/attendance", app: "ops-console" },
  { key: "maintenance", path: "/maintenance", app: "ops-console" },
  { key: "drivers-list", path: "/drivers", app: "ops-console" },
  {
    key: "drivers-detail",
    path: "/drivers/DRV-001",
    app: "ops-console",
  },
  { key: "vehicles-list", path: "/vehicles", app: "ops-console" },
  {
    key: "vehicles-detail",
    path: "/vehicles/veh-demo-001",
    app: "ops-console",
  },
  { key: "contracts-list", path: "/contracts", app: "ops-console" },
  {
    key: "contracts-detail",
    path: "/contracts/CTR-310",
    app: "ops-console",
  },
  { key: "feature-flags", path: "/feature-flags", app: "ops-console" },
];

const allRoutes = [...platformAdminRoutes, ...opsRoutes];

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function sanitizePathname(pathname) {
  if (pathname === "/") {
    return "root";
  }
  return pathname
    .replace(/^\//, "")
    .replace(/[/?=&]+/g, "-")
    .replace(/-+/g, "-");
}

function screenshotName(app, pathname) {
  return `${app}-${sanitizePathname(pathname)}.png`;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function resultLabel(result) {
  if (!result.httpOk) {
    return `HTTP ${result.httpStatus}`;
  }
  if (!result.shellOk) {
    return "shell mismatch";
  }
  if (!result.bodyOk) {
    return "body error";
  }
  return "OK";
}

async function countVisible(page, selector) {
  return await page.locator(selector).filter({ visible: true }).count();
}

async function auditRoute(page, route) {
  const baseUrl =
    route.app === "platform-admin" ? PLATFORM_ADMIN_BASE_URL : OPS_BASE_URL;
  const url = `${baseUrl}${route.path}`;
  const errors = [];

  const consoleMessages = [];
  const pageErrors = [];
  const onConsole = (message) => {
    const type = message.type();
    if (type === "error") {
      consoleMessages.push(message.text());
    }
  };
  const onPageError = (error) => {
    pageErrors.push(String(error));
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  const httpStatus = response ? response.status() : null;
  const finalUrl = page.url();
  const bodyText = await page.locator("body").innerText();
  const bodyOk =
    !/Application error|Internal Server Error|Unhandled Runtime Error/i.test(
      bodyText,
    );
  if (!bodyOk) {
    errors.push("body_error_text");
  }

  const platformNavCount = await countVisible(
    page,
    'nav[aria-label="Platform Admin navigation"], nav[aria-label="平台管理導覽"]',
  );
  const visibleAsides = await countVisible(page, "aside");

  let shellOk = false;
  let shellCount = 0;

  if (route.app === "platform-admin") {
    shellCount = platformNavCount;
    shellOk = platformNavCount === 1 && visibleAsides === 1;
    if (!shellOk) {
      errors.push(`platform_shell_count=${platformNavCount}`);
      errors.push(`visible_asides=${visibleAsides}`);
    }
  } else {
    shellCount = visibleAsides;
    shellOk = visibleAsides === 1;
    if (!shellOk) {
      errors.push(`visible_asides=${visibleAsides}`);
    }
  }

  const httpOk = httpStatus !== null && httpStatus < 500;
  if (!httpOk) {
    errors.push(`http_status=${httpStatus}`);
  }

  const screenshotPath = path.join(
    ARTIFACT_DIR,
    screenshotName(route.app, route.path),
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    app: route.app,
    key: route.key,
    path: route.path,
    url,
    finalUrl,
    httpStatus,
    httpOk,
    shellCount,
    shellOk,
    bodyOk,
    consoleErrors: consoleMessages.slice(0, 20),
    pageErrors: pageErrors.slice(0, 20),
    screenshot: path.relative(process.cwd(), screenshotPath),
    errors,
  };
}

async function clickTabByText(page, label) {
  const roleTab = page.getByRole("tab", { name: label }).first();
  if (await roleTab.count()) {
    await expect(roleTab).toBeVisible();
    await roleTab.click();
    await page.waitForTimeout(800);
    return;
  }

  const button = page.getByRole("button", { name: label }).first();
  if (await button.count()) {
    await expect(button).toBeVisible();
    await button.click();
    await page.waitForTimeout(800);
    return;
  }

  const text = page.getByText(label).first();
  await expect(text).toBeVisible();
  await text.click();
  await page.waitForTimeout(800);
}

async function assertUrlEndsWith(page, expected) {
  await expect
    .poll(async () => {
      const current = new URL(page.url());
      return `${current.pathname}${current.search}`;
    })
    .toBe(expected);
}

async function writeSummary(results) {
  return writeSummaryWithChecks(results, {});
}

async function writeSummaryWithChecks(results, checks) {
  const byApp = {
    "platform-admin": results.filter((route) => route.app === "platform-admin"),
    "ops-console": results.filter((route) => route.app === "ops-console"),
  };

  const rows = Object.entries(byApp).map(([app, routes]) => {
    const broken = routes.filter(
      (route) => !route.httpOk || !route.shellOk || !route.bodyOk,
    );
    return {
      app,
      routes: routes.length,
      fullyWorking: routes.length - broken.length,
      broken,
    };
  });

  const summaryLines = [
    "# Dev gap audit summary",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Platform Admin base URL: ${PLATFORM_ADMIN_BASE_URL}`,
    `- Ops Console base URL: ${OPS_BASE_URL}`,
    "",
    "| App | Routes | Fully working | Broken |",
    "| --- | ---: | ---: | --- |",
  ];

  for (const row of rows) {
    const brokenLabel =
      row.broken.length === 0
        ? "none"
        : row.broken
            .map((route) => `\`${route.path}\` (${resultLabel(route)})`)
            .join(", ");
    summaryLines.push(
      `| ${row.app} | ${row.routes} | ${row.fullyWorking} | ${brokenLabel} |`,
    );
  }

  const brokenRoutes = results.filter(
    (route) => !route.httpOk || !route.shellOk || !route.bodyOk,
  );
  summaryLines.push("");
  summaryLines.push(
    `- Total broken routes: ${brokenRoutes.length} / ${results.length}`,
  );

  if (brokenRoutes.length > 0) {
    summaryLines.push("");
    summaryLines.push("## Broken routes");
    summaryLines.push("");
    for (const route of brokenRoutes) {
      summaryLines.push(
        `- ${route.app} ${route.path}: ${resultLabel(route)}; screenshot \`${route.screenshot}\``,
      );
    }
  }

  const failedChecks = Object.entries(checks).filter(
    ([, value]) => value && value.status !== "pass",
  );

  if (failedChecks.length > 0) {
    summaryLines.push("");
    summaryLines.push("## Manual checks");
    summaryLines.push("");
    for (const [name, value] of failedChecks) {
      summaryLines.push(`- ${name}: ${value.status} — ${value.message}`);
    }
  }

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "dev-gap-audit-summary.md"),
    `${summaryLines.join("\n")}\n`,
    "utf8",
  );
}

test.describe("live dev gap audit", () => {
  test.setTimeout(300_000);

  test("re-audits all 39 routes and critical tab strips", async ({
    browser,
  }) => {
    ensureArtifactDir();

    const context = await browser.newContext({
      viewport: { width: 1440, height: 950 },
    });
    const page = await context.newPage();

    const routeResults = [];
    for (const route of allRoutes) {
      routeResults.push(await auditRoute(page, route));
    }

    const checks = {};

    try {
      await page.goto(`${PLATFORM_ADMIN_BASE_URL}/pricing`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
      await clickTabByText(page, /Driver Fee Plans|司機費用方案/);
      await assertUrlEndsWith(page, "/pricing?tab=driver");
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "pricing-tab-driver.png"),
        fullPage: true,
      });
      await clickTabByText(page, /Published Versions|已發布版本/);
      await assertUrlEndsWith(page, "/pricing?tab=history");
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "pricing-tab-history.png"),
        fullPage: true,
      });
      await clickTabByText(page, /Passenger Pricing|乘客定價/);
      await assertUrlEndsWith(page, "/pricing?tab=passenger");
      checks.pricingTabs = { status: "pass", message: "tab query sync works" };
    } catch (error) {
      checks.pricingTabs = {
        status: "fail",
        message: stripAnsi(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }

    try {
      await page.goto(`${PLATFORM_ADMIN_BASE_URL}/payments`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
      await clickTabByText(page, /Invoices|租戶發票/);
      await expect(
        page.getByRole("tab", { name: /Invoices|租戶發票/ }),
      ).toHaveAttribute("aria-selected", "true");
      await clickTabByText(page, "司機結算單");
      await expect(
        page.getByRole("tab", { name: "司機結算單" }),
      ).toHaveAttribute("aria-selected", "true");
      await clickTabByText(page, /報銷/);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/payments/reimbursements");
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "payments-tab-roundtrip.png"),
        fullPage: true,
      });
      checks.paymentsTabs = {
        status: "pass",
        message: "payments tabs and route handoff work",
      };
    } catch (error) {
      checks.paymentsTabs = {
        status: "fail",
        message: stripAnsi(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }

    try {
      await page.goto(`${OPS_BASE_URL}/attendance`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
      await clickTabByText(page, "本週");
      await assertUrlEndsWith(page, "/attendance?view=week");
      await clickTabByText(page, "異常");
      await assertUrlEndsWith(page, "/attendance?view=exceptions");
      await clickTabByText(page, "今日");
      await assertUrlEndsWith(page, "/attendance");
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "attendance-tab-roundtrip.png"),
        fullPage: true,
      });
      checks.attendanceTabs = {
        status: "pass",
        message: "attendance tab query sync works",
      };
    } catch (error) {
      checks.attendanceTabs = {
        status: "fail",
        message: stripAnsi(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }

    const result = {
      generatedAt: new Date().toISOString(),
      platformAdminBaseUrl: PLATFORM_ADMIN_BASE_URL,
      opsBaseUrl: OPS_BASE_URL,
      totals: {
        routes: allRoutes.length,
        platformAdmin: platformAdminRoutes.length,
        opsConsole: opsRoutes.length,
      },
      checks,
      routes: routeResults,
    };

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "dev-gap-audit-results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    await writeSummaryWithChecks(routeResults, checks);

    const brokenRoutes = routeResults.filter(
      (route) => !route.httpOk || !route.shellOk || !route.bodyOk,
    );
    const failedChecks = Object.values(checks).filter(
      (value) => value.status !== "pass",
    );

    await context.close();

    expect(brokenRoutes, JSON.stringify(brokenRoutes, null, 2)).toEqual([]);
    expect(failedChecks, JSON.stringify(failedChecks, null, 2)).toEqual([]);
  });
});
