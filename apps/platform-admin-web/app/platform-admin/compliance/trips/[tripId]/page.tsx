import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function TripComplianceDetailPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxComplianceTripDetail.title"
      purposeKey="sandbox.pending.complianceTripDetail.purpose"
      route="/platform-admin/compliance/trips/[tripId]"
    />
  );
}
