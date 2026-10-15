import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("stops the accepted JSON browser revoke without proof before upstream authorization or fetch", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("IAP_ENABLED", "false");
  vi.stubEnv("DRTS_ENV", "local");
  vi.stubEnv("DRTS_API_URL", "http://upstream.invalid");
  const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ data: { revoked: true } }),
  );
  const response = await POST(
    new NextRequest("https://platform.example/control-plane-proxy/identity/sessions/test-own-session/revoke", {
      method: "POST",
      headers: { origin: "https://platform.example", "content-type": "application/json" },
      body: JSON.stringify({ reason: "admin_manual_revoke", isCompromised: true }),
    }),
    { params: Promise.resolve({ path: ["identity", "sessions", "test-own-session", "revoke"] }) },
  );
  expect(response.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
