"use client";

import { REALM_COLORS } from "@drts/ui-tokens";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

export function LanguageSwitch({ locale: explicitLocale }: { locale?: Locale }) {
  const { locale, setLocale, t } = useTranslation(explicitLocale);
  const nextLocale: Locale = locale === "en" ? "zh" : "en";
  const ariaLabel =
    locale === "en"
      ? t("shell.language.ariaToZh")
      : t("shell.language.ariaToEn");

  return (
    <button
      type="button"
      title={t("shell.language.switch")}
      aria-label={ariaLabel}
      onClick={() => setLocale(nextLocale)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${REALM_COLORS.system.light.border}`,
        background: REALM_COLORS.system.light.bg,
        color: REALM_COLORS.platform.light.fg,
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true">{t("shell.language.icon")}</span>
      <span>
        {locale === "en" ? t("shell.language.zh") : t("shell.language.en")}
      </span>
    </button>
  );
}
