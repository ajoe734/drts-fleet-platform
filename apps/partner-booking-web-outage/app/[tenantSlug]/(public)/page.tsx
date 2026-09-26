import { notFound, redirect } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web/partner-booking";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerLandingPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowMissing: true,
    });
    return (
      <PartnerBookingReferenceFunnel
        brand={brand}
        activeScreen="landing"
        basePath={`/${tenantSlug}`}
        locale={locale}
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
