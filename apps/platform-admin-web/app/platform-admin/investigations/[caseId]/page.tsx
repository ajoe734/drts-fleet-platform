import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function InvestigationDetailPage() {
  return (
    <SandboxDesignPendingScreen
      title="Investigation Detail"
      purpose="This route needs a canonical accident-case detail screen for summary state, linked evidence, linked reports, and case-level drilldowns."
      route="/platform-admin/investigations/[caseId]"
    />
  );
}
