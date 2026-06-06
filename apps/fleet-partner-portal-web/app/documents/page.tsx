import {
  CanvasActionButton,
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { type FleetDoc } from "@/lib/fleet-portal-fixtures";
import { loadDocuments } from "@/lib/fleet-portal-data.server";
import { BiLabel, DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDocumentsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadDocuments();

  // Tab counts come from the loaded rows (live, or fixtures through the same
  // seam on fallback) rather than fixed design numbers. Every tracked document
  // row needs handling, so "需處理" is the full row count; "全部" is a plain
  // label without a count, matching the design header.
  const docTabs = [
    `${t("documents.tabTodo", locale)} ${rows.length}`,
    t("documents.tabAll", locale),
    `${t("documents.tabFleet", locale)} ${rows.filter((r) => r.owner === "fleet").length}`,
    `${t("documents.tabDriver", locale)} ${rows.filter((r) => r.owner === "driver").length}`,
  ];

  const columns: CanvasTableColumn<FleetDoc>[] = [
    {
      h: "DRIVER",
      w: 150,
      r: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.driver}</div>
          <div
            style={{
              fontSize: 11,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.id}
          </div>
        </div>
      ),
    },
    {
      h: "DOCUMENT",
      w: 220,
      r: (r) => <BiLabel theme={theme} zh={r.doc} en={r.en} />,
    },
    {
      h: "STATUS",
      w: 160,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "missing"
              ? "danger"
              : r.status === "pending_signature"
                ? "info"
                : "warn"
          }
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "DUE", k: "due", w: 130, mono: true },
    {
      h: "OWNER",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.owner === "fleet" ? "accent" : "neutral"}
        >
          {r.owner}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 200,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{ action: "remind", enabled: true, riskLevel: "low" }}
            label="提醒司機"
            en="remind"
          />
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "upload",
              enabled: r.owner === "fleet",
              disabledReasonCode: "driver_owned",
              riskLevel: "medium",
            }}
            label="上傳"
            en="upload"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("documents.title", locale)}
        subtitle={t("documents.subtitle", locale)}
        tabs={docTabs}
        activeTab={docTabs[0]}
      />
      <div style={{ padding: 24 }}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={t("documents.warnTitle", locale)}
          body={t("documents.warnBody", locale)}
        />
        <div style={{ height: 12 }} />
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <div style={{ height: 12 }} />
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={columns} rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
