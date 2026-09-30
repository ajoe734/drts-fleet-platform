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
    deployed_sha: config.deployedSha,
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
  // Chromium interception sees each redirected request too (Playwright route
  // handlers only see the first URL in a redirect chain). No response mocking.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  cdp.on("Fetch.requestPaused", async ({ requestId, request: intercepted }) => {
    try {
      assertAllowedUrl(intercepted.url, config.allowedTargets);
    } catch {
      failures.push(
        `Browser target outside DRTS_LIVE_MAP_ALLOWED_TARGETS: ${new URL(intercepted.url).origin}`,
      );
      await cdp.send("Fetch.failRequest", {
        requestId,
        errorReason: "BlockedByClient",
      });
      return;
    }
    await cdp.send("Fetch.continueRequest", { requestId });
  });
  await context.routeWebSocket("**/*", (socket) => {
    // These map pages need no WebSocket transport. Prevent a new socket target
    // escaping the HTTP allowlist and make an unexpected dependency explicit.
    failures.push("Unexpected WebSocket dependency in map acceptance");
    socket.close();
  });
  try {
    const configResponse = await request.get(
      `${config.opsOrigin}/api/map-provider-config`,
      { maxRedirects: 0 },
    );
    expect(configResponse.ok()).toBe(true);
    expect(configResponse.headers()["x-drts-candidate-sha"]).toBe(
      config.deployedSha,
    );
    const providerConfig = await configResponse.json();
    // Do not include the providerConfig/browserKey in assertion diagnostics.
    expect(
      providerConfig.provider === "google" &&
        providerConfig.enabled === true &&
        providerConfig.reasonCode === null,
    ).toBe(true);
    for (const path of ["/dispatch", "/callcenter"]) {
      const response = await page.goto(`${config.opsOrigin}${path}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.headers()["x-drts-candidate-sha"]).toBe(
        config.deployedSha,
      );
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
  } catch {
    failures.push("Map rendering failed; only sanitized evidence is retained");
    throw new Error("Hosted map rendering failed; see evidence-browser.json");
  } finally {
    writeEvidence(
      ".artifacts/live-map-acceptance/evidence-browser.json",
      evidence,
    );
    await cdp.detach();
  }
});
