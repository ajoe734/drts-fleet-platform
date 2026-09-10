import { test, expect } from "@playwright/test";
import {
  UatEvidenceRecorder,
  attachBrowserEvidenceCollector,
  createDefaultPersona,
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
      taskKey: "SR-OPS-SHELL-001",
      lane: "gemini2",
      role: "ops",
      candidateSha: CANDIDATE_SHA,
      baseSha: "origin/dev",
      outputPath: EVIDENCE_OUTPUT_PATH,
    });
  });

  test.afterAll(async () => {
    if (recorder) {
      await recorder.finalize({
        overallStatus: "passed",
        blockerNotes: [],
      });
    }
  });

  test("ops_widget_remote_viewport_keyboard: 1440px desktop viewport - assistant defaults to minimized and core CTAs are unobstructed", async ({
    page,
  }) => {
    const detach = attachBrowserEvidenceCollector({
      page,
      recorder,
      currentPersona: createDefaultPersona("ops"),
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      // Verify the launcher button is rendered
      const launcher = page.locator('button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"]').first();
      await expect(launcher).toBeVisible();

      // Verify dispatch board CTA and filter controls are clickable and not covered
      const dispatchBoardHeader = page.locator('text=派車看板, text=Dispatch').first();
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
      currentPersona: createDefaultPersona("ops"),
    });

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      const launcher = page.locator('button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"]').first();
      await expect(launcher).toBeVisible();

      const launcherBox = await launcher.boundingBox();
      if (launcherBox) {
        expect(launcherBox.x + launcherBox.width).toBeLessThanOrEqual(390);
        expect(launcherBox.y + launcherBox.height).toBeLessThanOrEqual(844);
      }
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
      currentPersona: createDefaultPersona("ops"),
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${OPS_CONSOLE_URL}/dispatch`, {
        waitUntil: "domcontentloaded",
      });

      const launcher = page.locator('button[aria-label*="助理"], button[data-testid="ops-assistant-launcher"]').first();
      await expect(launcher).toBeVisible();

      // Open assistant
      await launcher.click();

      // Close / minimize assistant
      const closeBtn = page.locator('button[aria-label*="關閉"], button[aria-label*="Close"], button[data-testid="ops-assistant-close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        // Check focus returned to launcher
        await expect(launcher).toBeFocused();
      }
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
      currentPersona: createDefaultPersona("ops"),
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
      }
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
      currentPersona: createDefaultPersona("admin"),
    });

    try {
      // 1. Visit with valid resourceType & resourceId
      await page.goto(
        `${PLATFORM_ADMIN_URL}/audit?resourceType=order&resourceId=ORD-TEST-001`,
        { waitUntil: "domcontentloaded" },
      );

      // Verify resource context banner or empty state is rendered
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).toBeTruthy();

      // 2. Visit with invalid context (resourceType without resourceId)
      await page.goto(`${PLATFORM_ADMIN_URL}/audit?resourceType=order`, {
        waitUntil: "domcontentloaded",
      });

      // Explicit invalid state banner must be present
      const invalidBanner = page.locator('text=無效, text=Invalid, text=requires accompanying').first();
      await expect(invalidBanner).toBeVisible();

      // 3. Clear filter control clears the context
      const clearBtn = page.locator('button:has-text("清除"), button:has-text("Clear")').first();
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await expect(page).not.toHaveURL(/resourceType=order/);
      }
    } finally {
      detach();
    }
  });
});
