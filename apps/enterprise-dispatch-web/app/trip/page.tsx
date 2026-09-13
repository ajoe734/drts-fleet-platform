import { cookies } from "next/headers";
import Link from "next/link";
import { EnterpriseGatePage } from "@/components/enterprise-state-page";
import {
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  classifyEnterpriseDashboardFetchError,
  formatEnterpriseBookingTime,
  getEnterpriseDispatchTenantClient,
  getEnterpriseTripProgressStage,
  selectActiveEnterpriseTrip,
} from "@/lib/api-client";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";
import type { TenantDashboardSummary } from "@drts/contracts";

export default async function TripPage() {
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

  const trip = selectActiveEnterpriseTrip(summary.upcomingBookings);

  if (!trip) {
    return (
      <>
        <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <ECard t={t}>
            <div
              data-testid="enterprise-trip-empty"
              style={{
                padding: "36px 18px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <EIcon name="car" size={26} style={{ color: t.muted }} />
              <strong style={{ fontSize: 15 }}>{tr("trip.empty.title")}</strong>
              <p
                style={{
                  color: t.muted,
                  fontSize: 13,
                  maxWidth: 380,
                  margin: 0,
                }}
              >
                {tr("trip.empty.body")}
              </p>
              <Link
                href="/bookings"
                style={entBtnStyle(t, { variant: "default", size: "sm" })}
              >
                <EBtnContent size="sm">{tr("trip.empty.cta")}</EBtnContent>
              </Link>
            </div>
          </ECard>
        </div>
      </>
    );
  }

  const stage = getEnterpriseTripProgressStage(trip.status);
  const supportPhone = enterpriseTenant.supportPhone;

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <ECard t={t} accent={t.primary}>
          <div style={{ padding: "6px 6px 4px" }}>
            <EntProgressRail
              t={t}
              active={stage ?? 0}
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
              <span
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 18,
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  color: t.muted,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <EIcon name="car" size={22} />
              </span>
              <div>
                <div
                  data-testid="enterprise-trip-driver-status"
                  style={{ fontSize: 14, fontWeight: 600, color: t.muted }}
                >
                  {tr("trip.driverContactUnavailable")}
                </div>
                <div style={{ marginTop: 5 }}>
                  <EPill t={t} tone="neutral" dot>
                    {tr(`status.order.${trip.status}` as TranslationKey)}
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
                {"—"}
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                {tr("trip.etaUnavailable")}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <EntRoute
              t={t}
              from={trip.pickupAddress}
              to={trip.dropoffAddress}
              win={formatEnterpriseBookingTime(trip.reservationWindowStart)}
            />
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button
              type="button"
              disabled
              aria-disabled
              data-testid="enterprise-trip-contact-driver"
              title={tr("trip.driverContactUnavailable")}
              style={entBtnStyle(t, {
                variant: "default",
                block: true,
                disabled: true,
              })}
            >
              <EBtnContent icon="phone">{tr("trip.contactDriver")}</EBtnContent>
            </button>
            <a
              href={`tel:${supportPhone.replace(/[^+0-9]/g, "")}`}
              data-testid="enterprise-trip-contact-support"
              style={entBtnStyle(t, { variant: "default", block: true })}
            >
              <EBtnContent icon="brief">{tr("trip.contactSupport")}</EBtnContent>
            </a>
            <Link
              href={`/bookings/${encodeURIComponent(trip.bookingId)}`}
              data-testid="enterprise-trip-detail-link"
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
