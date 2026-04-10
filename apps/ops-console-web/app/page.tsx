import Link from "next/link";

import { AppShellCard } from "@drts/ui-web";

export default function HomePage() {
  return (
    <main className="app-grid">
      <span className="pill">Ops bootstrap shell</span>
      <AppShellCard
        title="Ops Console Web"
        description="Placeholder shell for Host, OpCo, and ROC operations. Dispatch scheduling, maintenance, incidents, notifications, and reports remain thin until product modules are approved."
      >
        <div className="route-list">
          <Link className="route-link" href="/dashboard">
            <strong>Dashboard</strong>
            Placeholder operational summary surface.
          </Link>
          <Link className="route-link" href="/dispatch">
            <strong>Dispatch</strong>
            Placeholder scheduling and dispatch workflow surface.
          </Link>
          <Link className="route-link" href="/incidents">
            <strong>Incidents</strong>
            Placeholder incident review and escalation surface.
          </Link>
          <Link className="route-link" href="/reports">
            <strong>Reports</strong>
            Placeholder revenue and operations reporting surface.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
