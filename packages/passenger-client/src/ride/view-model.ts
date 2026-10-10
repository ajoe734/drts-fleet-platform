/**
 * Passenger presentation view model — types only, no fixture payloads.
 *
 * The live adapter and every screen component depend on this module. Fixture
 * DATA lives in `passenger-fixtures.ts`, which must stay out of the statically
 * reachable graph so a production bundle cannot resolve it (P5-PAX-GATE-001).
 */
import type {
  DriverRatingDisplayState,
  MultiTaxiPublicFareVersion,
  PassengerDispatchDisclosureSnapshot,
  PassengerPaymentStatus,
  PassengerRideSseEvent,
} from "@drts/contracts";

export const PASSENGER_SCREEN_IDS = [
  "P5-01",
  "P5-02",
  "P5-03",
  "P5-04",
  "P5-05",
  "P5-06",
  "P5-07",
  "P5-08",
  "P5-09",
  "P5-10",
  "P5-11",
  "P5-12",
  "A03",
  "A04",
] as const;

export type PassengerScreenId = (typeof PASSENGER_SCREEN_IDS)[number];

export type PassengerMapState = "fresh" | "stale" | "missing";

export type PassengerActionMode = "driver_contact_ready" | "support_only";

export type PassengerBadgeTone = "info" | "success" | "warning" | "danger";

export interface PassengerPaymentPresentation {
  status: PassengerPaymentStatus;
  label: string;
  detail: string;
  tone: PassengerBadgeTone;
  amountText?: string;
}

export interface PassengerCertificateRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface PassengerCertificatePresentation {
  state: "pending" | "available" | "error";
  receiptNo?: string;
  rows?: PassengerCertificateRow[];
  errorCode?: string;
}

export interface PassengerTimelineEvent {
  eventType: PassengerRideSseEvent;
  happenedAt: string;
  summary: string;
}

export interface PassengerRideFixture {
  token: string;
  orderNo?: string;
  screenId: PassengerScreenId;
  title: string;
  status: string;
  statusSubline?: string;
  etaMain?: string;
  etaSub?: string;
  etaTone?: "accent" | "success";
  routeDistanceKm?: string;
  routeDurationMinutes?: string;
  routeFareMode?: "range" | "anomaly";
  routeFareText?: string;
  routeFareHint?: string;
  pickupLabel: string;
  dropoffLabel?: string;
  mapState: PassengerMapState;
  actionMode: PassengerActionMode;
  canCancel?: boolean;
  canRate?: boolean;
  canContact?: boolean;
  canReadReceipt?: boolean;
  cancelNote?: string;
  actionLabel?: string;
  banner?: {
    tone: PassengerBadgeTone;
    title: string;
    detail?: string;
    meta?: string;
  };
  disclosureBlockReason?: string;
  contactSafetyNote?: string;
  seatbeltNotice?: boolean;
  payment?: PassengerPaymentPresentation;
  certificate?: PassengerCertificatePresentation;
  ratingSummary?: {
    state: DriverRatingDisplayState | "unavailable";
    scoreText?: string;
    countText?: string;
    chips?: string[];
  };
  driver: {
    name: string;
    vehicle: string;
    plateNo: string;
    color: string;
    registrationMaskedDisplay: string;
    registrationEffectiveUntil: string;
    ratingState: DriverRatingDisplayState | "unavailable";
  };
  assignment: PassengerDispatchDisclosureSnapshot | null;
  fareVersion?: MultiTaxiPublicFareVersion;
  timeline: PassengerTimelineEvent[];
}

export function resolvePassengerScreenId(
  value: string | string[] | undefined,
  kind: "ride" | "fares" | "receipt",
): PassengerScreenId {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (
    normalized &&
    PASSENGER_SCREEN_IDS.includes(normalized as PassengerScreenId)
  ) {
    return normalized as PassengerScreenId;
  }

  if (kind === "fares") return "A03";
  return kind === "receipt" ? "P5-10" : "P5-01";
}
