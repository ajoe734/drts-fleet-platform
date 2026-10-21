import { describe, expect, it } from "vitest";
import { durableFixture, services } from "./fixture";

describe("normal approved vehicle reference through real repositories", () => {
  it("writes the exact structural pair with approval in one transaction and publishes after commit", async () => {
    const f = await durableFixture();
    const start = f.database.calls.length;
    const beforePairs = f.registry.listSupplyPairs();
    f.database.beforeCommit = () => {
      expect(f.registry.listSupplyPairs()).toEqual(beforePairs);
      expect(f.database.table("reg.phase1_registry_supply_pairs").size).toBe(0);
    };
    const approved = await f.approve();
    const pair = {
      vehicleId: approved.canonicalVehicleId,
      driverId: f.driverId,
      etaMinutes: null,
    };
    expect(approved.status).toBe("approved");
    expect(f.registry.listSupplyPairs()).toContainEqual(pair);
    expect(
      f.database
        .table("reg.phase1_registry_supply_pairs")
        .get(`${pair.vehicleId}::${pair.driverId}`)?.record,
    ).toEqual(pair);
    const calls = f.database.calls.slice(start);
    const writes = calls.filter((call) =>
      /^(INSERT INTO reg\.|UPDATE fleet.supply_submissions|INSERT INTO fleet.supply_review_events)/.test(
        call.sql,
      ),
    );
    expect(writes.length).toBeGreaterThan(3);
    expect(new Set(writes.map((call) => call.transaction))).toEqual(
      new Set([1]),
    );
    expect(calls.findIndex((call) => call.sql === "COMMIT")).toBeGreaterThan(
      calls.findIndex((call) =>
        call.sql.startsWith("INSERT INTO reg.phase1_registry_supply_pairs"),
      ),
    );
    await expect(f.approve()).rejects.toMatchObject({
      code: "SUBMISSION_REVISION_CONFLICT",
    });
    expect(f.database.table("reg.phase1_registry_supply_pairs").size).toBe(1);
  });

  it("retains successful unpaired approval for an explicit null reference", async () => {
    const f = await durableFixture();
    f.database
      .table("fleet.vehicle_supply_drafts")
      .get(f.vehicle.submissionId)!.current_driver_submission_id = null;
    const approved = await f.approve();
    expect(approved.status).toBe("approved");
    expect(f.database.table("reg.phase1_registry_supply_pairs").size).toBe(0);
    expect(
      f.registry
        .listSupplyPairs()
        .some((p) => p.vehicleId === approved.canonicalVehicleId),
    ).toBe(false);
  });

  it.each([
    "missing",
    "foreign",
    "unapproved",
    "wrong-type",
    "missing-canonical",
    "missing-driver",
  ])(
    "rejects an invalid explicit driver reference without approval or pair: %s",
    async (fault) => {
      const f = await durableFixture();
      const row = f.database
        .table("fleet.supply_submissions")
        .get(f.driver.submissionId)!;
      if (fault === "missing")
        f.database
          .table("fleet.supply_submissions")
          .delete(f.driver.submissionId);
      if (fault === "foreign") row.fleet_partner_id = "another-fleet";
      if (fault === "unapproved") row.status = "submitted";
      if (fault === "wrong-type") row.submission_type = "vehicle_onboarding";
      if (fault === "missing-canonical") row.canonical_driver_id = null;
      if (fault === "missing-driver")
        f.database.table("reg.phase1_registry_drivers").clear();
      await expect(f.approve()).rejects.toMatchObject({
        code: ["missing", "foreign"].includes(fault)
          ? "NOT_FOUND"
          : "APPROVED_DRIVER_REFERENCE_INVALID",
      });
      expect(
        f.database.table("fleet.supply_submissions").get(f.vehicle.submissionId)
          ?.status,
      ).toBe("in_review");
      expect(f.database.table("reg.phase1_registry_supply_pairs").size).toBe(0);
      expect(f.database.table("reg.phase1_registry_vehicles").size).toBe(0);
      expect(f.database.calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
    },
  );

  it.each(["pair-write", "review-event", "known-commit"])(
    "rolls back approval and the pair without publishing on %s failure",
    async (fault) => {
      const f = await durableFixture(),
        beforePairs = f.registry.listSupplyPairs();
      if (fault === "pair-write")
        f.database.failSql = /INSERT INTO reg.phase1_registry_supply_pairs/;
      if (fault === "review-event")
        f.database.failSql = /INSERT INTO fleet.supply_review_events/;
      if (fault === "known-commit") f.database.rejectCommit = true;
      await expect(f.approve()).rejects.toThrow();
      expect(
        f.database.table("fleet.supply_submissions").get(f.vehicle.submissionId)
          ?.status,
      ).toBe("in_review");
      expect(f.database.table("reg.phase1_registry_supply_pairs").size).toBe(0);
      expect(f.database.table("reg.phase1_registry_vehicles").size).toBe(0);
      expect(
        f.database.table("reg.phase1_registry_drivers").has(f.driverId),
      ).toBe(true);
      expect(f.registry.listSupplyPairs()).toEqual(beforePairs);
      expect(f.database.calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
    },
  );

  it("never claims an uncertain commit succeeded, while normal authoritative readback finds its committed approval", async () => {
    const f = await durableFixture(),
      beforePairs = f.registry.listSupplyPairs();
    f.database.loseCommitAck = true;
    await expect(f.approve()).rejects.toThrow("controlled committed ACK loss");
    expect(f.registry.listSupplyPairs()).toEqual(beforePairs);
    const state = await f.submissions.loadState();
    const approved = state.submissions.find(
      (s) => s.submissionId === f.vehicle.submissionId,
    )!;
    expect(approved.status).toBe("approved");
    expect(
      f.database
        .table("reg.phase1_registry_supply_pairs")
        .get(`${approved.canonicalVehicleId}::${f.driverId}`)?.record,
    ).toEqual({
      vehicleId: approved.canonicalVehicleId,
      driverId: f.driverId,
      etaMinutes: null,
    });
  });

  it("an independent normal supply refresh sees only the committed pair and keeps existing eligibility exclusion", async () => {
    const f = await durableFixture();
    const approved = await f.approve();
    const peer = services(f.database);
    expect(
      peer.registry
        .listSupplyPairs()
        .some((p) => p.vehicleId === approved.canonicalVehicleId),
    ).toBe(false);
    await peer.registry.prepareDispatchSupply("standard_taxi");
    expect(peer.registry.listSupplyPairs()).toContainEqual({
      vehicleId: approved.canonicalVehicleId,
      driverId: f.driverId,
      etaMinutes: null,
    });
    // Approval/pairing alone does not grant contract/insurance/exclusivity or GPS.
    expect(
      peer.registry
        .getEligibleCandidates("standard_taxi")
        .some((p) => p.vehicleId === approved.canonicalVehicleId),
    ).toBe(false);
    expect(
      peer.registry
        .getEligibleCandidates("standard_taxi", { lat: 25.03, lng: 121.52 })
        .some((p) => p.vehicleId === approved.canonicalVehicleId),
    ).toBe(false);
  });
});
