import { ServiceAreaGovernancePage } from "@/components/service-area-governance-page";

export default async function StopPolicyGovernanceDetailPage({
  params,
}: {
  params: Promise<{ stopPolicyId: string }>;
}) {
  const { stopPolicyId } = await params;
  return (
    <ServiceAreaGovernancePage
      scope="stopPolicy"
      selectedId={decodeURIComponent(stopPolicyId)}
    />
  );
}
