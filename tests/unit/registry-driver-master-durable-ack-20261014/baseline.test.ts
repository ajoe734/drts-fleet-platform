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

describe.each(operations)("%s actual driver master ACK", (operation) => {
  it("keeps caller, committed memory and success audit pending until actual storage ACK", async () => {
    const f = fixture();
    const before = read(f, operation);
    const call = observe(invoke(f, operation));
    await flush();
    // Settle the controlled boundary before assertions even on old failures.
    const pending = { ...call.state };
    const memory = read(f, operation);
    const audits = f.auditWrites.mock.calls.filter(
      ([log]) => log.actionName === actionNames[operation],
    );
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.commit();
    await call.settled;
    expect(pending.status).toBe("pending");
    expect(memory).toEqual(before);
    expect(audits).toHaveLength(0);
    expect(call.state.status).toBe("fulfilled");
  });

  it("propagates storage rejection to actual caller without master memory or success audit", async () => {
    const f = fixture();
    const before = read(f, operation);
    const call = observe(invoke(f, operation));
    await flush();
    const failure = new Error("controlled driver master query rejection");
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.reject(failure);
    await flush();
    await call.settled;
    expect(call.state.status).toBe("rejected");
    expect(call.state.error).toBe(failure);
    expect(read(f, operation)).toEqual(before);
    expect(f.records.has(driverId(operation))).toBe(false);
    expect(
      f.auditWrites.mock.calls.filter(
        ([log]) => log.actionName === actionNames[operation],
      ),
    ).toHaveLength(0);
    if (operation === "create") {
      // C060 profile ACK is real and remains committed on registry failure.
      expect(f.profiles.has(driverId(operation))).toBe(true);
      expect(f.profile.findProfileForDriver(driverId(operation))?.name).toBe(
        "Master ACK",
      );
    }
  });

  it("success control persists the production serialized master and permits coherent readback", async () => {
    const f = fixture();
    const call = observe(invoke(f, operation));
    await flush();
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.commit();
    await call.settled;
    expect(call.state.status).toBe("fulfilled");
    expect(call.state.value?.data).toEqual(read(f, operation));
    expect(JSON.parse(f.records.get(driverId(operation))!)).toEqual(
      read(f, operation),
    );
    const fresh = await f.reload();
    expect(
      fresh
        .listDrivers()
        .find((driver) => driver.driverId === driverId(operation)),
    ).toEqual(read(f, operation));
    expect(
      f.auditWrites.mock.calls.filter(
        ([log]) => log.actionName === actionNames[operation],
      ),
    ).toHaveLength(1);
  });
});
