import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import {
  AuthConfigurationError,
  buildAuthStartupConfigReport,
  detectAuthEnvironment,
  isWeakSecret,
  validateAuthStartupConfig,
} from "../../apps/api/src/config/auth-startup-config";

const VALID_STRONG_SECRET = "a_very_strong_production_secret_key_32bytes_min!";

function buildValidProductionEnv(): Record<string, string> {
  return {
    APP_ENV: "production",
    CI: "false",
    JWT_ISSUER: "https://auth.drts.internal",
    JWT_AUDIENCE: "https://api.drts.internal",
    OIDC_ISSUER: "https://oidc.drts.internal",
    OIDC_CLIENT_ID: "drts-bff-client",
    OIDC_TOKEN_ENDPOINT: "https://oidc.drts.internal/oauth2/token",
    OIDC_AUTHORIZATION_ENDPOINT: "https://oidc.drts.internal/oauth2/authorize",
    OIDC_MOCK_MODE: "false",
    JWT_ALGORITHMS: "HS256",
    JWT_SECRET: VALID_STRONG_SECRET,
    TENANT_OIDC_ISSUER: "https://tenant-idp.drts.internal",
    TENANT_OIDC_AUDIENCE: "drts-tenant-workforce",
    TENANT_OIDC_JWT_SECRET: VALID_STRONG_SECRET,
    COOKIE_SECRET: VALID_STRONG_SECRET,
    CSRF_SECRET: VALID_STRONG_SECRET,
    AUTH_ALLOWED_ORIGINS:
      "https://app.drts.internal,https://admin.drts.internal",
    SESSION_STORE_URL: "redis://redis.internal:6379/0",
    AUDIT_STORE_URL: "postgres://user:pass@db.internal:5432/drts_audit",
    // SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: INTERNAL_KEY_EXCP_002 is
    // retired, so a "fully configured production env" no longer sets
    // DRTS_INTERNAL_KEY as a credential -- configuring it without a
    // matching INTERNAL_KEY_EXCEPTION_REGISTRY entry now fails startup (see
    // the "fails when DRTS_INTERNAL_KEY is configured without a documented
    // exception" test below). The complete workload-identity validation set
    // is the other half of the `!internalKey && !workloadIdentityConfigured`
    // check and is what a real production deploy now configures instead.
    DRTS_INTERNAL_KEY_ENFORCED: "true",
    WORKLOAD_IDENTITY_ISSUER: "https://workload.drts.internal",
    WORKLOAD_IDENTITY_AUDIENCE: "https://api.drts.internal",
    WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY: VALID_STRONG_SECRET,
    WORKLOAD_IDENTITY_SERVICE_PRINCIPALS: JSON.stringify([
      {
        principalId: "prod-web-runtime",
        subject: "prod-web-runtime@drts-prod.iam.gserviceaccount.com",
        issuer: "https://workload.drts.internal",
        allowedTokenAudiences: ["https://api.drts.internal"],
      },
    ]),
    PASSENGER_SUBJECT_PEPPER: VALID_STRONG_SECRET,
    PASSENGER_RIDE_TOKEN_PEPPER: VALID_STRONG_SECRET,
  };
}

function buildGoogleOidcEnv(environment: string): Record<string, string> {
  const env: Record<string, string> = {
    ...buildValidProductionEnv(),
    APP_ENV: environment,
    OIDC_ISSUER: "https://accounts.google.com",
    OIDC_CLIENT_ID: "drts-startup-test.apps.googleusercontent.com",
    OIDC_AUTHORIZATION_ENDPOINT: "https://accounts.google.com/o/oauth2/v2/auth",
    OIDC_TOKEN_ENDPOINT: "https://oauth2.googleapis.com/token",
    OIDC_JWKS_URI: "https://www.googleapis.com/oauth2/v3/certs",
  };
  delete env.TENANT_OIDC_ISSUER;
  delete env.TENANT_OIDC_AUDIENCE;
  delete env.TENANT_OIDC_JWT_SECRET;
  return env;
}

// ENTRY-TENANT-GOOGLE-OIDC-20261005: exercise the real startup validator;
// no server, provider HTTP request, or authentication-policy mock is needed.
describe.each(["staging", "production"])(
  "Google OIDC startup in %s",
  (environment) => {
    it("accepts the rotating Google JWKS provider without legacy tenant static credentials", () => {
      const report = buildAuthStartupConfigReport(
        buildGoogleOidcEnv(environment),
      );

      expect(report.environment).toBe(environment);
      expect(report.isStrictEnvironment).toBe(true);
      expect(report.issues).toEqual([]);
      expect(report.valid).toBe(true);
    });

    it("still rejects a missing Google client ID", () => {
      const env = buildGoogleOidcEnv(environment);
      delete env.OIDC_CLIENT_ID;
      const report = buildAuthStartupConfigReport(env);

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          control: "OIDC_CLIENT_ID",
          code: "MISSING_CONTROL",
        }),
      );
    });

    it("accepts the verifier's default Google JWKS endpoint", () => {
      const env = buildGoogleOidcEnv(environment);
      delete env.OIDC_JWKS_URI;
      expect(buildAuthStartupConfigReport(env).issues).toEqual([]);
    });

    it("rejects an insecure Google JWKS override even with a legacy static key", () => {
      const env = buildGoogleOidcEnv(environment);
      env.OIDC_JWKS_URI = "http://www.googleapis.com/oauth2/v3/certs";
      env.TENANT_OIDC_JWT_SECRET = VALID_STRONG_SECRET;
      const report = buildAuthStartupConfigReport(env);
      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({ control: "OIDC_JWKS_URI", code: "UNSAFE_VALUE" }),
      );
    });

    it("does not bypass a non-Google tenant override's verification requirements", () => {
      const env = buildGoogleOidcEnv(environment);
      env.TENANT_OIDC_ISSUER = "https://tenant-idp.drts.internal";
      const report = buildAuthStartupConfigReport(env);
      expect(report.valid).toBe(false);
      expect(report.issues.map((issue) => issue.control)).toEqual([
        "TENANT_OIDC_AUDIENCE",
        "TENANT_OIDC_JWT_PUBLIC_KEY / TENANT_OIDC_JWT_SECRET",
      ]);
    });

    it("rejects a wildcard tenant audience instead of falling back to the Google client", () => {
      const env = buildGoogleOidcEnv(environment);
      env.TENANT_OIDC_AUDIENCE = "*";
      const report = buildAuthStartupConfigReport(env);
      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({ control: "TENANT_OIDC_AUDIENCE", code: "UNSAFE_VALUE" }),
      );
    });

    it("still rejects mock authentication with the Google provider configured", () => {
      const env = buildGoogleOidcEnv(environment);
      env.OIDC_MOCK_MODE = "true";
      const report = buildAuthStartupConfigReport(env);

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          control: "OIDC_MOCK_MODE",
          code: "FORBIDDEN_MODE",
        }),
      );
    });
  },
);

it("classifies shared dev Google OIDC by DRTS_ENV despite NODE_ENV=production", () => {
  const report = buildAuthStartupConfigReport({
    ...buildGoogleOidcEnv("production"),
    NODE_ENV: "production",
    DRTS_ENV: "development",
    AUTH_MODE: "explicit",
  });

  expect(report.environment).toBe("local");
  expect(report.isStrictEnvironment).toBe(false);
  expect(report.issues).toEqual([]);
  expect(report.valid).toBe(true);
});

describe("detectAuthEnvironment", () => {
  it("prefers DRTS_ENV over NODE_ENV for runtime classification", () => {
    expect(
      detectAuthEnvironment({
        DRTS_ENV: "development",
        NODE_ENV: "production",
        CI: "false",
      }),
    ).toBe("local");

    expect(
      detectAuthEnvironment({
        DRTS_ENV: "staging",
        NODE_ENV: "production",
        CI: "false",
      }),
    ).toBe("staging");
  });

  it("detects production environment", () => {
    expect(detectAuthEnvironment({ APP_ENV: "production", CI: "false" })).toBe(
      "production",
    );
    expect(detectAuthEnvironment({ NODE_ENV: "prod", CI: "false" })).toBe(
      "production",
    );
    expect(detectAuthEnvironment({ APP_ENV: "production", CI: "true" })).toBe(
      "production",
    );
  });

  it("detects staging environment", () => {
    expect(detectAuthEnvironment({ APP_ENV: "staging", CI: "false" })).toBe(
      "staging",
    );
    expect(detectAuthEnvironment({ NODE_ENV: "stage", CI: "false" })).toBe(
      "staging",
    );
    expect(detectAuthEnvironment({ APP_ENV: "staging", CI: "true" })).toBe(
      "staging",
    );
  });

  it("detects test environment when CI=true or NODE_ENV=test", () => {
    expect(detectAuthEnvironment({ CI: "true" })).toBe("test");
    expect(detectAuthEnvironment({ NODE_ENV: "test", CI: "false" })).toBe(
      "test",
    );
  });

  it("defaults to local environment", () => {
    expect(detectAuthEnvironment({ CI: "false" })).toBe("local");
  });
});

describe("isWeakSecret", () => {
  it("flags weak and default secret values", () => {
    expect(isWeakSecret("secret")).toBe(true);
    expect(isWeakSecret("jwt-secret")).toBe(true);
    expect(isWeakSecret("123456")).toBe(true);
    expect(isWeakSecret("change-me")).toBe(true);
    expect(isWeakSecret("00000000000000000000000000000000")).toBe(true);
    expect(isWeakSecret(undefined)).toBe(true);
  });

  it("accepts strong non-default secrets", () => {
    expect(isWeakSecret(VALID_STRONG_SECRET)).toBe(false);
  });
});

describe("validateAuthStartupConfig in local & test mode", () => {
  it("allows explicit local dev configuration with defaults when AUTH_MODE is provided", () => {
    const report = validateAuthStartupConfig({
      APP_ENV: "local",
      CI: "false",
      AUTH_MODE: "local",
    });

    expect(report.environment).toBe("local");
    expect(report.isStrictEnvironment).toBe(false);
    expect(report.valid).toBe(true);
    expect(report.config.issuer).toBe("https://auth.local.drts.internal");
    expect(report.config.audience).toBe("https://api.local.drts.internal");
  });

  it("fails validation when AUTH_MODE is omitted in local or test environment", () => {
    const env = {
      APP_ENV: "local",
      CI: "false",
    };
    const report = buildAuthStartupConfigReport(env);

    expect(report.environment).toBe("local");
    expect(report.isStrictEnvironment).toBe(false);
    expect(report.valid).toBe(false);
    expect(
      report.issues.some(
        (i) => i.control === "AUTH_MODE" && i.code === "MISSING_CONTROL",
      ),
    ).toBe(true);

    expect(() => validateAuthStartupConfig(env)).toThrowError(
      AuthConfigurationError,
    );
  });

  it("fails validation and throws when invalid AUTH_MODE is specified in local/test environment", () => {
    const env = {
      APP_ENV: "local",
      CI: "false",
      AUTH_MODE: "invalid_mode",
    };
    const report = buildAuthStartupConfigReport(env);

    expect(report.valid).toBe(false);
    expect(
      report.issues.some(
        (i) => i.control === "AUTH_MODE" && i.code === "INVALID_FORMAT",
      ),
    ).toBe(true);

    expect(() => validateAuthStartupConfig(env)).toThrowError(
      AuthConfigurationError,
    );
  });

  it("strictly rejects JWT algorithm 'none' even in local mode", () => {
    const env = {
      APP_ENV: "local",
      CI: "false",
      AUTH_MODE: "local",
      JWT_ALGORITHM: "none",
    };
    const report = buildAuthStartupConfigReport(env);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.issue.includes("'none'"))).toBe(true);

    expect(() => validateAuthStartupConfig(env)).toThrowError(
      AuthConfigurationError,
    );
  });
});

describe("validateAuthStartupConfig in staging & production (Strict Mode)", () => {
  it("passes clean validation on fully configured production env", () => {
    const env = buildValidProductionEnv();
    const report = validateAuthStartupConfig(env);

    expect(report.environment).toBe("production");
    expect(report.isStrictEnvironment).toBe(true);
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("passes clean validation when production uses asymmetric keys without JWT_SECRET", () => {
    const env = buildValidProductionEnv();
    delete env.JWT_SECRET;
    env.JWT_PRIVATE_KEY = VALID_STRONG_SECRET;
    env.JWT_PUBLIC_KEY = VALID_STRONG_SECRET;
    env.JWT_ALGORITHMS = "RS256";

    const report = validateAuthStartupConfig(env);
    expect(report.valid).toBe(true);
    expect(report.config.algorithms).toEqual(["RS256"]);
    expect(report.config.signing.keyType).toBe("asymmetric");
    expect(report.config.signing.asymmetricKeysConfigured).toBe(true);
  });

  it("fails when JWT_SECRET is paired with an asymmetric algorithm like RS256", () => {
    const env = {
      ...buildValidProductionEnv(),
      JWT_ALGORITHMS: "RS256",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(report.valid).toBe(false);
    expect(
      report.issues.some(
        (i) =>
          i.control === "JWT_PRIVATE_KEY / JWT_PUBLIC_KEY" &&
          i.code === "MISSING_CONTROL",
      ),
    ).toBe(true);
  });

  it("fails when asymmetric keys are paired with a symmetric algorithm like HS256", () => {
    const env = buildValidProductionEnv();
    delete env.JWT_SECRET;
    env.JWT_PRIVATE_KEY = VALID_STRONG_SECRET;
    env.JWT_PUBLIC_KEY = VALID_STRONG_SECRET;
    env.JWT_ALGORITHMS = "HS256";

    const report = buildAuthStartupConfigReport(env);
    expect(report.valid).toBe(false);
    expect(
      report.issues.some(
        (i) => i.control === "JWT_ALGORITHMS" && i.code === "UNSAFE_VALUE",
      ),
    ).toBe(true);
  });

  it("fails when AUTH_MODE=local is supplied in production", () => {
    const env = {
      ...buildValidProductionEnv(),
      AUTH_MODE: "local",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(
      report.issues.some(
        (i) => i.control === "AUTH_MODE" && i.code === "FORBIDDEN_MODE",
      ),
    ).toBe(true);
  });

  it("fails strict startup when the generic PKCE provider is incomplete", () => {
    const env = buildValidProductionEnv();
    delete env.OIDC_TOKEN_ENDPOINT;
    delete env.OIDC_AUTHORIZATION_ENDPOINT;
    delete env.OIDC_CLIENT_ID;

    const report = buildAuthStartupConfigReport(env);

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: "OIDC_TOKEN_ENDPOINT",
          code: "MISSING_CONTROL",
        }),
        expect.objectContaining({
          control: "OIDC_AUTHORIZATION_ENDPOINT",
          code: "MISSING_CONTROL",
        }),
        expect.objectContaining({
          control: "OIDC_CLIENT_ID",
          code: "MISSING_CONTROL",
        }),
      ]),
    );
  });

  it("fails strict startup for mock mode and insecure or placeholder generic OIDC URLs", () => {
    const env = {
      ...buildValidProductionEnv(),
      OIDC_MOCK_MODE: "true",
      OIDC_ISSUER: "http://localhost:4444",
      OIDC_TOKEN_ENDPOINT: "https://placeholder.example.com/token",
    };

    const report = buildAuthStartupConfigReport(env);

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: "OIDC_MOCK_MODE",
          code: "FORBIDDEN_MODE",
        }),
        expect.objectContaining({
          control: "OIDC_ISSUER",
          code: "UNSAFE_VALUE",
        }),
        expect.objectContaining({
          control: "OIDC_TOKEN_ENDPOINT",
          code: "UNSAFE_VALUE",
        }),
      ]),
    );
  });

  it("fails when ALLOW_INSECURE_DEV_AUTH=true is supplied in production", () => {
    const env = {
      ...buildValidProductionEnv(),
      ALLOW_INSECURE_DEV_AUTH: "true",
    };

    expect(() => validateAuthStartupConfig(env)).toThrowError(
      AuthConfigurationError,
    );

    const report = buildAuthStartupConfigReport(env);
    expect(report.issues.some((i) => i.code === "FORBIDDEN_MODE")).toBe(true);
  });

  it("fails when mandatory control JWT_ISSUER is missing", () => {
    const env = buildValidProductionEnv();
    delete env.JWT_ISSUER;
    delete env.OIDC_ISSUER;

    expect(() => validateAuthStartupConfig(env)).toThrowError(
      AuthConfigurationError,
    );

    const report = buildAuthStartupConfigReport(env);
    expect(
      report.issues.some(
        (i) => i.control.includes("JWT_ISSUER") && i.code === "MISSING_CONTROL",
      ),
    ).toBe(true);
  });

  it("fails when JWT_ISSUER uses insecure HTTP in production", () => {
    const env = {
      ...buildValidProductionEnv(),
      JWT_ISSUER: "http://auth.drts.internal",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(report.issues.some((i) => i.issue.includes("HTTPS"))).toBe(true);
  });

  it("fails when JWT_AUDIENCE is wildcard '*'", () => {
    const env = {
      ...buildValidProductionEnv(),
      JWT_AUDIENCE: "*",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(report.issues.some((i) => i.issue.includes("wildcard"))).toBe(true);
  });

  it("fails when JWT_SECRET is weak or too short in production", () => {
    const weakEnv = {
      ...buildValidProductionEnv(),
      JWT_SECRET: "secret",
    };

    const shortEnv = {
      ...buildValidProductionEnv(),
      JWT_SECRET: "short_secret_key_16_chars!",
    };

    const weakReport = buildAuthStartupConfigReport(weakEnv);
    expect(weakReport.issues.some((i) => i.code === "WEAK_SECRET")).toBe(true);

    const shortReport = buildAuthStartupConfigReport(shortEnv);
    expect(
      shortReport.issues.some(
        (i) => i.code === "UNSAFE_VALUE" && i.issue.includes("minimum length"),
      ),
    ).toBe(true);
  });

  it("fails when AUTH_ALLOWED_ORIGINS contains wildcard '*' in production", () => {
    const env = {
      ...buildValidProductionEnv(),
      AUTH_ALLOWED_ORIGINS: "*",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(report.issues.some((i) => i.issue.includes("wildcard"))).toBe(true);
  });

  it("fails when SESSION_STORE_URL is missing and store type is memory in production", () => {
    const env = buildValidProductionEnv();
    delete env.SESSION_STORE_URL;
    env.SESSION_STORE_TYPE = "memory";

    const report = buildAuthStartupConfigReport(env);
    expect(
      report.issues.some((i) => i.control.includes("SESSION_STORE_URL")),
    ).toBe(true);
  });

  it("fails when DRTS_INTERNAL_KEY_ENFORCED is set to false in staging/production", () => {
    const env = {
      ...buildValidProductionEnv(),
      DRTS_INTERNAL_KEY_ENFORCED: "false",
    };

    const report = buildAuthStartupConfigReport(env);
    expect(
      report.issues.some((i) => i.control === "DRTS_INTERNAL_KEY_ENFORCED"),
    ).toBe(true);
  });

  it("fails when DRTS_INTERNAL_KEY is configured without a documented exception (INTERNAL_KEY_EXCP_002 retired, SEC-INTERNAL-KEY-WIF-MIGRATION-20260930)", () => {
    const env = {
      ...buildValidProductionEnv(),
      DRTS_INTERNAL_KEY: VALID_STRONG_SECRET,
    };

    const report = buildAuthStartupConfigReport(env);
    expect(report.valid).toBe(false);
    expect(
      report.issues.some(
        (i) =>
          i.control === "DRTS_INTERNAL_KEY" &&
          i.code === "MISSING_CONTROL" &&
          i.issue.includes("lacks a documented exception entry"),
      ),
    ).toBe(true);
  });
});

describe("Negative configuration matrix & secret leakage prevention", () => {
  const negativeCases: Array<{
    name: string;
    envOverride: Partial<Record<string, string>>;
    expectedCode: string;
    expectedControl: string;
    secretToNotLeak?: string;
  }> = [
    {
      name: "Missing JWT_SECRET",
      envOverride: { JWT_SECRET: "" },
      expectedCode: "MISSING_CONTROL",
      expectedControl: "JWT_SECRET",
    },
    {
      name: "Weak JWT_SECRET 'dev_secret_12345'",
      envOverride: { JWT_SECRET: "dev_secret_12345" },
      expectedCode: "WEAK_SECRET",
      expectedControl: "JWT_SECRET",
      secretToNotLeak: "dev_secret_12345",
    },
    {
      name: "Insecure COOKIE_SECRET",
      envOverride: { COOKIE_SECRET: "change-me" },
      expectedCode: "WEAK_SECRET",
      expectedControl: "COOKIE_SECRET",
      secretToNotLeak: "change-me",
    },
    {
      name: "Short CSRF_SECRET",
      envOverride: { CSRF_SECRET: "short_csrf_secret_123" },
      expectedCode: "UNSAFE_VALUE",
      expectedControl: "CSRF_SECRET",
      secretToNotLeak: "short_csrf_secret_123",
    },
    {
      name: "HTTP origin in production",
      envOverride: { AUTH_ALLOWED_ORIGINS: "http://insecure.example.com" },
      expectedCode: "UNSAFE_VALUE",
      expectedControl: "AUTH_ALLOWED_ORIGINS",
    },
    {
      name: "Disabled internal key enforcement",
      envOverride: { DRTS_INTERNAL_KEY_ENFORCED: "false" },
      expectedCode: "UNSAFE_VALUE",
      expectedControl: "DRTS_INTERNAL_KEY_ENFORCED",
    },
  ];

  for (const tc of negativeCases) {
    it(`correctly handles negative case: ${tc.name}`, () => {
      const baseEnv = buildValidProductionEnv();
      const testEnv = { ...baseEnv, ...tc.envOverride };
      if (tc.envOverride.JWT_SECRET === "") {
        delete testEnv.JWT_SECRET;
      }

      const report = buildAuthStartupConfigReport(testEnv);
      expect(report.valid).toBe(false);

      const matchingIssue = report.issues.find(
        (i) =>
          i.control.includes(tc.expectedControl) && i.code === tc.expectedCode,
      );
      expect(matchingIssue).toBeDefined();

      if (tc.secretToNotLeak) {
        const fullMessage = JSON.stringify(report);
        expect(fullMessage).not.toContain(tc.secretToNotLeak);
      }
    });
  }
});

describe("JwtAuthService key material runtime consistency", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("signs and verifies JWT tokens using JWT_SECRET (symmetric)", () => {
    process.env.JWT_SECRET = VALID_STRONG_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;

    const jwtService = new JwtAuthService();
    const token = jwtService.sign({
      actorId: "usr_123",
      actorType: "tenant_admin",
      realm: "tenant",
      authMode: "jwt_bearer",
      tenantId: "t_acme",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["identity:read"],
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    });

    expect(token).toBeTypeOf("string");
    const verified = jwtService.verify(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("usr_123");
    expect(verified?.tenantId).toBe("t_acme");
  });

  it("signs and verifies JWT tokens using asymmetric RSA key pair without JWT_SECRET", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    delete process.env.JWT_SECRET;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;

    const jwtService = new JwtAuthService();
    const token = jwtService.sign({
      actorId: "usr_asym_123",
      actorType: "tenant_admin",
      realm: "tenant",
      authMode: "jwt_bearer",
      tenantId: "t_asym",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["identity:read"],
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    });

    expect(token).toBeTypeOf("string");
    const verified = jwtService.verify(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("usr_asym_123");
    expect(verified?.tenantId).toBe("t_asym");
  });

  it("throws clear error when signing without any key material configured", () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;

    const jwtService = new JwtAuthService();
    expect(() =>
      jwtService.sign({
        actorId: "usr_123",
        actorType: "tenant_admin",
        realm: "tenant",
        authMode: "jwt_bearer",
        tenantId: "t_acme",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["identity:read"],
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      }),
    ).toThrowError(/neither JWT_PRIVATE_KEY nor JWT_SECRET/i);
  });
});
