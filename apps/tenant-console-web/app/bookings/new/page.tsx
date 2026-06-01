import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  TenantBookingCreateForm,
  type BookingCreateDirectorySnapshot,
  type BookingCreatePrefill,
} from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  {
    action: "submit_booking",
    enabled: true,
    riskLevel: "medium",
  },
  {
    action: "cancel_form",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "save_draft",
    enabled: false,
    disabledReasonCode: "drafts_not_supported",
    riskLevel: "low",
  },
] as const;

const CROSS_APP_LINKS: readonly CrossAppResourceLink[] = [
  {
    targetApp: "ops-console",
    route: "/audit?resourceType=tenant_booking_command",
    resourceType: "audit_entry",
    resourceId: "tenant-booking-command",
    openMode: "new_tab",
    label: "Ops command audit",
  },
  {
    targetApp: "platform-admin",
    route: "/webhooks?scope=tenant-booking",
    resourceType: "webhook_delivery",
    resourceId: "tenant-booking",
    openMode: "new_tab",
    label: "Platform webhook diagnostics",
  },
] as const;

function getEmptyReasonMessage(
  kind: BookingCreateDirectorySnapshot["kind"],
  reason: EmptyReason,
) {
  switch (reason) {
    case "not_provisioned":
      return kind === "cost_centers"
        ? "No active cost-center register is published for this tenant yet."
        : "This prerequisite directory has not been provisioned for the tenant yet.";
    case "fetch_failed":
      return "Directory data could not be loaded from the tenant API. Refresh before creating a booking command.";
    case "permission_denied":
      return "Your tenant role can view the booking form but cannot read this directory payload.";
    case "external_unavailable":
      return "The upstream source for this directory is temporarily unavailable. Retry after the dependency recovers.";
    case "filtered_empty":
      return "Current filters or inactive-only state hide all eligible records for booking prefill.";
    case "no_data":
    default:
      return kind === "cost_centers"
        ? "No active cost-center rows are available for quota and approval evaluation."
        : "No active directory rows are available yet for booking prefill.";
  }
}

function parseEmptyReason(
  value: string | string[] | undefined,
): EmptyReason | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) {
    return null;
  }

  return EMPTY_REASONS.includes(normalized as EmptyReason)
    ? (normalized as EmptyReason)
    : null;
}

function buildDirectorySnapshot(params: {
  kind: BookingCreateDirectorySnapshot["kind"];
  label: string;
  href: string;
  ctaLabel: string;
  result:
    | PromiseSettledResult<
        | TenantPassengerRecord[]
        | TenantAddressRecord[]
        | TenantCostCenterRecord[]
      >
    | undefined;
  activeCount: number;
  overrideReason?: EmptyReason | null;
}): BookingCreateDirectorySnapshot {
  const { kind, label, href, ctaLabel, result, activeCount, overrideReason } =
    params;

  if (overrideReason) {
    return {
      kind,
      label,
      href,
      ctaLabel,
      count: 0,
      reason: overrideReason,
      message: getEmptyReasonMessage(kind, overrideReason),
    };
  }

  if (!result || result.status === "rejected") {
    return {
      kind,
      label,
      href,
      ctaLabel,
      count: 0,
      reason: "fetch_failed",
      message: getEmptyReasonMessage(kind, "fetch_failed"),
    };
  }

  if (activeCount > 0) {
    return {
      kind,
      label,
      href,
      ctaLabel,
      count: activeCount,
      reason: null,
      message:
        kind === "cost_centers"
          ? "Canonical cost-center rows are available for quota and approval preview."
          : "Directory-backed records are available for booking prefill shortcuts.",
    };
  }

  const emptyReason: EmptyReason =
    kind === "cost_centers" ? "not_provisioned" : "no_data";

  return {
    kind,
    label,
    href,
    ctaLabel,
    count: 0,
    reason: emptyReason,
    message: getEmptyReasonMessage(kind, emptyReason),
  };
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = getTenantClient();
  const resolvedSearchParams = await searchParams;
  const [passengersResult, addressesResult, costCentersResult] =
    await Promise.allSettled([
      client.listPassengers() as Promise<TenantPassengerRecord[]>,
      client.listAddresses() as Promise<TenantAddressRecord[]>,
      client.listCostCenters({ activeOnly: true }) as Promise<
        TenantCostCenterRecord[]
      >,
    ]);

  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  const addresses =
    addressesResult.status === "fulfilled" ? addressesResult.value : [];
  const costCenters =
    costCentersResult.status === "fulfilled" ? costCentersResult.value : [];

  const activePassengers = passengers.filter((row) => row.activeFlag);
  const activeAddresses = addresses.filter((row) => row.activeFlag);
  const activeCostCenters = costCenters.filter((row) => row.activeFlag);

  const directorySnapshots: BookingCreateDirectorySnapshot[] = [
    buildDirectorySnapshot({
      kind: "passengers",
      label: "Passenger directory",
      href: "/passengers",
      ctaLabel: "Open passengers",
      result: passengersResult,
      activeCount: activePassengers.length,
      overrideReason: parseEmptyReason(resolvedSearchParams.passengersReason),
    }),
    buildDirectorySnapshot({
      kind: "addresses",
      label: "Address book",
      href: "/addresses",
      ctaLabel: "Open addresses",
      result: addressesResult,
      activeCount: activeAddresses.length,
      overrideReason: parseEmptyReason(resolvedSearchParams.addressesReason),
    }),
    buildDirectorySnapshot({
      kind: "cost_centers",
      label: "Cost centers",
      href: "/cost-centers",
      ctaLabel: "Open cost centers",
      result: costCentersResult,
      activeCount: activeCostCenters.length,
      overrideReason: parseEmptyReason(resolvedSearchParams.costCentersReason),
    }),
  ];

  const initialPrefill: BookingCreatePrefill = {
    passengerId: readSearchParam(resolvedSearchParams, "passengerId") ?? null,
    pickupAddressId:
      readSearchParam(resolvedSearchParams, "pickupAddressId") ?? null,
    dropoffAddressId:
      readSearchParam(resolvedSearchParams, "dropoffAddressId") ?? null,
  };
  const refreshMetadata: UiRefreshMetadata = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 0,
    dataFreshness: "fresh",
    source: "live",
  };
  const refreshTier: RefreshTier = "manual";

  return (
    <TenantBookingCreateForm
      addresses={activeAddresses}
      availableActions={[...ROUTE_ACTIONS]}
      costCenters={activeCostCenters}
      crossAppLinks={[...CROSS_APP_LINKS]}
      directorySnapshots={directorySnapshots}
      initialPrefill={initialPrefill}
      passengers={activePassengers}
      refreshMetadata={refreshMetadata}
      refreshTier={refreshTier}
    />
  );
}
