import type {
  ActualTripFareBreakdown,
  DriverDeclaredSurnameSnapshot,
} from "@drts/contracts";

export const CERTIFICATE_SUPPORT_STATES = [
  "available",
  "generating",
  "unavailable",
  "failed",
  "access_denied",
  "superseded",
] as const;

export type CertificateSupportState =
  (typeof CERTIFICATE_SUPPORT_STATES)[number];

export interface CertificateSupportRow {
  receiptId: string;
  orderId: string;
  receiptNo: string;
  receiptVersion: number;
  isCurrent: boolean;
  supersedesReceiptId: string | null;
  regenerationIdempotencyKey: string | null;
  regeneratedByActorId: string | null;
  regenerationReason: string | null;
  regenerationAuditId: string | null;
  amountMinor: number;
  currency: string;
  issuedAt: string;
  record: Record<string, unknown>;
}

/** Captured completion data does not establish lawful E-04 issuance readiness. */
export interface CertificateCapturedCompletionFacts extends Partial<DriverDeclaredSurnameSnapshot> {
  actualFareBreakdown?: ActualTripFareBreakdown;
}

export interface CertificateSupportView extends CertificateCapturedCompletionFacts {
  certificateId: string;
  certificateNo: string;
  orderId: string;
  tripId: string | null;
  state: CertificateSupportState;
  certificateVersion: string | null;
  issuedAt: string;
  plateNo: string | null;
  pickupAt: string | null;
  dropoffAt: string | null;
  travelDurationSeconds: number | null;
  routeSummary: string | null;
  distanceMeters: number | null;
  fareMinor: number;
  tollMinor: number | null;
  currency: string;
  consumerServicePhone: string | null;
  authorityComplaintPhone: string | null;
  htmlUrl: string | null;
  pdfUrl: string | null;
  supersededByCertificateId: string | null;
  /**
   * Why no artifact is offered, empty when one is.
   *
   * `htmlUrl` and `pdfUrl` used to go `null` with nothing said, and the single
   * `regeneration.reasonCode` value available --
   * `certificate_canonical_record_incomplete` -- reported an unexpected currency
   * as a missing field. The record was complete; the label was unexpected. A
   * passenger's receipt should not disappear behind a reason that is wrong
   * about which thing is wrong.
   */
  artifactBlockers: CertificateArtifactBlocker[];
  regeneration: {
    enabled: boolean;
    reasonCode: string | null;
  };
  /** Captured completion facts, absent for legacy/incomplete certificates. */
  e04Snapshot?: CertificateE04Snapshot;
}

export interface CertificateE04Snapshot {
  fleetOperatorName: string;
  driverSurname: string;
  driverRegistrationMasked: string;
  fareBreakdown: {
    startMinor: number;
    distanceMinor: number;
    delayMinor: number;
    nightMinor: number;
  };
  paymentMethodDisplay: string;
}

export interface CertificateArtifactBlocker {
  /** `missing_field` | `unexpected_currency` | `state_not_issuable`. */
  code: string;
  field?: string;
  detail?: string;
}

export interface CertificateArtifact {
  buffer: Buffer;
  contentType: "text/html; charset=utf-8" | "application/pdf";
  fileName: string;
}

export interface CertificateRegenerationCommand {
  reason?: string;
}

export interface CertificateRegenerationResult {
  certificate: CertificateSupportView;
  actionReceipt: import("@drts/contracts").ActionReceipt;
}
