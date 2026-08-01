export type AuthEnvironment = "production" | "staging" | "local" | "test";

export type AuthIssueCode =
  | "MISSING_CONTROL"
  | "UNSAFE_VALUE"
  | "FORBIDDEN_MODE"
  | "WEAK_SECRET"
  | "INVALID_FORMAT";

export interface AuthConfigurationIssue {
  control: string;
  issue: string;
  code: AuthIssueCode;
}

export interface AuthStartupConfig {
  environment: AuthEnvironment;
  isStrictEnvironment: boolean;
  issuer: string;
  audience: string;
  algorithms: string[];
  signing: {
    keyType: "symmetric" | "asymmetric";
    secretConfigured: boolean;
    asymmetricKeysConfigured: boolean;
  };
  cookie: {
    secretConfigured: boolean;
  };
  csrf: {
    secretConfigured: boolean;
  };
  origins: {
    allowedOrigins: string[];
  };
  sessionStore: {
    type: string;
    configured: boolean;
  };
  auditStore: {
    type: string;
    configured: boolean;
  };
  internalKey: {
    enforced: boolean;
    configured: boolean;
  };
  peppers: {
    passengerSubjectConfigured: boolean;
    passengerRideTokenConfigured: boolean;
  };
}

export interface AuthStartupConfigReport {
  environment: AuthEnvironment;
  isStrictEnvironment: boolean;
  valid: boolean;
  issues: AuthConfigurationIssue[];
  warnings: string[];
  config: AuthStartupConfig;
}

export class AuthConfigurationError extends Error {
  public readonly issues: AuthConfigurationIssue[];
  public readonly environment: AuthEnvironment;

  constructor(environment: AuthEnvironment, issues: AuthConfigurationIssue[]) {
    const summary = issues
      .map((i) => `[${i.code}] ${i.control}: ${i.issue}`)
      .join("; ");
    super(
      `Authentication startup validation failed in ${environment} environment: ${summary}`,
    );
    this.name = "AuthConfigurationError";
    this.issues = issues;
    this.environment = environment;
  }
}

type EnvLike = Record<string, string | undefined>;

const INSECURE_DEFAULT_SECRETS = new Set([
  "secret",
  "jwt-secret",
  "jwt_secret",
  "dev-secret",
  "dev_secret",
  "dev_secret_key",
  "123456",
  "change-me",
  "changeme",
  "password",
  "drts-secret",
  "supersecret",
  "test",
  "default",
  "admin",
  "keyboardcat",
  "12345678",
  "abcdef",
]);

const ALLOWED_JWT_ALGORITHMS = new Set([
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
]);

export function detectAuthEnvironment(
  env: EnvLike = process.env,
): AuthEnvironment {
  const raw = (env.APP_ENV ?? env.NODE_ENV)?.trim().toLowerCase();

  if (raw === "prod" || raw === "production") {
    return "production";
  }
  if (raw === "stage" || raw === "staging") {
    return "staging";
  }
  if (raw === "test" || raw === "testing" || raw === "ci") {
    return "test";
  }

  if ((env.CI ?? "").trim().toLowerCase() === "true") {
    return "test";
  }

  return "local";
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseCsv(value: string | undefined): string[] {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isSymmetricJwtAlgorithm(algorithm: string): boolean {
  return algorithm.toUpperCase().startsWith("HS");
}

function isAsymmetricJwtAlgorithm(algorithm: string): boolean {
  return /^(RS|ES|PS)/.test(algorithm.toUpperCase());
}

export function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (INSECURE_DEFAULT_SECRETS.has(normalized)) return true;
  if (/^0+$/.test(normalized) || /^1+$/.test(normalized)) return true;
  if (/dev[-_]?secret/i.test(normalized) || /test[-_]?secret/i.test(normalized))
    return true;
  if (/change[-_]?me/i.test(normalized) || /super[-_]?secret/i.test(normalized))
    return true;
  return false;
}

export function buildAuthStartupConfigReport(
  env: EnvLike = process.env,
): AuthStartupConfigReport {
  const environment = detectAuthEnvironment(env);
  const isStrictEnvironment =
    environment === "production" || environment === "staging";
  const issues: AuthConfigurationIssue[] = [];
  const warnings: string[] = [];

  // 0. Check for forbidden dev flags in production/staging
  const allowInsecureDev =
    (env.ALLOW_INSECURE_DEV_AUTH ?? "").trim().toLowerCase() === "true";
  if (isStrictEnvironment && allowInsecureDev) {
    issues.push({
      control: "ALLOW_INSECURE_DEV_AUTH",
      issue:
        "ALLOW_INSECURE_DEV_AUTH=true is strictly forbidden in staging/production environment",
      code: "FORBIDDEN_MODE",
    });
  }

  // Check explicit local/test mode requirement
  const authMode = normalizeString(env.AUTH_MODE)?.toLowerCase();
  if (!isStrictEnvironment) {
    if (!authMode) {
      issues.push({
        control: "AUTH_MODE",
        issue: `Missing required control: AUTH_MODE must be explicitly configured in ${environment} environment`,
        code: "MISSING_CONTROL",
      });
    } else if (
      !["local", "test", "dev", "explicit", "mock"].includes(authMode)
    ) {
      issues.push({
        control: "AUTH_MODE",
        issue: `Invalid AUTH_MODE "${authMode}" specified for ${environment} environment`,
        code: "INVALID_FORMAT",
      });
    }
  } else {
    if (
      authMode &&
      ["local", "test", "dev", "explicit", "mock", "insecure"].includes(authMode)
    ) {
      issues.push({
        control: "AUTH_MODE",
        issue: `AUTH_MODE="${authMode}" is strictly forbidden in ${environment} environment`,
        code: "FORBIDDEN_MODE",
      });
    }
  }

  // 1. Issuer Validation
  const rawIssuer = env.JWT_ISSUER ?? env.OIDC_ISSUER;
  let issuer = normalizeString(rawIssuer);

  if (isStrictEnvironment) {
    if (!issuer) {
      issues.push({
        control: "JWT_ISSUER / OIDC_ISSUER",
        issue:
          "Missing required control: JWT_ISSUER or OIDC_ISSUER must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
      issuer = "";
    } else {
      if (!issuer.startsWith("https://")) {
        issues.push({
          control: "JWT_ISSUER / OIDC_ISSUER",
          issue:
            "Unsafe control value: JWT_ISSUER / OIDC_ISSUER must use secure HTTPS protocol in staging/production",
          code: "UNSAFE_VALUE",
        });
      }
      if (issuer.includes("localhost") || issuer.includes("127.0.0.1")) {
        issues.push({
          control: "JWT_ISSUER / OIDC_ISSUER",
          issue:
            "Unsafe control value: JWT_ISSUER / OIDC_ISSUER cannot reference localhost/127.0.0.1 in staging/production",
          code: "UNSAFE_VALUE",
        });
      }
    }
  } else {
    issuer = issuer ?? "https://auth.local.drts.internal";
  }

  // 2. Audience Validation
  const rawAudience = env.JWT_AUDIENCE ?? env.OIDC_AUDIENCE;
  let audience = normalizeString(rawAudience);

  if (isStrictEnvironment) {
    if (!audience) {
      issues.push({
        control: "JWT_AUDIENCE / OIDC_AUDIENCE",
        issue:
          "Missing required control: JWT_AUDIENCE or OIDC_AUDIENCE must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
      audience = "";
    } else if (audience === "*" || audience.toLowerCase() === "all") {
      issues.push({
        control: "JWT_AUDIENCE / OIDC_AUDIENCE",
        issue:
          "Unsafe control value: JWT_AUDIENCE / OIDC_AUDIENCE cannot be wildcard '*'",
        code: "UNSAFE_VALUE",
      });
    }
  } else {
    audience = audience ?? "https://api.local.drts.internal";
  }

  // 3. Algorithms Validation
  const rawAlgo = env.JWT_ALGORITHMS ?? env.JWT_ALGORITHM;
  const parsedAlgos = parseCsv(rawAlgo);
  const jwtSecret = normalizeString(env.JWT_SECRET);
  const privateKey = normalizeString(env.JWT_PRIVATE_KEY);
  const publicKey = normalizeString(env.JWT_PUBLIC_KEY);
  const runtimeUsesAsymmetricKey = Boolean(privateKey || publicKey);
  let algorithms: string[] = [];

  if (parsedAlgos.length > 0) {
    for (const algo of parsedAlgos) {
      const upperAlgo = algo.toUpperCase();
      if (algo.toLowerCase() === "none") {
        issues.push({
          control: "JWT_ALGORITHMS",
          issue:
            "Unsafe control value: JWT algorithm 'none' is strictly prohibited",
          code: "UNSAFE_VALUE",
        });
      } else if (!ALLOWED_JWT_ALGORITHMS.has(upperAlgo)) {
        issues.push({
          control: "JWT_ALGORITHMS",
          issue: `Unsafe control value: JWT algorithm '${algo}' is unsupported or insecure`,
          code: "UNSAFE_VALUE",
        });
      } else {
        algorithms.push(upperAlgo);
      }
    }
  }

  if (algorithms.length === 0) {
    algorithms = [runtimeUsesAsymmetricKey ? "RS256" : "HS256"];
  }

  // 4. Signing Key Validation
  const isAsymmetric = runtimeUsesAsymmetricKey;
  const requestsSymmetricAlgorithms = algorithms.some(isSymmetricJwtAlgorithm);
  const requestsAsymmetricAlgorithms =
    algorithms.some(isAsymmetricJwtAlgorithm);

  if (requestsAsymmetricAlgorithms && !isAsymmetric) {
    issues.push({
      control: "JWT_PRIVATE_KEY / JWT_PUBLIC_KEY",
      issue:
        "Missing required control: JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured when JWT_ALGORITHMS requests asymmetric signing (RS*/ES*/PS*)",
      code: "MISSING_CONTROL",
    });
  }

  if (requestsSymmetricAlgorithms && isAsymmetric) {
    issues.push({
      control: "JWT_ALGORITHMS",
      issue:
        "Unsafe control value: Symmetric algorithm (HS*) specified while runtime signing will use asymmetric key material",
      code: "UNSAFE_VALUE",
    });
  }

  if (isStrictEnvironment) {
    if (!jwtSecret && !isAsymmetric) {
      issues.push({
        control: "JWT_SECRET / JWT_PRIVATE_KEY",
        issue:
          "Missing required control: JWT_SECRET or JWT_PRIVATE_KEY/JWT_PUBLIC_KEY must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else if (isAsymmetric) {
      if (!privateKey || !publicKey) {
        issues.push({
          control: "JWT_PRIVATE_KEY / JWT_PUBLIC_KEY",
          issue:
            "Missing required control: both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured for asymmetric JWT signing",
          code: "MISSING_CONTROL",
        });
      } else {
        if (isWeakSecret(privateKey) || isWeakSecret(publicKey)) {
          issues.push({
            control: "JWT_PRIVATE_KEY / JWT_PUBLIC_KEY",
            issue:
              "Unsafe control value: JWT asymmetric key material is set to a known insecure default pattern",
            code: "WEAK_SECRET",
          });
        }
      }
    } else if (jwtSecret) {
      if (isWeakSecret(jwtSecret)) {
        issues.push({
          control: "JWT_SECRET",
          issue:
            "Unsafe control value: JWT_SECRET is set to a known insecure default pattern",
          code: "WEAK_SECRET",
        });
      }
      if (jwtSecret.length < 32) {
        issues.push({
          control: "JWT_SECRET",
          issue: `Unsafe control value: JWT_SECRET length (${jwtSecret.length}) is below required minimum length of 32 characters in staging/production`,
          code: "UNSAFE_VALUE",
        });
      }
    }
  } else {
    if (jwtSecret && jwtSecret.toLowerCase() === "none") {
      issues.push({
        control: "JWT_SECRET",
        issue: "Unsafe control value: JWT_SECRET cannot be 'none'",
        code: "UNSAFE_VALUE",
      });
    }
  }

  // 5. Cookie & CSRF Key Validation
  const cookieSecret = normalizeString(env.COOKIE_SECRET);
  const csrfSecret =
    normalizeString(env.CSRF_SECRET) ?? normalizeString(env.SESSION_SECRET);

  if (isStrictEnvironment) {
    if (!cookieSecret) {
      issues.push({
        control: "COOKIE_SECRET",
        issue:
          "Missing required control: COOKIE_SECRET must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else {
      if (isWeakSecret(cookieSecret)) {
        issues.push({
          control: "COOKIE_SECRET",
          issue:
            "Unsafe control value: COOKIE_SECRET is set to a known insecure default pattern",
          code: "WEAK_SECRET",
        });
      }
      if (cookieSecret.length < 32) {
        issues.push({
          control: "COOKIE_SECRET",
          issue: `Unsafe control value: COOKIE_SECRET length (${cookieSecret.length}) is below required minimum length of 32 characters in staging/production`,
          code: "UNSAFE_VALUE",
        });
      }
    }

    if (!csrfSecret) {
      issues.push({
        control: "CSRF_SECRET",
        issue:
          "Missing required control: CSRF_SECRET (or SESSION_SECRET) must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else {
      if (isWeakSecret(csrfSecret)) {
        issues.push({
          control: "CSRF_SECRET",
          issue:
            "Unsafe control value: CSRF_SECRET is set to a known insecure default pattern",
          code: "WEAK_SECRET",
        });
      }
      if (csrfSecret.length < 32) {
        issues.push({
          control: "CSRF_SECRET",
          issue: `Unsafe control value: CSRF_SECRET length (${csrfSecret.length}) is below required minimum length of 32 characters in staging/production`,
          code: "UNSAFE_VALUE",
        });
      }
    }
  }

  // 6. Allowed Origins Validation
  const rawOrigins = env.AUTH_ALLOWED_ORIGINS ?? env.CORS_ALLOWED_ORIGINS;
  const allowedOrigins = parseCsv(rawOrigins);

  if (isStrictEnvironment) {
    if (allowedOrigins.length === 0) {
      issues.push({
        control: "AUTH_ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS",
        issue:
          "Missing required control: AUTH_ALLOWED_ORIGINS or CORS_ALLOWED_ORIGINS must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else {
      if (allowedOrigins.includes("*")) {
        issues.push({
          control: "AUTH_ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS",
          issue:
            "Unsafe control value: AUTH_ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS cannot contain wildcard '*' in staging/production",
          code: "UNSAFE_VALUE",
        });
      }
      if (environment === "production") {
        for (const origin of allowedOrigins) {
          if (origin.startsWith("http://")) {
            issues.push({
              control: "AUTH_ALLOWED_ORIGINS",
              issue:
                "Unsafe control value: AUTH_ALLOWED_ORIGINS contains non-HTTPS origin in production",
              code: "UNSAFE_VALUE",
            });
            break;
          }
        }
      }
    }
  } else {
    if (allowedOrigins.length === 0) {
      warnings.push(
        "AUTH_ALLOWED_ORIGINS is empty; defaulting to local origins.",
      );
    }
  }

  // 7. Session Store Validation
  const sessionStoreType =
    normalizeString(env.SESSION_STORE_TYPE)?.toLowerCase() ??
    (env.SESSION_STORE_URL || env.REDIS_URL || env.DATABASE_URL
      ? "durable"
      : "memory");

  if (isStrictEnvironment) {
    if (
      sessionStoreType === "memory" ||
      (!env.SESSION_STORE_URL && !env.REDIS_URL && !env.DATABASE_URL)
    ) {
      issues.push({
        control: "SESSION_STORE_URL / REDIS_URL / DATABASE_URL",
        issue:
          "Missing required control: SESSION_STORE_URL, REDIS_URL, or DATABASE_URL required for durable session store in staging/production; in-memory sessions prohibited",
        code: "MISSING_CONTROL",
      });
    }
  }

  // 8. Audit Store Validation
  const auditStoreType =
    normalizeString(env.AUDIT_STORE_TYPE)?.toLowerCase() ??
    (env.AUDIT_STORE_URL || env.DATABASE_URL ? "durable" : "none");

  if (isStrictEnvironment) {
    if (
      auditStoreType === "none" ||
      auditStoreType === "noop" ||
      (!env.AUDIT_STORE_URL && !env.DATABASE_URL)
    ) {
      issues.push({
        control: "AUDIT_STORE_URL / DATABASE_URL",
        issue:
          "Missing required control: AUDIT_STORE_URL or DATABASE_URL required for durable audit persistence in staging/production",
        code: "MISSING_CONTROL",
      });
    }
  }

  // 9. Internal Key & Pepper Secret References
  const internalKeyEnforced = normalizeString(env.DRTS_INTERNAL_KEY_ENFORCED);
  const internalKey = normalizeString(env.DRTS_INTERNAL_KEY);
  const passengerSubjectPepper = normalizeString(env.PASSENGER_SUBJECT_PEPPER);
  const passengerRideTokenPepper = normalizeString(
    env.PASSENGER_RIDE_TOKEN_PEPPER,
  );

  if (isStrictEnvironment) {
    if (internalKeyEnforced?.toLowerCase() === "false") {
      issues.push({
        control: "DRTS_INTERNAL_KEY_ENFORCED",
        issue:
          "Unsafe control value: DRTS_INTERNAL_KEY_ENFORCED cannot be set to false in staging/production",
        code: "UNSAFE_VALUE",
      });
    }

    if (!internalKey) {
      issues.push({
        control: "DRTS_INTERNAL_KEY",
        issue:
          "Missing required control: DRTS_INTERNAL_KEY must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else {
      if (isWeakSecret(internalKey)) {
        issues.push({
          control: "DRTS_INTERNAL_KEY",
          issue:
            "Unsafe control value: DRTS_INTERNAL_KEY is set to a known insecure default pattern",
          code: "WEAK_SECRET",
        });
      }
      if (internalKey.length < 32) {
        issues.push({
          control: "DRTS_INTERNAL_KEY",
          issue: `Unsafe control value: DRTS_INTERNAL_KEY length (${internalKey.length}) is below required minimum length of 32 characters in staging/production`,
          code: "UNSAFE_VALUE",
        });
      }
    }

    if (!passengerSubjectPepper) {
      issues.push({
        control: "PASSENGER_SUBJECT_PEPPER",
        issue:
          "Missing required control: PASSENGER_SUBJECT_PEPPER must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else if (
      isWeakSecret(passengerSubjectPepper) ||
      passengerSubjectPepper.length < 32
    ) {
      issues.push({
        control: "PASSENGER_SUBJECT_PEPPER",
        issue:
          "Unsafe control value: PASSENGER_SUBJECT_PEPPER must be at least 32 characters and not a weak secret",
        code: "UNSAFE_VALUE",
      });
    }

    if (!passengerRideTokenPepper) {
      issues.push({
        control: "PASSENGER_RIDE_TOKEN_PEPPER",
        issue:
          "Missing required control: PASSENGER_RIDE_TOKEN_PEPPER must be configured in staging/production",
        code: "MISSING_CONTROL",
      });
    } else if (
      isWeakSecret(passengerRideTokenPepper) ||
      passengerRideTokenPepper.length < 32
    ) {
      issues.push({
        control: "PASSENGER_RIDE_TOKEN_PEPPER",
        issue:
          "Unsafe control value: PASSENGER_RIDE_TOKEN_PEPPER must be at least 32 characters and not a weak secret",
        code: "UNSAFE_VALUE",
      });
    }
  }

  const valid = issues.length === 0;

  return {
    environment,
    isStrictEnvironment,
    valid,
    issues,
    warnings,
    config: {
      environment,
      isStrictEnvironment,
      issuer,
      audience,
      algorithms,
      signing: {
        keyType: isAsymmetric ? "asymmetric" : "symmetric",
        secretConfigured: Boolean(jwtSecret),
        asymmetricKeysConfigured: Boolean(privateKey && publicKey),
      },
      cookie: {
        secretConfigured: Boolean(cookieSecret),
      },
      csrf: {
        secretConfigured: Boolean(csrfSecret),
      },
      origins: {
        allowedOrigins,
      },
      sessionStore: {
        type: sessionStoreType,
        configured: Boolean(
          env.SESSION_STORE_URL || env.REDIS_URL || env.DATABASE_URL,
        ),
      },
      auditStore: {
        type: auditStoreType,
        configured: Boolean(env.AUDIT_STORE_URL || env.DATABASE_URL),
      },
      internalKey: {
        enforced: internalKeyEnforced?.toLowerCase() !== "false",
        configured: Boolean(internalKey),
      },
      peppers: {
        passengerSubjectConfigured: Boolean(passengerSubjectPepper),
        passengerRideTokenConfigured: Boolean(passengerRideTokenPepper),
      },
    },
  };
}

export function validateAuthStartupConfig(
  env: EnvLike = process.env,
  _options?: { failOnError?: boolean },
): AuthStartupConfigReport {
  const report = buildAuthStartupConfigReport(env);

  if (!report.valid) {
    throw new AuthConfigurationError(report.environment, report.issues);
  }

  return report;
}
