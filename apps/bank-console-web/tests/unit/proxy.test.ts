import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";

function requestFor(path: string, cookie?: string) {
  return new NextRequest(
    `https://bank-console.test${path}`,
    cookie ? { headers: { cookie } } : undefined,
  );
}

const signedOutProtectedPaths = [
  "/programs?bank=fubon&locale=zh&signedOut=1",
  "/bookings?bank=fubon&locale=zh&signedOut=1",
  "/bookings/ord_fubon_240611_01?bank=fubon&locale=zh&signedOut=1",
  "/contracts?bank=fubon&locale=zh&signedOut=1",
  "/contracts/ctr_fubon_world_elite_2026?bank=fubon&locale=zh&signedOut=1",
  "/statements?bank=fubon&locale=zh&signedOut=1",
  "/statements/2026-06?bank=fubon&locale=zh&signedOut=1",
  "/users?bank=fubon&locale=zh&signedOut=1",
  "/audit?bank=fubon&locale=zh&signedOut=1",
] as const;

describe("bank-console proxy auth boundary", () => {
  it.each(signedOutProtectedPaths)(
    "redirects signed-out demo access away from protected route %s",
    (path) => {
      const response = proxy(requestFor(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://bank-console.test/login?bank=fubon&locale=zh&signedOut=1",
      );
      expect(response.headers.get("set-cookie")).toContain(
        "drts-bank-console-signed-out=1",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("allows the signed-out login page to render", () => {
    const response = proxy(
      requestFor("/login?bank=fubon&locale=zh&signedOut=1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "drts-bank-console-signed-out=1",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      response.headers.get(
        "x-middleware-request-x-drts-bank-console-auth-boundary",
      ),
    ).toBe("1");
  });

  it("allows normal signed-in demo routes", () => {
    const response = proxy(requestFor("/programs?bank=fubon&locale=zh"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects protected routes while the signed-out cookie is active", () => {
    const response = proxy(
      requestFor(
        "/statements?bank=fubon&locale=zh",
        "drts-bank-console-signed-out=1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=fubon&locale=zh&signedOut=1",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "drts-bank-console-signed-out=1",
    );
  });

  it("clears the signed-out cookie when the login page re-enters sign-in mode", () => {
    const response = proxy(
      requestFor(
        "/login?bank=fubon&locale=zh",
        "drts-bank-console-signed-out=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "drts-bank-console-signed-out=; Path=/; Max-Age=0",
    );
  });
});
