import { Inject, Injectable } from "@nestjs/common";

import type {
  FareQuoteAnomalyAdminView,
  FareQuoteRecoveryAction,
} from "@drts/contracts";

export const FARE_QUOTE_RECOVERY_PORT = Symbol("FARE_QUOTE_RECOVERY_PORT");

export interface FareQuoteRecoveryResult {
  status: "accepted" | "completed";
  message: string;
}

export interface FareQuoteRecoveryPort {
  isAvailable(action: FareQuoteRecoveryAction): boolean;
  recover(
    action: FareQuoteRecoveryAction,
    anomaly: FareQuoteAnomalyAdminView,
    context: {
      actorId: string;
      idempotencyKey: string;
      requestId?: string;
    },
  ): Promise<FareQuoteRecoveryResult>;
}

/**
 * `retry_quote` would need to re-run the fare computation that produced the
 * anomaly. That computation lives outside this module (`OwnedMobilityService
 * .buildFareQuoteSnapshot`) and -- for the `fixedPrice` case this port's
 * only retryable "quote_provider_unavailable" reason guards -- is itself a
 * hardcoded placeholder (`DEFAULT_PLATFORM_QUOTED_FARE`), not a confirmed
 * external quoting provider. There is no accepted fare-quote vendor contract
 * anywhere in this repository to wire a real adapter against (see the
 * inventory in docs/04-uat/audit-recovery-providers-20261002.md), so this
 * stays unavailable rather than inventing one.
 */
@Injectable()
export class UnavailableFareQuoteRecoveryPort implements FareQuoteRecoveryPort {
  isAvailable() {
    return false;
  }

  async recover(): Promise<FareQuoteRecoveryResult> {
    throw new Error("Fare quote recovery adapter is not provisioned.");
  }
}

export const InjectFareQuoteRecoveryPort = () =>
  Inject(FARE_QUOTE_RECOVERY_PORT);
