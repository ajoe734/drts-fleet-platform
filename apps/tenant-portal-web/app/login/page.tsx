import { redirect } from "next/navigation";
import { AppShellCard } from "@drts/ui-web";
import { signInTenantPortal } from "./actions";
import {
  getTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";

const SEEDED_EMAILS = [
  "admin@acme.example",
  "ops@acme.example",
  "finance@acme.example",
  "viewer@acme.example",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getTenantPortalSession();
  if (session) {
    redirect("/");
  }

  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <main
      className="app-grid"
      style={{ minHeight: "100vh", placeItems: "center" }}
    >
      <div style={{ width: "min(560px, 100%)" }}>
        <AppShellCard
          title="Tenant portal sign-in"
          description="Create a backend-issued tenant bootstrap session, then let the portal resolve identity, scopes, and role-gated navigation from that authority context."
        >
          {resolvedSearchParams.error ? (
            <div className="error-banner">
              <strong>Error:</strong> {resolvedSearchParams.error}
            </div>
          ) : null}

          <form action={signInTenantPortal} className="form-grid">
            <div className="form-row">
              <label htmlFor="email">Invited email</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="admin@acme.example"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="tenantId">Tenant ID</label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                placeholder="Optional. Leave blank to use backend default tenant."
              />
            </div>
            <button type="submit" className="btn-primary">
              Start session
            </button>
          </form>

          <div className="callout-panel" style={{ marginTop: "1rem" }}>
            <strong>Seeded invited users</strong>
            <p>
              Development bootstrap currently recognizes these tenant-user
              emails from the backend seed.
            </p>
            <div className="chip-row">
              {SEEDED_EMAILS.map((email) => (
                <span className="status-chip" key={email}>
                  {email}
                </span>
              ))}
            </div>
            <p className="muted-copy">
              This route stays at <code>{TENANT_PORTAL_LOGIN_PATH}</code> and
              does not fabricate local roles. Successful sign-in stores the
              backend-issued bearer token in an HTTP-only cookie.
            </p>
          </div>
        </AppShellCard>
      </div>
    </main>
  );
}
