import {
  convertCalendarRangeToInstantRange,
  DEFAULT_PRODUCT_TIMEZONE,
  type ApiPageInfo,
  type BookingStatus,
  type TenantBookingListQuery,
} from "@drts/contracts";

// SR-ENTERPRISE-SEARCH-001: composable, testable enterprise booking history
// search state. Pure functions only, and importing only from @drts/contracts
// (aliased directly to source in the root vitest.config.ts), so root Vitest
// (tests/unit/system-remediation/sr-enterprise-search-001/) can import this
// module without resolving @drts/api-client, "use client" React components,
// or this app's own "@/" alias — none of which the root Vitest config wires
// up.

export interface EnterpriseBookingSearchFilters {
  passenger: string;
  status: BookingStatus | "";
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS: EnterpriseBookingSearchFilters =
  {
    passenger: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  };

export const ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
export const DEFAULT_ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE = 10;

export function hasActiveEnterpriseBookingFilters(
  filters: EnterpriseBookingSearchFilters,
): boolean {
  return Boolean(
    filters.passenger.trim() !== "" ||
      filters.status !== "" ||
      filters.dateFrom !== "" ||
      filters.dateTo !== "",
  );
}

/**
 * Calendar dateFrom/dateTo are compared as plain YYYY-MM-DD strings, which
 * sort lexicographically the same as chronologically.
 */
export function validateEnterpriseBookingDateRange(
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom || !dateTo) return true;
  return dateFrom <= dateTo;
}

export function buildEnterpriseBookingSearchQuery(
  filters: EnterpriseBookingSearchFilters,
  page: number,
  pageSize: number,
  timeZone: string = DEFAULT_PRODUCT_TIMEZONE,
): TenantBookingListQuery {
  const query: TenantBookingListQuery = { page, pageSize };

  const passenger = filters.passenger.trim();
  if (passenger) {
    query.passenger = passenger;
  }
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.dateFrom && filters.dateTo) {
    const range = convertCalendarRangeToInstantRange(
      filters.dateFrom,
      filters.dateTo,
      { timeZone },
    );
    query.dateFrom = range.dateFrom;
    query.dateTo = range.dateTo;
  } else if (filters.dateFrom) {
    const range = convertCalendarRangeToInstantRange(
      filters.dateFrom,
      filters.dateFrom,
      { timeZone },
    );
    query.dateFrom = range.dateFrom;
  } else if (filters.dateTo) {
    const range = convertCalendarRangeToInstantRange(
      filters.dateTo,
      filters.dateTo,
      { timeZone },
    );
    query.dateTo = range.dateTo;
  }

  return query;
}

export function formatEnterpriseBookingTime(
  isoString: string | null | undefined,
): string {
  if (!isoString) return "-";
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

export function computeEnterpriseBookingPageRangeLabel(
  pagination: ApiPageInfo,
  itemsLength: number,
): string {
  if (pagination.totalItems === 0 || itemsLength === 0) return "";
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = start + itemsLength - 1;
  return `${start}-${end}`;
}
