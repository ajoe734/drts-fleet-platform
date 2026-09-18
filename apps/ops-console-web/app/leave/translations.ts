/**
 * Copy and translations dictionary for Ops Console leave review workspace.
 * Kept in translations.ts to comply with repository i18n-guard and modular architecture.
 */

export const LEAVE_OPS_COPY = {
  // Page titles & headers
  pageTitle: "請假審核 · Leave Requests",
  emptyRequestsTitle: "查無請假申請",
  emptyRequestsSubtitle: "目前選取的篩選條件下沒有待處理的請假紀錄。",
  loadingTitle: "載入中",
  errorTitle: "暫時無法讀取",
  loadError: "無法取得請假資料，請重新讀取。",
  reviewError: "審核未完成，請重新讀取最新狀態後再試。",
  eligibilityNotEvaluated: "派工時即時檢查",
  leavePeriod: "請假時段",
  loadingSubtitle: "正在讀取請假資料…",
  unitRecords: "筆",
  detailsAction: "詳情",

  // Filters
  filterTypeAll: "假別：全部",
  filterTypeAnnual: "假別：特休",
  filterTypeSick: "假別：病假",
  filterTypePersonal: "假別：事假",
  filterTypeFuneral: "假別：喪假",
  filterTypeEmergency: "假別：緊急事假",
  searchPlaceholder: "司機姓名 / driverId",

  // Detail View
  requestContentTitle: "申請內容",
  reviewNotesPlaceholder: "輸入核准／駁回原因（選填）…",
  shiftOverlapTitle: "班次重疊預覽",
  noShiftOverlapTitle: "無重疊班次",
  reassignNotice: "將標記調離",
  backToQueue: "返回佇列",

  // Conflict View
  conflictTitle: "伺服器衝突狀態 · Server Conflict",
  reloadLatestState: "重新讀取最新狀態",

  // History View
  historyTitle: "請假審核歷史",
  noHistoryTitle: "無歷史紀錄",
  withdrawnByDriver: "—（司機自行撤回）",
  timeRangeAll: "時間區間：全部",
  timeRangeMonth: "時間區間：本月",
  timeRangeWeek: "時間區間：本週",
  decisionAll: "決策：全部",
  decisionApproved: "決策：已核准",
  decisionRejected: "決策：已駁回",
  decisionWithdrawn: "決策：已撤回",

  // Shift Impact View
  shiftReassigned: "請假調離",
  pendingReview: "待審核中",
  regularShift: "正常排班",
  ineligibleStatus: "不合格 · ineligible",
  eligibleStatus: "合格 · eligible",
  shiftSuppressionTitle: "班表連動與派單資格壓制",
  autoSyncNotice: "即時連動 · 無需人工同步",
} as const;

export type LeaveOpsCopyKey = keyof typeof LEAVE_OPS_COPY;

export function tLeave(key: LeaveOpsCopyKey): string {
  return LEAVE_OPS_COPY[key];
}
