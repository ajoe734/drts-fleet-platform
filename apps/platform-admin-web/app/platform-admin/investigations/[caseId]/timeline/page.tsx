import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationTimelinePage() {
  return (
    <SandboxDesignPendingScreen
      title="Investigation Timeline"
      purpose="This route needs a canonical synchronized fact timeline screen with explicit confidence, source, and discrepancy treatment."
      route="/platform-admin/investigations/[caseId]/timeline"
    />
  );
}
