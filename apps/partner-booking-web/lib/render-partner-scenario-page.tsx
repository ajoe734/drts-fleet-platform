import { notFound } from "next/navigation";
import {
  PartnerBookingStateGate,
  type PartnerBookingScenarioId,
} from "@drts/ui-web/partner-booking-funnel";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export async function renderPartnerStateGate(
  params: PageProps["params"],
  scenario: PartnerBookingScenarioId,
) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <PartnerBookingStateGate
      brand={brand}
      scenario={scenario}
      basePath={`/${tenantSlug}`}
    />
  );
}

export const renderPartnerScenarioPage = renderPartnerStateGate;
