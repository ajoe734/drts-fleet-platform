import type { CSSProperties } from "react";
import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const rosterCardStyle: CSSProperties = {
  flex: "1.45 1 720px",
  minWidth: 0,
};

const sideCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const rolePillGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const roleListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const roleListItemStyle: CSSProperties = {
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const roleListMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const roleListTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.3,
};

const roleListDescriptionStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const numberFormatter = new Intl.NumberFormat("en");

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

const ROLE_CANVAS_LABEL: Record<string, string> = {
  tenant_admin: "tenant_admin",
  tenant_ops_admin: "operator",
  tenant_finance_admin: "approver",
  tenant_viewer: "viewer",
};

const ROLE_SORT_ORDER: Record<string, number> = {
  tenant_admin: 0,
  tenant_ops_admin: 1,
  tenant_finance_admin: 2,
  tenant_viewer: 3,
};

function getRoleLabel(roleCode: string) {
  return ROLE_CANVAS_LABEL[roleCode] ?? roleCode;
}

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
}

function getRoleCatalogTone(role: TenantRoleCatalogRecord): CanvasTone {
  if (role.roleCode === "tenant_admin") {
    return "accent";
  }
  return role.assignable ? "info" : "neutral";
}

function getStateTone(status: TenantUserRoleRecord["status"]): CanvasTone {
  return status === "active" ? "success" : "neutral";
}

function getStateLabel(status: TenantUserRoleRecord["status"]) {
  if (status === "active") return "active";
  if (status === "invited") return "invited";
  return "suspended";
}

function compareUsers(a: TenantUserRoleRecord, b: TenantUserRoleRecord) {
  if (a.status !== b.status) {
    const rank = { active: 0, invited: 1, suspended: 2 } as const;
    return rank[a.status] - rank[b.status];
  }
  return a.displayName.localeCompare(b.displayName, "zh-Hant");
}

function compareRoles(a: TenantRoleCatalogRecord, b: TenantRoleCatalogRecord) {
  if (a.assignable !== b.assignable) {
    return a.assignable ? -1 : 1;
  }

  const leftOrder = ROLE_SORT_ORDER[a.roleCode] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = ROLE_SORT_ORDER[b.roleCode] ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return a.roleCode.localeCompare(b.roleCode, "en");
}

type UsersPageData = {
  users: TenantUserRoleRecord[];
  roles: TenantRoleCatalogRecord[];
  errors: string[];
};

async function loadUsersData(): Promise<UsersPageData> {
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

  return { users, roles, errors };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

type UserRow = TenantUserRoleRecord & Record<string, unknown>;

export default async function UsersPage() {
  const { users, roles, errors } = await loadUsersData();
  const sortedRoles = [...roles].sort(compareRoles);
  const assignableRoles = sortedRoles.filter((role) => role.assignable);
  const activeUsers = users.filter((user) => user.status === "active").length;
  const invitedUsers = users.filter((user) => user.status === "invited").length;
  const adminUsers = users.filter(
    (user) => user.roleCode === "tenant_admin",
  ).length;
  const optOutUsers = users.filter(
    (user) => user.approvalNotificationOptOut,
  ).length;
  const latestUpdated = users.reduce<string | null>((latest, user) => {
    if (!latest) return user.updatedAt;
    return new Date(user.updatedAt) > new Date(latest)
      ? user.updatedAt
      : latest;
  }, null);
  const roleCatalogSubtitle =
    sortedRoles.length > 0
      ? `可指派 ${assignableRoles.length} / ${sortedRoles.length} · 最新 ${formatUpdated(latestUpdated)}`
      : "尚未載入角色目錄";

  const columns: CanvasTableColumn<UserRow>[] = [
    {
      h: "NAME",
      k: "displayName",
      w: 180,
      r: (row) => <span style={namePrimaryStyle}>{row.displayName}</span>,
    },
    {
      h: "EMAIL",
      k: "email",
      mono: true,
    },
    {
      h: "ROLE",
      w: 180,
      mono: true,
      r: (row) => (
        <CanvasPill theme={th} tone={getRoleTone(row.roleCode)}>
          {getRoleLabel(row.roleCode)}
        </CanvasPill>
      ),
    },
    {
      h: "STATE",
      w: 100,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.status)} dot>
          {getStateLabel(row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "UPDATED",
      w: 160,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="人員與角色"
        subtitle="tenant_admin · operator · viewer · approver"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
            邀請成員
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分人員資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Users"
            value={formatCount(users.length)}
            sub="tenant roster"
          />
          <CanvasKPI
            theme={th}
            label="Roles"
            value={formatCount(sortedRoles.length)}
            sub={`${assignableRoles.length} assignable`}
          />
          <CanvasKPI
            theme={th}
            label="Active"
            value={formatCount(activeUsers)}
            sub="current access"
          />
          <CanvasKPI
            theme={th}
            label="Invited"
            value={formatCount(invitedUsers)}
            sub={
              optOutUsers > 0
                ? `${formatCount(optOutUsers)} opt-out`
                : "approval mail on"
            }
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard theme={th} padding={0} style={rosterCardStyle}>
            {users.length > 0 ? (
              <CanvasTable<UserRow>
                theme={th}
                columns={columns}
                rows={users as UserRow[]}
              />
            ) : (
              <div style={emptyStateStyle}>
                目前沒有任何租戶成員，請邀請首位成員。
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="角色目錄"
            subtitle={roleCatalogSubtitle}
            style={sideCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "租戶成員",
                  v: formatCount(users.length),
                  mono: true,
                },
                {
                  k: "tenant_admin",
                  v: formatCount(adminUsers),
                  mono: true,
                },
                {
                  k: "可指派角色",
                  v: `${formatCount(assignableRoles.length)} / ${formatCount(sortedRoles.length)}`,
                  mono: true,
                },
                {
                  k: "通知 opt-out",
                  v: formatCount(optOutUsers),
                  mono: true,
                },
              ]}
            />

            <div style={{ height: 16 }} />

            <CanvasField
              theme={th}
              label="可指派角色"
              hint="ROLE 欄位沿用 tenant user command 可用的後端 catalog。"
            >
              {assignableRoles.length > 0 ? (
                <div style={rolePillGridStyle}>
                  {assignableRoles.map((role) => (
                    <CanvasPill
                      key={role.roleCode}
                      theme={th}
                      tone={getRoleCatalogTone(role)}
                    >
                      {getRoleLabel(role.roleCode)}
                    </CanvasPill>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>目前沒有可指派角色</div>
              )}
            </CanvasField>

            <CanvasField
              theme={th}
              label="角色說明"
              hint="display name 與 description 直接來自 role catalog。"
            >
              {sortedRoles.length > 0 ? (
                <div style={roleListStyle}>
                  {sortedRoles.map((role, index) => (
                    <div
                      key={role.roleCode}
                      style={
                        index === sortedRoles.length - 1
                          ? undefined
                          : roleListItemStyle
                      }
                    >
                      <div style={roleListMetaStyle}>
                        <span style={roleListTitleStyle}>
                          {role.displayName || getRoleLabel(role.roleCode)}
                        </span>
                        <CanvasPill theme={th} tone={getRoleCatalogTone(role)}>
                          {role.roleCode}
                        </CanvasPill>
                      </div>
                      <div style={roleListDescriptionStyle}>
                        {role.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>角色目錄資料目前不可用</div>
              )}
            </CanvasField>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
