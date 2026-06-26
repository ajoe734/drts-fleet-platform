import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function CompliancePage() {
  return (
    <SandboxDesignPendingScreen
      title="Sandbox Compliance Overview"
      purpose="Platform-admin needs a canonical triage screen for investigations, takeover reviews, discrepancies, exports, legal holds, and filing posture."
      route="/platform-admin/compliance"
    />
  );
}
