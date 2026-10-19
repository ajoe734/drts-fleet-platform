import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  applyUpstreamAuth: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock("../../../apps/passenger-app-web/lib/api-upstream", () => ({
  applyUpstreamAuth: doubles.applyUpstreamAuth,
}));
vi.mock("node:fs/promises", () => ({ readFile: doubles.readFile }));

import { GET as driverPage } from "../../../apps/passenger-app-web/app/review-driver/[[...path]]/route";
import { POST as driverApi } from "../../../apps/passenger-app-web/app/api/review-driver-api/[...path]/route";

const originalMode = process.env.PAX_PUBLIC_PASSENGER_ONLY;
const originalDemo = process.env.PAX_REVIEW_DEMO_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAX_REVIEW_DEMO_ENABLED = "true";
  doubles.readFile.mockResolvedValue("<html>Driver rehearsal</html>");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ driver: "fixture" })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMode === undefined) delete process.env.PAX_PUBLIC_PASSENGER_ONLY;
  else process.env.PAX_PUBLIC_PASSENGER_ONLY = originalMode;
  if (originalDemo === undefined) delete process.env.PAX_REVIEW_DEMO_ENABLED;
  else process.env.PAX_REVIEW_DEMO_ENABLED = originalDemo;
});

describe("public Passenger mode closes the bundled Driver routes", () => {
  it("does not read or return the Driver SPA", async () => {
    process.env.PAX_PUBLIC_PASSENGER_ONLY = "true";
    expect((await driverPage()).status).toBe(404);
    expect(doubles.readFile).not.toHaveBeenCalled();
  });

  it("does not mint upstream authority or forward a Driver command", async () => {
    process.env.PAX_PUBLIC_PASSENGER_ONLY = "true";
    const response = await driverApi(
      new NextRequest(
        "https://passenger.example/api/review-driver-api/api/driver/me",
        {
          method: "POST",
          headers: { authorization: "Bearer untrusted-browser-value" },
          body: "{}",
        },
      ),
      { params: Promise.resolve({ path: ["api", "driver", "me"] }) },
    );
    expect(response.status).toBe(404);
    expect(doubles.applyUpstreamAuth).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the existing private hosted Driver consumer unchanged", async () => {
    process.env.PAX_PUBLIC_PASSENGER_ONLY = "false";
    expect((await driverPage()).status).toBe(200);
    const response = await driverApi(
      new NextRequest(
        "https://private.example/api/review-driver-api/api/driver/me",
        {
          method: "POST",
          body: "{}",
        },
      ),
      { params: Promise.resolve({ path: ["api", "driver", "me"] }) },
    );
    expect(response.status).toBe(200);
    expect(doubles.applyUpstreamAuth).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
