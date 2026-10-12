import { expect, test, type CDPSession, type Page } from "@playwright/test";
import {
  validateLiveMapGate,
  writeEvidence,
} from "../e2e/system-remediation/sr-live-map-001/live-map-config";
import { createOpsConsoleAuthentication } from "../e2e/system-remediation/sr-live-map-001/browser-auth";

const GOOGLE_MAP_ERROR =
  /InvalidKeyMapError|RefererNotAllowedMapError|ApiNotActivatedMapError|Google Maps JavaScript API error/i;

// Return our own literals, never CDP source text (which may contain secrets).
const RESOURCE_TYPES = [
  "Document",
  "Stylesheet",
  "Image",
  "Media",
  "Font",
  "Script",
  "TextTrack",
  "XHR",
  "Fetch",
  "Prefetch",
  "EventSource",
  "WebSocket",
  "Manifest",
  "SignedExchange",
  "Ping",
  "CSPViolationReport",
  "Preflight",
  "Other",
] as const;

type TransportFailure = {
  category:
    | "target-policy-rejected"
    | "continue-request-failed"
    | "navigation-failed"
    | "interception-setup-failed"
    | "interception-cleanup-failed"
    | "interception-cleanup-timeout"
    | "interception-drain-timeout";
  resource_type: (typeof RESOURCE_TYPES)[number] | "Unknown";
  block_result: "blocked" | "block-failed" | "pending" | "not-attempted";
  target_kind?: ReturnType<typeof classifyRequestTarget>;
};

// These are harness wait budgets, not Google readiness/freshness thresholds.
const INTERCEPTION_DRAIN_BUDGET_MS = 5_000;
const INTERCEPTION_DETACH_TIMEOUT_MS = 1_000;

async function finishesWithin(operation: Promise<unknown>, limitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), limitMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Diagnostic only: headersFor remains the sole target/credential authority.
// Fixed scheme/origin classes locate a rejection without retaining its URL.
function classifyRequestTarget(
  url: string,
  opsOrigin: string,
  allowedTargets: string[],
):
  | "credential-bearing"
  | "ops-https"
  | "allowed-https"
  | "unapproved-https"
  | "insecure-http"
  | "data"
  | "blob"
  | "other-scheme"
  | "invalid-url" {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return "credential-bearing";
    switch (parsed.protocol) {
      case "https:":
        if (parsed.origin === opsOrigin) return "ops-https";
        return allowedTargets.includes(parsed.origin)
          ? "allowed-https"
          : "unapproved-https";
      case "http:":
        return "insecure-http";
      case "data:":
        return "data";
      case "blob:":
        return "blob";
      default:
        return "other-scheme";
    }
  } catch {
    return "invalid-url";
  }
}

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
    transport_failures: [] as TransportFailure[],
    pending_interceptions: 0,
  };
  let cdp: CDPSession | undefined;
  const pendingInterceptions = new Set<Promise<void>>();
  let drainBudgetMs = INTERCEPTION_DRAIN_BUDGET_MS;
  let drainExpired = false;
  const settleInterceptions = async () => {
    while (pendingInterceptions.size > 0) {
      if (drainExpired) return;
      const started = Date.now();
      const settled = await finishesWithin(
        Promise.all([...pendingInterceptions]),
        drainBudgetMs,
      );
      // Share one cumulative wait budget across batches and page/final drains.
      // New callbacks must not renew the deadline indefinitely.
      drainBudgetMs = Math.max(0, drainBudgetMs - (Date.now() - started));
      if (!settled || (drainBudgetMs === 0 && pendingInterceptions.size > 0)) {
        drainExpired = true;
        failures.push("Browser interception drain deadline expired");
        evidence.transport_failures.push({
          category: "interception-drain-timeout",
          resource_type: "Unknown",
          block_result: "not-attempted",
        });
        return;
      }
    }
  };
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
      ({ requestId, request: intercepted, resourceType }) => {
        const pending = (async () => {
          let category: TransportFailure["category"] = "target-policy-rejected";
          try {
            const headers = authentication.headersFor(
              intercepted.url,
              intercepted.headers,
            );
            category = "continue-request-failed";
            await interception.send("Fetch.continueRequest", {
              requestId,
              headers: Object.entries(headers).map(([name, value]) => ({
                name,
                value,
              })),
            });
          } catch {
            // Classify by the operation that failed, never by parsing an exception.
            // A continue failure does not prove cancellation or a harmless request.
            failures.push("Browser request blocked or interception failed");
            const failure: TransportFailure = {
              category,
              target_kind: classifyRequestTarget(
                intercepted.url,
                config.opsOrigin,
                config.allowedTargets,
              ),
              resource_type:
                RESOURCE_TYPES.find((value) => value === resourceType) ??
                "Unknown",
              block_result: "pending",
            };
            // One entry per failed request, including duplicates; recovery status
            // is separate so a failed failRequest cannot disappear or double count.
            evidence.transport_failures.push(failure);
            try {
              await interception.send("Fetch.failRequest", {
                requestId,
                errorReason: "BlockedByClient",
              });
              failure.block_result = "blocked";
            } catch {
              failure.block_result = "block-failed";
            }
          }
        })();
        pendingInterceptions.add(pending);
        void pending.finally(() => pendingInterceptions.delete(pending));
        return pending;
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
      const response = await page
        .goto(`${config.opsOrigin}${path}`, {
          waitUntil: "domcontentloaded",
        })
        .catch(() => {
          evidence.transport_failures.push({
            category: "navigation-failed",
            resource_type: "Document",
            block_result: "not-attempted",
          });
          throw new Error("Browser navigation failed");
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
      await settleInterceptions();
      expect(failures).toEqual([]);
    }
    evidence.stage = "complete";
    evidence.status = "passed";
  } catch {
    if (evidence.stage === "network-interception") {
      evidence.transport_failures.push({
        category: "interception-setup-failed",
        resource_type: "Unknown",
        block_result: "not-attempted",
      });
    }
    failures.push(
      `Map rendering failed at ${evidence.stage}; only sanitized evidence is retained`,
    );
  } finally {
    if (cdp) {
      try {
        const detached = await finishesWithin(
          cdp.detach(),
          INTERCEPTION_DETACH_TIMEOUT_MS,
        );
        if (!detached) {
          failures.push("Browser interception cleanup deadline expired");
          evidence.transport_failures.push({
            category: "interception-cleanup-timeout",
            resource_type: "Unknown",
            block_result: "not-attempted",
          });
        }
      } catch {
        failures.push("Browser interception cleanup failed");
        evidence.transport_failures.push({
          category: "interception-cleanup-failed",
          resource_type: "Unknown",
          block_result: "not-attempted",
        });
      }
    }
    // Detach ends new interception events; settle the callbacks already started
    // before taking the durable snapshot, including their failRequest results.
    await settleInterceptions();
    // An unresolved callback is unknown, not a successful request/recovery.
    evidence.pending_interceptions = pendingInterceptions.size;
    if (failures.length > 0) evidence.status = "failed";
    writeEvidence(
      ".artifacts/live-map-acceptance/evidence-browser.json",
      evidence,
    );
  }
  if (evidence.status !== "passed") {
    throw new Error("Hosted map rendering failed; see evidence-browser.json");
  }
});
