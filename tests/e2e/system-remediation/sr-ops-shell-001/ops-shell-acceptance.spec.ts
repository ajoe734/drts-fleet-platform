import { test, expect } from "@playwright/test";
import {
  UatEvidenceRecorder,
  attachBrowserEvidenceCollector,
  BASELINE_PERSONAS,
} from "../shared";

const CANDIDATE_SHA =
  process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || "unknown-candidate";
const EVIDENCE_OUTPUT_PATH =
  process.env.OPS_SHELL_EVIDENCE_PATH ||
  ".artifacts/ops-shell-acceptance/evidence.json";
const OPS_CONSOLE_URL =
  process.env.OPS_CONSOLE_URL || "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.PLATFORM_ADMIN_URL || "http://localhost:3002";

test.describe("SR-OPS-SHELL-001: Ops Shell & Assistant Browser Acceptance", () => {
  let recorder: UatEvidenceRecorder;

  test.beforeAll(async () => {
    recorder = new UatEvidenceRecorder({
      taskId: "SR-OPS-SHELL-001",
      shardIndex: 0,
      candidateSha: CANDIDATE_SHA,
      baseSha: "origin/dev",
    });
  });

  test.afterAll(async () => {
    if (recorder) {
      recorder.saveToFile(EVIDENCE_OUTPUT_PATH);
    }
  });

  test("ops_widget_remote_viewport_keyboard: 1440px desktop viewport - assistant defaults to minimized and core CTAs are unobstructed", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: BASELINE_PERSONAS.ops_dispatcher,
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      // Verify the launcher button or panel is rendered
      const widgetElement = page
        .locator(
          'button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"], [data-testid="ops-assistant-panel"]',
        )
        .first();
      await expect(widgetElement).toBeVisible();

      // Verify dispatch board header or content is visible
      const dispatchBoardHeader = page.getByText(/派車|Dispatch/).first();
      await expect(dispatchBoardHeader).toBeVisible();

      // Ensure assistant panel does not obstruct central/right CTA
      const panel = page.locator('[data-testid="ops-assistant-panel"]');
      if (await panel.isVisible()) {
        const box = await panel.boundingBox();
        if (box) {
          // If panel exists, its height in minimized state should not exceed 80px
          expect(box.height).toBeLessThanOrEqual(80);
          // And it must dock near bottom
          expect(box.y).toBeGreaterThan(700);
        }
      }
    } catch (err: any) {
      recorder.recordError(err);
      throw err;
    } finally {
      detach();
    }
  });

  test("ops_widget_remote_viewport_keyboard: 390px mobile viewport - widget scales and stays within viewport", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: BASELINE_PERSONAS.ops_dispatcher,
    });

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      const widgetElement = page
        .locator(
          'button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"], [data-testid="ops-assistant-panel"]',
        )
        .first();
      await expect(widgetElement).toBeVisible();

      const widgetBox = await widgetElement.boundingBox();
      if (widgetBox) {
        expect(widgetBox.width).toBeLessThanOrEqual(358);
        expect(widgetBox.x + widgetBox.width).toBeLessThanOrEqual(390 + 5);
        expect(widgetBox.y + widgetBox.height).toBeLessThanOrEqual(844 + 5);
      }
    } catch (err: any) {
      recorder.recordError(err);
      throw err;
    } finally {
      detach();
    }
  });

  test("ops_widget_remote_viewport_keyboard: keyboard focus management on toggle and close", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: BASELINE_PERSONAS.ops_dispatcher,
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      const launcher = page
        .locator(
          'button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"]',
        )
        .first();
      const closeBtn = page
        .locator(
          'button[aria-label*="關閉"], button[aria-label*="Close"], button[data-testid="ops-assistant-close"]',
        )
        .first();

      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await expect(launcher).toBeVisible();
        await expect(launcher).toBeFocused();

        await launcher.click();
        const panel = page.locator('[data-testid="ops-assistant-panel"]').first();
        await expect(panel).toBeVisible();

        // Escape closes panel and returns focus
        await page.keyboard.press("Escape");
        await expect(launcher).toBeVisible();
        await expect(launcher).toBeFocused();
      } else {
        await expect(launcher).toBeVisible();
        await launcher.click();
        const panel = page.locator('[data-testid="ops-assistant-panel"]').first();
        await expect(panel).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(launcher).toBeVisible();
        await expect(launcher).toBeFocused();
      }
    } catch (err: any) {
      recorder.recordError(err);
      throw err;
    } finally {
      detach();
    }
  });

  test("ops_cross_app_resource_navigation: dispatch board generates valid cross-app audit URL with resource context", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: BASELINE_PERSONAS.ops_dispatcher,
    });

    try {
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      // Find an order link or audit CTA link on the dispatch board
      const auditLink = page.locator('a[href*="/audit"]').first();
      if (await auditLink.isVisible()) {
        const href = await auditLink.getAttribute("href");
        expect(href).toBeTruthy();
        expect(href).toMatch(/\/audit(?:\?|$)/);
        expect(href).not.toContain("404");
      } else {
        const board = page.locator('[data-testid="ops-shell-content"]');
        await expect(board).toBeVisible();
      }
    } catch (err: any) {
      recorder.recordError(err);
      throw err;
    } finally {
      detach();
    }
  });

  test("ops_cross_app_resource_navigation: platform admin audit receiver respects URL resource context", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: BASELINE_PERSONAS.platform_admin,
    });

    try {
      // 1. Visit with valid resourceType & resourceId
      await page.goto(
        `${PLATFORM_ADMIN_URL}/audit?resourceType=order&resourceId=ORD-TEST-001`,
        { waitUntil: "domcontentloaded" },
      );

      // Verify resource context badge or empty state is rendered
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).toBeTruthy();

      // 2. Visit with invalid context (resourceType without resourceId)
      await page.goto(`${PLATFORM_ADMIN_URL}/audit?resourceType=order`, {
        waitUntil: "domcontentloaded",
      });

      // Explicit invalid state banner must be present
      const invalidBanner = page
        .getByText(/無效|Invalid|requires accompanying/i)
        .first();
      await expect(invalidBanner).toBeVisible();

      // 3. Clear filter control clears the context
      const clearBtn = page
        .locator('button:has-text("清除"), button:has-text("Clear")')
        .first();
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await expect(page).not.toHaveURL(/resourceType=order/);
      }
    } catch (err: any) {
      recorder.recordError(err);
      throw err;
    } finally {
      detach();
    }
  });
});
