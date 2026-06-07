import type { RefreshTier } from "@drts/contracts";

type RefreshTierDefinition = {
  label: string;
  staleAfterMs: number;
};

export function getRefreshTierDefinition(
  tier: RefreshTier,
): RefreshTierDefinition {
  switch (tier) {
    case "urgent":
      return { label: "T1 · 即時推送 + 5 秒備援", staleAfterMs: 5_000 };
    case "fast":
      return { label: "T2 · 3s", staleAfterMs: 3_000 };
    case "dispatch":
      return { label: "T3 · 5s", staleAfterMs: 5_000 };
    case "medium":
      return { label: "T4 · 15s", staleAfterMs: 15_000 };
    case "medium_slow":
    case "slow":
      return { label: "T5 · 30s", staleAfterMs: 30_000 };
    case "manual":
      return { label: "T6 · 手動刷新", staleAfterMs: Number.MAX_SAFE_INTEGER };
  }
}
