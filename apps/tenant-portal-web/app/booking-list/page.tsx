import type { TenantSummary } from "@drts/shared-types";
import Link from "next/link";

import { AppShellCard } from "@drts/ui-web";

const sampleTenant: TenantSummary = {
  id: "tenant-demo",
  name: "Bootstrap Tenant",
  status: "draft",
};

export default function BookingListPage() {
  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking List"
        description={`Placeholder queue for ${sampleTenant.name}. Deep booking logic, passengers, address book, and notifications are deferred.`}
      >
        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
