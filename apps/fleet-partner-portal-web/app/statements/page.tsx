import Link from "next/link";
import { CanvasCard, CanvasEmptyState, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { getServerFleetPartnerClient } from "@/lib/api-client.server";
import { loadStatements } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { StatementsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { trStatements } from "./translations";

export const dynamic = "force-dynamic";

export default async function FleetStatementsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const [{ rows, source }, { fleetPartnerId }] = await Promise.all([
    loadStatements(),
    getServerFleetPartnerClient(),
  ]);
  // A reachable endpoint returning zero rows is legitimate zero data, not a
  // generation failure — render an honest empty state instead of an empty
  // table with no explanation (SR-FLEET-SETTLE-001 / R13).
  const isLegitimatelyEmpty = source === "live" && rows.length === 0;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("statements.title", locale)}
        subtitle={t("statements.subtitle", locale)}
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
        {isLegitimatelyEmpty ? (
          <CanvasCard theme={theme}>
            <CanvasEmptyState
              theme={theme}
              tone="neutral"
              title={trStatements("statements.empty.title", locale)}
              body={trStatements("statements.empty.body", locale)}
            />
          </CanvasCard>
        ) : (
          <>
            <CanvasCard theme={theme} padding={0}>
              <StatementsTable fleetPartnerId={fleetPartnerId} rows={rows} />
            </CanvasCard>
            <CanvasCard
              theme={theme}
              title={trStatements("statements.detail.linkList", locale)}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/statements/${encodeURIComponent(row.id)}`}
                    style={{ color: theme.accent, textDecoration: "none" }}
                  >
                    {row.id} · {row.period}
                  </Link>
                ))}
                <Link
                  href="/statements/export"
                  style={{
                    marginTop: 8,
                    color: theme.accent,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {trStatements("statements.detail.exportAll", locale)}
                </Link>
              </div>
            </CanvasCard>
          </>
        )}
      </div>
    </>
  );
}
