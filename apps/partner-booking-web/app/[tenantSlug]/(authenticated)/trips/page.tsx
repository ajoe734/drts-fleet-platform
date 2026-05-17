import { notFound } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerTripsPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen="trips"
      basePath={`/${tenantSlug}`}
    />
  );
}
