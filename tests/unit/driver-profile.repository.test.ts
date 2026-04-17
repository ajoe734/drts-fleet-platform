import { describe, expect, it, vi } from "vitest";

import type { DriverProfileRecord } from "@drts/contracts";

import { DriverProfileRepository } from "../../apps/api/src/modules/driver-profile/driver-profile.repository";

describe("driver profile repository", () => {
  it("loads persisted profiles from ops.phase1_driver_profiles", async () => {
    const profile: DriverProfileRecord = {
      driverId: "drv-db-001",
      name: "DB Driver",
      phone: "+886-900-111-222",
      email: "db.driver@example.com",
      photoUrl: null,
      emergencyContact: null,
      bankAccount: null,
      updatedAt: "2026-04-17T14:30:00.000Z",
    };
    const query = vi.fn().mockResolvedValue({
      rows: [{ record: profile }],
    });
    const repository = new DriverProfileRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(repository.loadAll()).resolves.toEqual([profile]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM ops.phase1_driver_profiles"),
    );
  });

  it("upserts persisted profiles into ops.phase1_driver_profiles", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DriverProfileRepository({
      isEnabled: () => true,
      query,
    } as never);
    const profile: DriverProfileRecord = {
      driverId: "drv-db-002",
      name: "Persisted Driver",
      phone: null,
      email: null,
      photoUrl: null,
      emergencyContact: null,
      bankAccount: null,
      updatedAt: "2026-04-17T14:31:00.000Z",
    };

    await repository.upsert(profile);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ops.phase1_driver_profiles"),
      [profile.driverId, profile.updatedAt, JSON.stringify(profile)],
    );
  });
});
