import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  buildSupportedAlertActionItems,
  formatShortTime,
  getRocTakeoverPageData,
} from "@/lib/roc-page-data";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import { RocActionRail } from "@/components/roc-action-rail";
import {
  RocResponseEmptyState,
  RocStatusPill,
  rocAlertSeverityTone,
  rocAlertStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function AlertsPage() {
  const locale = await getServerLocale();
  const data = await getRocTakeoverPageData();
  const actionItems = buildSupportedAlertActionItems(data.alerts, locale);

  const columns: CanvasTableColumn<(typeof data.alerts)[number]>[] = [
    {
      h: t("alerts.columns.alert", locale),
      w: 260,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: rocTheme.text, fontWeight: 700 }}>
            {row.title}
          </span>
          <span style={{ color: rocTheme.textMuted, fontSize: 11.5 }}>
            {row.summary}
          </span>
        </div>
      ),
    },
    {
      h: t("alerts.columns.vehicle", locale),
      w: 96,
      mono: true,
      r: (row) => row.vehicleId ?? t("common.none", locale),
    },
    {
      h: t("alerts.columns.severity", locale),
      w: 100,
      r: (row) => (
        <RocStatusPill tone={rocAlertSeverityTone(row.severity)}>
          {t(`alerts.severity.${row.severity}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: t("alerts.columns.source", locale),
      w: 130,
      r: (row) => <RocEvidenceTag source={row.source} locale={locale} />,
    },
    {
      h: t("alerts.columns.status", locale),
      w: 110,
      r: (row) => (
        <RocStatusPill tone={rocAlertStatusTone(row.status)}>
          {t(`alerts.status.${row.status}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: t("alerts.columns.updated", locale),
      w: 88,
      mono: true,
      r: (row) => formatShortTime(row.updatedAt, locale),
    },
    {
      h: t("alerts.columns.actions", locale),
      w: 110,
      r: (row) => String(row.availableActions.length),
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
      {data.alerts.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("alerts.title", locale)}
        />
      ) : (
        <Card theme={rocTheme} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.alerts} />
        </Card>
      )}
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
  );
}
