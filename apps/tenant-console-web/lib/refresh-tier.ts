import type { RefreshTier } from "@drts/contracts";

type RefreshTierDescriptor = {
  cadenceMs: number | null;
  cadenceLabel: string;
};

const REFRESH_TIER_DESCRIPTORS: Record<RefreshTier, RefreshTierDescriptor> = {
  urgent: { cadenceMs: 5_000, cadenceLabel: "5s fallback poll" },
  fast: { cadenceMs: 3_000, cadenceLabel: "3s poll" },
  dispatch: { cadenceMs: 5_000, cadenceLabel: "5s poll" },
  medium: { cadenceMs: 15_000, cadenceLabel: "15s poll" },
  medium_slow: { cadenceMs: 30_000, cadenceLabel: "30s poll" },
  slow: { cadenceMs: 30_000, cadenceLabel: "30s poll" },
  manual: { cadenceMs: null, cadenceLabel: "manual refresh only" },
};

export function getRefreshTierDescriptor(tier: RefreshTier) {
  return REFRESH_TIER_DESCRIPTORS[tier];
}
