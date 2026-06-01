"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RefreshTier } from "@drts/contracts";

// Q-X02 tier → polling cadence (ms). 0 = manual (no polling).
const TIER_INTERVAL_MS: Record<RefreshTier, number> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

const TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "即時 · 5s",
  fast: "快 · 3s",
  dispatch: "派遣 · 5s",
  medium: "中 · 15s",
  medium_slow: "中慢 · 30s",
  slow: "T5 租戶慢速 · 30s",
  manual: "手動",
};

function formatAge(seconds: number): string {
  if (seconds < 5) {
    return "剛剛";
  }
  if (seconds < 60) {
    return `${seconds} 秒前`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分鐘前`;
}

/**
 * Wires the booking-detail refresh tier (Q-X02). Booking state is driven by
 * ops/dispatch upstream and surfaces here on the next poll — so we poll at the
 * tier cadence and show a freshness indicator + manual refresh, rather than
 * pretending booking state is instant.
 */
export function BookingRefreshTier({
  tier,
  generatedAt,
}: {
  tier: RefreshTier;
  generatedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState<number | null>(null);

  const intervalMs = TIER_INTERVAL_MS[tier];
  const generatedMs = new Date(generatedAt).getTime();

  // Freshness ticker — recomputes the "loaded N ago" label every second.
  useEffect(() => {
    setNowMs(Date.now());
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Tier auto-refresh poller.
  useEffect(() => {
    if (intervalMs <= 0) {
      return;
    }
    const poll = setInterval(() => {
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(poll);
  }, [intervalMs, router]);

  const ageSeconds =
    nowMs === null ? 0 : Math.max(0, Math.round((nowMs - generatedMs) / 1000));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        fontSize: 11.5,
        color: "var(--tn-text-dim, #94a3b8)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: pending ? "#f59e0b" : "#22c55e",
        }}
      />
      <span>
        {TIER_LABEL[tier]} · 資料更新於{" "}
        {nowMs === null ? "—" : formatAge(ageSeconds)}
        {pending ? " · 更新中…" : ""}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        style={{
          padding: "3px 9px",
          fontSize: 11.5,
          borderRadius: 7,
          border: "1px solid var(--tn-border, #334155)",
          background: "transparent",
          color: "inherit",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        立即重新整理
      </button>
    </div>
  );
}
