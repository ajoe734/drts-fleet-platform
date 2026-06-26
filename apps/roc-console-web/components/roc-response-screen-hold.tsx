import type { ReactNode } from "react";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasEmptyState as EmptyState,
  CanvasPageHeader as PageHeader,
} from "@drts/ui-web";

const REQUIREMENTS_DOC =
  "docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md";

export function RocResponseScreenHold({
  locale,
  title,
  subtitle,
  children,
}: {
  locale: Locale;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader theme={rocTheme} title={title} subtitle={subtitle} />
      <Banner
        theme={rocTheme}
        tone="warn"
        icon="warn"
        title={t("screenHold.bannerTitle", locale)}
        body={t("screenHold.bannerBody", locale)}
      />
      <Card theme={rocTheme} title={t("screenHold.cardTitle", locale)}>
        <EmptyState
          theme={rocTheme}
          tone="neutral"
          title={t("screenHold.emptyTitle", locale)}
          body={
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span>{t("screenHold.emptyBody", locale)}</span>
              <code style={{ color: rocTheme.text }}>{REQUIREMENTS_DOC}</code>
            </div>
          }
        />
      </Card>
      {children}
    </div>
  );
}
