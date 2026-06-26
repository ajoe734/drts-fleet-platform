import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function EvidenceExportsPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxEvidenceExports.title"
      purposeKey="sandbox.pending.evidenceExports.purpose"
      route="/platform-admin/evidence/exports"
    />
  );
}
