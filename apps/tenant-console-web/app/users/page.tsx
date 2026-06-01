import type {
  EmptyReason,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { UsersManager } from "./users-manager";
import {
  TENANT_EMPTY_REASONS,
  USERS_ROUTE_ACTIONS,
  USERS_STALE_AFTER_MS,
} from "./constants";

export const dynamic = "force-dynamic";

type UsersPageProps = {
  searchParams?: Promise<{ emptyReason?: string }>;
};

type UsersPageData = {
  users: TenantUserRoleRecord[];
  roles: TenantRoleCatalogRecord[];
  errors: string[];
  emptyReason: EmptyReason | null;
  refreshMetadata: UiRefreshMetadata;
};

function compareUsers(a: TenantUserRoleRecord, b: TenantUserRoleRecord) {
  if (a.status !== b.status) {
    const rank = { active: 0, invited: 1, suspended: 2 } as const;
    return rank[a.status] - rank[b.status];
  }
  return a.displayName.localeCompare(b.displayName, "zh-Hant");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

// Map a failed primary read to the right not-ready reason (packet §3.6).
function classifyFetchError(message: string): EmptyReason {
  const lower = message.toLowerCase();
  if (
    lower.includes("403") ||
    lower.includes("forbidden") ||
    lower.includes("permission") ||
    lower.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("gateway") ||
    lower.includes("network")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function parseEmptyReasonOverride(
  value: string | undefined,
): EmptyReason | null {
  if (!value) {
    return null;
  }
  return TENANT_EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

async function loadUsersData(
  emptyReasonOverride: EmptyReason | null,
): Promise<UsersPageData> {
  const client = getTenantClient();
  const [usersResult, rolesResult] = await Promise.allSettled([
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  const errors: string[] = [];
  const users =
    usersResult.status === "fulfilled"
      ? [...usersResult.value].sort(compareUsers)
      : [];
  const roles = rolesResult.status === "fulfilled" ? rolesResult.value : [];

  if (usersResult.status === "rejected") {
    errors.push(`成員清單: ${toErrorMessage(usersResult.reason)}`);
  }
  if (rolesResult.status === "rejected") {
    errors.push(`角色目錄: ${toErrorMessage(rolesResult.reason)}`);
  }

  let emptyReason: EmptyReason | null = null;
  if (usersResult.status === "rejected" && users.length === 0) {
    emptyReason = classifyFetchError(toErrorMessage(usersResult.reason));
  } else if (
    users.length === 0 &&
    roles.length === 0 &&
    rolesResult.status !== "rejected"
  ) {
    // No users and no role catalog at all → tenant access is not configured.
    emptyReason = "not_provisioned";
  } else if (users.length === 0) {
    emptyReason = "no_data";
  }

  const latestUpdated = users.reduce<string | null>((latest, user) => {
    if (!latest) return user.updatedAt;
    return new Date(user.updatedAt) > new Date(latest)
      ? user.updatedAt
      : latest;
  }, null);

  const refreshMetadata: UiRefreshMetadata = {
    generatedAt: latestUpdated ?? new Date().toISOString(),
    staleAfterMs: USERS_STALE_AFTER_MS,
    dataFreshness: errors.length > 0 ? "degraded" : "fresh",
    source: "live",
  };

  return {
    users,
    roles,
    errors,
    emptyReason: emptyReasonOverride ?? emptyReason,
    refreshMetadata,
  };
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const emptyReasonOverride = parseEmptyReasonOverride(
    resolvedSearchParams?.emptyReason,
  );
  const pageData = await loadUsersData(emptyReasonOverride);

  return (
    <UsersManager
      users={pageData.users}
      roles={pageData.roles}
      errors={pageData.errors}
      emptyReason={pageData.emptyReason}
      refreshMetadata={pageData.refreshMetadata}
      availableActions={[...USERS_ROUTE_ACTIONS]}
    />
  );
}
