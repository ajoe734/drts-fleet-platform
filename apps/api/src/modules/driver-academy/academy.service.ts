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

export interface DriverTrainingQualification {
  driverId: string;
  asOf: string;
  records: DriverTrainingRecord[];
  requiredCount: number;
  trainingSatisfied: boolean;
  trainingIncomplete: boolean;
  regulatoryStatus: "passed" | "expired" | "pending" | "waived";
}

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

  /**
   * Authoritative single public qualification and regulatory projection operation
   * per consensus B2 and academy-identity-decision.md §2.3.
   * Derives required course satisfaction and projects passed/expired/pending,
   * preserving any manually-waived profile status without modification.
   */
  async evaluateDriverQualification(
    driverId: string,
    asOfDate: Date = new Date(),
  ): Promise<DriverTrainingQualification> {
    const asOfIso = asOfDate.toISOString();

    const computeFromData = (
      courses: Awaited<ReturnType<AcademyRepository["listCurrentCourses"]>>,
      attempts: DriverQuizAttemptDetail[],
      existingStatus: string | null,
    ) => {
      const records = courses.map((course) =>
        trainingRecord(publicCourse(course), driverId, attempts, asOfDate),
      );
      const required = courses.filter((course) => course.isRequired);
      const requiredRecords = required.map((course) =>
        trainingRecord(publicCourse(course), driverId, attempts, asOfDate),
      );
      const requiredCount = required.length;

      let trainingSatisfied = false;
      let trainingIncomplete = false;
      let derivedStatus: "passed" | "expired" | "pending" = "pending";

      if (requiredCount === 0) {
        // 空必修清單不產生完訓證明
        trainingSatisfied = false;
        trainingIncomplete = false;
        derivedStatus = "pending";
      } else {
        const allPassed = requiredRecords.every((record) => record.passed);
        const anyOverdue = requiredRecords.some((record) => record.isOverdue);

        if (allPassed) {
          trainingSatisfied = true;
          trainingIncomplete = false;
          derivedStatus = "passed";
        } else if (anyOverdue) {
          trainingSatisfied = false;
          trainingIncomplete = true;
          derivedStatus = "expired";
        } else {
          trainingSatisfied = false;
          trainingIncomplete = true;
          derivedStatus = "pending";
        }
      }

      const isWaived = existingStatus === "waived";
      const finalRegulatoryStatus: "passed" | "expired" | "pending" | "waived" =
        isWaived ? "waived" : derivedStatus;

      if (isWaived) {
        trainingSatisfied = true;
        trainingIncomplete = false;
      }

      const lastTrainingAt =
        derivedStatus === "passed"
          ? requiredRecords.reduce<string>(
              (latest, record) =>
                record.completedAt && record.completedAt > latest
                  ? record.completedAt
                  : latest,
              requiredRecords[0]?.completedAt ?? asOfIso,
            )
          : null;

      return {
        records,
        requiredCount,
        trainingSatisfied,
        trainingIncomplete,
        derivedStatus,
        finalRegulatoryStatus,
        lastTrainingAt,
        isWaived,
      };
    };

    if (this.repository.isEnabled()) {
      return this.repository.executeSerializableTransaction(async (client) => {
        const [existingStatus, courses, attempts] = await Promise.all([
          this.repository.getDriverTrainingProfileStatus(driverId, client),
          this.repository.listCurrentCourses(client),
          this.repository.listAttempts({ driverId }, client),
        ]);

        const computed = computeFromData(courses, attempts, existingStatus);

        if (!computed.isWaived) {
          await this.repository.upsertTrainingStatus(
            driverId,
            computed.derivedStatus,
            computed.lastTrainingAt,
            client,
          );
        }

        return {
          driverId,
          asOf: asOfIso,
          records: computed.records,
          requiredCount: computed.requiredCount,
          trainingSatisfied: computed.trainingSatisfied,
          trainingIncomplete: computed.trainingIncomplete,
          regulatoryStatus: computed.finalRegulatoryStatus,
        };
      });
    }

    // In-memory mode (DB disabled / direct unit test)
    const [courses, attempts] = await Promise.all([
      this.repository.listCurrentCourses(),
      this.repository.listAttempts({ driverId }),
    ]);
    const existingStatus =
      (await this.repository.getDriverTrainingProfileStatus?.(driverId)) ??
      null;

    const computed = computeFromData(courses, attempts, existingStatus);

    if (!computed.isWaived) {
      await this.repository.upsertTrainingStatus(
        driverId,
        computed.derivedStatus,
        computed.lastTrainingAt,
      );
    }

    return {
      driverId,
      asOf: asOfIso,
      records: computed.records,
      requiredCount: computed.requiredCount,
      trainingSatisfied: computed.trainingSatisfied,
      trainingIncomplete: computed.trainingIncomplete,
      regulatoryStatus: computed.finalRegulatoryStatus,
    };
  }

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

    await this.evaluateDriverQualification(driverId, new Date(attemptedAt));

    return {
      ...attempt,
      feedback: attempt.passed
        ? attempt.score === 100
          ? "恭喜！您已全數答對並通過測驗。"
          : "恭喜！您已通過測驗。"
        : "未達及格分數，請重新研讀教材後再次作答。",
    };
  }

  private async recomputeRegulatoryProjection(driverId: string) {
    await this.evaluateDriverQualification(driverId);
  }

  async listRecords(driverId: string): Promise<DriverTrainingRecord[]> {
    const qualification = await this.evaluateDriverQualification(driverId);
    return qualification.records;
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
