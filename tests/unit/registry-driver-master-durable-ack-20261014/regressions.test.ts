import { describe, expect, it } from "vitest";
import {
  actionNames,
  driverId,
  fixture,
  flush,
  invoke,
  observe,
  operations,
  read,
} from "./fixture";

describe.each(operations)("%s storage guards", (operation) => {
  it.each(["missing", "disabled"] as const)(
    "rejects %s registry storage without durable ACK",
    async (storage) => {
      const f = fixture(storage === "missing" ? "missing" : "enabled");
      if (storage === "disabled") f.disable();
      const before = read(f, operation);
      await expect(invoke(f, operation)).rejects.toMatchObject({
        status: 503,
        code: "DRIVER_MASTER_STORAGE_UNAVAILABLE",
      });
      expect(f.writes).toHaveLength(0);
      expect(read(f, operation)).toEqual(before);
      expect(
        f.auditWrites.mock.calls.filter(
          ([log]) => log.actionName === actionNames[operation],
        ),
      ).toHaveLength(0);
      expect(f.profiles.has(driverId(operation))).toBe(operation === "create");
    },
  );
});

describe("precise named-command serialization and publication", () => {
  const permutations = [
    ["buckets", "lifecycle", "licenses"],
    ["buckets", "licenses", "lifecycle"],
    ["lifecycle", "buckets", "licenses"],
    ["lifecycle", "licenses", "buckets"],
    ["licenses", "buckets", "lifecycle"],
    ["licenses", "lifecycle", "buckets"],
  ] as const;
  it.each(permutations)(
    "preserves ACKed fields in %s / %s / %s order",
    async (...order) => {
      const f = fixture();
      const before = read(f, "lifecycle");
      const calls = order.map((operation) => observe(invoke(f, operation)));
      await flush();
      expect(f.writes).toHaveLength(1);
      expect(read(f, "lifecycle")).toEqual(before);
      for (let i = 0; i < order.length; i++) {
        expect(calls[i].state.status).toBe("pending");
        f.writes[i].commit();
        await calls[i].settled;
        await flush();
        expect(calls[i].state.status).toBe("fulfilled");
        expect(read(f, "lifecycle")).toEqual(f.writes[i].record);
        expect(f.writes).toHaveLength(Math.min(i + 2, order.length));
      }
      expect(read(f, "lifecycle")).toMatchObject({
        supportedServiceBuckets: ["business_dispatch"],
        lifecycleStatus: "suspended",
        licensesValid: false,
      });
      const fresh = await f.reload();
      expect(
        fresh
          .listDrivers()
          .find((driver) => driver.driverId === driverId("lifecycle")),
      ).toEqual(read(f, "lifecycle"));
      expect(
        f.auditWrites.mock.calls
          .filter(([log]) => log.resourceType === "driver_master")
          .map(([log]) => log.actionName),
      ).toEqual(order.map((operation) => actionNames[operation]));
    },
  );

  it("continues a queued command from committed state after a failed command", async () => {
    const f = fixture();
    const before = read(f, "lifecycle");
    const failed = observe(invoke(f, "lifecycle"));
    const next = observe(invoke(f, "buckets"));
    await flush();
    expect(f.writes).toHaveLength(1);
    const failure = new Error("first master fails");
    f.writes[0].reject(failure);
    await failed.settled;
    await flush();
    expect(failed.state.error).toBe(failure);
    expect(read(f, "lifecycle")).toEqual(before);
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1].record.lifecycleStatus).toBe(before?.lifecycleStatus);
    f.writes[1].commit();
    await next.settled;
    expect(next.state.status).toBe("fulfilled");
    expect(f.report).toHaveBeenCalledWith(failure, "update_driver_lifecycle");
    expect(
      f.auditWrites.mock.calls
        .filter(([log]) => log.resourceType === "driver_master")
        .map(([log]) => log.actionName),
    ).toEqual([actionNames.buckets]);
  });

  it("preserves duplicate create reservation through master ACK and releases it after rejection", async () => {
    const f = fixture();
    const first = observe(invoke(f, "create"));
    await flush();
    await expect(invoke(f, "create")).rejects.toMatchObject({
      code: "DRIVER_ALREADY_EXISTS",
    });
    expect(read(f, "create")).toBeUndefined();
    expect(f.profiles.has(driverId("create"))).toBe(true);
    f.writes[0].reject(new Error("master create rejected after profile ACK"));
    await first.settled;
    const retry = observe(invoke(f, "create"));
    await flush();
    expect(f.writes).toHaveLength(2);
    f.writes[1].commit();
    await retry.settled;
    expect(retry.state.status).toBe("fulfilled");
    await expect(invoke(f, "create")).rejects.toMatchObject({
      code: "DRIVER_ALREADY_EXISTS",
    });
    expect(
      f.auditWrites.mock.calls.filter(
        ([log]) => log.actionName === actionNames.create,
      ),
    ).toHaveLength(1);
  });

  it("serializes a patch behind pending creation without publishing the pending master", async () => {
    const f = fixture();
    const created = observe(invoke(f, "create"));
    await flush();
    const patch = observe(
      f.controller.updateDriverServiceBuckets(driverId("create"), {
        supportedServiceBuckets: ["business_dispatch"],
      }),
    );
    await flush();
    expect(f.writes).toHaveLength(1);
    expect(read(f, "create")).toBeUndefined();
    f.writes[0].commit();
    await created.settled;
    await flush();
    expect(f.writes).toHaveLength(2);
    expect(patch.state.status).toBe("pending");
    expect(f.writes[1].record.name).toBe("Master ACK");
    f.writes[1].commit();
    await patch.settled;
    expect(read(f, "create")?.supportedServiceBuckets).toEqual([
      "business_dispatch",
    ]);
  });

  it("allows different driver IDs to await independent writes", async () => {
    const f = fixture();
    const first = observe(invoke(f, "lifecycle"));
    const second = observe(
      f.controller.updateDriverLifecycle("drv-demo-002", {
        lifecycleStatus: "retired",
      }),
    );
    await flush();
    expect(f.writes).toHaveLength(2);
    f.writes[1].commit();
    await second.settled;
    expect(first.state.status).toBe("pending");
    f.writes[0].commit();
    await first.settled;
    expect(
      f.service
        .listDrivers()
        .find((driver) => driver.driverId === "drv-demo-002")?.lifecycleStatus,
    ).toBe("retired");
  });

  it("returned records cannot mutate committed state or repository snapshots", async () => {
    const f = fixture();
    const saved = f.controller.updateDriverServiceBuckets(
      "drv-demo-001",
      { supportedServiceBuckets: ["business_dispatch", "business_dispatch"] },
      "request-clone",
    );
    await flush();
    f.writes[0].commit();
    const envelope = await saved;
    expect(envelope.data.supportedServiceBuckets).toEqual([
      "business_dispatch",
    ]);
    envelope.data.supportedServiceBuckets.push("standard_taxi");
    expect(read(f, "buckets")?.supportedServiceBuckets).toEqual([
      "business_dispatch",
    ]);
    expect(f.writes[0].record.supportedServiceBuckets).toEqual([
      "business_dispatch",
    ]);
    expect(
      f.auditWrites.mock.calls.find(
        ([log]) => log.actionName === actionNames.buckets,
      )?.[0],
    ).toMatchObject({
      oldValuesSummary: {
        supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
      },
      newValuesSummary: {
        supportedServiceBuckets: ["business_dispatch"],
        reason: null,
      },
      requestId: "request-clone",
    });
  });
});

describe("inherited validation, lifecycle and profile ACK", () => {
  it("keeps expiry-derived invalidity separate from declared validity on renewal", async () => {
    const f = fixture();
    const expired = f.controller.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: "2000-01-01T00:00:00.000Z",
    });
    await flush();
    f.writes[0].commit();
    expect((await expired).data.licensesValid).toBe(false);
    const renewed = f.controller.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: "2099-01-01T00:00:00.000Z",
    });
    await flush();
    f.writes[1].commit();
    expect((await renewed).data.licensesValid).toBe(true);
    expect(read(f, "licenses")?.licensesValid).toBe(true);
  });
  it("keeps C060 profile failure ahead of the registry write", async () => {
    const f = fixture();
    f.disableProfile();
    f.disable();
    await expect(invoke(f, "create")).rejects.toMatchObject({
      code: "DRIVER_PROFILE_STORAGE_UNAVAILABLE",
    });
    expect(f.writes).toHaveLength(0);
    expect(f.profiles.size).toBe(0);
    expect(read(f, "create")).toBeUndefined();
  });
  it.each([
    [[], "SERVICE_BUCKETS_REQUIRED"],
    [["av_pilot"], "SERVICE_BUCKET_UNKNOWN"],
  ])("preserves bucket validation for %s", async (buckets, code) => {
    const f = fixture();
    await expect(
      f.controller.updateDriverServiceBuckets("drv-demo-001", {
        supportedServiceBuckets: buckets as never,
      }),
    ).rejects.toMatchObject({ code });
    expect(f.writes).toHaveLength(0);
  });
  it("preserves missing-driver and blank-name validation", async () => {
    const f = fixture();
    await expect(
      f.controller.updateDriverLifecycle("absent", {
        lifecycleStatus: "active",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_NOT_FOUND" });
    await expect(
      f.controller.createDriver({ name: " " }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.writes).toHaveLength(0);
    expect(f.profiles.size).toBe(0);
  });
  it.each(["active", "draft", "suspended", "retired"] as const)(
    "retains %s lifecycle timestamps and derived eligibility",
    async (lifecycleStatus) => {
      const f = fixture();
      const saved = f.controller.updateDriverLifecycle("drv-demo-001", {
        lifecycleStatus,
        professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
      });
      await flush();
      f.writes[0].commit();
      const { data } = await saved;
      expect(data.lifecycleStatus).toBe(lifecycleStatus);
      expect(data.professionalDriverLicenseExpiry).toBe(
        "2099-01-01T00:00:00.000Z",
      );
      expect(data.workState).toBe(
        lifecycleStatus === "active"
          ? "available"
          : lifecycleStatus === "suspended"
            ? "suspended"
            : "offline",
      );
      expect(data.dispatchEligible).toBe(lifecycleStatus === "active");
      if (lifecycleStatus === "suspended")
        expect(data.suspendedAt).toBe(data.updatedAt);
      if (lifecycleStatus === "retired")
        expect(data.retiredAt).toBe(data.updatedAt);
      if (lifecycleStatus === "draft") expect(data.activatedAt).toBeNull();
    },
  );
});
