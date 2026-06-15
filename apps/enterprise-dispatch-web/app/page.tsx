import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseKpi,
  EnterpriseKpiGrid,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  getBookingStateMeta,
  getEnterpriseBookingDraft,
  getEnterpriseBookings,
  getEnterpriseTenant,
  getPolicyNotes,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import {
  enterpriseCardGridStyle,
  enterprisePageStyle,
  enterpriseTheme,
} from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

const primaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${enterpriseTheme.accent}`,
  background: enterpriseTheme.accent,
  color: enterpriseTheme.surface,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

const secondaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surface,
  color: enterpriseTheme.text,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

const ghostLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
  color: enterpriseTheme.textMuted,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

export default async function HomePage() {
  const locale = await getServerLocale();
  const bookings = getEnterpriseBookings(locale);
  const bookingStateMeta = getBookingStateMeta(locale);
  const draft = getEnterpriseBookingDraft(locale);
  const tenant = getEnterpriseTenant(locale);
  const policyNotes = getPolicyNotes(locale);
  const activeTrip = bookings[0] ?? null;

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("home.title", { name: "林宜君" }, locale)}
        subtitle={t("home.subtitle", { tenant: tenant.name }, locale)}
        actions={
          <Link href="/bookings/new" style={primaryLinkStyle}>
            {t("home.cta.create", undefined, locale)}
          </Link>
        }
      />

      <EnterpriseKpiGrid>
        <EnterpriseKpi
          label={t("home.kpi.quota", undefined, locale)}
          value="NT$ 35,800"
          sub="NT$ 84,200 / 120,000"
          hint="quota"
        />
        <EnterpriseKpi
          label={t("home.kpi.approval", undefined, locale)}
          value={t("home.kpi.approvalValue", undefined, locale)}
          sub={t("home.kpi.approvalSub", undefined, locale)}
          hint="approval"
        />
        <EnterpriseKpi
          label={t("home.kpi.trips", undefined, locale)}
          value={t("home.kpi.tripsValue", undefined, locale)}
          delta="+6%"
          deltaTone="up"
          sub={tenant.department}
          hint="trips"
        />
      </EnterpriseKpiGrid>

      <div style={enterpriseCardGridStyle}>
        <EnterpriseCard
          title={t("home.activeTrip.title", undefined, locale)}
          actions={
            activeTrip ? (
              <EnterprisePill tone={bookingStateMeta[activeTrip.state].tone}>
                {bookingStateMeta[activeTrip.state].label}
              </EnterprisePill>
            ) : null
          }
        >
          {activeTrip ? (
            <>
              <EnterpriseDl
                cols={1}
                items={[
                  {
                    k: t("home.activeTrip.passenger", undefined, locale),
                    v: activeTrip.passenger,
                  },
                  {
                    k: t("home.activeTrip.bookedBy", undefined, locale),
                    v: t(
                      "common.bookedByDelegate",
                      { name: activeTrip.bookedBy },
                      locale,
                    ),
                  },
                  {
                    k: t("home.activeTrip.route", undefined, locale),
                    v: `${activeTrip.from} → ${activeTrip.to}`,
                  },
                  {
                    k: t("home.activeTrip.eta", undefined, locale),
                    v: t(
                      "common.etaEstimate",
                      { minutes: activeTrip.etaMinutes ?? "?" },
                      locale,
                    ),
                    mono: true,
                  },
                ]}
              />
              <div style={{ marginTop: 12 }}>
                <Link href="/trip" style={secondaryLinkStyle}>
                  {t("home.activeTrip.cta", undefined, locale)}
                </Link>
              </div>
            </>
          ) : null}
        </EnterpriseCard>

        <EnterpriseCard
          title={t("home.quickCreate.title", undefined, locale)}
          actions={
            <EnterprisePill tone="info">
              {t("home.quickCreate.badge", undefined, locale)}
            </EnterprisePill>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <Link href="/bookings/new" style={{ ...primaryLinkStyle, width: "100%" }}>
              {t("home.quickCreate.self", undefined, locale)}
            </Link>
            <Link
              href="/bookings/new"
              style={{ ...secondaryLinkStyle, width: "100%" }}
            >
              {t("home.quickCreate.delegate", undefined, locale)}
            </Link>
            <Link href="/help" style={{ ...ghostLinkStyle, width: "100%" }}>
              {t("home.quickCreate.help", undefined, locale)}
            </Link>
          </div>
        </EnterpriseCard>
      </div>

      <EnterpriseSection>
        <EnterpriseCard
          title={t("home.upcoming.title", undefined, locale)}
          actions={
            <EnterprisePill tone="neutral">
              {t("home.upcoming.count", { count: bookings.length }, locale)}
            </EnterprisePill>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {bookings.map((booking, index) => (
              <div
                key={booking.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 2fr 120px",
                  gap: 12,
                  alignItems: "center",
                  paddingBottom: 12,
                  borderBottom:
                    index === bookings.length - 1
                      ? "1px solid transparent"
                      : `1px solid ${enterpriseTheme.border}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {booking.passenger}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: enterpriseTheme.textMuted,
                    }}
                  >
                    {booking.self
                      ? t("home.upcoming.self", undefined, locale)
                      : t(
                          "common.bookedByDelegate",
                          { name: booking.bookedBy },
                          locale,
                        )}
                  </div>
                </div>
                <div style={{ fontSize: 12.5 }}>
                  <div>{booking.from}</div>
                  <div style={{ color: enterpriseTheme.textMuted }}>
                    {booking.to}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: enterpriseTheme.monoFamily,
                    }}
                  >
                    {booking.window}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
                      {bookingStateMeta[booking.state].label}
                    </EnterprisePill>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link
                      href={`/bookings/${booking.id}`}
                      style={{ ...ghostLinkStyle, paddingInline: 0 }}
                    >
                      {t("home.upcoming.detail", undefined, locale)}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>

        <EnterpriseCard
          title={t("home.draft.title", undefined, locale)}
          actions={<EnterprisePill tone="accent">review-first</EnterprisePill>}
        >
          <EnterpriseDl
            cols={2}
            items={[
              { k: t("new.field.passenger", undefined, locale), v: draft.passenger },
              { k: t("new.field.bookedBy", undefined, locale), v: draft.bookedBy },
              {
                k: t("review.summary.pickupDropoff", undefined, locale),
                v: `${draft.pickup} → ${draft.dropoff}`,
              },
              { k: t("new.field.costCenter", undefined, locale), v: draft.costCenter, mono: true },
            ]}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <Link href="/bookings/review" style={primaryLinkStyle}>
              {t("new.next.review", undefined, locale)}
            </Link>
            <Link href="/bookings/new" style={secondaryLinkStyle}>
              {t("new.next.back", undefined, locale)}
            </Link>
          </div>
        </EnterpriseCard>

        <EnterpriseBanner
          tone="info"
          title={t("home.draft.policy", undefined, locale)}
          body={policyNotes.join("；")}
        />
      </EnterpriseSection>
    </div>
  );
}
