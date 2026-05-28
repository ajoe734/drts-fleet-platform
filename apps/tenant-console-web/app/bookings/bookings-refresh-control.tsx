"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type BookingsRefreshControlProps = {
  generatedAt: string | null;
  pollIntervalMs: number;
};

function getRemainingSeconds(targetAt: number) {
  const diffMs = Math.max(targetAt - Date.now(), 0);
  return Math.ceil(diffMs / 1000);
}

export function BookingsRefreshControl({
  generatedAt,
  pollIntervalMs,
}: BookingsRefreshControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    () => {
      if (!generatedAt || pollIntervalMs <= 0) {
        return null;
      }

      return getRemainingSeconds(
        new Date(generatedAt).getTime() + pollIntervalMs,
      );
    },
  );

  useEffect(() => {
    if (!generatedAt || pollIntervalMs <= 0) {
      setRemainingSeconds(null);
      return;
    }

    const generatedAtMs = new Date(generatedAt).getTime();
    const nextRefreshAt = generatedAtMs + pollIntervalMs;

    setRemainingSeconds(getRemainingSeconds(nextRefreshAt));

    const intervalId = window.setInterval(() => {
      const seconds = getRemainingSeconds(nextRefreshAt);
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        startTransition(() => {
          router.refresh();
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generatedAt, pollIntervalMs, router]);

  return (
    <div className="bookings-refresh-control">
      <span className="status-chip">
        {isPending
          ? "Refreshing…"
          : pollIntervalMs > 0
            ? `Auto ${pollIntervalMs / 1000}s`
            : "Manual refresh"}
      </span>
      <span className="bookings-refresh-countdown">
        {isPending
          ? "syncing backend snapshot"
          : remainingSeconds === null
            ? "waiting for backend freshness metadata"
            : `next poll ${remainingSeconds}s`}
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
        立即更新
      </button>
    </div>
  );
}
