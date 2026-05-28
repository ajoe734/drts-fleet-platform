"use client";

import type { RefreshTier } from "@drts/contracts";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type BookingsRefreshControlProps = {
  generatedAt: string | null;
  refreshTier: RefreshTier;
  staleAfterMs: number;
};

const REFRESH_TIER_COPY: Record<RefreshTier, string> = {
  urgent: "T1 Urgent",
  fast: "T2 Fast",
  dispatch: "T3 Dispatch",
  medium: "T4 Medium",
  medium_slow: "T5 Medium slow",
  slow: "T5 Tenant slow",
  manual: "T6 Manual",
};

function getRemainingSeconds(targetAt: number) {
  const diffMs = Math.max(targetAt - Date.now(), 0);
  return Math.ceil(diffMs / 1000);
}

export function BookingsRefreshControl({
  generatedAt,
  refreshTier,
  staleAfterMs,
}: BookingsRefreshControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const lastTriggeredAtRef = useRef<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    () => {
      if (!generatedAt || staleAfterMs <= 0) {
        return null;
      }

      return getRemainingSeconds(
        new Date(generatedAt).getTime() + staleAfterMs,
      );
    },
  );

  useEffect(() => {
    if (!generatedAt || staleAfterMs <= 0) {
      lastTriggeredAtRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    const generatedAtMs = new Date(generatedAt).getTime();
    const nextRefreshAt = generatedAtMs + staleAfterMs;

    setRemainingSeconds(getRemainingSeconds(nextRefreshAt));

    const intervalId = window.setInterval(() => {
      const seconds = getRemainingSeconds(nextRefreshAt);
      setRemainingSeconds(seconds);
      if (seconds === 0 && lastTriggeredAtRef.current !== nextRefreshAt) {
        lastTriggeredAtRef.current = nextRefreshAt;
        startTransition(() => {
          router.refresh();
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generatedAt, staleAfterMs, router]);

  return (
    <div className="bookings-refresh-control">
      <span className="status-chip">
        {isPending
          ? "更新中"
          : `${REFRESH_TIER_COPY[refreshTier]} · ${staleAfterMs > 0 ? `${staleAfterMs / 1000}s cadence` : "手動更新"}`}
      </span>
      <span className="bookings-refresh-countdown">
        {isPending
          ? "正在同步最新 snapshot"
          : remainingSeconds === null
            ? "等待後端 freshness metadata"
            : `${remainingSeconds}s 後自動更新`}
      </span>
      <button
        className="action-button action-button-secondary bookings-refresh-button"
        onClick={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
        type="button"
      >
        重新整理
      </button>
    </div>
  );
}
