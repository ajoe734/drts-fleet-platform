"use client";

import { startTransition, useEffect, useEffectEvent } from "react";
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

  const handleRefresh = useEffectEvent(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
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
