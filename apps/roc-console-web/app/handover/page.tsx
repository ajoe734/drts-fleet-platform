import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocHandoverPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function HandoverPage() {
  const locale = await getServerLocale();
  const data = await getRocHandoverPageData();

  const columns: CanvasTableColumn<(typeof data.openItems)[number]>[] = [
    { h: t("handover.openItems", locale), k: "title", w: 240 },
    {
      h: t("vehicles.columns.vehicle", locale),
      k: "vehicleId",
      w: 92,
      mono: true,
    },
    {
      h: t("trips.columns.status", locale),
      w: 120,
      r: (row) => (
        <Pill theme={rocTheme} tone={row.tone} dot>
          {row.status}
        </Pill>
      ),
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("handover.title", locale)}
        subtitle={t("handover.subtitle", locale)}
        actions={
          <Btn theme={rocTheme} variant="primary" icon="check">
            {t("handover.action", locale)}
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
          gridTemplateColumns: "1.3fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card
          theme={rocTheme}
          title={t("handover.openItems", locale)}
          padding={0}
        >
          <Table theme={rocTheme} columns={columns} rows={data.openItems} />
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card theme={rocTheme} title={t("handover.summary", locale)}>
            <DL
              theme={rocTheme}
              cols={2}
              items={[
                {
                  k: t("handover.summary.duty", locale),
                  v: data.currentOperatorLabel,
                },
                {
                  k: t("handover.summary.duration", locale),
                  v: "8h",
                  mono: true,
                },
                {
                  k: t("handover.summary.vehicles", locale),
                  v: String(data.overview.activeVehicleCount),
                  mono: true,
                },
                {
                  k: t("handover.summary.takeovers", locale),
                  v: String(data.overview.activeTakeoverCount),
                  mono: true,
                },
                {
                  k: t("handover.summary.alerts", locale),
                  v: String(data.overview.openAlertCount),
                  mono: true,
                },
                {
                  k: t("handover.summary.incidents", locale),
                  v: String(data.overview.criticalAlertCount),
                  mono: true,
                },
              ]}
            />
          </Card>
          <Card theme={rocTheme} title={t("handover.nextOperator", locale)}>
            <DL
              theme={rocTheme}
              cols={1}
              items={[
                {
                  k: t("handover.nextOperator", locale),
                  v: data.nextOperatorLabel,
                },
                { k: t("handover.effective", locale), v: "18:00", mono: true },
              ]}
            />
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                border: `1px solid ${rocTheme.border}`,
                borderRadius: 8,
                minHeight: 56,
                fontSize: 12.5,
                color: rocTheme.textDim,
              }}
            >
              {data.note}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
