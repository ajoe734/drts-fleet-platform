import Link from "next/link";
import { getUsers, inviteUser, updateUserRole } from "./actions";
import { getCurrentRole, isAdmin } from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";

export default async function UsersPage() {
  const { users, error } = await getUsers();
  const role = await getCurrentRole();
  const adminAccess = isAdmin(role);

  return (
    <main className="app-grid">
      <AppShellCard
        title="User Management"
        description={
          adminAccess
            ? "Invite users and manage their roles within this tenant."
            : `Viewing as ${role}. Admin access required to manage users.`
        }
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {adminAccess && <InviteForm />}

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
                    <td>{user.roleCode}</td>
                    <td>{user.status}</td>
                    {adminAccess && (
                      <td>
                        <RoleUpdateForm user={user} />
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
      </AppShellCard>
    </main>
  );
}

function InviteForm() {
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
                  defaultValue="viewer"
                  style={{ width: "100%" }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
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
}: {
  user: { userId: string; roleCode: string; status: string };
}) {
  return (
    <form action={updateUserRole} style={{ display: "flex", gap: "0.5rem" }}>
      <input type="hidden" name="userId" value={user.userId} />
      <select name="roleCode" defaultValue={user.roleCode}>
        <option value="viewer">Viewer</option>
        <option value="operator">Operator</option>
        <option value="admin">Admin</option>
      </select>
      <select name="status" defaultValue={user.status}>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
      </select>
      <button type="submit" className="btn-secondary">
        Update
      </button>
    </form>
  );
}
