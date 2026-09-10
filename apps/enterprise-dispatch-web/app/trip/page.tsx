"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BookingRecord } from "@drts/contracts";
import {
  EAvatar,
  EBtnContent,
  ECard,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  enterpriseTenant,
  type EnterpriseTripSummary,
  getBookingStateMeta,
  getTripProgressStageIndex,
  isInProgressTripState,
  mapBookingRecordToTripSummary,
  toTelHref,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

type LoadState = "loading" | "ready" | "error";

export default function TripPage() {
  const { locale, t: tr } = useTranslation();
  const [summaries, setSummaries] = useState<EnterpriseTripSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .listBookings()
      .then((bookings: BookingRecord[]) => {
        if (cancelled) return;
        setSummaries(
          bookings
            .filter((booking) => booking.status === "active")
            .map(mapBookingRecordToTripSummary),
        );
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stateMeta = getBookingStateMeta(locale);
  // Only a booking that is actually assigned/en-route counts as "the current
  // trip". The previous version fell back to `bookings[0]` (any booking,
  // including a completed or cancelled one) and always drew stage index 2 —
  // R08's "六月行程仍9分鐘抵達" report was this: a stale/demo trip rendered
  // as if it were happening right now.
  const trip = summaries.find((b) => isInProgressTripState(b.state));

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {loadState === "loading" && (
          <ECard t={t}>
            <span style={{ color: t.muted }}>
              {tr("bookingLifecycle.detail.loading")}
            </span>
          </ECard>
        )}

        {loadState === "error" && (
          <ECard t={t} accent={t.warn}>
            <div data-testid="enterprise-trip-api-state">
              <p style={{ color: t.muted, lineHeight: 1.6 }}>
                {tr("bookingLifecycle.gateway.body")}
              </p>
              <Link
                href="/degraded"
                style={entBtnStyle(t, { variant: "default" })}
              >
                <EBtnContent>{tr("bookingLifecycle.gateway.action")}</EBtnContent>
              </Link>
            </div>
          </ECard>
        )}

        {loadState === "ready" && !trip && (
          <ECard t={t}>
            <div
              data-testid="enterprise-trip-empty"
              style={{ color: t.muted, textAlign: "center", padding: "12px 0" }}
            >
              {tr("bookingLifecycle.history.empty")}
            </div>
          </ECard>
        )}

        {loadState === "ready" && trip && (
          <ECard t={t} accent={t.primary}>
            <div style={{ padding: "6px 6px 4px" }}>
              <EntProgressRail
                t={t}
                active={getTripProgressStageIndex(trip.orderStatus)}
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  flex: 1,
                  minWidth: 220,
                }}
              >
                {/* No driver identity/contact field is exposed on the tenant
                    booking record, so this stays generic rather than showing
                    a name that isn't actually the assigned driver (R08/R09). */}
                <EAvatar t={t} size={50} tone="neutral" />
                <div>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                    {locale === "zh" ? "司機已指派" : "Driver assigned"}
                  </div>
                  <div style={{ fontSize: 12, color: t.muted }}>
                    {locale === "zh"
                      ? "聯絡方式由企業客服提供"
                      : "Contact is routed through enterprise support"}
                  </div>
                  <div style={{ marginTop: 5 }}>
                    <EPill t={t} tone={stateMeta[trip.state].tone} dot>
                      {stateMeta[trip.state].label}
                    </EPill>
                  </div>
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
                  {trip.etaMinutes ?? "—"}
                </div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                  {tr("trip.etaArrival")}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <EntRoute
                t={t}
                from={trip.from}
                to={trip.to}
                win={trip.window}
                airportLabel={
                  trip.flight ? `${trip.flight} · ${trip.terminal}` : undefined
                }
              />
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled
                aria-disabled="true"
                data-testid="trip-contact-driver"
                data-drt-operation="enterprise-contact-driver"
                style={entBtnStyle(t, {
                  variant: "default",
                  block: true,
                  disabled: true,
                })}
              >
                <EBtnContent icon="phone">{tr("trip.contactDriver")}</EBtnContent>
              </button>
              <a
                href={toTelHref(enterpriseTenant.supportPhone)}
                data-testid="trip-contact-support"
                data-drt-operation="enterprise-contact-support"
                style={entBtnStyle(t, { variant: "default", block: true })}
              >
                <EBtnContent icon="brief">{tr("trip.contactSupport")}</EBtnContent>
              </a>
              <Link
                href={`/bookings/${encodeURIComponent(trip.id)}`}
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
              {locale === "zh"
                ? "聯絡司機尚未提供直撥號碼，請改用企業客服。"
                : "Direct driver calling isn't available yet — please use enterprise support."}
            </div>
            <div
              style={{
                fontSize: 11,
                color: t.faint,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {tr("trip.etaNote")}
            </div>
          </ECard>
        )}
      </div>
    </>
  );
}
