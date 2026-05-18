import { notFound } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web/partner-booking-funnel";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerEligibilityPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <PartnerBookingReferenceFunnel
      brand={brand}
      activeScreen="eligibility"
      basePath={`/${tenantSlug}`}
    />
  );
}
