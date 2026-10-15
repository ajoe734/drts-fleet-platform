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
