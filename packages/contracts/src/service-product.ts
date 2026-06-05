import type { BusinessDispatchSubtype, Phase1ServiceBucket } from ".";

export const SERVICE_PRODUCT_TYPES = [
  "standard_taxi",
  "enterprise_dispatch",
  "credit_card_airport_transfer",
] as const;
export type ServiceProductType = (typeof SERVICE_PRODUCT_TYPES)[number];

export const SERVICE_TIMINGS = ["realtime", "reservation"] as const;
export type ServiceTiming = (typeof SERVICE_TIMINGS)[number];

export const VEHICLE_LICENSE_TYPES = [
  "taxi",
  "rental",
  "multi_taxi",
  "other",
] as const;
export type VehicleLicenseType = (typeof VEHICLE_LICENSE_TYPES)[number];

export const FLEET_PARTNER_TYPES = [
  "individual_owner",
  "fleet_company_partner",
] as const;
export type FleetPartnerType = (typeof FLEET_PARTNER_TYPES)[number];

export const DRIVER_FLEET_AFFILIATION_STATUSES = [
  "pending",
  "active",
  "suspended",
  "ended",
] as const;
export type DriverFleetAffiliationStatus =
  (typeof DRIVER_FLEET_AFFILIATION_STATUSES)[number];

export const FLEET_PARTNER_REVENUE_SHARE_MODES = [
  "percentage_bps",
  "fixed_amount_minor",
  "hybrid",
] as const;
export type FleetPartnerRevenueShareMode =
  (typeof FLEET_PARTNER_REVENUE_SHARE_MODES)[number];

export const SERVICE_PRODUCT_ERROR_CODES = [
  "SERVICE_PRODUCT_INACTIVE",
  "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
  "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
  "AIRPORT_PERMIT_REQUIRED",
  "FIXED_FARE_NOT_ALLOWED",
  "NO_ELIGIBLE_SUPPLY_FOR_SERVICE_PRODUCT",
] as const;
export type ServiceProductErrorCode =
  (typeof SERVICE_PRODUCT_ERROR_CODES)[number];

export interface ServiceProductRecord {
  serviceProductType: ServiceProductType;
  serviceBucket: Phase1ServiceBucket;
  businessDispatchSubtype: BusinessDispatchSubtype | null;
  displayName: string;
  serviceTiming: ServiceTiming;
  activeFlag: boolean;
  fixedFareAllowed: boolean;
  airportPermitRequired: boolean;
  eligibleVehicleLicenseTypes: VehicleLicenseType[];
  eligibilityNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleServiceCapabilityRecord {
  vehicleId: string;
  serviceProductType: ServiceProductType;
  vehicleLicenseType: VehicleLicenseType;
  serviceTimings: ServiceTiming[];
  eligibleFlag: boolean;
  airportPermitFlag: boolean;
  fixedFareCapable: boolean;
  blockedErrorCodes: ServiceProductErrorCode[];
  notes: string[];
  evaluatedAt: string;
  updatedAt: string;
}

export interface TenantServiceProgramRecord {
  tenantId: string;
  serviceProductType: ServiceProductType;
  serviceTiming: ServiceTiming;
  activeFlag: boolean;
  fleetPartnerId: string | null;
  partnerProgramCode: string | null;
  fixedFareAllowed: boolean;
  airportPermitRequired: boolean;
  eligibleVehicleLicenseTypes: VehicleLicenseType[];
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FleetPartnerRecord {
  fleetPartnerId: string;
  tenantId: string;
  partnerCode: string;
  displayName: string;
  partnerType: FleetPartnerType;
  activeFlag: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  serviceProductTypes: ServiceProductType[];
  createdAt: string;
  updatedAt: string;
}

export interface DriverFleetAffiliationRecord {
  driverId: string;
  fleetPartnerId: string;
  tenantId: string;
  status: DriverFleetAffiliationStatus;
  serviceProductTypes: ServiceProductType[];
  startAt: string;
  endAt: string | null;
  notes: string[];
  updatedAt: string;
}

export interface FleetPartnerRevenueShareRuleRecord {
  ruleId: string;
  fleetPartnerId: string;
  tenantId: string;
  serviceProductType: ServiceProductType;
  mode: FleetPartnerRevenueShareMode;
  percentageBps: number | null;
  fixedAmountMinor: number | null;
  currency: string | null;
  effectiveStartAt: string;
  effectiveEndAt: string | null;
  activeFlag: boolean;
  notes: string[];
  updatedAt: string;
}
