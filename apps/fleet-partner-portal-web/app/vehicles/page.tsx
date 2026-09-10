import Link from "next/link";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadVehicles } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { VehiclesTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetVehiclesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; q?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source, error } = await loadVehicles();

  const activeTabKey = params.tab || "all";

  const tabCounts = {
    all: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    maintenance: rows.filter((r) => r.status === "maintenance").length,
    insuranceValid: rows.filter((r) => r.insurance === "valid").length,
  };

  const filteredRows = rows.filter((r) => {
    if (activeTabKey === "active" && r.status !== "active") {
      return false;
    }
    if (activeTabKey === "maintenance" && r.status !== "maintenance") {
      return false;
    }
    if (activeTabKey === "insuranceValid" && r.insurance !== "valid") {
      return false;
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      const match =
        r.plate.toLowerCase().includes(q) ||
        r.driver.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q);
      if (!match) {
        return false;
      }
    }
    return true;
  });

  const tabDefs = [
    {
      id: "all",
      label: t("drivers.tabAll", locale),
      count: tabCounts.all,
    },
    {
      id: "active",
      label: t("vehicle.status.active", locale),
      count: tabCounts.active,
    },
    {
      id: "maintenance",
      label: t("vehicle.status.maintenance", locale),
      count: tabCounts.maintenance,
    },
    {
      id: "insuranceValid",
      label: `${t("table.insurance", locale)} ${t("vehicle.insurance.valid", locale)}`,
      count: tabCounts.insuranceValid,
    },
  ];

  const tabs = tabDefs.map((tab) => {
    const isSelected = activeTabKey === tab.id;
    const query = new URLSearchParams();
    if (tab.id !== "all") query.set("tab", tab.id);
    if (params.q) query.set("q", params.q);
    const href = query.toString() ? `?${query.toString()}` : "/vehicles";

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
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale)}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <Link href="/supply/vehicles/new" style={{ textDecoration: "none" }}>
            <CanvasBtn theme={theme} variant="primary" icon="plus">
              {t("vehicles.add", locale)}
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
        <form
          method="GET"
          action="/vehicles"
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
            <VehiclesTable rows={filteredRows} />
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
