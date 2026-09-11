import { cookies } from "next/headers";
import Link from "next/link";
import { EnterpriseGatePage } from "@/components/enterprise-state-page";
import {
  EBtnContent,
  ECard,
  EIcon,
  EKpi,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntRoute } from "@/components/ent-screen-bits";
import {
  classifyEnterpriseDashboardFetchError,
  formatEnterpriseBookingTime,
  getEnterpriseDispatchTenantClient,
  getEnterpriseOrderStatusTone,
  selectActiveEnterpriseTrip,
} from "@/lib/api-client";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import {
  getEnterpriseTenant,
  getEnterpriseUser,
  getPolicyNotes,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";
import type { TenantDashboardSummary } from "@drts/contracts";

const POLICY_ICONS = ["bolt", "building", "clock"] as const;

export default async function HomePage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);

  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    return <EnterpriseGatePage kind="auth-required" />;
  }

  let summary: TenantDashboardSummary | null = null;
  try {
    summary = await getEnterpriseDispatchTenantClient(
      verified.session.tenantId,
    ).getDashboardSummary();
  } catch (error) {
    return <EnterpriseGatePage kind={classifyEnterpriseDashboardFetchError(error)} />;
  }

  const user = getEnterpriseUser(locale);
  const tenant = getEnterpriseTenant(locale);
  const policyNotes = getPolicyNotes(locale);

  const upcoming = summary.upcomingBookings;
  const active = selectActiveEnterpriseTrip(upcoming);
  const upcomingPreview = upcoming.slice(0, 3);

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

      {/* KPI strip — driven by the authoritative tenant dashboard summary */}
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
          value={summary.bookingCount}
          sub={tr("home.kpi.quotaSub", { period: summary.periodMonth })}
        />
        <EKpi
          t={t}
          label={tr("home.kpi.approval")}
          en="approval"
          value={summary.pendingApprovalCount}
          sub={tr("home.kpi.approvalSub2")}
          {...(summary.pendingApprovalCount > 0 ? { tone: "warn" as const } : {})}
        />
        <EKpi
          t={t}
          label={tr("home.kpi.trips")}
          en="trips"
          value={summary.completedTripCount}
          sub={tr("home.kpi.tripsSub2")}
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
                  href="/trip"
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
                    passenger={active.passengerName}
                    passengerLabel={tr("party.passenger")}
                    compact
                    subline={null}
                  />
                  <div style={{ marginTop: 14 }}>
                    <EntRoute
                      t={t}
                      from={active.pickupAddress}
                      to={active.dropoffAddress}
                      win={formatEnterpriseBookingTime(
                        active.reservationWindowStart,
                      )}
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
                  <EPill t={t} tone={getEnterpriseOrderStatusTone(active.status)} dot>
                    {tr(`status.order.${active.status}` as TranslationKey)}
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
                    {tr("home.activeTrip.etaUnavailable")}
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
            {upcomingPreview.length === 0 ? (
              <div
                data-testid="enterprise-home-upcoming-empty"
                style={{ padding: 18, color: t.muted, fontSize: 13 }}
              >
                {tr("home.upcoming.empty")}
              </div>
            ) : (
              <div>
                {upcomingPreview.map((b, i) => (
                  <Link
                    key={b.bookingId}
                    href={`/bookings/${encodeURIComponent(b.bookingId)}`}
                    data-testid={`enterprise-home-upcoming-${b.bookingId}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 18px",
                      borderTop: i ? "1px solid " + t.lineSoft : "none",
                      textDecoration: "none",
                      color: t.ink,
                    }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 14,
                        background: t.surfaceLo,
                        color: t.muted,
                        border: "1px solid " + t.line,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {b.passengerName.slice(0, 1)}
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
                          {b.passengerName}
                        </span>
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
                        {b.pickupAddress} → {b.dropoffAddress}
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
                        {formatEnterpriseBookingTime(b.reservationWindowStart)}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <EPill t={t} tone={getEnterpriseOrderStatusTone(b.status)} dot>
                          {tr(`status.order.${b.status}` as TranslationKey)}
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
              <span style={{ fontSize: 12, color: t.muted }}>
                {translate(
                  "state.supportLine",
                  { phone: tenant.supportPhone },
                  locale,
                )}
              </span>
            </div>
          </ECard>
        </div>
      </div>
    </>
  );
}
