import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  buildSupportedAlertActionItems,
  formatShortTime,
  getRocTakeoverPageData,
} from "@/lib/roc-page-data";
import { RocActionRail } from "@/components/roc-action-rail";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function AlertsPage() {
  const locale = await getServerLocale();
  const data = await getRocTakeoverPageData();
  const actionItems = buildSupportedAlertActionItems(data.alerts, locale);
  const columns: CanvasTableColumn<(typeof data.alerts)[number]>[] = [
    { h: t("alerts.columns.alert", locale), k: "title", w: 240 },
    {
      h: t("alerts.columns.vehicle", locale),
      k: "vehicleId",
      w: 100,
      mono: true,
    },
    {
      h: t("alerts.columns.severity", locale),
      w: 100,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.severity === "critical" ? "danger" : "warn"}
          dot
        >
          {row.severity}
        </Pill>
      ),
    },
    {
      h: t("alerts.columns.source", locale),
      w: 150,
      r: (row) => <RocEvidenceTag source={row.source} locale={locale} />,
    },
    {
      h: t("alerts.columns.status", locale),
      w: 120,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.status === "resolved" ? "success" : "warn"}
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    {
      h: t("alerts.columns.updated", locale),
      w: 90,
      r: (row) => formatShortTime(row.updatedAt, locale),
    },
    {
      h: t("alerts.columns.actions", locale),
      w: 140,
      r: (row) => (
        <span style={{ fontFamily: rocTheme.monoFamily, fontSize: 11 }}>
          {row.availableActions.length}
        </span>
      ),
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("alerts.title", locale)}
        subtitle={t("alerts.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card theme={rocTheme} title={t("alerts.title", locale)} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.alerts} />
        </Card>
        <Card
          theme={rocTheme}
          title={t("alerts.actionRail", locale)}
          subtitle={t("alerts.actionRailSub", locale)}
        >
          <RocActionRail
            items={actionItems}
            labels={{
              invoke: t("actions.invoke", locale),
              pending: t("actions.pending", locale),
              tracking: t("actions.tracking", locale),
              audit: t("actions.audit", locale),
              disabled: t("actions.disabled", locale),
              failed: t("actions.failed", locale),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
