import { describe, it, expect } from "vitest";
import { DriverLeaveRepository } from "../../../../apps/api/src/modules/driver-leave/driver-leave.repository";
import { DriverLeaveService } from "../../../../apps/api/src/modules/driver-leave/driver-leave.service";
const now = new Date("2026-09-10T10:00:00Z");
const request = { leaveType: "personal" as const, startTime: "2026-09-10T12:00:00Z", endTime: "2026-09-10T15:00:00Z", reason: "overlap acceptance" };
describe("Independent concurrent leave creation invariant", () => {
 it("accepts only one of two concurrent overlapping requests for the same driver", async () => {
  const repository = new DriverLeaveRepository();
  const first = new DriverLeaveService(repository);
  const second = new DriverLeaveService(repository);
  const outcomes = await Promise.allSettled([
   first.createLeave("drv_overlap_probe", request, now),
   second.createLeave("drv_overlap_probe", {...request, startTime: "2026-09-10T13:00:00Z"}, now),
  ]);
  expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(o => o.status === "rejected")).toHaveLength(1);
  const persisted = await repository.findByDriver("drv_overlap_probe");
  expect(persisted).toHaveLength(1);
 });
});
