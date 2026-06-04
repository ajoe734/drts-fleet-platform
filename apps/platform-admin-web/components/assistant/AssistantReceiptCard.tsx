"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, OctagonAlert } from "lucide-react";
import { CanvasPill as Pill } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import {
  assistantCardStyle,
  assistantInsetStyle,
  assistantMonoTextStyle,
  assistantMutedTextStyle,
  assistantReceiptTone,
  assistantTheme,
  type AssistantReceipt,
} from "./assistant-types";

const bodyStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: assistantTheme.text,
  fontSize: 17,
  fontWeight: 700,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const itemStyle: CSSProperties = {
  ...assistantInsetStyle,
  padding: "10px 12px",
  display: "grid",
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: assistantTheme.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 700,
};

function receiptIcon(status: AssistantReceipt["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} color={assistantTheme.success} />;
    case "accepted":
    case "queued":
      return <Clock3 size={16} color={assistantTheme.info} />;
    case "failed":
    default:
      return <OctagonAlert size={16} color={assistantTheme.danger} />;
  }
}

function valueOrFallback(value?: string | null) {
  return value && value.trim().length > 0 ? value : "—";
}

export function AssistantReceiptCard({
  receipt,
}: {
  receipt: AssistantReceipt;
}) {
  const { t } = useTranslation();
  const resourceValue =
    receipt.resourceLabel ??
    [receipt.resourceType, receipt.resourceId].filter(Boolean).join(" · ") ??
    "";

  return (
    <section
      style={assistantCardStyle}
      aria-label={t("assistant.receipt.ariaLabel")}
    >
      <div style={bodyStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {receiptIcon(receipt.status)}
              <h3 style={titleStyle}>
                {receipt.title ?? t("assistant.receipt.title")}
              </h3>
            </div>
            {receipt.message ? (
              <div style={assistantMutedTextStyle}>{receipt.message}</div>
            ) : null}
          </div>
          <Pill
            theme={assistantTheme}
            tone={assistantReceiptTone(receipt.status)}
          >
            {t(`assistant.receipt.status.${receipt.status}`)}
          </Pill>
        </div>

        <div style={gridStyle}>
          <div style={itemStyle}>
            <div style={labelStyle}>
              {t("assistant.receipt.field.actionId")}
            </div>
            <div style={assistantMonoTextStyle}>
              {valueOrFallback(receipt.actionId)}
            </div>
          </div>
          <div style={itemStyle}>
            <div style={labelStyle}>
              {t("assistant.receipt.field.requestId")}
            </div>
            <div style={assistantMonoTextStyle}>
              {valueOrFallback(receipt.requestId)}
            </div>
          </div>
          <div style={itemStyle}>
            <div style={labelStyle}>{t("assistant.receipt.field.auditId")}</div>
            <div style={assistantMonoTextStyle}>
              {valueOrFallback(receipt.auditId)}
            </div>
          </div>
          <div style={itemStyle}>
            <div style={labelStyle}>
              {t("assistant.receipt.field.resource")}
            </div>
            <div
              style={{ ...assistantMonoTextStyle, color: assistantTheme.text }}
            >
              {valueOrFallback(resourceValue)}
            </div>
          </div>
          <div style={itemStyle}>
            <div style={labelStyle}>{t("assistant.receipt.field.status")}</div>
            <div style={{ color: assistantTheme.text, fontSize: 13 }}>
              {t(`assistant.receipt.status.${receipt.status}`)}
            </div>
          </div>
        </div>

        {receipt.auditHref ? (
          <div>
            <Link
              href={receipt.auditHref}
              target="_blank"
              rel="noreferrer"
              style={{
                color: assistantTheme.accentHi,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 12.5,
              }}
            >
              {t("assistant.receipt.viewAuditEvidence")}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
