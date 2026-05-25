import { HttpStatus } from "@nestjs/common";

import type { SearchResultRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

export const TENANT_SEARCH_CATEGORIES = [
  "bookings",
  "passengers",
  "addresses",
  "cost-centers",
  "invoices",
] as const;

export type TenantSearchCategory = (typeof TENANT_SEARCH_CATEGORIES)[number];

export interface TenantSearchGroup {
  category: TenantSearchCategory;
  items: SearchResultRecord[];
}

export interface TenantSearchResponse {
  query: string;
  groups: TenantSearchGroup[];
}

export interface TenantSearchQuery {
  q: string;
  types?: TenantSearchCategory[];
}

const TENANT_SEARCH_CATEGORY_ALIASES: Record<string, TenantSearchCategory> = {
  bookings: "bookings",
  passengers: "passengers",
  addresses: "addresses",
  "cost-centers": "cost-centers",
  cost_centers: "cost-centers",
  costcenters: "cost-centers",
  invoices: "invoices",
};

export function parseTenantSearchTypes(
  rawTypes?: string | null,
): TenantSearchCategory[] | undefined {
  const normalizedTypes = rawTypes?.trim();
  if (!normalizedTypes) {
    return undefined;
  }

  const resolvedTypes: TenantSearchCategory[] = [];

  for (const rawType of normalizedTypes.split(",")) {
    const normalizedType = rawType.trim().toLowerCase();
    if (!normalizedType) {
      continue;
    }

    const resolvedType = TENANT_SEARCH_CATEGORY_ALIASES[normalizedType];
    if (!resolvedType) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SEARCH_TYPE_INVALID",
        "The tenant search type is not supported.",
        {
          type: rawType.trim(),
          allowedTypes: TENANT_SEARCH_CATEGORIES,
        },
      );
    }

    if (!resolvedTypes.includes(resolvedType)) {
      resolvedTypes.push(resolvedType);
    }
  }

  return resolvedTypes.length > 0 ? resolvedTypes : undefined;
}
