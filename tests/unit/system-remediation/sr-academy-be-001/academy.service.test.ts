import { describe, expect, it } from "vitest";

import type { DriverQuizAttemptDetail } from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { AcademyCourseVersion } from "../../../../apps/api/src/modules/driver-academy/academy-domain";
import { AcademyRepository } from "../../../../apps/api/src/modules/driver-academy/academy.repository";
import { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";

const REQUIRED_COURSE: AcademyCourseVersion = {
  courseId: "crs_basics_001",
  courseCode: "platform_basics",
  title: "平台合作基礎",
  category: "compliance",
  isRequired: true,
  validityDays: 30,
  passingScore: 80,
  version: 1,
  modulesCount: 1,
  description: "desc",
  modules: [
    {
      moduleId: "mod1",
      title: "mod",
      type: "sop",
      contentUrl: "https://example.org/sop",
      durationMinutes: 5,
    },
  ],
  questions: [
    {
      questionId: "q1",
      prompt: "?",
      options: [
        { optionId: "opt_a", text: "A" },
        { optionId: "opt_b", text: "B" },
      ],
    },
  ],
  answerKey: { q1: "opt_a" },
};

/** In-memory stand-in for AcademyRepository's public contract; no DB/HTTP claim. */
class FakeAcademyRepository {
  courses: AcademyCourseVersion[] = [REQUIRED_COURSE];
  attempts: DriverQuizAttemptDetail[] = [];
  existingDriverIds = new Set(["drv_1"]);
  trainingRecordEvidence: Array<{
    driverId: string;
    expiresAt: string | null;
  }> = [];
  trainingStatusUpdates: Array<{ driverId: string; status: string }> = [];
  cohort = new Map<string, Array<{ driverId: string; fullName: string }>>();

  isEnabled() {
    return true;
  }

  async getCurrentCourse(courseId: string) {
    return this.courses.find((c) => c.courseId === courseId) ?? null;
  }

  async listCurrentCourses() {
    return this.courses;
  }

  async driverExists(driverId: string) {
    return this.existingDriverIds.has(driverId);
  }

  async insertAttempt(attempt: DriverQuizAttemptDetail) {
    this.attempts.push(attempt);
  }

  async listAttempts(filter: { driverId?: string; courseId?: string } = {}) {
    return this.attempts.filter(
      (a) =>
        (!filter.driverId || a.driverId === filter.driverId) &&
        (!filter.courseId || a.courseId === filter.courseId),
    );
  }

  async getAttempt(attemptId: string) {
    return this.attempts.find((a) => a.attemptId === attemptId) ?? null;
  }

  async insertTrainingRecordEvidence(params: {
    driverId: string;
    expiresAt: string | null;
  }) {
    this.trainingRecordEvidence.push(params);
  }

  async upsertTrainingStatus(driverId: string, status: string) {
    this.trainingStatusUpdates.push({ driverId, status });
  }

  async listActiveFleetCohort(fleetPartnerId: string) {
    return this.cohort.get(fleetPartnerId) ?? [];
  }
}

function buildService(repo = new FakeAcademyRepository()) {
  const service = new AcademyService(repo as unknown as AcademyRepository);
  return { service, repo };
}

describe("SR-ACADEMY-BE-001 AcademyService (fake repository, no live DB claim)", () => {
  it("rejects grading for an unknown driver identity rather than inventing one", async () => {
    const { service } = buildService();
    await expect(
      service.submitQuiz("crs_basics_001", "drv_unknown", {
        courseVersion: 1,
        answers: [{ questionId: "q1", selectedOptionId: "opt_a" }],
      }),
    ).rejects.toMatchObject({ code: "DRIVER_NOT_FOUND" });
  });

  it("rejects an unknown course before touching any driver state", async () => {
    const { service } = buildService();
    await expect(
      service.submitQuiz("crs_missing", "drv_1", {
        courseVersion: 1,
        answers: [],
      }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
  });

  it("persists a real attempt, regulatory evidence, and upgrades training_status to passed", async () => {
    const { service, repo } = buildService();
    const result = await service.submitQuiz("crs_basics_001", "drv_1", {
      courseVersion: 1,
      answers: [{ questionId: "q1", selectedOptionId: "opt_a" }],
    });
    expect(result.passed).toBe(true);
    expect(repo.attempts).toHaveLength(1);
    expect(repo.trainingRecordEvidence).toHaveLength(1);
    expect(repo.trainingRecordEvidence[0].expiresAt).not.toBeNull();
    expect(repo.trainingStatusUpdates.at(-1)).toMatchObject({
      driverId: "drv_1",
      status: "passed",
    });
  });

  it("does not write regulatory evidence or upgrade status on a failed attempt", async () => {
    const { service, repo } = buildService();
    await service.submitQuiz("crs_basics_001", "drv_1", {
      courseVersion: 1,
      answers: [{ questionId: "q1", selectedOptionId: "opt_b" }],
    });
    expect(repo.trainingRecordEvidence).toHaveLength(0);
    expect(repo.trainingStatusUpdates).toHaveLength(0);
  });

  it("downgrades training_status to expired once a required course lapses, on the next touch", async () => {
    const { service, repo } = buildService();
    const attemptedAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
    repo.attempts.push({
      attemptId: "att_old",
      courseId: "crs_basics_001",
      courseVersion: 1,
      driverId: "drv_1",
      attemptedAt,
      score: 100,
      passed: true,
      answersSummary: [
        { questionId: "q1", selectedOptionId: "opt_a", isCorrect: true },
      ],
    });
    const records = await service.listRecords("drv_1");
    expect(records[0]).toMatchObject({ status: "expired", isOverdue: true });
    expect(repo.trainingStatusUpdates.at(-1)).toMatchObject({
      driverId: "drv_1",
      status: "expired",
    });
  });

  it("computes userStatus per driver and omits it for anonymous listing", async () => {
    const { service, repo } = buildService();
    repo.attempts.push({
      attemptId: "att_1",
      courseId: "crs_basics_001",
      courseVersion: 1,
      driverId: "drv_1",
      attemptedAt: new Date().toISOString(),
      score: 100,
      passed: true,
      answersSummary: [
        { questionId: "q1", selectedOptionId: "opt_a", isCorrect: true },
      ],
    });
    const forDriver = await service.listCourses("drv_1");
    expect(forDriver[0].userStatus).toBe("passed");
    const anonymous = await service.listCourses(null);
    expect(anonymous[0].userStatus).toBeUndefined();
  });

  it("blocks a drill-down for a driver outside the fleet's active cohort", async () => {
    const { service, repo } = buildService();
    repo.cohort.set("fleet-a", [{ driverId: "drv_1", fullName: "A" }]);
    repo.attempts.push({
      attemptId: "att_1",
      courseId: "crs_basics_001",
      courseVersion: 1,
      driverId: "drv_other",
      attemptedAt: new Date().toISOString(),
      score: 100,
      passed: true,
      answersSummary: [],
    });
    await expect(
      service.fleetAttemptDrilldown("fleet-a", "drv_other", "att_1"),
    ).rejects.toMatchObject({ code: "ACADEMY_FORBIDDEN_FLEET_ACCESS" });
  });

  it("allows a drill-down for a driver inside the fleet's active cohort", async () => {
    const { service, repo } = buildService();
    repo.cohort.set("fleet-a", [{ driverId: "drv_1", fullName: "A" }]);
    repo.attempts.push({
      attemptId: "att_1",
      courseId: "crs_basics_001",
      courseVersion: 1,
      driverId: "drv_1",
      attemptedAt: new Date().toISOString(),
      score: 100,
      passed: true,
      answersSummary: [],
    });
    const attempt = await service.fleetAttemptDrilldown(
      "fleet-a",
      "drv_1",
      "att_1",
    );
    expect(attempt.attemptId).toBe("att_1");
  });

  it("scopes the fleet cohort denominator to the requested fleetPartnerId only", async () => {
    const { service, repo } = buildService();
    repo.cohort.set("fleet-a", [{ driverId: "drv_1", fullName: "A" }]);
    repo.cohort.set("fleet-b", [
      { driverId: "drv_2", fullName: "B" },
      { driverId: "drv_3", fullName: "C" },
    ]);
    const summaryA = await service.fleetTrainingSummary("fleet-a");
    const summaryB = await service.fleetTrainingSummary("fleet-b");
    expect(summaryA.rows[0].total).toBe(1);
    expect(summaryB.rows[0].total).toBe(2);
  });

  it("throws ApiRequestError instances with stable HTTP-mappable codes", async () => {
    const { service } = buildService();
    try {
      await service.getAttempt("att_missing");
      throw new Error("expected getAttempt to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe("ATTEMPT_NOT_FOUND");
    }
  });
});
