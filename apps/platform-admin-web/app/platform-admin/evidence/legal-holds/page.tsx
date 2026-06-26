import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function LegalHoldsPage() {
  return (
    <SandboxDesignPendingScreen
      title="Legal Holds"
      purpose="This route needs a canonical legal-hold governance screen covering placement, release request, and approval with four-eyes separation."
      route="/platform-admin/evidence/legal-holds"
    />
  );
}
