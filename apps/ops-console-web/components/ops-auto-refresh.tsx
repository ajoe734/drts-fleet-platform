"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { RefreshTier } from "@drts/contracts";

// Generic tiered auto-refresh island. Server pages render a fresh snapshot per
// request; mounting this with the page's RefreshTier (packet §3.2) turns that
// into the fixed-cadence polling the tier mandates. Polling pauses while the
// tab is hidden so background tabs do not hammer the API.
const TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

export function OpsAutoRefresh({
  tier,
  enabled = true,
}: {
  tier: RefreshTier;
  enabled?: boolean;
}) {
  const router = useRouter();
  const cadenceMs = TIER_CADENCE_MS[tier];

  useEffect(() => {
    if (!enabled || cadenceMs === null) {
      return;
    }
    const handle = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, cadenceMs);
    return () => window.clearInterval(handle);
  }, [cadenceMs, enabled, router]);

  return null;
}
