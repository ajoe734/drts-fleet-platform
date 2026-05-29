import type { SearchResultRecord } from "@drts/contracts";

export const TENANT_SEARCH_CATEGORIES = [
  "bookings",
  "passengers",
  "addresses",
  "cost-centers",
  "invoices",
] as const;

export type TenantSearchCategory = (typeof TENANT_SEARCH_CATEGORIES)[number];

export interface SearchResultGroup {
  category: TenantSearchCategory;
  items: SearchResultRecord[];
}

export interface TenantSearchResponse {
  query: string;
  types: TenantSearchCategory[];
  groups: SearchResultGroup[];
  totalResults: number;
}
