import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { fixture, flush, identity, invoke, observe } from "./fixture";

const binding = {
  bindingId: "binding-ack-fixture",
  deviceId: "device-ack-fixture",
  deviceLabel: "Fixture",
  status: "active" as const,
  issuedAt: "2026-10-13T14:00:00.000Z",
  refreshedAt: "2026-10-13T14:00:00.000Z",
  revokedAt: null,
};

describe("configured storage and existing committed state", () => {
  describe.each(["create", "update", "admin"] as const)("%s", (operation) => {
    it.each(["missing", "disabled"] as const)(
      "rejects %s storage instead of fake durable ACK",
      async (kind) => {
        const f = fixture();
        f.disable();
        const service =
          kind === "missing" ? new DriverProfileService(f.audit) : f.service;
        const command = {
          name: "Unavailable Fixture",
          driverSurname: "Unavailable Surname",
        };
        const result =
          operation === "create"
            ? service.createProfile(identity.actorId, command)
            : operation === "update"
              ? service.updateProfile(identity.actorId, command)
              : service.upsertAdminProfile(identity.actorId, command);
        await expect(result).rejects.toMatchObject({
          code: "DRIVER_PROFILE_STORAGE_UNAVAILABLE",
        });
        await result.catch((error) => expect(error.getStatus()).toBe(503));
        expect(service.findProfileForDriver(identity.actorId)).toBeNull();
        expect(f.query).not.toHaveBeenCalled();
        expect(f.auditWrites).not.toHaveBeenCalled();
      },
    );
  });

  describe.each(["update", "admin"] as const)(
    "%s committed-state retention",
    (operation) => {
      it.each([true, false])(
        "retains prior fields and own-property surname presence=%s on rejection, then allows retry",
        async (hasSurname) => {
          const f = fixture();
          const created = observe(
            f.service.createProfile(identity.actorId, {
              name: "Before Fixture",
              phone: "old-phone",
              email: "old@example.invalid",
              ...(hasSurname ? { driverSurname: "Retained Fixture" } : {}),
              emergencyContact: {
                name: "Contact Fixture",
                phone: "contact-phone",
                relationship: "fixture",
              },
              bankAccount: {
                bankName: "Fixture",
                accountName: "Account Fixture",
                accountNumberMasked: "****1234",
              },
            }),
          );
          await flush();
          f.writes[0]!.commit();
          await created.settled;
          const before = f.service.getProfile(identity.actorId);
          const jsonBefore = f.records.get(identity.actorId);
          const failed = observe(invoke(f, operation));
          await flush();
          expect(failed.state.status).toBe("pending");
          expect(f.service.getProfile(identity.actorId)).toEqual(before);
          expect(f.auditWrites).toHaveBeenCalledTimes(1);
          const error = new Error("Rejected after previous commit");
          f.writes[1]!.reject(error);
          await failed.settled;
          expect(failed.state.error).toBe(error);
          expect(f.service.getProfile(identity.actorId)).toEqual(before);
          expect(f.records.get(identity.actorId)).toBe(jsonBefore);
          expect((await f.reload()).getProfile(identity.actorId)).toEqual(
            before,
          );
          expect(Object.hasOwn(before, "driverSurname")).toBe(hasSurname);
          expect(f.auditWrites).toHaveBeenCalledTimes(1);
          f.autoCommit();
          const retried = await f.service.updateProfile(identity.actorId, {
            phone: "retry-phone",
          });
          expect(retried.name).toBe(before.name);
          expect(retried.phone).toBe("retry-phone");
          expect(Object.hasOwn(retried, "driverSurname")).toBe(hasSurname);
          expect(retried.driverSurname).toBe(before.driverSurname);
          retried.name = "Changed returned clone";
          expect((await f.reload()).getProfile(identity.actorId)).toEqual(
            f.service.getProfile(identity.actorId),
          );
          expect(f.auditWrites).toHaveBeenCalledTimes(2);
        },
      );
    },
  );

  it("disabled storage rejects actual Profile and registry controller callers", async () => {
    const f = fixture();
    f.disable();
    await expect(invoke(f, "create")).rejects.toMatchObject({
      code: "DRIVER_PROFILE_STORAGE_UNAVAILABLE",
    });
    await expect(invoke(f, "update")).rejects.toMatchObject({
      code: "DRIVER_PROFILE_STORAGE_UNAVAILABLE",
    });
    await expect(
      f.registryController.createDriver({
        driverId: identity.actorId,
        name: "Fixture",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_PROFILE_STORAGE_UNAVAILABLE" });
    expect(
      f.registry.listDrivers().some((d) => d.driverId === identity.actorId),
    ).toBe(false);
    expect(f.auditWrites).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });
});

describe("actual registry admin-profile caller", () => {
  it.each(["commit", "reject"] as const)(
    "waits for admin profile %s before master publication and response",
    async (outcome) => {
      const f = fixture();
      const beforeDrivers = f.registry.listDrivers();
      const result = observe(
        f.registryController.createDriver(
          {
            driverId: identity.actorId,
            name: "Registry Fixture",
            phone: "123",
            email: "fixture@example.invalid",
          },
          "req-registry",
        ),
      );
      await flush();
      expect(f.writes).toHaveLength(1);
      expect(result.state.status).toBe("pending");
      expect(f.registry.listDrivers()).toEqual(beforeDrivers);
      expect(f.service.findProfileForDriver(identity.actorId)).toBeNull();
      expect(f.auditWrites).not.toHaveBeenCalled();
      const error = new Error("Registry profile query rejected");
      if (outcome === "commit") f.writes[0]!.commit();
      else f.writes[0]!.reject(error);
      await result.settled;
      if (outcome === "reject") {
        expect(result.state.error).toBe(error);
        expect(result.state.status).toBe("rejected");
        expect(f.registry.listDrivers()).toEqual(beforeDrivers);
        expect(f.service.findProfileForDriver(identity.actorId)).toBeNull();
        expect(f.auditWrites).not.toHaveBeenCalled();
      } else {
        expect(result.state.status).toBe("fulfilled");
        expect(result.state.value).toMatchObject({
          data: {
            driverId: identity.actorId,
            name: "Registry Fixture",
            profileUpdatedAt: f.writes[0]!.record.updatedAt,
          },
          meta: { requestId: "req-registry" },
        });
        expect(
          f.registry.listDrivers().some((d) => d.driverId === identity.actorId),
        ).toBe(true);
        expect((await f.reload()).getProfile(identity.actorId)).toMatchObject({
          name: "Registry Fixture",
          phone: "123",
          email: "fixture@example.invalid",
        });
        expect(f.auditWrites).toHaveBeenCalledTimes(2);
      }
    },
  );
});

describe("bounded per-driver whole-record write coordination", () => {
  it("stages queued patches from the last commit, isolates drivers, and recovers after rejection", async () => {
    const f = fixture();
    const first = observe(
      f.service.updateProfile(identity.actorId, {
        name: "First Fixture",
        driverSurname: "First Surname",
      }),
    );
    const second = observe(
      f.service.updateProfile(identity.actorId, { phone: "second-phone" }),
    );
    const third = observe(
      f.service.updateProfile(identity.actorId, {
        email: "third@example.invalid",
      }),
    );
    const other = observe(
      f.service.createProfile("drv-other-fixture", { name: "Other Fixture" }),
    );
    await flush();
    expect(f.writes).toHaveLength(2);
    f.writes[1]!.commit();
    await other.settled;
    expect(first.state.status).toBe("pending");
    expect(second.state.status).toBe("pending");
    f.writes[0]!.commit();
    await first.settled;
    await flush();
    expect(f.writes).toHaveLength(3);
    expect(f.writes[2]!.record).toMatchObject({
      name: "First Fixture",
      driverSurname: "First Surname",
      phone: "second-phone",
    });
    const error = new Error("Second patch rejected");
    f.writes[2]!.reject(error);
    await second.settled;
    await flush();
    expect(f.writes[3]!.record).toMatchObject({
      name: "First Fixture",
      driverSurname: "First Surname",
      phone: null,
      email: "third@example.invalid",
    });
    f.writes[3]!.commit();
    await third.settled;
    expect(second.state.error).toBe(error);
    expect(f.auditWrites).toHaveBeenCalledTimes(3);
    expect((await f.reload()).getProfile(identity.actorId)).toEqual(
      f.service.getProfile(identity.actorId),
    );
  });

  it("checks duplicate create after the earlier pending create commits", async () => {
    const f = fixture();
    const first = observe(
      f.service.createProfile(identity.actorId, { name: "First" }),
    );
    const duplicate = observe(
      f.service.createProfile(identity.actorId, { name: "Duplicate" }),
    );
    await flush();
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.commit();
    await first.settled;
    await duplicate.settled;
    expect(duplicate.state.error).toMatchObject({
      code: "DRIVER_PROFILE_EXISTS",
    });
    expect(f.writes).toHaveLength(1);
    expect(f.service.getProfile(identity.actorId).name).toBe("First");
    expect(f.auditWrites).toHaveBeenCalledTimes(1);
  });

  it.each(["commit", "reject"] as const)(
    "preserves device link/refresh/revoke during a pending profile %s without reverting acknowledged fields",
    async (outcome) => {
      const f = fixture();
      const result = observe(
        f.service.updateProfile("drv-demo-001", {
          name: "Saved Fixture",
          driverSurname: "Saved Surname",
        }),
      );
      await flush();
      f.service.recordDeviceBinding("drv-demo-001", binding);
      f.service.recordDeviceBindingRefresh(
        "drv-demo-001",
        binding.bindingId,
        "2026-10-13T14:01:00.000Z",
      );
      f.service.recordDeviceBindingRevocation(
        "drv-demo-001",
        binding.bindingId,
        "2026-10-13T14:02:00.000Z",
      );
      expect(f.writes).toHaveLength(1);
      expect(f.service.getProfile("drv-demo-001").name).toBe("Driver Demo One");
      const error = new Error("Failed profile alongside device changes");
      if (outcome === "commit") f.writes[0]!.commit();
      else f.writes[0]!.reject(error);
      await result.settled;
      for (let i = 1; i <= 3; i++) {
        await flush();
        expect(f.writes).toHaveLength(i + 1);
        expect(f.writes[i]!.record.name).toBe(
          outcome === "commit" ? "Saved Fixture" : "Driver Demo One",
        );
        expect(Object.hasOwn(f.writes[i]!.record, "driverSurname")).toBe(
          outcome === "commit",
        );
        f.writes[i]!.commit();
      }
      await flush();
      const profile = f.service.getProfile("drv-demo-001");
      expect(profile.deviceBindings).toEqual([
        {
          ...binding,
          status: "revoked",
          refreshedAt: "2026-10-13T14:02:00.000Z",
          revokedAt: "2026-10-13T14:02:00.000Z",
        },
      ]);
      expect(profile.name).toBe(
        outcome === "commit" ? "Saved Fixture" : "Driver Demo One",
      );
      expect(profile.driverSurname).toBe(
        outcome === "commit" ? "Saved Surname" : undefined,
      );
      expect((await f.reload()).getProfile("drv-demo-001")).toEqual(profile);
      expect(
        f.auditWrites.mock.calls.filter(
          ([log]) => log.actionName === "update_driver_profile",
        ),
      ).toHaveLength(outcome === "commit" ? 1 : 0);
      if (outcome === "reject") expect(result.state.error).toBe(error);
    },
  );

  it("a device query failure ahead of a profile save is reported and does not poison the profile queue", async () => {
    const f = fixture();
    f.service.recordDeviceBinding("drv-demo-001", binding);
    const saved = observe(
      f.service.updateProfile("drv-demo-001", {
        driverSurname: "After Device Fixture",
      }),
    );
    await flush();
    expect(f.writes).toHaveLength(1);
    expect(saved.state.status).toBe("pending");
    const error = new Error("Inherited device query rejected");
    f.writes[0]!.reject(error);
    await flush();
    expect(f.report).toHaveBeenCalledWith(error, "record_device_binding");
    expect(f.writes[1]!.record.deviceBindings).toEqual([binding]);
    f.writes[1]!.commit();
    await saved.settled;
    expect(saved.state.status).toBe("fulfilled");
    expect((await f.reload()).getProfile("drv-demo-001")).toMatchObject({
      driverSurname: "After Device Fixture",
      deviceBindings: [binding],
    });
  });
});
