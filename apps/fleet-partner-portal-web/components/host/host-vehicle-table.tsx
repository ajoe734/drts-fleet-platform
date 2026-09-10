// Owned-vehicle list table for /host/vehicles. No "use client": column
// render functions are evaluated by CanvasTable (canvas-primitives/table.tsx,
// itself deliberately not "use client") while this module runs as a Server
// Component — no reactive client-only state is needed here (no locale
// toggle), matching that module's documented intent.

import Link from "next/link";
import {
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import type { HostVehicleSummary } from "@drts/contracts";
import { HOST_VEHICLE_STATUS_TONE, sliceIsoDate } from "@/app/host/lib/host-format";

export function HostVehicleTable({
  theme,
  rows,
}: {
  theme: CanvasTheme;
  rows: HostVehicleSummary[];
}) {
  const columns: CanvasTableColumn<HostVehicleSummary>[] = [
    {
      h: "VEHICLE",
      w: 170,
      r: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.plateNo}</div>
          <div
            style={{
              fontSize: 11,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.vinMasked}
          </div>
        </div>
      ),
    },
    { h: "FORM", k: "vehicleForm", w: 90 },
    { h: "LICENSE", k: "licenseClass", w: 110, mono: true },
    { h: "ENERGY", k: "energyType", w: 90 },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={HOST_VEHICLE_STATUS_TONE[r.currentStatus] ?? "neutral"}
          dot
        >
          {r.currentStatus}
        </CanvasPill>
      ),
    },
    { h: "營運車行 · operating fleet", k: "operatingFleetName", w: 160 },
    {
      h: "CONTRACT",
      w: 190,
      r: (r) =>
        r.contractPeriod
          ? `${sliceIsoDate(r.contractPeriod.startAt)} ~ ${sliceIsoDate(r.contractPeriod.endAt)} · ${r.contractPeriod.status}`
          : "—",
    },
    {
      h: "",
      w: 90,
      r: (r) => (
        <Link
          href={`/host/vehicles/${encodeURIComponent(r.vehicleId)}`}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: theme.accent,
            textDecoration: "none",
          }}
        >
          詳情 →
        </Link>
      ),
    },
  ];

  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}
