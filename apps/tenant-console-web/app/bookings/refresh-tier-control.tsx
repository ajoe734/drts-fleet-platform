"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBtn, buildCanvasTheme } from "@drts/ui-web";
import type { RefreshTier, UiRefreshMetadata } from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

function getFreshnessLabel(
  metadata: UiRefreshMetadata,
  t: (key: string) => string,
) {
  switch (metadata.dataFreshness) {
    case "stale":
      return t("refreshControl.stale");
    case "degraded":
      return t("refreshControl.degraded");
    case "unknown":
      return t("refreshControl.unknown");
    case "fresh":
    default:
      return t("refreshControl.fresh");
  }
}

export function RefreshTierControl({
  metadata,
  tier,
}: {
  metadata: UiRefreshMetadata;
  tier: RefreshTier;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const intervalMs = REFRESH_INTERVAL_MS[tier];

  useEffect(() => {
    if (!intervalMs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs, router]);

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
      <span
        style={{
          fontSize: 11.5,
          color: theme.textMuted,
          whiteSpace: "nowrap",
        }}
      >
        {`T5 / ${tier} · ${getFreshnessLabel(metadata, t)}`}
      </span>
      <CanvasBtn
        theme={theme}
        variant="secondary"
        size="sm"
        icon="refresh"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {isPending
          ? t("refreshControl.refreshing")
          : t("refreshControl.refresh")}
      </CanvasBtn>
    </div>
  );
}
