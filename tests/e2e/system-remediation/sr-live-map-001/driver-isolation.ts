import { DRIVER_WORK_STATES, type DriverWorkState } from "@drts/contracts";

export type DriverIsolationEvidence = {
  driver_id: string;
  status: "passed" | "failed";
  registry_shape: "data.items" | "invalid";
  found: boolean;
  work_state: DriverWorkState | "missing" | "invalid";
  dispatch_eligible: boolean | "missing" | "invalid";
  failures: string[];
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// Accept the normalized product envelope. Only the reserved ID, known work
// states and booleans enter evidence; never copy names, other drivers or an
// arbitrary server value into artifacts/logs.
export function inspectMapDriverIsolation(
  registry: unknown,
  driverId: string,
): DriverIsolationEvidence {
  const evidence: DriverIsolationEvidence = {
    driver_id: driverId,
    status: "failed",
    registry_shape: "invalid",
    found: false,
    work_state: "missing",
    dispatch_eligible: "missing",
    failures: [],
  };
  const items = record(record(registry)?.data)?.items;
  if (!Array.isArray(items)) {
    evidence.failures.push("registry_shape_invalid");
    return evidence;
  }
  evidence.registry_shape = "data.items";
  const matches = items.filter((item) => record(item)?.driverId === driverId);
  evidence.found = matches.length > 0;
  if (matches.length !== 1) {
    evidence.failures.push(
      matches.length ? "driver_duplicate" : "driver_missing",
    );
    return evidence;
  }
  const driver = record(matches[0])!;
  const workState = driver.workState;
  evidence.work_state =
    workState === undefined
      ? "missing"
      : DRIVER_WORK_STATES.includes(workState as DriverWorkState)
        ? (workState as DriverWorkState)
        : "invalid";
  if (evidence.work_state !== "offline") {
    evidence.failures.push(
      evidence.work_state === "missing" || evidence.work_state === "invalid"
        ? `work_state_${evidence.work_state}`
        : "work_state_not_offline",
    );
  }
  const eligible = driver.dispatchEligible;
  evidence.dispatch_eligible =
    eligible === undefined
      ? "missing"
      : typeof eligible === "boolean"
        ? eligible
        : "invalid";
  if (evidence.dispatch_eligible !== false) {
    evidence.failures.push(
      evidence.dispatch_eligible === true
        ? "dispatch_eligible"
        : `dispatch_eligible_${evidence.dispatch_eligible}`,
    );
  }
  if (evidence.failures.length === 0) evidence.status = "passed";
  return evidence;
}

export class DriverIsolationError extends Error {
  constructor(evidence: DriverIsolationEvidence) {
    super(
      `Driver isolation failed: ${evidence.failures.join(",")}; workState=${evidence.work_state}; dispatchEligible=${evidence.dispatch_eligible}`,
    );
  }
}

export function assertMapDriverIsolation(evidence: DriverIsolationEvidence) {
  if (evidence.status !== "passed") throw new DriverIsolationError(evidence);
}
