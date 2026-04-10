import Link from "next/link";

import { AppShellCard } from "@drts/ui-web";

export default function ReportsPage() {
  return (
    <main className="app-grid">
      <AppShellCard
        title="Reports"
        description="Placeholder analytics surface for tenant-level operational and billing reports. Data definitions are intentionally postponed."
      >
        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
