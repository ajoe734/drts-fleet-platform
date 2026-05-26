import { describe, expect, it, vi } from "vitest";

import type { DriverMatchingSuppression } from "@drts/contracts";

import { DriverMatchingSuppressionRepository } from "../../apps/api/src/modules/driver-matching-suppression/driver-matching-suppression.repository";

function createSuppression(
  overrides: Partial<DriverMatchingSuppression> = {},
): DriverMatchingSuppression {
  return {
    suppressionId: "dms-db-001",
    driverId: "drv-db-001",
    platformCode: "grab_taiwan",
    serviceBucket: "standard_taxi",
    reason: "incident_hold",
    reasonMessage: "Driver is under incident review.",
    status: "active",
    createdAt: "2026-05-26T09:00:00.000Z",
    releasedAt: null,
    createdByActorId: "ops-user-001",
    releaseAction: null,
    auditId: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  };
}

describe("driver matching suppression repository", () => {
  it("loads persisted records from ops.phase1_driver_matching_suppressions", async () => {
    const suppression = createSuppression();
    const query = vi.fn().mockResolvedValue({
      rows: [{ record: suppression }],
    });
    const repository = new DriverMatchingSuppressionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(repository.loadAll()).resolves.toEqual([suppression]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM ops.phase1_driver_matching_suppressions"),
    );
  });

  it("upserts persisted records into ops.phase1_driver_matching_suppressions", async () => {
    const suppression = createSuppression({
      suppressionId: "dms-db-002",
      driverId: "drv-db-002",
      platformCode: null,
      serviceBucket: null,
    });
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DriverMatchingSuppressionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.upsert(suppression);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "INSERT INTO ops.phase1_driver_matching_suppressions",
      ),
      [
        suppression.suppressionId,
        suppression.driverId,
        suppression.platformCode,
        suppression.serviceBucket,
        suppression.reason,
        suppression.reasonMessage,
        suppression.status,
        suppression.createdAt,
        suppression.releasedAt,
        suppression.createdByActorId,
        JSON.stringify(suppression),
      ],
    );
  });
});
