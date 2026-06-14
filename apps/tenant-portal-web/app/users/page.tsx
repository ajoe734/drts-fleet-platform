import Link from "next/link";
import type { TenantRoleCatalogRecord } from "@drts/contracts";
import { getUsers, inviteUser, updateUserRole } from "./actions";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  getTenantRoleSnapshot,
  roleCatalogLabels,
} from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export default async function UsersPage() {
  const locale = await getServerLocale();
  const { users, error } = await getUsers();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const adminAccess = roleSnapshot.capabilities.canManageUsers;
  let roleCatalog: TenantRoleCatalogRecord[] = [];
  let roleCatalogError: string | null = null;

  try {
    roleCatalog = await client.listTenantRoles();
  } catch (e) {
    roleCatalogError = e instanceof Error ? e.message : t("users.error.unknown", locale);
  }

  const catalogLabels = roleCatalogLabels(roleSnapshot, locale);

  const combinedError = [error, roleCatalogError, roleSnapshot.identityError]
    .filter(Boolean)
    .join(" | ");
  const roleLookup = new Map(
    roleCatalog.map((catalogEntry) => [
      catalogEntry.roleCode,
      catalogEntry.displayName,
    ]),
  );

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("users.title", locale)}
        description={
          adminAccess
            ? t("users.description.admin", locale)
            : t("users.description.viewer", locale, {
                role: describeRoleSnapshot(roleSnapshot, locale),
              })
        }
      >
        <div className="panel-stack">
          <p className="muted-copy">
            {t("users.authorityRoles.label", locale)}{" "}
            {catalogLabels.length > 0
              ? catalogLabels.join(", ")
              : t("users.authorityRoles.unavailable", locale)}
          </p>
          <div className="surface-grid">
            {FORMAL_TENANT_ROLE_FRAMING.map((roleFrame) => {
              const active = roleSnapshot.activeFormalRoles.includes(
                roleFrame.key,
              );

              return (
                <article className="surface-card" key={roleFrame.key}>
                  <span className="surface-kicker">
                    {active
                      ? t("users.role.active", locale)
                      : t("users.role.prototype", locale)}
                  </span>
                  <h3>{t("role." + roleFrame.key + ".label", locale)}</h3>
                  <p>{t("role." + roleFrame.key + ".summary", locale)}</p>
                </article>
              );
            })}
          </div>
        </div>

        {combinedError && (
          <div className="error-banner">
            <strong>{t("users.error.label", locale)}</strong> {combinedError}
          </div>
        )}

        {adminAccess && roleCatalog.length > 0 ? (
          <InviteForm roleCatalog={roleCatalog} locale={locale} />
        ) : adminAccess ? (
          <p className="empty-state">
            {t("users.catalog.unavailable", locale)}
          </p>
        ) : null}

        {users.length > 0 ? (
          <div className="data-table" style={{ marginTop: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("users.table.userId", locale)}</th>
                  <th>{t("users.table.name", locale)}</th>
                  <th>{t("users.table.email", locale)}</th>
                  <th>{t("users.table.role", locale)}</th>
                  <th>{t("users.table.status", locale)}</th>
                  {adminAccess && <th>{t("users.table.actions", locale)}</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td>{user.userId}</td>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>{roleLookup.get(user.roleCode) ?? user.roleCode}</td>
                    <td>{user.status}</td>
                    {adminAccess && (
                      <td>
                        <RoleUpdateForm
                          user={user}
                          roleCatalog={roleCatalog}
                          disabled={roleCatalog.length === 0}
                          locale={locale}
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
            {t("users.empty.none", locale)}
            {adminAccess && " " + t("users.empty.inviteHint", locale)}
          </p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>{t("users.link.home.title", locale)}</strong>
          {t("users.link.home.summary", locale)}
        </Link>
        <Link className="route-link" href="/settings">
          <strong>{t("users.link.settings.title", locale)}</strong>
          {t("users.link.settings.summary", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function InviteForm({
  roleCatalog,
  locale,
}: {
  roleCatalog: TenantRoleCatalogRecord[];
  locale: Locale;
}) {
  return (
    <form action={inviteUser}>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{t("users.invite.email", locale)}</th>
              <th>{t("users.invite.displayName", locale)}</th>
              <th>{t("users.invite.role", locale)}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  type="email"
                  name="email"
                  placeholder={t("users.invite.emailPlaceholder", locale)}
                  required
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <input
                  type="text"
                  name="displayName"
                  placeholder={t("users.invite.namePlaceholder", locale)}
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
                      {catalogEntry.displayName}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button type="submit" className="btn-primary">
                  {t("users.invite.submit", locale)}
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
  locale,
}: {
  user: { userId: string; roleCode: string; status: string };
  roleCatalog: TenantRoleCatalogRecord[];
  disabled: boolean;
  locale: Locale;
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
            {catalogEntry.displayName}
          </option>
        ))}
      </select>
      <select name="status" defaultValue={user.status}>
        <option value="invited">{t("users.status.invited", locale)}</option>
        <option value="active">{t("users.status.active", locale)}</option>
        <option value="suspended">{t("users.status.suspended", locale)}</option>
      </select>
      <button type="submit" className="btn-secondary" disabled={disabled}>
        {t("users.roleUpdate.submit", locale)}
      </button>
    </form>
  );
}
