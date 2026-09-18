import type {
  BookingRecord,
  SandboxFulfillmentProjectionView,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

export type TenantAvFallbackStage =
  | "vehicle_change_in_progress"
  | "human_fallback_assigned"
  | "service_continuing";

export type TenantAvActualMode = "av" | "human";

export type TenantAvFallbackListItem = {
  booking: BookingRecord;
  projection: SandboxFulfillmentProjectionView;
  actualMode: TenantAvActualMode;
  fallbackStage: TenantAvFallbackStage | null;
  tenantMessageCode: string;
};

function isFallbackMode(
  projection: SandboxFulfillmentProjectionView,
): boolean {
  return (
    projection.fulfillmentMode === "human_fallback" ||
    projection.fulfillmentMode === "mixed"
  );
}

export function supportsTenantAvFallbackDetail(
  projection: SandboxFulfillmentProjectionView,
): boolean {
  return isFallbackMode(projection);
}

export function resolveTenantAvActualMode(
  projection: SandboxFulfillmentProjectionView,
): TenantAvActualMode {
  return projection.fulfillmentMode === "tesla_av" ? "av" : "human";
}

export function resolveTenantAvFallbackStage(
  projection: SandboxFulfillmentProjectionView,
): TenantAvFallbackStage | null {
  if (!isFallbackMode(projection)) {
    return null;
  }

  if (projection.statusCode.toLowerCase().includes("vehicle_change")) {
    return "vehicle_change_in_progress";
  }

  if (
    projection.state === "en_route_pickup" ||
    projection.state === "arrived_pickup" ||
    projection.state === "in_trip" ||
    projection.state === "completed"
  ) {
    return "service_continuing";
  }

  return "human_fallback_assigned";
}

export function resolveTenantMessageCode(
  projection: SandboxFulfillmentProjectionView,
): string {
  return (
    projection.messages[0]?.messageCode ??
    "sandbox_fulfillment.status_update_available"
  );
}

async function getTenantSandboxFulfillment(
  bookingId: string,
): Promise<SandboxFulfillmentProjectionView> {
  const client = await getTenantClient();
  return client.get<SandboxFulfillmentProjectionView>(
    `/api/tenant/bookings/${encodeURIComponent(bookingId)}/sandbox-fulfillment`,
  );
}

function getListPriority(item: TenantAvFallbackListItem) {
  if (
    item.fallbackStage === "human_fallback_assigned" ||
    item.fallbackStage === "vehicle_change_in_progress"
  ) {
    return 3;
  }

  if (item.actualMode === "av") {
    return 2;
  }

  return 1;
}

export async function loadTenantAvFallbackListItems(
  bookings: BookingRecord[],
): Promise<{ items: TenantAvFallbackListItem[]; degraded: boolean }> {
  const results = await Promise.allSettled(
    bookings.map(async (booking) => ({
      booking,
      projection: await getTenantSandboxFulfillment(booking.bookingId),
    })),
  );

  const items = results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        booking: BookingRecord;
        projection: SandboxFulfillmentProjectionView;
      }> => result.status === "fulfilled",
    )
    .map(({ value }) => ({
      booking: value.booking,
      projection: value.projection,
      actualMode: resolveTenantAvActualMode(value.projection),
      fallbackStage: resolveTenantAvFallbackStage(value.projection),
      tenantMessageCode: resolveTenantMessageCode(value.projection),
    }))
    .filter(({ projection }) => projection.fulfillmentMode !== "hidden")
    .sort((left, right) => {
      const leftPriority = getListPriority(left);
      const rightPriority = getListPriority(right);
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return right.projection.updatedAt.localeCompare(left.projection.updatedAt);
    });

  return {
    items,
    degraded: results.some((result) => result.status === "rejected"),
  };
}

export async function loadTenantAvFallbackDetailItem(
  bookingId: string,
): Promise<TenantAvFallbackListItem | null> {
  const client = await getTenantClient();
  const [bookingResult, projectionResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    getTenantSandboxFulfillment(bookingId),
  ]);

  if (
    bookingResult.status !== "fulfilled" ||
    projectionResult.status !== "fulfilled"
  ) {
    return null;
  }

  const projection = projectionResult.value;
  if (projection.fulfillmentMode === "hidden") {
    return null;
  }

  return {
    booking: bookingResult.value,
    projection,
    actualMode: resolveTenantAvActualMode(projection),
    fallbackStage: resolveTenantAvFallbackStage(projection),
    tenantMessageCode: resolveTenantMessageCode(projection),
  };
}
