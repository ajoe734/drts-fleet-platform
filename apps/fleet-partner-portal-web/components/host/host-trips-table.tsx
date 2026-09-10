import type { ReactNode } from "react";
import {
  CanvasCard,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import type { HostVehicleTripItem } from "@drts/contracts";
import { formatHostMoney, hostTripStatusTone } from "@/app/host/lib/host-format";

// De-identified: areaSummary is district-only (backend-masked, see
// apps/api/src/modules/host-view/host-view.types.ts maskAreaSummary). This
// table never renders passenger name/phone/street address — those fields do
// not exist on HostVehicleTripItem at all.
export function HostTripsTable({
  theme,
  rows,
  footer,
}: {
  theme: CanvasTheme;
  rows: HostVehicleTripItem[];
  footer?: ReactNode;
}) {
  const columns: CanvasTableColumn<HostVehicleTripItem>[] = [
    { h: "TRIP", k: "tripId", w: 110, mono: true },
    { h: "STARTED", k: "startedAt", w: 140, mono: true },
    { h: "COMPLETED", w: 140, mono: true, r: (r) => r.completedAt ?? "—" },
    { h: "AREA · 去識別化", k: "areaSummary", w: 170 },
    { h: "DISTANCE", w: 90, mono: true, align: "right", r: (r) => `${r.distanceKm} km` },
    {
      h: "FARE",
      w: 100,
      mono: true,
      align: "right",
      r: (r) => formatHostMoney(r.fareAmount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill theme={theme} tone={hostTripStatusTone(r.status)} dot>
          {r.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard
      theme={theme}
      title="行程 · Trips (去識別化)"
      subtitle="僅顯示概括行政區與金額，絕不含乘客姓名 / 電話 / 門牌地址"
      padding={0}
    >
      <CanvasTable theme={theme} columns={columns} rows={rows} />
      {footer}
    </CanvasCard>
  );
}
