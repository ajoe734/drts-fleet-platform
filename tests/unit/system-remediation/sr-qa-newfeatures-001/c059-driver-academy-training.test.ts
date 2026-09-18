import { describe, it, expect, beforeEach } from "vitest";
import {
  publicCourse,
  gradeQuiz,
  trainingRecord,
  type AcademyCourseVersion,
} from "../../../../apps/api/src/modules/driver-academy/academy-domain";
import { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";
import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";
import type { DriverQuizAttemptDetail } from "@drts/contracts";

class TestAcademyRepository {
  courses: AcademyCourseVersion[] = [];
  attempts: DriverQuizAttemptDetail[] = [];
  existingDriverIds = new Set<string>();
  trainingRecordEvidence: Array<{
    driverId: string;
    courseName?: string;
    courseType?: string;
    completedAt?: string;
    expiresAt: string | null;
  }> = [];
  trainingStatusUpdates: Array<{ driverId: string; status: string }> = [];
  profileStatuses = new Map<string, string>();
  cohort = new Map<string, Array<{ driverId: string; fullName: string }>>();

  isEnabled() {
    return false; // in-memory mode
  }

  async executeSerializableTransaction<T>(
    operation: (client: unknown) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }

  async getDriverTrainingProfileStatus(
    driverId: string,
  ): Promise<string | null> {
    return this.profileStatuses.get(driverId) ?? null;
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
    courseName?: string;
    courseType?: string;
    completedAt?: string;
    expiresAt: string | null;
  }) {
    this.trainingRecordEvidence.push(params);
  }

  async upsertTrainingStatus(
    driverId: string,
    status: string,
    _lastTrainingAt?: string | null,
  ) {
    void _lastTrainingAt;
    this.trainingStatusUpdates.push({ driverId, status });
    this.profileStatuses.set(driverId, status);
  }

  async listActiveFleetCohort(fleetPartnerId: string) {
    return this.cohort.get(fleetPartnerId) ?? [];
  }
}

describe("SR-QA-NEWFEATURES-001 / C059: 司機學院教學、測驗作答、成績完訓、到期重訓與服務資格連動驗收", () => {
  let repository: TestAcademyRepository;
  let service: AcademyService;

  const DRIVER_1 = "drv_academy_qa_001";
  const DRIVER_WAIVED = "drv_academy_waived_002";

  const SAMPLE_REQUIRED_COURSE: AcademyCourseVersion = {
    courseId: "crs_qa_safety_001",
    courseCode: "safety_guidelines_2026",
    title: "DRTS 平台行車安全與應急處理",
    category: "compliance",
    isRequired: true,
    validityDays: 30, // 30 天有效期限
    passingScore: 80,
    version: 1,
    modulesCount: 2,
    description: "司機合規安全上線指南",
    modules: [
      {
        moduleId: "mod_vid_001",
        title: "緊急事故防禦駕駛影片",
        type: "video",
        contentUrl: "https://media.drts.example/videos/safety-01.mp4",
        durationMinutes: 15,
      },
      {
        moduleId: "mod_sop_002",
        title: "乘客衝突與申訴 SOP",
        type: "sop",
        contentUrl: "https://docs.drts.example/sop/conflict-resolution.pdf",
        durationMinutes: 10,
      },
    ],
    questions: [
      {
        questionId: "q1",
        prompt: "行車遇後方救護車閃燈鳴笛時，應如何處置？",
        options: [
          { optionId: "opt_1a", text: "加速通過路口" },
          { optionId: "opt_1b", text: "減速向兩側避讓，確認安全後前進" },
          { optionId: "opt_1c", text: "維持原車速不予理會" },
        ],
      },
      {
        questionId: "q2",
        prompt: "行程中遇乘客嚴重醉酒騷擾時，應啟動何種機制？",
        options: [
          {
            optionId: "opt_2a",
            text: "立即於安全處停車並觸發 App 內 SOS／客服回報",
          },
          { optionId: "opt_2b", text: "與乘客發生言語爭執" },
        ],
      },
    ],
    answerKey: {
      q1: "opt_1b",
      q2: "opt_2a",
    },
  };

  beforeEach(() => {
    repository = new TestAcademyRepository();
    repository.courses = [SAMPLE_REQUIRED_COURSE];
    repository.existingDriverIds.add(DRIVER_1);
    repository.existingDriverIds.add(DRIVER_WAIVED);
    service = new AcademyService(repository as any);
  });

  describe("1. 課程目錄、測驗作答與評分生命週期 (Normal Flows)", () => {
    it("1.1 司機查詢課程清單與詳情，包含影片與 SOP 模組，嚴格排除答案金鑰 answerKey", async () => {
      const courses = await service.listCourses(DRIVER_1);
      expect(courses.length).toBe(1);
      expect(courses[0]!.courseId).toBe("crs_qa_safety_001");
      expect(courses[0]!.isRequired).toBe(true);
      expect((courses[0] as any).answerKey).toBeUndefined();

      const detail = await service.getCourseDetail("crs_qa_safety_001");
      expect(detail.title).toBe("DRTS 平台行車安全與應急處理");
      expect(detail.modules.length).toBe(2);
      expect(detail.questions.length).toBe(2);
      expect((detail as any).answerKey).toBeUndefined();
    });

    it("1.2 司機提交全部正確答案，獲得 100 分並通過測驗，寫入完訓證據", async () => {
      const result = await service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
        courseVersion: 1,
        answers: [
          { questionId: "q1", selectedOptionId: "opt_1b" },
          { questionId: "q2", selectedOptionId: "opt_2a" },
        ],
      });

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.feedback).toContain("通過");
      expect(repository.attempts.length).toBe(1);
      expect(repository.trainingRecordEvidence.length).toBe(1);
      expect(repository.trainingRecordEvidence[0]!.expiresAt).toBeTruthy();
    });

    it("1.3 測驗成績與完訓紀錄回讀一致，正確計算 30 天到期日與合格狀態", async () => {
      const now = new Date("2026-09-15T10:00:00.000Z");
      const attempt = gradeQuiz(
        SAMPLE_REQUIRED_COURSE,
        {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        },
        {
          attemptId: "att_qa_001",
          driverId: DRIVER_1,
          attemptedAt: now.toISOString(),
        },
      );

      const record = trainingRecord(
        publicCourse(SAMPLE_REQUIRED_COURSE),
        DRIVER_1,
        [attempt],
        now,
      );

      expect(record.status).toBe("passed");
      expect(record.passed).toBe(true);
      expect(record.highestScore).toBe(100);
      expect(record.attemptsCount).toBe(1);
      expect(record.isOverdue).toBe(false);

      // 檢查 expiresAt 為 30 天後 (30 * 86,400,000 ms)
      const expectedExpiry = new Date(
        now.getTime() + 30 * 86400000,
      ).toISOString();
      expect(record.expiresAt).toBe(expectedExpiry);
    });

    it("1.4 重考機制：初考未達及格線（50分）標記 failed，重考 100 分更新 highestScore 與 passed 狀態", async () => {
      const t1 = new Date("2026-09-15T09:00:00.000Z");
      const attempt1 = gradeQuiz(
        SAMPLE_REQUIRED_COURSE,
        {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" }, // 對 (50%)
            { questionId: "q2", selectedOptionId: "opt_2b" }, // 錯
          ],
        },
        {
          attemptId: "att_fail_001",
          driverId: DRIVER_1,
          attemptedAt: t1.toISOString(),
        },
      );
      expect(attempt1.score).toBe(50);
      expect(attempt1.passed).toBe(false);

      const recordAfterFail = trainingRecord(
        publicCourse(SAMPLE_REQUIRED_COURSE),
        DRIVER_1,
        [attempt1],
        t1,
      );
      expect(recordAfterFail.status).toBe("failed");
      expect(recordAfterFail.passed).toBe(false);
      expect(recordAfterFail.highestScore).toBe(50);

      // 重考及格
      const t2 = new Date("2026-09-15T11:00:00.000Z");
      const attempt2 = gradeQuiz(
        SAMPLE_REQUIRED_COURSE,
        {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        },
        {
          attemptId: "att_pass_002",
          driverId: DRIVER_1,
          attemptedAt: t2.toISOString(),
        },
      );
      expect(attempt2.score).toBe(100);
      expect(attempt2.passed).toBe(true);

      const recordAfterPass = trainingRecord(
        publicCourse(SAMPLE_REQUIRED_COURSE),
        DRIVER_1,
        [attempt1, attempt2],
        t2,
      );
      expect(recordAfterPass.status).toBe("passed");
      expect(recordAfterPass.passed).toBe(true);
      expect(recordAfterPass.highestScore).toBe(100);
      expect(recordAfterPass.attemptsCount).toBe(2);
    });

    it("1.5 服務資格連動：必修課程全部及格，資格評估判定 trainingSatisfied: true, regulatoryStatus: 'passed'", async () => {
      await service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
        courseVersion: 1,
        answers: [
          { questionId: "q1", selectedOptionId: "opt_1b" },
          { questionId: "q2", selectedOptionId: "opt_2a" },
        ],
      });

      const qualification = await service.evaluateDriverQualification(DRIVER_1);
      expect(qualification.trainingSatisfied).toBe(true);
      expect(qualification.trainingIncomplete).toBe(false);
      expect(qualification.regulatoryStatus).toBe("passed");
      expect(qualification.requiredCount).toBe(1);
    });

    it("1.6 到期重訓連動：超過 30 天有效期限時，完訓紀錄自動轉為 expired 且資格失效（trainingIncomplete: true, regulatoryStatus: 'expired'）", async () => {
      const submitTime = new Date("2026-09-01T10:00:00.000Z");
      const attempt = gradeQuiz(
        SAMPLE_REQUIRED_COURSE,
        {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        },
        {
          attemptId: "att_old_001",
          driverId: DRIVER_1,
          attemptedAt: submitTime.toISOString(),
        },
      );
      repository.attempts.push(attempt);

      // 模擬時間前進 35 天（已逾期 5 天）
      const checkTime = new Date(submitTime.getTime() + 35 * 86400000);
      const qualification = await service.evaluateDriverQualification(
        DRIVER_1,
        checkTime,
      );

      expect(qualification.trainingSatisfied).toBe(false);
      expect(qualification.trainingIncomplete).toBe(true);
      expect(qualification.regulatoryStatus).toBe("expired");
      expect(qualification.records[0]!.status).toBe("expired");
      expect(qualification.records[0]!.isOverdue).toBe(true);
    });

    it("1.7 特殊豁免保護：若司機為 waived 檔案，維持 regulatoryStatus: 'waived' 與 trainingSatisfied: true", async () => {
      repository.profileStatuses.set(DRIVER_WAIVED, "waived");

      const qualification =
        await service.evaluateDriverQualification(DRIVER_WAIVED);
      expect(qualification.regulatoryStatus).toBe("waived");
      expect(qualification.trainingSatisfied).toBe(true);
      expect(qualification.trainingIncomplete).toBe(false);
    });
  });

  describe("2. 關鍵負向案例與契約防護 (Negative & Edge Cases)", () => {
    it("2.1 提交過期之課程版本（courseVersion 不符），拒絕作答（409 COURSE_VERSION_STALE）", async () => {
      await expect(
        service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
          courseVersion: 0, // 當前為 1
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: "COURSE_VERSION_STALE",
        }),
      );
    });

    it("2.2 題目漏答或未完全作答，拒絕受理（400 QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION）", async () => {
      await expect(
        service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            // 漏答 q2
          ],
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
        }),
      );
    });

    it("2.3 重複提交同一題號答案，拒絕受理（400 QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION）", async () => {
      await expect(
        service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q1", selectedOptionId: "opt_1a" }, // 重複 q1
          ],
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
        }),
      );
    });

    it("2.4 選擇不存在之選項 ID，拒絕受理（400 QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION）", async () => {
      await expect(
        service.submitQuiz("crs_qa_safety_001", DRIVER_1, {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_nonexistent" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
        }),
      );
    });

    it("2.5 不存在之司機 ID 嘗試作答，拒絕受理（404 DRIVER_NOT_FOUND）", async () => {
      await expect(
        service.submitQuiz("crs_qa_safety_001", "drv_nonexistent_999", {
          courseVersion: 1,
          answers: [
            { questionId: "q1", selectedOptionId: "opt_1b" },
            { questionId: "q2", selectedOptionId: "opt_2a" },
          ],
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: "DRIVER_NOT_FOUND",
        }),
      );
    });

    it("2.6 不存在之課程 ID 查詢或作答，回傳 404（COURSE_NOT_FOUND）", async () => {
      await expect(
        service.getCourseDetail("crs_nonexistent_999"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: SYSTEM_REMEDIATION_ERROR_CODES.COURSE_NOT_FOUND,
        }),
      );
    });

    it("2.7 不存在之測驗紀錄查詢，回傳 404（ATTEMPT_NOT_FOUND）", async () => {
      await expect(
        service.getAttempt("att_nonexistent_999"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ATTEMPT_NOT_FOUND,
        }),
      );
    });
  });
});
