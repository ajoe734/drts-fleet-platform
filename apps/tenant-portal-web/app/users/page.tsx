import Link from "next/link";
import type { TenantUserRoleRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function UsersPage() {
  const client = getTenantClient();

  let users: TenantUserRoleRecord[] = [];
  let error: string | null = null;

  try {
    users = await client.listTenantUsers();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Users"
        description={`Fetched from /api/tenant/users. ${users.length} user(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {users.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td>{user.userId}</td>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>{user.roleCode}</td>
                    <td>{user.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No users found. Add via tenant partner API.
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
