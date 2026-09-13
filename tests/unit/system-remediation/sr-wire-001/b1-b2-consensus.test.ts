import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import { AcademyRepository } from "../../../../apps/api/src/modules/driver-academy/academy.repository";
import { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";
import type { AcademyCourseVersion } from "../../../../apps/api/src/modules/driver-academy/academy-domain";
import type { DriverQuizAttemptDetail } from "@drts/contracts";
import { RuntimeEligibilityEvaluator } from "../../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { createResolvedContext } from "./runtime-context";

describe("SR-WIRE-001 Consensus B1: Single async persistent clock-in/out path", () => {
  it("executes clockIn via executeClockInTransaction with per-driver lock and commits", async () => {
    const auditService = new AuditNotificationService();
    const mockRepo = new ShiftAttendanceRepository();

    let transactionExecuted = false;
    mockRepo.isEnabled = () => true;
    mockRepo.executeClockInTransaction = vi.fn(async (driverId, verifyEligibilityAndBuildShift) => {
      transactionExecuted = true;
      const client = {} as any;
      const shift = await verifyEligibilityAndBuildShift(client);
      return shift;
    });

    const service = new ShiftAttendanceService(auditService, mockRepo);

    const shiftPromise = service.clockIn({
      driverId: "drv-tx-001",
      vehicleId: "veh-tx-001",
      location: "Depot North",
      odometer: 1000,
    });

    expect(shiftPromise).toBeInstanceOf(Promise);
    const shift = await shiftPromise;

    expect(transactionExecuted).toBe(true);
    expect(mockRepo.executeClockInTransaction).toHaveBeenCalledWith(
      "drv-tx-001",
      expect.any(Function),
    );
    expect(shift.driverId).toBe("drv-tx-001");
    expect(shift.vehicleId).toBe("veh-tx-001");
    expect(shift.status).toBe("active");
  });

  it("fails clockIn and propagates DB error without creating synthetic shift", async () => {
    const auditService = new AuditNotificationService();
    const mockRepo = new ShiftAttendanceRepository();

    mockRepo.isEnabled = () => true;
    mockRepo.executeClockInTransaction = vi.fn(async () => {
      throw new ApiRequestError(500, "DB_CONNECTION_LOST", "Database connection lost during clock-in.");
    });

    const service = new ShiftAttendanceService(auditService, mockRepo);

    await expect(
      service.clockIn({
        driverId: "drv-tx-fail",
        vehicleId: "veh-tx-001",
      }),
    ).rejects.toMatchObject({
      code: "DB_CONNECTION_LOST",
      status: 500,
    });

    // Verify no shift is cached or reported as active
    expect(service.listShifts("drv-tx-fail")).toHaveLength(0);
  });

  it("executes clockOut via executeClockOutTransaction and allows subsequent clockIn", async () => {
    const auditService = new AuditNotificationService();
    const mockRepo = new ShiftAttendanceRepository();

    let activeShiftRecord: any = null;
    mockRepo.isEnabled = () => true;
    mockRepo.executeClockInTransaction = vi.fn(async (driverId, callback) => {
      const shift = await callback({} as any);
      activeShiftRecord = shift;
      return shift;
    });
    mockRepo.executeClockOutTransaction = vi.fn(async (driverId, callback) => {
      const result = await callback(activeShiftRecord);
      activeShiftRecord = null;
      return result;
    });

    const service = new ShiftAttendanceService(auditService, mockRepo);

    const shift1 = await service.clockIn({
      driverId: "drv-tx-cycle",
      vehicleId: "veh-001",
    });
    expect(shift1.status).toBe("active");

    const outResult = await service.clockOut({
      driverId: "drv-tx-cycle",
      odometer: 1050,
    });
    expect(outResult.shift.status).toBe("completed");
    expect(outResult.attendance.driverId).toBe("drv-tx-cycle");

    // Clock in again succeeds
    const shift2 = await service.clockIn({
      driverId: "drv-tx-cycle",
      vehicleId: "veh-002",
    });
    expect(shift2.status).toBe("active");
  });
});

describe("SR-WIRE-001 Consensus B2: Academy qualification single operation, waiver preservation & trainingRequired gate", () => {
  const SAMPLE_COURSE: AcademyCourseVersion = {
    courseId: "crs_req_01",
    courseCode: "req_training_01",
    title: "Required Training",
    category: "compliance",
    isRequired: true,
    validityDays: 30,
    passingScore: 80,
    version: 1,
    modulesCount: 1,
    modules: [],
    questions: [],
    answerKey: {},
  };

  it("projects 'pending' when required courses list is empty (no synthetic pass on empty list)", async () => {
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [],
      listAttempts: async () => [],
      getDriverTrainingProfileStatus: async () => null,
      upsertTrainingStatus: vi.fn(async () => {}),
    } as unknown as AcademyRepository;

    const service = new AcademyService(mockRepo);
    const qual = await service.evaluateDriverQualification("drv-empty");

    expect(qual.regulatoryStatus).toBe("pending");
    expect(qual.trainingSatisfied).toBe(false);
    expect(qual.trainingIncomplete).toBe(false);
    expect(mockRepo.upsertTrainingStatus).toHaveBeenCalledWith("drv-empty", "pending", null);
  });

  it("projects 'passed' when all required courses have passing attempts", async () => {
    const now = new Date("2026-09-13T10:00:00Z");
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [SAMPLE_COURSE],
      listAttempts: async () => [
        {
          attemptId: "att_1",
          courseId: "crs_req_01",
          courseVersion: 1,
          driverId: "drv-pass",
          score: 100,
          passed: true,
          attemptedAt: "2026-09-10T10:00:00Z",
          answers: [],
        } as DriverQuizAttemptDetail,
      ],
      getDriverTrainingProfileStatus: async () => null,
      upsertTrainingStatus: vi.fn(async () => {}),
    } as unknown as AcademyRepository;

    const service = new AcademyService(mockRepo);
    const qual = await service.evaluateDriverQualification("drv-pass", now);

    expect(qual.regulatoryStatus).toBe("passed");
    expect(qual.trainingSatisfied).toBe(true);
    expect(qual.trainingIncomplete).toBe(false);
    expect(mockRepo.upsertTrainingStatus).toHaveBeenCalledWith(
      "drv-pass",
      "passed",
      "2026-09-10T10:00:00Z",
    );
  });

  it("projects 'expired' when required course has expired", async () => {
    const now = new Date("2026-09-13T10:00:00Z");
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [SAMPLE_COURSE],
      listAttempts: async () => [
        {
          attemptId: "att_old",
          courseId: "crs_req_01",
          courseVersion: 1,
          driverId: "drv-expired",
          score: 100,
          passed: true,
          attemptedAt: "2026-06-01T10:00:00Z", // > 30 days ago
          answers: [],
        } as DriverQuizAttemptDetail,
      ],
      getDriverTrainingProfileStatus: async () => null,
      upsertTrainingStatus: vi.fn(async () => {}),
    } as unknown as AcademyRepository;

    const service = new AcademyService(mockRepo);
    const qual = await service.evaluateDriverQualification("drv-expired", now);

    expect(qual.regulatoryStatus).toBe("expired");
    expect(qual.trainingSatisfied).toBe(false);
    expect(qual.trainingIncomplete).toBe(true);
    expect(mockRepo.upsertTrainingStatus).toHaveBeenCalledWith(
      "drv-expired",
      "expired",
      null,
    );
  });

  it("preserves manual 'waived' status and does NOT overwrite it in the repository", async () => {
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [SAMPLE_COURSE],
      listAttempts: async () => [], // No attempts, would ordinarily be pending
      getDriverTrainingProfileStatus: async () => "waived",
      upsertTrainingStatus: vi.fn(async () => {}),
    } as unknown as AcademyRepository;

    const service = new AcademyService(mockRepo);
    const qual = await service.evaluateDriverQualification("drv-waived");

    // Evaluates driver as qualified due to manual waiver
    expect(qual.regulatoryStatus).toBe("waived");
    expect(qual.trainingSatisfied).toBe(true);
    expect(qual.trainingIncomplete).toBe(false);
    // Crucial: upsertTrainingStatus must NOT be called, preserving the waived status
    expect(mockRepo.upsertTrainingStatus).not.toHaveBeenCalled();
  });

  it("RuntimeEligibilityEvaluator: trainingRequired=false allows driver through without training", async () => {
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [SAMPLE_COURSE],
      listAttempts: async () => [], // Not trained
      getDriverTrainingProfileStatus: async () => null,
      upsertTrainingStatus: async () => {},
    } as unknown as AcademyRepository;
    const academy = new AcademyService(mockRepo);

    const context = createResolvedContext({
      driverId: "drv-no-req",
      evaluatedAt: "2026-09-13T10:00:00Z",
    });
    // Vehicle capability: training NOT required
    context.vehicleCapability.trainingRequired = false;
    context.currentLocation!.recordedAt = "2026-09-13T10:00:00Z";

    const evaluator = new RuntimeEligibilityEvaluator(
      { resolve: () => context } as never,
      undefined,
      undefined,
      academy,
    );

    const result = await evaluator.evaluate({
      driverId: "drv-no-req",
      vehicleId: "veh-001",
      orderId: "ord-001",
      dispatchJobId: "job-001",
      serviceProductCode: "standard_taxi",
    });

    expect(result.decision).toBe("eligible");
    expect(result.softReasonCodes).not.toContain("DRIVER_TRAINING_INCOMPLETE");
    expect(result.missingRequirements).not.toContain("training");
  });

  it("RuntimeEligibilityEvaluator: trainingRequired=true and waived driver is eligible", async () => {
    const mockRepo = {
      isEnabled: () => false,
      listCurrentCourses: async () => [SAMPLE_COURSE],
      listAttempts: async () => [],
      getDriverTrainingProfileStatus: async () => "waived",
      upsertTrainingStatus: async () => {},
    } as unknown as AcademyRepository;
    const academy = new AcademyService(mockRepo);

    const context = createResolvedContext({
      driverId: "drv-waived-eval",
      evaluatedAt: "2026-09-13T10:00:00Z",
    });
    context.vehicleCapability.trainingRequired = true;
    context.currentLocation!.recordedAt = "2026-09-13T10:00:00Z";

    const evaluator = new RuntimeEligibilityEvaluator(
      { resolve: () => context } as never,
      undefined,
      undefined,
      academy,
    );

    const result = await evaluator.evaluate({
      driverId: "drv-waived-eval",
      vehicleId: "veh-001",
      orderId: "ord-001",
      dispatchJobId: "job-001",
      serviceProductCode: "standard_taxi",
    });

    expect(result.decision).toBe("eligible");
    expect(result.softReasonCodes).not.toContain("DRIVER_TRAINING_INCOMPLETE");
    expect(result.missingRequirements).not.toContain("training");
  });
});
