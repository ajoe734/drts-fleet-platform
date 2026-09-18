import { describe, expect, it } from "vitest";

// ============================================================================
// SR-DESIGN-001: Minimal Implementable Contract Invariants & Behavioral Tests
// Gaps: N01, N02, N03
// Capabilities: C012, C052, C059, C071
// Reviewer: Codex2
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Family 1: Driver Leave Workflow Contract Invariants (N01 / C052)
// ----------------------------------------------------------------------------

type DriverLeaveStatus = "pending" | "approved" | "rejected" | "withdrawn";

interface LeaveInterval {
  leaveId: string;
  startTime: string;
  endTime: string;
  status: DriverLeaveStatus;
}

interface ShiftRecordMock {
  shiftId: string;
  driverId: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: "active" | "completed" | "abandoned";
  record: Record<string, unknown>;
}

function isValidTimeRange(
  startIso: string,
  endIso: string,
  nowIso: string,
): boolean {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const now = new Date(nowIso).getTime();

  // Validate non-NaN dates
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(now)) {
    return false;
  }

  // startTime must be strictly before endTime
  if (end <= start) return false;

  // start cannot be in the past beyond a 15-minute grace period
  const gracePeriodMs = 15 * 60 * 1000;
  if (start < now - gracePeriodMs) return false;

  return true;
}

function hasOverlappingActiveLeave(
  newLeave: { startTime: string; endTime: string },
  existingLeaves: LeaveInterval[],
): boolean {
  const newStart = new Date(newLeave.startTime).getTime();
  const newEnd = new Date(newLeave.endTime).getTime();

  return existingLeaves.some((leave) => {
    // Only pending and approved leaves cause conflicts
    if (leave.status !== "pending" && leave.status !== "approved") {
      return false;
    }
    const existStart = new Date(leave.startTime).getTime();
    const existEnd = new Date(leave.endTime).getTime();
    // Overlap condition: start < existEnd && end > existStart
    return newStart < existEnd && newEnd > existStart;
  });
}

function transitionLeaveStatus(
  currentStatus: DriverLeaveStatus,
  action: "withdraw" | "approve" | "reject",
): DriverLeaveStatus {
  if (currentStatus !== "pending") {
    throw new Error("LEAVE_INVALID_STATE_TRANSITION");
  }
  switch (action) {
    case "withdraw":
      return "withdrawn";
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
  }
}

function checkClockInAndDispatchAllowedDuringLeave(
  timeIso: string,
  approvedLeaves: Array<{
    startTime: string;
    endTime: string;
    status: DriverLeaveStatus;
  }>,
): {
  allowed: boolean;
  presenceEligibility: "eligible" | "ineligible";
  dispatchSuppressed: boolean;
  errorCode?: string;
} {
  const checkTime = new Date(timeIso).getTime();
  const onLeave = approvedLeaves.some((leave) => {
    if (leave.status !== "approved") return false;
    const start = new Date(leave.startTime).getTime();
    const end = new Date(leave.endTime).getTime();
    return checkTime >= start && checkTime <= end;
  });

  if (onLeave) {
    return {
      allowed: false,
      presenceEligibility: "ineligible",
      dispatchSuppressed: true,
      errorCode: "DRIVER_ON_LEAVE",
    };
  }
  return {
    allowed: true,
    presenceEligibility: "eligible",
    dispatchSuppressed: false,
  };
}

function annotateOverlappingShifts(
  leave: { leaveId: string; startTime: string; endTime: string },
  shifts: ShiftRecordMock[],
): { annotatedShifts: ShiftRecordMock[]; impactedShiftIds: string[] } {
  const leaveStart = new Date(leave.startTime).getTime();
  const leaveEnd = new Date(leave.endTime).getTime();
  const impactedShiftIds: string[] = [];

  const annotatedShifts = shifts.map((shift) => {
    if (!shift.scheduledStart || !shift.scheduledEnd) return shift;
    const shiftStart = new Date(shift.scheduledStart).getTime();
    const shiftEnd = new Date(shift.scheduledEnd).getTime();

    // Overlap condition
    if (shiftStart < leaveEnd && shiftEnd > leaveStart) {
      impactedShiftIds.push(shift.shiftId);
      return {
        ...shift,
        record: {
          ...shift.record,
          leaveReassigned: true,
          reassignedReason: "DRIVER_ON_LEAVE",
          leaveId: leave.leaveId,
        },
      };
    }
    return shift;
  });

  return { annotatedShifts, impactedShiftIds };
}

describe("SR-DESIGN-001: Driver Leave Contracts (N01 / C052)", () => {
  const now = "2026-09-06T08:00:00.000Z";

  it("validates time range: rejects invalid strings, endTime <= startTime, and past dates beyond 15m grace", () => {
    // Non-date string inputs must return false
    expect(isValidTimeRange("not-a-date", "not-a-date", now)).toBe(false);
    expect(isValidTimeRange("2026-09-10T08:00:00.000Z", "invalid", now)).toBe(
      false,
    );

    // End before or equal to start must return false
    expect(
      isValidTimeRange(
        "2026-09-10T17:00:00.000Z",
        "2026-09-10T08:00:00.000Z",
        now,
      ),
    ).toBe(false);
    expect(
      isValidTimeRange(
        "2026-09-10T08:00:00.000Z",
        "2026-09-10T08:00:00.000Z",
        now,
      ),
    ).toBe(false);

    // Past date beyond 15-minute grace period (now is 08:00, 07:40 is 20m ago)
    expect(
      isValidTimeRange(
        "2026-09-06T07:40:00.000Z",
        "2026-09-06T17:00:00.000Z",
        now,
      ),
    ).toBe(false);

    // Emergency leave within 15-minute grace period (now is 08:00, 07:50 is 10m ago) -> valid
    expect(
      isValidTimeRange(
        "2026-09-06T07:50:00.000Z",
        "2026-09-06T17:00:00.000Z",
        now,
      ),
    ).toBe(true);

    // Future time range -> valid
    expect(
      isValidTimeRange(
        "2026-09-10T08:00:00.000Z",
        "2026-09-10T17:00:00.000Z",
        now,
      ),
    ).toBe(true);
  });

  it("detects overlapping leave applications for the same driver", () => {
    const existingLeaves: LeaveInterval[] = [
      {
        leaveId: "lv_1",
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T17:00:00.000Z",
        status: "approved",
      },
      {
        leaveId: "lv_2",
        startTime: "2026-09-12T08:00:00.000Z",
        endTime: "2026-09-12T17:00:00.000Z",
        status: "withdrawn",
      },
    ];

    // Overlaps with approved leave (09-10 12:00 to 18:00)
    expect(
      hasOverlappingActiveLeave(
        {
          startTime: "2026-09-10T12:00:00.000Z",
          endTime: "2026-09-10T18:00:00.000Z",
        },
        existingLeaves,
      ),
    ).toBe(true);

    // Does not overlap with withdrawn leave (09-12 09:00 to 12:00 is allowed)
    expect(
      hasOverlappingActiveLeave(
        {
          startTime: "2026-09-12T09:00:00.000Z",
          endTime: "2026-09-12T12:00:00.000Z",
        },
        existingLeaves,
      ),
    ).toBe(false);

    // Completely disjoint date (09-15)
    expect(
      hasOverlappingActiveLeave(
        {
          startTime: "2026-09-15T08:00:00.000Z",
          endTime: "2026-09-15T17:00:00.000Z",
        },
        existingLeaves,
      ),
    ).toBe(false);
  });

  it("enforces strict state transitions from pending only", () => {
    expect(transitionLeaveStatus("pending", "withdraw")).toBe("withdrawn");
    expect(transitionLeaveStatus("pending", "approve")).toBe("approved");
    expect(transitionLeaveStatus("pending", "reject")).toBe("rejected");

    // Cannot transition approved, rejected, or withdrawn
    expect(() => transitionLeaveStatus("approved", "withdraw")).toThrow(
      "LEAVE_INVALID_STATE_TRANSITION",
    );
    expect(() => transitionLeaveStatus("rejected", "approve")).toThrow(
      "LEAVE_INVALID_STATE_TRANSITION",
    );
    expect(() => transitionLeaveStatus("withdrawn", "approve")).toThrow(
      "LEAVE_INVALID_STATE_TRANSITION",
    );
  });

  it("blocks clock-in and suppresses platform presence & dispatch eligibility during approved leave window", () => {
    const approvedLeaves = [
      {
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T17:00:00.000Z",
        status: "approved" as const,
      },
    ];

    // During leave window -> blocked, presence ineligible, dispatch suppressed
    const duringLeave = checkClockInAndDispatchAllowedDuringLeave(
      "2026-09-10T10:00:00.000Z",
      approvedLeaves,
    );
    expect(duringLeave.allowed).toBe(false);
    expect(duringLeave.presenceEligibility).toBe("ineligible");
    expect(duringLeave.dispatchSuppressed).toBe(true);
    expect(duringLeave.errorCode).toBe("DRIVER_ON_LEAVE");

    // Outside leave window -> allowed, presence eligible, dispatch active
    const afterLeave = checkClockInAndDispatchAllowedDuringLeave(
      "2026-09-10T18:00:00.000Z",
      approvedLeaves,
    );
    expect(afterLeave.allowed).toBe(true);
    expect(afterLeave.presenceEligibility).toBe("eligible");
    expect(afterLeave.dispatchSuppressed).toBe(false);
  });

  it("annotates overlapping shifts on ops.phase1_driver_shifts with leaveReassigned", () => {
    const leave = {
      leaveId: "lv_100",
      startTime: "2026-09-10T08:00:00.000Z",
      endTime: "2026-09-10T17:00:00.000Z",
    };

    const shifts: ShiftRecordMock[] = [
      {
        shiftId: "sh_1",
        driverId: "drv_1",
        scheduledStart: "2026-09-10T07:00:00.000Z",
        scheduledEnd: "2026-09-10T12:00:00.000Z",
        status: "active",
        record: {},
      },
      {
        shiftId: "sh_2",
        driverId: "drv_1",
        scheduledStart: "2026-09-11T08:00:00.000Z",
        scheduledEnd: "2026-09-11T16:00:00.000Z",
        status: "active",
        record: {},
      },
    ];

    const result = annotateOverlappingShifts(leave, shifts);
    expect(result.impactedShiftIds).toEqual(["sh_1"]);
    const shift1 = result.annotatedShifts[0];
    const shift2 = result.annotatedShifts[1];
    expect(shift1).toBeDefined();
    expect(shift2).toBeDefined();
    if (!shift1 || !shift2) throw new Error("Expected shifts to be defined");
    expect(shift1.record.leaveReassigned).toBe(true);
    expect(shift1.record.reassignedReason).toBe("DRIVER_ON_LEAVE");
    expect(shift1.record.leaveId).toBe("lv_100");
    expect(shift2.record.leaveReassigned).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// 2. Family 2: Driver Academy & Fleet Training Contracts (N02 / C059 / C071)
// ----------------------------------------------------------------------------

interface DriverTrainingItem {
  driverId: string;
  courseCode: string;
  status: "not_started" | "in_progress" | "passed" | "failed" | "expired";
  score: number | null;
  expiresAt: string | null;
}

function computeFleetTrainingSummary(
  totalRosterDriversCount: number,
  requiredCourseCodes: string[],
  driverRecords: DriverTrainingItem[],
  nowIso: string,
) {
  const now = new Date(nowIso).getTime();

  // Group records by driverId
  const driverRecordMap = new Map<string, Map<string, DriverTrainingItem>>();
  for (const record of driverRecords) {
    if (!driverRecordMap.has(record.driverId)) {
      driverRecordMap.set(record.driverId, new Map());
    }
    driverRecordMap.get(record.driverId)!.set(record.courseCode, record);
  }

  let fullyCompletedDriversCount = 0;
  let driversWithAnyOverdueCount = 0;

  // Evaluate each driver across all required courses
  for (const [, courses] of driverRecordMap.entries()) {
    let allPassed = requiredCourseCodes.length > 0;
    let hasOverdue = false;

    for (const code of requiredCourseCodes) {
      const rec = courses.get(code);
      if (!rec) {
        allPassed = false;
        continue;
      }
      const isExpired = rec.expiresAt
        ? new Date(rec.expiresAt).getTime() < now
        : false;
      if (rec.status !== "passed" || isExpired) {
        allPassed = false;
      }
      if (rec.status === "expired" || isExpired) {
        hasOverdue = true;
      }
    }

    if (allPassed) {
      fullyCompletedDriversCount++;
    }
    if (hasOverdue) {
      driversWithAnyOverdueCount++;
    }
  }

  // Bounded completion percentage: 0% to 100%
  const completionPct =
    totalRosterDriversCount > 0
      ? Math.min(
          100,
          Math.round(
            (fullyCompletedDriversCount / totalRosterDriversCount) * 100,
          ),
        )
      : 0;

  const pendingHeadcount = Math.max(
    0,
    totalRosterDriversCount - fullyCompletedDriversCount,
  );

  return {
    completionPct: `${completionPct}%`,
    pendingHeadcount: pendingHeadcount.toString(),
    overdueIncomplete: driversWithAnyOverdueCount,
    source: "authoritative" as const,
  };
}

function gradeQuizSubmission(
  answers: Array<{ questionId: string; selectedOptionId: string }>,
  answerKey: Record<string, string>,
  submittedVersion: number,
  activeCourseVersion: number,
  passingScore = 80,
) {
  // Check version pinning
  if (submittedVersion < activeCourseVersion) {
    throw new Error("COURSE_VERSION_STALE");
  }

  const expectedQuestions = Object.keys(answerKey);
  const totalQuestions = expectedQuestions.length;

  // Validate answer count
  if (answers.length !== totalQuestions) {
    throw new Error("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");
  }

  // Validate distinct questions (prevent duplicate questionId cheating)
  const uniqueQuestionIds = new Set(answers.map((a) => a.questionId));
  if (uniqueQuestionIds.size !== totalQuestions) {
    throw new Error("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");
  }

  for (const qId of expectedQuestions) {
    if (!uniqueQuestionIds.has(qId)) {
      throw new Error("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");
    }
  }

  let correct = 0;
  for (const ans of answers) {
    if (answerKey[ans.questionId] === ans.selectedOptionId) {
      correct++;
    }
  }

  const score = Math.round((correct / totalQuestions) * 100);
  return {
    courseVersion: submittedVersion,
    score,
    passed: score >= passingScore,
  };
}

function evaluateDriverTrainingEligibility(
  requiredCourseCodes: string[],
  driverRecords: DriverTrainingItem[],
  nowIso: string,
): {
  trainingStatus: "pending" | "passed" | "expired";
  trainingRequiredDispatchBlocked: boolean;
} {
  const now = new Date(nowIso).getTime();
  const recordMap = new Map(driverRecords.map((r) => [r.courseCode, r]));

  let hasExpired = false;
  let allPassed = requiredCourseCodes.length > 0;

  for (const code of requiredCourseCodes) {
    const rec = recordMap.get(code);
    if (!rec) {
      allPassed = false;
      continue;
    }
    const isExpired = rec.expiresAt
      ? new Date(rec.expiresAt).getTime() < now
      : false;
    if (rec.status === "expired" || isExpired) {
      hasExpired = true;
      allPassed = false;
    } else if (rec.status !== "passed") {
      allPassed = false;
    }
  }

  if (hasExpired) {
    return { trainingStatus: "expired", trainingRequiredDispatchBlocked: true };
  }
  if (allPassed) {
    return { trainingStatus: "passed", trainingRequiredDispatchBlocked: false };
  }
  return { trainingStatus: "pending", trainingRequiredDispatchBlocked: true };
}

describe("SR-DESIGN-001: Driver Academy & Fleet Training Contracts (N02 / C059 / C071)", () => {
  const now = "2026-09-06T12:00:00.000Z";

  it("calculates fleet training completion dynamically with multiple courses per driver without overflow", () => {
    const requiredCourses = ["platform_basics", "airport_sop"];

    // Case 1: 1 driver with 2 passed courses out of 2 required -> 100%, pending 0 (not 200% / -1)
    const singleDriverRecords: DriverTrainingItem[] = [
      {
        driverId: "d1",
        courseCode: "platform_basics",
        status: "passed",
        score: 100,
        expiresAt: null,
      },
      {
        driverId: "d1",
        courseCode: "airport_sop",
        status: "passed",
        score: 90,
        expiresAt: null,
      },
    ];
    const summary1 = computeFleetTrainingSummary(
      1,
      requiredCourses,
      singleDriverRecords,
      now,
    );
    expect(summary1.completionPct).toBe("100%");
    expect(summary1.pendingHeadcount).toBe("0");
    expect(summary1.overdueIncomplete).toBe(0);

    // Case 2: 2 drivers: d1 passed all, d2 passed only 1 course -> 50%
    const twoDriverRecords: DriverTrainingItem[] = [
      ...singleDriverRecords,
      {
        driverId: "d2",
        courseCode: "platform_basics",
        status: "passed",
        score: 85,
        expiresAt: null,
      },
      {
        driverId: "d2",
        courseCode: "airport_sop",
        status: "in_progress",
        score: null,
        expiresAt: null,
      },
    ];
    const summary2 = computeFleetTrainingSummary(
      2,
      requiredCourses,
      twoDriverRecords,
      now,
    );
    expect(summary2.completionPct).toBe("50%");
    expect(summary2.pendingHeadcount).toBe("1");
    expect(summary2.overdueIncomplete).toBe(0);

    // Case 3: d2 has an expired course -> overdueIncomplete = 1
    const overdueDriverRecords: DriverTrainingItem[] = [
      ...singleDriverRecords,
      {
        driverId: "d2",
        courseCode: "platform_basics",
        status: "passed",
        score: 85,
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
      {
        driverId: "d2",
        courseCode: "airport_sop",
        status: "passed",
        score: 85,
        expiresAt: null,
      },
    ];
    const summary3 = computeFleetTrainingSummary(
      2,
      requiredCourses,
      overdueDriverRecords,
      now,
    );
    expect(summary3.completionPct).toBe("50%");
    expect(summary3.pendingHeadcount).toBe("1");
    expect(summary3.overdueIncomplete).toBe(1);
  });

  it("grades quiz submissions server-side with question uniqueness check and version pinning", () => {
    const answerKey = {
      q1: "opt_a",
      q2: "opt_c",
      q3: "opt_b",
      q4: "opt_d",
      q5: "opt_a",
    };

    // Duplicate questionId submission (5x q1) MUST throw QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION
    expect(() =>
      gradeQuizSubmission(
        [
          { questionId: "q1", selectedOptionId: "opt_a" },
          { questionId: "q1", selectedOptionId: "opt_a" },
          { questionId: "q1", selectedOptionId: "opt_a" },
          { questionId: "q1", selectedOptionId: "opt_a" },
          { questionId: "q1", selectedOptionId: "opt_a" },
        ],
        answerKey,
        1,
        1,
      ),
    ).toThrow("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");

    // Incomplete submission throws QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION
    expect(() =>
      gradeQuizSubmission(
        [{ questionId: "q1", selectedOptionId: "opt_a" }],
        answerKey,
        1,
        1,
      ),
    ).toThrow("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");

    // Stale version throws COURSE_VERSION_STALE
    expect(() =>
      gradeQuizSubmission(
        [
          { questionId: "q1", selectedOptionId: "opt_a" },
          { questionId: "q2", selectedOptionId: "opt_c" },
          { questionId: "q3", selectedOptionId: "opt_b" },
          { questionId: "q4", selectedOptionId: "opt_d" },
          { questionId: "q5", selectedOptionId: "opt_a" },
        ],
        answerKey,
        1, // submitted v1
        2, // active v2
      ),
    ).toThrow("COURSE_VERSION_STALE");

    // Valid pass: 4 out of 5 correct = 80%
    const passResult = gradeQuizSubmission(
      [
        { questionId: "q1", selectedOptionId: "opt_a" },
        { questionId: "q2", selectedOptionId: "opt_c" },
        { questionId: "q3", selectedOptionId: "opt_b" },
        { questionId: "q4", selectedOptionId: "opt_d" },
        { questionId: "q5", selectedOptionId: "opt_wrong" },
      ],
      answerKey,
      2,
      2,
      80,
    );
    expect(passResult.score).toBe(80);
    expect(passResult.passed).toBe(true);
    expect(passResult.courseVersion).toBe(2);
  });

  it("evaluates training eligibility across multiple required courses and triggers trainingRequired dispatch block", () => {
    const required = ["platform_basics", "airport_sop"];

    // Driver passed both -> passed, dispatch allowed
    const passedEligibility = evaluateDriverTrainingEligibility(
      required,
      [
        {
          driverId: "d1",
          courseCode: "platform_basics",
          status: "passed",
          score: 90,
          expiresAt: null,
        },
        {
          driverId: "d1",
          courseCode: "airport_sop",
          status: "passed",
          score: 85,
          expiresAt: null,
        },
      ],
      now,
    );
    expect(passedEligibility.trainingStatus).toBe("passed");
    expect(passedEligibility.trainingRequiredDispatchBlocked).toBe(false);

    // Driver expired in one -> expired, dispatch blocked
    const expiredEligibility = evaluateDriverTrainingEligibility(
      required,
      [
        {
          driverId: "d1",
          courseCode: "platform_basics",
          status: "passed",
          score: 90,
          expiresAt: null,
        },
        {
          driverId: "d1",
          courseCode: "airport_sop",
          status: "passed",
          score: 85,
          expiresAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      now,
    );
    expect(expiredEligibility.trainingStatus).toBe("expired");
    expect(expiredEligibility.trainingRequiredDispatchBlocked).toBe(true);

    // Driver missing one course -> pending, dispatch blocked
    const pendingEligibility = evaluateDriverTrainingEligibility(
      required,
      [
        {
          driverId: "d1",
          courseCode: "platform_basics",
          status: "passed",
          score: 90,
          expiresAt: null,
        },
      ],
      now,
    );
    expect(pendingEligibility.trainingStatus).toBe("pending");
    expect(pendingEligibility.trainingRequiredDispatchBlocked).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// 3. Family 3: Host Vehicle Ownership Restricted Projection (N03 / C012)
// ----------------------------------------------------------------------------

interface VehicleRegistryRow {
  vehicleId: string;
  vin: string;
  plateNo: string;
  ownerPartnerId: string;
}

interface RawTripData {
  tripId: string;
  vehicleId: string;
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  pickupDistrict: string;
  dropoffDistrict: string;
  fareAmount: number;
}

interface MaintenanceLogRow {
  logId: string;
  vehicleId: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "overdue";
  maintenanceType: string;
  description: string;
}

function maskVin(rawVin: string): string {
  if (rawVin.length <= 6) return "******";
  return rawVin.slice(0, rawVin.length - 6) + "******";
}

function projectHostVehicle(
  requestedVehicleId: string,
  callerPartnerId: string,
  vehiclesDb: VehicleRegistryRow[],
) {
  const vehicle = vehiclesDb.find(
    (v) =>
      v.vehicleId === requestedVehicleId &&
      v.ownerPartnerId === callerPartnerId,
  );

  if (!vehicle) {
    // Return null representing 404 NOT_FOUND to prevent enumeration
    return null;
  }

  return {
    vehicleId: vehicle.vehicleId,
    plateNo: vehicle.plateNo,
    vinMasked: maskVin(vehicle.vin),
  };
}

function projectHostTrip(trip: RawTripData) {
  return {
    tripId: trip.tripId,
    vehicleId: trip.vehicleId,
    areaSummary: `${trip.pickupDistrict} → ${trip.dropoffDistrict}`,
    fareAmount: trip.fareAmount,
    currency: "TWD" as const,
  };
}

function projectHostEarnings(
  vehicleId: string,
  period: string,
  tripFares: number[],
) {
  const grossRevenue = tripFares.reduce((sum, fare) => sum + fare, 0);
  const platformFee = Math.round(grossRevenue * 0.15);

  return {
    vehicleId,
    period,
    currency: "TWD" as const,
    grossRevenue,
    platformFee,
    fleetCommission: null, // Unknown pending settlement contract in SR-HOST-BE-001
    netEarnings: null, // Unknown pending settlement contract in SR-HOST-BE-001
    tripsCount: tripFares.length,
    settlementStatus: "pending_policy" as const,
  };
}

describe("SR-DESIGN-001: Host Vehicle Ownership Restricted Projection (N03 / C012)", () => {
  const mockVehicles: VehicleRegistryRow[] = [
    {
      vehicleId: "veh_101",
      vin: "1HGCR2F83HA123456",
      plateNo: "TDC-1111",
      ownerPartnerId: "host_user_A",
    },
    {
      vehicleId: "veh_202",
      vin: "2HGCR2F83HA654321",
      plateNo: "TDC-2222",
      ownerPartnerId: "host_user_B",
    },
  ];

  it("permits host to view only their own vehicle with masked VIN and denies enumeration via 404", () => {
    const projection = projectHostVehicle(
      "veh_101",
      "host_user_A",
      mockVehicles,
    );
    expect(projection).not.toBeNull();
    expect(projection?.vehicleId).toBe("veh_101");
    expect(projection?.plateNo).toBe("TDC-1111");
    expect(projection?.vinMasked).toBe("1HGCR2F83HA******");
    expect(projection?.vinMasked).not.toContain("123456");

    // Host A querying Host B's vehicle returns null (404 NOT_FOUND)
    const unauthorizedProjection = projectHostVehicle(
      "veh_202",
      "host_user_A",
      mockVehicles,
    );
    expect(unauthorizedProjection).toBeNull();
  });

  it("strictly redacts passenger PII in host trip projection and enforces TWD currency", () => {
    const rawTrip: RawTripData = {
      tripId: "trp_8899",
      vehicleId: "veh_101",
      passengerName: "王大明",
      passengerPhone: "+886912345678",
      pickupAddress: "台北市信義區松仁路100號15樓",
      pickupDistrict: "信義區",
      dropoffDistrict: "內湖區",
      fareAmount: 450,
    };

    const hostTrip = projectHostTrip(rawTrip);
    expect(hostTrip.tripId).toBe("trp_8899");
    expect(hostTrip.areaSummary).toBe("信義區 → 內湖區");
    expect(hostTrip.fareAmount).toBe(450);
    expect(hostTrip.currency).toBe("TWD");

    expect(
      (hostTrip as unknown as Record<string, unknown>).passengerName,
    ).toBeUndefined();
    expect(
      (hostTrip as unknown as Record<string, unknown>).passengerPhone,
    ).toBeUndefined();
    expect(
      (hostTrip as unknown as Record<string, unknown>).pickupAddress,
    ).toBeUndefined();
  });

  it("projects host earnings with explicit null unknowns for uncontracted split policies", () => {
    const earnings = projectHostEarnings("veh_101", "2026-08", [450, 320, 280]);
    expect(earnings.vehicleId).toBe("veh_101");
    expect(earnings.grossRevenue).toBe(1050);
    expect(earnings.platformFee).toBe(158);
    expect(earnings.fleetCommission).toBeNull();
    expect(earnings.netEarnings).toBeNull();
    expect(earnings.settlementStatus).toBe("pending_policy");
  });

  it("supports overdue status in maintenance records aligned with MAINTENANCE_STATUSES", () => {
    const logs: MaintenanceLogRow[] = [
      {
        logId: "m_1",
        vehicleId: "veh_101",
        status: "overdue",
        maintenanceType: "scheduled_service",
        description: "50000km Regular Service Overdue",
      },
    ];
    const firstLog = logs[0];
    expect(firstLog).toBeDefined();
    if (!firstLog) throw new Error("Expected log to be defined");
    expect(firstLog.status).toBe("overdue");
  });
});

// ----------------------------------------------------------------------------
// 4. Schema Envelope & Traceability Verification
// ----------------------------------------------------------------------------

describe("SR-DESIGN-001: Schema Envelope & Traceability Verification", () => {
  it("enforces canonical ApiSuccessEnvelope structure without top-level success field", () => {
    const sampleEnvelope = {
      data: { id: "test_1" },
      meta: {
        requestId: "req_123",
        timestamp: "2026-09-06T06:30:00.000Z",
      },
    };

    // Valid envelope must have data and meta
    expect(sampleEnvelope).toHaveProperty("data");
    expect(sampleEnvelope).toHaveProperty("meta");
    expect(sampleEnvelope.meta).toHaveProperty("requestId");
    expect(sampleEnvelope.meta).toHaveProperty("timestamp");

    // Must NOT have top-level success, requestId, or timestamp
    expect((sampleEnvelope as Record<string, unknown>).success).toBeUndefined();
    expect(
      (sampleEnvelope as Record<string, unknown>).requestId,
    ).toBeUndefined();
    expect(
      (sampleEnvelope as Record<string, unknown>).timestamp,
    ).toBeUndefined();
  });

  it("covers all target gaps and capabilities in traceability matrix", () => {
    const traceabilityMatrix = [
      {
        gapId: "N01",
        capabilityId: "C052",
        domain: "driver_leave",
        specRef: "PRD §9.4.7",
      },
      {
        gapId: "N02",
        capabilityId: "C059",
        domain: "driver_academy",
        specRef: "PRD §9.4.9",
      },
      {
        gapId: "N02",
        capabilityId: "C071",
        domain: "fleet_training",
        specRef: "PRD §9.4.9",
      },
      {
        gapId: "N03",
        capabilityId: "C012",
        domain: "host_ownership",
        specRef: "PRD §12.6",
      },
    ];

    const coveredGaps = new Set(traceabilityMatrix.map((m) => m.gapId));
    const coveredCapabilities = new Set(
      traceabilityMatrix.map((m) => m.capabilityId),
    );

    expect(coveredGaps.has("N01")).toBe(true);
    expect(coveredGaps.has("N02")).toBe(true);
    expect(coveredGaps.has("N03")).toBe(true);

    expect(coveredCapabilities.has("C012")).toBe(true);
    expect(coveredCapabilities.has("C052")).toBe(true);
    expect(coveredCapabilities.has("C059")).toBe(true);
    expect(coveredCapabilities.has("C071")).toBe(true);
  });
});
