"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { UiRefreshMetadata } from "@drts/contracts";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { Locale } from "@/lib/translations";

type AttendanceRefreshControlsProps = {
  locale: Locale;
  refresh: UiRefreshMetadata;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 15_000;

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

export function AttendanceRefreshControls({
  locale,
  refresh,
}: AttendanceRefreshControlsProps) {
  const router = useRouter();
  const [isPending, startRefresh] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  const generatedAt = new Date(refresh.generatedAt).getTime();

  const doRefresh = useEffectEvent(() => {
    startTransition(() => {
      startRefresh(() => router.refresh());
    });
  });

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      doRefresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [doRefresh]);

  const ageMs = Math.max(0, now - generatedAt);
  const stale = ageMs >= refresh.staleAfterMs;
  const freshnessTone =
    refresh.dataFreshness === "degraded"
      ? "danger"
      : stale
        ? "warn"
        : "success";

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Pill theme={theme} tone="accent">
        T3 · 15s
      </Pill>
      <Pill theme={theme} tone={freshnessTone} dot>
        {stale ? copy(locale, "stale", "過期") : copy(locale, "fresh", "最新")}{" "}
        · {Math.floor(ageMs / 1000)}s
      </Pill>
      <Btn
        theme={theme}
        variant="secondary"
        icon="arrow"
        onClick={() => doRefresh()}
        disabled={isPending}
      >
        {isPending
          ? copy(locale, "Refreshing...", "更新中...")
          : copy(locale, "Refresh", "重新整理")}
      </Btn>
    </div>
  );
}
