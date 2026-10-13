import { describe, expect, it } from "vitest";

import { fixture, flush, observe } from "./fixture";

const storageId = "drv-demo-001";
const adminIds = [
  "driver-demo-001",
  "demo-driver",
  " e2e-driver-driver-demo-001 ",
  storageId,
];
const binding = {
  bindingId: "binding-alias-fixture",
  deviceId: "device-alias-fixture",
  deviceLabel: "Alias Fixture",
  status: "active" as const,
  issuedAt: "2026-10-13T15:00:00.000Z",
  refreshedAt: "2026-10-13T15:00:00.000Z",
  revokedAt: null,
};

describe("R1 admin and canonical writers share the resolved storage ID", () => {
  describe.each(adminIds)("admin ID %s", (adminId) => {
    it.each(["commit", "reject"] as const)(
      "queues canonical patch after admin %s and retains only acknowledged fields",
      async (outcome) => {
        const f = fixture();
        const before = f.service.getProfile(storageId);
        const admin = observe(
          f.service.upsertAdminProfile(adminId, {
            name: "Admin alias saved",
            driverSurname: "Alias Surname",
          }),
        );
        const patch = observe(
          f.service.updateProfile(storageId, { phone: "new-phone" }),
        );
        await flush();
        const pendingCount = f.writes.length;
        expect(admin.state.status).toBe("pending");
        expect(patch.state.status).toBe("pending");
        expect(f.writes[0]!.record.driverId).toBe(storageId);
        const error = new Error("Admin alias query rejected");
        if (outcome === "commit") f.writes[0]!.commit();
        else f.writes[0]!.reject(error);
        await admin.settled;
        await flush();
        expect(f.writes).toHaveLength(2);
        const next = f.writes[1]!.record;
        f.writes[1]!.commit();
        await patch.settled;
        expect(next).toMatchObject({
          driverId: storageId,
          name: outcome === "commit" ? "Admin alias saved" : before.name,
          phone: "new-phone",
        });
        expect(Object.hasOwn(next, "driverSurname")).toBe(outcome === "commit");
        expect(next.driverSurname).toBe(
          outcome === "commit" ? "Alias Surname" : undefined,
        );
        expect(pendingCount).toBe(1);
        expect(f.service.getProfile(storageId)).toEqual(next);
        expect((await f.reload()).getProfile(storageId)).toEqual(next);
        expect(patch.state.status).toBe("fulfilled");
        if (outcome === "commit") {
          expect(admin.state.value).toMatchObject({
            driverId: storageId,
            name: "Admin alias saved",
            driverSurname: "Alias Surname",
          });
          // Keep the existing admin audit identity/action policy for aliases.
          expect(f.auditWrites.mock.calls[0]![0]).toMatchObject({
            actorId: "platform-admin",
            resourceId: adminId.trim(),
            actionName:
              adminId === storageId
                ? "update_driver_profile_admin"
                : "create_driver_profile_admin",
          });
          expect(f.auditWrites).toHaveBeenCalledTimes(2);
        } else {
          expect(admin.state.error).toBe(error);
          expect(f.report).toHaveBeenCalledWith(error, "upsert_admin_profile");
          expect(f.auditWrites).toHaveBeenCalledTimes(1);
        }
      },
    );

    it.each(["commit", "reject"] as const)(
      "queues canonical device persistence after admin %s without reverting saved fields",
      async (outcome) => {
        const f = fixture();
        const admin = observe(
          f.service.upsertAdminProfile(adminId, {
            name: "Admin alias saved",
            driverSurname: "Alias Surname",
          }),
        );
        await flush();
        f.service.recordDeviceBinding(storageId, binding);
        await flush();
        const pendingCount = f.writes.length;
        const error = new Error("Admin rejected beside device");
        if (outcome === "commit") f.writes[0]!.commit();
        else f.writes[0]!.reject(error);
        await admin.settled;
        await flush();
        expect(f.writes).toHaveLength(2);
        const next = f.writes[1]!.record;
        f.writes[1]!.commit();
        await flush();
        expect(next).toMatchObject({
          driverId: storageId,
          name: outcome === "commit" ? "Admin alias saved" : "Driver Demo One",
          deviceBindings: [binding],
        });
        expect(Object.hasOwn(next, "driverSurname")).toBe(outcome === "commit");
        expect(next.driverSurname).toBe(
          outcome === "commit" ? "Alias Surname" : undefined,
        );
        expect(pendingCount).toBe(1);
        expect((await f.reload()).getProfile(storageId)).toEqual(
          f.service.getProfile(storageId),
        );
        if (outcome === "reject") expect(admin.state.error).toBe(error);
      },
    );
  });

  it.each(["commit", "reject"] as const)(
    "actual registry controller alias caller serializes canonical patch after %s",
    async (outcome) => {
      const f = fixture();
      const before = f.registry.listDrivers();
      const admin = observe(
        f.registryController.createDriver({
          driverId: "driver-demo-001",
          name: "Registry alias saved",
        }),
      );
      const patch = observe(
        f.service.updateProfile(storageId, { phone: "new-phone" }),
      );
      await flush();
      const pendingCount = f.writes.length;
      expect(f.registry.listDrivers()).toEqual(before);
      expect(admin.state.status).toBe("pending");
      const error = new Error("Registry alias rejected");
      if (outcome === "commit") f.writes[0]!.commit();
      else f.writes[0]!.reject(error);
      await admin.settled;
      await flush();
      f.writes[1]!.commit();
      await patch.settled;
      expect(f.writes[1]!.record).toMatchObject({
        driverId: storageId,
        name: outcome === "commit" ? "Registry alias saved" : "Driver Demo One",
        phone: "new-phone",
      });
      expect(pendingCount).toBe(1);
      expect((await f.reload()).getProfile(storageId)).toEqual(
        f.service.getProfile(storageId),
      );
      if (outcome === "commit") {
        expect(admin.state.value).toMatchObject({
          data: { driverId: "driver-demo-001", name: "Registry alias saved" },
        });
      } else {
        expect(admin.state.error).toBe(error);
        expect(f.registry.listDrivers()).toEqual(before);
      }
    },
  );

  it.each([" ", "e2e-driver-"])(
    "retains identity rejection for %s without query or publication",
    async (adminId) => {
      const f = fixture();
      await expect(
        f.service.upsertAdminProfile(adminId, { name: "Invalid identity" }),
      ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_REQUIRED" });
      expect(f.query).not.toHaveBeenCalled();
      expect(f.auditWrites).not.toHaveBeenCalled();
    },
  );
});
