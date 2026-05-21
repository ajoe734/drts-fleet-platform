import type { CSSProperties } from "react";
import type {
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import { CanvasBanner, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
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
  display: "grid",
  gap: 16,
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
  const directoryWarnings = [
    activePassengers.length === 0
      ? "乘客通訊錄目前沒有啟用資料，建立叫車將退回手動填寫乘客資訊。"
      : null,
    activeAddresses.length === 0
      ? "地址簿目前沒有啟用資料，pickup / drop 將改由人工輸入。"
      : null,
    activeCostCenters.length === 0
      ? "成本中心目錄目前沒有啟用資料，將退回 free-text cost center。"
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="建立叫車"
        subtitle="代訂或本人 · 預約 / 即時 · 自動套用 cost center 規則"
      />

      <div style={pageBodyStyle}>
        {directoryWarnings.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="目錄資料尚未完整"
            body={directoryWarnings.join(" ")}
          />
        ) : null}

        <TenantBookingCreateForm
          addresses={activeAddresses}
          costCenters={activeCostCenters}
          passengers={activePassengers}
        />
      </div>
    </div>
  );
}
