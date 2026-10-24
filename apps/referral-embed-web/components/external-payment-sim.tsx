"use client";

import Link from "next/link";
import { useState } from "react";
import { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";

/** Optional presentation of an unavailable external step; no payment command. */
export function ExternalPaymentSim({
  orderId,
  actualFare,
  returnHref,
  accent,
}: {
  orderId: string;
  actualFare: number | null;
  returnHref: string;
  accent: string;
}) {
  const { t } = useTranslation();
  const theme = buildEmbedTheme(accent);
  const [expanded, setExpanded] = useState(false);
  const amount =
    typeof actualFare === "number" &&
    Number.isFinite(actualFare) &&
    actualFare >= 0
      ? `NT$ ${actualFare}`
      : t("embed.paymentSim.farePending");
  const buttonStyle = {
    border: `1px solid ${theme.primaryBd}`,
    borderRadius: theme.radiusSm,
    padding: "11px 14px",
    background: theme.primaryBg,
    color: theme.primary,
    fontFamily: theme.sans,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <section
      aria-label={t("embed.paymentSim.regionLabel")}
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 16,
        padding: 15,
        color: theme.ink,
      }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>
        {t("embed.paymentSim.title")}
      </h2>
      <p style={{ margin: "0 0 10px", color: theme.muted, fontSize: 12 }}>
        {t("embed.paymentSim.disclaimer")}
      </p>
      {expanded ? (
        <div role="region" aria-label={t("embed.paymentSim.contentLabel")}>
          <dl style={{ fontSize: 13, overflowWrap: "anywhere" }}>
            <dt>{t("embed.paymentSim.orderLabel")}</dt>
            <dd style={{ margin: "4px 0 12px", fontFamily: theme.mono }}>
              {orderId}
            </dd>
            <dt>{t("embed.paymentSim.fareLabel")}</dt>
            <dd style={{ margin: "4px 0 12px" }}>{amount}</dd>
          </dl>
          <p>{t("embed.paymentSim.skipDescription")}</p>
          <Link
            href={returnHref}
            prefetch={false}
            style={{
              ...buttonStyle,
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            {t("embed.paymentSim.returnLabel")}
          </Link>
          <button
            type="button"
            style={{ ...buttonStyle, marginTop: 8 }}
            onClick={() => setExpanded(false)}
          >
            {t("embed.paymentSim.closeLabel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          style={buttonStyle}
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          {t("embed.paymentSim.openLabel")}
        </button>
      )}
    </section>
  );
}
