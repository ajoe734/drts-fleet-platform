"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBtn, CanvasPill, buildCanvasTheme } from "@drts/ui-web";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 30_000;

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatSnapshot(value: string | null) {
  if (!value) {
    return "尚未取得快照";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "尚未取得快照";
  }

  return dateTimeFormatter.format(parsed);
}

export function IntegrationGovernanceRefreshControl({
  computedAt,
}: {
  computedAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const refreshPage = useEffectEvent(() => {
    startTransition(() => {
      router.refresh();
    });
  });

  useEffect(() => {
    const timerId = window.setInterval(() => {
      refreshPage();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [refreshPage]);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: 8,
        alignItems: "center",
      }}
    >
      <CanvasPill theme={th} tone="info" dot>
        T5 slow · 30s
      </CanvasPill>
      <CanvasPill theme={th} tone="neutral">
        快照 {formatSnapshot(computedAt)}
      </CanvasPill>
      <CanvasBtn
        theme={th}
        variant="secondary"
        size="sm"
        icon="refresh"
        onClick={refreshPage}
        disabled={isPending}
      >
        {isPending ? "更新中…" : "立即刷新"}
      </CanvasBtn>
    </div>
  );
}
