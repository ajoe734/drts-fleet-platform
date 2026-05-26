"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const REFRESH_INTERVAL_MS = 15_000;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

export interface RefreshControlProps {
  tierLabel: string;
  refreshLabel: string;
  generatedAt: string;
  freshnessLabel: string;
  freshnessTone: CanvasTone;
  staleAtTemplate: string;
}

function formatRelative(timestamp: string, now: number) {
  const generated = Date.parse(timestamp);
  if (Number.isNaN(generated)) {
    return timestamp;
  }
  const deltaSec = Math.max(0, Math.round((now - generated) / 1000));
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  return `${deltaHr}h ago`;
}

export function RefreshControl({
  tierLabel,
  refreshLabel,
  generatedAt,
  freshnessLabel,
  freshnessTone,
  staleAtTemplate,
}: RefreshControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const heartbeat = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => {
      startTransition(() => router.refresh());
    }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(heartbeat);
      clearInterval(refresh);
    };
  }, [router]);

  const relative = formatRelative(generatedAt, now);
  const staleLabel = staleAtTemplate
    .replace("{when}", relative)
    .replace("{freshness}", freshnessLabel);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Pill theme={theme} tone="neutral">
        {tierLabel}
      </Pill>
      <Pill theme={theme} tone={freshnessTone} dot>
        {staleLabel}
      </Pill>
      <Btn
        theme={theme}
        variant="ghost"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
      >
        {refreshLabel}
      </Btn>
    </div>
  );
}
