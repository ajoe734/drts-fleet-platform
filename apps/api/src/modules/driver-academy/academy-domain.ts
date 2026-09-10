import type {
  AcademyCourseDetail,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  FleetTrainingView,
  QuizSubmissionCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

/** Internal, immutable published version. Never serialize the answer key to a learner. */
export interface AcademyCourseVersion extends AcademyCourseDetail {
  answerKey: Readonly<Record<string, string>>;
}

export function publicCourse(course: AcademyCourseVersion): AcademyCourseDetail {
  return {
    courseId: course.courseId,
    courseCode: course.courseCode,
    title: course.title,
    category: course.category,
    isRequired: course.isRequired,
    validityDays: course.validityDays,
    passingScore: course.passingScore,
    version: course.version,
    modulesCount: course.modules.length,
    description: course.description,
    modules: course.modules.map((module) => ({
      moduleId: module.moduleId,
      title: module.title,
      type: module.type,
      contentUrl: module.contentUrl,
      durationMinutes: module.durationMinutes,
    })),
    questions: course.questions.map((question) => ({
      questionId: question.questionId,
      prompt: question.prompt,
      options: question.options.map((option) => ({
        optionId: option.optionId,
        text: option.text,
      })),
    })),
  };
}

/** Pure grading only; the caller must atomically persist the result and version snapshot. */
export function gradeQuiz(
  course: AcademyCourseVersion,
  submission: QuizSubmissionCommand,
  evidence: { attemptId: string; driverId: string; attemptedAt: string },
): DriverQuizAttemptDetail {
  if (!submission || submission.courseVersion !== course.version) {
    throw new ApiRequestError(409, "COURSE_VERSION_STALE", "Reload the current course version.");
  }
  const invalid = () => new ApiRequestError(
    400,
    "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
    "Submit each question exactly once with a valid option.",
  );
  const answers = submission.answers;
  if (!Array.isArray(answers) || !course.questions.length || answers.length !== course.questions.length) {
    throw invalid();
  }
  const byQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string" || typeof answer.selectedOptionId !== "string" || byQuestion.has(answer.questionId)) {
      throw invalid();
    }
    byQuestion.set(answer.questionId, answer.selectedOptionId);
  }
  // Reject malformed published data rather than awarding an empty or ambiguous test a pass.
  if (new Set(course.questions.map((q) => q.questionId)).size !== course.questions.length ||
      !Number.isFinite(course.passingScore) || course.passingScore < 0 || course.passingScore > 100) {
    throw new Error("Invalid published academy quiz");
  }
  const answersSummary = course.questions.map((question) => {
    const selectedOptionId = byQuestion.get(question.questionId);
    if (!selectedOptionId || !question.options.some((option) => option.optionId === selectedOptionId)) {
      throw invalid();
    }
    const correct = course.answerKey[question.questionId];
    if (!correct || !question.options.some((option) => option.optionId === correct) ||
        new Set(question.options.map((option) => option.optionId)).size !== question.options.length) {
      throw new Error("Invalid published academy answer key");
    }
    return { questionId: question.questionId, selectedOptionId, isCorrect: selectedOptionId === correct };
  });
  const score = answersSummary.filter((answer) => answer.isCorrect).length * 100 / answersSummary.length;
  return {
    ...evidence,
    courseId: course.courseId,
    courseVersion: course.version,
    score,
    passed: score >= course.passingScore,
    answersSummary,
  };
}

/** Only the current version can satisfy training; old attempts remain available as evidence. */
export function trainingRecord(
  course: AcademyCourseDetail,
  driverId: string,
  attempts: readonly DriverQuizAttemptDetail[],
  now: Date,
  started = false,
): DriverTrainingRecord {
  const history = attempts.filter((attempt) => attempt.driverId === driverId && attempt.courseId === course.courseId)
    .sort((a, b) => Date.parse(b.attemptedAt) - Date.parse(a.attemptedAt) || b.attemptId.localeCompare(a.attemptId));
  const current = history.filter((attempt) => attempt.courseVersion === course.version);
  const pass = current.find((attempt) => attempt.passed);
  const expiresAt = pass && course.validityDays !== null
    ? new Date(Date.parse(pass.attemptedAt) + course.validityDays * 86_400_000).toISOString()
    : null;
  const expired = !!expiresAt && Date.parse(expiresAt) <= now.getTime();
  const status = pass ? (expired ? "expired" : "passed")
    : current.length ? "failed" : started ? "in_progress" : "not_started";
  return {
    recordId: `${driverId}:${course.courseId}:v${course.version}`,
    driverId,
    courseId: course.courseId,
    courseCode: course.courseCode,
    courseTitle: course.title,
    status,
    highestScore: current.length ? Math.max(...current.map((attempt) => attempt.score)) : null,
    passed: status === "passed",
    attemptsCount: history.length,
    completedAt: pass?.attemptedAt ?? null,
    expiresAt,
    isOverdue: expired,
    lastAttemptAt: history[0]?.attemptedAt ?? null,
  };
}

/** Caller supplies the authoritative, authorized active roster and current published versions. */
export function fleetTraining(
  fleetPartnerId: string,
  activeDriverIds: readonly string[],
  courses: readonly AcademyCourseDetail[],
  attempts: readonly DriverQuizAttemptDetail[],
  now: Date,
): FleetTrainingView {
  const drivers = [...new Set(activeDriverIds)];
  const required = courses.filter((course) => course.isRequired);
  const records = new Map(drivers.map((driverId) => [driverId,
    required.map((course) => trainingRecord(course, driverId, attempts, now)),
  ]));
  const total = drivers.length;
  const pct = (completed: number) => total ? Math.round(completed * 100 / total) : 0;
  const completed = [...records.values()].filter((items) => items.every((item) => item.passed)).length;
  return {
    fleetPartnerId,
    rows: required.map((course) => {
      const count = [...records.values()].filter((items) => items.some((item) => item.courseId === course.courseId && item.passed)).length;
      return { course: course.title, en: course.courseCode, completed: count, total, pct: pct(count) };
    }),
    summary: {
      completionPct: `${pct(completed)}%`,
      pendingHeadcount: String(total - completed),
      overdueIncomplete: [...records.values()].filter((items) => items.some((item) => item.isOverdue)).length,
    },
    source: "authoritative",
  };
}
