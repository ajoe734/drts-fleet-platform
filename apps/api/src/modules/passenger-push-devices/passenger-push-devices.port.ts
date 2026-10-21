import { Inject } from "@nestjs/common";

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
