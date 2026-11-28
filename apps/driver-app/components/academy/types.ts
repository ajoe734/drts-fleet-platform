import type {
  AcademyCourseCategory,
  AcademyCourseDetail,
  AcademyCourseSummary,
  AcademyModule,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  QuizQuestionOption,
  QuizQuestionPublic,
  QuizResultRecord,
  QuizSubmissionAnswer,
  QuizSubmissionCommand,
  TrainingStatus,
} from "@drts/contracts";

export type {
  AcademyCourseCategory,
  AcademyCourseDetail,
  AcademyCourseSummary,
  AcademyModule,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  QuizQuestionOption,
  QuizQuestionPublic,
  QuizResultRecord,
  QuizSubmissionAnswer,
  QuizSubmissionCommand,
  TrainingStatus,
};

export function formatCategoryLabel(category: AcademyCourseCategory): string {
  switch (category) {
    case "compliance":
      return "法規法遵";
    case "safety":
      return "安全防禦";
    case "service_quality":
      return "服務品質";
    case "operations":
      return "營運作業";
    default:
      return category;
  }
}

export function formatTrainingStatusLabel(status: TrainingStatus): string {
  switch (status) {
    case "passed":
      return "已完訓";
    case "in_progress":
      return "學習中";
    case "not_started":
      return "未開始";
    case "failed":
      return "未通過";
    case "expired":
      return "已過期需重訓";
    default:
      return status;
  }
}

// Completion is recorded only by passing the course quiz (the API rejects a
// submission for a course without questions), so a course with no questions
// cannot be completed in the app.
export const ACADEMY_NO_QUIZ_HINT =
  "這門課目前沒有測驗，無法在 App 內完訓，請聯絡車行。";
