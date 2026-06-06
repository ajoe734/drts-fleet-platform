import { CanvasCard, CanvasKPI, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadTraining } from "@/lib/fleet-portal-data.server";
import { BiLabel, DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetTrainingPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, summary, source } = await loadTraining();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("training.title", locale)}
        subtitle={t("training.subtitle", locale)}
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
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label="整體完成率"
            value={summary.completionPct}
          />
          <CanvasKPI
            theme={theme}
            label="待完成人次"
            value={summary.pendingHeadcount}
          />
          <CanvasKPI
            theme={theme}
            label="逾期未完成"
            value={summary.overdueIncomplete}
            delta="影響派工"
            deltaTone="down"
          />
        </div>
        <CanvasCard theme={theme} title={t("training.courses", locale)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((c) => (
              <div key={c.en}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 6,
                  }}
                >
                  <BiLabel theme={theme} zh={c.course} en={c.en} />
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 12,
                      color: theme.textMuted,
                    }}
                  >
                    {c.completed} / {c.total} · {c.pct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: theme.surfaceLo,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${c.pct}%`,
                      height: "100%",
                      background:
                        c.pct >= 90
                          ? theme.success
                          : c.pct >= 70
                            ? theme.accent
                            : theme.warn,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CanvasCard>
      </div>
    </>
  );
}
