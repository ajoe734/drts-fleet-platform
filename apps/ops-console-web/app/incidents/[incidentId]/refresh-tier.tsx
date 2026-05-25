"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  type CanvasTheme,
} from "@drts/ui-web";

type IncidentRefreshTierProps = {
  generatedAt: string;
  staleAfterMs: number;
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
  generatedAt,
  staleAfterMs,
  theme,
  locale,
}: IncidentRefreshTierProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(Date.now());
      startTransition(() => {
        setIsRefreshing(true);
        router.refresh();
      });
    }, staleAfterMs);

    return () => window.clearInterval(tick);
  }, [router, staleAfterMs]);

  useEffect(() => {
    if (!isRefreshing) {
      return;
    }

    setIsRefreshing(false);
  }, [generatedAt, isRefreshing]);

  const freshness = useMemo(() => {
    const staleAt = new Date(generatedAt).getTime() + staleAfterMs;
    return now >= staleAt ? "stale" : "fresh";
  }, [generatedAt, now, staleAfterMs]);

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
      <Pill theme={theme} tone={freshness === "stale" ? "warn" : "accent"} dot>
        {locale === "zh"
          ? `T3 / 15s · ${freshness === "stale" ? "待刷新" : "fresh"}`
          : `T3 / 15s · ${freshness}`}
      </Pill>
      <span
        style={{
          color: theme.textMuted,
          fontSize: 11.5,
          fontFamily: theme.monoFamily,
        }}
      >
        {locale === "zh" ? "snapshot" : "snapshot"}{" "}
        {formatClock(locale, generatedAt)} UTC
      </span>
      <Btn
        theme={theme}
        size="xs"
        icon="clock"
        disabled={isRefreshing}
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
