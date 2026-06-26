import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationTimelinePage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxInvestigationTimeline.title"
      purposeKey="sandbox.pending.investigationTimeline.purpose"
      route="/platform-admin/investigations/[caseId]/timeline"
    />
  );
}
