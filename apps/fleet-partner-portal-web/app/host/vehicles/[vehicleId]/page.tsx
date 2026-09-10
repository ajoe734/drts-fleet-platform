import Link from "next/link";
import { CanvasPageHeader, CanvasPill } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  loadHostVehicleCases,
  loadHostVehicleDetail,
  loadHostVehicleEarnings,
  loadHostVehicleMaintenance,
  loadHostVehicleTrips,
} from "@/app/host/lib/host-data.server";
import {
  HOST_VEHICLE_STATUS_TONE,
  getCurrentHostPeriodMonth,
} from "@/app/host/lib/host-format";
import { HostAccessStateCard } from "@/components/host/host-access-state";
import { HostVehicleSummaryCard } from "@/components/host/host-vehicle-summary-card";
import { HostEarningsPanel } from "@/components/host/host-earnings-panel";
import { HostMaintenanceTable } from "@/components/host/host-maintenance-table";
import { HostTripsTable } from "@/components/host/host-trips-table";
import { HostCasesTable } from "@/components/host/host-cases-table";
import { HostPageFooter } from "@/components/host/host-page-footer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const TABS = [
  { id: "earnings", label: "收益 · Earnings" },
  { id: "maintenance", label: "維保 · Maintenance" },
  { id: "trips", label: "行程 · Trips" },
  { id: "cases", label: "案件 · Cases" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export default async function HostVehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams?: Promise<{ tab?: string; page?: string; month?: string }>;
}) {
  const { vehicleId } = await params;
  const query = searchParams ? await searchParams : {};
  const theme = buildFleetTheme();

  const detail = await loadHostVehicleDetail(vehicleId);

  if (!detail.ok) {
    return (
      <>
        <CanvasPageHeader theme={theme} title="自有車輛 · My Vehicles" subtitle="唯讀檢視" />
        <div style={{ padding: 24 }}>
          <HostAccessStateCard theme={theme} state={detail.accessState} detail={detail.error} />
        </div>
      </>
    );
  }

  const vehicle = detail.vehicle;
  const activeTabId: TabId = isTabId(query.tab) ? query.tab : "earnings";

  const tabs = TABS.map((tab) => (
    <Link
      key={tab.id}
      href={`/host/vehicles/${encodeURIComponent(vehicleId)}?tab=${tab.id}`}
      style={{
        textDecoration: "none",
        color: activeTabId === tab.id ? theme.text : theme.textMuted,
        fontWeight: activeTabId === tab.id ? 600 : 500,
      }}
    >
      {tab.label}
    </Link>
  ));
  const activeTab = tabs[TABS.findIndex((tab) => tab.id === activeTabId)];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {vehicle.plateNo}
            <CanvasPill theme={theme} tone={HOST_VEHICLE_STATUS_TONE[vehicle.currentStatus] ?? "neutral"} dot>
              {vehicle.currentStatus}
            </CanvasPill>
          </span>
        }
        subtitle={`${vehicle.vehicleForm} · ${vehicle.licenseClass} · ${vehicle.energyType} · VIN ${vehicle.vinMasked} · 唯讀檢視，無合約 / 收益修改入口`}
        tabs={tabs}
        activeTab={activeTab}
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <HostVehicleSummaryCard theme={theme} vehicle={vehicle} />

        {activeTabId === "earnings" ? (
          <HostEarningsTab theme={theme} vehicleId={vehicleId} month={query.month} />
        ) : null}
        {activeTabId === "maintenance" ? (
          <HostMaintenanceTab theme={theme} vehicleId={vehicleId} page={query.page} />
        ) : null}
        {activeTabId === "trips" ? (
          <HostTripsTab theme={theme} vehicleId={vehicleId} page={query.page} />
        ) : null}
        {activeTabId === "cases" ? (
          <HostCasesTab theme={theme} vehicleId={vehicleId} page={query.page} />
        ) : null}
      </div>
    </>
  );
}

async function HostEarningsTab({
  theme,
  vehicleId,
  month,
}: {
  theme: ReturnType<typeof buildFleetTheme>;
  vehicleId: string;
  month: string | undefined;
}) {
  const period = month || getCurrentHostPeriodMonth();
  const result = await loadHostVehicleEarnings(vehicleId, period);
  if (!result.ok) {
    return <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />;
  }
  return (
    <HostEarningsPanel
      theme={theme}
      vehicleId={vehicleId}
      period={period}
      variant={result.variant}
      earnings={result.earnings}
    />
  );
}

async function HostMaintenanceTab({
  theme,
  vehicleId,
  page,
}: {
  theme: ReturnType<typeof buildFleetTheme>;
  vehicleId: string;
  page: string | undefined;
}) {
  const pageNum = Number(page) > 0 ? Number(page) : 1;
  const result = await loadHostVehicleMaintenance(vehicleId, { page: pageNum, pageSize: PAGE_SIZE });
  if (!result.ok) {
    return <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />;
  }
  return (
    <HostMaintenanceTable
      theme={theme}
      rows={result.items}
      footer={
        <HostPageFooter
          theme={theme}
          pageInfo={result.pageInfo}
          basePath={`/host/vehicles/${encodeURIComponent(vehicleId)}`}
          extraParams={{ tab: "maintenance" }}
        />
      }
    />
  );
}

async function HostTripsTab({
  theme,
  vehicleId,
  page,
}: {
  theme: ReturnType<typeof buildFleetTheme>;
  vehicleId: string;
  page: string | undefined;
}) {
  const pageNum = Number(page) > 0 ? Number(page) : 1;
  const result = await loadHostVehicleTrips(vehicleId, { page: pageNum, pageSize: PAGE_SIZE });
  if (!result.ok) {
    return <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />;
  }
  return (
    <HostTripsTable
      theme={theme}
      rows={result.items}
      footer={
        <HostPageFooter
          theme={theme}
          pageInfo={result.pageInfo}
          basePath={`/host/vehicles/${encodeURIComponent(vehicleId)}`}
          extraParams={{ tab: "trips" }}
        />
      }
    />
  );
}

async function HostCasesTab({
  theme,
  vehicleId,
  page,
}: {
  theme: ReturnType<typeof buildFleetTheme>;
  vehicleId: string;
  page: string | undefined;
}) {
  const pageNum = Number(page) > 0 ? Number(page) : 1;
  const result = await loadHostVehicleCases(vehicleId, { page: pageNum, pageSize: PAGE_SIZE });
  if (!result.ok) {
    return <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />;
  }
  return (
    <HostCasesTable
      theme={theme}
      rows={result.items}
      footer={
        <HostPageFooter
          theme={theme}
          pageInfo={result.pageInfo}
          basePath={`/host/vehicles/${encodeURIComponent(vehicleId)}`}
          extraParams={{ tab: "cases" }}
        />
      }
    />
  );
}
