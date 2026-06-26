import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function RegulatoryReportsPage() {
  return (
    <SandboxDesignPendingScreen
      title="Regulatory Reports"
      purpose="This route needs a canonical filing queue screen for draft, submitted, accepted, and rejected regulator reports linked to investigation cases."
      route="/platform-admin/regulatory-reports"
    />
  );
}
