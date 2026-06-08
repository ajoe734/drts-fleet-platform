import type { RefreshTier } from "@drts/contracts";

export type CanvasPageRefreshPolicy = {
  packetTier: `T${number}`;
  runtimeTier: RefreshTier;
};

export const TENANT_PAGE_REFRESH_POLICIES = {
  invoices: {
    packetTier: "T5",
    runtimeTier: "slow",
  },
} satisfies Record<string, CanvasPageRefreshPolicy>;
