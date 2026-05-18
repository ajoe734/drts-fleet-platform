import { renderPartnerScenarioPage } from "@/lib/render-partner-scenario-page";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerManualReviewPage({ params }: PageProps) {
  return renderPartnerScenarioPage(params, "manual_review");
}
