import Link from "next/link";

import { AppShellCard } from "@drts/ui-web";

export default function HomePage() {
  return (
    <main className="app-grid">
      <span className="pill">Platform-wide bootstrap shell</span>
      <AppShellCard
        title="Platform Admin Web"
        description="Placeholder shell for tenants, users, roles, fleet, devices, switchboard, pricing, payments, feature flags, and audit administration."
      >
        <div className="route-list">
          <Link className="route-link" href="/tenants">
            <strong>Tenants</strong>
            Placeholder tenant inventory and status controls.
          </Link>
          <Link className="route-link" href="/fleet">
            <strong>Fleet</strong>
            Placeholder fleet and device management surface.
          </Link>
          <Link className="route-link" href="/pricing">
            <strong>Pricing</strong>
            Placeholder pricing and split controls.
          </Link>
          <Link className="route-link" href="/audit">
            <strong>Audit</strong>
            Placeholder audit and platform health review surface.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
