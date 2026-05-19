import {
  PartnerBookingStateGate,
  type PartnerBookingStateScreenId,
} from "@drts/ui-web/partner-booking";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export async function renderPartnerStateGate(
  params: PageProps["params"],
  state: PartnerBookingStateScreenId,
) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: state === "inactive",
    });
    return (
      <PartnerBookingStateGate
        brand={brand}
        state={state}
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
