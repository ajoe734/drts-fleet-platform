"use client";

import type { BookingRecord } from "@drts/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  EAvatar,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  classifyBookingApiError,
  formatReservationWindow,
  mapBookingRecordToProgressStage,
  resolveTripContactConfig,
  resolveTripDriverInfo,
  type EnterpriseBookingErrorState,
} from "@/lib/dispatch-fixture-adapter";
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

export function TripClient({ bookingId }: { bookingId?: string | undefined }) {
  const { t: tr } = useTranslation();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnterpriseBookingErrorState | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setIsEmpty(false);

    const client = getEnterpriseDispatchTenantClient(enterpriseTenant.id);

    async function loadTripData() {
      try {
        if (bookingId) {
          const record = await client.getBooking(bookingId);
          if (isMounted) {
            setBooking(record);
            setLoading(false);
          }
        } else {
          const list = await client.listBookings();
          if (!isMounted) return;
          if (!Array.isArray(list) || list.length === 0) {
            setIsEmpty(true);
            setLoading(false);
            return;
          }

          const active =
            list.find((b) =>
              [
                "assigned",
                "driver_accepted",
                "enroute_pickup",
                "arrived_pickup",
                "on_trip",
              ].includes(b.orderStatus),
            ) ?? list[0];

          if (active) {
            setBooking(active);
          } else {
            setIsEmpty(true);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(classifyBookingApiError(err, bookingId));
          setLoading(false);
        }
      }
    }

    loadTripData();
    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {loading && (
          <ECard t={t}>
            <div
              data-testid="trip-loading"
              style={{
                padding: "36px 20px",
                textAlign: "center",
                color: t.muted,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <EIcon name="route" size={24} style={{ color: t.primary }} />
              <div>載入行程資訊中…</div>
            </div>
          </ECard>
        )}

        {!loading && error && (
          <ECard t={t} accent={error.isNotFound ? t.warn : t.danger}>
            <div
              data-testid={error.isNotFound ? "trip-not-found" : "trip-error"}
              style={{ textAlign: "center", padding: "28px 16px" }}
            >
              <div style={{ marginBottom: 14 }}>
                <EPill t={t} tone={error.isNotFound ? "warn" : "danger"} dot>
                  {error.isNotFound
                    ? "404 · BOOKING_NOT_FOUND"
                    : `${error.statusCode} · ${error.errorCode}`}
                </EPill>
              </div>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  margin: "0 0 8px",
                  color: t.ink,
                }}
              >
                {error.title}
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: t.muted,
                  margin: "0 auto 22px",
                  maxWidth: 480,
                  lineHeight: 1.6,
                }}
              >
                {error.message}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="/bookings"
                  style={entBtnStyle(t, { variant: "primary" })}
                >
                  <EBtnContent iconR="arrow">查看我的預約</EBtnContent>
                </Link>
                <Link href="/" style={entBtnStyle(t, { variant: "default" })}>
                  <EBtnContent>返回首頁</EBtnContent>
                </Link>
              </div>
            </div>
          </ECard>
        )}

        {!loading && !error && isEmpty && (
          <ECard t={t}>
            <div
              data-testid="trip-empty"
              style={{ textAlign: "center", padding: "34px 16px" }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  color: t.muted,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <EIcon name="car" size={24} />
              </div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  margin: "0 0 6px",
                  color: t.ink,
                }}
              >
                目前無進行中行程
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: t.muted,
                  margin: "0 auto 20px",
                  maxWidth: 440,
                  lineHeight: 1.6,
                }}
              >
                您目前沒有進行中或已指派的用車行程。您可以建立新預約或查看過往預約清單。
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="/bookings/new"
                  style={entBtnStyle(t, { variant: "primary" })}
                >
                  <EBtnContent icon="plus">建立預約</EBtnContent>
                </Link>
                <Link
                  href="/bookings"
                  style={entBtnStyle(t, { variant: "default" })}
                >
                  <EBtnContent>查看我的預約</EBtnContent>
                </Link>
              </div>
            </div>
          </ECard>
        )}

        {!loading &&
          !error &&
          !isEmpty &&
          booking &&
          (() => {
            const driverInfo = resolveTripDriverInfo(booking);
            const contactConfig = resolveTripContactConfig(
              driverInfo,
              enterpriseTenant.supportPhone,
            );
            const { activeStage, label: stageLabel } =
              mapBookingRecordToProgressStage(booking);

            const fromLabel = booking.pickup.addressName
              ? `${booking.pickup.addressName} (${booking.pickup.address})`
              : booking.pickup.address;
            const toLabel = booking.dropoff.addressName
              ? `${booking.dropoff.addressName} (${booking.dropoff.address})`
              : booking.dropoff.address;

            const rawEta = (
              booking as unknown as { etaMinutes?: number | null }
            ).etaMinutes;
            const etaText =
              typeof rawEta === "number" && rawEta >= 0 ? String(rawEta) : "—";

            return (
              <ECard t={t} accent={t.primary}>
                <div style={{ padding: "6px 6px 4px" }}>
                  <EntProgressRail
                    t={t}
                    active={activeStage}
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
                  style={{
                    height: 1,
                    background: t.lineSoft,
                    margin: "22px 0 18px",
                  }}
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
                    <EAvatar
                      t={t}
                      name={
                        driverInfo.hasDriver
                          ? driverInfo.driverName.slice(0, 1)
                          : "車"
                      }
                      tone={driverInfo.hasDriver ? "primary" : "neutral"}
                      size={50}
                    />
                    <div>
                      <div
                        style={{ fontSize: 15.5, fontWeight: 700 }}
                        data-testid="trip-driver-name"
                      >
                        {driverInfo.driverName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: t.muted,
                          fontFamily: t.mono,
                        }}
                        data-testid="trip-driver-vehicle"
                      >
                        {driverInfo.vehicle}
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <EPill
                          t={t}
                          tone={driverInfo.hasDriver ? "info" : "neutral"}
                          dot
                        >
                          {stageLabel}
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
                      data-testid="trip-eta-value"
                    >
                      {etaText}
                    </div>
                    <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                      {etaText !== "—"
                        ? tr("trip.etaArrival")
                        : "分鐘 · 估計抵達"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <EntRoute
                    t={t}
                    from={fromLabel}
                    to={toLabel}
                    win={formatReservationWindow(
                      booking.reservationWindowStart,
                    )}
                    airportLabel={
                      booking.flightNo
                        ? `${booking.flightNo} · ${booking.terminal ?? ""}`
                        : undefined
                    }
                  />
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {contactConfig.driver.available &&
                  contactConfig.driver.href ? (
                    <a
                      href={contactConfig.driver.href}
                      data-testid="contact-driver-btn"
                      style={{
                        ...entBtnStyle(t, { variant: "default" }),
                        flex: 1,
                        minWidth: 140,
                        textDecoration: "none",
                        textAlign: "center",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <EBtnContent icon="phone">
                        {contactConfig.driver.label}
                      </EBtnContent>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      data-testid="contact-driver-btn"
                      title={contactConfig.driver.reason}
                      style={{
                        ...entBtnStyle(t, {
                          variant: "default",
                          disabled: true,
                        }),
                        flex: 1,
                        minWidth: 140,
                        cursor: "not-allowed",
                      }}
                    >
                      <EBtnContent icon="phone">
                        {driverInfo.hasDriver
                          ? "司機未公開電話"
                          : "尚未指派司機"}
                      </EBtnContent>
                    </button>
                  )}

                  <a
                    href={contactConfig.support.href}
                    data-testid="contact-support-btn"
                    style={{
                      ...entBtnStyle(t, { variant: "default" }),
                      flex: 1,
                      minWidth: 140,
                      textDecoration: "none",
                      textAlign: "center",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <EBtnContent icon="brief">
                      {contactConfig.support.label}
                    </EBtnContent>
                  </a>

                  <Link
                    href={`/bookings/${encodeURIComponent(booking.bookingId)}`}
                    data-testid="trip-detail-link"
                    style={{
                      ...entBtnStyle(t, { variant: "primary" }),
                      flex: 1,
                      minWidth: 140,
                      textDecoration: "none",
                      textAlign: "center",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <EBtnContent iconR="arrow">{tr("trip.detail")}</EBtnContent>
                  </Link>
                </div>

                {!driverInfo.hasDriver && (
                  <div
                    data-testid="driver-unassigned-notice"
                    style={{
                      marginTop: 14,
                      padding: "10px 14px",
                      background: t.surfaceLo,
                      border: "1px solid " + t.line,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      fontSize: 12,
                      color: t.muted,
                    }}
                  >
                    <EIcon
                      name="info"
                      size={15}
                      style={{ color: t.primary, flexShrink: 0 }}
                    />
                    <span>
                      {contactConfig.driver.reason} · 如需協助請撥企業客服專線{" "}
                      <a
                        href={`tel:${enterpriseTenant.supportPhone}`}
                        style={{
                          color: t.primary,
                          textDecoration: "underline",
                        }}
                      >
                        {enterpriseTenant.supportPhone}
                      </a>
                    </span>
                  </div>
                )}

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
            );
          })()}
      </div>
    </>
  );
}
