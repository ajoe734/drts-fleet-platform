import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  loadStatementDetail,
  type StatementDetailLine,
} from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { trStatements } from "../translations";

export const dynamic = "force-dynamic";

interface StatementDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StatementDetailPage({
  params,
}: StatementDetailPageProps) {
  const { id } = await params;
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { statement, source } = await loadStatementDetail(id);

  if (!statement) {
    // Covers both "does not exist" and "belongs to another fleet partner" —
    // the portal endpoint only ever returns statements scoped to the caller,
    // so an id outside that set is denied by construction, not leaked as a
    // 200 with someone else's data (SR-FLEET-SETTLE-001 acceptance: 跨車行拒絕).
    notFound();
  }

  const columns: CanvasTableColumn<StatementDetailLine>[] = [
    { h: trStatements("statements.column.formula", locale), k: "formula", w: 160 },
    {
      h: trStatements("statements.column.order", locale),
      k: "orderId",
      w: 160,
      mono: true,
      r: (r) => r.orderId ?? "—",
    },
    {
      h: trStatements("statements.column.driver", locale),
      k: "driverId",
      w: 140,
      mono: true,
      r: (r) => r.driverId ?? "—",
    },
    {
      h: trStatements("statements.column.grossEarning", locale),
      w: 130,
      mono: true,
      align: "right",
      r: (r) => r.grossEarning ?? "—",
    },
    {
      h: trStatements("statements.column.driverNet", locale),
      w: 130,
      mono: true,
      align: "right",
      r: (r) => r.driverNetAmount ?? "—",
    },
    {
      h: trStatements("statements.column.share", locale),
      k: "shareAmount",
      w: 130,
      mono: true,
      align: "right",
    },
    {
      h: trStatements("statements.column.sponsorFunded", locale),
      w: 110,
      r: (r) =>
        r.sponsorFunded ? (
          <CanvasPill theme={theme} tone="accent">
            {trStatements("statements.column.sponsorFunded", locale)}
          </CanvasPill>
        ) : (
          "—"
        ),
    },
    {
      h: trStatements("statements.column.completedAt", locale),
      w: 160,
      mono: true,
      r: (r) => r.completedAt ?? "—",
    },
  ];

  return (
    <>
      <div
        style={{
          padding: "16px 24px 0",
          fontSize: 12,
          color: theme.textMuted,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Link
          href="/statements"
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {t("statements.title", locale)}
        </Link>
        <span style={{ color: theme.textDim }}>/</span>
        <span style={{ color: theme.text }}>{statement.id}</span>
      </div>
      <CanvasPageHeader
        theme={theme}
        title={`${trStatements("statements.detail.title", locale)} · ${statement.id}`}
        subtitle={statement.period}
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
        <CanvasCard
          theme={theme}
          title={trStatements("statements.detail.summaryTitle", locale)}
        >
          <CanvasDL
            theme={theme}
            cols={2}
            items={[
              {
                k: trStatements("statements.column.period", locale),
                v: statement.period,
                mono: true,
              },
              {
                k: trStatements("statements.column.status", locale),
                v: statement.status,
                mono: true,
              },
              {
                k: trStatements("statements.column.trips", locale),
                v: String(statement.trips),
                mono: true,
              },
              {
                k: trStatements("statements.column.payable", locale),
                v: statement.payable,
                mono: true,
              },
              {
                k: trStatements("statements.column.reimbursement", locale),
                v: statement.reimbursement ?? "—",
                mono: true,
              },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <Link
              href={`/statements/export?statementId=${encodeURIComponent(statement.id)}`}
              style={{
                color: theme.accent,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              {trStatements("statements.detail.exportOne", locale)}
            </Link>
          </div>
        </CanvasCard>

        <CanvasBanner
          theme={theme}
          tone="info"
          icon="notices"
          body={trStatements(
            "statements.detail.confirmDisputeUnavailable",
            locale,
          )}
        />

        <CanvasCard
          theme={theme}
          title={trStatements("statements.detail.linesTitle", locale)}
          padding={0}
        >
          {statement.lines.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: theme.textDim }}>
              {trStatements("statements.detail.noLines", locale)}
            </div>
          ) : (
            <CanvasTable theme={theme} columns={columns} rows={statement.lines} />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
