// PUSH-CHANNEL-ROUTER-20261006 — D2/D3/D7: which notification channel (if
// any) an order is frozen to, and the terminal outcome for every resolution
// that is not the unchanged `partner_webhook` path.
//
// Design: docs/02-architecture/passenger-notification-channel-routing-20261006.md
// D2 (route snapshots + mutual-exclusion ambiguity), D3 (a no-channel order
// is by design, not a fault), D6/D8 (first-party stays configuration_blocked
// until PUSH-FIRST-PARTY-FCM-20261006 adds a real transport). This module has
// no I/O: `MultiTaxiRepository.resolvePassengerNotificationChannel` does the
// two-table lookup (one query); this module only holds the resulting type
// and the pure decision table for non-partner resolutions.

import {
  FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS,
  PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS,
  type PassengerNotificationChannelRoute,
  type PassengerPushDeliveryResult,
} from "@drts/contracts";

/**
 * D2 — every order resolves to exactly one of: a single unambiguous route
 * (`PassengerNotificationChannelRoute`, from `@drts/contracts`), both route
 * snapshots present at once (`ambiguous`), or neither (`none`). This is the
 * full state space the router's SQL lookup (one query, two snapshot tables)
 * can observe; there is no fourth case.
 */
export type PassengerNotificationRouteResolution =
  | PassengerNotificationChannelRoute
  | { channel: "ambiguous" }
  | { channel: "none" };

export interface PassengerNotificationChannelOutcome {
  failureReason:
    | "route_ambiguous"
    | "no_notification_channel"
    | "configuration_blocked";
  retryDisposition:
    | (typeof PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS)["route_ambiguous"]
    | (typeof FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS)["no_notification_channel"]
    | (typeof FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS)["configuration_blocked"];
  result: Exclude<PassengerPushDeliveryResult, "delivered">;
}

/**
 * D3/D6 decision table for every resolution this task gives a terminal
 * outcome to directly, i.e. everything except `partner_webhook` (routed,
 * unchanged, to the existing `MultiTaxiService.deliverPartnerNotification`).
 *
 * `first_party_app` has no real transport this wave (D8): there is no
 * caller that can ever write a first-party route yet, and even if one
 * existed, `PASSENGER_PUSH_FIRST_PARTY_ENABLED` defaults false with no
 * transport bound. Both causes collapse to the same D6 outcome
 * (`configuration_blocked`), so this pure lookup table does not branch on
 * the flag — there is nothing it could change this wave.
 * PUSH-FIRST-PARTY-FCM-20261006 replaces this branch once a real transport
 * exists.
 */
export function resolveNonPartnerChannelOutcome(
  channel: "first_party_app" | "ambiguous" | "none",
): PassengerNotificationChannelOutcome {
  if (channel === "ambiguous") {
    return {
      failureReason: "route_ambiguous",
      retryDisposition:
        PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS.route_ambiguous,
      result: "provider_error",
    };
  }
  if (channel === "none") {
    return {
      failureReason: "no_notification_channel",
      retryDisposition:
        FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS.no_notification_channel,
      result: "provider_not_configured",
    };
  }
  return {
    failureReason: "configuration_blocked",
    retryDisposition:
      FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS.configuration_blocked,
    result: "provider_not_configured",
  };
}
