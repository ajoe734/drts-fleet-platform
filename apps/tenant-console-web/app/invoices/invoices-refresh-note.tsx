"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { RefreshTier } from "@drts/contracts";
import { CanvasBtn, buildCanvasTheme } from "@drts/ui-web";
import { formatDateTime } from "@/lib/formatters";

/**
 * Refresh tier affordance for `/invoices` (packet §3.2 — T5 Tenant slow, 30s).
 *
 * `UiRefreshMetadata` requires a stale indicator plus a refresh affordance.
 * The backend does not yet emit the envelope for the invoice list, so the
 * snapshot time is stamped at server fetch time and passed in. This component
 * polls on the published T5 cadence and offers a manual refresh, instead of
 * inventing a private staleness heuristic.
 */

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// T5 Tenant slow cadence per Q-X02 (30s). Kept as a named constant so the
// polling interval and the stale threshold stay derived from the same tier.
const TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

const TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "T1 即時",
  fast: "T2 快速",
  dispatch: "T3 派遣",
  medium: "T4 中速",
  medium_slow: "T4 中慢速",
  slow: "T5 租戶慢速",
  manual: "T6 手動",
};

const noteStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  fontSize: 11.5,
  color: th.textMuted,
};

const dotStyle = (stale: boolean): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  flexShrink: 0,
  background: stale ? th.warn : th.success,
});

export function InvoicesRefreshNote({
  generatedAt,
  refreshTier,
  staleAfterMs,
}: {
  generatedAt: string;
  refreshTier: RefreshTier;
  staleAfterMs: number;
}) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const cadence = TIER_CADENCE_MS[refreshTier];

  useEffect(() => {
    // A fresh snapshot arrived (generatedAt changed) — reset the stale flag.
    setStale(false);
    if (cadence === null) {
      return;
    }

    const generatedMs = new Date(generatedAt).getTime();
    const staleTimer = setTimeout(
      () => setStale(true),
      Math.max(0, staleAfterMs - (Date.now() - generatedMs)),
    );
    const pollTimer = setInterval(() => router.refresh(), cadence);

    return () => {
      clearTimeout(staleTimer);
      clearInterval(pollTimer);
    };
  }, [generatedAt, cadence, staleAfterMs, router]);

  return (
    <div style={noteStyle}>
      <span style={dotStyle(stale)} />
      <span style={{ fontWeight: 600, color: th.text }}>
        更新頻率 {TIER_LABEL[refreshTier]}
      </span>
      <span>
        {cadence === null ? "不自動輪詢" : `每 ${cadence / 1000}s 自動更新`}
      </span>
      <span>·</span>
      <span>快照 {formatDateTime(generatedAt)}</span>
      <span>·</span>
      <span style={{ color: stale ? th.warn : th.success }}>
        {stale ? "資料可能已過期" : "資料即時"}
      </span>
      <span style={{ marginLeft: "auto" }}>
        <CanvasBtn
          theme={th}
          size="xs"
          icon="clock"
          onClick={() => router.refresh()}
        >
          重新整理
        </CanvasBtn>
      </span>
    </div>
  );
}
