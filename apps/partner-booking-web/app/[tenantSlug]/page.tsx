import { notFound } from "next/navigation";
import {
  isPartnerBookingScreenId,
  PartnerBookingReferenceFunnel,
} from "@drts/ui-web";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ screen?: string | string[] }>;
};

function normalizeScreen(
  value: string | string[] | undefined,
): Parameters<typeof isPartnerBookingScreenId>[0] {
  return Array.isArray(value) ? (value[0] ?? "landing") : (value ?? "landing");
}

export default async function TenantHomePage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const { screen } = await searchParams;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  const activeScreen = normalizeScreen(screen);

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen={
        isPartnerBookingScreenId(activeScreen) ? activeScreen : "landing"
      }
      basePath={`/${tenantSlug}`}
    />
  );
}
