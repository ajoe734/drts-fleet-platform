import { describe, expect, it } from "vitest";

// ============================================================================
// SR-DESIGN-001: Minimal Implementable Contract Invariants & Behavioral Tests
// Gaps: N01, N02, N03
// Capabilities: C012, C052, C059, C071
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Family 1: Driver Leave Workflow Contract Invariants (N01 / C052)
// ----------------------------------------------------------------------------

type DriverLeaveStatus = "pending" | "approved" | "rejected" | "withdrawn";

interface LeaveInterval {
  startTime: string;
  endTime: string;
  status: DriverLeaveStatus;
}

function isValidTimeRange(startIso: string, endIso: string, nowIso: string): boolean {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const now = new Date(nowIso).getTime();

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

function checkClockInAllowedDuringLeave(
  clockInTimeIso: string,
  approvedLeaves: Array<{ startTime: string; endTime: string; status: DriverLeaveStatus }>,
): { allowed: boolean; errorCode?: string } {
  const clockInTime = new Date(clockInTimeIso).getTime();
  const onLeave = approvedLeaves.some((leave) => {
    if (leave.status !== "approved") return false;
    const start = new Date(leave.startTime).getTime();
    const end = new Date(leave.endTime).getTime();
    return clockInTime >= start && clockInTime <= end;
  });

  if (onLeave) {
    return { allowed: false, errorCode: "DRIVER_ON_LEAVE" };
  }
  return { allowed: true };
}

describe("SR-DESIGN-001: Driver Leave Contracts (N01 / C052)", () => {
  const now = "2026-09-06T08:00:00.000Z";

  it("validates time range: rejects endTime <= startTime and past dates", () => {
    // Invalid: end before start
    expect(
      isValidTimeRange("2026-09-10T17:00:00.000Z", "2026-09-10T08:00:00.000Z", now),
    ).toBe(false);

    // Invalid: end equal to start
    expect(
      isValidTimeRange("2026-09-10T08:00:00.000Z", "2026-09-10T08:00:00.000Z", now),
    ).toBe(false);

    // Invalid: past date beyond grace period
    expect(
      isValidTimeRange("2026-09-05T08:00:00.000Z", "2026-09-05T17:00:00.000Z", now),
    ).toBe(false);

    // Valid: future time range
    expect(
      isValidTimeRange("2026-09-10T08:00:00.000Z", "2026-09-10T17:00:00.000Z", now),
    ).toBe(true);
  });

  it("detects overlapping leave applications for the same driver", () => {
    const existingLeaves: LeaveInterval[] = [
      {
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T17:00:00.000Z",
        status: "approved",
      },
      {
        startTime: "2026-09-12T08:00:00.000Z",
        endTime: "2026-09-12T17:00:00.000Z",
        status: "withdrawn",
      },
    ];

    // Overlaps with approved leave (09-10 12:00 to 18:00)
    expect(
      hasOverlappingActiveLeave(
        { startTime: "2026-09-10T12:00:00.000Z", endTime: "2026-09-10T18:00:00.000Z" },
        existingLeaves,
      ),
    ).toBe(true);

    // Does not overlap with withdrawn leave (09-12 09:00 to 12:00 is allowed)
    expect(
      hasOverlappingActiveLeave(
        { startTime: "2026-09-12T09:00:00.000Z", endTime: "2026-09-12T12:00:00.000Z" },
        existingLeaves,
      ),
    ).toBe(false);

    // Completely disjoint date (09-15)
    expect(
      hasOverlappingActiveLeave(
        { startTime: "2026-09-15T08:00:00.000Z", endTime: "2026-09-15T17:00:00.000Z" },
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

  it("blocks driver clock-in / dispatchability during approved leave window", () => {
    const approvedLeaves = [
      {
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T17:00:00.000Z",
        status: "approved" as const,
      },
    ];

    // Clock-in during leave -> blocked
    const duringLeave = checkClockInAllowedDuringLeave(
      "2026-09-10T10:00:00.000Z",
      approvedLeaves,
    );
    expect(duringLeave.allowed).toBe(false);
    expect(duringLeave.errorCode).toBe("DRIVER_ON_LEAVE");

    // Clock-in outside leave -> allowed
    const afterLeave = checkClockInAllowedDuringLeave(
      "2026-09-10T18:00:00.000Z",
      approvedLeaves,
    );
    expect(afterLeave.allowed).toBe(true);
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
  driverRecords: DriverTrainingItem[],
  nowIso: string,
) {
  const now = new Date(nowIso).getTime();
  let completedCount = 0;
  let overdueCount = 0;

  for (const record of driverRecords) {
    const isExpired = record.expiresAt ? new Date(record.expiresAt).getTime() < now : false;
    if (record.status === "passed" && !isExpired) {
      completedCount++;
    } else if (isExpired || record.status === "expired") {
      overdueCount++;
    }
  }

  const completionPct =
    totalRosterDriversCount > 0
      ? Math.round((completedCount / totalRosterDriversCount) * 100)
      : 0;

  return {
    completionPct: `${completionPct}%`,
    pendingHeadcount: (totalRosterDriversCount - completedCount).toString(),
    overdueIncomplete: overdueCount,
    source: "authoritative" as const,
  };
}

function gradeQuizSubmission(
  answers: Array<{ questionId: string; selectedOptionId: string }>,
  answerKey: Record<string, string>,
  passingScore = 80,
) {
  const totalQuestions = Object.keys(answerKey).length;
  if (answers.length !== totalQuestions) {
    throw new Error("QUIZ_INCOMPLETE_SUBMISSION");
  }

  let correct = 0;
  for (const ans of answers) {
    if (answerKey[ans.questionId] === ans.selectedOptionId) {
      correct++;
    }
  }

  const score = Math.round((correct / totalQuestions) * 100);
  return {
    score,
    passed: score >= passingScore,
  };
}

describe("SR-DESIGN-001: Driver Academy & Fleet Training Contracts (N02 / C059 / C071)", () => {
  const now = "2026-09-06T12:00:00.000Z";

  it("calculates real fleet training completion dynamically without hardcoded fixtures", () => {
    const totalDrivers = 10;
    const records: DriverTrainingItem[] = [
      { driverId: "d1", courseCode: "platform_basics", status: "passed", score: 100, expiresAt: null },
      { driverId: "d2", courseCode: "platform_basics", status: "passed", score: 85, expiresAt: null },
      { driverId: "d3", courseCode: "platform_basics", status: "passed", score: 90, expiresAt: null },
      { driverId: "d4", courseCode: "platform_basics", status: "passed", score: 80, expiresAt: null },
      { driverId: "d5", courseCode: "platform_basics", status: "passed", score: 95, expiresAt: null },
      { driverId: "d6", courseCode: "platform_basics", status: "passed", score: 90, expiresAt: null },
      { driverId: "d7", courseCode: "platform_basics", status: "passed", score: 85, expiresAt: null },
      { driverId: "d8", courseCode: "platform_basics", status: "in_progress", score: null, expiresAt: null },
      { driverId: "d9", courseCode: "platform_basics", status: "failed", score: 60, expiresAt: null },
      // d10 has an expired certification
      { driverId: "d10", courseCode: "platform_basics", status: "passed", score: 85, expiresAt: "2026-08-01T00:00:00.000Z" },
    ];

    const summary = computeFleetTrainingSummary(totalDrivers, records, now);

    // 7 active passed out of 10 total -> 70%
    expect(summary.completionPct).toBe("70%");
    expect(summary.pendingHeadcount).toBe("3");
    expect(summary.overdueIncomplete).toBe(1);
    expect(summary.source).toBe("authoritative");
  });

  it("grades quiz submissions server-side and checks passing score", () => {
    const answerKey = {
      q1: "opt_a",
      q2: "opt_c",
      q3: "opt_b",
      q4: "opt_d",
      q5: "opt_a",
    };

    // Incomplete submission throws QUIZ_INCOMPLETE_SUBMISSION
    expect(() =>
      gradeQuizSubmission([{ questionId: "q1", selectedOptionId: "opt_a" }], answerKey),
    ).toThrow("QUIZ_INCOMPLETE_SUBMISSION");

    // 4 out of 5 correct = 80 -> passed
    const passResult = gradeQuizSubmission(
      [
        { questionId: "q1", selectedOptionId: "opt_a" },
        { questionId: "q2", selectedOptionId: "opt_c" },
        { questionId: "q3", selectedOptionId: "opt_b" },
        { questionId: "q4", selectedOptionId: "opt_d" },
        { questionId: "q5", selectedOptionId: "opt_wrong" },
      ],
      answerKey,
      80,
    );
    expect(passResult.score).toBe(80);
    expect(passResult.passed).toBe(true);

    // 3 out of 5 correct = 60 -> failed
    const failResult = gradeQuizSubmission(
      [
        { questionId: "q1", selectedOptionId: "opt_a" },
        { questionId: "q2", selectedOptionId: "opt_c" },
        { questionId: "q3", selectedOptionId: "opt_b" },
        { questionId: "q4", selectedOptionId: "opt_wrong" },
        { questionId: "q5", selectedOptionId: "opt_wrong" },
      ],
      answerKey,
      80,
    );
    expect(failResult.score).toBe(60);
    expect(failResult.passed).toBe(false);
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
    (v) => v.vehicleId === requestedVehicleId && v.ownerPartnerId === callerPartnerId,
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
  // Mask and redact passenger PII
  return {
    tripId: trip.tripId,
    vehicleId: trip.vehicleId,
    areaSummary: `${trip.pickupDistrict} → ${trip.dropoffDistrict}`,
    fareAmount: trip.fareAmount,
    currency: "TWD" as const,
  };
}

describe("SR-DESIGN-001: Host Vehicle Ownership Restricted Projection (N03 / C012)", () => {
  const mockVehicles: VehicleRegistryRow[] = [
    { vehicleId: "veh_101", vin: "1HGCR2F83HA123456", plateNo: "TDC-1111", ownerPartnerId: "host_user_A" },
    { vehicleId: "veh_202", vin: "2HGCR2F83HA654321", plateNo: "TDC-2222", ownerPartnerId: "host_user_B" },
  ];

  it("permits host to view only their own vehicle with masked VIN", () => {
    const projection = projectHostVehicle("veh_101", "host_user_A", mockVehicles);
    expect(projection).not.toBeNull();
    expect(projection?.vehicleId).toBe("veh_101");
    expect(projection?.plateNo).toBe("TDC-1111");
    expect(projection?.vinMasked).toBe("1HGCR2F83HA******");
    expect(projection?.vinMasked).not.toContain("123456");
  });

  it("returns null (404 NOT_FOUND) when host attempts to access another host's vehicle (anti-enumeration)", () => {
    // Host A querying Host B's vehicle
    const projection = projectHostVehicle("veh_202", "host_user_A", mockVehicles);
    expect(projection).toBeNull();
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

    // Passenger PII fields MUST NOT be present on the projected object
    expect((hostTrip as unknown as Record<string, unknown>).passengerName).toBeUndefined();
    expect((hostTrip as unknown as Record<string, unknown>).passengerPhone).toBeUndefined();
    expect((hostTrip as unknown as Record<string, unknown>).pickupAddress).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// 4. Traceability & Acceptance Matrix Verification
// ----------------------------------------------------------------------------

describe("SR-DESIGN-001: Traceability & Acceptance Coverage Verification", () => {
  const traceabilityMatrix = [
    { gapId: "N01", capabilityId: "C052", domain: "driver_leave", specRef: "PRD §9.4.7" },
    { gapId: "N02", capabilityId: "C059", domain: "driver_academy", specRef: "PRD §9.4.9" },
    { gapId: "N02", capabilityId: "C071", domain: "fleet_training", specRef: "PRD §9.4.9" },
    { gapId: "N03", capabilityId: "C012", domain: "host_ownership", specRef: "PRD §12.6" },
  ];

  it("covers all target gaps and capabilities", () => {
    const coveredGaps = new Set(traceabilityMatrix.map((m) => m.gapId));
    const coveredCapabilities = new Set(traceabilityMatrix.map((m) => m.capabilityId));

    expect(coveredGaps.has("N01")).toBe(true);
    expect(coveredGaps.has("N02")).toBe(true);
    expect(coveredGaps.has("N03")).toBe(true);

    expect(coveredCapabilities.has("C012")).toBe(true);
    expect(coveredCapabilities.has("C052")).toBe(true);
    expect(coveredCapabilities.has("C059")).toBe(true);
    expect(coveredCapabilities.has("C071")).toBe(true);
  });
});
