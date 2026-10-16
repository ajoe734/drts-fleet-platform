import type { Locale } from "../../lib/translations";

export const TENANT_LIFECYCLE_TRANSLATIONS = {
  "zh-TW": {
    "tenantLifecycle.ackTitle": "伺服器權威 ACK 與讀回 · {action}",
    "tenantLifecycle.ackBody":
      "租戶 {code} ({id}) · 狀態 {status} · 階段 {stage} · 權威更新時間 {updatedAt}",
    "tenantLifecycle.ackBodyWithReason":
      "租戶 {code} ({id}) · 狀態 {status} · 階段 {stage} · 原因：{reason} · 權威更新時間 {updatedAt}",
    "tenantLifecycle.action.updateSettings": "已更新租戶設定、配額與啟用模組",
    "tenantLifecycle.action.updateOnboarding": "已更新租戶 Onboarding 與 Gate 基線",
    "tenantLifecycle.action.setRolloutStage": "已更新租戶 Rollout 階段 ({stage})",
    "tenantLifecycle.action.suspend": "已暫停租戶 (paused)",
    "tenantLifecycle.action.activate": "已啟用租戶 (active)",
    "tenantLifecycle.action.rollbackHold": "已進入 rollback_hold 管控",
    "tenantLifecycle.action.inviteRole": "已邀請預設角色 ({roleCode})",
    "tenantLifecycle.action.acknowledgeRole": "已確認預設角色 ({roleCode})",
    "tenantLifecycle.authorityNoticeTitle":
      "目前身分不具備租戶生命週期寫入權限",
    "tenantLifecycle.authorityNoticeBody":
      "需要平台領域 (platform) 的 pa_tenant_mgr 或 pa_super_admin 角色與 foundation:write 授權範圍；切換 UI 視角或瀏覽器狀態不會授予寫入權限。",
    "tenantLifecycle.settingsCardTitle": "租戶設定、配額與啟用模組",
    "tenantLifecycle.settingsCardSubtitle":
      "直接透過授權 API 更新既有租戶名稱、配額與啟用模組，並以伺服器權威讀回同步畫面",
    "tenantLifecycle.settingsConfirmLabel":
      "我確認此設定、配額與模組變更將直接套用至租戶 {code}",
    "tenantLifecycle.saveSettings": "儲存設定、配額與模組",
    "tenantLifecycle.savingSettings": "儲存設定中…",
    "tenantLifecycle.resetForm": "重設為目前權威值",
    "tenantLifecycle.onboardingCardTitle": "Onboarding 套件與 Rollout 閘門準備度",
    "tenantLifecycle.onboardingCardSubtitle":
      "管理帳務聯絡基線、整合網址、API 範圍、Webhook 事件與切換／回退負責人",
    "tenantLifecycle.invoiceTitle": "發票抬頭",
    "tenantLifecycle.billingContactName": "帳務聯絡人",
    "tenantLifecycle.billingContactEmail": "帳務聯絡信箱",
    "tenantLifecycle.integrationMode": "整合模式",
    "tenantLifecycle.sandboxBaseUrl": "Sandbox Base URL",
    "tenantLifecycle.productionBaseUrl": "Production Base URL",
    "tenantLifecycle.apiKeyScopes": "API 金鑰範圍（逗號分隔）",
    "tenantLifecycle.webhookEvents": "Webhook 事件（逗號分隔）",
    "tenantLifecycle.cutoverOwner": "切換負責人 (Cutover Owner)",
    "tenantLifecycle.rollbackOwner": "回退負責人 (Rollback Owner)",
    "tenantLifecycle.rolloutNotes": "推進備註 (Rollout Notes)",
    "tenantLifecycle.sandboxGateStatus": "Sandbox Gate 狀態",
    "tenantLifecycle.pilotGateStatus": "Pilot Gate 狀態",
    "tenantLifecycle.productionGateStatus": "Production Gate 狀態",
    "tenantLifecycle.rollbackPreparedLabel":
      "已完成 Production 回退準備 (rollbackPrepared)",
    "tenantLifecycle.onboardingConfirmLabel":
      "我確認更新租戶 {code} 的 Onboarding 套件與 Rollout 閘門設定",
    "tenantLifecycle.saveOnboarding": "儲存 Onboarding 設定",
    "tenantLifecycle.savingOnboarding": "儲存 Onboarding 中…",
    "tenantLifecycle.rolloutStageControlTitle": "Rollout 階段推進與切換",
    "tenantLifecycle.rolloutStageSelectLabel": "目標 Rollout 階段",
    "tenantLifecycle.rolloutStageNotesLabel": "階段變更備註",
    "tenantLifecycle.rolloutStageNotesPlaceholder":
      "記錄推進或階段調整依據與驗證結果",
    "tenantLifecycle.rolloutConfirmLabel":
      "我確認將租戶 {code} 的 Rollout 階段調整為 {stage}",
    "tenantLifecycle.applyRolloutStage": "套用 Rollout 階段",
    "tenantLifecycle.applyingRolloutStage": "套用階段中…",
    "tenantLifecycle.activateTenant": "啟用租戶 (Activate)",
    "tenantLifecycle.activatingTenant": "啟用中…",
    "tenantLifecycle.suspendTenant": "暫停租戶 (Suspend)",
    "tenantLifecycle.suspendingTenant": "暫停中…",
    "tenantLifecycle.activateModalTitle": "確認啟用租戶",
    "tenantLifecycle.activateModalSubtitle":
      "中風險生命週期變更 · 租戶將恢復為 active 狀態",
    "tenantLifecycle.activateModalBannerTitle": "{name} 將恢復為 active 狀態",
    "tenantLifecycle.activateModalBannerBody":
      "若租戶先前處於 paused 或 rollback_hold，啟用後會清除回退凍結並同步權威狀態。",
    "tenantLifecycle.confirmActivate": "確認啟用租戶",
    "tenantLifecycle.suspendModalTitle": "暫停租戶服務 (Suspend)",
    "tenantLifecycle.suspendModalSubtitle":
      "高風險生命週期控制 · 需要明確記錄暫停原因",
    "tenantLifecycle.suspendModalBannerTitle": "{name} 將進入 paused 狀態",
    "tenantLifecycle.suspendModalBannerBody":
      "暫停租戶屬於高風險治理操作，必須填寫稽核原因後才能送出。",
    "tenantLifecycle.suspendReasonLabel": "暫停原因",
    "tenantLifecycle.suspendReasonPlaceholder":
      "請說明暫停此租戶的原因、關聯事件或核准單號…",
    "tenantLifecycle.confirmSuspend": "確認暫停租戶",
    "tenantLifecycle.rollbackModalBannerTitle":
      "{name} 將進入 rollback_hold 並阻擋後續推進",
    "tenantLifecycle.rollbackModalBannerBody":
      "當上線風險或事故狀態需要明確治理凍結時使用，必須填寫原因。",
    "tenantLifecycle.rollbackReasonLabel": "回退凍結原因",
    "tenantLifecycle.confirmRollbackHold": "確認進入 rollback_hold",
    "tenantLifecycle.closeModal": "關閉",
    "tenantLifecycle.cancelModal": "取消",
    "tenantLifecycle.submitting": "送出中…",
    "tenantLifecycle.inviteAction": "發送邀請",
    "tenantLifecycle.invitingAction": "邀請中…",
    "tenantLifecycle.acknowledgeAction": "確認角色",
    "tenantLifecycle.acknowledgingAction": "確認中…",
    "tenantLifecycle.roleRequired": "必要角色",
    "tenantLifecycle.roleOptional": "選用角色",
    "tenantLifecycle.roleAcknowledged": "已確認",
    "tenantLifecycle.roleInvited": "邀請中",
    "tenantLifecycle.roleUninvited": "未邀請",
    "tenantLifecycle.pendingAssignment": "待指派",
    "tenantLifecycle.rollbackPreparedTrueBody":
      "租戶已具備 production rollback 條件。",
    "tenantLifecycle.rollbackPreparedFalseBody":
      "推進到 production 前，需先補齊 rollback plan。",
    "tenantLifecycle.roleAckSummaryBody":
      "{acknowledged}/{total} 角色已邀請並確認。",
    "tenantLifecycle.noCutoverNote": "尚未記錄額外 cutover note。",
    "tenantLifecycle.rolesCardTitle":
      "角色與邀請 · {acknowledged}/{total} 已確認",
    "tenantLifecycle.activeRollbackHoldTitle": "租戶目前處於 rollback_hold",
    "tenantLifecycle.noActiveRollbackHoldTitle": "目前無回退凍結",
    "tenantLifecycle.lastPromotionBody": "最近推進：{at}",
    "tenantLifecycle.noPromotionHistory": "尚無推進歷史紀錄。",
    "tenantLifecycle.confirmationRequiredError":
      "請先勾選確認選項後再執行此變更。",
  },
  en: {
    "tenantLifecycle.ackTitle": "Authoritative Server ACK & Readback · {action}",
    "tenantLifecycle.ackBody":
      "Tenant {code} ({id}) · status {status} · stage {stage} · authoritative updatedAt {updatedAt}",
    "tenantLifecycle.ackBodyWithReason":
      "Tenant {code} ({id}) · status {status} · stage {stage} · reason: {reason} · authoritative updatedAt {updatedAt}",
    "tenantLifecycle.action.updateSettings":
      "Updated tenant settings, quotas, and enabled modules",
    "tenantLifecycle.action.updateOnboarding":
      "Updated tenant onboarding package and gate baseline",
    "tenantLifecycle.action.setRolloutStage":
      "Updated tenant rollout stage ({stage})",
    "tenantLifecycle.action.suspend": "Suspended tenant (paused)",
    "tenantLifecycle.action.activate": "Activated tenant (active)",
    "tenantLifecycle.action.rollbackHold": "Entered rollback_hold",
    "tenantLifecycle.action.inviteRole": "Invited bootstrap role ({roleCode})",
    "tenantLifecycle.action.acknowledgeRole":
      "Acknowledged bootstrap role ({roleCode})",
    "tenantLifecycle.authorityNoticeTitle":
      "Current identity lacks tenant lifecycle write authority",
    "tenantLifecycle.authorityNoticeBody":
      "Requires platform realm with pa_tenant_mgr or pa_super_admin role and foundation:write scope; UI persona or browser state never grants write authority.",
    "tenantLifecycle.settingsCardTitle":
      "Tenant Settings, Quotas & Enabled Modules",
    "tenantLifecycle.settingsCardSubtitle":
      "Update existing tenant name, quotas, and enabled modules via the authorized API and sync from authoritative server readback",
    "tenantLifecycle.settingsConfirmLabel":
      "I confirm applying these settings, quota, and module changes to tenant {code}",
    "tenantLifecycle.saveSettings": "Save settings, quotas & modules",
    "tenantLifecycle.savingSettings": "Saving settings…",
    "tenantLifecycle.resetForm": "Reset to authoritative values",
    "tenantLifecycle.onboardingCardTitle":
      "Onboarding Package & Rollout Gate Readiness",
    "tenantLifecycle.onboardingCardSubtitle":
      "Manage billing baseline, integration URLs, API scopes, webhook events, and cutover/rollback owners",
    "tenantLifecycle.invoiceTitle": "Invoice title",
    "tenantLifecycle.billingContactName": "Billing contact name",
    "tenantLifecycle.billingContactEmail": "Billing contact email",
    "tenantLifecycle.integrationMode": "Integration mode",
    "tenantLifecycle.sandboxBaseUrl": "Sandbox Base URL",
    "tenantLifecycle.productionBaseUrl": "Production Base URL",
    "tenantLifecycle.apiKeyScopes": "API key scopes (comma-separated)",
    "tenantLifecycle.webhookEvents": "Webhook events (comma-separated)",
    "tenantLifecycle.cutoverOwner": "Cutover Owner",
    "tenantLifecycle.rollbackOwner": "Rollback Owner",
    "tenantLifecycle.rolloutNotes": "Rollout Notes",
    "tenantLifecycle.sandboxGateStatus": "Sandbox Gate Status",
    "tenantLifecycle.pilotGateStatus": "Pilot Gate Status",
    "tenantLifecycle.productionGateStatus": "Production Gate Status",
    "tenantLifecycle.rollbackPreparedLabel":
      "Production rollback plan prepared (rollbackPrepared)",
    "tenantLifecycle.onboardingConfirmLabel":
      "I confirm updating the onboarding package and rollout gate baseline for tenant {code}",
    "tenantLifecycle.saveOnboarding": "Save onboarding package",
    "tenantLifecycle.savingOnboarding": "Saving onboarding…",
    "tenantLifecycle.rolloutStageControlTitle":
      "Rollout Stage Promotion & Transition",
    "tenantLifecycle.rolloutStageSelectLabel": "Target Rollout Stage",
    "tenantLifecycle.rolloutStageNotesLabel": "Stage Transition Notes",
    "tenantLifecycle.rolloutStageNotesPlaceholder":
      "Record promotion rationale or verification notes",
    "tenantLifecycle.rolloutConfirmLabel":
      "I confirm setting rollout stage for tenant {code} to {stage}",
    "tenantLifecycle.applyRolloutStage": "Apply rollout stage",
    "tenantLifecycle.applyingRolloutStage": "Applying stage…",
    "tenantLifecycle.activateTenant": "Activate tenant",
    "tenantLifecycle.activatingTenant": "Activating…",
    "tenantLifecycle.suspendTenant": "Suspend tenant",
    "tenantLifecycle.suspendingTenant": "Suspending…",
    "tenantLifecycle.activateModalTitle": "Confirm Tenant Activation",
    "tenantLifecycle.activateModalSubtitle":
      "Medium-risk lifecycle transition · restores tenant to active status",
    "tenantLifecycle.activateModalBannerTitle":
      "{name} will be restored to active status",
    "tenantLifecycle.activateModalBannerBody":
      "Activating a paused or rollback_hold tenant clears the hold and refreshes authoritative tenant state.",
    "tenantLifecycle.confirmActivate": "Confirm activate",
    "tenantLifecycle.suspendModalTitle": "Suspend Tenant Service",
    "tenantLifecycle.suspendModalSubtitle":
      "High-risk lifecycle control · explicit audit reason required",
    "tenantLifecycle.suspendModalBannerTitle":
      "{name} will transition to paused status",
    "tenantLifecycle.suspendModalBannerBody":
      "Suspending a tenant is a high-risk governance action and requires a non-empty audit reason.",
    "tenantLifecycle.suspendReasonLabel": "Suspension Reason",
    "tenantLifecycle.suspendReasonPlaceholder":
      "Describe the operational reason, incident reference, or approval ticket…",
    "tenantLifecycle.confirmSuspend": "Confirm suspend",
    "tenantLifecycle.rollbackModalBannerTitle":
      "{name} will be blocked from further promotion.",
    "tenantLifecycle.rollbackModalBannerBody":
      "Use this when rollout risk or incident state requires an explicit governance hold.",
    "tenantLifecycle.rollbackReasonLabel": "Reason",
    "tenantLifecycle.confirmRollbackHold": "Confirm rollback_hold",
    "tenantLifecycle.closeModal": "Close",
    "tenantLifecycle.cancelModal": "Cancel",
    "tenantLifecycle.submitting": "Submitting…",
    "tenantLifecycle.inviteAction": "Invite",
    "tenantLifecycle.invitingAction": "Inviting…",
    "tenantLifecycle.acknowledgeAction": "Acknowledge",
    "tenantLifecycle.acknowledgingAction": "Saving…",
    "tenantLifecycle.roleRequired": "required role",
    "tenantLifecycle.roleOptional": "optional role",
    "tenantLifecycle.roleAcknowledged": "Acknowledged",
    "tenantLifecycle.roleInvited": "Invited",
    "tenantLifecycle.roleUninvited": "Not invited",
    "tenantLifecycle.pendingAssignment": "Pending assignment",
    "tenantLifecycle.rollbackPreparedTrueBody":
      "Tenant meets production rollback readiness requirements.",
    "tenantLifecycle.rollbackPreparedFalseBody":
      "Complete the rollback plan before promoting to production.",
    "tenantLifecycle.roleAckSummaryBody":
      "{acknowledged}/{total} roles invited and acknowledged.",
    "tenantLifecycle.noCutoverNote": "No additional cutover note recorded.",
    "tenantLifecycle.rolesCardTitle":
      "Roles & invites · {acknowledged}/{total} acknowledged",
    "tenantLifecycle.activeRollbackHoldTitle":
      "Tenant is currently in rollback_hold",
    "tenantLifecycle.noActiveRollbackHoldTitle": "No active rollback hold",
    "tenantLifecycle.lastPromotionBody": "Last promotion: {at}",
    "tenantLifecycle.noPromotionHistory":
      "Promotion history not yet recorded.",
    "tenantLifecycle.confirmationRequiredError":
      "Please confirm this change before submitting.",
  },
} as const;

export type TenantLifecycleTranslationKey =
  keyof (typeof TENANT_LIFECYCLE_TRANSLATIONS)["zh-TW"];

export function translateTenantLifecycle(
  locale: Locale | "zh-TW",
  key: TenantLifecycleTranslationKey,
  params?: Record<string, string | number>,
): string {
  const normalizedLocale = locale === "en" ? "en" : "zh-TW";
  const dictionary = TENANT_LIFECYCLE_TRANSLATIONS[normalizedLocale];
  let text: string =
    dictionary[key] ?? TENANT_LIFECYCLE_TRANSLATIONS["zh-TW"][key] ?? key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replaceAll(`{${paramKey}}`, String(paramValue));
    }
  }

  return text;
}
