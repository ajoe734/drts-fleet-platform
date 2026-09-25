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

export const breakGlassTranslations = {
  en: {
    surfaceTitle: "Emergency Break-Glass Access",
    activeSessionTitle: "Break-Glass Session Active",
    requestButton: "Request Emergency Access",
    empty: "No emergency access grants found.",
    requestModalTitle: "Request Emergency Break-Glass",
    escalationWarningTitle: "Emergency Privilege Escalation",
    justificationPlaceholder: "e.g., INC-10293 production outage recovery",
    proofReferenceLabel: "Incident Proof Reference",
    proofReferencePlaceholder: "Ticket URL or ID",
    grantModalTitle: "Break-Glass Grant",
    reasonCodeLabel: "Reason Code:",
    postUseAuditLabel: "Post-Use Audit:",
    manageGrant: "Manage Grant",
  },
  zh: {
    surfaceTitle: "緊急破窗存取 (Break-Glass)",
    activeSessionTitle: "破窗授權生效中",
    requestButton: "申請緊急破窗",
    empty: "尚無緊急破窗授權紀錄",
    requestModalTitle: "申請緊急破窗",
    escalationWarningTitle: "緊急權限升級",
    justificationPlaceholder: "例如：INC-10293 生產環境障礙排除",
    proofReferenceLabel: "事件證明參考 (Proof Reference)",
    proofReferencePlaceholder: "工單連結或編號",
    grantModalTitle: "破窗授權",
    reasonCodeLabel: "理由代碼：",
    postUseAuditLabel: "事後稽核：",
    manageGrant: "管理授權",
  },
} as const;

export const stepUpTranslations = {
  en: {
    sodViolationTitle: "Segregation of Duties Conflict · Blocked by System",
    stepUpRequiredTitle: "step-up proof or Fresh MFA required",
    getStepUpProof: "Get step-up proof",
    verifyingTitle: "Verifying",
    expiredTitle: "step-up proof expired",
    retry: "Retry",
  },
  zh: {
    sodViolationTitle: "職責分離衝突 · 核准已被系統阻擋",
    stepUpRequiredTitle: "需 step-up proof 或 Fresh MFA",
    getStepUpProof: "取得 step-up proof",
    verifyingTitle: "等待驗證",
    expiredTitle: "step-up proof 已失效",
    retry: "重新取得",
  },
} as const;

export function getSessionGovernanceCopy(locale: Locale) {
  return sessionGovernanceTranslations[locale === "en" ? "en" : "zh"];
}

export function getBreakGlassCopy(locale: Locale) {
  return breakGlassTranslations[locale === "en" ? "en" : "zh"];
}

export function getStepUpCopy(locale: Locale) {
  return stepUpTranslations[locale === "en" ? "en" : "zh"];
}
