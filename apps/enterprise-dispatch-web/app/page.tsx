"use client";

import Link from "next/link";
import {
  EBtnContent,
  ECard,
  EKpi,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntRoute } from "@/components/ent-screen-bits";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";
import { useBookings, BookingReadState } from "./trip/use-bookings";
import { homeBookings, tripHref, bookingHref } from "./trip/booking-data";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default function HomePage() {
  const { locale } = useTranslation();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) => translate(key, params, locale);
  const zh = locale === "zh";
  const { data, error } = useBookings("home");
  if (error || data === null) return <BookingReadState error={error} />;
  const { active, upcoming } = homeBookings(data);
  const stateLabel = (b: typeof data[number]) => b.status === "active" ? b.orderStatus : b.status;

  return (
    <>
      {/* greeting hero */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: t.muted, marginBottom: 6 }}>
            {zh ? "企業派車" : "Enterprise dispatch"}
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: -0.6,
              margin: 0,
            }}
          >
            {zh ? "要去哪裡？" : "Where are you going?"}
          </h1>
          <p style={{ fontSize: 14.5, color: t.muted, margin: "8px 0 0" }}>
            {zh ? "查看預約與目前行程" : "View bookings and your current trip"}
          </p>
        </div>
        <Link
          href="/bookings/new"
          style={entBtnStyle(t, { variant: "primary", size: "lg" })}
        >
          <EBtnContent icon="plus" iconR="arrow" size="lg">
            {tr("home.cta.create")}
          </EBtnContent>
        </Link>
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <EKpi
          t={t}
          label={tr("home.kpi.quota")}
          en="quota"
          value={"—"}
          sub={zh ? "尚無額度資料" : "Quota unavailable"}
        />
        <EKpi
          t={t}
          label={tr("home.kpi.approval")}
          en="approval"
          value={data.filter((b) => b.status === "active" && b.approvalState === "pending").length}
          sub={zh ? "目前列表待審預約" : "Pending bookings in this list"}
          tone="warn"
        />
        <EKpi
          t={t}
          label={tr("home.kpi.trips")}
          en="trips"
          value={"—"}
          sub={zh ? "尚無月用車統計" : "Monthly usage unavailable"}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {active && (
            <ECard
              t={t}
              accent={t.primary}
              title={tr("home.activeTrip.title")}
              sub={tr("home.activeTrip.sub")}
              actions={
                <Link
                  href={tripHref(active.bookingId)}
                  style={entBtnStyle(t, { variant: "soft", size: "sm" })}
                >
                  <EBtnContent iconR="arrow" size="sm">
                    {tr("home.activeTrip.cta")}
                  </EBtnContent>
                </Link>
              }
            >
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <EntParty
                    t={t}
                    passenger={active.passenger.name}
                    passengerLabel={tr("party.passenger")}
                    compact
                    subline={active.bookedBy ? <span>{active.bookedBy.name}</span> : undefined}
                  />
                  <div style={{ marginTop: 14 }}>
                    <EntRoute
                      t={t}
                      from={active.pickup.address}
                      to={active.dropoff.address}
                      win={active.reservationWindowStart}
                      airportLabel={
                        active.flightNo
                          ? `${active.flightNo} · ${active.terminal}`
                          : undefined
                      }
                    />
                  </div>
                </div>
                <div
                  style={{
                    width: 150,
                    background: t.surfaceLo,
                    border: "1px solid " + t.line,
                    borderRadius: 12,
                    padding: 14,
                    textAlign: "center",
                    alignSelf: "flex-start",
                  }}
                >
                  <EPill t={t} tone="primary" dot>
                    {stateLabel(active)}
                  </EPill>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      fontFamily: t.mono,
                      color: t.primary,
                      margin: "10px 0 0",
                    }}
                  >
                    {"—"}
                  </div>
                  <div style={{ fontSize: 11, color: t.muted }}>
                    {tr("home.activeTrip.etaSuffix")}
                  </div>
                </div>
              </div>
            </ECard>
          )}

          <ECard
            t={t}
            title={tr("home.upcoming.title")}
            sub={tr("home.upcoming.sub", { count: upcoming.length })}
            pad={0}
            actions={
              <Link
                href="/bookings"
                style={entBtnStyle(t, { variant: "ghost", size: "sm" })}
              >
                <EBtnContent iconR="arrow" size="sm">
                  {tr("home.upcoming.all")}
                </EBtnContent>
              </Link>
            }
          >
            <div>
              {upcoming.length === 0 && <p style={{ padding: 18, color: t.muted }}>{tr("bookingLifecycle.history.empty")}</p>}
              {upcoming.map((b, i) => (
                <div
                  key={b.bookingId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px",
                    borderTop: i ? "1px solid " + t.lineSoft : "none",
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 14,
                      background: !b.bookedBy ? t.primaryBg : t.surfaceLo,
                      color: !b.bookedBy ? t.primary : t.muted,
                      border: "1px solid " + (!b.bookedBy ? t.primaryBd : t.line),
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {b.passenger.name.slice(0, 1)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <Link href={bookingHref(b.bookingId)} style={{ fontSize: 13.5, fontWeight: 600, color: t.primary }}>
                        {b.passenger.name} · {b.bookingId}
                      </Link>
                      {!!b.bookedBy && (
                        <span style={{ fontSize: 11, color: t.warn }}>
                          ·{" "}
                          {tr("home.upcoming.delegateShort", {
                            name: b.bookedBy?.name ?? "—",
                          })}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: t.muted,
                        marginTop: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {b.pickup.address} → {b.dropoff.address}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontFamily: t.mono,
                        color: t.ink2,
                      }}
                    >
                      {b.reservationWindowStart}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <EPill t={t} tone="primary" dot>
                        {stateLabel(b)}
                      </EPill>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ECard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard t={t} title={tr("home.quickCreate.title")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <Link
                href="/bookings/new"
                style={entBtnStyle(t, { variant: "primary", block: true })}
              >
                <EBtnContent icon="plus">
                  {tr("home.quickCreate.self")}
                </EBtnContent>
              </Link>
              <Link
                href="/bookings/new"
                style={entBtnStyle(t, { variant: "default", block: true })}
              >
                <EBtnContent icon="users">
                  {tr("home.quickCreate.delegate")}
                </EBtnContent>
              </Link>
              <Link
                href="/bookings/new"
                style={entBtnStyle(t, { variant: "default", block: true })}
              >
                <EBtnContent icon="flag">
                  {tr("home.quickCreate.airport")}
                </EBtnContent>
              </Link>
            </div>
          </ECard>

          <ECard t={t} title={tr("home.policy.title")}>
            <p style={{ color: t.muted }}>{zh ? "尚無可用的企業政策與客服聯絡資料，請洽企業管理員。" : "Policy and support contacts are unavailable. Contact your enterprise administrator."}</p>
          </ECard>
        </div>
      </div>
    </>
  );
}
