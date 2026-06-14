import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";

function requestFor(path: string) {
  return new NextRequest(`https://bank-console.test${path}`);
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
  });

  it("allows the signed-out login page to render", () => {
    const response = proxy(
      requestFor("/login?bank=fubon&locale=zh&signedOut=1"),
    );

    expect(response.status).toBe(200);
  });

  it("allows normal signed-in demo routes", () => {
    const response = proxy(requestFor("/programs?bank=fubon&locale=zh"));

    expect(response.status).toBe(200);
  });
});
