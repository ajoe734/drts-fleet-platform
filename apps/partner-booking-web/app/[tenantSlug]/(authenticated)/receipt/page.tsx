import { notFound, redirect } from "next/navigation";
import { PartnerBookingReferenceFunnel } from "@drts/ui-web/partner-booking";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { getProgramBookingArtifacts } from "@/lib/partner-booking-server";
import { getServerLocale } from "@/lib/server-locale";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    bookingId?: string | string[];
    orderId?: string | string[];
  }>;
};

function readFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PartnerReceiptPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = await getServerLocale();
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const bookingId = readFirst(resolvedSearchParams.bookingId);
    const orderId = readFirst(resolvedSearchParams.orderId);
    const bookingArtifacts =
      bookingId && orderId
        ? await getProgramBookingArtifacts({ tenantSlug, bookingId, orderId })
        : null;
    return (
      <PartnerBookingReferenceFunnel
        brand={brand}
        activeScreen="receipt"
        basePath={`/${tenantSlug}`}
        booking={bookingArtifacts?.booking}
        locale={locale}
        order={bookingArtifacts?.receipt}
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
