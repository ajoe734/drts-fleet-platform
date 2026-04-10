import Link from "next/link";

import { AppShellCard } from "@drts/ui-web";

export default function HomePage() {
  return (
    <main className="app-grid">
      <span className="pill">Phase 1 bootstrap surface</span>
      <AppShellCard
        title="Tenant Portal Web"
        description="Placeholder shell for tenant administrators and general tenant users. Booking workflows, passenger data rules, billing logic, and webhooks remain intentionally undefined in bootstrap."
      >
        <div className="route-list">
          <Link className="route-link" href="/booking-list">
            <strong>Booking List</strong>
            Placeholder entry point for reservation and fixed-route bookings.
          </Link>
          <Link className="route-link" href="/reports">
            <strong>Reports</strong>
            Placeholder view for tenant-facing reporting and exports.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
