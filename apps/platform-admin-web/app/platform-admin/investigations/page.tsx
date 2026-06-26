import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationsPage() {
  return (
    <SandboxDesignPendingScreen
      title="Sandbox Investigations"
      purpose="Platform-admin needs a canonical investigation queue screen, including ROC-originated entry handling driven by backend-provided deep links."
      route="/platform-admin/investigations"
    />
  );
}
