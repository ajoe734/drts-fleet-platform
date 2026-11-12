import { notFound, redirect } from "next/navigation";
import { PartnerAuthorityError } from "@/lib/api-client";
import {
  loadPartnerBookingRecord,
  type PartnerReadSearch,
} from "@/lib/partner-booking-read-model";
import {
  PartnerBookingRecord,
  PartnerBookingReadError,
} from "@/components/partner-booking-record";
import { getServerLocale } from "@/lib/server-locale";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<PartnerReadSearch>;
};

export default async function PartnerReceiptPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerLocale();
  try {
    const record = await loadPartnerBookingRecord(tenantSlug, query);
    return (
      <PartnerBookingRecord
        booking={record.booking}
        order={record.order}
        entrySlug={record.entry.entrySlug}
        partnerUserRef={record.partnerUserRef}
        locale={locale}
        screen="receipt"
      />
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") notFound();
      if (error.code === "PARTNER_ENTRY_INACTIVE")
        redirect("/" + encodeURIComponent(tenantSlug) + "/inactive");
      return <PartnerBookingReadError locale={locale} code={error.code} />;
    }
    throw error;
  }
}
