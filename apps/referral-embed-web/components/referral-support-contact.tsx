"use client";

import { useState } from "react";
import type { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";

type Theme = ReturnType<typeof buildEmbedTheme>;

function toTelHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Opened from 客服協助聯絡司機. The driver's number is withheld, so riders
 * call support; instead of launching the dialer straight away (an OS prompt
 * on desktop, often an error page inside an app WebView), the page first
 * shows the number, the order to quote, and an explicit call button.
 */
export function ReferralSupportContactPanel({
  theme,
  phone,
  orderNo,
  onClose,
}: {
  theme: Theme;
  phone: string;
  orderNo: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const row = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    fontSize: 12.5,
  } as const;
  const button = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: 12,
    padding: "10px 12px",
    fontFamily: theme.sans,
    fontSize: 13.5,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
  } as const;

  function copyNumber() {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      setCopy("failed");
      return;
    }
    clipboard.writeText(phone).then(
      () => setCopy("copied"),
      () => setCopy("failed"),
    );
  }

  return (
    <section
      aria-label={t("supportContact.title")}
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        background: theme.surface,
        border: `1px solid ${theme.primaryBd}`,
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: theme.ink }}
        >
          {t("supportContact.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: theme.muted,
            fontFamily: theme.sans,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            padding: 4,
          }}
        >
          {t("supportContact.close")}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          color: theme.ink2,
          lineHeight: 1.6,
        }}
      >
        {t("supportContact.body")}
      </p>
      {orderNo ? (
        <div style={row}>
          <span style={{ color: theme.muted }}>
            {t("supportContact.orderNo")}
          </span>
          <span
            style={{
              fontFamily: theme.mono,
              color: theme.ink,
              fontWeight: 600,
            }}
          >
            {orderNo}
          </span>
        </div>
      ) : null}
      <div style={row}>
        <span style={{ color: theme.muted }}>{t("supportContact.phone")}</span>
        <span
          style={{
            fontFamily: theme.mono,
            color: theme.ink,
            fontSize: 17,
            fontWeight: 800,
            userSelect: "all",
          }}
        >
          {phone}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <a
          href={toTelHref(phone)}
          style={{
            ...button,
            background: theme.primary,
            color: theme.surface,
            border: `1px solid ${theme.primary}`,
          }}
        >
          {t("supportContact.call")}
        </a>
        <button
          type="button"
          onClick={copyNumber}
          style={{
            ...button,
            background: theme.surface,
            color: theme.primary,
            border: `1px solid ${theme.line}`,
          }}
        >
          {copy === "copied"
            ? t("supportContact.copied")
            : t("supportContact.copy")}
        </button>
      </div>
      {copy === "failed" ? (
        <div role="status" style={{ fontSize: 12, color: theme.dangerFg }}>
          {t("supportContact.copyFailed")}
        </div>
      ) : null}
    </section>
  );
}
