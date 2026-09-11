import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AcademyRepository } from "../../../../apps/api/src/modules/driver-academy/academy.repository";
import { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";
import { DriverLeaveRepository } from "../../../../apps/api/src/modules/driver-leave/driver-leave.repository";
import { DriverLeaveService } from "../../../../apps/api/src/modules/driver-leave/driver-leave.service";
import { PlatformPresenceService } from "../../../../apps/api/src/modules/platform-presence/platform-presence.service";
import { ShiftAttendanceService } from "../../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import { RuntimeEligibilityEvaluator } from "../../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import type { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../sr-qa-dispatch-001/test-support";
import { FakeAcademyRepository } from "./academy-memory";
import { createResolvedContext } from "./runtime-context";

const NOW = new Date("2026-09-11T08:00:00Z");
function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const leave = new DriverLeaveService(new DriverLeaveRepository());
  const repo = new FakeAcademyRepository();
  const academy = new AcademyService(repo as unknown as AcademyRepository);
  const context = createResolvedContext({
    driverId: "drv_1",
    evaluatedAt: NOW.toISOString(),
  });
  context.currentLocation!.recordedAt = NOW.toISOString();
  context.vehicleCapability.trainingRequired = true;
  const evaluator = new RuntimeEligibilityEvaluator(
    { resolve: () => context } as never,
    undefined,
    undefined,
    academy,
    leave,
  );
  const presence = new PlatformPresenceService(undefined, undefined, leave);
  const shifts = new ShiftAttendanceService(
    new AuditNotificationService(),
    undefined,
    undefined,
    leave,
  );
  const pass = () =>
    academy.submitQuiz("crs_basics_001", "drv_1", {
      courseVersion: 1,
      answers: [{ questionId: "q1", selectedOptionId: "opt_a" }],
    });
  const requestLeave = () =>
    leave.createLeave("drv_1", {
      leaveType: "personal",
      startTime: NOW.toISOString(),
      endTime: new Date(NOW.getTime() + 3600000).toISOString(),
      reason: "WIRE regression",
    });
  return {
    leave,
    repo,
    academy,
    evaluator,
    presence,
    shifts,
    pass,
    requestLeave,
    context,
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SR-WIRE-001 real feature authorities with in-memory repositories (no HTTP/SQL claim)", () => {
  it("blocks active approved leave before clock-in/online mutation and restores eligibility after expiry", async () => {
    const f = setup();
    await f.presence.setOnline("drv_1", "uber");
    const leave = await f.requestLeave();
    await f.leave.reviewLeave(leave.leaveId, "reviewer-wire", {
      decision: "approve",
    });
    await expect(f.shifts.clockIn({ driverId: "drv_1" })).rejects.toMatchObject(
      { code: "DRIVER_ON_LEAVE" },
    );
    expect(f.shifts.listShifts()).toHaveLength(0);
    await expect(f.presence.setOnline("drv_1", "uber")).rejects.toMatchObject({
      code: "DRIVER_ON_LEAVE",
    });
    expect((await f.presence.listForDriver("drv_1"))[0]?.eligibility).toBe(
      "ineligible",
    );
    // Other presence writes during leave must not persist the temporary overlay.
    await f.presence.recordHeartbeat("drv_1", "uber");
    vi.setSystemTime(new Date(NOW.getTime() + 3600001));
    expect((await f.presence.listForDriver("drv_1"))[0]?.eligibility).toBe(
      "eligible",
    );
    await expect(f.presence.setOnline("drv_1", "uber")).resolves.toMatchObject({
      status: "online",
    });
    await expect(
      f.shifts.clockIn({ driverId: "drv_1" }),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("keeps pending leave permissive and preserves the existing excluded-vehicle authority", async () => {
    const f = setup();
    await f.requestLeave();
    await expect(f.presence.setOnline("drv_1", "uber")).resolves.toMatchObject({
      status: "online",
    });
    const registry = {
      getVehicleDispatchability: vi.fn(() => false),
    } as unknown as RegulatoryRegistryService;
    const shifts = new ShiftAttendanceService(
      new AuditNotificationService(),
      undefined,
      registry,
      f.leave,
    );
    await expect(
      shifts.clockIn({ driverId: "drv_1", vehicleId: "excluded-av" }),
    ).rejects.toMatchObject({ code: "VEHICLE_NOT_DISPATCHABLE" });
    expect(shifts.listShifts()).toHaveLength(0);
  });

  it("uses current course attempts to block, recover after passing, and block again after expiry without changing vehicle capability", async () => {
    const f = setup();
    const command = {
      driverId: "drv_1",
      vehicleId: "veh-001",
      orderId: "ord-001",
      dispatchJobId: "job-001",
      serviceProductCode: "enterprise_dispatch" as const,
    };
    const before = await f.evaluator.evaluate(command);
    expect(before.softReasonCodes).toContain("DRIVER_TRAINING_INCOMPLETE");
    expect(before.missingRequirements).toContain("training");
    await f.pass();
    const after = await f.evaluator.evaluate(command);
    expect(after.softReasonCodes).not.toContain("DRIVER_TRAINING_INCOMPLETE");
    expect(after.missingRequirements).not.toContain("training");
    expect(after.decision).toBe("eligible");
    vi.setSystemTime(new Date(NOW.getTime() + 31 * 86400000));
    expect((await f.evaluator.evaluate(command)).softReasonCodes).toContain(
      "DRIVER_TRAINING_INCOMPLETE",
    );
    expect(f.context.vehicleCapability.trainingRequired).toBe(true);
    expect(f.context.driver.dispatchEligible).toBe(true);
  });

  it("filters both manual and autonomous candidates, and rechecks leave approved after listing before assignment", async () => {
    const f = setup();
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "drv_1",
          vehicleId: "veh-001",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      platformPresenceService: f.presence,
    });
    // Compose the real authority into the existing collaborator fixture. Remote
    // acceptance separately verifies actual Nest injection from full AppModule.
    Object.assign(service, { runtimeEligibilityEvaluator: f.evaluator });
    const order = await createTestPassengerOrder(service);
    await service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;
    expect(
      await service.listDispatchCandidates(job.dispatchJobId, true),
    ).toEqual([]);
    expect(
      await service.listEligibleDispatchCandidatesForOrder(order.orderId),
    ).toEqual([]);
    await f.pass();
    expect(
      await service.listDispatchCandidates(job.dispatchJobId),
    ).toHaveLength(1);
    expect(
      await service.listEligibleDispatchCandidatesForOrder(order.orderId),
    ).toHaveLength(1);
    const leave = await f.requestLeave();
    await f.leave.reviewLeave(leave.leaveId, "reviewer-wire", {
      decision: "approve",
    });
    await expect(
      service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        driverId: "drv_1",
        vehicleId: "veh-001",
      }),
    ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT" });
    expect(service.getDispatchAssignmentsForOrder(order.orderId)).toHaveLength(
      0,
    );
    vi.setSystemTime(new Date(NOW.getTime() + 3600001));
    expect(
      await service.listDispatchCandidates(job.dispatchJobId),
    ).toHaveLength(1);
  });

  it("propagates authority read failures instead of reporting eligibility", async () => {
    const f = setup();
    vi.spyOn(f.repo, "listCurrentCourses").mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(f.evaluator.assessDriverRequirements("drv_1")).rejects.toThrow(
      "database unavailable",
    );
  });
});
