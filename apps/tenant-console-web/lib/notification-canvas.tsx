import type { CSSProperties } from "react";
import type {
  ActionRiskLevel,
  EmptyReason,
  RefreshTier,
} from "@drts/contracts";
import type { CanvasTheme } from "@drts/ui-web";

/**
 * Local canvas display metadata for the tenant-console /notifications screen.
 *
 * The canonical enums (`EmptyReason`, `RefreshTier`, `ActionRiskLevel`) live in
 * `@drts/contracts`; this module only attaches the page-facing display copy
 * (Q-X02 / Q-X13 / Q-X15) so the screen can render distinct visuals without
 * inventing shared `@drts/ui-web` exports that a sibling design-system lane
 * still owns. Behaviour stays driven by the contract types; the labels here
 * are presentation, scoped to the tenant-console build path.
 */

export type CanvasEmptyReason = EmptyReason;

export interface CanvasEmptyReasonMeta {
  /** Localised display label. */
  label: string;
  /** Short uppercase token for the design-system pill. */
  en: string;
  /** One-line explanation of what the state means. */
  hint: string;
}

export const CANVAS_EMPTY_REASONS: Record<
  CanvasEmptyReason,
  CanvasEmptyReasonMeta
> = {
  no_data: {
    label: "尚無資料",
    en: "NO DATA",
    hint: "功能已就緒,目前沒有可顯示的資料。",
  },
  not_provisioned: {
    label: "尚未設定",
    en: "NOT PROVISIONED",
    hint: "此功能或通道尚未為租戶啟用,需先完成基線設定。",
  },
  fetch_failed: {
    label: "讀取失敗",
    en: "FETCH FAILED",
    hint: "後端讀取發生錯誤,請稍後重試或檢查連線。",
  },
  permission_denied: {
    label: "權限不足",
    en: "PERMISSION DENIED",
    hint: "目前角色無法檢視此資料,請洽 tenant admin。",
  },
  external_unavailable: {
    label: "外部服務異常",
    en: "EXTERNAL UNAVAILABLE",
    hint: "相依的外部服務暫時無法使用,稍後會自動恢復。",
  },
  driver_not_eligible: {
    label: "司機未符資格",
    en: "DRIVER NOT ELIGIBLE",
    hint: "司機目前無法接收派遣 (driver app 專用狀態)。",
  },
  filtered_empty: {
    label: "篩選後為空",
    en: "FILTERED EMPTY",
    hint: "目前篩選條件下沒有符合的資料,調整條件即可。",
  },
};

export interface CanvasRefreshTierMeta {
  /** Tenant-console tier code (Q-X02). */
  code: string;
  /** Display label. */
  label: string;
  /** Cadence note. */
  note: string;
}

export const CANVAS_REFRESH_TIERS: Record<RefreshTier, CanvasRefreshTierMeta> =
  {
    urgent: { code: "T0", label: "Urgent", note: "Push + 5s 後援輪詢" },
    fast: { code: "T1", label: "Fast", note: "3s 輪詢" },
    dispatch: { code: "T2", label: "Dispatch", note: "5s 輪詢" },
    medium: { code: "T3", label: "Medium", note: "15s 輪詢" },
    medium_slow: { code: "T4", label: "Medium slow", note: "30s 輪詢" },
    slow: { code: "T5", label: "Tenant slow", note: "30s 輪詢" },
    manual: { code: "T6", label: "Manual", note: "手動刷新" },
  };

export interface CanvasRiskLevelMeta {
  /** Display label. */
  label: string;
  /** Confirmation pattern per Q-X09. */
  pattern: string;
}

export const CANVAS_RISK_LEVELS: Record<ActionRiskLevel, CanvasRiskLevelMeta> =
  {
    low: { label: "Low", pattern: "直接執行 + toast receipt" },
    medium: { label: "Medium", pattern: "modal confirm + receipt" },
    high: { label: "High", pattern: "modal confirm + 原因 + receipt" },
  };

export interface CanvasToggleProps {
  theme: CanvasTheme;
  on: boolean;
  label?: string;
}

/**
 * Read-only on/off indicator styled as a switch. The /notifications screen is a
 * server-rendered snapshot (T5 cadence), so this renders state only — mutation
 * happens through the `update_subscription` action / save CTA, not by toggling
 * here.
 */
export function CanvasToggle({ theme, on, label }: CanvasToggleProps) {
  const trackStyle: CSSProperties = {
    position: "relative",
    width: 30,
    height: 16,
    borderRadius: 999,
    background: on ? theme.accent : theme.neutralBg,
    border: `1px solid ${on ? theme.accentBorder : theme.border}`,
    flex: "0 0 auto",
    transition: "background 120ms ease",
  };
  const knobStyle: CSSProperties = {
    position: "absolute",
    top: 1,
    left: on ? 15 : 1,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: on ? theme.invert : theme.textMuted,
    transition: "left 120ms ease",
  };
  const wrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  const labelStyle: CSSProperties = {
    fontFamily: theme.monoFamily,
    fontSize: 11,
    color: on ? theme.text : theme.textDim,
  };
  return (
    <span style={wrapStyle} role="img" aria-label={on ? "on" : "off"}>
      <span style={trackStyle}>
        <span style={knobStyle} />
      </span>
      {label ? <span style={labelStyle}>{label}</span> : null}
    </span>
  );
}
