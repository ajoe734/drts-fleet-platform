"use client";

import type { BookingRecord } from "@drts/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EBtnContent,
  ECard,
  EIcon,
  EKpi,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntRoute } from "@/components/ent-screen-bits";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { adaptBookingRecordToEnterpriseBooking } from "@/lib/dispatch-fixture-adapter";
import {
  enterpriseQuotaSummary,
  getBookingStateMeta,
  getEnterpriseTenant,
  getEnterpriseUser,
  getPolicyNotes,
  type EnterpriseBooking,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

const POLICY_ICONS = ["bolt", "building", "clock"] as const;

export default function HomePage() {
  const { t: tr, locale } = useTranslation();
  const stateMeta = getBookingStateMeta(locale);
  const user = getEnterpriseUser(locale);
  const tenant = getEnterpriseTenant(locale);
  const policyNotes = getPolicyNotes(locale);

  const [rawBookings, setRawBookings] = useState<BookingRecord[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getEnterpriseDispatchTenantClient(tenant.id)
      .listBookings()
      .then((records) => {
        if (isMounted) {
          setRawBookings(records);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRawBookings([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [tenant.id]);

  const bookings: EnterpriseBooking[] = useMemo(() => {
    if (!rawBookings) return [];
    return rawBookings.map((r) => adaptBookingRecordToEnterpriseBooking(r));
  }, [rawBookings]);

  const active = bookings.find(
    (b) => b.state === "enroute" || b.state === "assigned",
  );
  const upcoming = bookings
    .filter((b) =>
      ["assigned", "enroute", "approval", "reserved"].includes(b.state),
    )
    .slice(0, 3);

  const pendingCount = (rawBookings ?? []).filter(
    (b) => b.approvalState === "pending",
  ).length;
  const firstPending = rawBookings?.find((b) => b.approvalState === "pending");
  const totalCount = rawBookings ? rawBookings.length : 0;

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
            {tr("home.greeting.line", { tenant: tenant.name, dept: user.dept })}
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: -0.6,
              margin: 0,
            }}
          >
            {tr("home.title", { name: user.name })}
          </h1>
          <p style={{ fontSize: 14.5, color: t.muted, margin: "8px 0 0" }}>
            {tr("home.subtitle", { tenant: tenant.name })}
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
          value={enterpriseQuotaSummary.rides}
          sub={enterpriseQuotaSummary.amount}
        />
        <EKpi
          t={t}
          label={tr("home.kpi.approval")}
          en="approval"
          value={pendingCount > 0 ? `${pendingCount} 件待審` : "0 件待審"}
          sub={
            pendingCount > 0
              ? `${firstPending?.bookingId ?? ""} · 由你送出`
              : "目前無待審項目"
          }
          {...(pendingCount > 0 ? { tone: "warn" as const } : {})}
        />
        <EKpi
          t={t}
          label={tr("home.kpi.trips")}
          en="trips"
          value={loading ? "…" : `${totalCount} 筆`}
          sub={
            totalCount > 0 ? `${tenant.name} · 已建立預約` : "目前尚無預約紀錄"
          }
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && (
            <ECard t={t} title={tr("home.activeTrip.title")}>
              <div
                style={{
                  padding: "20px 0",
                  color: t.muted,
                  textAlign: "center",
                }}
              >
                載入行程資料中…
              </div>
            </ECard>
          )}

          {!loading && active && (
            <ECard
              t={t}
              accent={t.primary}
              title={tr("home.activeTrip.title")}
              sub={tr("home.activeTrip.sub")}
              actions={
                <Link
                  href={`/trip?bookingId=${encodeURIComponent(active.id)}`}
                  data-testid="home-active-trip-link"
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
                    passenger={active.passenger}
                    passengerLabel={tr("party.passenger")}
                    compact
                    subline={
                      active.self ? (
                        <div
                          style={{ fontSize: 12, color: t.muted, marginTop: 1 }}
                        >
                          {tr("party.self")}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            color: t.warn,
                            marginTop: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <EIcon name="users" size={13} />
                          {tr("party.delegate", { name: active.bookedBy })}
                        </div>
                      )
                    }
                  />
                  <div style={{ marginTop: 14 }}>
                    <EntRoute
                      t={t}
                      from={active.from}
                      to={active.to}
                      win={active.window}
                      airportLabel={
                        active.flight
                          ? `${active.flight} · ${active.terminal ?? ""}`
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
                  <EPill t={t} tone={stateMeta[active.state].tone} dot>
                    {stateMeta[active.state].label}
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
                    {active.etaMinutes ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: t.muted }}>
                    {active.etaMinutes != null
                      ? tr("home.activeTrip.etaSuffix")
                      : "排程中"}
                  </div>
                </div>
              </div>
            </ECard>
          )}

          {!loading && !active && (
            <ECard
              t={t}
              title="目前無進行中的行程"
              sub="暫無進行中用車"
              actions={
                <Link
                  href="/bookings"
                  style={entBtnStyle(t, { variant: "soft", size: "sm" })}
                >
                  <EBtnContent iconR="arrow" size="sm">
                    查看全部預約
                  </EBtnContent>
                </Link>
              }
            >
              <div
                style={{
                  padding: "12px 0",
                  color: t.muted,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                }}
              >
                您目前沒有進行中的派車行程。您可以建立新預約或由預約清單查看歷史記錄。
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
            {loading ? (
              <div style={{ padding: 18, color: t.muted, textAlign: "center" }}>
                載入預約清單中…
              </div>
            ) : upcoming.length === 0 ? (
              <div
                style={{
                  padding: "24px 18px",
                  color: t.muted,
                  fontSize: 13.5,
                  textAlign: "center",
                }}
              >
                目前尚無即將到來的預約。
              </div>
            ) : (
              <div>
                {upcoming.map((b, i) => (
                  <Link
                    key={b.id}
                    href={`/bookings/${encodeURIComponent(b.id)}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 18px",
                      borderTop: i ? "1px solid " + t.lineSoft : "none",
                      textDecoration: "none",
                      color: t.ink,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 14,
                        background: b.self ? t.primaryBg : t.surfaceLo,
                        color: b.self ? t.primary : t.muted,
                        border: "1px solid " + (b.self ? t.primaryBd : t.line),
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {b.passenger.slice(0, 1)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {b.passenger}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: t.mono,
                            color: t.primary,
                          }}
                        >
                          ({b.id})
                        </span>
                        {!b.self && (
                          <span style={{ fontSize: 11, color: t.warn }}>
                            ·{" "}
                            {tr("home.upcoming.delegateShort", {
                              name: b.bookedBy,
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
                        {b.from} → {b.to}
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
                        {b.window}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <EPill t={t} tone={stateMeta[b.state].tone} dot>
                          {stateMeta[b.state].label}
                        </EPill>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
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

          <ECard
            t={t}
            title={tr("home.policy.title")}
            sub={tr("card.sub.enterprisePolicy")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {policyNotes.map((note, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 12.5,
                    color: t.ink2,
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    style={{ color: t.primary, flexShrink: 0, marginTop: 1 }}
                  >
                    <EIcon name={POLICY_ICONS[i] ?? "info"} size={15} />
                  </span>
                  {note}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid " + t.lineSoft,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <EIcon name="phone" size={14} style={{ color: t.muted }} />
              <a
                href={`tel:${tenant.supportPhone}`}
                style={{
                  fontSize: 12,
                  color: t.muted,
                  textDecoration: "none",
                }}
              >
                客服電話：{tenant.supportPhone}
              </a>
            </div>
          </ECard>
        </div>
      </div>
    </>
  );
}
