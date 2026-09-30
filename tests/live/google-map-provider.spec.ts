import { expect, test, type Page } from "@playwright/test";
import {
  assertAllowedUrl,
  validateLiveMapGate,
  writeEvidence,
} from "../e2e/system-remediation/sr-live-map-001/live-map-config";

const GOOGLE_MAP_ERROR =
  /InvalidKeyMapError|RefererNotAllowedMapError|ApiNotActivatedMapError|Google Maps JavaScript API error/i;

function watchGoogleMapErrors(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && GOOGLE_MAP_ERROR.test(message.text())) {
      failures.push("Google Maps console key/source/API error");
    }
  });
  page.on("pageerror", (error) => {
    if (GOOGLE_MAP_ERROR.test(error.message)) {
      failures.push("Google Maps page key/source/API error");
    }
  });
  return failures;
}

async function expectReadyGoogleMap(page: Page) {
  const layer = page.locator("[data-google-map-base-layer]").first();
  await expect(layer).toHaveAttribute("data-google-map-status", "ready", {
    timeout: 45_000,
  });
  const image = layer
    .locator(
      'img[src^="https://maps.googleapis.com/maps/api/js/StaticMapService.GetMapImage"]',
    )
    .first();
  await expect(image).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(layer).toHaveCSS("width", /[1-9]\d*px/);
  await expect(layer).toHaveCSS("height", /[1-9]\d*px/);
  return layer;
}

test("deployed Ops and Callcenter render the live Google base map", async ({
  page,
  request,
  context,
}) => {
  const config = validateLiveMapGate(process.env);
  const failures = watchGoogleMapErrors(page);
  const evidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    origin: config.opsOrigin,
    browser: "chromium",
    pages: [] as Array<{
      path: string;
      ready: boolean;
      imagery_decoded: boolean;
      screenshot: string;
    }>,
    failures,
  };
  await context.route("**/*", async (route) => {
    try {
      assertAllowedUrl(route.request().url(), config.allowedTargets);
    } catch {
      failures.push(
        "Browser attempted a request outside DRTS_LIVE_MAP_ALLOWED_TARGETS",
      );
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  try {
    const configResponse = await request.get(
      `${config.opsOrigin}/api/map-provider-config`,
      { maxRedirects: 0 },
    );
    expect(configResponse.ok()).toBe(true);
    const providerConfig = await configResponse.json();
    // Do not include the providerConfig/browserKey in assertion diagnostics.
    expect(
      providerConfig.provider === "google" &&
        providerConfig.enabled === true &&
        providerConfig.reasonCode === null,
    ).toBe(true);
    for (const path of ["/dispatch", "/callcenter"]) {
      await page.goto(`${config.opsOrigin}${path}`, {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(page.url()).origin).toBe(config.opsOrigin);
      const layer = await expectReadyGoogleMap(page);
      if (path === "/callcenter") {
        await expect(
          page.locator(
            '[data-callcenter-interactive-map="callcenter-pickup-map-interactive-map"]',
          ),
        ).toBeVisible();
      }
      const screenshot = `map${path.replace("/", "-")}.png`;
      await layer.screenshot({
        path: `.artifacts/live-map-acceptance/${screenshot}`,
      });
      evidence.pages.push({
        path,
        ready: true,
        imagery_decoded: true,
        screenshot,
      });
      expect(failures).toEqual([]);
    }
    evidence.status = "passed";
  } finally {
    writeEvidence(
      ".artifacts/live-map-acceptance/evidence-browser.json",
      evidence,
    );
  }
});
