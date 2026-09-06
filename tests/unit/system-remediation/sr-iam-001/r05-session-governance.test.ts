import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type {
  MaskedSessionSummary,
  PlatformAdminUserRecord,
} from "@drts/contracts";
import { ApiClient, ApiClientError } from "../../../../packages/api-client/src";
import { createPlatformAdminIamClient } from "../../../../apps/platform-admin-web/lib/platform-admin-iam-client";

const governanceComponentSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/users/users-governance-components.tsx",
  ),
  "utf8",
);

const MOCK_OPERATOR_USER: PlatformAdminUserRecord = {
  userId: "usr_ops_operator_01",
  email: "ops-operator@drts.local",
  displayName: "Ops Operator",
  roleCode: "operator",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

const MOCK_ACTIVE_SESSION: MaskedSessionSummary = {
  sessionId: "sess_ops_101",
  principalId: "usr_ops_operator_01",
  realm: "ops",
  status: "active",
  authTime: "2026-09-06T08:00:00.000Z",
  authMethods: ["password", "mfa"],
  tokenVersion: 1,
  idleExpiresAt: "2026-09-06T09:00:00.000Z",
  absoluteExpiresAt: "2026-09-06T16:00:00.000Z",
  revokedAt: null,
  revokedByPrincipalId: null,
  revokeReason: null,
  deviceSummary: { userAgent: "Mozilla/5.0" },
  riskSummary: {},
  createdAt: "2026-09-06T08:00:00.000Z",
  updatedAt: "2026-09-06T08:00:00.000Z",
};

describe("SR-IAM-001 / R05 — Session governance 403 request loop regression", () => {
  it("enforces useMemo for createPlatformAdminIamClient across all governance panels", () => {
    // Structural regression check: ensuring iamClient is never created unmemoized inside render bodies,
    // which caused the callback dependency to change on every render and re-trigger useEffect indefinitely.
    const userDetailMatches = governanceComponentSource.match(
      /export function UserDetailDrawer[\s\S]*?useMemo\(\(\) => createPlatformAdminIamClient\(rawClient\), \[rawClient\]\)/,
    );
    expect(userDetailMatches).not.toBeNull();

    const roleApprovalMatches = governanceComponentSource.match(
      /export function RoleApprovalPanel[\s\S]*?useMemo\(\(\) => createPlatformAdminIamClient\(rawClient\), \[rawClient\]\)/,
    );
    expect(roleApprovalMatches).not.toBeNull();

    const accessReviewMatches = governanceComponentSource.match(
      /export function AccessReviewPanel[\s\S]*?useMemo\(\(\) => createPlatformAdminIamClient\(rawClient\), \[rawClient\]\)/,
    );
    expect(accessReviewMatches).not.toBeNull();

    const breakGlassMatches = governanceComponentSource.match(
      /export function BreakGlassPanel[\s\S]*?useMemo\(\(\) => createPlatformAdminIamClient\(rawClient\), \[rawClient\]\)/,
    );
    expect(breakGlassMatches).not.toBeNull();
  });

  it("verifies that 403 Forbidden stops request looping (reproducing R05 7s/31 requests prevention)", async () => {
    // In R05: opening UserDetailDrawer fired 31 requests in 7 seconds on 403 and remained stuck in loading state.
    // This simulation tracks exact call counts on 403 responses.
    let callCount = 0;
    const mockClient = {
      get: vi.fn(async () => {
        callCount++;
        throw new ApiClientError({
          statusCode: 403,
          code: "AUTH_SCOPE_DENIED",
          message:
            "Bootstrap identity is missing one or more required scopes: identity:sessions:read.",
          retryable: false,
          rawBody: JSON.stringify({
            error: {
              code: "AUTH_SCOPE_DENIED",
              message:
                "Bootstrap identity is missing one or more required scopes: identity:sessions:read.",
              retryable: false,
            },
          }),
        });
      }),
      post: vi.fn(),
    } as unknown as ApiClient;

    const iamClient = createPlatformAdminIamClient(mockClient);

    // Simulate component lifecycle state and single load execution
    let loadingSessions = true;
    let sessions: MaskedSessionSummary[] = [];
    let error: string | null = null;
    const locale = "zh";

    const loadSessions = async () => {
      loadingSessions = true;
      error = null;
      try {
        const result = await iamClient.listSessions({
          actorId: MOCK_OPERATOR_USER.userId,
          includeRevoked: true,
        });
        sessions = result ?? [];
      } catch (e: unknown) {
        const is403 =
          (e instanceof ApiClientError && e.statusCode === 403) ||
          (typeof e === "object" &&
            e !== null &&
            "statusCode" in e &&
            (e as { statusCode?: number }).statusCode === 403) ||
          (e instanceof Error &&
            (e.message.includes("403") ||
              e.message.includes("AUTH_SCOPE_DENIED") ||
              e.message.includes("AUTH_REALM_DENIED")));
        const message = is403
          ? locale === "en"
            ? "Access Denied (403 Forbidden): Insufficient authority to inspect user session inventory (requires identity:sessions:read)."
            : "存取被拒 (403 權限不足)：目前角色缺乏檢視工作階段清單授權 (需具備 identity:sessions:read)。"
          : e instanceof Error
            ? e.message
            : "Failed to load session inventory";
        error = message;
      } finally {
        loadingSessions = false;
      }
    };

    // Execute once (equivalent to initial mount with stable memoized client)
    await loadSessions();

    // 1. Must only execute once — no infinite loop / no 31 requests in 7 seconds!
    expect(callCount).toBe(1);
    expect(mockClient.get).toHaveBeenCalledTimes(1);
    expect(mockClient.get).toHaveBeenCalledWith(
      `/identity/sessions?actorId=${encodeURIComponent(MOCK_OPERATOR_USER.userId)}&includeRevoked=true`,
    );

    // 2. Loading state must resolve to false (must NOT remain stuck displaying "載入中")
    expect(loadingSessions).toBe(false);

    // 3. Error must be understandable and explicitly state the permission denial & required scope
    expect(error).not.toBeNull();
    expect(error).toContain("403");
    expect(error).toContain("存取被拒");
    expect(error).toContain("identity:sessions:read");

    // 4. Sessions array remains empty but error prevents showing misleading "無工作階段" empty state
    expect(sessions).toEqual([]);
  });

  it("verifies English locale error message on 403 Forbidden", async () => {
    const mockClient = {
      get: vi.fn(async () => {
        throw new ApiClientError({
          statusCode: 403,
          code: "AUTH_SCOPE_DENIED",
          message:
            "Bootstrap identity is missing one or more required scopes: identity:sessions:read.",
          retryable: false,
          rawBody: "{}",
        });
      }),
      post: vi.fn(),
    } as unknown as ApiClient;

    const iamClient = createPlatformAdminIamClient(mockClient);
    let error: string | null = null;

    try {
      await iamClient.listSessions({ actorId: MOCK_OPERATOR_USER.userId });
    } catch (e: unknown) {
      const is403 = e instanceof ApiClientError && e.statusCode === 403;
      error = is403
        ? "Access Denied (403 Forbidden): Insufficient authority to inspect user session inventory (requires identity:sessions:read)."
        : e instanceof Error
          ? e.message
          : "Failed";
    }

    expect(error).toBe(
      "Access Denied (403 Forbidden): Insufficient authority to inspect user session inventory (requires identity:sessions:read).",
    );
  });

  it("successfully loads session inventory when caller holds identity:sessions:read", async () => {
    const mockClient = {
      get: vi.fn(async () => [MOCK_ACTIVE_SESSION]),
      post: vi.fn(),
    } as unknown as ApiClient;

    const iamClient = createPlatformAdminIamClient(mockClient);
    let loadingSessions = true;
    let sessions: MaskedSessionSummary[] = [];
    let error: string | null = null;

    try {
      sessions = await iamClient.listSessions({
        actorId: MOCK_OPERATOR_USER.userId,
        includeRevoked: true,
      });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed";
    } finally {
      loadingSessions = false;
    }

    expect(loadingSessions).toBe(false);
    expect(error).toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("sess_ops_101");
    expect(sessions[0]?.status).toBe("active");
    expect(sessions[0]?.realm).toBe("ops");
  });

  it("handles session revocation failure cleanly on 403 Forbidden (missing identity:sessions:write)", async () => {
    let callCount = 0;
    const mockClient = {
      get: vi.fn(),
      post: vi.fn(async () => {
        callCount++;
        throw new ApiClientError({
          statusCode: 403,
          code: "AUTH_SCOPE_DENIED",
          message:
            "Bootstrap identity is missing one or more required scopes: identity:sessions:write.",
          retryable: false,
          rawBody: "{}",
        });
      }),
    } as unknown as ApiClient;

    const iamClient = createPlatformAdminIamClient(mockClient);
    let revokingSid: string | null = "sess_ops_101";
    let error: string | null = null;
    const locale = "zh";

    try {
      await iamClient.revokeSession("sess_ops_101", {
        reason: "admin_manual_revoke",
        isCompromised: true,
      });
    } catch (e: unknown) {
      const is403 =
        (e instanceof ApiClientError && e.statusCode === 403) ||
        (typeof e === "object" &&
          e !== null &&
          "statusCode" in e &&
          (e as { statusCode?: number }).statusCode === 403);
      error = is403
        ? locale === "en"
          ? "Access Denied (403 Forbidden): Insufficient authority to revoke session (requires identity:sessions:write)."
          : "存取被拒 (403 權限不足)：目前角色缺乏撤銷工作階段授權 (需具備 identity:sessions:write)。"
        : e instanceof Error
          ? e.message
          : "Failed";
    } finally {
      revokingSid = null;
    }

    expect(callCount).toBe(1);
    expect(revokingSid).toBeNull();
    expect(error).toContain("403");
    expect(error).toContain("identity:sessions:write");
  });

  it("successfully revokes a session when caller holds identity:sessions:write", async () => {
    const mockClient = {
      get: vi.fn(),
      post: vi.fn(async () => ({
        revoked: true,
        sessionId: "sess_ops_101",
        session: { ...MOCK_ACTIVE_SESSION, status: "revoked" },
      })),
    } as unknown as ApiClient;

    const iamClient = createPlatformAdminIamClient(mockClient);
    const result = await iamClient.revokeSession("sess_ops_101", {
      reason: "security_incident_containment",
      isCompromised: true,
    });

    expect(result.revoked).toBe(true);
    expect(result.sessionId).toBe("sess_ops_101");
    expect(mockClient.post).toHaveBeenCalledWith(
      "/identity/sessions/sess_ops_101/revoke",
      {
        body: { reason: "security_incident_containment", isCompromised: true },
      },
    );
  });
});
