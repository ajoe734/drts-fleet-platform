import { redirect } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import { ECard, EEmpty } from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  deriveBookingDisplayState,
  resolveEnterpriseBookingFetchOutcome,
} from "@/lib/dispatch-fixture-adapter";
import { getEnterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

const ACTIVE_STATES = new Set(["enroute", "assigned"]);

// Resolves "my current trip" against the authoritative tenant booking list
// and redirects to the concrete `/trip/[bookingId]` record (SR-ENTERPRISE-
// DATA-001 / R08). Never invents a trip from stale/fixture data when there is
// no real active booking.
export default async function TripPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const tenant = getEnterpriseTenant(locale);

  let bookings: BookingRecord[];
  try {
    bookings = await getEnterpriseDispatchTenantClient(tenant.id).listBookings();
  } catch (error) {
    const { gatewayRoute } = resolveEnterpriseBookingFetchOutcome(error);
    redirect(gatewayRoute ?? "/degraded");
  }

  const active = [...bookings]
    .sort(
      (a, b) =>
        new Date(a.reservationWindowStart).getTime() -
        new Date(b.reservationWindowStart).getTime(),
    )
    .find((b) => ACTIVE_STATES.has(deriveBookingDisplayState(b)));

  if (active) {
    redirect(`/trip/${encodeURIComponent(active.bookingId)}`);
  }

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <ECard t={t}>
          <EEmpty
            t={t}
            icon="car"
            title={tr("bookingLifecycle.history.empty")}
          />
        </ECard>
      </div>
    </>
  );
}
