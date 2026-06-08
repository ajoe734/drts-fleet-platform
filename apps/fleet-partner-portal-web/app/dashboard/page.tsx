import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadDashboard } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice, SvcChip } from "@/lib/fleet-portal-ui";
import { RecentTripsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDashboardPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const dashboard = await loadDashboard();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>
            <CanvasBtn theme={theme} variant="primary" icon="users">
              {t("dashboard.recruit", locale)}
            </CanvasBtn>
          </>
        }
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
            label="旗下司機數"
            value={dashboard.driverCount}
            sub={dashboard.driverSub}
          />
          <CanvasKPI
            theme={theme}
            label="可接單司機"
            value={dashboard.dispatchable}
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label="本月完成趟次"
            value={dashboard.completedTrips}
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label="本月車行分潤"
            value={dashboard.share}
            delta="待確認"
            deltaTone="neutral"
          />
          <CanvasKPI
            theme={theme}
            label="本月總營收"
            value={dashboard.grossRevenue}
            sub="分潤前"
          />
        </div>

        {dashboard.source === "live" &&
          dashboard.supplementalSource === "fallback" && (
            <DataSourceNotice
              theme={theme}
              source={dashboard.supplementalSource}
              body={t("data.fixtureNotice", locale)}
            />
          )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label="缺件司機"
            value={dashboard.supplemental.missingDocsDrivers}
            delta={dashboard.supplemental.missingDocsDelta}
            deltaTone="down"
          />
          <CanvasKPI
            theme={theme}
            label="事故 / 申訴"
            value={dashboard.supplemental.openCases}
            delta={dashboard.supplemental.openCasesDelta}
            deltaTone="down"
          />
          <CanvasKPI
            theme={theme}
            label="訓練完成率"
            value={dashboard.supplemental.trainingCompletion}
          />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}
        >
          <CanvasCard
            theme={theme}
            title={t("dashboard.attention", locale)}
            subtitle={t("dashboard.attentionSub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dashboard.attention.map((banner) => (
                <CanvasBanner
                  key={banner.title}
                  theme={theme}
                  tone={banner.tone}
                  icon="warn"
                  title={banner.title}
                  body={banner.body}
                />
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("dashboard.supply", locale)}
            subtitle={t("dashboard.supplySub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dashboard.supply.map((r) => (
                <div
                  key={r.svc}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ width: 84 }}>
                    <SvcChip theme={theme} svc={r.svc} />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 7,
                      background: theme.surfaceLo,
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${r.pct}%`,
                        height: "100%",
                        background: theme.accent,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 12,
                      width: 34,
                      textAlign: "right",
                    }}
                  >
                    {r.n}
                  </span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        {dashboard.source === "live" &&
          dashboard.recentTripsSource === "fallback" && (
            <DataSourceNotice
              theme={theme}
              source={dashboard.recentTripsSource}
              body={t("data.fixtureNotice", locale)}
            />
          )}

        <CanvasCard
          theme={theme}
          title={t("dashboard.recentTrips", locale)}
          padding={0}
          actions={
            <CanvasBtn theme={theme} variant="ghost">
              {t("dashboard.gotoTrips", locale)}
            </CanvasBtn>
          }
        >
          <RecentTripsTable rows={dashboard.recentTrips} />
        </CanvasCard>
      </div>
    </>
  );
}
