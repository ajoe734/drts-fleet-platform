"use client";

import { useTranslation } from "@/lib/i18n";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const theme = buildCanvasTheme({ surface: "platform" });
  const { t } = useTranslation();

  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      <CanvasBanner 
        theme={theme} 
        tone="info" 
        title={t("partnerNotification.pendingDesignTitle")}
        body={t("partnerNotification.pendingDesignBody", { entrySlug })}
      />
    </div>
  );
}
