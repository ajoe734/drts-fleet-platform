import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// S3-VERIFY-001 — capture S-3 Ops screen evidence against the real
// current-head runtime. See playwright.s3-verify-ops-evidence.config.ts for the
// runtime-source declaration. Nothing here mocks or stubs the API.

const SHOT_DIR = resolve(
  process.cwd(),
  "support/sidecars/S3-VERIFY-001/screenshots",
);

const RUNTIME_LABEL =
  process.env.S3_RUNTIME_LABEL ??
  "local hermetic — current-head ops-console-web + @drts/api + Postgres (NOT production)";

const captured: Array<{ file: string; url: string; screen: string }> = [];

test.beforeAll(() => {
  mkdirSync(SHOT_DIR, { recursive: true });
});

test.afterAll(() => {
  // Emit a machine-readable manifest so every PNG carries its runtime source
  // rather than relying on prose in a doc that can drift from the image.
  writeFileSync(
    resolve(SHOT_DIR, "manifest.json"),
    `${JSON.stringify(
      {
        task: "S3-VERIFY-001",
        runtimeSource: RUNTIME_LABEL,
        apiUrl: process.env.DRTS_API_URL ?? "http://localhost:3972",
        capturedAtNote:
          "Timestamp intentionally omitted; the commit that adds these files is the time anchor.",
        productionEvidence: false,
        screenshots: captured,
      },
      null,
      2,
    )}\n`,
  );
});

// Every one of these screens paints a "載入中…" skeleton first and fills in
// after a client fetch. `networkidle` alone still catches the skeleton, and a
// screenshot of a skeleton is not evidence of anything. Wait for the loading
// state to clear so the captured frame is a settled state — rows, empty, or
// error — and let the caller assert which one it should be.
async function settle(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("載入中")).toHaveCount(0, { timeout: 60_000 });
}

async function capture(page: Page, file: string, screen: string, url: string) {
  // Stamp the runtime source INTO the image, so a screenshot that gets copied
  // out of the repo cannot be mistaken for production evidence.
  await page.evaluate((label) => {
    const banner = document.createElement("div");
    banner.textContent = `EVIDENCE RUNTIME SOURCE — ${label}`;
    banner.setAttribute(
      "style",
      [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "background:#b91c1c",
        "color:#fff",
        "font:12px/1.6 ui-monospace,monospace",
        "padding:4px 10px",
        "text-align:center",
        "letter-spacing:0.02em",
      ].join(";"),
    );
    document.body.appendChild(banner);
  }, RUNTIME_LABEL);

  await page.screenshot({
    path: resolve(SHOT_DIR, file),
    fullPage: true,
  });
  captured.push({ file, url, screen });
}

test("S3-O02 SOS queue renders real current-head incident rows", async ({
  page,
}) => {
  await page.goto("/sos");
  await settle(page);

  // Beyond settling, this screen must show a REAL event number
  // (SOS-<14 digits>-<6 hex>) written by this task's own runtime run. Asserting
  // it is what makes the PNG evidence rather than decoration: before the
  // sos-view-model pattern fix this expectation failed, because the queue
  // filtered out every real incident and settled to an empty table.
  await expect(page.getByText(/SOS-\d{14}-[0-9A-F]{6}/).first()).toBeVisible({
    timeout: 60_000,
  });

  await capture(page, "S3-O02-sos-queue.png", "S3-O02 SOS Queue", "/sos");
});

test("S3-O05 SOS records surface reaches a settled state", async ({ page }) => {
  await page.goto("/sos/records");
  await settle(page);
  await capture(
    page,
    "S3-O05-sos-records.png",
    "S3-O05 Investigation / records",
    "/sos/records",
  );
});

test("S3-O03 SOS board reaches a settled state", async ({ page }) => {
  await page.goto("/sos/board");
  await settle(page);
  await capture(page, "S3-O03-sos-board.png", "S3-O03 SOS board", "/sos/board");
});
