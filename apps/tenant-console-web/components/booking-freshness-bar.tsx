"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { UiRefreshMetadata } from "@drts/contracts";
import { CanvasBtn, CanvasIcon, CanvasPill, buildCanvasTheme } from "@drts/ui-web";
import type { CanvasTone } from "@drts/ui-web";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  fontSize: 11.5,
  color: th.textMuted,
};

const groupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.textDim,
};

const FRESHNESS_TONE: Record<UiRefreshMetadata["dataFreshness"], CanvasTone> = {
  fresh: "success",
  stale: "warn",
  degraded: "danger",
  unknown: "neutral",
};

const FRESHNESS_LABEL: Record<UiRefreshMetadata["dataFreshness"], string> = {
  fresh: "資料即時",
  stale: "資料已過期",
  degraded: "資料降級",
  unknown: "資料狀態未知",
};

function formatGeneratedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString("zh-Hant", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Page-level refresh tier affordance for the booking detail screen.
 *
 * Per packet §3.2 tenant-console `/bookings/[id]` is the **T5 Tenant slow**
 * tier (30s cadence). Booking state changes are driven upstream by
 * ops/dispatch and surface here on the next poll, so the bar makes the lag
 * honest: it shows the tier, the snapshot freshness from `UiRefreshMetadata`,
 * and a manual refresh affordance per Q-X01.
 */
export function BookingFreshnessBar({ meta }: { meta: UiRefreshMetadata }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const cadenceSeconds = Math.round(meta.staleAfterMs / 1000);

  return (
    <div style={barStyle}>
      <span style={groupStyle}>
        <CanvasIcon name="clock" size={13} />
        <span>更新節奏</span>
        <CanvasPill theme={th} tone="info">
          T5 · 慢速 {cadenceSeconds}s
        </CanvasPill>
      </span>
      <CanvasPill theme={th} tone={FRESHNESS_TONE[meta.dataFreshness]} dot>
        {FRESHNESS_LABEL[meta.dataFreshness]}
      </CanvasPill>
      <span style={monoStyle}>快照 {formatGeneratedAt(meta.generatedAt)}</span>
      <span style={monoStyle}>來源 {meta.source}</span>
      <span style={{ flex: 1 }} />
      <CanvasBtn
        theme={th}
        icon="arrow"
        size="xs"
        disabled={refreshing}
        onClick={() => {
          setRefreshing(true);
          router.refresh();
          // The server component re-renders with a fresh snapshot; clear the
          // local pending flag shortly after so the control is reusable.
          window.setTimeout(() => setRefreshing(false), 1200);
        }}
      >
        {refreshing ? "重新整理中…" : "重新整理"}
      </CanvasBtn>
    </div>
  );
}
