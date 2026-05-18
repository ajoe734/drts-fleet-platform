import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerEligiblePage({ params }: PageProps) {
  return renderPartnerStateGate(params, "eligible");
}
