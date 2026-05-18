import { renderPartnerScenarioPage } from "@/lib/render-partner-scenario-page";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerEligibilityRequiredPage({
  params,
}: PageProps) {
  return renderPartnerScenarioPage(params, "eligibility-required");
}
