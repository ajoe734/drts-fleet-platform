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
    en: "無資料",
    hint: "功能已就緒,目前沒有可顯示的資料。",
  },
  not_provisioned: {
    label: "尚未設定",
    en: "未開通",
    hint: "此功能或通道尚未為租戶啟用,需先完成基線設定。",
  },
  fetch_failed: {
    label: "讀取失敗",
    en: "讀取失敗",
    hint: "後端讀取發生錯誤,請稍後重試或檢查連線。",
  },
  permission_denied: {
    label: "權限不足",
    en: "權限不足",
    hint: "目前角色無法檢視此資料,請洽租戶管理員。",
  },
  external_unavailable: {
    label: "外部服務異常",
    en: "外部異常",
    hint: "相依的外部服務暫時無法使用,稍後會自動恢復。",
  },
  driver_not_eligible: {
    label: "司機未符資格",
    en: "資格不足",
    hint: "司機目前無法接收派遣（僅供司機端應用使用）。",
  },
  filtered_empty: {
    label: "篩選後為空",
    en: "篩選為空",
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
    urgent: { code: "T0", label: "緊急", note: "推送 + 5 秒後援輪詢" },
    fast: { code: "T1", label: "快速", note: "3 秒輪詢" },
    dispatch: { code: "T2", label: "派遣", note: "5 秒輪詢" },
    medium: { code: "T3", label: "中速", note: "15 秒輪詢" },
    medium_slow: { code: "T4", label: "中慢速", note: "30 秒輪詢" },
    slow: { code: "T5", label: "租戶慢速", note: "30 秒輪詢" },
    manual: { code: "T6", label: "手動", note: "手動刷新" },
  };

export interface CanvasRiskLevelMeta {
  /** Display label. */
  label: string;
  /** Confirmation pattern per Q-X09. */
  pattern: string;
}

export const CANVAS_RISK_LEVELS: Record<ActionRiskLevel, CanvasRiskLevelMeta> =
  {
    low: { label: "低風險", pattern: "直接執行 + 操作收據" },
    medium: { label: "中風險", pattern: "確認視窗 + 操作收據" },
    high: { label: "高風險", pattern: "確認視窗 + 原因 + 操作收據" },
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
    <span style={wrapStyle} role="img" aria-label={on ? "開啟" : "關閉"}>
      <span style={trackStyle}>
        <span style={knobStyle} />
      </span>
      {label ? <span style={labelStyle}>{label}</span> : null}
    </span>
  );
}
