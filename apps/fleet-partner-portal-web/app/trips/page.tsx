import Link from "next/link";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadTrips } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { TripsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetTripsPage({
  searchParams,
}: {
  searchParams?: Promise<{ svc?: string; period?: string; q?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source, error } = await loadTrips(params.period);

  const currentSvc = params.svc && params.svc !== "all" ? params.svc : "all";

  const tabDefs = [
    { id: "all", label: t("trips.tabAll", locale), count: rows.length },
    {
      id: "realtime",
      label: t("service.realtime", locale),
      count: rows.filter((r) => r.svc === "realtime").length,
    },
    {
      id: "business",
      label: t("service.business", locale),
      count: rows.filter((r) => r.svc === "business").length,
    },
    {
      id: "airport",
      label: t("service.airport", locale),
      count: rows.filter((r) => r.svc === "airport").length,
    },
    {
      id: "insurance",
      label: t("service.insurance", locale),
      count: rows.filter((r) => r.svc === "insurance").length,
    },
    {
      id: "travel",
      label: t("service.travel", locale),
      count: rows.filter((r) => r.svc === "travel").length,
    },
  ];

  const filteredRows = rows.filter((r) => {
    if (currentSvc !== "all" && r.svc !== currentSvc) {
      return false;
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      const match =
        r.id.toLowerCase().includes(q) ||
        r.driver.toLowerCase().includes(q) ||
        r.pickup.toLowerCase().includes(q);
      if (!match) {
        return false;
      }
    }
    return true;
  });

  const tabs = tabDefs.map((tab) => {
    const isSelected = currentSvc === tab.id;
    const query = new URLSearchParams();
    if (tab.id !== "all") query.set("svc", tab.id);
    if (params.period) query.set("period", params.period);
    if (params.q) query.set("q", params.q);
    const href = query.toString() ? `?${query.toString()}` : "/trips";

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

  const activeTabIndex = tabDefs.findIndex((t) => t.id === currentSvc);
  const activeTab = tabs[activeTabIndex >= 0 ? activeTabIndex : 0];

  const exportQuery = new URLSearchParams();
  if (currentSvc !== "all") exportQuery.set("svc", currentSvc);
  if (params.period) exportQuery.set("period", params.period);
  if (params.q) exportQuery.set("q", params.q);
  const exportHref = `/trips/export?${exportQuery.toString()}`;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("trips.title", locale)}
        subtitle={t("trips.subtitle", locale)}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <a href={exportHref} download style={{ textDecoration: "none" }}>
            <CanvasBtn theme={theme} icon="export">
              {t("common.export", locale)}
            </CanvasBtn>
          </a>
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
        <form
          method="GET"
          action="/trips"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {currentSvc !== "all" ? (
            <input type="hidden" name="svc" value={currentSvc} />
          ) : null}
          {params.period ? (
            <input type="hidden" name="period" value={params.period} />
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
            <TripsTable rows={filteredRows} />
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
