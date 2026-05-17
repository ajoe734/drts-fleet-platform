import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerManualReviewPage({ params }: PageProps) {
  return renderPartnerStateGate(params, "manual_review");
}
