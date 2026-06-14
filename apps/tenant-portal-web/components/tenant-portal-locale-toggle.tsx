"use client";

import { useTranslation } from "@/lib/i18n";

export function TenantPortalLocaleToggle() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "zh" : "en")}
      aria-label={locale === "en" ? t("shell.locale.ariaZh") : t("shell.locale.ariaEn")}
      title={t("shell.locale.switch")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        width: "100%",
        borderRadius: "10px",
        border: "1px solid rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.35)",
        color: "#e2e8f0",
        padding: "0.55rem 0.8rem",
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">🌐</span>
      <span>{locale === "en" ? t("shell.locale.zh") : t("shell.locale.en")}</span>
    </button>
  );
}
