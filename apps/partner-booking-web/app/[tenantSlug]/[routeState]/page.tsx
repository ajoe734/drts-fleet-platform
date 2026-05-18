import { notFound } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web";
import { getBrandForSlug } from "@/lib/brand";
import { resolvePartnerRouteState } from "@/lib/route-state";

type PageProps = {
  params: Promise<{ tenantSlug: string; routeState: string }>;
};

export default async function PartnerRouteStatePage({ params }: PageProps) {
  const { tenantSlug, routeState } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  const resolved = resolvePartnerRouteState(routeState);
  if (!resolved) {
    notFound();
  }
  const scenarioProps = resolved.activeScenario
    ? { activeScenario: resolved.activeScenario }
    : undefined;

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen={resolved.activeScreen}
      {...scenarioProps}
      basePath={`/${tenantSlug}`}
    />
  );
}
