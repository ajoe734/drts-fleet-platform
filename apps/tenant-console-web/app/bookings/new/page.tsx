import type { CSSProperties } from "react";
import type {
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasKPI,
  CanvasPageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { TenantBookingCreateForm } from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

export default async function NewBookingPage() {
  const client = getTenantClient();
  const [passengers, addresses, costCenters] = await Promise.all([
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
    client.listAddresses() as Promise<TenantAddressRecord[]>,
    client.listCostCenters({ activeOnly: true }) as Promise<
      TenantCostCenterRecord[]
    >,
  ]);

  const activePassengers = passengers.filter((row) => row.activeFlag);
  const activeAddresses = addresses.filter((row) => row.activeFlag);
  const activeCostCenters = costCenters.filter((row) => row.activeFlag);

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={th}
        title="建立叫車"
        subtitle="代訂或本人 · 預約 / 即時 · 自動套用 cost center 規則"
        sticky={false}
      />

      <div style={kpiGridStyle}>
        <CanvasKPI
          theme={th}
          label="乘客"
          value={String(activePassengers.length)}
          sub="可供代訂與本人建立叫車"
        />
        <CanvasKPI
          theme={th}
          label="地址簿"
          value={String(activeAddresses.length)}
          sub="常用上車與下車地點"
        />
        <CanvasKPI
          theme={th}
          label="成本中心"
          value={String(activeCostCenters.length)}
          sub="配額與審批規則會自動套用"
        />
      </div>

      <CanvasBanner
        theme={th}
        tone="warn"
        icon="warn"
        title="預估費用只作 preview"
        body="租戶端可先輸入估算金額以觸發 quota 與 approval preview；實際 quoted fare 仍由後端定價權威決定。"
      />

      <TenantBookingCreateForm
        addresses={activeAddresses}
        costCenters={activeCostCenters}
        passengers={activePassengers}
      />
    </div>
  );
}
