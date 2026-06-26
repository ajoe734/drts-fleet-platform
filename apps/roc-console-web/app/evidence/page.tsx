import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { crossAppHref } from "@/lib/roc-cross-app-links";
import { getRocEvidencePageData } from "@/lib/roc-page-data";
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

export default async function EvidencePage() {
  const locale = await getServerLocale();
  const data = await getRocEvidencePageData(locale);
  const columns: CanvasTableColumn<(typeof data.evidence)[number]>[] = [
    {
      h: t("evidence.columns.id", locale),
      k: "evidenceId",
      w: 170,
      mono: true,
    },
    {
      h: t("evidence.columns.vehicle", locale),
      k: "vehicleId",
      w: 100,
      mono: true,
    },
    { h: t("evidence.columns.summary", locale), k: "summary", w: 320 },
    {
      h: t("evidence.columns.freeze", locale),
      w: 110,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.freezeStatus === "active" ? "danger" : "neutral"}
          dot
        >
          {t(`evidence.freeze.${row.freezeStatus}`, locale)}
        </Pill>
      ),
    },
    {
      h: t("evidence.columns.source", locale),
      w: 230,
      r: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {row.sources.map((source) => (
            <RocEvidenceTag key={source} source={source} locale={locale} />
          ))}
        </div>
      ),
    },
    {
      h: t("common.openInvestigation", locale),
      w: 130,
      r: (row) =>
        row.investigationLink ? (
          <a
            href={crossAppHref(row.investigationLink)}
            target={
              row.investigationLink.openMode === "new_tab"
                ? "_blank"
                : undefined
            }
            rel="noreferrer"
            style={{
              color: rocTheme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {t("common.openInvestigation", locale)}
          </a>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("evidence.title", locale)}
        subtitle={t("evidence.subtitle", locale)}
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
        <Card theme={rocTheme} title={t("evidence.title", locale)} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.evidence} />
        </Card>
        <Card
          theme={rocTheme}
          title={t("actions.freezeRail", locale)}
          subtitle={t("actions.freezeRailSub", locale)}
        >
          <RocActionRail
            items={data.freezeActions}
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
