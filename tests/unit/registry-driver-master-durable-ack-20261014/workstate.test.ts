import { describe, expect, it } from "vitest";
import { fixture, flush, invoke, observe, read } from "./fixture";

describe("F3 inherited synchronous work-state versus durable master queue", () => {
  it("a work-state write before master intent is persisted first with inherited synchronous return", async () => {
    const f = fixture();
    const local = f.service.updateDriverWorkState("drv-demo-001", {
      workState: "paused",
    });
    const master = observe(invoke(f, "licenses"));
    expect(local.workState).toBe("paused");
    expect(local).not.toHaveProperty("then");
    await flush();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]!.record).toMatchObject({
      workState: "paused",
      licensesValid: true,
    });
    f.writes[0]!.commit();
    await flush();
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]!.record).toMatchObject({
      workState: "paused",
      licensesValid: false,
    });
    f.writes[1]!.commit();
    await master.settled;
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
  });

  it("a later lifecycle intent can still change an earlier work-state setter", async () => {
    const f = fixture();
    f.service.updateDriverWorkState("drv-demo-001", { workState: "paused" });
    const master = observe(
      f.controller.updateDriverLifecycle("drv-demo-001", {
        lifecycleStatus: "active",
      }),
    );
    await flush();
    f.writes[0]!.commit();
    await flush();
    f.writes[1]!.commit();
    await master.settled;
    expect(read(f, "lifecycle")?.workState).toBe("available");
    expect(master.state.value?.data.workState).toBe("available");
  });

  it("inherited persistence rejection stays best-effort and cannot revert a master ACK", async () => {
    const f = fixture();
    const master = observe(invoke(f, "licenses"));
    await flush();
    const local = f.service.updateDriverWorkState("drv-demo-001", {
      workState: "paused",
    });
    expect(local.workState).toBe("paused");
    f.writes[0]!.commit();
    await master.settled;
    await flush();
    const error = new Error("inherited work-state query rejected");
    f.writes[1]!.reject(error);
    await flush();
    expect(master.state.status).toBe("fulfilled");
    expect(read(f, "licenses")).toMatchObject({
      licensesValid: false,
      workState: "paused",
    });
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toMatchObject({
      licensesValid: false,
    });
    expect(f.report).toHaveBeenCalledWith(error, "update_driver_work_state");
    const next = observe(invoke(f, "buckets"));
    await flush();
    f.writes[2]!.commit();
    await next.settled;
    expect(next.state.status).toBe("fulfilled");
  });

  it("work-state on another driver progresses while this driver's master and setter wait", async () => {
    const f = fixture();
    const master = observe(invoke(f, "licenses"));
    await flush();
    f.service.updateDriverWorkState("drv-demo-001", { workState: "paused" });
    const independent = f.service.updateDriverWorkState("drv-demo-002", {
      workState: "offline",
    });
    await flush();
    expect(independent.workState).toBe("offline");
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]!.record.driverId).toBe("drv-demo-002");
    f.writes[1]!.commit();
    await flush();
    expect(master.state.status).toBe("pending");
    f.writes[0]!.commit();
    await master.settled;
    await flush();
    f.writes[2]!.commit();
    await flush();
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
    expect(JSON.parse(f.records.get("drv-demo-002")!)).toMatchObject({
      workState: "offline",
    });
  });

  it("disabled inherited storage keeps synchronous local behavior while strict master still rejects", async () => {
    const f = fixture();
    f.disable();
    const local = f.service.updateDriverWorkState("drv-demo-001", {
      workState: "paused",
    });
    expect(local.workState).toBe("paused");
    await expect(invoke(f, "licenses")).rejects.toMatchObject({
      code: "DRIVER_MASTER_STORAGE_UNAVAILABLE",
    });
    expect(f.writes).toHaveLength(0);
    expect(read(f, "licenses")).toMatchObject({
      workState: "paused",
      licensesValid: true,
    });
  });

  it("keeps the synchronous missing-driver guard during pending master creation", async () => {
    const f = fixture();
    const master = observe(invoke(f, "create"));
    await flush();
    expect(() =>
      f.service.updateDriverWorkState("drv-master-ack", {
        workState: "paused",
      }),
    ).toThrowError(expect.objectContaining({ code: "DRIVER_NOT_FOUND" }));
    f.writes[0]!.commit();
    await master.settled;
    expect(master.state.status).toBe("fulfilled");
  });
  it.each(["buckets", "lifecycle", "licenses"] as const)(
    "%s ACK survives a later work-state full-row write and preserves its local effect",
    async (operation) => {
      const f = fixture();
      const master = observe(invoke(f, operation));
      await flush();
      const local = f.service.updateDriverWorkState("drv-demo-001", {
        workState: "paused",
      });
      await flush();
      const pendingQueries = f.writes.length;
      expect(local.workState).toBe("paused");
      f.writes[0]!.commit();
      await master.settled;
      await flush();
      const afterMaster = read(f, operation);
      const inheritedSnapshot = f.writes[1]!.record;
      f.writes[1]!.commit();
      await flush();
      expect(pendingQueries).toBe(1);
      expect(afterMaster?.workState).toBe("paused");
      expect(master.state.value?.data).toEqual(afterMaster);
      expect(inheritedSnapshot).toEqual(afterMaster);
      expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(afterMaster);
    },
  );

  it("failed master leaves committed master fields for the queued inherited write", async () => {
    const f = fixture();
    const before = read(f, "licenses");
    const master = observe(invoke(f, "licenses"));
    await flush();
    f.service.updateDriverWorkState("drv-demo-001", { workState: "paused" });
    await flush();
    const pendingQueries = f.writes.length;
    const error = new Error("master rejected before inherited save");
    f.writes[0]!.reject(error);
    await master.settled;
    await flush();
    const inheritedSnapshot = f.writes[1]!.record;
    f.writes[1]!.commit();
    await flush();
    expect(pendingQueries).toBe(1);
    expect(master.state.error).toBe(error);
    expect(inheritedSnapshot.licensesValid).toBe(before?.licensesValid);
    expect(read(f, "licenses")?.workState).toBe("paused");
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
  });

  it("two inherited commands keep their order and the latest local effect", async () => {
    const f = fixture();
    const master = observe(invoke(f, "licenses"));
    await flush();
    f.service.updateDriverWorkState("drv-demo-001", { workState: "paused" });
    f.service.updateDriverWorkState("drv-demo-001", { workState: "offline" });
    await flush();
    const pendingQueries = f.writes.length;
    f.writes[0]!.commit();
    await master.settled;
    await flush();
    const memoryAfterMaster = read(f, "licenses");
    const first = f.writes[1]!.record;
    f.writes[1]!.commit();
    await flush();
    const second = f.writes[2]!.record;
    f.writes[2]!.commit();
    await flush();
    expect(pendingQueries).toBe(1);
    expect(memoryAfterMaster?.workState).toBe("offline");
    expect(first).toMatchObject({ licensesValid: false, workState: "paused" });
    expect(second).toMatchObject({
      licensesValid: false,
      workState: "offline",
    });
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
  });

  it("preserves a later local setter invoked before a queued lifecycle command starts", async () => {
    const f = fixture();
    const first = observe(invoke(f, "licenses"));
    const second = observe(invoke(f, "lifecycle"));
    // This synchronous local effect occurs after both named command intents,
    // even though the second named command has not started building its row.
    f.service.updateDriverWorkState("drv-demo-001", { workState: "paused" });
    await flush();
    const pendingQueries = f.writes.length;
    // Old source emits work-state immediately; locate the actual master query.
    const masterWrite = f.writes.find(
      (write) => write.record.licensesValid === false,
    )!;
    masterWrite.commit();
    await first.settled;
    await flush();
    const lifecycleWrite = f.writes.find(
      (write) => write.record.lifecycleStatus === "suspended",
    )!;
    lifecycleWrite.commit();
    await second.settled;
    await flush();
    const memoryAfterMaster = read(f, "licenses");
    const workStateWrites = f.writes.filter(
      (write) => write !== masterWrite && write !== lifecycleWrite,
    );
    workStateWrites.forEach((write) => write.commit());
    await flush();
    expect(pendingQueries).toBe(1);
    expect(memoryAfterMaster).toMatchObject({
      licensesValid: false,
      lifecycleStatus: "suspended",
      workState: "paused",
    });
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
  });
});
