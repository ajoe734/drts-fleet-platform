const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = path.resolve(".artifacts/func-audit");

const PLATFORM_ADMIN_BASE =
  "https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app";
const OPS_CONSOLE_BASE =
  "https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app";

const PLATFORM_ADMIN_ROUTES = [
  { key: "pa-home", path: "/" },
  { key: "pa-tenants", path: "/tenants" },
  { key: "pa-tenant-detail", path: "/tenants/tenant-demo-001" },
  { key: "pa-tenant-governance", path: "/tenant-governance" },
  { key: "pa-partners", path: "/partners" },
  { key: "pa-partner-detail", path: "/partners/bank-demo-alpha-airport" },
  { key: "pa-users", path: "/users" },
  { key: "pa-fleet", path: "/fleet" },
  { key: "pa-switchboard", path: "/switchboard" },
  { key: "pa-pricing", path: "/pricing" },
  { key: "pa-payments", path: "/payments" },
  { key: "pa-reimbursements", path: "/payments/reimbursements" },
  { key: "pa-reimbursement-detail", path: "/payments/reimbursements/batch-1" },
  { key: "pa-adapter-registry", path: "/adapter-registry" },
  { key: "pa-health", path: "/health" },
  { key: "pa-notices", path: "/notices" },
  { key: "pa-audit", path: "/audit" },
  { key: "pa-feature-flags", path: "/feature-flags" },
];

const OPS_CONSOLE_ROUTES = [
  { key: "ops-root", path: "/" },
  { key: "ops-dashboard", path: "/dashboard" },
  { key: "ops-dispatch", path: "/dispatch" },
  { key: "ops-dispatch-detail", path: "/dispatch/OPS-SMOKE-DISPATCH" },
  { key: "ops-callcenter", path: "/callcenter" },
  { key: "ops-complaints", path: "/complaints" },
  { key: "ops-complaints-detail", path: "/complaints/CMP-0908" },
  { key: "ops-incidents", path: "/incidents" },
  { key: "ops-incidents-detail", path: "/incidents/OPS-SMOKE-INCIDENT" },
  { key: "ops-approval-requests", path: "/approval-requests" },
  { key: "ops-reports", path: "/reports" },
  { key: "ops-revenue", path: "/revenue" },
  { key: "ops-attendance", path: "/attendance" },
  { key: "ops-maintenance", path: "/maintenance" },
  { key: "ops-drivers", path: "/drivers" },
  { key: "ops-driver-detail", path: "/drivers/drv-demo-001" },
  { key: "ops-vehicles", path: "/vehicles" },
  { key: "ops-vehicle-detail", path: "/vehicles/veh-demo-001" },
  { key: "ops-contracts", path: "/contracts" },
  { key: "ops-contract-detail", path: "/contracts/contract-demo-001" },
  { key: "ops-feature-flags", path: "/feature-flags" },
];

function safeName(input) {
  return input.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-");
}

async function clickByName(page, name) {
  const link = page.getByRole("link", { name, exact: true });
  if (await link.count()) {
    await link.first().click();
    return;
  }

  const button = page.getByRole("button", { name, exact: true });
  if (await button.count()) {
    await button.first().click();
    return;
  }

  throw new Error(`Unable to find clickable control named "${name}"`);
}

async function captureRoute(page, app, baseUrl, route) {
  const consoleErrors = [];
  const pageErrors = [];
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  const url = `${baseUrl}${route.path}`;
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);

  const bodyText = await page.locator("body").innerText();
  const shellCount = await page.evaluate((currentApp) => {
    const asides = Array.from(document.querySelectorAll("aside"));
    if (currentApp === "platform-admin") {
      return asides.filter((el) =>
        (el.innerText || "").includes("PLATFORM ADMIN"),
      ).length;
    }
    return asides.filter((el) => {
      const text = el.innerText || "";
      return text.includes("營運總覽") || text.includes("Operations Dashboard");
    }).length;
  }, app);

  const screenshot = path.join(OUT_DIR, `${safeName(route.key)}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const bodyHasHardError =
    /Application error|Internal Server Error|This page could not be found|Page Not Found/i.test(
      bodyText,
    );
  const httpStatus = response ? response.status() : null;
  const ok =
    (httpStatus === null || httpStatus < 500) &&
    !bodyHasHardError &&
    shellCount === 1 &&
    pageErrors.length === 0;

  return {
    app,
    key: route.key,
    path: route.path,
    url,
    finalUrl: page.url(),
    httpStatus,
    shellCount,
    consoleErrors,
    pageErrors,
    bodyHasHardError,
    ok,
    screenshot: path.relative(process.cwd(), screenshot),
  };
}

async function verifyPricing(page) {
  const url = `${PLATFORM_ADMIN_BASE}/pricing`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  const beforeUrl = page.url();
  const beforeText = await page.locator("body").innerText();

  await clickByName(page, "Driver Fee Plans");
  await page.waitForTimeout(1200);
  const driverUrl = page.url();
  const driverText = await page.locator("body").innerText();
  const driverOk =
    /tab=driver/.test(driverUrl) &&
    driverText.includes(
      "driver settlement plans remain immutable after publish",
    ) &&
    !beforeText.includes(
      "driver settlement plans remain immutable after publish",
    );
  await page.screenshot({
    path: path.join(OUT_DIR, "pricing-tab-driver.png"),
    fullPage: true,
  });

  await clickByName(page, "Published Versions");
  await page.waitForTimeout(1200);
  const historyUrl = page.url();
  const historyText = await page.locator("body").innerText();
  const historyOk =
    /tab=history/.test(historyUrl) &&
    historyText.includes("cross-tab history") &&
    !beforeText.includes("cross-tab history");
  await page.screenshot({
    path: path.join(OUT_DIR, "pricing-tab-history.png"),
    fullPage: true,
  });

  return {
    name: "pricing-tabs",
    ok: driverOk && historyOk,
    details: {
      beforeUrl,
      driverUrl,
      historyUrl,
      driverMarkerFound: driverText.includes(
        "driver settlement plans remain immutable after publish",
      ),
      historyMarkerFound: historyText.includes("cross-tab history"),
    },
  };
}

async function verifyPayments(page) {
  const url = `${PLATFORM_ADMIN_BASE}/payments`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });

  await page.getByRole("tab", { name: /租戶發票/ }).click();
  await page.waitForTimeout(1000);
  const invoiceSelected = await page
    .getByRole("tab", { name: /租戶發票/ })
    .getAttribute("aria-selected");
  const invoiceText = await page.locator("body").innerText();

  await page.getByRole("tab", { name: /司機結算單/ }).click();
  await page.waitForTimeout(1000);
  const driverSelected = await page
    .getByRole("tab", { name: /司機結算單/ })
    .getAttribute("aria-selected");
  const driverText = await page.locator("body").innerText();

  await page.getByRole("tab", { name: /對帳問題佇列/ }).click();
  await page.waitForTimeout(1000);
  const reconSelected = await page
    .getByRole("tab", { name: /對帳問題佇列/ })
    .getAttribute("aria-selected");

  await page.screenshot({
    path: path.join(OUT_DIR, "payments-tab-roundtrip.png"),
    fullPage: true,
  });

  return {
    name: "payments-tabs",
    ok:
      invoiceSelected === "true" &&
      driverSelected === "true" &&
      reconSelected === "true" &&
      invoiceText.includes("沒有符合篩選條件的租戶 invoice") &&
      driverText.includes("尚未產生司機結算單"),
    details: {
      invoiceSelected,
      driverSelected,
      reconSelected,
    },
  };
}

async function verifyAttendance(page) {
  const url = `${OPS_CONSOLE_BASE}/attendance`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });

  await page.getByRole("link", { name: "本週" }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 90000 })
    .catch(() => {});
  const weekUrl = page.url();

  await page.getByRole("link", { name: "異常" }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 90000 })
    .catch(() => {});
  const exceptionsUrl = page.url();

  await page.getByRole("link", { name: "今日" }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 90000 })
    .catch(() => {});
  const todayUrl = page.url();

  await page.screenshot({
    path: path.join(OUT_DIR, "attendance-tab-roundtrip.png"),
    fullPage: true,
  });

  return {
    name: "attendance-tabs",
    ok:
      weekUrl.endsWith("/attendance?view=week") &&
      exceptionsUrl.endsWith("/attendance?view=exceptions") &&
      todayUrl.endsWith("/attendance"),
    details: { weekUrl, exceptionsUrl, todayUrl },
  };
}

function summarize(results, checks) {
  const grouped = {
    "platform-admin": results.filter((item) => item.app === "platform-admin"),
    "ops-console": results.filter((item) => item.app === "ops-console"),
  };
  const scoreboard = Object.fromEntries(
    Object.entries(grouped).map(([app, rows]) => [
      app,
      {
        routes: rows.length,
        fullyWorking: rows.filter((row) => row.ok).length,
        broken: rows.filter((row) => !row.ok).map((row) => row.path),
      },
    ]),
  );
  return {
    generatedAt: new Date().toISOString(),
    scoreboard,
    results,
    checks,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const results = [];

  for (const route of PLATFORM_ADMIN_ROUTES) {
    console.log(`AUDIT ${route.key} ${route.path}`);
    results.push(
      await captureRoute(page, "platform-admin", PLATFORM_ADMIN_BASE, route),
    );
  }
  for (const route of OPS_CONSOLE_ROUTES) {
    console.log(`AUDIT ${route.key} ${route.path}`);
    results.push(
      await captureRoute(page, "ops-console", OPS_CONSOLE_BASE, route),
    );
  }

  const checks = [
    await verifyPricing(page),
    await verifyPayments(page),
    await verifyAttendance(page),
  ];

  await browser.close();

  const summary = summarize(results, checks);
  fs.writeFileSync(
    path.join(OUT_DIR, "dev-gap-audit-results.json"),
    JSON.stringify(summary, null, 2),
  );

  const lines = [
    `Generated: ${summary.generatedAt}`,
    "",
    "| App | Routes | Fully working | Broken |",
    "| --- | ---: | ---: | --- |",
    `| Platform Admin | ${summary.scoreboard["platform-admin"].routes} | ${summary.scoreboard["platform-admin"].fullyWorking} | ${summary.scoreboard["platform-admin"].broken.join(", ") || "none"} |`,
    `| Ops Console | ${summary.scoreboard["ops-console"].routes} | ${summary.scoreboard["ops-console"].fullyWorking} | ${summary.scoreboard["ops-console"].broken.join(", ") || "none"} |`,
    "",
    "Checks:",
  ];
  for (const check of checks) {
    lines.push(`- ${check.name}: ${check.ok ? "PASS" : "FAIL"}`);
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "dev-gap-audit-summary.md"),
    `${lines.join("\n")}\n`,
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
