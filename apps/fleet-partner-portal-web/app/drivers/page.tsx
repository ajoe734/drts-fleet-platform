import Link from "next/link";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  computeDriverTabCounts,
  filterDriversForTab,
  loadDrivers,
  scopeDriverRows,
} from "@/lib/fleet-portal-data.server";
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
  const {
    rows,
    source,
    error,
    docsAvailable = source === "fallback",
    trainingAvailable = source === "fallback",
  } = await loadDrivers();

  const activeTabKey = params.tab || "all";

  // Filter rows by query criteria first, ensuring tab counts reflect active scope
  const scopedRows = scopeDriverRows(rows, { q: params.q });
  const tabCounts = computeDriverTabCounts(scopedRows, {
    docsAvailable,
    trainingAvailable,
  });
  const filteredRows = filterDriversForTab(scopedRows, activeTabKey, {
    docsAvailable,
    trainingAvailable,
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
        {activeTabKey === "trainingIncomplete" && !trainingAvailable ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="warn"
            title={t("drivers.tabTrainingIncomplete", locale)}
            body={
              locale === "zh"
                ? "駕駛教育訓練資料尚未串接後端 API，目前欄位標記為未串接，不以假資料篩選排除人員。"
                : "Driver training status is not yet integrated with the fleet API. Showing drivers without assuming completed training."
            }
          />
        ) : null}
        {activeTabKey === "missingDocs" && !docsAvailable ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="warn"
            title={t("drivers.tabMissingDocs", locale)}
            body={
              locale === "zh"
                ? "駕駛文件審查資料尚未串接後端 API，目前欄位標記為未串接，不以假資料篩選排除人員。"
                : "Driver document review is not yet integrated with the fleet API. Showing drivers without assuming complete documents."
            }
          />
        ) : null}
        <form
          method="GET"
          action="/drivers"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {activeTabKey !== "all" ? (
            <input type="hidden" name="tab" value={activeTabKey} />
          ) : null}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={t("common.search", locale)}
            aria-label={t("common.search", locale)}
            style={{
              flex: 1,
              maxWidth: 320,
              padding: "6px 12px",
              borderRadius: 7,
              border: `1px solid ${theme.border}`,
              background: theme.bgRaised,
              color: theme.text,
              fontSize: 12.5,
              fontFamily: theme.fontFamily,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <CanvasBtn type="submit" theme={theme} size="sm" icon="search">
            {t("common.filter", locale)}
          </CanvasBtn>
        </form>
        <CanvasCard theme={theme} padding={0}>
          {filteredRows.length > 0 ? (
            <DriversTable rows={filteredRows as any} />
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
