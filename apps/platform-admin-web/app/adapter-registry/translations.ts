export const ADAPTER_REGISTRY_LOCAL_TRANSLATIONS = {
  en: {
    expiringSoon: "Expiring soon",
    expired: "Expired",
    valid: "Valid",
    unknown: "Unknown",
    expiryDaysRemaining: "Expires in {days} days ({date})",
    expiredOn: "Expired on {date}",
    validUntil: "Valid until {date}",
    unknownExpiry: "Credential expiry time is unknown",
    rotateNow: "Rotate now",
    attentionBannerTitle: "{platformCode} · {stateText}",
    attentionBannerExpiringBody:
      "{name} token will expire on {date} ({days} days remaining). Rotate before service interruption.",
    attentionBannerExpiredBody:
      "{name} token expired on {date}. Traffic may be disrupted, rotate immediately.",
    attentionBannerDegradedBody:
      "{name} health is {healthStatus}. Check adapter connectivity.",
    attentionBannerUnknownBody:
      "{name} credential status is {credentialStatus}, but expiry date is unknown. Please review adapter configuration.",
    registerTitle: "Register Adapter",
    editConfigTitle: "Edit Adapter Config",
    saveChanges: "Save changes",
    cancel: "Cancel",
  },
  zh: {
    expiringSoon: "即將到期",
    expired: "已到期",
    valid: "未到期",
    unknown: "未知",
    expiryDaysRemaining: "距到期 {days} 天（{date}）",
    expiredOn: "已於 {date} 到期",
    validUntil: "有效至 {date}",
    unknownExpiry: "憑證到期時間未知",
    rotateNow: "立即輪替",
    attentionBannerTitle: "{platformCode} · {stateText}",
    attentionBannerExpiringBody:
      "{name} 憑證將於 {date} 到期（剩餘 {days} 天），請在到期前完成輪替以確保介接正常。",
    attentionBannerExpiredBody:
      "{name} 憑證已於 {date} 到期，相關介接功能可能已中斷，請立即輪替。",
    attentionBannerDegradedBody:
      "{name} 健康狀態為 {healthStatus}，請檢查轉接器連線狀況。",
    attentionBannerUnknownBody:
      "{name} 目前憑證狀態為 {credentialStatus}，但到期時間未知，請檢查轉接器憑證設定。",
    registerTitle: "註冊 Adapter",
    editConfigTitle: "編輯 Adapter 設定",
    saveChanges: "儲存變更",
    cancel: "取消",
  },
} as const;

export type AdapterRegistryLocale =
  keyof typeof ADAPTER_REGISTRY_LOCAL_TRANSLATIONS;
