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
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
        subtitle="代訂或本人 · 行程、關聯、審批與配額影響集中在同一路由"
        sticky={false}
      />

      <CanvasBanner
        theme={th}
        tone="warn"
        icon="warn"
        title="預估費用僅用於政策預覽"
        body="建立叫車仍以後端定價與審批判定為準；此頁只保留 tenant command 已發布的欄位與 preview 結果。"
      />

      <div style={kpiGridStyle}>
        <CanvasKPI
          theme={th}
          label="乘客"
          value={String(activePassengers.length)}
          sub="可選擇通訊錄"
        />
        <CanvasKPI
          theme={th}
          label="常用地址"
          value={String(activeAddresses.length)}
          sub="支援地址簿回填"
        />
        <CanvasKPI
          theme={th}
          label="Cost center"
          value={String(activeCostCenters.length)}
          sub="治理規則套用範圍"
        />
      </div>

      <TenantBookingCreateForm
        addresses={activeAddresses}
        costCenters={activeCostCenters}
        passengers={activePassengers}
      />
    </div>
  );
}
