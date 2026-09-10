import type { ReactNode } from "react";
import {
  CanvasCard,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import type { HostVehicleMaintenanceItem } from "@drts/contracts";
import { HOST_MAINT_STATUS_TONE, formatHostMoney } from "@/app/host/lib/host-format";
import type { Locale } from "@/lib/translations";
import { trHost } from "@/app/host/translations";

export function HostMaintenanceTable({
  theme,
  locale,
  rows,
  footer,
}: {
  theme: CanvasTheme;
  locale: Locale;
  rows: HostVehicleMaintenanceItem[];
  footer?: ReactNode;
}) {
  const columns: CanvasTableColumn<HostVehicleMaintenanceItem>[] = [
    { h: "TYPE", k: "type", w: 110 },
    { h: "DESCRIPTION", k: "description", w: 220 },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill theme={theme} tone={HOST_MAINT_STATUS_TONE[r.status] ?? "neutral"} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "SCHEDULED", w: 110, mono: true, r: (r) => r.scheduledAt ?? "—" },
    { h: "COMPLETED", w: 110, mono: true, r: (r) => r.completedAt ?? "—" },
    {
      h: "COST",
      w: 100,
      mono: true,
      align: "right",
      r: (r) => (r.cost === null ? "—" : formatHostMoney(r.cost)),
    },
    { h: "NOTES", w: 180, r: (r) => r.notesSummary ?? "—" },
  ];

  return (
    <CanvasCard
      theme={theme}
      title={trHost("maintenanceCardTitle", locale)}
      subtitle="資料源 ops.phase1_maintenance_logs · 狀態對齊 HOST_VEHICLE_MAINTENANCE_STATUSES"
      padding={0}
    >
      <CanvasTable theme={theme} columns={columns} rows={rows} />
      {footer}
    </CanvasCard>
  );
}
