import type { DriverAvailabilityResult } from "@drts/contracts";

export const DRIVER_AVAILABILITY_GATEWAY = "DRIVER_AVAILABILITY_GATEWAY";

export interface DriverAvailabilityGateway {
  isDriverAvailableForDispatch(
    driverId: string,
    options?: { maxHeartbeatAgeMs?: number; now?: number },
  ): Promise<DriverAvailabilityResult>;

  isDriverAvailableForDispatchSync?(
    driverId: string,
    options?: { maxHeartbeatAgeMs?: number; now?: number },
  ): DriverAvailabilityResult;
}
