import type { Locale } from "@/lib/translations";
import type { TrainingStatus } from "@drts/contracts";

type TrainingDict = Record<string, Record<Locale, string>>;

export const trainingTranslations: TrainingDict = {
  connAlert: {
    zh: "連線狀態提示：",
    en: "Connection notice: ",
  },
  noCourseStats: {
    zh: "目前尚無課程進度統計資料",
    en: "No course progress data available",
  },
  attemptDetailTitle: {
    zh: "測驗作答證據下鑽 · Quiz Attempt Evidence Detail",
    en: "Quiz Attempt Evidence Detail",
  },
  driverIdLabel: {
    zh: "學員編號：",
    en: "Driver ID: ",
  },
  attemptIdLabel: {
    zh: "歷程識別碼：",
    en: "Attempt ID: ",
  },
  closeEvidence: {
    zh: "關閉證據檢視 ✕",
    en: "Close Evidence ✕",
  },
  courseCodeLabel: {
    zh: "課程代碼：",
    en: "Course Code: ",
  },
  quizScoreLabel: {
    zh: "測驗成績：",
    en: "Quiz Score: ",
  },
  ptsSuffix: {
    zh: "分",
    en: "pts",
  },
  verdictLabel: {
    zh: "判定結果：",
    en: "Verdict: ",
  },
  passedVerdict: {
    zh: "合格 (Passed)",
    en: "Passed",
  },
  failedVerdict: {
    zh: "未合格 (Failed)",
    en: "Failed",
  },
  attemptTimeLabel: {
    zh: "測驗時間：",
    en: "Attempt Time: ",
  },
  feedbackLabel: {
    zh: "回饋建議：",
    en: "Feedback: ",
  },
  answersDetailLabel: {
    zh: "作答明細檢驗：",
    en: "Answer Details: ",
  },
  selectedOptionLabel: {
    zh: "選答：",
    en: "Selected: ",
  },
  correctVerdict: {
    zh: "正解",
    en: "Correct",
  },
  incorrectVerdict: {
    zh: "錯誤",
    en: "Incorrect",
  },
  rosterTitle: {
    zh: "車行真實完訓名單 · Driver Training Roster",
    en: "Driver Training Roster",
  },
  searchPlaceholder: {
    zh: "搜尋姓名、編號或歷程 ID...",
    en: "Search name, ID, or attempt ID...",
  },
  searchBtn: {
    zh: "搜尋",
    en: "Search",
  },
  colDriver: {
    zh: "司機姓名 / 編號",
    en: "Driver Name / ID",
  },
  colCourse: {
    zh: "課程代碼",
    en: "Course Code",
  },
  colStatus: {
    zh: "完訓狀態",
    en: "Status",
  },
  colScore: {
    zh: "成績",
    en: "Score",
  },
  colCompletedAt: {
    zh: "完訓時間",
    en: "Completed At",
  },
  colTag: {
    zh: "狀態標記",
    en: "Tag",
  },
  colHistory: {
    zh: "作答歷程",
    en: "Quiz History",
  },
  overdueRetrain: {
    zh: "逾期重訓",
    en: "Overdue Retrain",
  },
  statusNormal: {
    zh: "正常",
    en: "Normal",
  },
  viewHistory: {
    zh: "檢視歷程 ↗",
    en: "View History ↗",
  },
  notAttempted: {
    zh: "尚未測驗",
    en: "Not Attempted",
  },
  tabAll: {
    zh: "全部學員",
    en: "All Drivers",
  },
  tabCompleted: {
    zh: "已完訓",
    en: "Completed",
  },
  tabPending: {
    zh: "待完成",
    en: "Pending",
  },
  tabOverdue: {
    zh: "逾期名單",
    en: "Overdue",
  },
  noRosterData: {
    zh: "目前尚無司機完訓名單資料",
    en: "No training roster records available",
  },
  noRosterMatch: {
    zh: "無符合條件的司機完訓名單",
    en: "No matching training records found",
  },
};

export function trTraining(key: string, locale: Locale = "zh"): string {
  const entry = trainingTranslations[key];
  if (!entry) return key;
  return entry[locale] ?? entry.zh ?? key;
}

export function mapTrainingStatusLabel(status: TrainingStatus, locale: Locale = "zh"): string {
  switch (status) {
    case "passed":
      return locale === "en" ? "Passed" : "已完訓 (Passed)";
    case "in_progress":
      return locale === "en" ? "In Progress" : "學習中 (In Progress)";
    case "not_started":
      return locale === "en" ? "Not Started" : "未開始 (Not Started)";
    case "failed":
      return locale === "en" ? "Failed" : "未通過 (Failed)";
    case "expired":
      return locale === "en" ? "Expired" : "已逾期 (Expired)";
    default:
      return status;
  }
}
