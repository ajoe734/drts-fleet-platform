import {
  PartnerBookingStateGate,
  type PartnerBookingStateScreenId,
} from "@drts/ui-web/partner-booking";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

export async function renderPartnerStateGate(
  params: PageProps["params"],
  state: PartnerBookingStateScreenId,
  searchParams?: PageProps["searchParams"],
) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  const resolvedSearchParams = searchParams ? await searchParams : null;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: state === "inactive",
    });
    const eligibilityVerificationId =
      (Array.isArray(resolvedSearchParams?.eligibilityVerificationId)
        ? resolvedSearchParams?.eligibilityVerificationId[0]
        : resolvedSearchParams?.eligibilityVerificationId) ?? null;

    if (eligibilityVerificationId) {
      return (
        <PartnerBookingStateGate
          brand={brand}
          state={state}
          basePath={`/${tenantSlug}`}
          persistentQuery={new URLSearchParams({
            eligibilityVerificationId,
          }).toString()}
          locale={locale}
        />
      );
    }

    return (
      <PartnerBookingStateGate
        brand={brand}
        state={state}
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
