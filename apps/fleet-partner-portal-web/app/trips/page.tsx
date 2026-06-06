import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { type FleetTrip } from "@/lib/fleet-portal-fixtures";
import { loadTrips } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice, SvcChip } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetTripsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadTrips();

  const columns: CanvasTableColumn<FleetTrip>[] = [
    {
      h: "ORDER",
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    { h: "SERVICE", w: 120, r: (r) => <SvcChip theme={theme} svc={r.svc} /> },
    { h: "DRIVER", k: "driver", w: 100 },
    { h: "TENANT", k: "tenant", w: 130, mono: true },
    { h: "PICKUP", k: "pickup", w: 220 },
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
    { h: "DATE", k: "date", w: 110, mono: true },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("trips.title", locale)}
        subtitle={t("trips.subtitle", locale)}
        tabs={[
          "全部",
          "即時叫車",
          "商務派車",
          "機場接送",
          "保險代步",
          "旅行社接送",
        ]}
        activeTab="全部"
        actions={
          <CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={columns} rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
