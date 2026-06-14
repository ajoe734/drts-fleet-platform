"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBtn, CanvasPill, buildCanvasTheme } from "@drts/ui-web";
import { toIntlLocale } from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 30_000;

function formatSnapshot(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function IntegrationGovernanceRefreshControl({
  computedAt,
}: {
  computedAt: string | null;
}) {
  const router = useRouter();
  const { locale, t } = useTranslation();
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
        {t("integrationGovernance.refresh.tier")}
      </CanvasPill>
      <CanvasPill theme={th} tone="neutral">
        {formatSnapshot(computedAt, locale)
          ? t("integrationGovernance.refresh.snapshot", {
              value: formatSnapshot(computedAt, locale) as string,
            })
          : t("integrationGovernance.refresh.noSnapshot")}
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
          ? t("refreshControl.refreshing")
          : t("refreshControl.refresh")}
      </CanvasBtn>
    </div>
  );
}
