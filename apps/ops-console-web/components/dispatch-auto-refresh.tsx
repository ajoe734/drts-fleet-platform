"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { useRouter } from "next/navigation";

type DispatchAutoRefreshProps = {
  intervalMs: number;
  enabled?: boolean;
};

export function DispatchAutoRefresh({
  intervalMs,
  enabled = true,
}: DispatchAutoRefreshProps) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  const handleRefresh = useEffectEvent(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    // A newer refresh supersedes one still in flight, so refreshes slower
    // than the interval never reach the page (shared dev, 2026-11-02: 7-49 s
    // renders every 5 s kept a just-created dispatch off the workspace).
    if (refreshing) {
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  });

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      handleRefresh();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, handleRefresh, intervalMs]);

  return null;
}
