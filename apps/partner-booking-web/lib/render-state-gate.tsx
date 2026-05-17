import { notFound } from "next/navigation";
import {
  PartnerBookingStateGate,
  type PartnerBookingStateScreenId,
} from "@drts/ui-web";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export async function renderPartnerStateGate(
  params: PageProps["params"],
  state: PartnerBookingStateScreenId,
) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <PartnerBookingStateGate
      brand={brand}
      state={state}
      basePath={`/${tenantSlug}`}
    />
  );
}
