import { expect, test, type Locator, type Page } from "@playwright/test";

type Surface = "ops" | "platform";

type RouteSpec = {
  key: string;
  path: string;
  surface: Surface;
  expectedPath?: string;
};

type ClientDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
};

const OPS_ROUTES: readonly RouteSpec[] = [
  {
    key: "root-redirect",
    path: "/",
    expectedPath: "/dashboard",
    surface: "ops",
  },
  { key: "dashboard", path: "/dashboard", surface: "ops" },
  { key: "dispatch", path: "/dispatch", surface: "ops" },
  {
    key: "dispatch-detail",
    path: "/dispatch/OPS-SMOKE-DISPATCH",
    surface: "ops",
  },
  { key: "callcenter", path: "/callcenter", surface: "ops" },
  { key: "complaints", path: "/complaints", surface: "ops" },
  {
    key: "complaint-detail",
    path: "/complaints/CMP-0908",
    surface: "ops",
  },
  { key: "incidents", path: "/incidents", surface: "ops" },
  {
    key: "incident-detail",
    path: "/incidents/OPS-SMOKE-INCIDENT",
    surface: "ops",
  },
  {
    key: "approval-requests",
    path: "/approval-requests",
    surface: "ops",
  },
  { key: "reports", path: "/reports", surface: "ops" },
  { key: "revenue", path: "/revenue", surface: "ops" },
  { key: "attendance", path: "/attendance", surface: "ops" },
  { key: "maintenance", path: "/maintenance", surface: "ops" },
  { key: "drivers", path: "/drivers", surface: "ops" },
  { key: "driver-detail", path: "/drivers/drv-demo-001", surface: "ops" },
  { key: "vehicles", path: "/vehicles", surface: "ops" },
  { key: "vehicle-detail", path: "/vehicles/veh-demo-001", surface: "ops" },
  { key: "contracts", path: "/contracts", surface: "ops" },
  {
    key: "contract-detail",
    path: "/contracts/contract-demo-001",
    surface: "ops",
  },
  { key: "feature-flags", path: "/feature-flags", surface: "ops" },
];

const PLATFORM_ROUTES: readonly RouteSpec[] = [
  { key: "home", path: "/", surface: "platform" },
  { key: "tenants", path: "/tenants", surface: "platform" },
  {
    key: "tenant-governance",
    path: "/tenant-governance",
    surface: "platform",
  },
  { key: "partners", path: "/partners", surface: "platform" },
  { key: "fleet-partners", path: "/fleet-partners", surface: "platform" },
  { key: "fleet", path: "/fleet", surface: "platform" },
  {
    key: "vehicle-eligibility",
    path: "/vehicle-eligibility",
    surface: "platform",
  },
  {
    key: "service-products",
    path: "/service-products",
    surface: "platform",
  },
  { key: "pricing", path: "/pricing", surface: "platform" },
  { key: "payments", path: "/payments", surface: "platform" },
  {
    key: "reimbursements",
    path: "/payments/reimbursements",
    surface: "platform",
  },
  {
    key: "adapter-registry",
    path: "/adapter-registry",
    surface: "platform",
  },
  { key: "health", path: "/health", surface: "platform" },
  { key: "notices", path: "/notices", surface: "platform" },
  { key: "audit", path: "/audit", surface: "platform" },
  { key: "feature-flags", path: "/feature-flags", surface: "platform" },
  { key: "users", path: "/users", surface: "platform" },
  { key: "switchboard", path: "/switchboard", surface: "platform" },
];

const ALL_ROUTES = [...OPS_ROUTES, ...PLATFORM_ROUTES];
if (ALL_ROUTES.length !== 39) {
  throw new Error(
    `Deterministic route registry must contain 39 routes; found ${ALL_ROUTES.length}.`,
  );
}

const ignoredConsoleError =
  /favicon|Failed to load resource: the server responded with a status of 404|Download the React DevTools/i;
const destructiveControl =
  /delete|remove|deactivate|archive|revoke|disable|terminate|reject|publish|rollback|approve|assign|resolve|reopen|submit|save|confirm|issue|settle|刪除|停用|終止|退回|駁回|發佈|核准|付款|指派|處理|儲存|送出|確認|開立|結案/i;

function installDiagnostics(page: Page): ClientDiagnostics {
  const diagnostics: ClientDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
  };

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !ignoredConsoleError.test(message.text())
    ) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => undefined);
  });

  return diagnostics;
}

async function gotoRoute(page: Page, spec: RouteSpec) {
  const response = await page.goto(spec.path, {
    waitUntil: "domcontentloaded",
  });
  expect(
    response?.ok(),
    `${spec.surface}:${spec.path} returned ${response?.status() ?? "no response"}`,
  ).toBeTruthy();

  if (spec.expectedPath) {
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegex(spec.expectedPath)}(?:$|[?#])`),
    );
  }

  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(
    /Application error|Unhandled Runtime Error|Internal Server Error|404: This page could not be found/i,
  );
}

async function assertSingleShell(page: Page, surface: Surface) {
  const navigationName =
    surface === "ops"
      ? /Canvas navigation/
      : /Platform Admin navigation|平台管理導覽/;
  await expect(page.getByLabel(navigationName)).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
}

async function exerciseTabRoundTrip(page: Page) {
  const tabs = page.getByRole("tab");
  const visibleTabs: Locator[] = [];
  for (let index = 0; index < (await tabs.count()); index += 1) {
    const tab = tabs.nth(index);
    if (
      (await tab.isVisible().catch(() => false)) &&
      (await tab.isEnabled().catch(() => false))
    ) {
      visibleTabs.push(tab);
    }
    if (visibleTabs.length === 2) {
      break;
    }
  }
  if (visibleTabs.length < 2) {
    return;
  }

  const [first, second] = visibleTabs as [Locator, Locator];
  await second.click();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await first.click();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("main")).toHaveCount(1);
}

async function closeOpenDialog(page: Page) {
  const dialog = page.getByRole("dialog").first();
  if (
    (await dialog.count()) === 0 ||
    !(await dialog.isVisible().catch(() => false))
  ) {
    return;
  }

  const closeButton = dialog
    .getByRole("button", {
      name: /Close|Cancel|Done|Back|關閉|取消|完成|返回/i,
    })
    .first();
  if (
    (await closeButton.count()) > 0 &&
    (await closeButton.isVisible().catch(() => false))
  ) {
    await closeButton.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(dialog).toBeHidden();
}

async function exerciseModal(page: Page) {
  const trigger = page
    .getByRole("button", {
      name: /Create|Add|Invite|New|建立|新增|邀請/i,
    })
    .first();
  if (
    (await trigger.count()) === 0 ||
    !(await trigger.isVisible().catch(() => false)) ||
    !(await trigger.isEnabled().catch(() => false))
  ) {
    return;
  }

  const isActionable = await trigger
    .click({ trial: true, timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (!isActionable) {
    return;
  }

  await trigger.click({ timeout: 3_000 });
  const dialog = page.getByRole("dialog").first();
  if (
    (await dialog.count()) > 0 &&
    (await dialog.isVisible().catch(() => false))
  ) {
    await closeOpenDialog(page);
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(page.locator("main")).toHaveCount(1);
}

async function exerciseSafeButton(page: Page) {
  const buttons = page.locator("main button");
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const button = buttons.nth(index);
    const name = (
      (await button.getAttribute("aria-label")) ??
      (await button.innerText().catch(() => ""))
    ).trim();
    if (
      !name ||
      destructiveControl.test(name) ||
      !(await button.isVisible().catch(() => false)) ||
      !(await button.isEnabled().catch(() => false))
    ) {
      continue;
    }

    const isActionable = await button
      .click({ trial: true, timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (!isActionable) {
      continue;
    }

    await button.click({ timeout: 3_000, noWaitAfter: true });
    await closeOpenDialog(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    await expect(page.locator("main")).toHaveCount(1);
    return;
  }
}

async function runRoute(page: Page, spec: RouteSpec) {
  const diagnostics = installDiagnostics(page);
  await gotoRoute(page, spec);
  await assertSingleShell(page, spec.surface);
  await exerciseTabRoundTrip(page);
  await exerciseSafeButton(page);
  await exerciseModal(page);
  await page.waitForTimeout(100);

  expect
    .soft(
      diagnostics.pageErrors,
      `${spec.surface}:${spec.path} emitted pageerror`,
    )
    .toEqual([]);
  expect
    .soft(
      diagnostics.consoleErrors,
      `${spec.surface}:${spec.path} emitted console.error`,
    )
    .toEqual([]);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("deterministic route suite — ops console", () => {
  for (const spec of OPS_ROUTES) {
    test(spec.key, async ({ page }) => {
      await runRoute(page, spec);
    });
  }
});

test.describe("deterministic route suite — platform admin", () => {
  for (const spec of PLATFORM_ROUTES) {
    test(spec.key, async ({ page }) => {
      await runRoute(page, spec);
    });
  }
});
