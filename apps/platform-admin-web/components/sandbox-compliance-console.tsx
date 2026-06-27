"use client";

import type { CSSProperties } from "react";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";

import { useTranslation } from "@/lib/i18n";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const REQUIREMENTS_NOTE_PATH =
  "docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const cardBodyStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  color: theme.text,
  fontSize: 13,
  lineHeight: 1.6,
};

export function SandboxComplianceDashboardPage() {
  const { t } = useTranslation();

  return (
    <main style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("cmp.blocked.title")}
        subtitle={t("cmp.blocked.subtitle")}
      />

      <CanvasBanner
        theme={theme}
        tone="warn"
        title={t("cmp.blocked.bannerTitle")}
        body={t("cmp.blocked.bannerBody")}
      />

      <CanvasCard theme={theme} title={t("cmp.blocked.cardTitle")}>
        <div style={cardBodyStyle}>
          <div>{t("cmp.blocked.cardBody")}</div>
          <div>{REQUIREMENTS_NOTE_PATH}</div>
        </div>
      </CanvasCard>
    </main>
  );
}
