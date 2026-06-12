import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseEmptyState,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import { enterprisePageStyle } from "@/lib/enterprise-theme";

export default function ReassignmentsPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Availability Reassignments"
        subtitle="Reusable queue scaffolding for later reassignment workflows, using the enterprise shell instead of borrowed admin navigation."
      />
      <EnterpriseBanner
        tone="warn"
        title="Queue body remains pending dedicated artboards"
        body="This route now carries the real page shell, queue summary card, and state affordances that later dispatch flows can extend."
      />
      <EnterpriseSection>
        <EnterpriseCard
          title="Reassignment queue shell"
          actions={<EnterprisePill tone="warn">2 pending</EnterprisePill>}
        >
          <EnterpriseDl
            cols={2}
            items={[
              { k: "Primary use", v: "supply fallback and manual reroute" },
              { k: "Action mode", v: "operator-owned, auditable" },
              { k: "Expected panels", v: "list, details, action tray" },
              { k: "Current status", v: "shell + primitives landed" },
            ]}
          />
        </EnterpriseCard>
        <EnterpriseEmptyState
          tone="warn"
          title="Workflow board withheld"
          body="No dedicated reassignment board layout exists in the checked-in canvas bundle, so no synthetic board columns or card anatomy were added."
        />
      </EnterpriseSection>
    </div>
  );
}
