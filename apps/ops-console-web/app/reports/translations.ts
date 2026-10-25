import type { Locale } from "../../lib/translations";

// Bureau R09 / R10 copy for the six-month operations summary. Definitions are
// rendered from the API's own threshold so the page states the active rule.

const zh = {
  punctualityTitle: "未準時／未到（交通局 R10）",
  punctualityLate: (minutes: number) =>
    `未準時：預約單以預約起始時間、即時單以首次指派時間加指派當下承諾的 ETA 為基準，司機抵達上車點的紀錄晚於基準超過 ${minutes} 分鐘（剛好 ${minutes} 分鐘仍算準時）。`,
  punctualityNoShow:
    "未到：已指派、最終取消，且沒有抵達上車點紀錄的行程。取消原因為自由文字，系統未記錄取消是否確因司機未到，請以明細核對。",
  punctualityUnknown:
    "無法判定：缺少抵達、預約或指派 ETA 時間戳的已指派行程，不算準時也不算未準時。",
  assigned: "已指派行程",
  onTime: "準時",
  late: "未準時",
  noShow: "未到",
  unknown: "無法判定",
  complaintTitle: "客訴每月統計（交通局 R09，Asia/Taipei 月份）",
  complaintDefinition: (asOf: string) =>
    `建立：當月建立的案件。結案：當月有結案紀錄的案件。逾期：SLA 到期日落在當月、在 ${asOf} 前已到期且尚未結案的案件。低評分自動＝乘客低評分自動建立的案件；其餘為人工案件。`,
  month: "月份",
  lowRatingAuto: "低評分自動",
  manual: "人工",
  created: "建立",
  closed: "結案",
  overdue: "逾期",
  manualByCategory: "人工案件分類",
  windowTotal: "期間合計",
  drillHint: "點選數字可查看原始訂單／案件編號。",
  drillTitle: (label: string, count: number) => `明細：${label}（${count} 筆）`,
  drillEmpty: "沒有對應的訂單或案件。",
  close: "關閉",
  loadRecord: "讀取派遣紀錄",
  openCase: "開啟案件",
  recordMissing: "此訂單沒有派遣紀錄。",
  notProvided: "未提供",
  field: {
    reservationTime: "預約起始",
    firstAssignedAt: "首次指派",
    etaSecondsAtAssignment: "指派 ETA（秒）",
    arrivedPickupAt: "抵達上車點",
    finalStatus: "最終狀態",
    cancellationReason: "取消原因",
  },
};

const en: typeof zh = {
  punctualityTitle: "Late / no-show (Bureau R10)",
  punctualityLate: (minutes: number) =>
    `Late: the recorded pickup arrival is more than ${minutes} minutes after the reference time — the reservation start for scheduled orders, or first assignment plus the ETA committed at assignment for immediate orders (exactly ${minutes} minutes is on time).`,
  punctualityNoShow:
    "No-show: an assigned trip that was finally cancelled with no recorded pickup arrival. Cancellation reasons are free text and do not record whether the driver failed to arrive; verify in the drill-down.",
  punctualityUnknown:
    "Unknown: an assigned trip missing the arrival, reservation or assignment ETA timestamp; never counted as on time or late.",
  assigned: "Assigned trips",
  onTime: "On time",
  late: "Late",
  noShow: "No-show",
  unknown: "Unknown",
  complaintTitle:
    "Monthly complaint statistics (Bureau R09, Asia/Taipei months)",
  complaintDefinition: (asOf: string) =>
    `Created: cases created in the month. Closed: cases with a closure in the month. Overdue: cases whose SLA due falls in the month, passed before ${asOf}, and are not closed. Low-rating auto = created automatically from a low passenger rating; all others are manual.`,
  month: "Month",
  lowRatingAuto: "Low-rating auto",
  manual: "Manual",
  created: "Created",
  closed: "Closed",
  overdue: "Overdue",
  manualByCategory: "Manual cases by category",
  windowTotal: "Window total",
  drillHint: "Select a number to list the source order / case ids.",
  drillTitle: (label: string, count: number) =>
    `Drill-down: ${label} (${count})`,
  drillEmpty: "No source orders or cases.",
  close: "Close",
  loadRecord: "Load dispatch record",
  openCase: "Open case",
  recordMissing: "No dispatch record for this order.",
  notProvided: "Not provided",
  field: {
    reservationTime: "Reservation start",
    firstAssignedAt: "First assigned",
    etaSecondsAtAssignment: "ETA at assignment (s)",
    arrivedPickupAt: "Arrived at pickup",
    finalStatus: "Final status",
    cancellationReason: "Cancellation reason",
  },
};

export function operationsMetricsCopy(locale: Locale) {
  return locale === "zh" ? zh : en;
}
