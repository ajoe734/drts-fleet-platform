"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import type { RefreshTier, UiRefreshMetadata } from "@drts/contracts";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  type CanvasTheme,
} from "@drts/ui-web";

const REFRESH_TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

type IncidentRefreshTierProps = {
  tier: RefreshTier;
  metadata: UiRefreshMetadata | null;
  theme: CanvasTheme;
  locale: "en" | "zh";
};

function formatClock(locale: "en" | "zh", value: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

export function IncidentRefreshTier({
  tier,
  metadata,
  theme,
  locale,
}: IncidentRefreshTierProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cadenceMs = REFRESH_TIER_CADENCE_MS[tier];

  useEffect(() => {
    if (cadenceMs === null) {
      return;
    }

    const tick = window.setInterval(() => {
      setNow(Date.now());
      startTransition(() => {
        setIsRefreshing(true);
        router.refresh();
      });
    }, cadenceMs);

    return () => window.clearInterval(tick);
  }, [cadenceMs, router]);

  useEffect(() => {
    if (!isRefreshing) {
      return;
    }

    setIsRefreshing(false);
  }, [isRefreshing, metadata?.generatedAt]);

  const freshness = useMemo(() => {
    if (!metadata) {
      return "unknown";
    }

    if (
      metadata.dataFreshness === "degraded" ||
      metadata.dataFreshness === "unknown"
    ) {
      return metadata.dataFreshness;
    }

    const staleAt =
      new Date(metadata.generatedAt).getTime() + metadata.staleAfterMs;
    return now >= staleAt ? "stale" : metadata.dataFreshness;
  }, [metadata, now]);

  const tierLabel =
    tier === "medium"
      ? "T3 / 15s"
      : tier === "dispatch"
        ? "T2 / 5s"
        : tier === "manual"
          ? locale === "zh"
            ? "T6 / 手動"
            : "T6 / manual"
          : `${tier}${cadenceMs ? ` / ${Math.round(cadenceMs / 1000)}s` : ""}`;

  const freshnessLabel =
    locale === "zh"
      ? freshness === "fresh"
        ? "最新"
        : freshness === "stale"
          ? "待刷新"
          : freshness === "degraded"
            ? "降級"
            : "未知"
      : freshness;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <Pill
        theme={theme}
        tone={
          freshness === "degraded"
            ? "danger"
            : freshness === "stale"
              ? "warn"
              : freshness === "unknown"
                ? "neutral"
                : "accent"
        }
        dot
      >
        {`${tierLabel} · ${freshnessLabel}`}
      </Pill>
      <span
        style={{
          color: theme.textMuted,
          fontSize: 11.5,
          fontFamily: theme.monoFamily,
        }}
      >
        {metadata
          ? `${locale === "zh" ? "snapshot" : "snapshot"} ${formatClock(locale, metadata.generatedAt)} UTC · ${metadata.source}`
          : locale === "zh"
            ? "snapshot -- · metadata unavailable"
            : "snapshot -- · metadata unavailable"}
      </span>
      <Btn
        theme={theme}
        size="xs"
        icon="clock"
        disabled={isRefreshing || cadenceMs === null}
        onClick={() => {
          startTransition(() => {
            setIsRefreshing(true);
            router.refresh();
          });
        }}
      >
        {locale === "zh" ? "重新整理" : "Refresh"}
      </Btn>
    </div>
  );
}
