import { notFound } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web";
import { getBrandForSlug } from "@/lib/brand";
import { resolvePartnerSearchState } from "@/lib/route-state";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    screen?: string | string[];
    scenario?: string | string[];
  }>;
};

export default async function TenantHomePage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const { screen, scenario } = await searchParams;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  const routeState = resolvePartnerSearchState(screen, scenario);

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen={routeState.activeScreen}
      basePath={`/${tenantSlug}`}
      {...(routeState.activeScenario
        ? { activeScenario: routeState.activeScenario }
        : {})}
    />
  );
}
