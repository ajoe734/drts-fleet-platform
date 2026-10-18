import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function passengerServer() {
  // Loading defineConfig declares services; it starts no server/browser/test.
  vi.stubEnv("GITHUB_ACTIONS", "true");
  vi.stubEnv("PAX_REVIEW_SHARED_DEV_SMOKE", "false");
  const { default: config } =
    await import("../../../playwright.pax-review-shared-order.config");
  const servers = Array.isArray(config.webServer)
    ? config.webServer
    : [config.webServer];
  return servers.find((server) =>
    server?.command.includes("@drts/passenger-app-web"),
  )!;
}

async function requestOtp(url: string, origin?: string) {
  return POST(
    new NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({ target: "0900000001" }),
    }),
    { params: Promise.resolve({ path: ["review-demo", "otp"] }) },
  );
}

it("the configured hosted Passenger origin passes the real NextRequest/BFF CSRF check before reaching OTP", async () => {
  const server = await passengerServer();
  const origin = new URL(server.url!).origin;
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  // Only upstream HTTP is mocked: actual Next URL normalization, path
  // allowlist and CSRF enforcement run unchanged, without sockets.
  const upstream = vi.fn(async () =>
    Response.json({ data: { success: true } }, { status: 201 }),
  );
  vi.stubGlobal("fetch", upstream);
  const response = await requestOtp(
    `${origin}/api/passenger-app/review-demo/otp`,
    origin,
  );
  expect({
    status: response.status,
    refusal: response.status === 403 ? await response.json() : null,
  }).toEqual({ status: 201, refusal: null });
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://api.example/api/passenger-app/review-demo/otp");
  expect(
    JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer)),
  ).toEqual({
    target: "0900000001",
  });
  // The declared readiness URL and actual Next bind hostname must agree.
  expect(server.command).toContain(`--hostname ${new URL(origin).hostname} `);
});

it.each([
  undefined,
  "null",
  "https://foreign.example",
  "http://localhost:3320",
  "https://localhost:3319",
  "http://127.0.0.1:3319",
])(
  "the real BFF still refuses an absent/different Origin (%s)",
  async (origin) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await requestOtp(
      "http://localhost:3319/api/passenger-app/review-demo/otp",
      origin,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "CSRF_CHECK_FAILED" });
    expect(upstream).not.toHaveBeenCalled();
  },
);

const cloudRunHost = "passenger-review-123.us-central1.run.app";
const cloudRunOrigin = `https://${cloudRunHost}`;

async function cloudRunOtp(origin: string | undefined, host = cloudRunHost) {
  // Next standalone sees its HTTP listener URL after Cloud Run terminates TLS.
  // Host remains the browser authority. Forwarded Host is deliberately foreign.
  return POST(
    new NextRequest("http://0.0.0.0:3009/api/passenger-app/review-demo/otp", {
      method: "POST",
      headers: {
        host,
        "x-forwarded-host": "foreign.example",
        "Content-Type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({ target: "0900000001" }),
    }),
    { params: Promise.resolve({ path: ["review-demo", "otp"] }) },
  );
}

it("forwards genuine same-origin OTP through the Cloud Run TLS/standalone URL boundary", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  const upstream = vi.fn(async () =>
    Response.json({ data: { success: true } }, { status: 201 }),
  );
  vi.stubGlobal("fetch", upstream);

  const response = await cloudRunOtp(cloudRunOrigin);
  expect(response.status).toBe(201);
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://api.example/api/passenger-app/review-demo/otp");
  expect(
    JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer)),
  ).toEqual({
    target: "0900000001",
  });
});

it.each([
  undefined,
  "null",
  "https://foreign.example",
  `http://${cloudRunHost}`,
  `${cloudRunOrigin}:444`,
  "http://0.0.0.0:3009",
])(
  "still refuses an absent or different public Origin behind Cloud Run (%s)",
  async (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await cloudRunOtp(origin);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "CSRF_CHECK_FAILED" });
    expect(upstream).not.toHaveBeenCalled();
  },
);

it.each(["localhost:3319", "127.0.0.1:3319"])(
  "keeps the exact HTTP loopback authority usable for the hosted source lane (%s)",
  async (host) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRTS_API_URL", "https://api.example");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const upstream = vi.fn(async () =>
      Response.json({ data: { success: true } }, { status: 201 }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await cloudRunOtp(`http://${host}`, host);
    expect(response.status).toBe(201);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(
      (await cloudRunOtp(`http://${host.replace(":3319", ":3320")}`, host))
        .status,
    ).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  },
);
