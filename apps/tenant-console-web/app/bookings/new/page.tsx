import type {
  EmptyReason,
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

function buildDirectorySnapshot(params: {
  kind: BookingCreateDirectorySnapshot["kind"];
  label: string;
  href: string;
  ctaLabel: string;
  result:
    | PromiseSettledResult<
        TenantPassengerRecord[] | TenantAddressRecord[] | TenantCostCenterRecord[]
      >
    | undefined;
  activeCount: number;
}): BookingCreateDirectorySnapshot {
  const { kind, label, href, ctaLabel, result, activeCount } = params;

  if (!result || result.status === "rejected") {
    return {
      kind,
      label,
      href,
      ctaLabel,
      count: 0,
      reason: "fetch_failed",
      message:
        "Directory data could not be loaded from the tenant API. Retry the page refresh before creating a command.",
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
          ? "Canonical tenant cost-center rows are available for quota and approval evaluation."
          : "Directory-backed records are available for quick booking prefill.",
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
    message:
      emptyReason === "not_provisioned"
        ? "No active cost-center register is published for this tenant yet."
        : "This tenant does not have any active records yet for booking prefill.",
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
    }),
    buildDirectorySnapshot({
      kind: "addresses",
      label: "Address book",
      href: "/addresses",
      ctaLabel: "Open addresses",
      result: addressesResult,
      activeCount: activeAddresses.length,
    }),
    buildDirectorySnapshot({
      kind: "cost_centers",
      label: "Cost centers",
      href: "/cost-centers",
      ctaLabel: "Open cost centers",
      result: costCentersResult,
      activeCount: activeCostCenters.length,
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

  return (
    <TenantBookingCreateForm
      addresses={activeAddresses}
      costCenters={activeCostCenters}
      directorySnapshots={directorySnapshots}
      initialPrefill={initialPrefill}
      passengers={activePassengers}
      refreshMetadata={refreshMetadata}
    />
  );
}
