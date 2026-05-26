"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { RefreshTier } from "@drts/contracts";

const TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

export function RevenueAutoRefresh({
  tier,
  enabled = true,
}: {
  tier: RefreshTier;
  enabled?: boolean;
}) {
  const router = useRouter();
  const cadenceMs = TIER_CADENCE_MS[tier];

  useEffect(() => {
    if (!enabled || cadenceMs === null) return;
    const handle = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, cadenceMs);
    return () => window.clearInterval(handle);
  }, [cadenceMs, enabled, router]);

  return null;
}
