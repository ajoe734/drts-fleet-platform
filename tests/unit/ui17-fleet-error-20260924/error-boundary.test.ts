import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
import { POST } from "../../../apps/fleet-partner-portal-web/app/api/auth/[...auth]/route";

describe("UI17-FLEET-ERROR-20260924 auth logic", () => {
  it("logout route and middleware handle CSRF and session success", async () => {
    const successReq = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "csrf-123",
      }),
    });

    const midResSuccess = await middleware(successReq);
    expect(midResSuccess.headers.get("x-drts-candidate-sha")).toBeDefined();

    const routeRes = await POST(successReq, {
      params: Promise.resolve({ auth: ["logout"] }),
    });
    expect(routeRes.status).toBe(200);
    const setCookie = routeRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain("drts_session=;");
  });

  it("logout route and middleware handle 403 on invalid CSRF", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "wrong",
      }),
    });

    const midRes = await middleware(req);
    expect(midRes.status).toBe(403);
    const body = await midRes.json();
    expect(body.error).toBe("CSRF_TOKEN_INVALID");
  });
});
