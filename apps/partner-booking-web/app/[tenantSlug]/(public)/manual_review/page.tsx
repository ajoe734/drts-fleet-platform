import { renderPartnerStateGate } from "@/lib/render-partner-scenario-page";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerManualReviewPage({ params }: PageProps) {
  return renderPartnerStateGate(params, "manual_review");
}
