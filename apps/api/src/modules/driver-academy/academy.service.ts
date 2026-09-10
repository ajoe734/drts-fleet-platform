import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type {
  AcademyCourseDetail,
  AcademyCourseSummary,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  FleetDriverRosterItem,
  FleetTrainingView,
  QuizSubmissionCommand,
  TrainingStatus,
} from "@drts/contracts";
import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  fleetTraining,
  gradeQuiz,
  publicCourse,
  trainingRecord,
} from "./academy-domain";
import { AcademyRepository } from "./academy.repository";

function courseNotFound(courseId: string): ApiRequestError {
  return new ApiRequestError(
    404,
    SYSTEM_REMEDIATION_ERROR_CODES.COURSE_NOT_FOUND,
    "Course not found.",
    { courseId },
  );
}

function attemptNotFound(attemptId: string): ApiRequestError {
  return new ApiRequestError(
    404,
    SYSTEM_REMEDIATION_ERROR_CODES.ATTEMPT_NOT_FOUND,
    "Attempt not found.",
    { attemptId },
  );
}

@Injectable()
export class AcademyService {
  constructor(private readonly repository: AcademyRepository) {}

  async listCourses(driverId: string | null): Promise<AcademyCourseSummary[]> {
    const courses = await this.repository.listCurrentCourses();
    const attempts = driverId
      ? await this.repository.listAttempts({ driverId })
      : [];
    const now = new Date();
    return courses.map((course) => {
      const detail = publicCourse(course);
      const userStatus: TrainingStatus | undefined = driverId
        ? trainingRecord(detail, driverId, attempts, now).status
        : undefined;
      const summary: AcademyCourseSummary = {
        courseId: detail.courseId,
        courseCode: detail.courseCode,
        title: detail.title,
        category: detail.category,
        isRequired: detail.isRequired,
        validityDays: detail.validityDays,
        passingScore: detail.passingScore,
        version: detail.version,
        modulesCount: detail.modulesCount,
      };
      return userStatus ? { ...summary, userStatus } : summary;
    });
  }

  async getCourseDetail(courseId: string): Promise<AcademyCourseDetail> {
    const course = await this.repository.getCurrentCourse(courseId);
    if (!course) {
      throw courseNotFound(courseId);
    }
    return publicCourse(course);
  }

  async submitQuiz(
    courseId: string,
    driverId: string,
    command: QuizSubmissionCommand,
  ): Promise<DriverQuizAttemptDetail> {
    const course = await this.repository.getCurrentCourse(courseId);
    if (!course) {
      throw courseNotFound(courseId);
    }
    const driverExists = await this.repository.driverExists(driverId);
    if (!driverExists) {
      throw new ApiRequestError(404, "DRIVER_NOT_FOUND", "Driver not found.", {
        driverId,
      });
    }

    const attemptedAt = new Date().toISOString();
    const attempt = gradeQuiz(course, command, {
      attemptId: `att_${randomUUID()}`,
      driverId,
      attemptedAt,
    });

    await this.repository.insertAttempt(attempt);

    if (attempt.passed) {
      const expiresAt =
        course.validityDays !== null
          ? new Date(
              Date.parse(attemptedAt) + course.validityDays * 86_400_000,
            ).toISOString()
          : null;
      await this.repository.insertTrainingRecordEvidence({
        driverId,
        courseName: course.title,
        courseType: course.category,
        completedAt: attemptedAt,
        expiresAt,
      });
    }

    await this.recomputeRegulatoryProjection(driverId);

    return {
      ...attempt,
      feedback: attempt.passed
        ? attempt.score === 100
          ? "恭喜！您已全數答對並通過測驗。"
          : "恭喜！您已通過測驗。"
        : "未達及格分數，請重新研讀教材後再次作答。",
    };
  }

  /**
   * Lazily re-derives reg.driver_reg_profiles.training_status from the
   * driver's current required-course completion state (feature-contracts.md
   * §3.3 invariant 4): 'passed' once every required course is passed and
   * unexpired, 'expired' once any required course has lapsed. Recomputed on
   * every quiz submission and on every records read; there is no separate
   * time-driven background sweep (see SR-ACADEMY-BE-001.md evidence — a
   * proactive, traffic-independent expiry sweep is out of scope here and
   * remains a documented limitation).
   */
  private async recomputeRegulatoryProjection(driverId: string) {
    const courses = await this.repository.listCurrentCourses();
    const required = courses.filter((course) => course.isRequired);
    if (!required.length) {
      return;
    }
    const attempts = await this.repository.listAttempts({ driverId });
    const now = new Date();
    const records = required.map((course) =>
      trainingRecord(publicCourse(course), driverId, attempts, now),
    );

    if (records.every((record) => record.passed)) {
      const lastTrainingAt = records.reduce<string>(
        (latest, record) =>
          record.completedAt && record.completedAt > latest
            ? record.completedAt
            : latest,
        records[0]?.completedAt ?? now.toISOString(),
      );
      await this.repository.upsertTrainingStatus(
        driverId,
        "passed",
        lastTrainingAt,
      );
      return;
    }

    if (records.some((record) => record.isOverdue)) {
      await this.repository.upsertTrainingStatus(
        driverId,
        "expired",
        now.toISOString(),
      );
    }
  }

  async listRecords(driverId: string): Promise<DriverTrainingRecord[]> {
    const courses = await this.repository.listCurrentCourses();
    const attempts = await this.repository.listAttempts({ driverId });
    const now = new Date();
    await this.recomputeRegulatoryProjection(driverId);
    return courses.map((course) =>
      trainingRecord(publicCourse(course), driverId, attempts, now),
    );
  }

  async getAttempt(attemptId: string): Promise<DriverQuizAttemptDetail> {
    const attempt = await this.repository.getAttempt(attemptId);
    if (!attempt) {
      throw attemptNotFound(attemptId);
    }
    return attempt;
  }

  async fleetTrainingSummary(
    fleetPartnerId: string,
  ): Promise<FleetTrainingView> {
    const asOf = new Date();
    const [cohort, courses, attempts] = await Promise.all([
      this.repository.listActiveFleetCohort(fleetPartnerId, asOf.toISOString()),
      this.repository.listCurrentCourses(),
      this.repository.listAttempts(),
    ]);
    return fleetTraining(
      fleetPartnerId,
      cohort.map((driver) => driver.driverId),
      courses.map((course) => publicCourse(course)),
      attempts,
      asOf,
    );
  }

  async fleetRoster(fleetPartnerId: string): Promise<FleetDriverRosterItem[]> {
    const asOf = new Date();
    const [cohort, courses, attempts] = await Promise.all([
      this.repository.listActiveFleetCohort(fleetPartnerId, asOf.toISOString()),
      this.repository.listCurrentCourses(),
      this.repository.listAttempts(),
    ]);
    const required = courses.filter((course) => course.isRequired);

    const roster: FleetDriverRosterItem[] = [];
    for (const driver of cohort) {
      for (const course of required) {
        const record = trainingRecord(
          publicCourse(course),
          driver.driverId,
          attempts,
          asOf,
        );
        const latestAttempt = attempts
          .filter(
            (attempt) =>
              attempt.driverId === driver.driverId &&
              attempt.courseId === course.courseId,
          )
          .sort(
            (a, b) => Date.parse(b.attemptedAt) - Date.parse(a.attemptedAt),
          )[0];
        roster.push({
          driverId: driver.driverId,
          driverName: driver.fullName,
          courseCode: course.courseCode,
          status: record.status,
          score: record.highestScore,
          completedAt: record.completedAt,
          isOverdue: record.isOverdue,
          latestAttemptId: latestAttempt?.attemptId ?? null,
        });
      }
    }
    return roster;
  }

  async fleetAttemptDrilldown(
    fleetPartnerId: string,
    driverId: string,
    attemptId: string,
  ): Promise<DriverQuizAttemptDetail> {
    const asOf = new Date().toISOString();
    const cohort = await this.repository.listActiveFleetCohort(
      fleetPartnerId,
      asOf,
    );
    if (!cohort.some((driver) => driver.driverId === driverId)) {
      throw new ApiRequestError(
        403,
        SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
        "Driver is not part of this fleet's active cohort.",
        { fleetPartnerId, driverId },
      );
    }
    const attempt = await this.repository.getAttempt(attemptId);
    if (!attempt || attempt.driverId !== driverId) {
      throw attemptNotFound(attemptId);
    }
    return attempt;
  }
}
