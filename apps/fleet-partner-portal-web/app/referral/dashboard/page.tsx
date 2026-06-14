import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  loadReferralDashboard,
  loadReferralRevenue,
} from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { ReferralUsagePeriodsTable } from "@/components/referral-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function ReferralDashboardPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const [dashboard, revenue] = await Promise.all([
    loadReferralDashboard(),
    loadReferralRevenue(),
  ]);
  const latestRevenue = revenue.rows[0] ?? null;
  const statementStatus =
    latestRevenue?.statementStatus ?? dashboard.summary.statementStatus;
  const statementTone =
    statementStatus === "paid"
      ? "success"
      : statementStatus === "published"
        ? "info"
        : "warn";

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("referral.dashboard.title", locale)}
        subtitle={t("referral.dashboard.subtitle", locale)}
      />
      <div
        style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CanvasPill theme={theme} tone="accent">
            {t("referral.dashboard.periodSub", locale, {
              period: dashboard.summary.period,
            })}
          </CanvasPill>
          <CanvasPill theme={theme} tone="info">
            {t("referral.dashboard.kpi.shareDelta", locale)}
          </CanvasPill>
        </div>
        <DataSourceNotice
          theme={theme}
          source={dashboard.source}
          body={t("data.fixtureNotice", locale)}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.activeUsers", locale)}
            value={dashboard.summary.activeUsers}
            sub={t("referral.dashboard.kpi.activeUsersSub", locale)}
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.trips", locale)}
            value={dashboard.summary.trips}
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.gmv", locale)}
            value={dashboard.summary.gmv}
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.share", locale)}
            value={dashboard.summary.estimatedShare}
            delta={t("referral.dashboard.kpi.shareDelta", locale)}
            deltaTone="neutral"
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
            gap: 16,
          }}
        >
          <CanvasCard
            theme={theme}
            title={t("referral.dashboard.liveUsage", locale)}
            subtitle={t("referral.dashboard.liveUsageSub", locale)}
            padding={0}
          >
            <ReferralUsagePeriodsTable rows={dashboard.periods} />
          </CanvasCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title={t("referral.dashboard.direction", locale)}>
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="info"
                body={t("referral.dashboard.directionBody", locale)}
              />
            </CanvasCard>
            <CanvasCard
              theme={theme}
              title={t("referral.dashboard.currentStatement", locale)}
            >
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: t("referral.dashboard.statementId", locale),
                    v: latestRevenue?.statementId ?? dashboard.summary.statementId,
                    mono: true,
                  },
                  {
                    k: t("referral.dashboard.status", locale),
                    v: (
                      <CanvasPill theme={theme} tone={statementTone} dot>
                        {t(`referral.statement.status.${statementStatus}`, locale)}
                      </CanvasPill>
                    ),
                  },
                  {
                    k: t("referral.dashboard.latestPeriod", locale),
                    v: dashboard.summary.latestStatementPeriod ?? dashboard.summary.period,
                    mono: true,
                  },
                  {
                    k: t("referral.dashboard.pendingStatements", locale),
                    v: dashboard.summary.pendingStatementCount,
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
