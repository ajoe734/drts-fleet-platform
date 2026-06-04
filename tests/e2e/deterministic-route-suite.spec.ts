import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

type Surface = "ops" | "admin";

type RouteSpec = {
  name: string;
  path: string;
  surface: Surface;
  expectedPath?: string;
  tabLabels?: [RegExp, RegExp];
  tabButtonIndexes?: [number, number];
  modalTrigger?: RegExp;
  buttonLabel?: RegExp;
};

type ClientDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
};

const OPS_PROJECT = "ops-assistant-on";
const ADMIN_PROJECT = "platform-admin-assistant-off";

const OPS_ROUTES: RouteSpec[] = [
  {
    name: "root redirect",
    path: "/",
    surface: "ops",
    expectedPath: "/dashboard",
  },
  { name: "dashboard", path: "/dashboard", surface: "ops" },
  { name: "dispatch list", path: "/dispatch", surface: "ops" },
  {
    name: "dispatch detail",
    path: "/dispatch/OPS-SMOKE-DISPATCH",
    surface: "ops",
  },
  {
    name: "callcenter",
    path: "/callcenter",
    surface: "ops",
    tabLabels: [/Sessions|當前 session/i, /Callback queue|Callback 佇列/i],
    buttonLabel: /Open|Hide intake|開啟|收合/i,
  },
  {
    name: "complaints list",
    path: "/complaints",
    surface: "ops",
    buttonLabel: /Refresh|重新整理/i,
  },
  { name: "complaints detail", path: "/complaints/CMP-0908", surface: "ops" },
  {
    name: "incidents list",
    path: "/incidents",
    surface: "ops",
    tabLabels: [/Active/i, /Resolved/i],
    modalTrigger: /Create|建立/i,
    buttonLabel: /Filters|類別|Create|建立/i,
  },
  {
    name: "incidents detail",
    path: "/incidents/OPS-SMOKE-INCIDENT",
    surface: "ops",
  },
  {
    name: "approval requests",
    path: "/approval-requests",
    surface: "ops",
    tabLabels: [/Pending/i, /Approved/i],
  },
  {
    name: "reports",
    path: "/reports",
    surface: "ops",
    tabLabels: [/Report jobs/i, /Filing packages/i],
    modalTrigger: /Create|Generate|建立|產生/i,
    buttonLabel: /Create|Generate|建立|產生/i,
  },
  {
    name: "revenue",
    path: "/revenue",
    surface: "ops",
    tabLabels: [/Insight/i, /Channel/i],
    buttonLabel: /Refresh|重新整理/i,
  },
  {
    name: "attendance",
    path: "/attendance",
    surface: "ops",
    tabLabels: [/Today|今日/i, /This week|本週/i],
    buttonLabel: /Export|匯出/i,
  },
  {
    name: "maintenance",
    path: "/maintenance",
    surface: "ops",
    tabLabels: [/Scheduled|排程中/i, /In progress|進行中/i],
    modalTrigger: /Create|新增|建立/i,
    buttonLabel: /Create|新增|建立|Filter|篩選/i,
  },
  {
    name: "drivers list",
    path: "/drivers",
    surface: "ops",
    tabLabels: [/All|全部/i, /Available|可派/i],
    buttonLabel: /Refresh|重新整理|Filter|篩選/i,
  },
  { name: "drivers detail", path: "/drivers/DRV-001", surface: "ops" },
  {
    name: "vehicles list",
    path: "/vehicles",
    surface: "ops",
    tabLabels: [/All|全部/i, /Dispatchable|可派/i],
    buttonLabel: /Refresh|重新整理/i,
  },
  { name: "vehicles detail", path: "/vehicles/VEH-001", surface: "ops" },
  {
    name: "contracts list",
    path: "/contracts",
    surface: "ops",
    tabLabels: [/All|全部/i, /Expiring|即將到期/i],
    buttonLabel: /Refresh|重新整理/i,
  },
  { name: "contracts detail", path: "/contracts/CTR-310", surface: "ops" },
  {
    name: "feature flags",
    path: "/feature-flags",
    surface: "ops",
    buttonLabel: /Refresh|Search|搜尋/i,
  },
];

const ADMIN_ROUTES: RouteSpec[] = [
  { name: "home", path: "/", surface: "admin", buttonLabel: /English/i },
  {
    name: "tenants list",
    path: "/tenants",
    surface: "admin",
    tabLabels: [/All|全部/i, /Production/i],
    modalTrigger: /Create|新增|建立/i,
    buttonLabel: /Filter|Export|Create|篩選|匯出|建立/i,
  },
  {
    name: "tenant detail",
    path: "/tenants/tenant-demo-001",
    surface: "admin",
  },
  {
    name: "tenant governance",
    path: "/tenant-governance",
    surface: "admin",
    buttonLabel: /Filter|Export|Create|篩選|匯出|建立/i,
  },
  {
    name: "partners list",
    path: "/partners",
    surface: "admin",
    modalTrigger: /Create|新增|建立/i,
    buttonLabel: /Create|新增|建立|View|查看/i,
  },
  {
    name: "partner detail",
    path: "/partners/acme-demo",
    surface: "admin",
    tabLabels: [/Overview/i, /Branding/i],
    modalTrigger: /Rotate|Issue|Create|新增|建立/i,
  },
  {
    name: "users",
    path: "/users",
    surface: "admin",
    modalTrigger: /Invite|邀請/i,
    buttonLabel: /Invite|邀請|Filter|篩選/i,
  },
  {
    name: "fleet",
    path: "/fleet",
    surface: "admin",
    tabLabels: [/Vehicles/i, /Drivers/i],
    buttonLabel: /Filter|篩選|Refresh|刷新/i,
  },
  {
    name: "switchboard",
    path: "/switchboard",
    surface: "admin",
    tabLabels: [/^(?:Versions|版本)/i, /^(?:Placards|牌貼)/i],
    modalTrigger: /Create|Draft|建立|草稿/i,
    buttonLabel: /Create|Draft|建立|草稿/i,
  },
  {
    name: "pricing",
    path: "/pricing",
    surface: "admin",
    tabButtonIndexes: [2, 3],
    buttonLabel: /Create|草稿|建立/i,
  },
  {
    name: "payments",
    path: "/payments",
    surface: "admin",
    tabLabels: [
      /Settlement matrix|Matrix|結算矩陣/i,
      /Tenant invoices|Invoices|租戶發票/i,
    ],
    buttonLabel: /Filter|Refresh|篩選|重新整理/i,
  },
  {
    name: "reimbursements",
    path: "/payments/reimbursements",
    surface: "admin",
    tabLabels: [/All|全部/i, /Pending/i],
  },
  {
    name: "reimbursement detail",
    path: "/payments/reimbursements/batch-001",
    surface: "admin",
    buttonLabel: /Export|匯出/i,
  },
  {
    name: "adapter registry",
    path: "/adapter-registry",
    surface: "admin",
    buttonLabel: /註冊 adapter|Create|新增/i,
  },
  {
    name: "health",
    path: "/health",
    surface: "admin",
    buttonLabel: /Refresh|重新整理/i,
  },
  {
    name: "notices",
    path: "/notices",
    surface: "admin",
    tabLabels: [/Notices/i, /Maintenance/i],
    buttonLabel: /Create|Enable|新增|建立|維護/i,
  },
  {
    name: "audit",
    path: "/audit",
    surface: "admin",
    tabLabels: [/Audit|Log/i, /Retention|Policy/i],
    buttonLabel: /Export|Refresh|Legal|匯出|重新整理/i,
  },
  {
    name: "feature flags",
    path: "/feature-flags",
    surface: "admin",
    buttonLabel: /Search|搜尋|Refresh|重新整理/i,
  },
];

function installDiagnostics(page: Page): ClientDiagnostics {
  const diagnostics: ClientDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
  };

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (
      /favicon|Failed to load resource: the server responded with a status of 404/i.test(
        text,
      )
    ) {
      return;
    }
    diagnostics.consoleErrors.push(text);
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
  expect(response?.ok() ?? false).toBeTruthy();
  await expect(page.locator("main")).toHaveCount(1);
  if (spec.expectedPath) {
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegex(spec.expectedPath)}(?:$|[?#])`),
    );
  }
  await expect(page.locator("body")).not.toContainText(
    /Application error|Unhandled Runtime Error|500\b|404\b/i,
  );
}

async function assertSingleShell(page: Page, surface: Surface) {
  if (surface === "ops") {
    await expect(page.getByLabel("Canvas navigation")).toHaveCount(1);
  } else {
    await expect(page.getByLabel("Platform Admin navigation")).toHaveCount(1);
  }
  await expect(page.locator("main")).toHaveCount(1);
}

async function findControl(page: Page, label: RegExp): Promise<Locator> {
  const candidates = [
    page.getByRole("tab", { name: label }),
    page.getByRole("button", { name: label }),
    page.getByRole("link", { name: label }),
    page.locator("main span").filter({ hasText: label }).first(),
  ];

  for (const candidate of candidates) {
    if (
      (await candidate.count()) > 0 &&
      (await candidate.first().isVisible())
    ) {
      return candidate.first();
    }
  }

  for (const selector of ["main button", "main a", "main span"]) {
    const nodes = page.locator(selector);
    const count = await nodes.count();
    for (let index = 0; index < count; index += 1) {
      const node = nodes.nth(index);
      const text = (await node.innerText().catch(() => "")).trim();
      if (
        text &&
        label.test(text) &&
        (await node.isVisible().catch(() => false))
      ) {
        return node;
      }
    }
  }

  throw new Error(`Could not find control matching ${label}`);
}

function normalizedMainText(page: Page) {
  return page
    .locator("main")
    .textContent()
    .then((value) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 5000));
}

async function waitForMainTextToChange(page: Page, previous: string) {
  await expect
    .poll(async () => normalizedMainText(page), {
      timeout: 10_000,
      intervals: [200, 400, 800],
    })
    .not.toBe(previous);
}

async function controlState(locator: Locator) {
  return locator.evaluate((node) => ({
    ariaPressed: node.getAttribute("aria-pressed"),
    ariaSelected: node.getAttribute("aria-selected"),
    dataState: node.getAttribute("data-state"),
    className: node.getAttribute("class"),
    disabled:
      node.hasAttribute("disabled") || node.getAttribute("aria-disabled"),
  }));
}

async function exerciseTabRoundTrip(page: Page, spec: RouteSpec) {
  if (!spec.tabLabels && !spec.tabButtonIndexes) {
    return;
  }

  const [first, second] = spec.tabButtonIndexes
    ? [
        page.locator("main button").nth(spec.tabButtonIndexes[0]),
        page.locator("main button").nth(spec.tabButtonIndexes[1]),
      ]
    : [
        await findControl(page, spec.tabLabels![0]),
        await findControl(page, spec.tabLabels![1]),
      ];
  const before = await normalizedMainText(page);
  const firstBeforeState = await controlState(first);
  const secondBeforeState = await controlState(second);

  await second.click();
  const afterSecondText = await normalizedMainText(page);
  const secondAfterState = await controlState(second);
  const firstAfterSecondState = await controlState(first);
  if (afterSecondText === before) {
    expect(secondAfterState).not.toEqual(secondBeforeState);
    expect(firstAfterSecondState).not.toEqual(firstBeforeState);
  }
  if (afterSecondText !== before) {
    await waitForMainTextToChange(page, before);
  }
  const afterSecond = await normalizedMainText(page);

  await first.click();
  const afterFirstText = await normalizedMainText(page);
  const firstAfterState = await controlState(first);
  const secondAfterFirstState = await controlState(second);
  if (afterFirstText === afterSecond) {
    expect(firstAfterState).not.toEqual(firstAfterSecondState);
    expect(secondAfterFirstState).not.toEqual(secondAfterState);
  }
  if (afterFirstText !== afterSecond) {
    await waitForMainTextToChange(page, afterSecond);
  }
}

async function closeAnyOpenDialog(page: Page) {
  const dialog = page.locator('[role="dialog"]').first();
  if (
    !(await dialog.count()) ||
    !(await dialog.isVisible().catch(() => false))
  ) {
    return;
  }

  const closeCandidates = [
    dialog.getByRole("button", { name: /Close|Cancel|Done|關閉|取消|完成/i }),
    dialog.getByRole("button", { name: /Back|返回/i }),
  ];

  for (const candidate of closeCandidates) {
    if (
      (await candidate.count()) > 0 &&
      (await candidate.first().isVisible())
    ) {
      await candidate.first().click();
      await expect(dialog).toBeHidden();
      return;
    }
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function exerciseModal(page: Page, spec: RouteSpec) {
  if (!spec.modalTrigger) {
    return;
  }

  const trigger = page.getByRole("button", { name: spec.modalTrigger }).first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();
  await closeAnyOpenDialog(page);
}

async function exerciseNonDestructiveButton(page: Page, spec: RouteSpec) {
  const mainButtons = page.locator("main button");
  // Any of these tokens in a button's text marks it as state-mutating, so the
  // suite must never click it as the "non-destructive action" probe. Includes
  // stateful workflow verbs (approve/assign/resolve/reopen/mark) alongside the
  // hard-destructive ones, in both English and Chinese.
  const destructiveName =
    /delete|remove|deactivate|archive|revoke|disable|terminate|reject|publish|rollback|close|approve|assign|resolve|reopen|mark|刪除|停用|終止|退回|駁回|發佈|關閉|核准|付款|指派|處理/i;
  const tabNames = spec.tabLabels ?? [];
  const candidates: Locator[] = [];

  const isSafeButtonName = (name: string) =>
    Boolean(name) &&
    !destructiveName.test(name) &&
    !tabNames.some((pattern) => pattern.test(name));

  if (spec.buttonLabel) {
    const preferred = page
      .getByRole("button", { name: spec.buttonLabel })
      .first();
    // The preferred (regex-matched) button must pass the SAME destructive/tab
    // filters as the generic fallback below — otherwise a route regex that
    // happens to match e.g. Publish/Assign/Approve would click a destructive
    // control and bypass the non-destructive-button acceptance.
    if ((await preferred.count()) > 0) {
      const name = (await preferred.innerText().catch(() => "")).trim();
      if (
        isSafeButtonName(name) &&
        (await preferred.isVisible().catch(() => false)) &&
        (await preferred.isEnabled().catch(() => false))
      ) {
        candidates.push(preferred);
      }
    }
  }

  const count = await mainButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = mainButtons.nth(index);
    const name = (await button.innerText().catch(() => "")).trim();
    if (!isSafeButtonName(name)) {
      continue;
    }
    if (!(await button.isVisible()) || !(await button.isEnabled())) {
      continue;
    }
    candidates.push(button);
  }

  const target = candidates[0];
  if (!target) {
    return;
  }

  await target.click().catch(async () => {
    await target.click({ force: true });
  });
  await page.waitForTimeout(250);
  await closeAnyOpenDialog(page);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(
    /Application error|Unhandled Runtime Error/i,
  );
  await expect
    .poll(async () => normalizedMainText(page), { timeout: 5_000 })
    .not.toBe("");
  const after = await normalizedMainText(page);
  expect(after.length).toBeGreaterThan(0);
}

function assertNoClientErrors(spec: RouteSpec, diagnostics: ClientDiagnostics) {
  expect
    .soft(
      diagnostics.pageErrors,
      `${spec.path} emitted pageerror: ${diagnostics.pageErrors.join(" | ")}`,
    )
    .toEqual([]);
  expect
    .soft(
      diagnostics.consoleErrors,
      `${spec.path} emitted console.error: ${diagnostics.consoleErrors.join(" | ")}`,
    )
    .toEqual([]);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runRouteSpec(page: Page, spec: RouteSpec) {
  const diagnostics = installDiagnostics(page);
  await gotoRoute(page, spec);
  await assertSingleShell(page, spec.surface);
  await exerciseTabRoundTrip(page, spec);
  await exerciseNonDestructiveButton(page, spec);
  await exerciseModal(page, spec);
  assertNoClientErrors(spec, diagnostics);
}

function skipUnlessProject(testInfo: TestInfo, expectedProject: string) {
  test.skip(
    testInfo.project.name !== expectedProject,
    `Only runs in ${expectedProject}`,
  );
}

test.describe("deterministic route suite — ops console", () => {
  for (const spec of OPS_ROUTES) {
    test(spec.name, async ({ page }, testInfo) => {
      skipUnlessProject(testInfo, OPS_PROJECT);
      await runRouteSpec(page, spec);
    });
  }
});

test.describe("deterministic route suite — platform admin", () => {
  for (const spec of ADMIN_ROUTES) {
    test(spec.name, async ({ page }, testInfo) => {
      skipUnlessProject(testInfo, ADMIN_PROJECT);
      await runRouteSpec(page, spec);
    });
  }
});
