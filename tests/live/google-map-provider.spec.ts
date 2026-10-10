import { expect, test, type CDPSession, type Page } from "@playwright/test";
import {
  validateLiveMapGate,
  writeEvidence,
} from "../e2e/system-remediation/sr-live-map-001/live-map-config";
import { createOpsConsoleAuthentication } from "../e2e/system-remediation/sr-live-map-001/browser-auth";

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

async function expectReadyGoogleMap(
  page: Page,
  stage: (value: string) => void,
) {
  stage("ready");
  const layer = page.locator("[data-google-map-base-layer]").first();
  await expect(layer).toHaveAttribute("data-google-map-status", "ready", {
    timeout: 45_000,
  });
  const image = layer
    .locator(
      'img[src^="https://maps.googleapis.com/maps/api/js/StaticMapService.GetMapImage"]',
    )
    .first();
  stage("imagery-visible");
  await expect(image).toBeVisible({ timeout: 30_000 });
  stage("imagery-decoded");
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  stage("dimensions");
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
    stage: "authentication",
    last_http_status: null as number | null,
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
  let cdp: CDPSession | undefined;
  try {
    const authentication = createOpsConsoleAuthentication(process.env);
    evidence.stage = "network-interception";
    // CDP sees every redirected request. Scope the invoker header separately
    // for each hop; never use global extraHTTPHeaders on Google Maps pages.
    cdp = await context.newCDPSession(page);
    const interception = cdp;
    await interception.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
    interception.on(
      "Fetch.requestPaused",
      async ({ requestId, request: intercepted }) => {
        try {
          const headers = authentication.headersFor(
            intercepted.url,
            intercepted.headers,
          );
          await interception.send("Fetch.continueRequest", {
            requestId,
            headers: Object.entries(headers).map(([name, value]) => ({
              name,
              value,
            })),
          });
        } catch {
          // Protocol errors can contain the request/headers. Retain a fixed code
          // only, and fail closed on forbidden targets or interception failures.
          failures.push("Browser request blocked or interception failed");
          await interception
            .send("Fetch.failRequest", {
              requestId,
              errorReason: "BlockedByClient",
            })
            .catch(() => {
              /* The page may already have closed. */
            });
        }
      },
    );
    await context.routeWebSocket("**/*", (socket) => {
      failures.push("Unexpected WebSocket dependency in map acceptance");
      socket.close();
    });
    evidence.stage = "config:http";
    const configUrl = `${config.opsOrigin}/api/map-provider-config`;
    const configResponse = await request.get(configUrl, {
      maxRedirects: 0,
      headers: authentication.headersFor(configUrl),
    });
    evidence.last_http_status = configResponse.status();
    expect(configResponse.ok()).toBe(true);
    evidence.stage = "config:sha";
    expect(configResponse.headers()["x-drts-candidate-sha"]).toBe(
      config.deployedSha,
    );
    evidence.stage = "config:provider";
    const providerConfig = await configResponse.json();
    // Do not include the providerConfig/browserKey in assertion diagnostics.
    expect(
      providerConfig.provider === "google" &&
        providerConfig.enabled === true &&
        providerConfig.reasonCode === null,
    ).toBe(true);
    for (const path of ["/dispatch", "/callcenter"]) {
      evidence.stage = `page:${path}:http`;
      const response = await page.goto(`${config.opsOrigin}${path}`, {
        waitUntil: "domcontentloaded",
      });
      evidence.last_http_status = response?.status() ?? null;
      expect(response?.ok()).toBe(true);
      evidence.stage = `page:${path}:sha`;
      expect(response?.headers()["x-drts-candidate-sha"]).toBe(
        config.deployedSha,
      );
      expect(new URL(page.url()).origin).toBe(config.opsOrigin);
      const layer = await expectReadyGoogleMap(page, (stage) => {
        evidence.stage = `page:${path}:${stage}`;
      });
      if (path === "/callcenter") {
        evidence.stage = `page:${path}:interactive`;
        await expect(
          page.locator(
            '[data-callcenter-interactive-map="callcenter-pickup-map-interactive-map"]',
          ),
        ).toBeVisible();
      }
      evidence.stage = `page:${path}:screenshot`;
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
    evidence.stage = "complete";
    evidence.status = "passed";
  } catch {
    failures.push(
      `Map rendering failed at ${evidence.stage}; only sanitized evidence is retained`,
    );
    throw new Error("Hosted map rendering failed; see evidence-browser.json");
  } finally {
    await cdp?.detach().catch(() => {
      failures.push("Browser interception cleanup failed");
      evidence.status = "failed";
    });
    writeEvidence(
      ".artifacts/live-map-acceptance/evidence-browser.json",
      evidence,
    );
  }
});
