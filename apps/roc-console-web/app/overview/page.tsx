import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  getRocOverviewPageData,
  resolveVehicleStateKey,
  resolveVehicleStateTone,
} from "@/lib/roc-page-data";
import {
  RocAlertMiniList,
  RocDualFreshness,
  RocRefreshBanner,
  RocStatePill,
} from "@/components/roc-screen-primitives";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function OverviewPage() {
  const locale = await getServerLocale();
  const data = await getRocOverviewPageData();

  const vehicleColumns: CanvasTableColumn<(typeof data.vehicles)[number]>[] = [
    {
      h: t("vehicles.columns.vehicle", locale),
      k: "vehicleId",
      w: 96,
      mono: true,
      r: (row) => (
        <span style={{ color: rocTheme.accent, fontWeight: 700 }}>
          {row.vehicleId}
        </span>
      ),
    },
    {
      h: t("vehicles.columns.state", locale),
      w: 110,
      r: (row) => (
        <RocStatePill
          stateKey={resolveVehicleStateKey(row)}
          tone={resolveVehicleStateTone(row)}
          locale={locale}
        />
      ),
    },
    { h: t("common.area", locale), k: "areaLabel", w: 96 },
    {
      h: t("freshness.telemetry", locale),
      w: 134,
      r: (row) => (
        <RocDualFreshness
          telemetry={row.telemetryFreshness}
          regulatory={row.regulatoryFreshness}
          locale={locale}
          compact
        />
      ),
    },
    {
      h: t("vehicles.columns.operator", locale),
      k: "safetyOperatorLabel",
      w: 110,
    },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        theme={rocTheme}
        title={t("overview.title", locale)}
        subtitle={t("overview.subtitle", locale)}
        meta={
          <>
            <Pill theme={rocTheme} tone="accent" dot>
              {t("overview.meta.monitoring", locale)}
            </Pill>
            <Pill theme={rocTheme} tone="neutral">
              {t("overview.meta.policy", locale)}
            </Pill>
          </>
        }
        actions={
          <Btn theme={rocTheme} icon="export">
            {t("overview.action.log", locale)}
          </Btn>
        }
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <KPI
          theme={rocTheme}
          label={t("overview.kpi.vehicles", locale)}
          value={String(data.overview.activeVehicleCount)}
          sub={t("overview.kpi.vehiclesSub", locale)}
        />
        <KPI
          theme={rocTheme}
          label={t("overview.kpi.autonomous", locale)}
          value={String(
            data.vehicles.filter((vehicle) => vehicle.autonomyState === "fsd_engaged")
              .length,
          )}
          sub={t("overview.kpi.autonomousSub", locale)}
        />
        <KPI
          theme={rocTheme}
          label={t("overview.kpi.takeovers", locale)}
          value={String(data.overview.activeTakeoverCount)}
          sub={t("overview.kpi.takeoversSub", locale)}
        />
        <KPI
          theme={rocTheme}
          label={t("overview.kpi.alerts", locale)}
          value={String(data.overview.openAlertCount)}
          sub={t("overview.kpi.alertsSub", locale)}
        />
        <KPI
          theme={rocTheme}
          label={t("overview.kpi.incidents", locale)}
          value={String(data.overview.criticalAlertCount)}
          sub={t("overview.kpi.incidentsSub", locale)}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card
          theme={rocTheme}
          title={t("overview.activeVehicles", locale)}
          subtitle={t("overview.activeVehiclesSub", locale)}
          padding={0}
        >
          <Table
            theme={rocTheme}
            columns={vehicleColumns}
            rows={data.vehicles}
          />
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={rocTheme}
            title={t("overview.recentAlerts", locale)}
            actions={
              <Pill theme={rocTheme} tone="warn">
                {data.overview.openAlertCount}
              </Pill>
            }
            padding={0}
          >
            <RocAlertMiniList alerts={data.alerts} locale={locale} />
          </Card>
          <Card theme={rocTheme} title={t("overview.boundaries", locale)}>
            <Banner
              theme={rocTheme}
              tone="neutral"
              icon="lock"
              body={t("overview.boundariesBody", locale)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
