import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ENABLED_PROJECT = "platform-admin-assistant-on";
const DISABLED_PROJECT = "platform-admin-assistant-off";

const routeSmokeTargets = [
  "/",
  "/tenants",
  "/partners/acme-demo",
  "/pricing",
  "/payments",
  "/audit",
  "/feature-flags",
] as const;

function isEnabledProject(testInfo: TestInfo) {
  return testInfo.project.name === ENABLED_PROJECT;
}

function isDisabledProject(testInfo: TestInfo) {
  return testInfo.project.name === DISABLED_PROJECT;
}

async function gotoShellRoute(
  page: Page,
  route: string,
  { assistantEnabled = false }: { assistantEnabled?: boolean } = {},
) {
  let response = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await page.goto(route, { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }

  expect(response?.ok()).toBeTruthy();
  await expect(page.getByLabel("Platform Admin navigation")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  if (assistantEnabled) {
    await expect(page.getByTestId("platform-assistant-launcher")).toBeVisible({
      timeout: 15_000,
    });
  }
}

async function expectSingleShellLayout(page: Page) {
  const body = page.locator("body");
  const main = page.locator("main");

  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.getByLabel("Platform Admin navigation")).toHaveCount(1);
  await expect(main).toHaveCount(1);
  await expect(body).toHaveCSS("overflow", "hidden");
}

test.describe("platform admin assistant overlay", () => {
  test("feature flag off hides the launcher", async ({ page }, testInfo) => {
    test.skip(!isDisabledProject(testInfo));

    await gotoShellRoute(page, "/");
    await expect(page.getByTestId("platform-assistant-launcher")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("platform-assistant-panel")).toHaveCount(0);
  });

  test("open, minimize, close, drag, and persist across routes without changing shell layout", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));
    test.setTimeout(90_000);

    await gotoShellRoute(page, "/", { assistantEnabled: true });

    const main = page.locator("main");
    const launcher = page.getByTestId("platform-assistant-launcher");
    const panel = page.getByTestId("platform-assistant-panel");
    const dragHandle = page.getByTestId("platform-assistant-drag-handle");
    const minimizeButton = panel.getByRole("button", {
      name: /Minimize|最小化/,
    });
    const closeButton = panel.getByRole("button", { name: /Close|關閉/ });

    const initialMainBox = await main.boundingBox();
    expect(initialMainBox).not.toBeNull();
    await expectSingleShellLayout(page);

    await launcher.click();
    await expect(panel).toBeVisible();
    await expectSingleShellLayout(page);

    const openMainBox = await main.boundingBox();
    expect(openMainBox).toEqual(initialMainBox);

    const beforeDrag = await panel.boundingBox();
    expect(beforeDrag).not.toBeNull();
    const handleBox = await dragHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    if (!beforeDrag || !handleBox) {
      throw new Error("Assistant panel did not expose drag geometry.");
    }

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - 140,
      handleBox.y + handleBox.height / 2 - 90,
      { steps: 12 },
    );
    await page.mouse.up();

    const afterDrag = await panel.boundingBox();
    expect(afterDrag).not.toBeNull();
    expect(Math.abs((afterDrag?.x ?? 0) - beforeDrag.x)).toBeGreaterThan(40);
    expect(Math.abs((afterDrag?.y ?? 0) - beforeDrag.y)).toBeGreaterThan(40);

    await page.getByRole("link", { name: /Payments|結算與帳務/ }).click();
    await page.waitForURL("**/payments");
    await expect(panel).toBeVisible();
    await expectSingleShellLayout(page);

    const afterRouteChange = await panel.boundingBox();
    expect(afterRouteChange).not.toBeNull();
    expect(
      Math.abs((afterRouteChange?.x ?? 0) - (afterDrag?.x ?? 0)),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs((afterRouteChange?.y ?? 0) - (afterDrag?.y ?? 0)),
    ).toBeLessThanOrEqual(4);

    await minimizeButton.click();
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeVisible();

    await launcher.click();
    await expect(panel).toBeVisible();
    await closeButton.click();
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeVisible();

    await page.reload();
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(panel).toBeVisible();

    const afterReload = await panel.boundingBox();
    expect(afterReload).not.toBeNull();
    expect(
      Math.abs((afterReload?.x ?? 0) - (afterDrag?.x ?? 0)),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs((afterReload?.y ?? 0) - (afterDrag?.y ?? 0)),
    ).toBeLessThanOrEqual(4);
  });

  test("route-context smoke keeps one shell/sidebar across key routes", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));
    test.setTimeout(90_000);

    for (const route of routeSmokeTargets) {
      await gotoShellRoute(page, route, { assistantEnabled: true });
      await expectSingleShellLayout(page);
    }
  });
});
