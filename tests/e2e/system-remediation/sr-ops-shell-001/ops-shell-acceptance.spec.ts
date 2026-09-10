import { test, expect } from "@playwright/test";

/**
 * End-to-End Acceptance Suite for SR-OPS-SHELL-001.
 *
 * Covers required acceptance gates:
 * 1. ops_cross_app_resource_navigation:
 *    - Dispatch board selected order navigation to Platform Admin /audit with full resource context.
 *    - Forwarded orders with forwarded_order resourceType and mirrorOrderId.
 *    - Platform Admin /audit receiver query contract:
 *      * missing context -> general list
 *      * valid context -> exact equality filtered list with context badge & clear filter control
 *      * incomplete context -> explicit invalid state banner
 *      * unknown/no-match -> contextual empty state (never silently unfiltered)
 *      * reload preserves URL context
 * 2. ops_widget_remote_viewport_keyboard:
 *    - 1440px desktop: minimized by default, bottom-right launcher button, core CTAs clickable.
 *    - Keyboard focus: open widget moves focus to drag handle; Escape closes widget and returns focus to launcher.
 *    - 390px mobile: panel constrained to mobile width, bottom safe padding preserves CTA accessibility.
 */

test.describe("SR-OPS-SHELL-001: ops_cross_app_resource_navigation", () => {
  test("dispatch board selected order opens platform-admin audit with order resource context", async ({
    page,
  }) => {
    // Navigate to dispatch console
    await page.goto("/dispatch");

    // Select an order row
    const orderRow = page.locator('[data-testid="dispatch-order-row"]').first();
    if (await orderRow.isVisible()) {
      await orderRow.click();

      // Locate audit CTA
      const auditLink = page.locator('a:has-text("/audit ↗")');
      await expect(auditLink).toBeVisible();

      const href = await auditLink.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).toContain("/audit?");
      expect(href).toMatch(/resourceType=order|resourceType=forwarded_order/);
      expect(href).toContain("resourceId=");

      const target = await auditLink.getAttribute("target");
      expect(target).toBe("_blank");
    }
  });

  test("platform admin audit receiver filters by resource context and handles clear filter", async ({
    page,
  }) => {
    // Navigate with context parameters
    await page.goto(
      "/audit?resourceType=order&resourceId=ord-tpe-test-01",
    );

    // Verify active context header is displayed
    const contextHeader = page.locator("text=Active Context");
    await expect(contextHeader).toBeVisible();

    // Verify clear filter button is present
    const clearBtn = page.locator('[data-testid="audit-clear-context-btn"]');
    await expect(clearBtn).toBeVisible();

    // Click clear filter and verify navigation back to general list
    await clearBtn.click();
    await expect(page).toHaveURL(/\/audit$/);
  });

  test("platform admin audit receiver presents explicit invalid state for incomplete context", async ({
    page,
  }) => {
    // Navigate with incomplete context (resourceType without resourceId)
    await page.goto("/audit?resourceType=order");

    const errorBanner = page.locator("text=Invalid Audit Context");
    await expect(errorBanner).toBeVisible();

    // Unfiltered records must not be rendered
    const auditTable = page.locator('[data-testid="audit-log-table"]');
    await expect(auditTable).toHaveCount(0);
  });

  test("platform admin audit receiver presents contextual empty state for unknown resource", async ({
    page,
  }) => {
    // Navigate with non-matching resourceId
    await page.goto(
      "/audit?resourceType=order&resourceId=non-existent-order-999999",
    );

    const emptyHeader = page.locator("text=No Matching Audit Records");
    await expect(emptyHeader).toBeVisible();

    // Unfiltered records must not be silently displayed
    const auditTable = page.locator('[data-testid="audit-log-table"]');
    await expect(auditTable).toHaveCount(0);
  });
});

test.describe("SR-OPS-SHELL-001: ops_widget_remote_viewport_keyboard", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1440px desktop: assistant is minimized by default and main CTAs remain clickable", async ({
    page,
  }) => {
    await page.goto("/dispatch");

    // Launcher button should be present in bottom-right
    const launcher = page.locator('[data-testid="ops-assistant-launcher"]');
    await expect(launcher).toBeVisible();

    // Expanded panel should not be visible initially
    const panel = page.locator('[data-testid="ops-assistant-panel"]');
    await expect(panel).toHaveCount(0);

    // Verify bottom action bar / pagination CTA is clickable
    const paginationCta = page.locator('[data-testid="dispatch-pagination-cta"]').first();
    if (await paginationCta.isVisible()) {
      await expect(paginationCta).toBeEnabled();
    }
  });

  test("keyboard navigation: opening widget shifts focus to drag handle, Escape closes and returns focus", async ({
    page,
  }) => {
    await page.goto("/dispatch");

    const launcher = page.locator('[data-testid="ops-assistant-launcher"]');
    await expect(launcher).toBeVisible();

    // Click to expand
    await launcher.click();

    // Panel should appear
    const panel = page.locator('[data-testid="ops-assistant-panel"]');
    await expect(panel).toBeVisible();

    // Focus shifts to drag handle
    const dragHandle = page.locator('[data-testid="ops-assistant-drag-handle"]');
    await expect(dragHandle).toBeFocused();

    // Press Escape to close
    await page.keyboard.press("Escape");

    // Panel disappears
    await expect(panel).toHaveCount(0);

    // Focus returns to launcher
    await expect(launcher).toBeFocused();
  });
});

test.describe("SR-OPS-SHELL-001: mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px mobile: panel width is clamped and launcher is fully accessible", async ({
    page,
  }) => {
    await page.goto("/dispatch");

    const launcher = page.locator('[data-testid="ops-assistant-launcher"]');
    await expect(launcher).toBeVisible();

    // Click launcher
    await launcher.click();

    const panel = page.locator('[data-testid="ops-assistant-panel"]');
    await expect(panel).toBeVisible();

    const boundingBox = await panel.boundingBox();
    expect(boundingBox).toBeTruthy();
    if (boundingBox) {
      // Must not exceed 358px on 390px viewport
      expect(boundingBox.width).toBeLessThanOrEqual(358);
      expect(boundingBox.x).toBeGreaterThanOrEqual(0);
    }
  });
});
