import type { Locale } from "../../lib/translations";

export const assistantTranslations = {
  en: {
    "opsAssistant.audit.description":
      "Opens platform-admin audit trail in a new tab with event context",
  },
  zh: {
    "opsAssistant.audit.description":
      "於新分頁開啟 platform-admin 審計日誌與事件追查",
  },
} as const;

export function getAssistantAuditDescription(locale: Locale): string {
  const dict = assistantTranslations[locale] ?? assistantTranslations.en;
  return (
    dict["opsAssistant.audit.description"] ??
    assistantTranslations.en["opsAssistant.audit.description"] ??
    ""
  );
}
