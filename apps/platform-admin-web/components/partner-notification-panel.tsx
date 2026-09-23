import React from "react";
import { CanvasBanner } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const { t } = useTranslation();
  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      <CanvasBanner
        tone="info"
        title={t("partnerNotification.placeholderTitle")}
        body={t("partnerNotification.placeholderBody", { entrySlug })}
      />
    </div>
  );
}
