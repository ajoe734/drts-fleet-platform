"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBtn, CanvasPill, buildCanvasTheme } from "@drts/ui-web";
import { type Locale, t } from "@/lib/translations";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 30_000;

function formatSnapshot(value: string | null, locale: Locale) {
  if (!value) {
    return t("integrationGovernance.refreshControl.snapshotPending", locale);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t("integrationGovernance.refreshControl.snapshotPending", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hant" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function IntegrationGovernanceRefreshControl({
  computedAt,
  locale,
}: {
  computedAt: string | null;
  locale: Locale;
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
        {t("integrationGovernance.refreshControl.cadence", locale)}
      </CanvasPill>
      <CanvasPill theme={th} tone="neutral">
        {t("integrationGovernance.refreshControl.snapshot", locale, {
          value: formatSnapshot(computedAt, locale),
        })}
      </CanvasPill>
      <CanvasBtn
        theme={th}
        variant="secondary"
        size="sm"
        icon="refresh"
        onClick={refreshPage}
        disabled={isPending}
      >
        {isPending
          ? t("integrationGovernance.refreshControl.refreshing", locale)
          : t("integrationGovernance.refreshControl.refresh", locale)}
      </CanvasBtn>
    </div>
  );
}
