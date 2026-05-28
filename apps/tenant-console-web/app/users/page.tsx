import type { CSSProperties, ReactNode } from "react";
import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const stackCellStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 0,
};

const accentMetaStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontSize: 11,
};

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

const ROLE_CANVAS_LABEL: Record<string, string> = {
  tenant_admin: "tenant_admin",
  tenant_ops_admin: "operator",
  tenant_finance_admin: "approver",
  tenant_viewer: "viewer",
};

function getRoleLabel(roleCode: string) {
  return ROLE_CANVAS_LABEL[roleCode] ?? roleCode;
}

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
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

type UserTableRow = Record<string, unknown> & {
  name: ReactNode;
  email: ReactNode;
  role: ReactNode;
  state: ReactNode;
  updated: ReactNode;
};

export default async function UsersPage() {
  const { users, errors } = await loadUsersData();
  const rows: UserTableRow[] = users.map((user) => ({
    name: (
      <div style={stackCellStyle}>
        <span style={namePrimaryStyle}>{user.displayName}</span>
        <span style={accentMetaStyle}>{user.userId}</span>
      </div>
    ),
    email: user.email,
    role: (
      <CanvasPill theme={th} tone={getRoleTone(user.roleCode)}>
        {getRoleLabel(user.roleCode)}
      </CanvasPill>
    ),
    state: (
      <CanvasPill theme={th} tone={getStateTone(user.status)} dot>
        {getStateLabel(user.status)}
      </CanvasPill>
    ),
    updated: formatUpdated(user.updatedAt),
  }));

  const columns: CanvasTableColumn<UserTableRow>[] = [
    {
      h: "NAME",
      k: "name",
      w: 180,
    },
    {
      h: "EMAIL",
      k: "email",
      mono: true,
    },
    {
      h: "ROLE",
      k: "role",
      w: 180,
      mono: true,
    },
    {
      h: "STATE",
      k: "state",
      w: 100,
    },
    {
      h: "UPDATED",
      k: "updated",
      w: 160,
      mono: true,
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

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<UserTableRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div
              style={{
                padding: 24,
                color: th.textMuted,
                fontSize: 12.5,
                textAlign: "center",
              }}
            >
              目前沒有任何租戶成員，請邀請首位成員。
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
