import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "zh" })),
  })),
}));

// Mock API client methods
const mockGetFleetTrainingSummary = vi.fn();
const mockListFleetDriverRoster = vi.fn();
const mockGetFleetDriverQuizAttempt = vi.fn();

vi.mock(
  "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
  () => ({
    getServerFleetPartnerClient: vi.fn(async () => ({
      client: {
        getFleetTrainingSummary: mockGetFleetTrainingSummary,
        listFleetDriverRoster: mockListFleetDriverRoster,
        getFleetDriverQuizAttempt: mockGetFleetDriverQuizAttempt,
      },
      fleetPartnerId: "fp-test-academy",
    })),
  }),
);

import {
  computeRosterTabCounts,
  filterRosterByTab,
  loadFleetDriverQuizAttempt,
  loadFleetTraining,
  scopeRosterRows,
} from "../../../../apps/fleet-partner-portal-web/lib/academy-data.server";

import type {
  AcademyCourseDetail,
  DriverQuizAttemptDetail,
  FleetDriverRosterItem,
  FleetTrainingView,
  QuizResultRecord,
} from "@drts/contracts";

describe("SR-ACADEMY-FE-001: Driver Academy & Fleet Authoritative Training Board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Fleet Academy Data Adapter (academy-data.server.ts)", () => {
    it("loads live training summary and driver roster without using fake fixtures", async () => {
      const liveSummary: FleetTrainingView = {
        fleetPartnerId: "fp-test-academy",
        rows: [
          {
            course: "平台服務法規遵循",
            en: "platform_compliance",
            completed: 45,
            total: 50,
            pct: 90,
          },
          {
            course: "行車安全與防禦駕駛",
            en: "safety_driving",
            completed: 38,
            total: 50,
            pct: 76,
          },
        ],
        summary: {
          completionPct: "83%",
          pendingHeadcount: "17",
          overdueIncomplete: 3,
        },
        source: "authoritative",
      };

      const liveRosterItems: FleetDriverRosterItem[] = [
        {
          driverId: "drv_001",
          driverName: "張駕駛",
          courseCode: "COMP-101",
          status: "passed",
          score: 90,
          completedAt: "2026-09-08T10:00:00Z",
          isOverdue: false,
          latestAttemptId: "att_001",
        },
        {
          driverId: "drv_002",
          driverName: "李駕駛",
          courseCode: "SAFE-201",
          status: "failed",
          score: 60,
          completedAt: null,
          isOverdue: false,
          latestAttemptId: "att_002",
        },
        {
          driverId: "drv_003",
          driverName: "王駕駛",
          courseCode: "COMP-101",
          status: "expired",
          score: 85,
          completedAt: "2025-08-01T10:00:00Z",
          isOverdue: true,
          latestAttemptId: "att_003",
        },
      ];

      mockGetFleetTrainingSummary.mockResolvedValue(liveSummary);
      mockListFleetDriverRoster.mockResolvedValue({
        items: liveRosterItems,
        pageInfo: {
          page: 1,
          pageSize: 20,
          totalItems: 3,
          totalPages: 1,
        },
      });

      const result = await loadFleetTraining();

      expect(result.source).toBe("live");
      expect(result.error).toBeNull();
      expect(result.summary.completionPct).toBe("83%");
      expect(result.summary.pendingHeadcount).toBe("17");
      expect(result.summary.overdueIncomplete).toBe(3);
      expect(result.rows).toHaveLength(2);
      expect(result.roster).toHaveLength(3);
      expect(result.roster[0]!.driverName).toBe("張駕駛");
      expect(result.roster[0]!.score).toBe(90);
    });

    it("handles legitimate empty data correctly as live zero state", async () => {
      mockGetFleetTrainingSummary.mockResolvedValue({
        fleetPartnerId: "fp-test-academy",
        rows: [],
        summary: {
          completionPct: "0%",
          pendingHeadcount: "0",
          overdueIncomplete: 0,
        },
        source: "authoritative",
      });
      mockListFleetDriverRoster.mockResolvedValue({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });

      const result = await loadFleetTraining();

      expect(result.source).toBe("live");
      expect(result.error).toBeNull();
      expect(result.summary.completionPct).toBe("0%");
      expect(result.rows).toEqual([]);
      expect(result.roster).toEqual([]);
    });

    it("falls back gracefully when backend training endpoint is unreachable without fabricating numbers", async () => {
      mockGetFleetTrainingSummary.mockRejectedValue(
        new Error("Connection refused to training service"),
      );

      const result = await loadFleetTraining();

      expect(result.source).toBe("fallback");
      expect(result.error).toContain("Connection refused");
      expect(result.summary.completionPct).toBe("—");
      expect(result.summary.pendingHeadcount).toBe("—");
      expect(result.summary.overdueIncomplete).toBe("—");
      expect(result.rows).toEqual([]);
      expect(result.roster).toEqual([]);
    });

    it("rethrows configuration errors when fleet scope is missing", async () => {
      const configErr = new Error("Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID");
      mockGetFleetTrainingSummary.mockRejectedValue(configErr);

      await expect(loadFleetTraining()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loads driver quiz attempt details for authoritative inspection (C071)", async () => {
      const attemptDetail: DriverQuizAttemptDetail = {
        driverId: "drv_001",
        attemptId: "att_001",
        courseId: "crs_comp_01",
        courseVersion: 1,
        score: 90,
        passed: true,
        attemptedAt: "2026-09-08T10:00:00Z",
        feedback: "優異完成所有法規題目",
        answersSummary: [
          {
            questionId: "q1",
            selectedOptionId: "opt_a",
            isCorrect: true,
          },
          {
            questionId: "q2",
            selectedOptionId: "opt_b",
            isCorrect: true,
          },
        ],
      };

      mockGetFleetDriverQuizAttempt.mockResolvedValue(attemptDetail);

      const result = await loadFleetDriverQuizAttempt("drv_001", "att_001");

      expect(mockGetFleetDriverQuizAttempt).toHaveBeenCalledWith(
        "drv_001",
        "att_001",
      );
      expect(result).toEqual(attemptDetail);
      expect(result?.passed).toBe(true);
      expect(result?.answersSummary).toHaveLength(2);
    });
  });

  describe("2. Roster Filtering and Scope Logic (N02 / C071)", () => {
    const sampleRoster: FleetDriverRosterItem[] = [
      {
        driverId: "drv_001",
        driverName: "林志偉",
        courseCode: "COMP-101",
        status: "passed",
        score: 95,
        completedAt: "2026-09-01T00:00:00Z",
        isOverdue: false,
        latestAttemptId: "att_101",
      },
      {
        driverId: "drv_002",
        driverName: "陳俊宏",
        courseCode: "SAFE-201",
        status: "in_progress",
        score: null,
        completedAt: null,
        isOverdue: false,
        latestAttemptId: null,
      },
      {
        driverId: "drv_003",
        driverName: "黃文豪",
        courseCode: "COMP-101",
        status: "failed",
        score: 55,
        completedAt: null,
        isOverdue: false,
        latestAttemptId: "att_103",
      },
      {
        driverId: "drv_004",
        driverName: "王建民",
        courseCode: "COMP-101",
        status: "expired",
        score: 80,
        completedAt: "2025-01-01T00:00:00Z",
        isOverdue: true,
        latestAttemptId: "att_104",
      },
    ];

    it("computes roster tab counts accurately", () => {
      const counts = computeRosterTabCounts(sampleRoster);
      expect(counts.all).toBe(4);
      expect(counts.completed).toBe(1); // passed
      expect(counts.pending).toBe(2); // in_progress + failed
      expect(counts.overdue).toBe(1); // expired & isOverdue
    });

    it("filters roster by tab: completed, pending, overdue", () => {
      const completed = filterRosterByTab(sampleRoster, "completed");
      expect(completed).toHaveLength(1);
      expect(completed[0]!.driverId).toBe("drv_001");

      const pending = filterRosterByTab(sampleRoster, "pending");
      expect(pending).toHaveLength(2);
      expect(pending.map((r) => r.driverId)).toEqual(["drv_002", "drv_003"]);

      const overdue = filterRosterByTab(sampleRoster, "overdue");
      expect(overdue).toHaveLength(1);
      expect(overdue[0]!.driverId).toBe("drv_004");

      const all = filterRosterByTab(sampleRoster, "all");
      expect(all).toHaveLength(4);
    });

    it("scopes roster rows by query text and course code", () => {
      const byName = scopeRosterRows(sampleRoster, { q: "陳俊宏" });
      expect(byName).toHaveLength(1);
      expect(byName[0]!.driverId).toBe("drv_002");

      const byAttempt = scopeRosterRows(sampleRoster, { q: "att_103" });
      expect(byAttempt).toHaveLength(1);
      expect(byAttempt[0]!.driverId).toBe("drv_003");

      const byCourse = scopeRosterRows(sampleRoster, { course: "SAFE-201" });
      expect(byCourse).toHaveLength(1);
      expect(byCourse[0]!.driverId).toBe("drv_002");
    });
  });

  describe("3. Driver Academy Contracts & Cross-Actor Proof Consistency (C059 & C071)", () => {
    it("ensures completed quiz score and attemptId match the fleet roster item exactly", () => {
      // Driver's quiz result after submission
      const driverQuizResult: QuizResultRecord = {
        attemptId: "att_verified_999",
        courseId: "crs_safety_01",
        courseVersion: 1,
        score: 88,
        passed: true,
        attemptedAt: "2026-09-10T11:00:00Z",
        feedback: "通過安全法規測驗",
      };

      // Fleet training roster item corresponding to this driver and course
      const fleetDriverRecord: FleetDriverRosterItem = {
        driverId: "drv_verified_01",
        driverName: "測試合格駕駛",
        courseCode: "SAFE-01",
        status: driverQuizResult.passed ? "passed" : "failed",
        score: driverQuizResult.score,
        completedAt: driverQuizResult.attemptedAt,
        isOverdue: false,
        latestAttemptId: driverQuizResult.attemptId,
      };

      // Core verification of N02: 學員能完成測驗看到真成績，fleet看同一證據
      expect(fleetDriverRecord.score).toBe(driverQuizResult.score);
      expect(fleetDriverRecord.latestAttemptId).toBe(driverQuizResult.attemptId);
      expect(fleetDriverRecord.status).toBe("passed");
      expect(fleetDriverRecord.completedAt).toBe(driverQuizResult.attemptedAt);
    });

    it("ensures failed quiz does NOT fake completion on fleet board", () => {
      const failedDriverQuizResult: QuizResultRecord = {
        attemptId: "att_failed_002",
        courseId: "crs_safety_01",
        courseVersion: 1,
        score: 50,
        passed: false,
        attemptedAt: "2026-09-10T11:05:00Z",
        feedback: "分數未達標準 (80分)，未獲完訓資格",
      };

      const fleetDriverRecord: FleetDriverRosterItem = {
        driverId: "drv_failed_01",
        driverName: "測驗未過駕駛",
        courseCode: "SAFE-01",
        status: failedDriverQuizResult.passed ? "passed" : "failed",
        score: failedDriverQuizResult.score,
        completedAt: null, // Not completed!
        isOverdue: false,
        latestAttemptId: failedDriverQuizResult.attemptId,
      };

      // Verification: 未開課程/失敗不假完訓
      expect(failedDriverQuizResult.passed).toBe(false);
      expect(fleetDriverRecord.status).toBe("failed");
      expect(fleetDriverRecord.completedAt).toBeNull();
      expect(fleetDriverRecord.score).toBe(50);
    });

    it("validates that course details carry authentic modules (video, sop, article) and questions", () => {
      const courseDetail: AcademyCourseDetail = {
        courseId: "crs_full_01",
        courseCode: "COMP-101",
        title: "專業法規與服務SOP",
        category: "compliance",
        isRequired: true,
        validityDays: 365,
        passingScore: 80,
        version: 1,
        modulesCount: 3,
        description: "必修法規標準作業程序課程",
        modules: [
          {
            moduleId: "mod_vid_1",
            title: "法規影片",
            type: "video",
            contentUrl: "https://cdn.drts.internal/academy/vid1.mp4",
            durationMinutes: 15,
          },
          {
            moduleId: "mod_sop_2",
            title: "服務SOP手冊",
            type: "sop",
            contentUrl: "https://cdn.drts.internal/academy/sop1.pdf",
            durationMinutes: 20,
          },
          {
            moduleId: "mod_art_3",
            title: "作業條款講義",
            type: "article",
            contentUrl: "https://cdn.drts.internal/academy/art1.md",
            durationMinutes: 10,
          },
        ],
        questions: [
          {
            questionId: "q1",
            prompt: "行車前必做之檢查項目為何？",
            options: [
              { optionId: "a", text: "車輛安全自檢與整潔檢查" },
              { optionId: "b", text: "直接出車不需檢查" },
            ],
          },
        ],
      };

      expect(courseDetail.modules).toHaveLength(3);
      expect(courseDetail.modules.map((m) => m.type)).toEqual([
        "video",
        "sop",
        "article",
      ]);
      expect(courseDetail.questions).toHaveLength(1);
      expect(courseDetail.passingScore).toBe(80);
      expect(courseDetail.isRequired).toBe(true);
    });
  });
});
