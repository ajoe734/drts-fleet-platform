"use client";

import Link from "next/link";
import { useState } from "react";
import { buildEmbedTheme } from "../lib/embed-presentation";

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
  const theme = buildEmbedTheme(accent);
  const [expanded, setExpanded] = useState(false);
  const amount =
    typeof actualFare === "number" &&
    Number.isFinite(actualFare) &&
    actualFare >= 0
      ? `NT$ ${actualFare}`
      : "實際車資待確認";
  const buttonStyle = {
    border: `1px solid ${theme.primaryBd}`,
    borderRadius: theme.radiusSm,
    padding: "11px 14px",
    background: theme.primaryBg,
    color: theme.primary,
    font: "inherit",
    cursor: "pointer",
  };

  return (
    <section
      aria-label="外部付款模擬示意"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: theme.radius,
        padding: 18,
        color: theme.ink,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>
        外部付款模擬示意（SIM）
      </h2>
      <p style={{ color: theme.muted, fontSize: 12 }}>
        SIM 示意流程，不實際扣款。
      </p>
      {expanded ? (
        <div role="region" aria-label="付款示意內容">
          <dl style={{ fontSize: 13, overflowWrap: "anywhere" }}>
            <dt>本筆訂單 ID</dt>
            <dd style={{ margin: "4px 0 12px", fontFamily: theme.mono }}>
              {orderId}
            </dd>
            <dt>已記錄實際車資</dt>
            <dd style={{ margin: "4px 0 12px" }}>{amount}</dd>
          </dl>
          <p>SIM：略過外部付款步驟，繼續本筆行程與評價；不實際扣款。</p>
          <Link
            href={returnHref}
            prefetch={false}
            style={{
              ...buttonStyle,
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            返回本行程／評價（SIM）
          </Link>
          <button
            type="button"
            style={{ ...buttonStyle, marginTop: 8 }}
            onClick={() => setExpanded(false)}
          >
            關閉示意
          </button>
        </div>
      ) : (
        <button
          type="button"
          style={buttonStyle}
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          開啟外部付款模擬示意（SIM）
        </button>
      )}
    </section>
  );
}
