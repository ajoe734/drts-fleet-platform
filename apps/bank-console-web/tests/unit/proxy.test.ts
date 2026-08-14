import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";

function requestFor(
  path: string,
  cookie?: string,
  headers?: Record<string, string>,
  method = "GET",
) {
  return new NextRequest(`https://bank-console.test${path}`, {
    method,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  });
}

describe("bank-console proxy auth boundary", () => {
  it("redirects signed-out demo access away from management data routes", () => {
    const response = proxy(
      requestFor("/programs?bank=fubon&locale=zh&signedOut=1"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=fubon&locale=zh&signedOut=1",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "drts_bank_console_signed_out=1",
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("allows the signed-out login page to render", () => {
    const response = proxy(
      requestFor("/login?bank=fubon&locale=zh&signedOut=1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "drts_bank_console_signed_out=1",
    );
  });

  it("allows normal signed-in demo routes", () => {
    const response = proxy(requestFor("/programs?bank=fubon&locale=zh"));

    expect(response.status).toBe(200);
  });

  it("allows the login form POST to clear an existing signed-out marker", () => {
    const response = proxy(
      requestFor(
        "/api/auth/login",
        "drts_bank_console_signed_out=1",
        undefined,
        "POST",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("keeps deep links blocked after sign-out even when the query param is gone", () => {
    const response = proxy(
      requestFor(
        "/bookings?bank=ctbc&locale=zh",
        "drts_bank_console_signed_out=1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=ctbc&locale=zh&signedOut=1",
    );
  });

  it("normalizes signed-out login URLs when only the cookie is present", () => {
    const response = proxy(
      requestFor(
        "/login?bank=cathay&locale=en",
        "drts_bank_console_signed_out=1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=cathay&locale=en&signedOut=1",
    );
  });

  it("does not refresh sign-out state from a cookie-only RSC prefetch", () => {
    const response = proxy(
      requestFor(
        "/login?bank=cathay&locale=en",
        "drts_bank_console_signed_out=1",
        {
          rsc: "1",
          "next-router-prefetch": "1",
          "sec-fetch-dest": "empty",
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=cathay&locale=en&signedOut=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("regression: GET /?role=bank_finance cannot mint drts_bank_console_role session cookie", () => {
    const response = proxy(
      requestFor("/?bank=ctbc&locale=zh&role=bank_finance"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not write or mutate drts_bank_console_role cookie on any GET route when ?role= is present", () => {
    const responseHome = proxy(
      requestFor("/?bank=ctbc&locale=zh&role=bank_finance"),
    );
    expect(responseHome.headers.get("set-cookie")).toBeNull();

    const responseStmt = proxy(
      requestFor("/statements?bank=ctbc&locale=zh&role=bank_finance"),
    );
    expect(responseStmt.headers.get("set-cookie")).toBeNull();

    const responseApi = proxy(
      requestFor(
        "/api/statements/export?bank=ctbc&role=bank_finance",
        "drts_bank_console_role=bank_ops_viewer",
      ),
    );
    expect(responseApi.headers.get("set-cookie")).toBeNull();
  });
});
