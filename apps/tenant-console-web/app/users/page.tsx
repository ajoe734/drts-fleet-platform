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

function getFormalRoleFamily(roleCode: string) {
  const normalized = roleCode.toLowerCase();
  if (normalized.includes("admin")) return "Tenant admin";
  if (normalized.includes("operator") || normalized.includes("dispatch")) {
    return "Operator";
  }
  if (
    normalized.includes("finance") ||
    normalized.includes("billing") ||
    normalized.includes("analyst")
  ) {
    return "Finance / analyst";
  }
  if (
    normalized.includes("integration") ||
    normalized.includes("api") ||
    normalized.includes("webhook")
  ) {
    return "Integration manager";
  }
  if (normalized.includes("view")) return "Viewer";
  return "Specialized tenant role";
}

export default async function UsersPage() {
  const client = getTenantClient();
  const [users, roles] = await Promise.all([
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Users"
        title="Tenant access management now reads from the formal backend role catalog."
        description="The route keeps role code authority server-owned while presenting the tenant-admin, operator, finance, integration, and viewer framing from the product spec."
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
          <span className="metric-label">Invited</span>
          <strong>
            {users.filter((user) => user.status === "invited").length}
          </strong>
          <p>Invited users still waiting to acknowledge or activate access.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Users"
          title="Tenant user roster"
          description="Role assignment and status remain command-driven. This surface reflects the current authoritative assignment without inventing a UI-local role table."
        >
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role code</th>
                  <th>Formal family</th>
                  <th>Status</th>
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
                    <td>{user.roleCode}</td>
                    <td>{getFormalRoleFamily(user.roleCode)}</td>
                    <td>
                      <span className="status-chip">{user.status}</span>
                    </td>
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
          description="The product-spec families are framing, but the canonical role list still comes from the backend role catalog."
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
        description="Invite, role change, and suspend actions still have to follow the tenant command matrix from `XS-UI-003`. This route stops short of inventing unsupported user lifecycle mutations."
      />
    </div>
  );
}
