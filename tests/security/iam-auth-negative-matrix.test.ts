import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const ORIGINAL_ENV = { ...process.env };

function createAuthFixture() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const identityRepository = new IdentityRepository();
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
  );
  const controller = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    {} as never,
  );

  return { controller, tenantPartnerService };
}

async function expectApiRequestError(
  action: () => unknown | Promise<unknown>,
  assertions: (error: ApiRequestError) => void | Promise<void>,
) {
  try {
    await action();
    throw new Error("Expected ApiRequestError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError) {
      await assertions(error);
    }
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("IAM authentication negative matrix", () => {
  it("rejects bootstrap headers on /auth/token in strict environments even when the internal key is present", async () => {
    process.env.APP_ENV = "production";
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_INTERNAL_KEY = "strict-internal-key";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueToken({
          headers: {
            "x-drts-internal-key": "strict-internal-key",
            "x-actor-type": "platform_admin",
            "x-actor-id": "platform-admin-001",
            "x-realm": "platform",
            "x-roles": "superadmin",
            "x-scopes": "foundation:write",
          },
          method: "POST",
          originalUrl: "/api/auth/token",
          url: "/api/auth/token",
        }),
      (error) => {
        expect(error.getStatus()).toBe(401);
        expect(error.code).toBe("AUTH_BOOTSTRAP_HEADERS_FORBIDDEN");
      },
    );
  });

  it("rejects email-only tenant bootstrap outside explicit fixture mode", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "ops@acme.example",
          },
          undefined,
          undefined,
          undefined,
          "req-tenant-bootstrap-no-fixture-001",
        ),
      (error) => {
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
            message:
              "The authentication proof could not be matched to an active session exchange.",
          },
        });
      },
    );
  });

  it("keeps tenant bootstrap denial non-enumerating across unknown email and wrong-tenant requests", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller, tenantPartnerService } = createAuthFixture();

    await tenantPartnerService.createTenantUser(
      "tenant-other-001",
      {
        email: "cross-tenant@acme.example",
        displayName: "Cross Tenant Admin",
        roleCode: "tenant_admin",
      },
      "req-tenant-bootstrap-cross-001",
    );

    const cases = [
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "unknown@acme.example",
          },
          undefined,
          undefined,
          undefined,
          "req-tenant-bootstrap-unknown-001",
        ),
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "cross-tenant@acme.example",
            tenantId: "tenant-demo-001",
          },
          undefined,
          undefined,
          undefined,
          "req-tenant-bootstrap-cross-002",
        ),
    ];

    const responses: Array<{ code: string; message: string }> = [];

    for (const action of cases) {
      await expectApiRequestError(action, (error) => {
        const response = error.getResponse() as {
          error: { code: string; message: string };
        };
        responses.push({
          code: response.error.code,
          message: response.error.message,
        });
      });
    }

    expect(responses).toEqual([
      {
        code: "AUTH_SESSION_EXCHANGE_DENIED",
        message:
          "The authentication proof could not be matched to an active session exchange.",
      },
      {
        code: "AUTH_SESSION_EXCHANGE_DENIED",
        message:
          "The authentication proof could not be matched to an active session exchange.",
      },
    ]);
  });

  it("rejects email-only tenant bootstrap in production even when fixture mode is configured", async () => {
    process.env.APP_ENV = "production";
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "ops@acme.example",
          },
          undefined,
          undefined,
          undefined,
          "req-tenant-bootstrap-prod-001",
        ),
      (error) => {
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
            message:
              "The authentication proof could not be matched to an active session exchange.",
          },
        });
      },
    );
  });
});
