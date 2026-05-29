import type { CanvasTone } from "@drts/ui-web";
import type { CanvasIconName } from "@drts/ui-web/canvas-primitives";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantSlaProfile,
} from "@drts/contracts";

/**
 * Result of a server action invoked from the SLA profile manager. `tone`
 * `default` means success (the client refreshes the route); `warning` keeps
 * the form open with the failure reason.
 */
export type SlaFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
};

/**
 * Action identifiers surfaced on `/sla` per packet §5.9 must-support
 * actions. They key the `availableActions` projection rendered as CTAs.
 */
export const SLA_ACTION_UPDATE = "update_sla_profile";
export const SLA_ACTION_RECALCULATE = "recalculate_existing_bookings";

/**
 * `/sla` is refresh tier T5 (packet §5.9). T5 maps to the `slow` cadence
 * tier in the Q-X02 fixed-cadence enum (matches `refreshTier="slow"` on the
 * Tenant Console.html SLA artboard). The profile is admin-edited, not a live
 * stream, so the page polls slowly and offers a manual refresh affordance.
 */
export const SLA_REFRESH_TIER: RefreshTier = "slow";

export const REFRESH_TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "即時推播 · 5s 後援輪詢",
  fast: "3s 自動更新",
  dispatch: "5s 自動更新",
  medium: "15s 自動更新",
  medium_slow: "30s 自動更新",
  slow: "30s 自動更新",
  manual: "手動更新",
};

/**
 * The 6 tenant-applicable EmptyReason states. `driver_not_eligible` is
 * driver-app-only (Q-DRV01) and is intentionally excluded here. Each entry
 * renders a visually distinct empty state per Q-X15 so the admin can tell
 * "not configured yet" apart from "we could not load it".
 */
export type SlaEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

export type SlaEmptyReasonMeta = {
  icon: CanvasIconName;
  tone: CanvasTone;
  title: string;
  body: string;
  /** messageCode mirrored onto the EmptyStateEnvelope for traceability. */
  messageCode: string;
};

export const SLA_EMPTY_REASON_META: Record<SlaEmptyReason, SlaEmptyReasonMeta> =
  {
    not_provisioned: {
      icon: "sla",
      tone: "accent",
      title: "尚未設定 SLA 門檻",
      body: "本租戶還沒有 SLA profile。設定 wait / arrival / completion 三個門檻後，新建立的訂單就會依此計算 SLA。",
      messageCode: "tenant.sla.not_provisioned",
    },
    no_data: {
      icon: "sla",
      tone: "neutral",
      title: "目前沒有 SLA 門檻資料",
      body: "後端回報此租戶沒有可顯示的 SLA 門檻紀錄。請稍後再試，或建立新的 SLA profile。",
      messageCode: "tenant.sla.no_data",
    },
    fetch_failed: {
      icon: "warn",
      tone: "danger",
      title: "SLA 門檻載入失敗",
      body: "讀取 SLA profile 時發生錯誤。這不是「沒有設定」，而是無法取得資料；請重新整理後再試。",
      messageCode: "tenant.sla.fetch_failed",
    },
    permission_denied: {
      icon: "warn",
      tone: "warn",
      title: "沒有檢視 SLA 門檻的權限",
      body: "你目前的角色無法檢視此租戶的 SLA profile（需要 tenant:sla:read）。請聯絡租戶管理員調整權限。",
      messageCode: "tenant.sla.permission_denied",
    },
    external_unavailable: {
      icon: "warn",
      tone: "warn",
      title: "SLA 服務暫時無法使用",
      body: "提供 SLA profile 的後端服務目前無法連線。資料可能只是暫時無法取得，稍後會自動恢復。",
      messageCode: "tenant.sla.external_unavailable",
    },
    filtered_empty: {
      icon: "filter",
      tone: "info",
      title: "目前篩選條件下沒有 SLA 門檻",
      body: "目前的篩選條件沒有對應的 SLA 門檻。清除篩選即可看到此租戶完整的 SLA profile。",
      messageCode: "tenant.sla.filtered_empty",
    },
  };

/**
 * Build the `availableActions` projection that drives the SLA CTAs.
 *
 * Per `@drts/contracts` ui-runtime (Q-X13) the backend will eventually emit
 * these on the profile read model; until `TenantSlaProfile` carries the
 * field, this projects the packet §5.9 must-support actions as typed
 * `ResourceActionDescriptor[]`. CTAs are rendered by mapping over the array,
 * so the array is the single source of truth for which CTAs appear and how
 * they confirm (Q-X09 risk → confirmation pattern).
 *
 * - Update SLA profile: wired (`POST /api/tenant/sla`), high risk, requires a
 *   reason because it changes SLA computation for all future bookings.
 * - Recalculate existing bookings: a high-risk admin command that is not yet
 *   provisioned, so it is surfaced `enabled: false` with a reason code —
 *   exactly the contract's "show the affordance disabled with a tooltip"
 *   behaviour, instead of faking a command that does nothing.
 */
export function buildSlaAvailableActions(
  profile: TenantSlaProfile | null,
): ResourceActionDescriptor[] {
  const hasProfile = profile !== null;

  return [
    {
      action: SLA_ACTION_UPDATE,
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: SLA_ACTION_RECALCULATE,
      enabled: false,
      disabledReasonCode: hasProfile
        ? "admin_command_not_available"
        : "sla_not_provisioned",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

export const SLA_ACTION_META: Record<
  string,
  { label: string; en: string; help: string }
> = {
  [SLA_ACTION_UPDATE]: {
    label: "儲存設定",
    en: "update SLA profile",
    help: "變更會套用到新建立的訂單與之後計算的 SLA event。",
  },
  [SLA_ACTION_RECALCULATE]: {
    label: "重算既有訂單",
    en: "recalculate existing bookings",
    help: "需要管理員命令；此環境尚未開放，因此暫時停用。",
  },
};

export const SLA_DISABLED_REASON_LABEL: Record<string, string> = {
  admin_command_not_available:
    "重算為管理員命令，此環境尚未提供對應的後端 endpoint。",
  sla_not_provisioned: "需先設定 SLA profile 才能重算既有訂單。",
};
