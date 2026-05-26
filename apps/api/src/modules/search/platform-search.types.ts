import type { SearchResultRecord } from "@drts/contracts";

export const PLATFORM_SEARCH_CATEGORY_ORDER = [
  "tenants",
  "partners",
  "users",
  "adapter_registry",
  "audit",
] as const;

export type PlatformSearchCategory =
  (typeof PLATFORM_SEARCH_CATEGORY_ORDER)[number];

export type PlatformSearchResultGroup = {
  category: PlatformSearchCategory;
  items: SearchResultRecord[];
};
