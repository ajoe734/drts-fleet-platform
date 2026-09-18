export type Locale = "en" | "zh";

export const sessionGovernanceTranslations = {
  en: {
    sessionsReadDenied:
      "Access Denied (403 Forbidden): Insufficient authority to inspect user session inventory (requires identity:sessions:read).",
    sessionsWriteDenied:
      "Access Denied (403 Forbidden): Insufficient authority to revoke session (requires identity:sessions:write).",
    loadFailed: "Failed to load session inventory",
    revokeFailed: "Session revoke failed",
  },
  zh: {
    sessionsReadDenied:
      "存取被拒 (403 權限不足)：目前角色缺乏檢視工作階段清單授權 (需具備 identity:sessions:read)。",
    sessionsWriteDenied:
      "存取被拒 (403 權限不足)：目前角色缺乏撤銷工作階段授權 (需具備 identity:sessions:write)。",
    loadFailed: "讀取工作階段失敗",
    revokeFailed: "撤銷工作階段失敗",
  },
} as const;

export function getSessionGovernanceCopy(locale: Locale) {
  return sessionGovernanceTranslations[locale === "en" ? "en" : "zh"];
}
