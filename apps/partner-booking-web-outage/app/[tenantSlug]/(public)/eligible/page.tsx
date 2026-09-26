import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

export default async function PartnerEligiblePage({
  params,
  searchParams,
}: PageProps) {
  return renderPartnerStateGate(params, "eligible", searchParams);
}
