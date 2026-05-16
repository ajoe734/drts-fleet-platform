import type { StatusToneName } from "./colors";

export const STATUS_VOCABULARY = [
  "received",
  "broadcasted",
  "accept_pending",
  "confirmed",
  "lost_race",
  "cancelled",
  "sync_failed",
  "manual_fallback_required",
] as const;

export type ForwardedStatus = (typeof STATUS_VOCABULARY)[number];

export interface LocalizedDisplayString {
  readonly en: string;
  readonly zhTW: string;
}

export const STATUS_DISPLAY_STRINGS = {
  received: {
    en: "Received",
    zhTW: "已接收",
  },
  broadcasted: {
    en: "Broadcasted",
    zhTW: "已廣播",
  },
  accept_pending: {
    en: "Awaiting Platform Confirmation",
    zhTW: "等待平台確認",
  },
  confirmed: {
    en: "Confirmed",
    zhTW: "已確認",
  },
  lost_race: {
    en: "Lost Race",
    zhTW: "已失單",
  },
  cancelled: {
    en: "Cancelled",
    zhTW: "已取消",
  },
  sync_failed: {
    en: "Sync Failed",
    zhTW: "同步失敗",
  },
  manual_fallback_required: {
    en: "Manual Fallback Required",
    zhTW: "需要人工接手",
  },
} as const satisfies Record<ForwardedStatus, LocalizedDisplayString>;

export const STATUS_TONE_BY_VALUE = {
  received: "info",
  broadcasted: "info",
  accept_pending: "warning",
  confirmed: "success",
  lost_race: "warning",
  cancelled: "neutral",
  sync_failed: "danger",
  manual_fallback_required: "danger",
} as const satisfies Record<ForwardedStatus, StatusToneName>;

export const DISPLAY_STRINGS = {
  authority: {
    owned: {
      en: "Owned Dispatch",
      zhTW: "自營派遣",
    },
    forwarded: {
      en: "Forwarded Order",
      zhTW: "轉派訂單",
    },
  },
  surfaces: {
    platform: {
      en: "Platform Admin",
      zhTW: "平台管理後台",
    },
    ops: {
      en: "Ops Console",
      zhTW: "營運控制台",
    },
    tenant: {
      en: "Tenant Console",
      zhTW: "租戶控制台",
    },
    partner: {
      en: "Partner Booking",
      zhTW: "合作夥伴叫車入口",
    },
  },
} as const;

export function isForwardedStatus(value: string): value is ForwardedStatus {
  return (STATUS_VOCABULARY as readonly string[]).includes(value);
}
