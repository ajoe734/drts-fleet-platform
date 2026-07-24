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
