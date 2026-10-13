import { describe, expect, it } from "vitest";

import { fixture, flush, identity, invoke, observe } from "./fixture";

describe("durable save actual producer regression", () => {
  it.each(["create", "update", "admin"] as const)(
    "%s keeps ACK, memory and successful audit pending until storage commits",
    async (operation) => {
      const f = fixture();
      const result = observe(invoke(f, operation));
      await flush();
      try {
        expect(f.writes).toHaveLength(1);
        expect(result.state.status).toBe("pending");
        expect(f.service.findProfileForDriver(identity.actorId)).toBeNull();
        expect(f.auditWrites).not.toHaveBeenCalled();
        f.writes[0]!.commit();
        await result.settled;
        expect(result.state.status).toBe("fulfilled");
        expect(f.service.getProfile(identity.actorId)).toMatchObject({
          name: "Saved Fixture",
          driverSurname: "Explicit Fixture",
        });
        expect(f.auditWrites).toHaveBeenCalledTimes(1);
        expect((await f.reload()).getProfile(identity.actorId)).toEqual(
          f.service.getProfile(identity.actorId),
        );
      } finally {
        f.writes[0]?.commit();
        await result.settled;
      }
    },
  );

  it.each(["create", "update", "admin"] as const)(
    "%s propagates failed storage without committed memory or successful audit",
    async (operation) => {
      const f = fixture();
      const result = observe(invoke(f, operation));
      await flush();
      const error = new Error("Controlled external query rejected");
      f.writes[0]!.reject(error);
      await result.settled;
      await flush();
      expect(result.state.status).toBe("rejected");
      expect(result.state.error).toBe(error);
      expect(f.service.findProfileForDriver(identity.actorId)).toBeNull();
      expect(f.records.size).toBe(0);
      expect(f.auditWrites).not.toHaveBeenCalled();
      expect(f.report).toHaveBeenCalledWith(
        error,
        operation === "admin" ? "upsert_admin_profile" : `${operation}_profile`,
      );
    },
  );

  it("control: real repository serialization/load retains a successful explicit profile", async () => {
    const f = fixture();
    const result = observe(invoke(f, "create"));
    await flush();
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.commit();
    await result.settled;
    expect(result.state.status).toBe("fulfilled");
    expect((await f.reload()).getProfile(identity.actorId)).toMatchObject({
      name: "Saved Fixture",
      driverSurname: "Explicit Fixture",
      phone: "123",
    });
  });
});
