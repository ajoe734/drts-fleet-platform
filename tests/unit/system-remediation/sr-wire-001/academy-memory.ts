import type { DriverQuizAttemptDetail } from "@drts/contracts";
import type { AcademyCourseVersion } from "../../../../apps/api/src/modules/driver-academy/academy-domain";

export const REQUIRED_COURSE: AcademyCourseVersion = {
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
export class FakeAcademyRepository {
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
