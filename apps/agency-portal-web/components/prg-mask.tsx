"use client";

import { Badge } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type { Locale, TranslationKey } from "@/lib/translations";

/**
 * Masked-field chip with the PrgMask semantics of the platform-regulator
 * canvas: a value shown here is deliberately masked or withheld, never
 * missing data.
 */
export function PrgMask({
  label,
  labelKey = "common.masked",
  locale: explicitLocale,
}: {
  label?: string;
  labelKey?: TranslationKey;
  locale?: Locale;
}) {
  const { t } = useTranslation(explicitLocale);
  const resolvedLabel =
    label === undefined
      ? t(labelKey)
      : label === "個資已遮罩"
        ? t("shell.masked")
        : label === "不提供"
          ? t("common.withheld")
          : label === "已遮罩"
            ? t("common.masked")
            : label;
  return (
    <Badge variant="orange" style={{ gap: 4 }}>
      <span aria-hidden="true">🔒</span>
      {resolvedLabel}
    </Badge>
  );
}
