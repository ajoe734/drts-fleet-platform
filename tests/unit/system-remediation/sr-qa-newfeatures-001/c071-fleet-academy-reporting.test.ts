import { describe, it, expect, beforeEach } from "vitest";
import { type AcademyCourseVersion } from "../../../../apps/api/src/modules/driver-academy/academy-domain";
import { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";
import { FleetPartnerTrainingController } from "../../../../apps/api/src/modules/driver-academy/academy.controller";
import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";
import type { DriverQuizAttemptDetail } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

class TestFleetAcademyRepository {
  courses: AcademyCourseVersion[] = [];
  attempts: DriverQuizAttemptDetail[] = [];
  existingDriverIds = new Set<string>();
  profileStatuses = new Map<string, string>();
  cohorts = new Map<string, Array<{ driverId: string; fullName: string }>>();

  isEnabled() {
    return false;
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

  async insertTrainingRecordEvidence() {}

  async upsertTrainingStatus() {}

  async listActiveFleetCohort(fleetPartnerId: string) {
    return this.cohorts.get(fleetPartnerId) ?? [];
  }
}

describe("SR-QA-NEWFEATURES-001 / C071: 車行訓練管理員真完訓率、逾期名單與人員證據下鑽驗收", () => {
  let repository: TestFleetAcademyRepository;
  let service: AcademyService;
  let fleetController: FleetPartnerTrainingController;

  const FLEET_ALPHA = "fleet_alpha_001";
  const FLEET_BETA = "fleet_beta_002";

  const DRIVER_A1 = "drv_alpha_001";
  const DRIVER_A2 = "drv_alpha_002";
  const DRIVER_B1 = "drv_beta_001";

  const COURSE_1: AcademyCourseVersion = {
    courseId: "crs_fleet_compliance_001",
    courseCode: "fleet_compliance",
    title: "車行合規與乘客服務規範",
    category: "compliance",
    isRequired: true,
    validityDays: 30,
    passingScore: 80,
    version: 1,
    modulesCount: 1,
    description: "車行合規必修培訓",
    modules: [
      {
        moduleId: "mod_1",
        title: "合規手冊",
        type: "sop",
        contentUrl: "https://docs.drts.example/compliance.pdf",
        durationMinutes: 20,
      },
    ],
    questions: [
      {
        questionId: "q1",
        prompt: "駕駛營運期間是否得拒載合格之導盲犬？",
        options: [
          { optionId: "opt_yes", text: "可以" },
          { optionId: "opt_no", text: "不得拒載" },
        ],
      },
    ],
    answerKey: { q1: "opt_no" },
  };

  const mockFleetAlphaTenantIdentity: BootstrapRequestIdentity = {
    authMode: "bootstrap_headers",
    actorType: "partner_user",
    actorId: "usr_fleet_mgr_001",
    realm: "tenant",
    tenantId: FLEET_ALPHA,
    roleFamilies: ["tenant"],
    roles: ["training_admin"],
    scopes: ["tenant:admin", "driver:read"],
    requestId: "req_fleet_alpha_001",
  };

  beforeEach(() => {
    repository = new TestFleetAcademyRepository();
    repository.courses = [COURSE_1];
    repository.existingDriverIds.add(DRIVER_A1);
    repository.existingDriverIds.add(DRIVER_A2);
    repository.existingDriverIds.add(DRIVER_B1);

    repository.cohorts.set(FLEET_ALPHA, [
      { driverId: DRIVER_A1, fullName: "王大明" },
      { driverId: DRIVER_A2, fullName: "李小華" },
    ]);
    repository.cohorts.set(FLEET_BETA, [
      { driverId: DRIVER_B1, fullName: "張志偉" },
    ]);

    service = new AcademyService(repository as any);
    fleetController = new FleetPartnerTrainingController(service);
  });

  describe("1. 權威訓練統計、花名冊與單一人員證據下鑽 (Normal Flows)", () => {
    it("1.1 車行培訓摘要以真實數據動態計算（completionPct, pendingHeadcount, overdueIncomplete），不依賴假常數", async () => {
      const now = new Date();

      // Driver A1 通過測驗 (合格有效)
      repository.attempts.push({
        attemptId: "att_a1_pass",
        driverId: DRIVER_A1,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: now.toISOString(),
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      // Driver A2 曾通過但已逾期 (40 天前，效期 30 天)
      const expiredDate = new Date(now.getTime() - 40 * 86400000).toISOString();
      repository.attempts.push({
        attemptId: "att_a2_expired",
        driverId: DRIVER_A2,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: expiredDate,
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      const summary = await service.fleetTrainingSummary(FLEET_ALPHA);

      expect(summary.fleetPartnerId).toBe(FLEET_ALPHA);
      expect(summary.source).toBe("authoritative");
      expect(summary.rows.length).toBe(1);
      expect(summary.rows[0]!.completed).toBe(1); // 僅 A1 仍合格有效
      expect(summary.rows[0]!.total).toBe(2);
      expect(summary.rows[0]!.pct).toBe(50);

      expect(summary.summary.completionPct).toBe("50%");
      expect(summary.summary.pendingHeadcount).toBe("1"); // 總人數 2 - 完成 1 = 1
      expect(summary.summary.overdueIncomplete).toBe(1); // A2 逾期
    });

    it("1.2 車行花名冊完整列出所屬司機之完訓狀態、成績、逾期旗標與最新測驗 ID", async () => {
      const now = new Date();
      repository.attempts.push({
        attemptId: "att_a1_001",
        driverId: DRIVER_A1,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: now.toISOString(),
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      const roster = await service.fleetRoster(FLEET_ALPHA);

      expect(roster.length).toBe(2);

      const driverA1Item = roster.find((r) => r.driverId === DRIVER_A1);
      expect(driverA1Item).toBeDefined();
      expect(driverA1Item!.driverName).toBe("王大明");
      expect(driverA1Item!.status).toBe("passed");
      expect(driverA1Item!.score).toBe(100);
      expect(driverA1Item!.latestAttemptId).toBe("att_a1_001");
      expect(driverA1Item!.isOverdue).toBe(false);

      const driverA2Item = roster.find((r) => r.driverId === DRIVER_A2);
      expect(driverA2Item).toBeDefined();
      expect(driverA2Item!.driverName).toBe("李小華");
      expect(driverA2Item!.status).toBe("not_started");
      expect(driverA2Item!.score).toBeNull();
      expect(driverA2Item!.latestAttemptId).toBeNull();
    });

    it("1.3 車行管理員可下鑽單一學員之測驗作答明細，檢視題目對錯、所選選項與成績", async () => {
      const now = new Date();
      repository.attempts.push({
        attemptId: "att_drill_001",
        driverId: DRIVER_A1,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: now.toISOString(),
        answersSummary: [
          {
            questionId: "q1",
            selectedOptionId: "opt_no",
            isCorrect: true,
          },
        ],
      });

      const detail = await service.fleetAttemptDrilldown(
        FLEET_ALPHA,
        DRIVER_A1,
        "att_drill_001",
      );

      expect(detail).toBeDefined();
      expect(detail.attemptId).toBe("att_drill_001");
      expect(detail.driverId).toBe(DRIVER_A1);
      expect(detail.score).toBe(100);
      expect(detail.passed).toBe(true);
      expect(detail.answersSummary[0]!.isCorrect).toBe(true);
      expect(detail.answersSummary[0]!.selectedOptionId).toBe("opt_no");
    });
  });

  describe("2. 跨車行隔離與租戶防護負向案例 (Negative & Security Boundary Cases)", () => {
    it("2.1 跨車行學員資料下鑽嚴格阻擋（403 ACADEMY_FORBIDDEN_FLEET_ACCESS）", async () => {
      const now = new Date();
      // 在 Fleet Beta 司機名下建立測驗紀錄
      repository.attempts.push({
        attemptId: "att_beta_001",
        driverId: DRIVER_B1,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: now.toISOString(),
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      // Fleet Alpha 管理員嘗試下鑽 Fleet Beta 的司機 Driver B1
      await expect(
        service.fleetAttemptDrilldown(FLEET_ALPHA, DRIVER_B1, "att_beta_001"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
        }),
      );
    });

    it("2.2 Controller 租戶邊界防護：Tenant Alpha 身份請求 Tenant Beta 之車行數據一律回傳 403", async () => {
      await expect(
        fleetController.summary(
          FLEET_BETA, // 企圖越權查詢 Beta
          mockFleetAlphaTenantIdentity, // 但身分為 Alpha
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
        }),
      );

      await expect(
        fleetController.roster(FLEET_BETA, mockFleetAlphaTenantIdentity),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
        }),
      );
    });

    it("2.3 測驗 ID 存在但不屬於該司機時，下鑽查詢回傳 404（ATTEMPT_NOT_FOUND）", async () => {
      const now = new Date();
      // 屬於 A1 的測驗
      repository.attempts.push({
        attemptId: "att_a1_real",
        driverId: DRIVER_A1,
        courseId: "crs_fleet_compliance_001",
        courseVersion: 1,
        score: 100,
        passed: true,
        attemptedAt: now.toISOString(),
        answersSummary: [
          { questionId: "q1", selectedOptionId: "opt_no", isCorrect: true },
        ],
      });

      // 嘗試以 A2 司機身分下鑽 A1 的 attemptId
      await expect(
        service.fleetAttemptDrilldown(FLEET_ALPHA, DRIVER_A2, "att_a1_real"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ATTEMPT_NOT_FOUND,
        }),
      );
    });

    it("2.4 查詢不存在之 attemptId，回傳 404（ATTEMPT_NOT_FOUND）", async () => {
      await expect(
        service.fleetAttemptDrilldown(
          FLEET_ALPHA,
          DRIVER_A1,
          "att_nonexistent_999",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: SYSTEM_REMEDIATION_ERROR_CODES.ATTEMPT_NOT_FOUND,
        }),
      );
    });
  });
});
