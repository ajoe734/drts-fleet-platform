import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function EvidenceExportsPage() {
  return (
    <SandboxDesignPendingScreen
      title="Evidence Exports"
      purpose="This route needs a canonical controlled-export queue that makes request-versus-approval separation visually explicit."
      route="/platform-admin/evidence/exports"
    />
  );
}
