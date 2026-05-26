import type {
  BusinessDispatchSubtype,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { BUSINESS_DISPATCH_SUBTYPES } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  TenantBookingCreateForm,
  type TenantBookingCreatePageModel,
} from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

const BOOKING_CREATE_REFRESH_TIER: RefreshTier = "manual";
const EMPTY_REASON_VALUES: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseEmptyReason(
  value: string | undefined,
): EmptyStateEnvelope["reason"] | null {
  if (!value) {
    return null;
  }

  return EMPTY_REASON_VALUES.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function parseSubtype(value: string | undefined): BusinessDispatchSubtype {
  return BUSINESS_DISPATCH_SUBTYPES.includes(value as BusinessDispatchSubtype)
    ? (value as BusinessDispatchSubtype)
    : "credit_card_airport_transfer";
}

function buildAction(
  action: string,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  options: Partial<ResourceActionDescriptor> = {},
): ResourceActionDescriptor {
  return {
    action,
    enabled: true,
    riskLevel,
    ...options,
  };
}

function buildHealthEnvelope(
  errors: string[],
  timestamp: string,
): UiHealthEnvelope {
  if (errors.length === 0) {
    return {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: timestamp,
    };
  }

  return {
    status: "degraded",
    degradedServices: errors.map((message) => ({
      service: message.split(":")[0] ?? "directory",
      impact: message,
      severity: "warning",
    })),
    lastCheckedAt: timestamp,
  };
}

function buildEmptyState(params: {
  activeAddresses: TenantAddressRecord[];
  activeCostCenters: TenantCostCenterRecord[];
  activePassengers: TenantPassengerRecord[];
  costCenterLoadFailed: boolean;
  invalidPrefill: boolean;
  overrideReason: EmptyStateEnvelope["reason"] | null;
  actions: TenantBookingCreatePageModel["actions"];
}): EmptyStateEnvelope | null {
  const {
    activeAddresses,
    activeCostCenters,
    activePassengers,
    costCenterLoadFailed,
    invalidPrefill,
    overrideReason,
    actions,
  } = params;

  const actionForReason: Record<
    EmptyStateEnvelope["reason"],
    ResourceActionDescriptor | undefined
  > = {
    no_data: actions.managePassengers,
    not_provisioned: actions.manageCostCenters,
    fetch_failed: actions.refresh,
    permission_denied: actions.viewBookings,
    external_unavailable: actions.refresh,
    filtered_empty: actions.clearShortcuts,
    driver_not_eligible: undefined,
  };

  if (overrideReason) {
    return {
      reason: overrideReason,
      messageCode: `tenant.booking_create.empty.${overrideReason}`,
      ...(actionForReason[overrideReason]
        ? { nextAction: actionForReason[overrideReason] }
        : {}),
    };
  }

  if (invalidPrefill) {
    return {
      reason: "filtered_empty",
      messageCode: "tenant.booking_create.prefill.filtered_empty",
      nextAction: actions.clearShortcuts,
    };
  }

  if (costCenterLoadFailed) {
    return {
      reason: "fetch_failed",
      messageCode: "tenant.booking_create.cost_centers.fetch_failed",
      nextAction: actions.refresh,
    };
  }

  if (activeCostCenters.length === 0) {
    return {
      reason: "not_provisioned",
      messageCode: "tenant.booking_create.cost_centers.not_provisioned",
      nextAction: actions.manageCostCenters,
    };
  }

  if (activePassengers.length === 0 && activeAddresses.length === 0) {
    return {
      reason: "no_data",
      messageCode: "tenant.booking_create.directory.no_data",
      nextAction: actions.managePassengers,
    };
  }

  return null;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();

  const [passengersResult, addressesResult, costCentersResult] =
    await Promise.allSettled([
      client.listPassengers() as Promise<TenantPassengerRecord[]>,
      client.listAddresses() as Promise<TenantAddressRecord[]>,
      client.listCostCenters({ activeOnly: true }) as Promise<
        TenantCostCenterRecord[]
      >,
    ]);

  const errors: string[] = [];
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  const addresses =
    addressesResult.status === "fulfilled" ? addressesResult.value : [];
  const costCenters =
    costCentersResult.status === "fulfilled" ? costCentersResult.value : [];

  if (passengersResult.status === "rejected") {
    errors.push(`passengers: ${toErrorMessage(passengersResult.reason)}`);
  }
  if (addressesResult.status === "rejected") {
    errors.push(`addresses: ${toErrorMessage(addressesResult.reason)}`);
  }
  if (costCentersResult.status === "rejected") {
    errors.push(`cost_centers: ${toErrorMessage(costCentersResult.reason)}`);
  }

  const activePassengers = passengers.filter((row) => row.activeFlag);
  const activeAddresses = addresses.filter((row) => row.activeFlag);
  const activeCostCenters = costCenters.filter((row) => row.activeFlag);

  const passengerId = firstParam(resolvedSearchParams.passengerId);
  const legacyAddressId = firstParam(resolvedSearchParams.addressId);
  const addressRole = firstParam(resolvedSearchParams.addressRole);
  const pickupAddressId =
    firstParam(resolvedSearchParams.pickupAddressId) ||
    (addressRole !== "dropoff" ? legacyAddressId : "");
  const dropoffAddressId =
    firstParam(resolvedSearchParams.dropoffAddressId) ||
    (addressRole === "dropoff" ? legacyAddressId : "");
  const prefillPassenger = passengerId
    ? activePassengers.find((row) => row.passengerId === passengerId) ?? null
    : null;
  const prefillPickup = pickupAddressId
    ? activeAddresses.find((row) => row.addressId === pickupAddressId) ?? null
    : null;
  const prefillDropoff = dropoffAddressId
    ? activeAddresses.find((row) => row.addressId === dropoffAddressId) ?? null
    : null;

  const actions: TenantBookingCreatePageModel["actions"] = {
    submit: buildAction("submit_command", "medium"),
    cancel: buildAction("cancel", "low"),
    refresh: buildAction("refresh", "low"),
    viewBookings: buildAction("view_bookings", "low"),
    clearShortcuts: buildAction("clear_shortcuts", "low"),
    managePassengers: buildAction("manage_passengers", "low"),
    manageAddresses: buildAction("manage_addresses", "low"),
    manageCostCenters: buildAction("manage_cost_centers", "low"),
    reviewRules: buildAction("review_rules", "low"),
  };

  const invalidPrefill =
    (Boolean(passengerId) && !prefillPassenger) ||
    (Boolean(pickupAddressId) && !prefillPickup) ||
    (Boolean(dropoffAddressId) && !prefillDropoff);

  const prefillBadges = [
    prefillPassenger ? `Passenger · ${prefillPassenger.fullName}` : null,
    prefillPickup ? `Pickup · ${prefillPickup.addressName}` : null,
    prefillDropoff ? `Drop-off · ${prefillDropoff.addressName}` : null,
  ].filter(Boolean) as string[];

  const pageModel: TenantBookingCreatePageModel = {
    refreshTier: BOOKING_CREATE_REFRESH_TIER,
    refresh: {
      generatedAt,
      staleAfterMs: 30_000,
      dataFreshness: errors.length > 0 ? "degraded" : "fresh",
      source: "live",
    } satisfies UiRefreshMetadata,
    health: buildHealthEnvelope(errors, generatedAt),
    emptyState: buildEmptyState({
      activeAddresses,
      activeCostCenters,
      activePassengers,
      costCenterLoadFailed: costCentersResult.status === "rejected",
      invalidPrefill,
      overrideReason: parseEmptyReason(
        firstParam(resolvedSearchParams.emptyReason),
      ),
      actions,
    }),
    actions,
    links: {
      bookings: "/bookings",
      clearShortcuts: "/bookings/new",
      passengers: "/passengers",
      addresses: "/addresses",
      costCenters: "/cost-centers",
      rules: "/rules",
      audit: "/audit",
    },
    prefill: {
      businessDispatchSubtype: parseSubtype(
        firstParam(resolvedSearchParams.subtype),
      ),
      direction:
        firstParam(resolvedSearchParams.direction) === "pickup" ||
        firstParam(resolvedSearchParams.direction) === "dropoff"
          ? (firstParam(resolvedSearchParams.direction) as
              | "pickup"
              | "dropoff")
          : "",
      selectedPassengerId: prefillPassenger?.passengerId ?? "",
      pickupAddressId: prefillPickup?.addressId ?? "",
      dropoffAddressId: prefillDropoff?.addressId ?? "",
      badges: prefillBadges,
      sourceLabel:
        prefillBadges.length > 0
          ? "Shortcut prefill from tenant directory"
          : null,
    },
    errors,
  };

  return (
    <TenantBookingCreateForm
      addresses={activeAddresses}
      costCenters={activeCostCenters}
      pageModel={pageModel}
      passengers={activePassengers}
    />
  );
}
