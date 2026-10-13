import { PLATFORM_CURRENCY } from "@drts/contracts";
import type {
  ActualTripFareBreakdown,
  DriverDeclaredSurnameSnapshot,
  FulfillmentSegmentRecord,
  MoneyAmount,
  OwnedOrderRecord,
  SandboxBillingTreatmentRecord,
} from "@drts/contracts";

export const OWNED_MOBILITY_TRIP_COMPLETED_EVENT =
  "owned-mobility.trip.completed";
export const OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT =
  "owned-mobility.multi-taxi-trip.completed";

export type OwnedMobilityTripCompletedEvent = {
  tenantId: string;
  driverId: string;
  orderId: string;
  bookingId: string | null;
  completedAt: string;
  grossEarning: MoneyAmount;
  orderSource: OwnedOrderRecord["orderSource"];
  serviceBucket: "business_dispatch";
  businessDispatchSubtype: NonNullable<
    OwnedOrderRecord["businessDispatchSubtype"]
  >;
  costCenterCode: string | null;
  riderId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  benefitReference: string | null;
  serviceProduct?: string | null;
  tenantServiceProgramId?: string | null;
  sourcePlatform?: string | null;
  sandboxFulfillmentSegments?: FulfillmentSegmentRecord[];
  sandboxBillingTreatment?: SandboxBillingTreatmentRecord | null;
};

export type OwnedMobilityMultiTaxiTripCompletedEvent = {
  runtimeProfileCode: "multi_taxi_direct";
  orderId: string;
  tripId: string;
  plateNo: string;
  pickupAt: string;
  dropoffAt: string;
  travelDurationSeconds: number;
  routeSummary: string;
  distanceMeters: number;
  fareMinor: number;
  /** Driver-reported actual components; no aggregate/toll convention or complete E04 inferred. */
  actualFareBreakdown?: ActualTripFareBreakdown;
  tollMinor: number;
  currency: typeof PLATFORM_CURRENCY;
  consumerServicePhone: string;
  authorityComplaintPhone: string;
  completedAt: string;
} & Partial<DriverDeclaredSurnameSnapshot>;
