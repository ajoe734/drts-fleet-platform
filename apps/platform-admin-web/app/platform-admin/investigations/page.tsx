import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationsPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxInvestigations.title"
      purposeKey="sandbox.pending.investigations.purpose"
      route="/platform-admin/investigations"
    />
  );
}
