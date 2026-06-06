import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { type FleetTrip } from "@/lib/fleet-portal-fixtures";
import { loadDashboard } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice, SvcChip } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDashboardPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const dashboard = await loadDashboard();

  const tripColumns: CanvasTableColumn<FleetTrip>[] = [
    { h: "ORDER", k: "id", w: 110, mono: true },
    { h: "SERVICE", w: 120, r: (r) => <SvcChip theme={theme} svc={r.svc} /> },
    { h: "DRIVER", k: "driver", w: 100 },
    { h: "TENANT", k: "tenant", w: 130, mono: true },
    { h: "FARE", k: "fare", w: 110, mono: true, align: "right" },
    { h: "車行分潤", k: "commission", w: 110, mono: true, align: "right" },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "completed"
              ? "success"
              : r.status === "cancelled"
                ? "danger"
                : "info"
          }
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
  ];

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

        {/* Supplemental KPIs / attention / supply have no endpoint yet, so mark
            them as design data whenever the headline KPIs are live (when the
            headline is itself fallback, the top notice already covers them). */}
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

        {/* The recent-trips strip loads from its own endpoint and can fall back
            to fixtures while the headline KPIs are live; mark it as design data
            in that case (when the headline is itself fallback, the top notice
            already covers it). */}
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
          <CanvasTable
            theme={theme}
            columns={tripColumns}
            rows={dashboard.recentTrips}
          />
        </CanvasCard>
      </div>
    </>
  );
}
