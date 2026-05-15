import type { CSSProperties } from "react";
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

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
}

function getStateTone(status: TenantUserRoleRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "info";
  return "neutral";
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

type UserRow = TenantUserRoleRecord & Record<string, unknown>;

export default async function UsersPage() {
  const { users, errors } = await loadUsersData();

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
          {row.roleCode}
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

        <CanvasCard theme={th} padding={0}>
          {users.length > 0 ? (
            <CanvasTable<UserRow>
              theme={th}
              columns={columns}
              rows={users as UserRow[]}
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
