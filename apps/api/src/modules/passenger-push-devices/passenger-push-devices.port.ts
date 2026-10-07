import { Inject } from "@nestjs/common";

import type {
  FirstPartyPassengerPushDeviceResolver,
  PassengerPushDeviceRecord,
} from "@drts/contracts";

/**
 * D4 — the resolver surface the future multi-taxi delivery layer (D7,
 * PUSH-CHANNEL-ROUTER-20261006) will inject when it learns to route
 * `first_party_app` orders. This module only registers an implementation
 * behind this token; nothing imports it yet (no controller, no
 * multi-taxi.module.ts binding), per PUSH-FIRST-PARTY-REGISTRY-20261006's
 * write scope.
 */
export const FIRST_PARTY_PUSH_DEVICE_RESOLVER = Symbol(
  "FIRST_PARTY_PUSH_DEVICE_RESOLVER",
);

export const InjectFirstPartyPushDeviceResolver = () =>
  Inject(FIRST_PARTY_PUSH_DEVICE_RESOLVER);

/**
 * PUSH-FIRST-PARTY-FCM-20261006 — the wider surface the real FCM transport
 * needs, injected behind the same `FIRST_PARTY_PUSH_DEVICE_RESOLVER` token
 * (the concrete `PassengerPushDevicesService` already implements both
 * methods below; only the exported contracts interface stayed narrow).
 * `resolveActiveDeviceSendTargets` is the one place a raw token ever leaves
 * this module: never through an HTTP response (D4 still holds — there is no
 * HTTP surface here), only this in-process call so a transport can actually
 * call FCM. Callers must never log or persist the `token` field — only
 * `deviceId`/`tokenSha256`.
 */
export interface FirstPartyPushDeviceResolverPort
  extends FirstPartyPassengerPushDeviceResolver {
  invalidateDevice(
    deviceId: string,
    reason: string,
  ): Promise<PassengerPushDeviceRecord | null>;
  resolveActiveDeviceSendTargets(
    drtsPassengerId: string,
  ): Promise<Array<{ deviceId: string; token: string; tokenSha256: string }>>;
}
