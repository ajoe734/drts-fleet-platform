import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerIneligiblePage({ params }: PageProps) {
  return renderPartnerStateGate(params, "ineligible");
}
