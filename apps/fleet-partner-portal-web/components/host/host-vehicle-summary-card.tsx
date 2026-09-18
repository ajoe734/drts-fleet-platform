import { CanvasCard, CanvasDL, CanvasPill, type CanvasTheme } from "@drts/ui-web";
import type { HostVehicleSummary } from "@drts/contracts";
import { HOST_VEHICLE_STATUS_TONE, sliceIsoDate } from "@/app/host/lib/host-format";
import type { Locale } from "@/lib/translations";
import { trHost } from "@/app/host/translations";

export function HostVehicleSummaryCard({
  theme,
  locale,
  vehicle,
}: {
  theme: CanvasTheme;
  locale: Locale;
  vehicle: HostVehicleSummary;
}) {
  return (
    <CanvasCard theme={theme} title={trHost("vehicleSummaryCardTitle", locale)}>
      <CanvasDL
        theme={theme}
        cols={3}
        items={[
          { k: "PLATE", v: vehicle.plateNo, mono: true },
          { k: "VIN (MASKED)", v: vehicle.vinMasked, mono: true },
          { k: "FORM", v: vehicle.vehicleForm },
          { k: "LICENSE CLASS", v: vehicle.licenseClass, mono: true },
          { k: "ENERGY", v: vehicle.energyType },
          {
            k: "STATUS",
            v: (
              <CanvasPill
                theme={theme}
                tone={HOST_VEHICLE_STATUS_TONE[vehicle.currentStatus] ?? "neutral"}
                dot
              >
                {vehicle.currentStatus}
              </CanvasPill>
            ),
          },
          { k: "營運車行 · OPERATING FLEET", v: vehicle.operatingFleetName },
          {
            k: "CONTRACT PERIOD",
            v: vehicle.contractPeriod
              ? `${sliceIsoDate(vehicle.contractPeriod.startAt)} ~ ${sliceIsoDate(vehicle.contractPeriod.endAt)}`
              : "—",
          },
          {
            k: "CONTRACT STATUS",
            v: vehicle.contractPeriod ? vehicle.contractPeriod.status : "—",
          },
        ]}
      />
    </CanvasCard>
  );
}
