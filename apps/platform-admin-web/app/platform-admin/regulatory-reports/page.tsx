import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function RegulatoryReportsPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxRegulatoryReports.title"
      purposeKey="sandbox.pending.regulatoryReports.purpose"
      route="/platform-admin/regulatory-reports"
    />
  );
}
