import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocEvidencePageData } from "@/lib/roc-page-data";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocFreezeStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function EvidencePage() {
  const locale = await getServerLocale();
  const data = await getRocEvidencePageData();

  const columns: CanvasTableColumn<(typeof data.evidence)[number]>[] = [
    {
      h: t("evidence.columns.id", locale),
      k: "evidenceId",
      w: 180,
      mono: true,
    },
    {
      h: t("evidence.columns.vehicle", locale),
      k: "vehicleId",
      w: 92,
      mono: true,
    },
    { h: t("evidence.columns.summary", locale), k: "summary", w: 340 },
    {
      h: t("evidence.columns.freeze", locale),
      w: 120,
      r: (row) => (
        <RocStatusPill tone={rocFreezeStatusTone(row.freezeStatus)}>
          {t(`evidence.freeze.${row.freezeStatus}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: t("evidence.columns.source", locale),
      w: 220,
      r: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {row.sources.map((source) => (
            <RocEvidenceTag
              key={`${row.evidenceId}:${source}`}
              source={source}
              locale={locale}
            />
          ))}
        </div>
      ),
    },
    {
      h: t("common.openInvestigation", locale),
      w: 132,
      r: (row) => (
        <RocInvestigationLink
          link={row.investigationLink ?? null}
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
        title={t("evidence.title", locale)}
        subtitle={t("evidence.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <RocGuardrail
        title={t("evidence.guardrailTitle", locale)}
        body={t("evidence.guardrailBody", locale)}
      />
      {data.evidence.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("evidence.title", locale)}
        />
      ) : (
        <Card theme={rocTheme} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.evidence} />
        </Card>
      )}
    </div>
  );
}
