import { describe, expect, it } from "vitest";
import {
  fixture,
  flush,
  observe,
} from "../driver-profile-durable-save-ack-20261013/fixture";

describe("F5 preserve C060 immediate admin-profile caller order", () => {
  it.each(["commit", "reject"] as const)(
    "registry admin profile enters the canonical queue before a later patch (%s)",
    async (outcome) => {
      const f = fixture();
      const admin = observe(
        f.registryController.createDriver({
          driverId: "driver-demo-001",
          name: "Registry alias saved",
        }),
      );
      const patch = observe(
        f.service.updateProfile("drv-demo-001", { phone: "new-phone" }),
      );
      await flush();
      const first = f.writes[0]!.record;
      const error = new Error("first actual profile query rejected");
      if (outcome === "commit") f.writes[0]!.commit();
      else f.writes[0]!.reject(error);
      await flush();
      f.writes[1]!.commit();
      await admin.settled;
      await patch.settled;
      expect(first.name).toBe("Registry alias saved");
      expect(first.phone).not.toBe("new-phone");
      expect(f.writes[1]!.record.phone).toBe("new-phone");
      expect(admin.state.status).toBe(
        outcome === "commit" ? "fulfilled" : "rejected",
      );
    },
  );
});
