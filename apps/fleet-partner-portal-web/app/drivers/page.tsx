import Link from "next/link";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadDrivers } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { DriversTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDriversPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; q?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source, error } = await loadDrivers();

  const activeTabKey = params.tab || "all";

  const tabCounts = {
    all: rows.length,
    available: rows.filter((r) => r.status === "available").length,
    missingDocs: rows.filter(
      (r) => r.docs !== "complete" || r.license !== "valid",
    ).length,
    trainingIncomplete: rows.filter((r) => r.training !== "complete").length,
  };

  const filteredRows = rows.filter((r) => {
    if (activeTabKey === "available" && r.status !== "available") {
      return false;
    }
    if (
      activeTabKey === "missingDocs" &&
      r.docs === "complete" &&
      r.license === "valid"
    ) {
      return false;
    }
    if (activeTabKey === "trainingIncomplete" && r.training === "complete") {
      return false;
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      const match =
        r.name.toLowerCase().includes(q) ||
        r.plate.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      if (!match) {
        return false;
      }
    }
    return true;
  });

  const tabDefs = [
    { id: "all", label: t("drivers.tabAll", locale), count: tabCounts.all },
    {
      id: "available",
      label: t("drivers.tabAvailable", locale),
      count: tabCounts.available,
    },
    {
      id: "missingDocs",
      label: t("drivers.tabMissingDocs", locale),
      count: tabCounts.missingDocs,
    },
    {
      id: "trainingIncomplete",
      label: t("drivers.tabTrainingIncomplete", locale),
      count: tabCounts.trainingIncomplete,
    },
  ];

  const tabs = tabDefs.map((tab) => {
    const isSelected = activeTabKey === tab.id;
    const query = new URLSearchParams();
    if (tab.id !== "all") query.set("tab", tab.id);
    if (params.q) query.set("q", params.q);
    const href = query.toString() ? `?${query.toString()}` : "/drivers";

    return (
      <Link
        key={tab.id}
        href={href}
        style={{
          textDecoration: "none",
          color: isSelected ? theme.text : theme.textMuted,
          fontWeight: isSelected ? 600 : 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{tab.label}</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: theme.monoFamily,
            opacity: isSelected ? 1 : 0.7,
          }}
        >
          {tab.count}
        </span>
      </Link>
    );
  });

  const activeTabIndex = tabDefs.findIndex((t) => t.id === activeTabKey);
  const activeTab = tabs[activeTabIndex >= 0 ? activeTabIndex : 0];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale)}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <Link href="/supply/drivers/new" style={{ textDecoration: "none" }}>
            <CanvasBtn theme={theme} variant="primary" icon="users">
              {t("dashboard.recruit", locale)}
            </CanvasBtn>
          </Link>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("shell.api.down", locale)}
            body={error}
          />
        ) : null}
        {!error && source === "fallback" ? (
          <DataSourceNotice
            theme={theme}
            source={source}
            body={t("data.fixtureNotice", locale)}
          />
        ) : null}
        <CanvasCard theme={theme} padding={0}>
          {filteredRows.length > 0 ? (
            <DriversTable rows={filteredRows} />
          ) : (
            <div
              style={{
                padding: "36px 24px",
                textAlign: "center",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("supply.empty.none", locale)}
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
