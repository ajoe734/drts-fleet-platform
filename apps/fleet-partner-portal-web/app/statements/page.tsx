import {
  CanvasActionButton,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  FX_FLEET_STATEMENTS,
  type FleetStatement,
} from "@/lib/fleet-portal-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

// NOTE: `fleet-partner/statements` is the one portal endpoint that already
// exists on the backend. When a fleet-partner-scoped server api-client is
// wired (x-fleet-partner-id), replace FX_FLEET_STATEMENTS with
// `client.listFleetPortalStatements()` — the row shape is compatible.
export default async function FleetStatementsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  const columns: CanvasTableColumn<FleetStatement>[] = [
    {
      h: "STATEMENT",
      k: "id",
      w: 180,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    { h: "PERIOD", k: "period", w: 120, mono: true },
    { h: "TRIPS", k: "trips", w: 110, mono: true, align: "right" },
    { h: "PAYABLE", k: "payable", w: 160, mono: true, align: "right" },
    {
      h: "STATUS",
      w: 150,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "paid" ? "success" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "ISSUED", k: "issued", w: 130, mono: true },
    {
      h: "ACTIONS",
      w: 180,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{ action: "download", enabled: true, riskLevel: "low" }}
            label="下載"
            en="dl"
          />
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "confirm",
              enabled: r.status !== "paid",
              disabledReasonCode: "already_paid",
              riskLevel: "high",
              requiresReason: true,
            }}
            label="確認"
            en="confirm"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("statements.title", locale)}
        subtitle={t("statements.subtitle", locale)}
      />
      <div style={{ padding: 24 }}>
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={columns}
            rows={FX_FLEET_STATEMENTS}
          />
        </CanvasCard>
      </div>
    </>
  );
}
