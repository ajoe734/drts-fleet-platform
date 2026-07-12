import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { installMockMapTileRoutes } from "./map-geofence-harness";

const ORDER_ID = "ORD-SMOKE-001";
const ARTIFACT_DIR = "support/sidecars/MAP-QA-002/artifacts/closeout-20260708";
const ARTIFACT_PATH = `${ARTIFACT_DIR}/fleets-closeout-004-ops-browser-dom-proof.json`;
const SCREENSHOT_PATH = `${ARTIFACT_DIR}/fleets-closeout-004-ops-browser-dom-proof.png`;

test.describe("FLEETS-CLOSEOUT-004 Ops browser DOM proof", () => {
  test("exports same-order Ops map DOM attributes and screenshot evidence", async ({
    page,
  }) => {
    await installMockMapTileRoutes(page);

    await page.goto("/dispatch?board=assigned", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).not.toHaveURL(/404/);
    await expect(page.locator("body")).not.toContainText(
      /404|Application error|Loading workspace|載入工作區/i,
    );
    await assertShell(page);

    const board = page.locator(".spatial-board").first();
    await expect(board).toBeVisible({ timeout: 45_000 });
    await expect(board).toHaveAttribute(
      "data-ops-map-provider-status",
      "degraded_projection",
    );
    await expect(board).toHaveAttribute(
      "data-ops-map-fallback-reason",
      "missing_coordinates",
    );
    await expect(board).toHaveAttribute(
      "data-ops-map-service-areas",
      /TAIPEI_CORE/,
    );
    await expect(board).toHaveAttribute(
      "data-ops-map-policy-codes",
      /PICKUP_ZONE_A.*DROPOFF_ZONE_B|DROPOFF_ZONE_B.*PICKUP_ZONE_A/,
    );

    const pickup = board.locator(
      `.spatial-point[data-ops-map-point-kind="pickup"][data-ops-map-order-id="${ORDER_ID}"]`,
    );
    const dropoff = board.locator(
      `.spatial-point[data-ops-map-point-kind="dropoff"][data-ops-map-order-id="${ORDER_ID}"]`,
    );
    const freshCandidate = board.locator(
      `.spatial-point[data-ops-map-point-kind="candidate"][data-ops-map-order-id="${ORDER_ID}"][data-ops-map-freshness="fresh"]`,
    );
    const lowAccuracyCandidate = board.locator(
      `.spatial-point[data-ops-map-point-kind="candidate"][data-ops-map-order-id="${ORDER_ID}"][data-ops-map-freshness="low_accuracy"]`,
    );

    await expect(pickup).toHaveCount(1);
    await expect(dropoff).toHaveCount(1);
    await expect(freshCandidate).toHaveCount(1);
    await expect(lowAccuracyCandidate).toHaveCount(1);
    await expect(board.locator("[data-ops-map-route-line]")).toHaveCount(1);

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    await board.screenshot({ path: SCREENSHOT_PATH });

    const proof = {
      generatedAt: new Date().toISOString(),
      closeoutTask: "FLEETS-CLOSEOUT-004",
      scope:
        "repo-local browser DOM evidence from mock Ops UI; final E2E-MAP-006 promotion composes this screenshot with FLEETS-CLOSEOUT-001 persisted snapshot proof, FLEETS-CLOSEOUT-004 backend/API readbacks, and MAP-OBS-001 final evidence.",
      command:
        "pnpm exec playwright test -c playwright.map-geofence-ops-closeout.config.ts --reporter=list",
      screenshot: SCREENSHOT_PATH,
      pageUrl: page.url(),
      sameOrderIdsAsCallcenterProof: [ORDER_ID],
      boardAttributes: await board.evaluate((element) => ({
        providerStatus: element.getAttribute("data-ops-map-provider-status"),
        fallbackReason: element.getAttribute("data-ops-map-fallback-reason"),
        serviceAreas: element.getAttribute("data-ops-map-service-areas"),
        policyCodes: element.getAttribute("data-ops-map-policy-codes"),
        routeCount: element.getAttribute("data-ops-map-route-count"),
        overlayCount:
          element
            .querySelector("[data-ops-map-overlay-count]")
            ?.getAttribute("data-ops-map-overlay-count") ?? null,
      })),
      points: await board
        .locator("[data-ops-map-point-kind]")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            kind: element.getAttribute("data-ops-map-point-kind"),
            orderId: element.getAttribute("data-ops-map-order-id"),
            jobId: element.getAttribute("data-ops-map-job-id"),
            freshness: element.getAttribute("data-ops-map-freshness"),
          })),
        ),
      finalEvidencePromotion: {
        canSupportRows: [
          "E2E-MAP-006",
          "Ops visibility",
          "service overlays",
          "fallback state",
        ],
        promotedRows: [
          "MAP-QA-002 E2E-MAP-006 final PASS row",
          "MAP-REL-001 FLEETS-CLOSEOUT-004 acceptance matrix",
        ],
        composedAuthority: [
          "FLEETS-CLOSEOUT-001 persisted API/DB snapshot proof for ORD-SMOKE-001",
          "FLEETS-CLOSEOUT-004 backend/API readbacks for the same order/dispatch/candidate chain",
          "MAP-OBS-001 final evidence for degraded projection, freshness, and audit signals",
        ],
        finalArtifactLinks: [
          "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json",
          SCREENSHOT_PATH,
          ARTIFACT_PATH,
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json",
          "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md",
        ],
      },
    };

    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(proof, null, 2)}\n`);

    expect(proof.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pickup",
          orderId: ORDER_ID,
        }),
        expect.objectContaining({
          kind: "dropoff",
          orderId: ORDER_ID,
        }),
        expect.objectContaining({
          kind: "candidate",
          orderId: ORDER_ID,
          freshness: "fresh",
        }),
        expect.objectContaining({
          kind: "candidate",
          orderId: ORDER_ID,
          freshness: "low_accuracy",
        }),
      ]),
    );
  });
});

async function assertShell(page: Page) {
  const shellAside = page
    .locator("aside")
    .filter({ hasText: /Dashboard|Dispatch|Registry|儀表板|派車調度/ })
    .first();
  await expect(shellAside).toBeVisible();
}
