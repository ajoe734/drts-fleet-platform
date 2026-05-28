"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type BookingsRefreshControlProps = {
  generatedAt: string;
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
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(new Date(generatedAt).getTime() + pollIntervalMs),
  );

  useEffect(() => {
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
        {isPending ? "Refreshing…" : `Auto ${pollIntervalMs / 1000}s`}
      </span>
      <span className="bookings-refresh-countdown">
        {isPending
          ? "syncing backend snapshot"
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
