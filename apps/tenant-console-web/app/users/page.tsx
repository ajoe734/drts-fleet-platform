import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function getRoleTone(roleCode: string) {
  if (roleCode === "tenant_admin") return "status-badge";
  if (roleCode.includes("finance")) return "source-pill";
  return "status-chip";
}

function getStatusTone(status: TenantUserRoleRecord["status"]) {
  if (status === "active") return "source-pill";
  if (status === "invited") return "status-badge";
  return "status-chip";
}

export default async function UsersPage() {
  const client = getTenantClient();
  const [users, roles] = await Promise.all([
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);
  const invitedCount = users.filter((user) => user.status === "invited").length;
  const suspendedCount = users.filter(
    (user) => user.status === "suspended",
  ).length;
  const roleByCode = new Map(roles.map((role) => [role.roleCode, role]));

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Users"
        title="Tenant access management now reads like a formal roster, not a backend dump."
        description="The route keeps role-code authority server-owned while presenting invite state, roster coverage, and catalog guidance in the shape of the TN_Users artboard."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Users</span>
          <strong>{users.length}</strong>
          <p>Tenant-scoped user rows visible under `/api/tenant/users`.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Roles</span>
          <strong>{roles.length}</strong>
          <p>
            Assignable backend role definitions published for this tenant realm.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Assignable</span>
          <strong>{roles.filter((role) => role.assignable).length}</strong>
          <p>Catalog roles that can currently be assigned from tenant scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Pending</span>
          <strong>{invitedCount + suspendedCount}</strong>
          <p>Invited or suspended accounts that need lifecycle follow-up.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Users"
          title="Tenant user roster"
          description="The table mirrors the artboard's roster-first layout while keeping role assignment and lifecycle state grounded in published user and role records."
        >
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Role code</th>
                  <th>Invited</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td>
                      <div className="table-primary">
                        {user.displayName}
                        <span className="table-secondary">{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {roleByCode.get(user.roleCode)?.displayName ??
                          user.roleCode}
                        <span className="table-secondary">
                          {roleByCode.get(user.roleCode)?.description ??
                            "No catalog description available"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={getStatusTone(user.status)}>
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <span className={getRoleTone(user.roleCode)}>
                        {user.roleCode}
                      </span>
                    </td>
                    <td>{formatDateTime(user.invitedAt)}</td>
                    <td>{formatDateTime(user.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Catalog"
          title="Backend role catalog"
          description="The product-spec families are framing, but the canonical assignable list still comes from the backend role catalog and not from UI-local labels."
        >
          <ul className="panel-list">
            {roles.map((role) => (
              <li key={role.roleCode}>
                <strong>{role.displayName}</strong>
                <span className="list-note">
                  {role.roleCode} · {role.assignable ? "assignable" : "fixed"}
                </span>
                <p className="muted-copy">{role.description}</p>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Command boundary"
        description="Invite, role change, and suspend actions still have to follow the tenant command matrix from `XS-UI-003`. This route deliberately stops short of inventing unsupported user lifecycle mutations."
      />
    </div>
  );
}
