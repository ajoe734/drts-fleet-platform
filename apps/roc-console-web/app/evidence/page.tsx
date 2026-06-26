import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocFreezeStatusTone,
} from "@/components/roc-response-surfaces";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import { getRocEvidencePageData } from "@/lib/roc-page-data";
import { getServerLocale } from "@/lib/server-locale";
import { rocTheme } from "@/lib/roc-theme";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
} from "@drts/ui-web";

export default async function EvidencePage() {
  const locale = await getServerLocale();
  const data = await getRocEvidencePageData();

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
        data.evidence.map((item) => (
          <Card
            key={item.evidenceId}
            theme={rocTheme}
            title={`${item.evidenceId} · ${item.vehicleId}`}
            subtitle={item.summary}
            actions={
              <RocStatusPill tone={rocFreezeStatusTone(item.freezeStatus)}>
                {t(`evidence.freeze.${item.freezeStatus}`, locale)}
              </RocStatusPill>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.sources.map((source) => (
                  <RocEvidenceTag
                    key={source}
                    source={source}
                    locale={locale}
                  />
                ))}
              </div>
              <RocInvestigationLink
                link={item.investigationLink}
                locale={locale}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
