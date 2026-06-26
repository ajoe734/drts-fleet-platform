import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocTripsPageData, resolveTripStateKey } from "@/lib/roc-page-data";
import {
  RocRefreshBanner,
  RocStatePill,
} from "@/components/roc-screen-primitives";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

function tripTone(status: string) {
  switch (status) {
    case "monitoring":
      return "success";
    case "takeover_active":
    case "operational_hold":
      return "warn";
    case "human_fallback":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function TripsPage() {
  const locale = await getServerLocale();
  const data = await getRocTripsPageData();

  const columns: CanvasTableColumn<(typeof data.trips)[number]>[] = [
    {
      h: t("trips.columns.trip", locale),
      k: "tripId",
      w: 132,
      mono: true,
      r: (row) => (
        <span style={{ color: rocTheme.accent, fontWeight: 700 }}>
          {row.tripId}
        </span>
      ),
    },
    {
      h: t("trips.columns.vehicle", locale),
      k: "vehicleId",
      w: 96,
      mono: true,
    },
    { h: t("trips.columns.route", locale), k: "routeLabel", w: 160 },
    { h: t("trips.columns.start", locale), k: "startLabel", w: 72, mono: true },
    {
      h: t("trips.columns.distance", locale),
      k: "distanceLabel",
      w: 86,
      mono: true,
    },
    {
      h: t("trips.columns.takeovers", locale),
      w: 80,
      align: "center",
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.takeoverCount > 0 ? "warn" : "neutral"}
        >
          {row.takeoverCount}
        </Pill>
      ),
    },
    {
      h: t("trips.columns.operator", locale),
      k: "safetyOperatorLabel",
      w: 110,
    },
    {
      h: t("trips.columns.status", locale),
      w: 118,
      r: (row) => (
        <RocStatePill
          stateKey={resolveTripStateKey(row)}
          tone={tripTone(row.status)}
          locale={locale}
        />
      ),
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("trips.title", locale)}
        subtitle={t("trips.subtitle", locale)}
        actions={
          <Btn theme={rocTheme} icon="export">
            {t("common.export", locale)}
          </Btn>
        }
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <Card theme={rocTheme} padding={0}>
        <Table theme={rocTheme} columns={columns} rows={data.trips} />
      </Card>
    </div>
  );
}
