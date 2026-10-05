import type { BrowserContext, Page, APIRequestContext } from "@playwright/test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type BrowserTest = (fixtures: {
  page: Page;
  request: APIRequestContext;
  context: BrowserContext;
}) => Promise<void>;

const { registered, save } = vi.hoisted(() => ({
  registered: { body: undefined as BrowserTest | undefined },
  save: vi.fn(),
}));

// Run the actual spec's transport path without starting Playwright, a browser,
// a server or any HTTP request. The config response deliberately stops before
// map rendering; these tests are not browser-render acceptance evidence.
vi.mock("@playwright/test", () => ({
  expect,
  test: (_name: string, body: BrowserTest) => {
    registered.body = body;
  },
}));
vi.mock("../../../e2e/system-remediation/sr-live-map-001/live-map-config", async (original) => ({
  ...(await original<object>()),
  writeEvidence: save,
}));

const token = "unit-only.ops-invoker.signature";
const env = {
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  DRTS_CANDIDATE_SHA: "a".repeat(40),
  WORKFLOW_SHA: "a".repeat(40),
  DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
  DRTS_LIVE_MAP_ALLOWED_TARGETS:
    "https://ops.example.test,https://api.example.test,https://maps.googleapis.com,https://maps.gstatic.com",
  DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.example.test",
  DRTS_LIVE_MAP_OPS_CONSOLE_ID_TOKEN: token,
};

function transport() {
  const cdp = { send: vi.fn().mockResolvedValue({}), on: vi.fn(), detach: vi.fn() };
  const page = { on: vi.fn() };
  const context = {
    newCDPSession: vi.fn().mockResolvedValue(cdp),
    routeWebSocket: vi.fn(),
  };
  const request = {
    get: vi.fn().mockResolvedValue({ ok: () => false, status: () => 403 }),
  };
  return {
    cdp, page, context, request,
    run: () => registered.body!({ page, request, context } as unknown as Parameters<BrowserTest>[0]),
  };
}

beforeAll(async () => {
  await import("../../../live/google-map-provider.spec");
});
beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("private ops map browser transport", () => {
  it("authenticates the actual spec's config request without following redirects", async () => {
    const mock = transport();
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(mock.request.get).toHaveBeenCalledWith(
      "https://ops.example.test/api/map-provider-config",
      { maxRedirects: 0, headers: { Authorization: `Bearer ${token}` } },
    );
  });
});
