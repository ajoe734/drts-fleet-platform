import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationDetailPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxInvestigationDetail.title"
      purposeKey="sandbox.pending.investigationDetail.purpose"
      route="/platform-admin/investigations/[caseId]"
    />
  );
}
