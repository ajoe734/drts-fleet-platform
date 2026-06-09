import { CanvasCard, CanvasKPI, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadQuality } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetQualityPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { metrics, source } = await loadQuality();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("quality.title", locale)}
        subtitle={t("quality.subtitle", locale)}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {metrics.map((q) => (
            <CanvasKPI
              key={q.en}
              theme={theme}
              label={t(`quality.metric.${q.en}`, locale)}
              value={q.v}
              delta={q.delta}
              deltaTone={
                q.tone === "success"
                  ? "up"
                  : q.tone === "warn"
                    ? "down"
                    : "neutral"
              }
            />
          ))}
        </div>
        <CanvasCard theme={theme} title={t("quality.responsibility", locale)}>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.7,
            }}
          >
            <li>{t("quality.note.1", locale)}</li>
            <li>{t("quality.note.2", locale)}</li>
            <li>{t("quality.note.3", locale)}</li>
            <li>{t("quality.note.4", locale)}</li>
          </ol>
        </CanvasCard>
      </div>
    </>
  );
}
