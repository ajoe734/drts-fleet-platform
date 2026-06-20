import type { MoneyAmount, OwnedOrderRecord } from "@drts/contracts";

export const OWNED_MOBILITY_TRIP_COMPLETED_EVENT =
  "owned-mobility.trip.completed";

export type OwnedMobilityTripCompletedEvent = {
  tenantId: string;
  driverId: string;
  orderId: string;
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
  serviceProductId?: string | null;
  serviceProductCode?: string | null;
  serviceProductVersion?: string | null;
  eligibilityPolicyVersion?: string | null;
  tenantServiceProgramId?: string | null;
  sourcePlatform?: string | null;
};
