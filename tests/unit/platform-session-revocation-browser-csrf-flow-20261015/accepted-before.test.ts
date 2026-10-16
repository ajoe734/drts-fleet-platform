import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("blocks the accepted JSON browser mutation lacking intent proof before upstream", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("DRTS_ENV", "local");
  vi.stubEnv("DRTS_API_URL", "https://upstream.invalid");
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: {} }));
  const path = ["identity", "sessions", "test-own-session", "revoke"];
  const response = await POST(
    new NextRequest(
      `https://platform.example/control-plane-proxy/${path.join("/")}`,
      {
        method: "POST",
        headers: {
          origin: "https://platform.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "admin_manual_revoke" }),
      },
    ),
    { params: Promise.resolve({ path }) },
  );
  expect({
    status: response.status,
    upstreamCalls: upstream.mock.calls.length,
  }).toEqual({ status: 403, upstreamCalls: 0 });
});
