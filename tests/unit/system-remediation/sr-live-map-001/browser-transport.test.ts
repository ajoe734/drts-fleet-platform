import type { BrowserContext, Page, APIRequestContext } from "@playwright/test";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
vi.mock(
  "../../../e2e/system-remediation/sr-live-map-001/live-map-config",
  async (original) => ({
    ...(await original<object>()),
    writeEvidence: save,
  }),
);

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
  const cdp = {
    send: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    detach: vi.fn().mockResolvedValue(undefined),
  };
  const page = { on: vi.fn() };
  const context = {
    newCDPSession: vi.fn().mockResolvedValue(cdp),
    routeWebSocket: vi.fn(),
  };
  const request = {
    get: vi.fn().mockResolvedValue({ ok: () => false, status: () => 403 }),
  };
  return {
    cdp,
    page,
    context,
    request,
    async pause(
      url: string,
      headers: Record<string, string> = {},
      requestId = "request-1",
    ) {
      const handler = cdp.on.mock.calls.find(
        ([event]) => event === "Fetch.requestPaused",
      )?.[1];
      expect(handler).toBeTypeOf("function");
      await handler({ requestId, request: { url, headers } });
    },
    run: () =>
      registered.body!({
        page,
        request,
        context,
      } as unknown as Parameters<BrowserTest>[0]),
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

  it("retains the failing HTTP stage/status without headers or response content", async () => {
    const mock = transport();
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        stage: "config:http",
        last_http_status: 403,
        status: "failed",
        pages: [],
      }),
    );
    expect(JSON.stringify(save.mock.calls)).not.toContain(token);
  });

  it.each([
    "/dispatch",
    "/callcenter",
    "/_next/static/chunk.js",
    "/api/map-provider-config",
  ])(
    "authenticates only the ops request for %s through the actual CDP handler",
    async (path) => {
      const mock = transport();
      mock.request.get.mockImplementation(async () => {
        await mock.pause(`https://ops.example.test${path}`, {
          Accept: "text/html",
          authorization: "old-token",
          "X-Serverless-Authorization": "old-transport",
        });
        return { ok: () => false, status: () => 403 };
      });
      await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
      expect(mock.cdp.send).toHaveBeenCalledWith("Fetch.continueRequest", {
        requestId: "request-1",
        headers: [
          { name: "Accept", value: "text/html" },
          { name: "Authorization", value: `Bearer ${token}` },
        ],
      });
    },
  );

  it.each([
    "https://maps.googleapis.com/maps/api/js?key=unit-key",
    "https://maps.gstatic.com/mapfiles/asset.png",
    "https://api.example.test/api/health",
  ])(
    "strips inherited invoker headers from allowed cross-origin %s",
    async (url) => {
      const mock = transport();
      mock.request.get.mockImplementation(async () => {
        await mock.pause(url, {
          Accept: "*/*",
          Authorization: `Bearer ${token}`,
          aUtHoRiZaTiOn: `Bearer ${token}`,
          "x-SERVERLESS-Authorization": `Bearer ${token}`,
        });
        return { ok: () => false, status: () => 403 };
      });
      await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
      expect(mock.cdp.send).toHaveBeenCalledWith("Fetch.continueRequest", {
        requestId: "request-1",
        headers: [{ name: "Accept", value: "*/*" }],
      });
      expect(JSON.stringify(mock.cdp.send.mock.calls)).not.toContain(token);
    },
  );

  it("re-evaluates authentication at every redirect hop", async () => {
    const mock = transport();
    mock.request.get.mockImplementation(async () => {
      await mock.pause("https://ops.example.test/dispatch", {}, "ops");
      await mock.pause(
        "https://maps.googleapis.com/redirect",
        { Authorization: `Bearer ${token}` },
        "google",
      );
      await mock.pause("https://ops.example.test/callcenter", {}, "ops-return");
      return { ok: () => false, status: () => 403 };
    });
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(
      mock.cdp.send.mock.calls
        .filter(([method]) => method === "Fetch.continueRequest")
        .map(([, params]) => params),
    ).toEqual([
      {
        requestId: "ops",
        headers: [{ name: "Authorization", value: `Bearer ${token}` }],
      },
      { requestId: "google", headers: [] },
      {
        requestId: "ops-return",
        headers: [{ name: "Authorization", value: `Bearer ${token}` }],
      },
    ]);
  });

  it.each([
    "https://ops.example.test.evil.test/",
    "https://ops.example.test:444/",
    "https://user:password@ops.example.test/",
    "http://ops.example.test/",
    `data:text/plain,${token}`,
    `https://unapproved.example.test/?secret=${token}`,
  ])(
    "blocks a disallowed target without emitting credentials: %s",
    async (url) => {
      const mock = transport();
      mock.request.get.mockImplementation(async () => {
        await mock.pause(url, { Authorization: `Bearer ${token}` });
        return { ok: () => false, status: () => 403 };
      });
      await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
      expect(mock.cdp.send).toHaveBeenCalledWith("Fetch.failRequest", {
        requestId: "request-1",
        errorReason: "BlockedByClient",
      });
      expect(
        mock.cdp.send.mock.calls.some(
          ([method]) => method === "Fetch.continueRequest",
        ),
      ).toBe(false);
      expect(JSON.stringify(save.mock.calls)).not.toContain(token);
      expect(JSON.stringify(save.mock.calls)).not.toContain(url);
    },
  );

  it("sanitizes CDP failures even when a protocol exception includes an ID token", async () => {
    const mock = transport();
    mock.cdp.send.mockImplementation(async (method) => {
      if (method === "Fetch.continueRequest")
        throw new Error(`transport failed with ${token}`);
      return {};
    });
    mock.request.get.mockImplementation(async () => {
      await mock.pause("https://ops.example.test/dispatch");
      return { ok: () => false, status: () => 403 };
    });
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(mock.cdp.send).toHaveBeenCalledWith(
      "Fetch.failRequest",
      expect.anything(),
    );
    expect(JSON.stringify(save.mock.calls)).not.toContain(token);
    expect(save.mock.calls[0]?.[1].failures).toContain(
      "Browser request blocked or interception failed",
    );
  });

  it.each([
    undefined,
    "",
    "invalid",
    "Bearer header.payload.signature",
    "header.payload\n.signature",
  ])(
    "fails before network setup without a valid invoker token (%s)",
    async (value) => {
      vi.stubEnv("DRTS_LIVE_MAP_OPS_CONSOLE_ID_TOKEN", value);
      const mock = transport();
      await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
      expect(mock.context.newCDPSession).not.toHaveBeenCalled();
      expect(mock.request.get).not.toHaveBeenCalled();
      expect(save.mock.calls[0]?.[1].stage).toBe("authentication");
    },
  );

  it.each([
    ["DRTS_LIVE_MAP_TEST_AUTHORIZED", "false"],
    ["RUNNER_ENVIRONMENT", "self-hosted"],
    ["WORKFLOW_SHA", "b".repeat(40)],
    ["DRTS_LIVE_MAP_TEST_ORIGIN", "https://unapproved.example.test"],
  ])(
    "preserves the hosted gate before any transport (%s)",
    async (name, value) => {
      vi.stubEnv(name!, value);
      const mock = transport();
      await expect(mock.run()).rejects.toThrow();
      expect(mock.context.newCDPSession).not.toHaveBeenCalled();
      expect(mock.request.get).not.toHaveBeenCalled();
    },
  );

  it("keeps SHA mismatch distinct from provider failure", async () => {
    const mock = transport();
    const json = vi.fn();
    mock.request.get.mockResolvedValue({
      ok: () => true,
      status: () => 200,
      headers: () => ({ "x-drts-candidate-sha": "b".repeat(40) }),
      json,
    });
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      stage: "config:sha",
      last_http_status: 200,
      status: "failed",
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("does not leak provider config or key-bearing parse errors", async () => {
    const mock = transport();
    mock.request.get.mockResolvedValue({
      ok: () => true,
      status: () => 200,
      headers: () => ({ "x-drts-candidate-sha": env.DRTS_CANDIDATE_SHA }),
      json: async () => {
        throw new Error(`Invalid response with key=${token}`);
      },
    });
    await expect(mock.run()).rejects.toThrow("Hosted map rendering failed");
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      stage: "config:provider",
      last_http_status: 200,
      status: "failed",
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain(token);
  });
});
