import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function LegalHoldsPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxLegalHolds.title"
      purposeKey="sandbox.pending.legalHolds.purpose"
      route="/platform-admin/evidence/legal-holds"
    />
  );
}
