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
    JWT_ALGORITHMS: "HS256",
    JWT_SECRET: VALID_STRONG_SECRET,
    COOKIE_SECRET: VALID_STRONG_SECRET,
    CSRF_SECRET: VALID_STRONG_SECRET,
    AUTH_ALLOWED_ORIGINS:
      "https://app.drts.internal,https://admin.drts.internal",
    SESSION_STORE_URL: "redis://redis.internal:6379/0",
    AUDIT_STORE_URL: "postgres://user:pass@db.internal:5432/drts_audit",
    DRTS_INTERNAL_KEY: VALID_STRONG_SECRET,
    DRTS_INTERNAL_KEY_ENFORCED: "true",
    PASSENGER_SUBJECT_PEPPER: VALID_STRONG_SECRET,
    PASSENGER_RIDE_TOKEN_PEPPER: VALID_STRONG_SECRET,
  };
}

describe("detectAuthEnvironment", () => {
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
