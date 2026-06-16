import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";

function requestFor(
  path: string,
  cookie?: string,
  headers?: Record<string, string>,
) {
  return new NextRequest(`https://bank-console.test${path}`, {
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

  it("clears the signed-out cookie when a demo persona signs in", () => {
    const response = proxy(
      requestFor(
        "/?bank=ctbc&locale=zh&role=bank_program_admin",
        "drts_bank_console_signed_out=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "drts_bank_console_signed_out=",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
  });

  it("does not persist sign-out state for router prefetch requests", () => {
    const response = proxy(
      requestFor(
        "/users?bank=ctbc&locale=zh&role=bank_program_admin&signedOut=1",
        undefined,
        { "next-router-prefetch": "1" },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://bank-console.test/login?bank=ctbc&locale=zh&signedOut=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});
