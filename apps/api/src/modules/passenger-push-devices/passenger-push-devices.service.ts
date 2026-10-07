import { Injectable } from "@nestjs/common";

import type { PassengerPushDeviceRecord } from "@drts/contracts";

import type { FirstPartyPushDeviceResolverPort } from "./passenger-push-devices.port";
import {
  PassengerPushDevicesRepository,
  type RegisterPassengerPushDeviceCommand,
  type WriteFirstPartyRouteCommand,
  type WriteFirstPartyRouteResult,
} from "./passenger-push-devices.repository";

/**
 * D4/D5 service facade over `PassengerPushDevicesRepository`. Implements
 * `FirstPartyPushDeviceResolverPort` (passenger-push-devices.port.ts, a
 * superset of the `@drts/contracts` `FirstPartyPassengerPushDeviceResolver`
 * interface) so the multi-taxi delivery layer can inject this service by
 * that port via `FIRST_PARTY_PUSH_DEVICE_RESOLVER` —
 * PUSH-CHANNEL-ROUTER-20261006 injects nothing yet; PUSH-FIRST-PARTY-FCM-20261006
 * is the first real caller.
 */
@Injectable()
export class PassengerPushDevicesService
  implements FirstPartyPushDeviceResolverPort
{
  constructor(private readonly repository: PassengerPushDevicesRepository) {}

  registerDevice(
    command: RegisterPassengerPushDeviceCommand,
  ): Promise<PassengerPushDeviceRecord> {
    return this.repository.registerDevice(command);
  }

  touchDevice(deviceId: string): Promise<PassengerPushDeviceRecord | null> {
    return this.repository.touchDevice(deviceId);
  }

  revokeDevice(
    deviceId: string,
    reason?: string,
  ): Promise<PassengerPushDeviceRecord | null> {
    return this.repository.revokeDevice(deviceId, reason);
  }

  invalidateDevice(
    deviceId: string,
    reason: string,
  ): Promise<PassengerPushDeviceRecord | null> {
    return this.repository.invalidateDevice(deviceId, reason);
  }

  resolveActiveDevices(
    drtsPassengerId: string,
  ): Promise<PassengerPushDeviceRecord[]> {
    return this.repository.resolveActiveDevices(drtsPassengerId);
  }

  writeFirstPartyRoute(
    command: WriteFirstPartyRouteCommand,
  ): Promise<WriteFirstPartyRouteResult> {
    return this.repository.writeFirstPartyRoute(command);
  }

  resolveActiveDeviceSendTargets(
    drtsPassengerId: string,
  ): Promise<Array<{ deviceId: string; token: string; tokenSha256: string }>> {
    return this.repository.resolveActiveDeviceSendTargets(drtsPassengerId);
  }
}
