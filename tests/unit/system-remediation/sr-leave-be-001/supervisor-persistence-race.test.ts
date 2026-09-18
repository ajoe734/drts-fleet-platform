import { describe, it, expect } from "vitest";
import { DriverLeaveRepository } from "../../../../apps/api/src/modules/driver-leave/driver-leave.repository";
import { DriverLeaveService } from "../../../../apps/api/src/modules/driver-leave/driver-leave.service";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
const now = new Date("2026-09-10T10:00:00.000Z");
const request = { leaveType: "personal" as const, startTime: "2026-09-10T12:00:00.000Z", endTime: "2026-09-10T15:00:00.000Z", reason: "acceptance" };
describe("Supervisor independent leave persistence invariants", () => {
 it("does not acknowledge a successful save when enabled database rejects the write", async () => {
  const db = { isEnabled: () => true, query: async () => { throw new Error("injected database write failure"); } } as unknown as DatabaseService;
  const repo = new DriverLeaveRepository(db);
  const record = { leaveId: "lv_review_probe", driverId: "drv_review_probe", ...request, status: "pending" as const, reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null, impactedShiftIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
  await expect(repo.save(record)).rejects.toThrow("injected database write failure");
 });
 it("permits exactly one conflicting pending transition when approval and withdrawal overlap", async () => {
  const repo = new DriverLeaveRepository();
  const service = new DriverLeaveService(repo);
  // Seed an existing pending record directly, so this probe isolates transition concurrency.
  const record = { leaveId: "lv_race_probe", driverId: "drv_race_probe", ...request, status: "pending" as const, reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null, impactedShiftIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
  await repo.save(record);
  const results = await Promise.allSettled([
   service.reviewLeave(record.leaveId, "ops_probe", { decision: "approve" }, now),
   service.withdrawLeave(record.leaveId, record.driverId, undefined, now),
  ]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
 });
});
