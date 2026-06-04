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

type AssistantMockState = {
  lastMessage: string | null;
};

function isEnabledProject(testInfo: TestInfo) {
  return testInfo.project.name === ENABLED_PROJECT;
}

function isDisabledProject(testInfo: TestInfo) {
  return testInfo.project.name === DISABLED_PROJECT;
}

async function mockAssistantApi(page: Page): Promise<AssistantMockState> {
  const state: AssistantMockState = { lastMessage: null };

  await page.route(
    "**/control-plane-proxy/platform-admin/assistant/sessions",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            session_id: "paas_e2e_session_001",
            title: "E2E Platform Admin assistant",
            created_at: "2026-06-03T09:30:00.000Z",
            updated_at: "2026-06-03T09:30:00.000Z",
            provider: "mock",
            actor: {
              auth_mode: "bootstrap_headers",
              actor_type: "platform_admin",
              actor_id: "pa-admin-e2e",
              realm: "platform",
              tenant_id: null,
              role_families: ["platform"],
              roles: ["superadmin"],
              scopes: ["foundation:read", "foundation:write"],
              request_id: "req-e2e-session",
            },
            latest_answer_preview: null,
          },
          meta: {
            request_id: "req-e2e-session",
            timestamp: "2026-06-03T09:30:00.000Z",
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/platform-admin/assistant/sessions/*/messages",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = route.request().postDataJSON() as { message?: string };
      state.lastMessage = body.message ?? null;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            answer:
              "Mock assistant response for pa-admin-e2e: review the current route risks before changing platform state.",
            citations: [
              {
                title: "Platform Admin product routes",
                section: "§7.3 Current route map",
              },
            ],
            suggested_prompts: [
              "List the route risks.",
              "Draft the operator checklist.",
            ],
            action_plan: {
              plan_id: "plan-e2e-001",
              title: "Mock action plan",
              summary: "Inspect current state before taking action.",
              steps: [
                {
                  step_id: "validate-context",
                  title: "Validate current Platform Admin context",
                  status: "completed",
                },
                {
                  step_id: "inspect-state",
                  title: "Inspect the impacted governance state",
                  status: "in_progress",
                },
              ],
            },
          },
          meta: {
            request_id: "req-e2e-message",
            timestamp: "2026-06-03T09:30:01.000Z",
          },
        }),
      });
    },
  );

  return state;
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

  test("sends a question and renders the assistant response, citations, and action plan", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));
    test.setTimeout(90_000);

    const mockState = await mockAssistantApi(page);

    await gotoShellRoute(page, "/payments", { assistantEnabled: true });

    await page.getByRole("button", { name: /Open issue|開立 issue/ }).click();

    await page.getByTestId("platform-assistant-launcher").click();
    const panel = page.getByTestId("platform-assistant-panel");
    await expect(panel).toBeVisible();

    await panel
      .getByLabel(/Ask the platform assistant|輸入平台助理問題/)
      .fill("What should I check before changing payments?");
    await panel.getByTestId("platform-assistant-send").click();

    await expect(
      panel.getByText("Mock assistant response for pa-admin-e2e"),
    ).toBeVisible();
    await expect(
      panel.getByText("Platform Admin product routes"),
    ).toBeVisible();
    await expect(panel.getByText("Mock action plan")).toBeVisible();
    await expect(
      panel.getByText("Validate current Platform Admin context"),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "List the route risks." }),
    ).toBeVisible();
    expect(mockState.lastMessage).toContain("[Platform Admin route context]");
    expect(mockState.lastMessage).toContain("Path: /payments");
    expect(mockState.lastMessage).toContain("Active tab: recon");
    expect(mockState.lastMessage).toContain("[Platform Admin page context]");
    expect(mockState.lastMessage).toContain("reconciliation-issues");
    expect(mockState.lastMessage).toContain("reconciliation-issue-create");
    expect(mockState.lastMessage).toContain(
      "validationErrors=summary:required",
    );
    expect(mockState.lastMessage).toContain(
      "Available actions: refresh_payments",
    );
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
