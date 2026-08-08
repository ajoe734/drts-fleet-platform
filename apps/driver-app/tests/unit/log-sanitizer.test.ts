import { describe, expect, it } from "vitest";
import { sanitizeLogMessage } from "../../lib/log-sanitizer";

describe("Log Sanitizer Security Enforcement (IAM-DRV-002)", () => {
  it("returns empty string for null or undefined input", () => {
    expect(sanitizeLogMessage(null)).toBe("");
    expect(sanitizeLogMessage(undefined)).toBe("");
  });

  it("redacts raw Bearer authorization tokens from error messages", () => {
    const error = new Error(
      "Request failed with status 401: Authorization Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    );
    const sanitized = sanitizeLogMessage(error);
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1Ni");
    expect(sanitized).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
    expect(sanitized).toContain("Authorization Header: [REDACTED]");
  });

  it("redacts accessToken and refreshToken JSON payload fields", () => {
    const rawJsonError = JSON.stringify({
      status: 401,
      error: {
        code: "DRIVER_SESSION_EXPIRED",
        accessToken: "secret-access-token-9999",
        refreshToken: "secret-refresh-token-8888",
        message: "Token failed to refresh",
      },
    });

    const sanitized = sanitizeLogMessage(rawJsonError);
    expect(sanitized).not.toContain("secret-access-token-9999");
    expect(sanitized).not.toContain("secret-refresh-token-8888");
    expect(sanitized).toContain('"accessToken":"[REDACTED]"');
    expect(sanitized).toContain('"refreshToken":"[REDACTED]"');
  });

  it("redacts key-value query string style credentials and registration codes", () => {
    const queryStringError =
      "Failed request: POST /auth/refresh?accessToken=access-12345&refreshToken=refresh-67890&registrationCode=reg-code-555";
    const sanitized = sanitizeLogMessage(queryStringError);
    expect(sanitized).not.toContain("access-12345");
    expect(sanitized).not.toContain("refresh-67890");
    expect(sanitized).not.toContain("reg-code-555");
    expect(sanitized).toContain('accessToken="[REDACTED]"');
    expect(sanitized).toContain('refreshToken="[REDACTED]"');
    expect(sanitized).toContain('registrationCode="[REDACTED]"');
  });

  it("redacts standalone JWT token strings", () => {
    const rawJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkcml2ZXItMDAxIn0.signature_hash_here";
    const sanitized = sanitizeLogMessage(`Unhandled exception with token: ${rawJwt}`);
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1Ni");
    expect(sanitized).toContain("[REDACTED_JWT]");
  });

  it("preserves safe non-sensitive error messages unaltered", () => {
    const safeError = new Error("Network timeout while fetching driver task list.");
    expect(sanitizeLogMessage(safeError)).toBe(
      "Network timeout while fetching driver task list.",
    );
  });
});
