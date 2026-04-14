import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function HomePage() {
  const client = getTenantClient();

  // Fetch feature flags to determine which modules are enabled
  let flagsEnabled = false;
  let moduleStatus = {
    booking: false,
    billing: false,
    reports: false,
    webhooks: false,
    directory: false,
  };

  try {
    const flags = await client.getFeatureFlags();
    flagsEnabled = true;
    moduleStatus = {
      booking:
        flags.flags.find((f) => f.key === "tenant-portal.booking")?.enabled ??
        false,
      billing:
        flags.flags.find((f) => f.key === "tenant-portal.billing")?.enabled ??
        false,
      reports:
        flags.flags.find((f) => f.key === "tenant-portal.reports")?.enabled ??
        false,
      webhooks:
        flags.flags.find((f) => f.key === "tenant-portal.webhooks")?.enabled ??
        false,
      directory:
        flags.flags.find((f) => f.key === "phase1.read-models")?.enabled ??
        false,
    };
  } catch {
    // If feature flags endpoint is unavailable, default to enabled
    moduleStatus = {
      booking: true,
      billing: true,
      reports: true,
      webhooks: true,
      directory: true,
    };
  }

  // Smoke: try to get identity context to verify API connectivity
  let apiStatus = "unknown";
  try {
    const identity = await client.getIdentityContext();
    apiStatus = identity ? "connected" : "error";
  } catch {
    apiStatus = "disconnected";
  }

  return (
    <main className="app-grid">
      <span className="pill">Phase 1 client integration</span>
      <AppShellCard
        title="Tenant Portal Web"
        description={`API status: ${apiStatus}. Feature flags: ${flagsEnabled ? "active" : "fallback"}. Connected to ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}.`}
      >
        <div className="module-status">
          <h3>Module Status</h3>
          <ul>
            <li>
              <strong>Booking:</strong>{" "}
              {moduleStatus.booking ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Billing:</strong>{" "}
              {moduleStatus.billing ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Reports:</strong>{" "}
              {moduleStatus.reports ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Webhooks:</strong>{" "}
              {moduleStatus.webhooks ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Directory:</strong>{" "}
              {moduleStatus.directory ? "✅ Enabled" : "❌ Disabled"}
            </li>
          </ul>
        </div>
        <div className="route-list">
          {moduleStatus.booking && (
            <>
              <Link className="route-link" href="/booking-list">
                <strong>Booking List</strong>
                View and manage tenant bookings.
              </Link>
              <Link className="route-link" href="/bookings/new">
                <strong>New Booking</strong>
                Create a business dispatch reservation.
              </Link>
            </>
          )}
          {moduleStatus.billing && (
            <Link className="route-link" href="/billing">
              <strong>Billing</strong>
              View invoices and billing profile.
            </Link>
          )}
          {moduleStatus.reports && (
            <Link className="route-link" href="/reports">
              <strong>Reports</strong>
              Submit and view report jobs.
            </Link>
          )}
          {moduleStatus.webhooks && (
            <Link className="route-link" href="/webhooks">
              <strong>Webhooks</strong>
              Manage webhook endpoints and delivery.
            </Link>
          )}
          {moduleStatus.directory && (
            <>
              <Link className="route-link" href="/passengers">
                <strong>Passengers</strong>
                Tenant passenger directory.
              </Link>
              <Link className="route-link" href="/addresses">
                <strong>Addresses</strong>
                Tenant address book.
              </Link>
              <Link className="route-link" href="/users">
                <strong>Users</strong>
                Tenant user management.
              </Link>
              <Link className="route-link" href="/api-keys">
                <strong>API Keys</strong>
                Tenant API key management.
              </Link>
            </>
          )}
          <Link className="route-link" href="/feature-flags">
            <strong>Feature Flags</strong>
            View and toggle feature flags.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
