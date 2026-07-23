import type { VehicleLicenseType } from "@drts/contracts";

export const SERVICE_PRODUCT_TYPE_VALUES = [
  "taxi_realtime",
  "taxi_reservation",
  "enterprise_dispatch",
  "credit_card_airport_transfer",
  "insurance_replacement_vehicle",
  "travel_agency_transfer",
  "third_party_forwarded_order",
] as const;

export type ServiceProductType = (typeof SERVICE_PRODUCT_TYPE_VALUES)[number];

export const SERVICE_TIMING_VALUES = [
  "realtime",
  "reservation",
  "external_defined",
] as const;

export type ServiceTiming = (typeof SERVICE_TIMING_VALUES)[number];

export const SERVICE_PRODUCT_BILLING_MODE_VALUES = [
  "meter",
  "fixed_fare",
  "tenant_invoice",
  "partner_settlement",
  "external_platform_settlement",
] as const;

export type ServiceProductBillingMode =
  (typeof SERVICE_PRODUCT_BILLING_MODE_VALUES)[number];

export interface ServiceProductRecord {
  serviceProductId: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description: string | null;
  timing: ServiceTiming;
  active: boolean;
  allowedLicenseTypes: VehicleLicenseType[];
  meterRequired: boolean;
  fixedFareAllowed: boolean;
  defaultBillingMode: ServiceProductBillingMode;
  defaultProofRequirements: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceProductCommand {
  serviceProductId?: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description?: string | null;
  timing: ServiceTiming;
  active?: boolean;
  allowedLicenseTypes?: VehicleLicenseType[];
  meterRequired?: boolean;
  fixedFareAllowed?: boolean;
  defaultBillingMode: ServiceProductBillingMode;
  defaultProofRequirements?: string[];
}

export interface UpdateServiceProductCommand {
  displayName?: string;
  description?: string | null;
  timing?: ServiceTiming;
  active?: boolean;
  allowedLicenseTypes?: VehicleLicenseType[];
  meterRequired?: boolean;
  fixedFareAllowed?: boolean;
  defaultBillingMode?: ServiceProductBillingMode;
  defaultProofRequirements?: string[];
}

export type ServiceProductRuntimeProfileCode =
  | "ordinary_taxi"
  | "multi_taxi_direct"
  | "business_dispatch";

export interface RuntimeProfileServiceProductPolicy {
  runtimeProfileCode: ServiceProductRuntimeProfileCode;
  serviceProductCode: ServiceProductType;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRuntimeProfileServiceProductPolicyCommand {
  runtimeProfileCode: ServiceProductRuntimeProfileCode;
  serviceProductCode: ServiceProductType;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}
