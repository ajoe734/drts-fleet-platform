import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerEligibilityRequiredPage({
  params,
}: PageProps) {
  return renderPartnerStateGate(params, "eligibility_required");
}
