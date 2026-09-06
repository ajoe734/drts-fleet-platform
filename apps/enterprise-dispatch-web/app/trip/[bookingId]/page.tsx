import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import {
  EBtn,
  EBtnContent,
  ECard,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  deriveBookingDisplayState,
  formatEnterpriseReservationWindow,
  isSelfBooking,
  resolveEnterpriseBookingAddress,
  resolveEnterpriseBookingFetchOutcome,
  type EnterpriseTripDisplayState,
} from "@/lib/dispatch-fixture-adapter";
import { getBookingStateMeta, getEnterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

const PROGRESS_STAGE_INDEX: Record<EnterpriseTripDisplayState, number> = {
  reserved: 0,
  approval: 0,
  assigned: 0,
  enroute: 1,
  completed: 4,
  cancelled: 0,
  nosupply: 0,
};

function toSupportTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params2?: Record<string, string | number>) =>
    translate(key, params2, locale);
  const tenant = getEnterpriseTenant(locale);
  const stateMeta = getBookingStateMeta(locale);

  let trip: BookingRecord;
  try {
    trip = await getEnterpriseDispatchTenantClient(tenant.id).getBooking(
      bookingId,
    );
  } catch (error) {
    const { notFound: isMissing, gatewayRoute } =
      resolveEnterpriseBookingFetchOutcome(error);
    if (isMissing) {
      // A real 404 must never be presented as a retryable/temporary fault
      // (SR-ENTERPRISE-DATA-001 / R08).
      notFound();
    }
    redirect(gatewayRoute ?? "/degraded");
  }

  const displayState = deriveBookingDisplayState(trip);

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <ECard t={t} accent={t.primary}>
          <div style={{ padding: "6px 6px 4px" }}>
            <EntProgressRail
              t={t}
              active={PROGRESS_STAGE_INDEX[displayState]}
              stages={[
                { t: tr("trip.stage.assigned"), icon: "car" },
                { t: tr("trip.stage.enroute"), icon: "route" },
                { t: tr("trip.stage.arrived"), icon: "pin" },
                { t: tr("trip.stage.inprogress"), icon: "bolt" },
                { t: tr("trip.stage.completed"), icon: "check" },
              ]}
            />
          </div>
          <div
            style={{ height: 1, background: t.lineSoft, margin: "22px 0 18px" }}
          />
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <EntParty
                t={t}
                passenger={trip.passenger.name}
                passengerLabel={tr("party.passenger")}
                subline={
                  isSelfBooking(trip) ? (
                    <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>
                      {tr("party.self")}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: t.warn, marginTop: 1 }}>
                      {tr("party.delegate", {
                        name: trip.bookedBy?.name ?? "",
                      })}
                    </div>
                  )
                }
              />
              <div style={{ marginTop: 5 }}>
                <EPill t={t} tone={stateMeta[displayState].tone} dot>
                  {stateMeta[displayState].label}
                </EPill>
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: t.primaryBg,
                border: "1px solid " + t.primaryBd,
                borderRadius: 14,
                padding: "12px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: t.mono,
                  color: t.primary,
                  lineHeight: 1,
                }}
              >
                {"—"}
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                {tr("trip.etaArrival")}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <EntRoute
              t={t}
              from={resolveEnterpriseBookingAddress(trip.pickup)}
              to={resolveEnterpriseBookingAddress(trip.dropoff)}
              win={formatEnterpriseReservationWindow(trip.reservationWindowStart)}
              airportLabel={
                trip.flightNo
                  ? `${trip.flightNo} · ${trip.terminal ?? ""}`
                  : undefined
              }
            />
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <EBtn t={t} variant="default" block icon="phone" disabled>
              {tr("trip.contactDriver")}
            </EBtn>
            <a
              href={toSupportTelHref(tenant.supportPhone)}
              data-testid="trip-contact-support"
              data-drt-operation="enterprise-trip-contact-support"
              style={entBtnStyle(t, { variant: "default", block: true })}
            >
              <EBtnContent icon="brief">{tr("trip.contactSupport")}</EBtnContent>
            </a>
            <Link
              href={`/bookings/${encodeURIComponent(trip.bookingId)}`}
              data-testid="trip-detail-link"
              style={entBtnStyle(t, { variant: "primary", block: true })}
            >
              <EBtnContent iconR="arrow">{tr("trip.detail")}</EBtnContent>
            </Link>
          </div>
          <div
            style={{
              fontSize: 11,
              color: t.faint,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {tr("trip.etaNote")}
          </div>
        </ECard>
      </div>
    </>
  );
}
