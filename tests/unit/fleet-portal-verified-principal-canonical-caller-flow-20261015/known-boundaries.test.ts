import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
afterEach(() => vi.unstubAllEnvs());
// Preserve the original middleware denial/accept contract independently of
// the repaired browser callers exercised in caller-boundaries.test.ts.
it.each([
  "fleet-partner/supply-submissions/drivers",
  "fleet-partner/cases/cmp_0908/reply",
])(
  "existing cookie mutation at %s requires the original CSRF header",
  (path) => {
    vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "");
    const url = `https://portal.test/control-plane-proxy/${path}`;
    const headers = {
      cookie: "drts_session=existing-session; drts_csrf=original-csrf",
      origin: "https://portal.test",
    };
    const denied = middleware(
      new NextRequest(url, { method: "POST", headers }),
    );
    expect(denied.status).toBe(403);
    const accepted = middleware(
      new NextRequest(url, {
        method: "POST",
        headers: { ...headers, "x-csrf-token": "original-csrf" },
      }),
    );
    expect(accepted.headers.get("x-middleware-next")).toBe("1");
  },
);
