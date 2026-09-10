import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AcademyCourseCategory,
  AcademyModuleType,
  DriverQuizAttemptDetail,
  QuizQuestionOption,
  TrainingStatus,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { AcademyCourseVersion } from "./academy-domain";

interface CourseRow {
  course_id: string;
  course_version: number;
  course_code: string;
  title: string;
  category: AcademyCourseCategory;
  is_required: boolean;
  validity_days: number | null;
  passing_score: string;
  description: string;
}

interface ModuleRow {
  module_id: string;
  title: string;
  module_type: AcademyModuleType;
  content_url: string;
  duration_minutes: number;
}

interface QuestionRow {
  question_id: string;
  prompt: string;
  options: QuizQuestionOption[];
  correct_option_id: string;
}

interface AttemptRow {
  attempt_id: string;
  course_id: string;
  course_version: number;
  driver_id: string;
  attempted_at: string | Date;
  score: string;
  passed: boolean;
  answers_summary: DriverQuizAttemptDetail["answersSummary"];
}

interface ActiveCohortRow {
  driver_id: string;
  full_name: string;
}

/**
 * Persists driver-academy course/quiz/attempt data and the two shared
 * regulatory projections (reg.driver_training_records,
 * reg.driver_reg_profiles) per
 * docs/04-uat/system-remediation-20260906/academy-identity-decision.md.
 */
@Injectable()
export class AcademyRepository {
  private readonly logger = new Logger(AcademyRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  private toCourseVersion(
    course: CourseRow,
    modules: ModuleRow[],
    questions: QuestionRow[],
  ): AcademyCourseVersion {
    const answerKey: Record<string, string> = {};
    for (const question of questions) {
      answerKey[question.question_id] = question.correct_option_id;
    }
    return {
      courseId: course.course_id,
      courseCode: course.course_code,
      title: course.title,
      category: course.category,
      isRequired: course.is_required,
      validityDays: course.validity_days,
      passingScore: Number(course.passing_score),
      version: course.course_version,
      modulesCount: modules.length,
      description: course.description,
      modules: modules.map((module) => ({
        moduleId: module.module_id,
        title: module.title,
        type: module.module_type,
        contentUrl: module.content_url,
        durationMinutes: module.duration_minutes,
      })),
      questions: questions.map((question) => ({
        questionId: question.question_id,
        prompt: question.prompt,
        options: question.options,
      })),
      answerKey,
    };
  }

  private async loadModulesAndQuestions(
    courseId: string,
    courseVersion: number,
  ) {
    const [modulesResult, questionsResult] = await Promise.all([
      this.databaseService!.query<ModuleRow>(
        `
          SELECT module_id, title, module_type, content_url, duration_minutes
          FROM reg.phase1_driver_academy_modules
          WHERE course_id = $1 AND course_version = $2
          ORDER BY sort_order ASC, module_id ASC
        `,
        [courseId, courseVersion],
      ),
      this.databaseService!.query<QuestionRow>(
        `
          SELECT question_id, prompt, options, correct_option_id
          FROM reg.phase1_driver_quiz_questions
          WHERE course_id = $1 AND course_version = $2
          ORDER BY sort_order ASC, question_id ASC
        `,
        [courseId, courseVersion],
      ),
    ]);
    return { modules: modulesResult.rows, questions: questionsResult.rows };
  }

  /** The current (highest-version) published snapshot of one course, or null if unknown. */
  async getCurrentCourse(
    courseId: string,
  ): Promise<AcademyCourseVersion | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const courseResult = await this.databaseService!.query<CourseRow>(
      `
        SELECT course_id, course_version, course_code, title, category,
               is_required, validity_days, passing_score, description
        FROM reg.phase1_driver_academy_courses
        WHERE course_id = $1
        ORDER BY course_version DESC
        LIMIT 1
      `,
      [courseId],
    );
    const course = courseResult.rows[0];
    if (!course) {
      return null;
    }
    const { modules, questions } = await this.loadModulesAndQuestions(
      course.course_id,
      course.course_version,
    );
    return this.toCourseVersion(course, modules, questions);
  }

  /** The current (highest-version) published snapshot of every known course. */
  async listCurrentCourses(): Promise<AcademyCourseVersion[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const latestResult = await this.databaseService!.query<CourseRow>(
      `
        SELECT c.course_id, c.course_version, c.course_code, c.title, c.category,
               c.is_required, c.validity_days, c.passing_score, c.description
        FROM reg.phase1_driver_academy_courses c
        INNER JOIN (
          SELECT course_id, MAX(course_version) AS course_version
          FROM reg.phase1_driver_academy_courses
          GROUP BY course_id
        ) latest
          ON latest.course_id = c.course_id
         AND latest.course_version = c.course_version
        ORDER BY c.course_code ASC
      `,
    );
    return Promise.all(
      latestResult.rows.map(async (course) => {
        const { modules, questions } = await this.loadModulesAndQuestions(
          course.course_id,
          course.course_version,
        );
        return this.toCourseVersion(course, modules, questions);
      }),
    );
  }

  private toAttemptDetail(row: AttemptRow): DriverQuizAttemptDetail {
    return {
      attemptId: row.attempt_id,
      courseId: row.course_id,
      courseVersion: row.course_version,
      driverId: row.driver_id,
      attemptedAt:
        row.attempted_at instanceof Date
          ? row.attempted_at.toISOString()
          : new Date(row.attempted_at).toISOString(),
      score: Number(row.score),
      passed: row.passed,
      answersSummary: row.answers_summary,
    };
  }

  async insertAttempt(attempt: DriverQuizAttemptDetail): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.databaseService!.query(
      `
        INSERT INTO reg.phase1_driver_quiz_attempts (
          attempt_id, course_id, course_version, driver_id,
          attempted_at, score, passed, answers_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (attempt_id) DO NOTHING
      `,
      [
        attempt.attemptId,
        attempt.courseId,
        attempt.courseVersion,
        attempt.driverId,
        attempt.attemptedAt,
        attempt.score,
        attempt.passed,
        JSON.stringify(attempt.answersSummary),
      ],
    );
  }

  async listAttempts(
    filter: { driverId?: string; courseId?: string } = {},
  ): Promise<DriverQuizAttemptDetail[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await this.databaseService!.query<AttemptRow>(
      `
        SELECT attempt_id, course_id, course_version, driver_id,
               attempted_at, score, passed, answers_summary
        FROM reg.phase1_driver_quiz_attempts
        WHERE ($1::varchar IS NULL OR driver_id = $1)
          AND ($2::varchar IS NULL OR course_id = $2)
        ORDER BY attempted_at DESC
      `,
      [filter.driverId ?? null, filter.courseId ?? null],
    );
    return result.rows.map((row) => this.toAttemptDetail(row));
  }

  async getAttempt(attemptId: string): Promise<DriverQuizAttemptDetail | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await this.databaseService!.query<AttemptRow>(
      `
        SELECT attempt_id, course_id, course_version, driver_id,
               attempted_at, score, passed, answers_summary
        FROM reg.phase1_driver_quiz_attempts
        WHERE attempt_id = $1
      `,
      [attemptId],
    );
    const row = result.rows[0];
    return row ? this.toAttemptDetail(row) : null;
  }

  /** Read-only existence check against the runtime driver identity table. */
  async driverExists(driverId: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }
    const result = await this.databaseService!.query(
      `SELECT 1 FROM reg.phase1_registry_drivers WHERE driver_id = $1 LIMIT 1`,
      [driverId],
    );
    return result.rows.length > 0;
  }

  /** One row per passed attempt, per academy-identity-decision.md §2.3. */
  async insertTrainingRecordEvidence(params: {
    driverId: string;
    courseName: string;
    courseType: string;
    completedAt: string;
    expiresAt: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.databaseService!.query(
      `
        INSERT INTO reg.driver_training_records (
          driver_id, course_name, course_type, completed_at, expires_at, result
        ) VALUES ($1, $2, $3, $4, $5, 'passed')
      `,
      [
        params.driverId,
        params.courseName,
        params.courseType,
        params.completedAt,
        params.expiresAt,
      ],
    );
  }

  /**
   * Upsert restricted to the training_status column, driven only by
   * required-course pass/expiry transitions (academy-identity-decision.md §2.3).
   * reg.driver_reg_profiles has no pre-existing row for any runtime driver, so
   * this must not assume one exists.
   */
  async upsertTrainingStatus(
    driverId: string,
    status: Extract<TrainingStatus, "passed" | "expired">,
    lastTrainingAt: string,
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.databaseService!.query(
      `
        INSERT INTO reg.driver_reg_profiles (
          driver_id, training_status, last_training_at, updated_at
        ) VALUES ($1, $2, $3, now())
        ON CONFLICT (driver_id) DO UPDATE SET
          training_status = EXCLUDED.training_status,
          last_training_at = EXCLUDED.last_training_at,
          updated_at = now()
      `,
      [driverId, status, lastTrainingAt],
    );
  }

  /**
   * Active fleet↔driver cohort resolver, per academy-identity-decision.md
   * §2.2.1: as-of instant, effective_from<=asOfInstant AND
   * (effective_until IS NULL OR effective_until>asOfInstant), inner join
   * requiring registry identity, DISTINCT driver_id. This is a dedicated read
   * port — it must NOT reuse FleetPartnerService.listPortalDrivers(), which
   * is an undeduplicated portal-display read with different semantics
   * (schema-allocation.json referenced_tables_access).
   */
  async listActiveFleetCohort(
    fleetPartnerId: string,
    asOfInstant: string,
  ): Promise<Array<{ driverId: string; fullName: string }>> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await this.databaseService!.query<ActiveCohortRow>(
      `
        SELECT DISTINCT d.driver_id, d.full_name
        FROM admin.phase1_driver_fleet_affiliations aff
        INNER JOIN reg.phase1_registry_drivers d
          ON d.driver_id = aff.driver_id
        WHERE aff.fleet_partner_id = $1
          AND aff.effective_from <= $2
          AND (aff.effective_until IS NULL OR aff.effective_until > $2)
      `,
      [fleetPartnerId, asOfInstant],
    );
    return result.rows.map((row) => ({
      driverId: row.driver_id,
      fullName: row.full_name,
    }));
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver academy persistence failed during ${context}: ${detail}`,
    );
  }
}
