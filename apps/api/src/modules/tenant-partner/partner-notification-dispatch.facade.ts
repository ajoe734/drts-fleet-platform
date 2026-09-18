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

import { Injectable } from "@nestjs/common";
import type { PartnerNotificationDispatchOutcome } from "@drts/contracts";

import {
  TenantPartnerService,
  type PartnerNotificationDispatchAttemptCommand,
} from "./tenant-partner.service";

export type { PartnerNotificationDispatchAttemptCommand };

@Injectable()
export class PartnerNotificationDispatchFacade {
  constructor(private readonly tenantPartnerService: TenantPartnerService) {}

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
