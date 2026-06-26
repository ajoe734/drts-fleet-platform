import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function CompliancePage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxCompliance.title"
      purposeKey="sandbox.pending.compliance.purpose"
      route="/platform-admin/compliance"
    />
  );
}
