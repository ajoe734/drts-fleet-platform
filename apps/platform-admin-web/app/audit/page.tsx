import type { AuditStubRecord } from "@drts/shared-types";

import { AppShellCard } from "@drts/ui-web";

const recentAudit: AuditStubRecord = {
  id: "audit-bootstrap",
  actorId: "system",
  surface: "platform-admin-web",
  createdAt: "bootstrap",
};

export default function AuditPage() {
  return (
    <main className="app-grid">
      <AppShellCard
        title="Audit"
        description={`Placeholder audit surface. Recent placeholder record: ${recentAudit.id}.`}
      />
    </main>
  );
}
