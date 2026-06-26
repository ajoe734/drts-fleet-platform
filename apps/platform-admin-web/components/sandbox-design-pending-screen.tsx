"use client";

import type { CSSProperties } from "react";
import { CanvasEmptyState, buildCanvasTheme } from "@drts/ui-web";

import { useTranslation } from "@/lib/i18n";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const containerStyle: CSSProperties = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
  padding: 24,
  display: "grid",
  gap: 12,
};

const noteStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
};

const NOTE_PATH =
  "docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md";

export function SandboxDesignPendingScreen({
  titleKey,
  purposeKey,
  route,
}: {
  titleKey: string;
  purposeKey: string;
  route: string;
}) {
  const { t } = useTranslation();
  const title = t(titleKey);

  return (
    <div style={containerStyle}>
      <CanvasEmptyState
        theme={theme}
        tone="warn"
        title={t("sandbox.pending.title", { title })}
        body={`${t(purposeKey)} ${t("sandbox.pending.bodySuffix")}`}
      />
      <div style={noteStyle}>{t("sandbox.pending.note")}</div>
      <div style={monoStyle}>{route}</div>
      <div style={monoStyle}>{NOTE_PATH}</div>
    </div>
  );
}
