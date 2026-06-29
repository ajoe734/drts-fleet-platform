"use client";

import { useState } from "react";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasPillTone,
} from "@drts/ui-web";
import type { ActionReceipt } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import {
  formatOpsActionLabel,
  formatOpsCodeLabel,
} from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const RISK_TONE: Record<
  "low" | "medium" | "high",
  CanvasPillTone
> = {
  low: "neutral",
  medium: "warn",
  high: "danger",
};

const RECEIPT_TONE: Record<ActionReceipt["status"], CanvasPillTone> = {
  accepted: "info",
  completed: "success",
  failed: "danger",
};

export interface OpsWriteActionItem {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
  label?: string;
  path: string;
  reason?: string;
}

interface OpsWriteActionListProps {
  items: OpsWriteActionItem[];
  locale: Locale;
  size?: "xs" | "sm" | "md";
}

type RowState = { busy?: boolean; receipt?: ActionReceipt; error?: string };

export function OpsWriteActionList({
  items,
  locale,
  size = "sm",
}: OpsWriteActionListProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  async function invoke(item: OpsWriteActionItem) {
    const key = `${item.path}:${item.action}`;
    setRows((prev) => ({ ...prev, [key]: { busy: true } }));
    try {
      const receipt = await getOpsClient().post<ActionReceipt>(item.path, {
        body: item.reason ? { reason: item.reason } : {},
      });
      setRows((prev) => ({
        ...prev,
        [key]: {
          busy: false,
          receipt,
        },
      }));
    } catch (error) {
      setRows((prev) => ({
        ...prev,
        [key]: {
          busy: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: theme.textMuted }}>
        {t("avFallback.actions.readOnly", locale)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const key = `${item.path}:${item.action}`;
        const row = rows[key] ?? {};
        const disabled = !item.enabled || row.busy === true;
        const danger = item.riskLevel === "high";
        const label = item.label ?? formatOpsActionLabel(locale, item.action);
        const disabledReason = item.disabledReasonCode
          ? formatOpsCodeLabel(locale, item.disabledReasonCode)
          : null;

        return (
          <div
            key={key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              borderRadius: 10,
              background: theme.surfaceLo,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: theme.text,
                    lineHeight: 1.35,
                  }}
                >
                  {label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Pill theme={theme} tone={RISK_TONE[item.riskLevel]} dot>
                    {formatOpsCodeLabel(locale, item.riskLevel)}
                  </Pill>
                  {item.requiresReason ? (
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      {t("avFallback.actions.reasonRequired", locale)}
                    </span>
                  ) : null}
                </div>
              </div>
              <Btn
                theme={theme}
                variant={danger ? "secondary" : "primary"}
                danger={danger}
                size={size}
                disabled={disabled}
                onClick={() => void invoke(item)}
              >
                {row.busy ? t("avFallback.actions.pending", locale) : label}
              </Btn>
            </div>
            {!item.enabled ? (
              <div style={{ fontSize: 11, color: theme.textMuted }}>
                {t("avFallback.actions.disabled", locale)}
                {disabledReason ? ` · ${disabledReason}` : ""}
              </div>
            ) : null}
            {row.receipt ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Pill theme={theme} tone={RECEIPT_TONE[row.receipt.status]} dot>
                  {t("avFallback.actions.tracking", locale)}: {row.receipt.auditId}
                </Pill>
              </div>
            ) : null}
            {row.error ? (
              <div style={{ fontSize: 11, color: theme.danger }}>
                {t("avFallback.actions.failed", locale)}: {row.error}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
