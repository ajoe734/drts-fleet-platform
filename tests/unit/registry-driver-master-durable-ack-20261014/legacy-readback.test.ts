import { describe, expect, it } from "vitest";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { fixture, flush, invoke, observe, read } from "./fixture";

describe("F6 stage historical repository rows through existing decoration", () => {
  it.each(["buckets", "lifecycle", "licenses"] as const)(
    "%s still saves a row predating derived arrays/profile fields",
    async (operation) => {
      const f = fixture();
      f.records.set(
        "drv-demo-001",
        JSON.stringify({
          driverId: "drv-demo-001",
          name: "Historical Driver",
          supportedServiceBuckets: ["standard_taxi"],
          workState: "available",
          licensesValid: true,
          lifecycleStatus: "active",
        }),
      );
      f.service = await f.reload();
      f.controller = new RegulatoryRegistryController(f.service);
      const saved = observe(invoke(f, operation));
      await flush();
      expect(f.writes).toHaveLength(1);
      f.writes[0]!.commit();
      await saved.settled;
      expect(saved.state.status).toBe("fulfilled");
      expect(saved.state.value?.data.name).toBe("Historical Driver");
      expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
        read(f, operation),
      );
    },
  );

  it("inherited work-state persistence still serializes a historical raw row", async () => {
    const f = fixture();
    f.records.set(
      "drv-demo-001",
      JSON.stringify({
        driverId: "drv-demo-001",
        name: "Historical Driver",
        supportedServiceBuckets: ["standard_taxi"],
        workState: "offline",
        licensesValid: true,
      }),
    );
    f.service = await f.reload();
    const local = f.service.updateDriverWorkState("drv-demo-001", {
      workState: "available",
    });
    await flush();
    expect(local.workState).toBe("available");
    expect(f.writes).toHaveLength(1);
    f.writes[0]!.commit();
    await flush();
    expect(JSON.parse(f.records.get("drv-demo-001")!)).toEqual(
      read(f, "licenses"),
    );
  });
});
