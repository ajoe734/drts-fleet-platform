import { Inject, Injectable } from "@nestjs/common";

/**
 * Input for one masked-call leg. Deliberately identifier-only: resolving the
 * driver's real number is the adapter's job, so the passenger-facing service
 * never holds it and cannot leak it into a response, log, or error payload.
 */
export type MaskedCallSubject = {
  orderId: string;
  assignmentId: string;
  passengerSubjectRef: string;
  driverId: string;
};

export type MaskedCallSession = {
  /** Provider-issued proxy leg, e.g. `tel:+886285551234,,7781`. */
  contactUri: string;
  expiresAt: string;
  providerName: string;
};

export interface MaskedCallPort {
  /** False whenever provider credentials or contract tests are absent. */
  isAvailable(): boolean;
  createSession(
    subject: MaskedCallSubject,
    context: { requestId?: string | undefined },
  ): Promise<MaskedCallSession>;
}

export const MASKED_CALL_PORT = Symbol("MASKED_CALL_PORT");

/**
 * Default binding. P5-CALL-001 stays `blocked_ext` until a provider contract
 * and credentials exist, so the only honest behaviour is to report absence:
 * `isAvailable()` is false and `createSession` throws rather than minting a
 * fake proxy number that would look like a working masked call.
 */
@Injectable()
export class UnavailableMaskedCallPort implements MaskedCallPort {
  isAvailable() {
    return false;
  }

  async createSession(): Promise<MaskedCallSession> {
    throw new Error(
      "Masked-call provider is not provisioned; no masked session can be issued.",
    );
  }
}

export const InjectMaskedCallPort = () => Inject(MASKED_CALL_PORT);
