"use client";

import React from "react";
import { CanvasEmptyState, buildCanvasTheme } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const { t } = useTranslation();
  const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

  return (
    <div
      style={{
        minHeight: "100%",
        background: theme.bg,
        color: theme.text,
        padding: 24,
        display: "grid",
        gap: 12,
      }}
    >
      <CanvasEmptyState
        theme={theme}
        tone="warn"
        title={t("partnerNotification.title")}
        body="Design Canvas is pending handoff. Implementation is paused as per dispatch contract."
      />
      <div style={{ color: theme.textMuted, fontSize: 12.5, lineHeight: 1.6 }}>
        The visual design for this screen has not been provided in the canonical
        packages/ui-tokens or docs/05-ui/drts-design-canvas.
      </div>
      <div
        style={{
          fontFamily: theme.monoFamily,
          fontSize: 11.5,
          color: theme.textDim,
        }}
      >
        Route: /partners/{entrySlug}?tab=notifications
      </div>
      <div
        style={{
          fontFamily: theme.monoFamily,
          fontSize: 11.5,
          color: theme.textDim,
        }}
      >
        See
        docs/02-architecture/partner-notification-20260917/03_ui_design_delta.md
      </div>
    </div>
  );
}
