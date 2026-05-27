"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RevenueRefreshControllerProps = {
  refreshTier: "medium";
  staleAfterMs: number;
  enabled: boolean;
};

export function RevenueRefreshController({
  refreshTier,
  staleAfterMs,
  enabled,
}: RevenueRefreshControllerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || refreshTier !== "medium") {
      return;
    }

    const intervalMs = Math.max(15_000, staleAfterMs);
    const timer = window.setTimeout(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [enabled, refreshTier, router, staleAfterMs]);

  return null;
}
