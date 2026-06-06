import {
  CanvasActionButton,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { type FleetCase } from "@/lib/fleet-portal-fixtures";
import { loadCases } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetCasesPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadCases();

  // Tab counts come from the loaded rows (live, or fixtures through the same
  // seam on fallback) rather than fixed design numbers. "已結案" has no count in
  // the design header, so it stays a plain label.
  const caseTabs = [
    `${t("cases.tabAll", locale)} ${rows.length}`,
    `${t("cases.tabFleet", locale)} ${rows.filter((r) => r.responsibility === "fleet").length}`,
    `${t("cases.tabShared", locale)} ${rows.filter((r) => r.responsibility === "shared").length}`,
    t("cases.tabClosed", locale),
  ];

  const columns: CanvasTableColumn<FleetCase>[] = [
    {
      h: "CASE",
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    {
      h: "TYPE",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.type === "incident" ? "danger" : "warn"}
        >
          {r.type}
        </CanvasPill>
      ),
    },
    { h: "CATEGORY", k: "cat", w: 150, mono: true },
    { h: "DRIVER", k: "driver", w: 100 },
    {
      h: "SEV",
      w: 90,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.severity === "high"
              ? "danger"
              : r.severity === "medium"
                ? "warn"
                : "neutral"
          }
          dot
        >
          {r.severity}
        </CanvasPill>
      ),
    },
    {
      h: "責任歸屬 · responsibility",
      w: 150,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.responsibility === "fleet"
              ? "danger"
              : r.responsibility === "shared"
                ? "warn"
                : "neutral"
          }
          dot
        >
          {r.responsibility}
        </CanvasPill>
      ),
    },
    {
      h: "SLA",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.sla === "breached" ? "danger" : "success"}
          dot
        >
          {r.sla}
        </CanvasPill>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "in_review" ? "info" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (r) => (
        <CanvasActionButton
          theme={theme}
          size="xs"
          descriptor={{
            action: "respond",
            enabled: r.responsibility !== "platform",
            disabledReasonCode: "platform_owned",
            riskLevel: "medium",
          }}
          label="回覆處理"
          en="respond"
        />
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("cases.title", locale)}
        subtitle={t("cases.subtitle", locale)}
        tabs={caseTabs}
        activeTab={caseTabs[0]}
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
