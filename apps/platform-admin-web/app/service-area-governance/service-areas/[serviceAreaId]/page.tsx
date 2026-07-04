import { ServiceAreaGovernancePage } from "@/components/service-area-governance-page";

export default async function ServiceAreaGovernanceDetailPage({
  params,
}: {
  params: Promise<{ serviceAreaId: string }>;
}) {
  const { serviceAreaId } = await params;
  return (
    <ServiceAreaGovernancePage
      scope="serviceArea"
      selectedId={decodeURIComponent(serviceAreaId)}
    />
  );
}
