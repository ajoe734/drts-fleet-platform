import { vi } from "vitest";
import type { DriverEtaResponse } from "@drts/contracts";
import { manualWire } from "../referral-manual-complaints-canonical-20261020/fixture";
import { GET as activeGET } from "../../../apps/referral-embed-web/app/api/referral/active/route";

export async function liveWire(status = "enroute_pickup") {
  const f = await manualWire();
  const assignmentId = "unit-live-assignment",
    taskId = "unit-live-task",
    driverId = "unit-live-driver",
    vehicleId = "unit-live-vehicle";
  const at = new Date().toISOString();
  await f.change({
    status,
    pickup: { address: "原上車點", lat: 25.06, lng: 121.52 },
    dropoff: { address: "原目的地", lat: 25.08, lng: 121.24 },
  });
  f.db.table("ops.phase1_dispatch_assignments").set(assignmentId, {
    assignmentId,
    taskId,
    orderId: f.orderId,
    dispatchJobId: "unit-live-job",
    driverId,
    vehicleId,
    status: "accepted",
    assignmentType: "metered",
    createdAt: at,
    updatedAt: at,
  });
  f.db.table("ops.phase1_driver_tasks").set(taskId, {
    taskId,
    orderId: f.orderId,
    assignmentId,
    dispatchJobId: "unit-live-job",
    driverId,
    vehicleId,
    status: status === "on_trip" ? "on_trip" : "accepted",
    waypoints: [],
    createdAt: at,
    updatedAt: at,
  });
  const telemetry = {
    driverId,
    currentVehicleId: vehicleId,
    currentTaskId: taskId,
    locationFreshness: "fresh",
    currentLocation: {
      driverId,
      lat: 25.061,
      lng: 121.521,
      accuracyM: 5,
      recordedAt: at,
      updatedAt: at,
    },
  };
  const tracking = vi.fn(async () => structuredClone(telemetry));
  const eta = vi.fn(
    async (
      _requestedDriverId: string,
      destLat: number,
      destLng: number,
    ): Promise<DriverEtaResponse> => ({
      driverId: telemetry.currentLocation.driverId,
      etaMinutes: 3,
      calculatedAt: new Date().toISOString(),
      driverLocation: structuredClone(telemetry.currentLocation),
      destination: { lat: destLat, lng: destLng },
    }),
  );
  const route = vi.fn(async () => ({
    distanceMeters: 4200,
    durationSeconds: 720,
    provider: "controlled-existing-route-port",
    generatedAt: new Date().toISOString(),
  }));
  Object.assign((f.service as any).regulatoryRegistryService, {
    getDriverTrackingStatus: tracking,
    getDriverEta: eta,
  });
  (f.service as any).passengerRouteGeoService = { route };
  const original = f.fetch;
  const browserFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), "https://embed.example.test")
        .pathname;
      if (pathname === "/api/referral/active") return activeGET();
      return original(input, init);
    },
  );
  vi.stubGlobal("fetch", browserFetch);
  return {
    ...f,
    assignmentId,
    taskId,
    driverId,
    vehicleId,
    telemetry,
    tracking,
    eta,
    route,
    browserFetch,
    async view() {
      return f.page("trip");
    },
  };
}
