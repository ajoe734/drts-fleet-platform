// Narrow single-attempt partner notification dispatch façade —
// SR-PARTNER-NOTIFY-ACK-20260917.
//
// Source of truth: docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md
// §8. This is the only exported entry point a consumer-notification owner
// (its own claim/fence transaction, elsewhere) may call to attempt one
// partner webhook delivery:
//   1. precise endpoint lookup by (tenantId, webhookId) and caller scope
//      check — never a tenant-wide event scan;
//   2. reuses the endpoint's existing active/test_pending/disabled, expiry
//      and secret-rotation governance;
//   3. calls WebhookDispatchService.dispatchAttempt exactly once;
//   4. records the existing webhook delivery / credential usage / failure
//      count, deduped by this logical delivery id — never a second tenant
//      retry timer;
//   5. returns a validated ack or a typed failure with
//      suggestedNextAttemptAt.
// The caller's own fence transaction (step 6, not implemented here) records
// the receipt, delivery context and outbox outcome, and owns all retry
// timing. This module does not implement transport (multi-taxi DI, the
// PartnerNotificationTransport port) and does not touch the consumer outbox
// state machine.

import { Injectable, Optional } from "@nestjs/common";
import type {
  OrderPartnerNotificationRoute,
  PartnerEntryNotificationBinding,
  PartnerNotificationDispatchOutcome,
  PartnerNotificationFailureReason,
  PartnerNotificationTypedFailure,
  PartnerPassengerEventType,
  WebhookRetryPolicyRecord,
} from "@drts/contracts";
import {
  PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
} from "@drts/contracts";
import { PartnerEntryNotificationBindingRepository } from "./partner-entry-notification-binding.repository";
import { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import { computeEndpointFingerprint } from "./partner-notification-fingerprint";

export type PartnerRouteReadiness =
  | {
      ready: true;
      binding: PartnerEntryNotificationBinding;
      endpointFingerprint: string;
      retryPolicy: WebhookRetryPolicyRecord;
    }
  | { ready: false; failure: PartnerNotificationTypedFailure };

import {
  TenantPartnerService,
  type PartnerNotificationDispatchAttemptCommand,
} from "./tenant-partner.service";

export type { PartnerNotificationDispatchAttemptCommand };

@Injectable()
export class PartnerNotificationDispatchFacade {
  constructor(
    private readonly tenantPartnerService: TenantPartnerService,
    @Optional()
    private readonly bindings?: PartnerEntryNotificationBindingRepository,
    @Optional() private readonly identities?: PartnerUserIdentityLinkRepository,
  ) {}

  /** Read-only entry-scoped governance gate; never guesses or fans out a recipient. */
  async resolveNotificationRoute(
    route: OrderPartnerNotificationRoute,
    eventType: PartnerPassengerEventType,
  ): Promise<PartnerRouteReadiness> {
    const failed = (
      failureReason: PartnerNotificationFailureReason,
    ): PartnerRouteReadiness => ({
      ready: false,
      failure: {
        failureReason,
        retryDisposition:
          PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS[failureReason],
        suggestedNextAttemptAt: null,
      },
    });
    let entry;
    try {
      entry = this.tenantPartnerService.getPartnerEntry(route.entrySlug);
    } catch {
      return failed("route_missing");
    }
    if (
      entry.tenantId !== route.tenantId ||
      entry.partnerId !== route.partnerId
    )
      return failed("owner_changed");
    if (!entry.activeFlag) return failed("endpoint_disabled");
    const link = await this.identities?.find(
      route.entrySlug,
      route.partnerUserRef,
    );
    if (
      !link ||
      link.status !== "active" ||
      link.drtsPassengerId !== route.drtsPassengerId
    )
      return failed("recipient_revoked");
    const binding = await this.bindings?.findByEntrySlug(route.entrySlug);
    if (!binding) return failed("configuration_blocked");
    if (
      binding.tenantId !== route.tenantId ||
      binding.partnerId !== route.partnerId
    )
      return failed("owner_changed");
    if (binding.state === "disabled") return failed("endpoint_disabled");
    if (binding.state !== "ready" || !binding.eventTypes.includes(eventType))
      return failed("configuration_blocked");
    const endpoint = this.tenantPartnerService.findNotificationWebhookEndpoint(
      route.tenantId,
      binding.webhookId,
    );
    if (!endpoint) return failed("endpoint_unavailable");
    if (endpoint.status === "disabled") return failed("endpoint_disabled");
    if (
      endpoint.status !== "active" ||
      !endpoint.events.includes(
        PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[eventType],
      )
    )
      return failed("configuration_blocked");
    if (
      endpoint.credentialStatus &&
      !["active", "overlap_active"].includes(endpoint.credentialStatus)
    )
      return failed("credential_rejected");
    if (
      endpoint.secretExpiresAt &&
      Date.parse(endpoint.secretExpiresAt) <= Date.now()
    )
      return failed("credential_rejected");
    const endpointFingerprint = computeEndpointFingerprint(endpoint);
    if (
      !binding.validatedAt ||
      binding.validatedEndpointFingerprint !== endpointFingerprint ||
      !endpoint.retryPolicy
    )
      return failed("configuration_blocked");
    return {
      ready: true,
      binding,
      endpointFingerprint,
      retryPolicy: structuredClone(endpoint.retryPolicy),
    };
  }

  /**
   * Attempts exactly one remote HTTP delivery for the given webhook and
   * pre-built wire payload. Reuse the same `wirePayload.deliveryId` on every
   * retry of the same logical notification — the endpoint's failure count
   * and the partner's durable dedupe both key off it.
   */
  async dispatchNotificationAttemptByWebhookId(
    command: PartnerNotificationDispatchAttemptCommand,
  ): Promise<PartnerNotificationDispatchOutcome> {
    return this.tenantPartnerService.dispatchPartnerNotificationAttempt(
      command,
    );
  }
}
