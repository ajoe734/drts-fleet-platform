import { afterEach, describe, expect, it, vi } from "vitest";

import type { TenantUserRoleRecord } from "@drts/contracts";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";

const ORIGINAL_ENV = { ...process.env };

function createTenantUser(
  overrides: Partial<TenantUserRoleRecord> = {},
): TenantUserRoleRecord {
  return {
    userId: "tenant-user-001",
    tenantId: "tenant-alpha",
    email: "ops@example.com",
    displayName: "Ops User",
    roleCode: "tenant_admin",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function createController(users: TenantUserRoleRecord[] = []) {
  process.env.JWT_SECRET = "unit-test-super-secret-tenant-bootstrap";

  return new AuthController(
    new JwtAuthService(),
    {
      getDefaultTenantId: vi.fn(() => "tenant-alpha"),
      listTenantUsers: vi.fn((tenantId: string) =>
        users
          .filter((user) => user.tenantId === tenantId)
          .map((user) => ({ ...user })),
      ),
      findTenantUserByEmail: vi.fn((email: string) => {
        const normalized = email.trim().toLowerCase();
        const matched =
          users.find((user) => user.email === normalized) ?? null;
        return matched ? { ...matched } : null;
      }),
      listTenantRoles: vi.fn(() => [
        {
          roleCode: "tenant_admin",
          displayName: "Tenant Admin",
          description: "Tenant administrator",
          assignable: true,
        },
      ]),
    } as never,
    {} as never,
  );
}

function getErrorEnvelope(error: unknown) {
  if (!error) {
    return null;
  }

  return (
    (
      error as {
        getResponse?: () => {
          error?: {
            code?: string;
            message?: string;
          };
        };
      }
    ).getResponse?.().error ?? null
  );
}

function getHttpStatus(error: unknown): number | null {
  return (error as { getStatus?: () => number }).getStatus?.() ?? null;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("tenant bootstrap session fixture gate", () => {
  it("rejects email-only tenant bootstrap in production even for an active membership", async () => {
    process.env.APP_ENV = "production";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const controller = createController([createTenantUser()]);

    let thrown: unknown;
    try {
      await controller.issueTenantBootstrapSession({
        email: "ops@example.com",
        tenantId: "tenant-alpha",
      });
    } catch (error) {
      thrown = error;
    }

    const envelope = getErrorEnvelope(thrown);
    expect(getHttpStatus(thrown)).toBe(403);
    expect(envelope?.code).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    expect(envelope?.message).toBe(
      "The authentication proof could not be matched to an active session exchange.",
    );
  });

  it("rejects email-only tenant bootstrap in local mode until fixture mode is explicitly enabled", async () => {
    process.env.NODE_ENV = "test";

    const controller = createController([createTenantUser()]);

    let thrown: unknown;
    try {
      await controller.issueTenantBootstrapSession({
        email: "ops@example.com",
        tenantId: "tenant-alpha",
      });
    } catch (error) {
      thrown = error;
    }

    const envelope = getErrorEnvelope(thrown);
    expect(getHttpStatus(thrown)).toBe(403);
    expect(envelope?.code).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    expect(envelope?.message).toBe(
      "The authentication proof could not be matched to an active session exchange.",
    );
  });

  it("allows deterministic local fixtures only when explicit fixture mode is enabled", async () => {
    process.env.NODE_ENV = "test";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const controller = createController([createTenantUser()]);

    const response = await controller.issueTenantBootstrapSession({
      email: "ops@example.com",
      tenantId: "tenant-alpha",
    });

    expect(response.data.profile).toMatchObject({
      email: "ops@example.com",
      tenantId: "tenant-alpha",
      roleCode: "tenant_admin",
    });
    expect(response.data.identity.tenantId).toBe("tenant-alpha");
    expect(response.data.accessToken).toEqual(expect.any(String));
  });

  it("uses the same non-enumerating denial for invited, suspended, unknown, and cross-tenant users", async () => {
    process.env.NODE_ENV = "test";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const cases = [
      {
        label: "invited",
        users: [createTenantUser({ status: "invited" })],
        command: { email: "ops@example.com", tenantId: "tenant-alpha" },
      },
      {
        label: "suspended",
        users: [createTenantUser({ status: "suspended" })],
        command: { email: "ops@example.com", tenantId: "tenant-alpha" },
      },
      {
        label: "unknown",
        users: [],
        command: { email: "ops@example.com", tenantId: "tenant-alpha" },
      },
      {
        label: "cross-tenant",
        users: [createTenantUser({ tenantId: "tenant-beta" })],
        command: { email: "ops@example.com", tenantId: "tenant-alpha" },
      },
    ];

    for (const testCase of cases) {
      const controller = createController(testCase.users);

      let thrown: unknown;
      try {
        await controller.issueTenantBootstrapSession(testCase.command);
      } catch (error) {
        thrown = error;
      }

      const envelope = getErrorEnvelope(thrown);
      expect(getHttpStatus(thrown), testCase.label).toBe(403);
      expect(envelope?.code, testCase.label).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      expect(envelope?.message, testCase.label).toBe(
        "The authentication proof could not be matched to an active session exchange.",
      );
    }
  });
});
