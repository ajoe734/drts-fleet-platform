import { describe, expect, it } from "vitest";

import {
  AuthConfigurationError,
  buildAuthStartupConfigReport,
  validateAuthStartupConfig,
} from "../../src/config/auth-startup-config";

const VALID_PROD_SECRET =
  "valid_production_secret_key_string_32chars_long_minimum!";

function getValidProdEnv(): Record<string, string> {
  return {
    APP_ENV: "production",
    CI: "false",
    JWT_ISSUER: "https://auth.drts.internal",
    JWT_AUDIENCE: "https://api.drts.internal",
    JWT_ALGORITHMS: "HS256",
    JWT_SECRET: VALID_PROD_SECRET,
    COOKIE_SECRET: VALID_PROD_SECRET,
    CSRF_SECRET: VALID_PROD_SECRET,
    AUTH_ALLOWED_ORIGINS: "https://app.drts.internal",
    SESSION_STORE_URL: "redis://redis.internal:6379/0",
    AUDIT_STORE_URL: "postgres://db.internal:5432/drts_audit",
    DRTS_INTERNAL_KEY: VALID_PROD_SECRET,
    DRTS_INTERNAL_KEY_ENFORCED: "true",
    PASSENGER_SUBJECT_PEPPER: VALID_PROD_SECRET,
    PASSENGER_RIDE_TOKEN_PEPPER: VALID_PROD_SECRET,
  };
}

describe("Authentication Startup Configuration Integration Smoke", () => {
  it("passes startup preflight validation with complete production environment", () => {
    const env = getValidProdEnv();
    const report = validateAuthStartupConfig(env);

    expect(report.environment).toBe("production");
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.config.issuer).toBe("https://auth.drts.internal");
    expect(report.config.audience).toBe("https://api.drts.internal");
  });

  it("blocks production startup when unsafe auth config is detected", () => {
    const unsafeEnv = {
      ...getValidProdEnv(),
      JWT_SECRET: "weak-secret",
    };

    expect(() => validateAuthStartupConfig(unsafeEnv)).toThrowError(
      AuthConfigurationError,
    );
  });

  it("ensures validation error message details missing controls without leaking secret values", () => {
    const secretValueToHide = "my_super_secret_raw_key_12345";
    const unsafeEnv = {
      ...getValidProdEnv(),
      JWT_SECRET: secretValueToHide,
    };

    let caughtError: AuthConfigurationError | null = null;
    try {
      validateAuthStartupConfig(unsafeEnv);
    } catch (err) {
      if (err instanceof AuthConfigurationError) {
        caughtError = err;
      }
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain(
      "Authentication startup validation failed",
    );
    expect(caughtError?.message).toContain("JWT_SECRET");
    expect(caughtError?.message).not.toContain(secretValueToHide);
  });

  it("verifies negative matrix across multiple missing controls in staging", () => {
    const invalidStagingEnv: Record<string, string> = {
      APP_ENV: "staging",
      CI: "false",
      ALLOW_INSECURE_DEV_AUTH: "true",
      JWT_ISSUER: "http://insecure-issuer.local",
      JWT_AUDIENCE: "*",
      DRTS_INTERNAL_KEY_ENFORCED: "false",
    };

    const report = buildAuthStartupConfigReport(invalidStagingEnv);
    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThanOrEqual(5);

    const issueCodes = new Set(report.issues.map((i) => i.code));
    expect(issueCodes.has("FORBIDDEN_MODE")).toBe(true);
    expect(issueCodes.has("UNSAFE_VALUE")).toBe(true);
    expect(issueCodes.has("MISSING_CONTROL")).toBe(true);
  });
});
