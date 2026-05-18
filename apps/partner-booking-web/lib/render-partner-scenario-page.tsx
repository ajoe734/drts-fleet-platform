import { notFound } from "next/navigation";
import {
  getPartnerBookingScenarioScreen,
  PartnerBookingReferenceFunnel,
  type PartnerBookingScenarioId,
} from "@drts/ui-web/partner-booking-funnel";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export async function renderPartnerScenarioPage(
  params: PageProps["params"],
  scenario: PartnerBookingScenarioId,
) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen={getPartnerBookingScenarioScreen(scenario)}
      activeScenario={scenario}
      basePath={`/${tenantSlug}`}
    />
  );
}
