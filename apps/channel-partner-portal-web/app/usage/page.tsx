import {
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadReferralUsage } from "@/lib/channel-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import {
  ReferralTripLinesTable,
  ReferralUsageDailyTable,
  ReferralUsagePeriodsTable,
} from "@/components/referral-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function ReferralUsagePage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const usage = await loadReferralUsage();
  const current = usage.periods[0] ?? null;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("referral.usage.title", locale)}
        subtitle={t("referral.usage.subtitle", locale)}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={usage.source}
          body={t("data.fixtureNotice", locale)}
        />
        {current && (
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
              value={current.activeUsers}
              sub={current.period}
            />
            <CanvasKPI
              theme={theme}
              label={t("referral.dashboard.kpi.trips", locale)}
              value={current.trips}
              sub={t("referral.usage.currentPeriod", locale)}
            />
            <CanvasKPI
              theme={theme}
              label={t("referral.usage.avgTripsPerUser", locale)}
              value={current.avgTripsPerUser}
              sub={t("referral.usage.currentPeriod", locale)}
            />
          </div>
        )}
        <CanvasCard
          theme={theme}
          title={t("referral.statements.usagePeriods", locale)}
          padding={0}
        >
          <ReferralUsagePeriodsTable rows={usage.periods} />
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title={t("referral.usage.dailyUsage", locale)}
          subtitle={t("referral.usage.dailyUsageSub", locale)}
          padding={0}
          actions={
            <CanvasPill theme={theme} tone="neutral">
              {t("referral.usage.deidentified", locale)}
            </CanvasPill>
          }
        >
          <ReferralUsageDailyTable rows={usage.dailyRows} />
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title={t("referral.usage.tripDetail", locale)}
          subtitle={t("referral.usage.tripDetailSub", locale)}
          padding={0}
        >
          <ReferralTripLinesTable rows={usage.tripRows} />
        </CanvasCard>
      </div>
    </>
  );
}
