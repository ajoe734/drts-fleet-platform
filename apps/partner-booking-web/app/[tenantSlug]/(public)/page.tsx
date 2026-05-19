import { notFound, redirect } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web/partner-booking";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerLandingPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    return (
      <PartnerBookingReferenceFunnel
        brand={brand}
        activeScreen="landing"
        basePath={`/${tenantSlug}`}
      />
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") {
        notFound();
      }
      if (error.code === "PARTNER_ENTRY_INACTIVE") {
        redirect(`/${tenantSlug}/inactive`);
      }
    }
    throw error;
  }
}
