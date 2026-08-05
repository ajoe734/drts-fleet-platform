import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../apps/api/src/app.module";
import { InternalKeyMiddleware } from "../../apps/api/src/common/auth/internal-key.middleware";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { SnakeCaseExceptionFilter } from "../../apps/api/src/common/snake-case.exception-filter";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { ServiceWorkloadIdentityAdapter } from "../../apps/api/src/modules/auth/service-workload-identity.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Module } = require("@nestjs/common") as typeof import("@nestjs/common");
const { NestFactory } =
  require("@nestjs/core") as typeof import("@nestjs/core");
const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");

const AUTH_SIGNING_SECRET = "auth_signing_secret_value_with_minimum_length_32!";
const WORKLOAD_ASSERTION_SECRET =
  "workload_assertion_secret_value_with_minimum_length_32!";
const STAGING_API_AUDIENCE = "https://api.staging.drts.internal";
const STAGING_CONTROL_PLANE_AUDIENCE =
  "https://control-plane.staging.drts.internal";
const STAGING_EXCHANGE_AUDIENCE =
  "https://auth.staging.drts.internal/token-exchange";
const STAGING_WORKLOAD_ISSUER = "https://workload.staging.drts.internal";
const DEV_EXCHANGE_AUDIENCE = "https://auth.dev.drts.internal/token-exchange";

function signWorkloadAssertion(overrides?: Partial<jwt.JwtPayload>): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: STAGING_WORKLOAD_ISSUER,
      sub: "dispatch-runtime",
      aud: STAGING_EXCHANGE_AUDIENCE,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    WORKLOAD_ASSERTION_SECRET,
    {
      algorithm: "HS256",
    },
  );
}

function configureWorkloadIdentityEnvironment() {
  process.env.APP_ENV = "staging";
  process.env.JWT_SECRET = AUTH_SIGNING_SECRET;
  process.env.JWT_ISSUER = "https://auth.staging.drts.internal";
  process.env.JWT_AUDIENCE = STAGING_API_AUDIENCE;
  process.env.WORKLOAD_IDENTITY_ISSUER = STAGING_WORKLOAD_ISSUER;
  process.env.WORKLOAD_IDENTITY_AUDIENCE = STAGING_EXCHANGE_AUDIENCE;
  process.env.WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY =
    WORKLOAD_ASSERTION_SECRET;
  process.env.WORKLOAD_IDENTITY_JWT_ALGORITHMS = "HS256";
  process.env.WORKLOAD_IDENTITY_SERVICE_PRINCIPALS = JSON.stringify([
    {
      principalId: "svc-dispatch-runtime",
      actorId: "dispatch-runtime",
      issuer: STAGING_WORKLOAD_ISSUER,
      subject: "dispatch-runtime",
      displayName: "Dispatch Runtime",
      roles: ["dispatch_runtime"],
      scopes: ["dispatch:read", "dispatch:write"],
      allowedTokenAudiences: [
        STAGING_API_AUDIENCE,
        STAGING_CONTROL_PLANE_AUDIENCE,
      ],
      defaultTokenAudience: STAGING_API_AUDIENCE,
    },
  ]);
  delete process.env.DRTS_INTERNAL_KEY;
}

function buildAuthController(identityRepository: IdentityRepository) {
  const jwtAuthService = new JwtAuthService(identityRepository);
  const workloadIdentityAdapter = new ServiceWorkloadIdentityAdapter(
    identityRepository,
  );
  const authController = new AuthController(
    jwtAuthService,
    {} as never,
    {} as never,
    undefined,
    undefined,
    workloadIdentityAdapter,
  );

  return { authController, jwtAuthService };
}

async function createWorkloadIdentityHttpApp(
  identityRepository: IdentityRepository,
) {
  @Module({
    controllers: [AuthController],
    providers: [
      JwtAuthService,
      ServiceWorkloadIdentityAdapter,
      {
        provide: IdentityRepository,
        useValue: identityRepository,
      },
      {
        provide: TenantPartnerService,
        useValue: {} satisfies Partial<TenantPartnerService>,
      },
      {
        provide: DriverDeviceSessionService,
        useValue: {} satisfies Partial<DriverDeviceSessionService>,
      },
      {
        provide: IAPSubjectAdapter,
        useValue: undefined,
      },
    ],
  })
  class WorkloadIdentityHttpTestModule {
    configure(consumer: {
      apply: (middleware: typeof InternalKeyMiddleware) => {
        exclude: (...args: unknown[]) => {
          forRoutes: (routes: unknown) => void;
        };
      };
    }) {
      new AppModule().configure(consumer as never);
    }
  }

  const app = await NestFactory.create(WorkloadIdentityHttpTestModule, {
    logger: false,
  });
  app.useGlobalFilters(new SnakeCaseExceptionFilter());
  app.setGlobalPrefix("api", {
    exclude: ["health"],
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function workloadHeaders(
  assertion: string,
  overrides?: Record<string, string>,
): Record<string, string> {
  return {
    "x-drts-workload-assertion": assertion,
    "x-drts-workload-exchange-nonce": crypto.randomUUID(),
    ...overrides,
  };
}

describe("service workload identity token exchange", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    configureWorkloadIdentityEnvironment();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("issues a short-lived audience-bound system token from verified workload proof without an internal key", async () => {
    const identityRepository = new IdentityRepository();
    const { authController, jwtAuthService } =
      buildAuthController(identityRepository);

    const result = await authController.issueToken({
      headers: workloadHeaders(signWorkloadAssertion()),
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    expect(result.expiresIn).toBe("15m");

    const payload = await jwtAuthService.verifyAccessToken(result.token);
    expect(payload).not.toBeNull();
    expect(payload?.actorType).toBe("system");
    expect(payload?.realm).toBe("system");
    expect(payload?.scopes).toEqual(["dispatch:read", "dispatch:write"]);
    expect(payload?.aud).toEqual([STAGING_API_AUDIENCE]);
    expect(payload?.amr).toEqual(["workload_identity"]);
    expect(payload?.workloadExchangeNonceHash).toMatch(/^[a-f0-9]{64}$/);

    const sessions = await identityRepository.listSessionsByPrincipal(
      "svc-dispatch-runtime",
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.audience).toEqual([STAGING_API_AUDIENCE]);
    expect(sessions[0]?.riskSummary?.workloadExchangeNonceHash).toBe(
      payload?.workloadExchangeNonceHash,
    );
  });

  it("allows workload assertion requests through middleware before the controller exchanges the token", async () => {
    const identityRepository = new IdentityRepository();
    const { authController, jwtAuthService } =
      buildAuthController(identityRepository);
    const middleware = new InternalKeyMiddleware();
    const request = {
      headers: workloadHeaders(signWorkloadAssertion()),
      method: "POST",
      originalUrl: "/api/auth/token",
    };
    let forwarded = false;

    middleware.use(request, {}, () => {
      forwarded = true;
    });

    expect(forwarded).toBe(true);

    const result = await authController.issueToken(request);
    const payload = await jwtAuthService.verifyAccessToken(result.token);

    expect(result.expiresIn).toBe("15m");
    expect(payload?.actorType).toBe("system");
    expect(payload?.aud).toEqual([STAGING_API_AUDIENCE]);
  });

  it("exchanges a workload assertion over real HTTP without requiring DRTS_INTERNAL_KEY", async () => {
    const identityRepository = new IdentityRepository();
    const { app, baseUrl } =
      await createWorkloadIdentityHttpApp(identityRepository);

    try {
      const response = await fetch(`${baseUrl}/api/auth/token`, {
        method: "POST",
        headers: workloadHeaders(signWorkloadAssertion()),
      });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        token: expect.any(String),
        expiresIn: "15m",
      });
    } finally {
      await app.close();
    }
  });

  it("rejects caller-supplied bootstrap claims when workload proof is present", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: {
          ...workloadHeaders(signWorkloadAssertion()),
          "x-actor-type": "system",
          "x-actor-id": "spoofed-service",
          "x-realm": "system",
          "x-scopes": "foundation:write",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
    });
  });

  it("rejects workload proof minted for a different environment audience", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(
          signWorkloadAssertion({
            aud: DEV_EXCHANGE_AUDIENCE,
          }),
        ),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_AUDIENCE_MISMATCH",
    });
  });

  it("rejects workload proof with the wrong issuer", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(
          signWorkloadAssertion({
            iss: "https://workload.dev.drts.internal",
          }),
        ),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_ISSUER_MISMATCH",
    });
  });

  it("rejects replayed workload proofs", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);
    const assertion = signWorkloadAssertion();

    await authController.issueToken({
      headers: {
        "x-drts-workload-assertion": assertion,
        "x-drts-workload-exchange-nonce": "nonce-replay-001",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    await expect(
      authController.issueToken({
        headers: {
          "x-drts-workload-assertion": assertion,
          "x-drts-workload-exchange-nonce": "nonce-replay-001",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_ASSERTION_REPLAYED",
    });
  });

  it("rejects the same workload assertion even when the caller changes the exchange nonce", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);
    const assertion = signWorkloadAssertion();

    const first = await authController.issueToken({
      headers: {
        "x-drts-workload-assertion": assertion,
        "x-drts-workload-exchange-nonce": "nonce-fresh-001",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    expect(first.expiresIn).toBe("15m");

    await expect(
      authController.issueToken({
        headers: {
          "x-drts-workload-assertion": assertion,
          "x-drts-workload-exchange-nonce": "nonce-fresh-002",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_ASSERTION_REPLAYED",
    });
  });

  it("allows a newly signed workload assertion to exchange again", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    const first = await authController.issueToken({
      headers: {
        "x-drts-workload-assertion": signWorkloadAssertion({
          jti: "assertion-jti-001",
        }),
        "x-drts-workload-exchange-nonce": "nonce-fresh-001",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    const second = await authController.issueToken({
      headers: {
        "x-drts-workload-assertion": signWorkloadAssertion({
          jti: "assertion-jti-002",
        }),
        "x-drts-workload-exchange-nonce": "nonce-fresh-002",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    expect(first.expiresIn).toBe("15m");
    expect(second.expiresIn).toBe("15m");
    expect(second.token).not.toBe(first.token);
  });

  it("rejects workload exchange requests without an explicit nonce", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: {
          "x-drts-workload-assertion": signWorkloadAssertion(),
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_EXCHANGE_NONCE_REQUIRED",
    });
  });

  it("rejects requested token audiences that are not registered for the workload principal", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: {
          ...workloadHeaders(signWorkloadAssertion()),
          "x-drts-token-audience": "https://billing.staging.drts.internal",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_TOKEN_AUDIENCE_DENIED",
    });
  });

  it("rejects a principal whose default token audience falls outside its allowlist", async () => {
    process.env.WORKLOAD_IDENTITY_SERVICE_PRINCIPALS = JSON.stringify([
      {
        principalId: "svc-dispatch-runtime",
        actorId: "dispatch-runtime",
        issuer: STAGING_WORKLOAD_ISSUER,
        subject: "dispatch-runtime",
        displayName: "Dispatch Runtime",
        roles: ["dispatch_runtime"],
        scopes: ["dispatch:read", "dispatch:write"],
        allowedTokenAudiences: [STAGING_CONTROL_PLANE_AUDIENCE],
        defaultTokenAudience: STAGING_API_AUDIENCE,
      },
    ]);

    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(signWorkloadAssertion()),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_IDENTITY_NOT_CONFIGURED",
    });
  });

  it("rejects workload identity HMAC algorithms paired with PEM key material", async () => {
    process.env.WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY = [
      "-----BEGIN PUBLIC KEY-----",
      "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestvalueonly",
      "-----END PUBLIC KEY-----",
    ].join("\n");
    process.env.WORKLOAD_IDENTITY_JWT_ALGORITHMS = "HS256";

    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(signWorkloadAssertion()),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_IDENTITY_NOT_CONFIGURED",
    });
  });

  it("mints a control-plane audience token that the API verifier rejects as cross-service replay", async () => {
    const identityRepository = new IdentityRepository();
    const { authController, jwtAuthService } =
      buildAuthController(identityRepository);

    const result = await authController.issueToken({
      headers: {
        ...workloadHeaders(signWorkloadAssertion()),
        "x-drts-token-audience": STAGING_CONTROL_PLANE_AUDIENCE,
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    const decoded = jwt.decode(result.token) as jwt.JwtPayload | null;
    expect(decoded?.aud).toEqual([STAGING_CONTROL_PLANE_AUDIENCE]);

    const verified = await jwtAuthService.verifyAccessToken(result.token);
    expect(verified).toBeNull();
  });

  it("does not treat a generic Authorization bearer as workload proof", async () => {
    process.env.APP_ENV = "development";
    process.env.DRTS_INTERNAL_KEY = "internal-key-for-bootstrap";

    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    const result = await authController.issueToken({
      headers: {
        authorization: "Bearer cloud-run-invoker-token",
        "x-drts-internal-key": "internal-key-for-bootstrap",
        "x-actor-type": "system",
        "x-actor-id": "bootstrap-service",
        "x-realm": "system",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    });

    const payload = jwt.decode(result.token) as jwt.JwtPayload | null;
    expect(payload?.sub).toBe("bootstrap-service");
    expect(payload?.actorType).toBe("system");
    expect(payload?.amr).not.toContain("workload_identity");
  });

  it("rejects workload assertions whose lifetime exceeds the maximum bound", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);
    const now = Math.floor(Date.now() / 1000);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(
          signWorkloadAssertion({
            iat: now,
            exp: now + 3600,
          }),
        ),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_ASSERTION_INVALID",
    });
  });

  it("rejects workload assertions that do not carry a jti claim", async () => {
    const identityRepository = new IdentityRepository();
    const { authController } = buildAuthController(identityRepository);

    await expect(
      authController.issueToken({
        headers: workloadHeaders(
          signWorkloadAssertion({
            jti: undefined,
          }),
        ),
        method: "POST",
        originalUrl: "/api/auth/token",
      }),
    ).rejects.toMatchObject({
      code: "WORKLOAD_ASSERTION_INVALID",
    });
  });
});
