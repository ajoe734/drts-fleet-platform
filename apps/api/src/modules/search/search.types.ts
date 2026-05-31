import type { SearchResultRecord } from "@drts/contracts";

export const OPS_SEARCH_CATEGORIES = [
  "orders",
  "dispatch",
  "drivers",
  "vehicles",
  "complaints",
  "incidents",
] as const;

export type OpsSearchCategory = (typeof OPS_SEARCH_CATEGORIES)[number];

export interface SearchResultGroup {
  category: OpsSearchCategory;
  items: SearchResultRecord[];
}

export interface OpsSearchResponse {
  query: string;
  types: OpsSearchCategory[];
  groups: SearchResultGroup[];
  totalResults: number;
}
