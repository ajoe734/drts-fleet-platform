import Link from "next/link";
import type { TenantRoleCatalogRecord } from "@drts/contracts";
import { getUsers, inviteUser, updateUserRole } from "./actions";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  formatAuthorityRoleCode,
  getTenantRoleSnapshot,
} from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

function formatUserStatus(status: string) {
  switch (status) {
    case "invited":
      return "已邀請";
    case "active":
      return "啟用中";
    case "suspended":
      return "已停權";
    default:
      return status;
  }
}

export default async function UsersPage() {
  const { users, error } = await getUsers();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const adminAccess = roleSnapshot.capabilities.canManageUsers;
  let roleCatalog: TenantRoleCatalogRecord[] = [];
  let roleCatalogError: string | null = null;

  try {
    roleCatalog = await client.listTenantRoles();
  } catch (e) {
    roleCatalogError = formatPortalUiError(
      toPortalErrorMessage(e),
      "無法載入角色目錄",
    );
  }

  const combinedError = [
    error ? formatPortalUiError(error, "無法載入使用者資料") : null,
    roleCatalogError,
    roleSnapshot.identityError
      ? formatPortalUiError(roleSnapshot.identityError, "身分載入失敗")
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const roleLookup = new Map(
    roleCatalog.map((catalogEntry) => [
      catalogEntry.roleCode,
      formatAuthorityRoleCode(catalogEntry.roleCode) ||
        catalogEntry.displayName,
    ]),
  );

  return (
    <main className="app-grid">
      <AppShellCard
        title="使用者管理"
        description={
          adminAccess
            ? "可依伺服器發出的正式角色脈絡邀請使用者並管理租戶存取權限。"
            : `目前以 ${describeRoleSnapshot(roleSnapshot)} 身分檢視。管理使用者需要租戶管理員權限。`
        }
      >
        <div className="panel-stack">
          <p className="muted-copy">
            目前權限角色：
            {roleSnapshot.roleCatalogBackedLabels.length > 0
              ? roleSnapshot.roleCatalogBackedLabels.join(", ")
              : "目前無法取得"}
          </p>
          <div className="surface-grid">
            {FORMAL_TENANT_ROLE_FRAMING.map((roleFrame) => {
              const active = roleSnapshot.activeFormalRoles.includes(
                roleFrame.key,
              );

              return (
                <article className="surface-card" key={roleFrame.key}>
                  <span className="surface-kicker">
                    {active ? "目前身分生效" : "角色原型脈絡"}
                  </span>
                  <h3>{roleFrame.label}</h3>
                  <p>{roleFrame.summary}</p>
                </article>
              );
            })}
          </div>
        </div>

        {combinedError && (
          <div className="error-banner">
            <strong>錯誤：</strong> {combinedError}
          </div>
        )}

        {adminAccess && roleCatalog.length > 0 ? (
          <InviteForm roleCatalog={roleCatalog} />
        ) : adminAccess ? (
          <p className="empty-state">
            角色目錄目前不可用。在 `/api/tenant/roles` 回應之前，邀請與角色
            調整操作都會維持停用。
          </p>
        ) : null}

        {users.length > 0 ? (
          <div className="data-table" style={{ marginTop: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>使用者 ID</th>
                  <th>姓名</th>
                  <th>電子郵件</th>
                  <th>角色</th>
                  <th>狀態</th>
                  {adminAccess && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td>{user.userId}</td>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>{roleLookup.get(user.roleCode) ?? user.roleCode}</td>
                    <td>{formatUserStatus(user.status)}</td>
                    {adminAccess && (
                      <td>
                        <RoleUpdateForm
                          user={user}
                          roleCatalog={roleCatalog}
                          disabled={roleCatalog.length === 0}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            目前沒有使用者資料。
            {adminAccess && " 可使用上方表單邀請新的使用者。"}
          </p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
        <Link className="route-link" href="/settings">
          <strong>設定頁總覽</strong>
          前往租戶能力與治理摘要，查看這些角色假設背後的設定依據。
        </Link>
      </AppShellCard>
    </main>
  );
}

function InviteForm({
  roleCatalog,
}: {
  roleCatalog: TenantRoleCatalogRecord[];
}) {
  return (
    <form action={inviteUser}>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>電子郵件</th>
              <th>顯示名稱</th>
              <th>角色</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  type="email"
                  name="email"
                  placeholder="例如：member@tenant.demo"
                  required
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <input
                  type="text"
                  name="displayName"
                  placeholder="王小明"
                  required
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <select
                  name="roleCode"
                  defaultValue={roleCatalog[0]?.roleCode}
                  style={{ width: "100%" }}
                >
                  {roleCatalog.map((catalogEntry) => (
                    <option
                      key={catalogEntry.roleCode}
                      value={catalogEntry.roleCode}
                    >
                      {formatAuthorityRoleCode(catalogEntry.roleCode) ||
                        catalogEntry.displayName}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button type="submit" className="btn-primary">
                  邀請使用者
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>
  );
}

function RoleUpdateForm({
  user,
  roleCatalog,
  disabled,
}: {
  user: { userId: string; roleCode: string; status: string };
  roleCatalog: TenantRoleCatalogRecord[];
  disabled: boolean;
}) {
  return (
    <form action={updateUserRole} style={{ display: "flex", gap: "0.5rem" }}>
      <input type="hidden" name="userId" value={user.userId} />
      <select
        name="roleCode"
        defaultValue={user.roleCode}
        disabled={disabled || roleCatalog.length === 0}
      >
        {roleCatalog.map((catalogEntry) => (
          <option key={catalogEntry.roleCode} value={catalogEntry.roleCode}>
            {formatAuthorityRoleCode(catalogEntry.roleCode) ||
              catalogEntry.displayName}
          </option>
        ))}
      </select>
      <select name="status" defaultValue={user.status}>
        <option value="invited">已邀請</option>
        <option value="active">啟用中</option>
        <option value="suspended">已停權</option>
      </select>
      <button type="submit" className="btn-secondary" disabled={disabled}>
        更新
      </button>
    </form>
  );
}
