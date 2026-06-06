import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  FX_FLEET_DRIVERS,
  type FleetDriver,
} from "@/lib/fleet-portal-fixtures";
import { SvcChips } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDriversPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  const columns: CanvasTableColumn<FleetDriver>[] = [
    {
      h: "DRIVER",
      w: 170,
      r: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div
            style={{
              fontSize: 11,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.id} · {r.plate}
          </div>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "available"
              ? "success"
              : r.status === "on_trip"
                ? "info"
                : r.status === "break"
                  ? "warn"
                  : "neutral"
          }
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "可接服務 · service eligibility",
      w: 280,
      r: (r) => <SvcChips theme={theme} list={r.svc} />,
    },
    {
      h: "LICENSE",
      w: 120,
      r: (r) =>
        r.license === "valid" ? (
          <CanvasPill theme={theme} tone="success">
            valid
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.license}
          </CanvasPill>
        ),
    },
    {
      h: "DOCS",
      w: 110,
      r: (r) =>
        r.docs === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            complete
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.docs}
          </CanvasPill>
        ),
    },
    {
      h: "TRAINING",
      w: 110,
      r: (r) =>
        r.training === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            complete
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.training}
          </CanvasPill>
        ),
    },
    { h: "30天趟次", k: "trips30", w: 90, mono: true, align: "right" },
    { h: "評分", k: "rating", w: 70, mono: true, align: "right" },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale)}
        tabs={["全部 128", "可接單 96", "缺件 7", "訓練未完成 12"]}
        activeTab="全部 128"
        actions={
          <CanvasBtn theme={theme} variant="primary" icon="users">
            {t("dashboard.recruit", locale)}
          </CanvasBtn>
        }
      />
      <div style={{ padding: 24 }}>
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={columns}
            rows={FX_FLEET_DRIVERS}
          />
        </CanvasCard>
      </div>
    </>
  );
}
