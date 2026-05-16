import Link from "next/link";
import type { TenantRoleCatalogRecord } from "@drts/contracts";
import { getUsers, inviteUser, updateUserRole } from "./actions";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  getTenantRoleSnapshot,
} from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

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
    roleCatalogError = e instanceof Error ? e.message : "Unknown error";
  }

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
        title="User Management"
        description={
          adminAccess
            ? "Invite users and manage tenant access with formal role framing anchored to server-issued authority."
            : `Viewing as ${describeRoleSnapshot(roleSnapshot)}. Tenant admin authority is required to manage users.`
        }
      >
        <div className="panel-stack">
          <p className="muted-copy">
            Current authority roles:{" "}
            {roleSnapshot.roleCatalogBackedLabels.length > 0
              ? roleSnapshot.roleCatalogBackedLabels.join(", ")
              : "unavailable"}
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
                      ? "Active in current identity"
                      : "Prototype framing"}
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
            <strong>Error:</strong> {combinedError}
          </div>
        )}

        {adminAccess && roleCatalog.length > 0 ? (
          <InviteForm roleCatalog={roleCatalog} />
        ) : adminAccess ? (
          <p className="empty-state">
            Role catalog unavailable. Invite and role-change actions stay
            disabled until `/api/tenant/roles` responds.
          </p>
        ) : null}

        {users.length > 0 ? (
          <div className="data-table" style={{ marginTop: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {adminAccess && <th>Actions</th>}
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
            No users found.
            {adminAccess && " Invite a user using the form above."}
          </p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
        <Link className="route-link" href="/settings">
          <strong>Settings lane</strong>
          Review the tenant capability and governance summary that backs these
          role assumptions.
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
              <th>Email</th>
              <th>Display Name</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  type="email"
                  name="email"
                  placeholder="user@example.com"
                  required
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <input
                  type="text"
                  name="displayName"
                  placeholder="John Doe"
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
                  Invite User
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
            {catalogEntry.displayName}
          </option>
        ))}
      </select>
      <select name="status" defaultValue={user.status}>
        <option value="invited">Invited</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
      </select>
      <button type="submit" className="btn-secondary" disabled={disabled}>
        Update
      </button>
    </form>
  );
}
