"use client";

import { useState } from "react";
import {
  buildCanvasTheme,
  CanvasBtn,
  CanvasPill,
  type CanvasPillTone,
} from "@drts/ui-web";
import {
  receiptTrackingNumber,
  submitRocWriteAction,
  type ActionReceipt,
  type ResourceActionDescriptor,
} from "@/lib/action-runtime";

const theme = buildCanvasTheme({
  surface: "roc",
  dark: true,
  density: "compact",
});

const RISK_TONE: Record<ResourceActionDescriptor["riskLevel"], CanvasPillTone> =
  {
    low: "neutral",
    medium: "warn",
    high: "danger",
  };

const RECEIPT_TONE: Record<ActionReceipt["status"], CanvasPillTone> = {
  accepted: "info",
  completed: "success",
  failed: "danger",
};

export interface RocActionRailItem {
  descriptor: ResourceActionDescriptor;
  label: string;
  /** Absolute API path for the write, e.g. `/api/roc/alerts/abc/ack`. */
  path: string;
  resourceType: string;
  resourceId: string;
  /**
   * Reason supplied by the mounting screen for `requiresReason` actions. Reason
   * capture is a screen concern (awaits the visual-team canvas); the rail simply
   * forwards whatever the screen provides.
   */
  reason?: string;
}

interface RocActionRailLabels {
  invoke: string;
  pending: string;
  tracking: string;
  audit: string;
  disabled: string;
  /** Surfaced when a write action rejects — the rail never fakes success. */
  failed: string;
}

interface RocActionRailProps {
  items: RocActionRailItem[];
  labels: RocActionRailLabels;
}

type RowState = { busy?: boolean; receipt?: ActionReceipt; error?: string };

/**
 * Generic availableActions → ActionReceipt rail (decision packet §4.5 / §7.4).
 * CTAs are driven entirely by the backend `ResourceActionDescriptor[]`; a
 * disabled descriptor renders disabled (with its reason) rather than hidden;
 * every successful write surfaces the returned `ActionReceipt` tracking number.
 *
 * This is reusable plumbing, NOT a ROC screen — the visual-team canvas decides
 * where it is mounted.
 */
export function RocActionRail({ items, labels }: RocActionRailProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  async function invoke(item: RocActionRailItem) {
    const key = `${item.resourceId}:${item.descriptor.action}`;
    setRows((prev) => ({ ...prev, [key]: { busy: true } }));
    try {
      const receipt = await submitRocWriteAction({
        path: item.path,
        action: item.descriptor,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        ...(item.reason ? { reason: item.reason } : {}),
      });
      setRows((prev) => ({ ...prev, [key]: { busy: false, receipt } }));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const key = `${item.resourceId}:${item.descriptor.action}`;
        const row = rows[key] ?? {};
        const disabled = !item.descriptor.enabled || row.busy === true;
        return (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: theme.surfaceLo,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.text,
                }}
              >
                {item.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CanvasPill
                  theme={theme}
                  tone={RISK_TONE[item.descriptor.riskLevel]}
                  dot
                >
                  {item.descriptor.riskLevel}
                </CanvasPill>
                {!item.descriptor.enabled ? (
                  <span style={{ fontSize: 11, color: theme.textMuted }}>
                    {labels.disabled}
                    {item.descriptor.disabledReasonCode
                      ? ` · ${item.descriptor.disabledReasonCode}`
                      : ""}
                  </span>
                ) : null}
                {row.receipt ? (
                  <CanvasPill
                    theme={theme}
                    tone={RECEIPT_TONE[row.receipt.status]}
                    dot
                  >
                    {labels.tracking}: {receiptTrackingNumber(row.receipt)}
                  </CanvasPill>
                ) : null}
                {row.error ? (
                  <CanvasPill theme={theme} tone="danger" dot>
                    {labels.failed}
                  </CanvasPill>
                ) : null}
              </div>
            </div>
            <CanvasBtn
              theme={theme}
              variant="primary"
              size="sm"
              disabled={disabled}
              danger={item.descriptor.riskLevel === "high"}
              onClick={() => void invoke(item)}
            >
              {row.busy ? labels.pending : labels.invoke}
            </CanvasBtn>
          </div>
        );
      })}
    </div>
  );
}
