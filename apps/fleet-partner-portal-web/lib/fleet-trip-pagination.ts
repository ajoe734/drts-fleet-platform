// Match the portal's existing Host list convention. Always filter the full
// partner/period result before paging; CSV callers keep that unsliced result.
export const FLEET_TRIP_PAGE_SIZE = 20;

export function paginateFleetTrips<T>(rows: T[], requestedPage?: string) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / FLEET_TRIP_PAGE_SIZE));
  const parsed = Number(requestedPage);
  const page = Math.min(
    Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1,
    totalPages,
  );
  return {
    rows: rows.slice(
      (page - 1) * FLEET_TRIP_PAGE_SIZE,
      page * FLEET_TRIP_PAGE_SIZE,
    ),
    pageInfo: { page, totalPages, totalItems },
  };
}

export function fleetTripPageHref(
  filters: {
    svc?: string | undefined;
    period?: string | undefined;
    status?: string | undefined;
    q?: string | undefined;
  },
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return `/trips?${params.toString()}`;
}
