import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function request(partner?: string) {
  return new NextRequest(
    "https://portal.test/control-plane-proxy/fleet-partner/cases/case-1/attachments/content?objectKey=key",
    {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
      headers: {
        "content-type": "application/octet-stream",
        ...(partner ? { "x-fleet-partner-id": partner } : {}),
      },
    },
  );
}
const context = () => ({
  params: Promise.resolve({
    path: ["fleet-partner", "cases", "case-1", "attachments", "content"],
  }),
});

describe("C125 portal scope before binary forwarding", () => {
  it("forwards raw bytes with server-bound partner identity", async () => {
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-1");
    vi.stubEnv("DRTS_API_URL", "https://api.test");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { scan_state: "clean" } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await PUT(request(), context())).status).toBe(200);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Headers(init.headers).get("x-partner-id")).toBe("fleet-1");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/octet-stream",
    );
  });
  it.each(["fleet-2", ""])(
    "does not let caller headers invent a fleet identity (%s)",
    async (configured) => {
      vi.stubEnv("DRTS_FLEET_PARTNER_ID", configured);
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      expect((await PUT(request("fleet-1"), context())).status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
