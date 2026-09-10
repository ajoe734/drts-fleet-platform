import { describe, expect, it } from "vitest";
import type { QuizSubmissionCommand } from "@drts/contracts";
import {
  type AcademyCourseVersion,
  fleetTraining,
  gradeQuiz,
  publicCourse,
  trainingRecord,
} from "../../../../apps/api/src/modules/driver-academy/academy-domain";

const course: AcademyCourseVersion = {
  courseId: "safety",
  courseCode: "safety",
  title: "Safety",
  category: "safety",
  isRequired: true,
  validityDays: 30,
  passingScore: 80,
  version: 1,
  modulesCount: 1,
  description: "Safety SOP",
  modules: [
    {
      moduleId: "sop",
      type: "sop",
      title: "SOP",
      contentUrl: "https://example.org/sop",
      durationMinutes: 5,
    },
  ],
  questions: [1, 2, 3, 4, 5].map((n) => ({
    questionId: `q${n}`,
    prompt: `Question ${n}`,
    options: [
      { optionId: "yes", text: "Yes" },
      { optionId: "no", text: "No" },
    ],
  })),
  answerKey: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`q${n}`, "yes"])),
};
const answers = course.questions.map((q) => ({
  questionId: q.questionId,
  selectedOptionId: "yes",
}));
const evidence = {
  attemptId: "attempt-1",
  driverId: "driver-1",
  attemptedAt: "2026-09-01T00:00:00.000Z",
};
const now = new Date("2026-09-10T00:00:00Z");
const passed = () => gradeQuiz(course, { courseVersion: 1, answers }, evidence);

describe("SR-ACADEMY-BE-001 domain rules (no persistence or HTTP claim)", () => {
  it("grades actual answers at the configured threshold and preserves answer evidence", () => {
    const result = gradeQuiz(
      course,
      {
        courseVersion: 1,
        answers: answers.map((a, i) =>
          i === 0 ? { ...a, selectedOptionId: "no" } : a,
        ),
      },
      evidence,
    );
    expect(result).toMatchObject({
      score: 80,
      passed: true,
      courseVersion: 1,
      attemptId: "attempt-1",
    });
    expect(result.answersSummary[0].isCorrect).toBe(false);
    expect(
      gradeQuiz(
        { ...course, passingScore: 81 },
        { courseVersion: 1, answers: result.answersSummary },
        evidence,
      ).passed,
    ).toBe(false);
  });

  it.each([
    [],
    answers.slice(1),
    Array(5).fill(answers[0]),
    [...answers.slice(1), { questionId: "unknown", selectedOptionId: "yes" }],
    answers.map((a) => ({ ...a, selectedOptionId: "unknown" })),
    null,
    [null, ...answers.slice(1)],
  ])(
    "rejects incomplete, duplicated, unknown or malformed answers %#",
    (input) => {
      expect(() =>
        gradeQuiz(
          course,
          { courseVersion: 1, answers: input } as QuizSubmissionCommand,
          evidence,
        ),
      ).toThrow(
        expect.objectContaining({
          code: "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
        }),
      );
    },
  );

  it.each([0, 2, undefined])(
    "rejects noncurrent submitted version %s",
    (version) => {
      expect(() =>
        gradeQuiz(
          course,
          { courseVersion: version, answers } as QuizSubmissionCommand,
          evidence,
        ),
      ).toThrow(expect.objectContaining({ code: "COURSE_VERSION_STALE" }));
    },
  );

  it("does not leak answer keys or incidental private question properties", () => {
    const privateCourse = {
      ...course,
      questions: course.questions.map((q) => ({
        ...q,
        correctOptionId: "yes",
      })),
    };
    const result = publicCourse(privateCourse);
    expect(JSON.stringify(result)).not.toMatch(/answerKey|correctOptionId/);
    result.questions[0].options[0].text = "modified";
    expect(course.questions[0].options[0].text).toBe("Yes");
  });

  it("never passes an empty or malformed published quiz", () => {
    expect(() =>
      gradeQuiz(
        { ...course, questions: [] },
        { courseVersion: 1, answers: [] },
        evidence,
      ),
    ).toThrow();
    expect(() =>
      gradeQuiz(
        { ...course, answerKey: {} },
        { courseVersion: 1, answers },
        evidence,
      ),
    ).toThrow("Invalid published academy answer key");
  });

  it("reading alone cannot produce a score or completion", () => {
    expect(trainingRecord(course, "driver-1", [], now, true)).toMatchObject({
      status: "in_progress",
      highestScore: null,
      passed: false,
      attemptsCount: 0,
    });
  });

  it("expires exactly at the boundary and a new pass renews the validity period", () => {
    const expiredAt = new Date("2026-10-01T00:00:00Z");
    expect(
      trainingRecord(course, "driver-1", [passed()], expiredAt),
    ).toMatchObject({ status: "expired", isOverdue: true });
    const renewed = {
      ...passed(),
      attemptId: "attempt-2",
      attemptedAt: expiredAt.toISOString(),
    };
    expect(
      trainingRecord(course, "driver-1", [passed(), renewed], expiredAt),
    ).toMatchObject({
      status: "passed",
      attemptsCount: 2,
      expiresAt: "2026-10-31T00:00:00.000Z",
    });
  });

  it("retains history but requires passing the revised course", () => {
    expect(
      trainingRecord({ ...course, version: 2 }, "driver-1", [passed()], now),
    ).toMatchObject({
      status: "not_started",
      attemptsCount: 1,
      highestScore: null,
      completedAt: null,
    });
    expect(
      trainingRecord(course, "other-driver", [passed()], now).attemptsCount,
    ).toBe(0);
  });

  it("a failed retake cannot erase an unexpired pass or renew it", () => {
    const failure = {
      ...passed(),
      attemptId: "attempt-2",
      score: 20,
      passed: false,
      attemptedAt: now.toISOString(),
    };
    expect(
      trainingRecord(course, "driver-1", [passed(), failure], now),
    ).toMatchObject({
      status: "passed",
      highestScore: 100,
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("uses unique active drivers and all required courses for the dashboard denominator", () => {
    const second = { ...course, courseId: "service", courseCode: "service" };
    const attempts = [
      passed(),
      { ...passed(), courseId: second.courseId, attemptId: "attempt-2" },
    ];
    const result = fleetTraining(
      "fleet-1",
      ["driver-1", "driver-1", "driver-2"],
      [course, second],
      attempts,
      now,
    );
    expect(
      result.rows.map((row) => [row.completed, row.total, row.pct]),
    ).toEqual([
      [1, 2, 50],
      [1, 2, 50],
    ]);
    expect(result.summary).toEqual({
      completionPct: "50%",
      pendingHeadcount: "1",
      overdueIncomplete: 0,
    });
    expect(
      fleetTraining("fleet-1", ["driver-1"], [course, second], attempts, now)
        .summary.completionPct,
    ).toBe("100%");
    expect(
      fleetTraining("fleet-1", ["driver-1"], [course, second], [passed()], now)
        .summary.completionPct,
    ).toBe("0%");
  });

  it("counts overdue people once, ignores non-roster attempts, and handles an empty fleet", () => {
    const second = { ...course, courseId: "service", courseCode: "service" };
    const attempts = [passed(), { ...passed(), courseId: second.courseId }];
    expect(
      fleetTraining(
        "fleet-1",
        ["driver-1"],
        [course, second],
        attempts,
        new Date("2026-10-01"),
      ).summary.overdueIncomplete,
    ).toBe(1);
    expect(
      fleetTraining("fleet-1", [], [course], attempts, now).summary,
    ).toEqual({
      completionPct: "0%",
      pendingHeadcount: "0",
      overdueIncomplete: 0,
    });
  });
});
