"use client";

import type { ApiClient } from "@drts/api-client";

export type FleetPartnershipType =
  | "driver_recruitment"
  | "fleet_management"
  | "vehicle_owner_group"
  | "business_dispatch_fleet";

export type FleetAffiliationType =
  | "recruited_by"
  | "managed_by"
  | "vehicle_owned_by"
  | "contracted_under";

export type FleetRuleAppliesTo =
  | "all_trips"
  | "tenant_program"
  | "service_product"
  | "driver_group"
  | "platform_source";

export type FleetRuleFormula =
  | "percent_of_gross"
  | "fixed_per_trip"
  | "monthly_fixed"
  | "tiered_bonus";

export interface FleetPartnerRecord {
  fleetPartnerId: string;
  legalName: string;
  displayName: string;
  businessRegistrationNo: string;
  contactName: string;
  contactPhone: string;
  active: boolean;
  partnershipType: FleetPartnershipType;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface DriverFleetAffiliationRecord {
  affiliationId: string;
  driverId: string;
  fleetPartnerId: string;
  affiliationType: FleetAffiliationType;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface FleetPartnerRevenueShareRuleRecord {
  ruleId: string;
  fleetPartnerId: string;
  appliesTo: FleetRuleAppliesTo;
  serviceProduct?: string | undefined;
  tenantServiceProgramId?: string | undefined;
  sourcePlatform?: string | undefined;
  driverGroup?: string | undefined;
  formula: FleetRuleFormula;
  rateBps?: number | undefined;
  fixedAmountMinor?: number | undefined;
  effectiveFrom: string;
  effectiveUntil?: string | undefined;
  active?: boolean | undefined;
}

export interface FleetPartnerStatementRecord {
  statementId: string;
  fleetPartnerId: string;
  periodMonth: string;
  currency?: string | undefined;
  grossAmountMinor?: number | undefined;
  partnerShareMinor?: number | undefined;
  payoutStatus?: string | undefined;
  generatedAt?: string | undefined;
  paidAt?: string | undefined;
}

export interface FleetPartnerFormState {
  legalName: string;
  displayName: string;
  businessRegistrationNo: string;
  contactName: string;
  contactPhone: string;
  active: boolean;
  partnershipType: FleetPartnershipType;
}

export interface FleetAffiliationFormState {
  driverId: string;
  affiliationType: FleetAffiliationType;
  effectiveFrom: string;
  effectiveUntil: string;
}

export interface FleetRuleFormState {
  appliesTo: FleetRuleAppliesTo;
  serviceProduct: string;
  tenantServiceProgramId: string;
  sourcePlatform: string;
  driverGroup: string;
  formula: FleetRuleFormula;
  rateBps: string;
  fixedAmountMinor: string;
  effectiveFrom: string;
  effectiveUntil: string;
}

export const PARTNERSHIP_TYPES: FleetPartnershipType[] = [
  "driver_recruitment",
  "fleet_management",
  "vehicle_owner_group",
  "business_dispatch_fleet",
];

export const AFFILIATION_TYPES: FleetAffiliationType[] = [
  "recruited_by",
  "managed_by",
  "vehicle_owned_by",
  "contracted_under",
];

export const RULE_APPLIES_TO_VALUES: FleetRuleAppliesTo[] = [
  "all_trips",
  "tenant_program",
  "service_product",
  "driver_group",
  "platform_source",
];

export const RULE_FORMULAS: FleetRuleFormula[] = [
  "percent_of_gross",
  "fixed_per_trip",
  "monthly_fixed",
  "tiered_bonus",
];

export const EMPTY_FLEET_PARTNER_FORM: FleetPartnerFormState = {
  legalName: "",
  displayName: "",
  businessRegistrationNo: "",
  contactName: "",
  contactPhone: "",
  active: true,
  partnershipType: "driver_recruitment",
};

export const EMPTY_AFFILIATION_FORM: FleetAffiliationFormState = {
  driverId: "",
  affiliationType: "recruited_by",
  effectiveFrom: "",
  effectiveUntil: "",
};

export const EMPTY_RULE_FORM: FleetRuleFormState = {
  appliesTo: "all_trips",
  serviceProduct: "",
  tenantServiceProgramId: "",
  sourcePlatform: "",
  driverGroup: "",
  formula: "percent_of_gross",
  rateBps: "",
  fixedAmountMinor: "",
  effectiveFrom: "",
  effectiveUntil: "",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : Boolean(value);
}

function firstString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function firstBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return false;
}

function firstNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function normalizeFleetPartnerRecord(
  input: unknown,
): FleetPartnerRecord {
  const record = asObject(input);

  return {
    fleetPartnerId: firstString(record, "fleetPartnerId", "id"),
    legalName: firstString(record, "legalName"),
    displayName: firstString(record, "displayName", "name"),
    businessRegistrationNo: firstString(
      record,
      "businessRegistrationNo",
      "businessRegistrationNumber",
    ),
    contactName: firstString(record, "contactName"),
    contactPhone: firstString(record, "contactPhone"),
    active: firstBoolean(record, "active"),
    partnershipType:
      (firstString(record, "partnershipType") as FleetPartnershipType) ||
      "driver_recruitment",
    createdAt: asString(record.createdAt) || undefined,
    updatedAt: asString(record.updatedAt) || undefined,
  };
}

export function normalizeAffiliationRecord(
  input: unknown,
): DriverFleetAffiliationRecord {
  const record = asObject(input);

  return {
    affiliationId: firstString(record, "affiliationId", "id"),
    driverId: firstString(record, "driverId"),
    fleetPartnerId: firstString(record, "fleetPartnerId"),
    affiliationType:
      (firstString(record, "affiliationType") as FleetAffiliationType) ||
      "recruited_by",
    effectiveFrom: firstString(record, "effectiveFrom"),
    effectiveUntil: asString(record.effectiveUntil) || null,
  };
}

export function normalizeRuleRecord(
  input: unknown,
): FleetPartnerRevenueShareRuleRecord {
  const record = asObject(input);

  return {
    ruleId: firstString(record, "ruleId", "id"),
    fleetPartnerId: firstString(record, "fleetPartnerId"),
    appliesTo:
      (firstString(record, "appliesTo") as FleetRuleAppliesTo) || "all_trips",
    serviceProduct: asString(record.serviceProduct) || undefined,
    tenantServiceProgramId:
      asString(record.tenantServiceProgramId) || undefined,
    sourcePlatform: asString(record.sourcePlatform) || undefined,
    driverGroup: asString(record.driverGroup) || undefined,
    formula:
      (firstString(record, "formula") as FleetRuleFormula) ||
      "percent_of_gross",
    rateBps: firstNumber(record, "rateBps"),
    fixedAmountMinor: firstNumber(record, "fixedAmountMinor"),
    effectiveFrom: firstString(record, "effectiveFrom"),
    effectiveUntil: asString(record.effectiveUntil) || undefined,
    active:
      typeof record.active === "boolean" ? asBoolean(record.active) : undefined,
  };
}

export function normalizeStatementRecord(
  input: unknown,
): FleetPartnerStatementRecord {
  const record = asObject(input);

  return {
    statementId: firstString(record, "statementId", "id"),
    fleetPartnerId: firstString(record, "fleetPartnerId"),
    periodMonth: firstString(record, "periodMonth", "period"),
    currency: asString(record.currency) || undefined,
    grossAmountMinor: firstNumber(record, "grossAmountMinor", "grossMinor"),
    partnerShareMinor: firstNumber(
      record,
      "partnerShareMinor",
      "shareAmountMinor",
    ),
    payoutStatus: firstString(record, "payoutStatus", "status") || undefined,
    generatedAt: asString(record.generatedAt) || undefined,
    paidAt: asString(record.paidAt) || undefined,
  };
}

export function toFleetPartnerFormState(
  record: FleetPartnerRecord,
): FleetPartnerFormState {
  return {
    legalName: record.legalName,
    displayName: record.displayName,
    businessRegistrationNo: record.businessRegistrationNo,
    contactName: record.contactName,
    contactPhone: record.contactPhone,
    active: record.active,
    partnershipType: record.partnershipType,
  };
}

export async function listFleetPartners(client: ApiClient) {
  const result = await client.get<unknown[]>("/api/admin/fleet-partners");
  return (result ?? []).map(normalizeFleetPartnerRecord);
}

export async function getFleetPartner(
  client: ApiClient,
  fleetPartnerId: string,
) {
  const result = await client.get<unknown>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}`,
  );
  return normalizeFleetPartnerRecord(result);
}

export async function createFleetPartner(
  client: ApiClient,
  form: FleetPartnerFormState,
) {
  const result = await client.post<unknown>("/api/admin/fleet-partners", {
    body: {
      legalName: form.legalName,
      displayName: form.displayName,
      businessRegistrationNo: form.businessRegistrationNo,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      active: form.active,
      partnershipType: form.partnershipType,
    },
  });
  return normalizeFleetPartnerRecord(result);
}

export async function updateFleetPartner(
  client: ApiClient,
  fleetPartnerId: string,
  form: FleetPartnerFormState,
) {
  const result = await client.put<unknown>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}`,
    {
      body: {
        legalName: form.legalName,
        displayName: form.displayName,
        businessRegistrationNo: form.businessRegistrationNo,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        active: form.active,
        partnershipType: form.partnershipType,
      },
    },
  );
  return normalizeFleetPartnerRecord(result);
}

export async function listFleetPartnerDrivers(
  client: ApiClient,
  fleetPartnerId: string,
) {
  const result = await client.get<unknown[]>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}/drivers`,
  );
  return (result ?? []).map(normalizeAffiliationRecord);
}

export async function createDriverAffiliation(
  client: ApiClient,
  fleetPartnerId: string,
  form: FleetAffiliationFormState,
) {
  const result = await client.post<unknown>(
    `/api/admin/drivers/${encodeURIComponent(form.driverId)}/fleet-affiliations`,
    {
      body: {
        fleetPartnerId,
        affiliationType: form.affiliationType,
        effectiveFrom: form.effectiveFrom,
        effectiveUntil: form.effectiveUntil || null,
      },
    },
  );
  return normalizeAffiliationRecord(result);
}

export async function listRevenueShareRules(
  client: ApiClient,
  fleetPartnerId: string,
) {
  const result = await client.get<unknown[]>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}/revenue-share-rules`,
  );
  return (result ?? []).map(normalizeRuleRecord);
}

export async function createRevenueShareRule(
  client: ApiClient,
  fleetPartnerId: string,
  form: FleetRuleFormState,
) {
  const body: Record<string, unknown> = {
    appliesTo: form.appliesTo,
    formula: form.formula,
    effectiveFrom: form.effectiveFrom,
  };

  if (form.serviceProduct) {
    body.serviceProduct = form.serviceProduct;
  }
  if (form.tenantServiceProgramId) {
    body.tenantServiceProgramId = form.tenantServiceProgramId;
  }
  if (form.sourcePlatform) {
    body.sourcePlatform = form.sourcePlatform;
  }
  if (form.driverGroup) {
    body.driverGroup = form.driverGroup;
  }
  if (form.rateBps) {
    body.rateBps = Number(form.rateBps);
  }
  if (form.fixedAmountMinor) {
    body.fixedAmountMinor = Number(form.fixedAmountMinor);
  }
  if (form.effectiveUntil) {
    body.effectiveUntil = form.effectiveUntil;
  }

  const result = await client.post<unknown>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}/revenue-share-rules`,
    { body },
  );
  return normalizeRuleRecord(result);
}

export async function listFleetStatements(
  client: ApiClient,
  fleetPartnerId: string,
) {
  const result = await client.get<unknown[]>(
    `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}/statements`,
  );
  return (result ?? []).map(normalizeStatementRecord);
}

export function formatMoneyMinor(
  locale: string,
  amountMinor: number | undefined,
  currency = "TWD",
) {
  if (amountMinor === undefined) {
    return "—";
  }

  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-TW", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
