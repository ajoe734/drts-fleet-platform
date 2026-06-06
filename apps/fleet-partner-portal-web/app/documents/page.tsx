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
import { FX_FLEET_DOCS, type FleetDoc } from "@/lib/fleet-portal-fixtures";
import { BiLabel } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDocumentsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

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
        tabs={["需處理 4", "全部", "車行責任 3", "司機責任 1"]}
        activeTab="需處理 4"
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
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={columns} rows={FX_FLEET_DOCS} />
        </CanvasCard>
      </div>
    </>
  );
}
