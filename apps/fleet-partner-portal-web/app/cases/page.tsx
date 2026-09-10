import Link from "next/link";
import { CanvasCard, CanvasPageHeader, CanvasIcon } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadCases } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { CasesTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

interface CasesPageProps {
  searchParams?: Promise<{ tab?: string; q?: string }>;
}

export default async function FleetCasesPage({ searchParams }: CasesPageProps) {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadCases();
  const params = searchParams ? await searchParams : {};
  const activeTabKey = params.tab || "all";

  // Tab counts come from the loaded rows (live, or fixtures through the same
  // seam on fallback) rather than fixed design numbers.
  const fleetCount = rows.filter((r) => r.responsibility === "fleet").length;
  const sharedCount = rows.filter((r) => r.responsibility === "shared").length;
  const closedCount = rows.filter(
    (r) => (r.status as string) === "closed" || (r.status as string) === "resolved",
  ).length;

  const caseTabs = [
    <Link
      key="all"
      href="/cases"
      style={{
        color: activeTabKey === "all" ? theme.accent : theme.textMuted,
        textDecoration: "none",
        fontWeight: activeTabKey === "all" ? 600 : 400,
      }}
    >
      {t("cases.tabAll", locale)} {rows.length}
    </Link>,
    <Link
      key="fleet"
      href="/cases?tab=fleet"
      style={{
        color: activeTabKey === "fleet" ? theme.accent : theme.textMuted,
        textDecoration: "none",
        fontWeight: activeTabKey === "fleet" ? 600 : 400,
      }}
    >
      {t("cases.tabFleet", locale)} {fleetCount}
    </Link>,
    <Link
      key="shared"
      href="/cases?tab=shared"
      style={{
        color: activeTabKey === "shared" ? theme.accent : theme.textMuted,
        textDecoration: "none",
        fontWeight: activeTabKey === "shared" ? 600 : 400,
      }}
    >
      {t("cases.tabShared", locale)} {sharedCount}
    </Link>,
    <Link
      key="closed"
      href="/cases?tab=closed"
      style={{
        color: activeTabKey === "closed" ? theme.accent : theme.textMuted,
        textDecoration: "none",
        fontWeight: activeTabKey === "closed" ? 600 : 400,
      }}
    >
      {t("cases.tabClosed", locale)} {closedCount > 0 ? closedCount : ""}
    </Link>,
  ];

  let filteredRows = rows;
  if (activeTabKey === "fleet") {
    filteredRows = rows.filter((r) => r.responsibility === "fleet");
  } else if (activeTabKey === "shared") {
    filteredRows = rows.filter((r) => r.responsibility === "shared");
  } else if (activeTabKey === "closed") {
    filteredRows = rows.filter(
      (r) => (r.status as string) === "closed" || (r.status as string) === "resolved",
    );
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("cases.title", locale)}
        subtitle={t("cases.subtitle", locale)}
        tabs={caseTabs}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Navigation & Quick Links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>
              案件詳情快捷入口：
            </span>
            <Link
              href="/cases/cmp_0908"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                background: theme.surfaceLo,
                border: `1px solid ${theme.border}`,
                color: theme.accent,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="complaints" size={12} />
              cmp_0908 (車行責任·待回覆)
            </Link>
            <Link
              href="/cases/cmp_0912"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                background: theme.surfaceLo,
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="complaints" size={12} />
              cmp_0912 (平台責任·唯讀)
            </Link>
            <Link
              href="/cases/cmp_closed_001"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                background: theme.surfaceLo,
                border: `1px solid ${theme.border}`,
                color: theme.textDim,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="complaints" size={12} />
              cmp_closed_001 (已結案)
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href="/cases/errors"
              style={{
                color: theme.textMuted,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="warn" size={12} />
              案件錯誤指引
            </Link>
            <span style={{ color: theme.textDim }}>|</span>
            <Link
              href="/cases/access-states"
              style={{
                color: theme.textMuted,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="audit" size={12} />
              附件/歷程讀取狀態
            </Link>
          </div>
        </div>

        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <CanvasCard theme={theme} padding={0}>
          <CasesTable rows={filteredRows} />
        </CanvasCard>
      </div>
    </>
  );
}
