import { notFound } from "next/navigation";
import { PartnerBookingPhoneScreen } from "@drts/ui-web";
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

  const resolvedRouteState = resolvePartnerRouteState(routeState);
  if (!resolvedRouteState) {
    notFound();
  }

  return (
    <PartnerBookingPhoneScreen
      brand={brand}
      screen={resolvedRouteState.activeScreen}
      {...(resolvedRouteState.activeScenario
        ? { scenario: resolvedRouteState.activeScenario }
        : {})}
    />
  );
}
