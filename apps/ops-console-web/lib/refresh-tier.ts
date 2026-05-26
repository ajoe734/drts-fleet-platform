import type { RefreshTier } from "@drts/contracts";

const REFRESH_INTERVALS_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

export function getRefreshIntervalMs(tier: RefreshTier): number | null {
  return REFRESH_INTERVALS_MS[tier];
}
