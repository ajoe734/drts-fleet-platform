import { Injectable } from "@nestjs/common";

import type {
  FirstPartyPassengerPushDeviceResolver,
  PassengerPushDeviceRecord,
} from "@drts/contracts";

import {
  PassengerPushDevicesRepository,
  type RegisterPassengerPushDeviceCommand,
  type WriteFirstPartyRouteCommand,
  type WriteFirstPartyRouteResult,
} from "./passenger-push-devices.repository";

/**
 * D4/D5 service facade over `PassengerPushDevicesRepository`. Implements
 * `FirstPartyPassengerPushDeviceResolver` (packages/contracts) so the
 * eventual multi-taxi delivery layer (PUSH-CHANNEL-ROUTER-20261006) can
 * inject this service by that contract interface via
 * `FIRST_PARTY_PUSH_DEVICE_RESOLVER` — nothing injects it yet this wave.
 */
@Injectable()
export class PassengerPushDevicesService
  implements FirstPartyPassengerPushDeviceResolver
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
    expectedTokenSha256?: string,
  ): Promise<PassengerPushDeviceRecord | null> {
    return this.repository.invalidateDevice(deviceId, reason, expectedTokenSha256);
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
}
