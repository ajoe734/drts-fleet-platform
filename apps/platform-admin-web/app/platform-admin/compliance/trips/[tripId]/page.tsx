import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function TripComplianceDetailPage() {
  return (
    <SandboxDesignPendingScreen
      title="Trip Compliance Detail"
      purpose="This route needs a canonical trip-centric compliance drilldown across investigation, evidence, discrepancy, and legal-hold state."
      route="/platform-admin/compliance/trips/[tripId]"
    />
  );
}
