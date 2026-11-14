import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SupplyReviewService } from "../../../apps/api/src/modules/fleet-partner/supply-review.service";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../../apps/api/src/modules/fleet-partner/supply-submission.service";
import type { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

/**
 * FLEET-SUPPLY-SCOPED-LOAD-20261114.
 *
 * Every Fleet supply detail, submit, withdraw and document call, and every
 * Admin review detail, used to reload all six fleet supply tables for every
 * fleet partner (loadState). On shared dev that made deploy-dev's Fleet and
 * Admin journeys spend ~38 s in setup and brush their 90 s budget. These
 * paths now read only the target submission's rows.
 */

const FLEET = "fleet-demo-001";

function driverDraft(suffix: string) {
  return {
    name: `Scoped Driver ${suffix}`,
    mobile: "+886900111222",
    professionalDriverLicenseNo: `PDL-SCOPED-${suffix}`,
    professionalDriverLicenseExpiry: "2027-12-31",
    taxiDriverRegistrationNo: `TAXI-SCOPED-${suffix}`,
    taxiDriverRegistrationArea: "TPE",
    taxiDriverRegistrationExpiry: "2027-12-31",
    supportedServiceProductCodes: ["taxi_realtime"],
    preferredVehicleSubmissionId: null,
  };
}

function createService() {
  const repository = new SupplySubmissionRepository();
  const service = new SupplySubmissionService(
    repository,
    {
      listVehicles: () => [],
      listDrivers: () => [],
    } as unknown as RegulatoryRegistryService,
    new AuditNotificationService(),
  );
  return { service, repository };
}

describe("single-submission paths read only their own submission", () => {
  it("detail loads the target submission instead of every fleet table", async () => {
    const { service, repository } = createService();
    const first = await service.createDriverDraft(
      FLEET,
      "actor-scoped-1",
      driverDraft("A"),
    );
    const second = await service.createDriverDraft(
      FLEET,
      "actor-scoped-1",
      driverDraft("B"),
    );

    const loadState = vi.spyOn(repository, "loadState");
    const loadSubmissionState = vi.spyOn(repository, "loadSubmissionState");

    const detail = await service.getSupplySubmissionDetail(
      FLEET,
      first.submission.submissionId,
    );
    expect(detail.submission.submissionId).toBe(first.submission.submissionId);
    expect(detail.driverDraft?.name).toBe("Scoped Driver A");
    expect(loadSubmissionState).toHaveBeenLastCalledWith(
      first.submission.submissionId,
    );
    expect(loadState).not.toHaveBeenCalled();

    // The other submission's cached rows stay intact.
    const other = await service.getSupplySubmissionDetail(
      FLEET,
      second.submission.submissionId,
    );
    expect(other.driverDraft?.name).toBe("Scoped Driver B");
    expect(loadState).not.toHaveBeenCalled();
  });

  it("a submission that no longer exists is not served from stale cache", async () => {
    const { service, repository } = createService();
    const created = await service.createDriverDraft(
      FLEET,
      "actor-scoped-2",
      driverDraft("C"),
    );
    vi.spyOn(repository, "loadSubmissionState").mockResolvedValueOnce({
      submissions: [],
      driverDrafts: [],
      vehicleDrafts: [],
      documents: [],
      reviewEvents: [],
    });

    await expect(
      service.getSupplySubmissionDetail(FLEET, created.submission.submissionId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.getSupplySubmissionDetail(FLEET, created.submission.submissionId),
    ).resolves.toMatchObject({
      submission: { submissionId: created.submission.submissionId },
    });
  });

  it("keeps the fleet scope check on the freshly loaded row", async () => {
    const { service } = createService();
    const created = await service.createDriverDraft(
      FLEET,
      "actor-scoped-3",
      driverDraft("D"),
    );
    const error = await service
      .getSupplySubmissionDetail(
        "fleet-other-002",
        created.submission.submissionId,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: "FLEET_SCOPE_DENIED" });
  });
});

describe("SupplySubmissionRepository.loadSubmissionState", () => {
  it("queries every table by the one submission id, never a full table", async () => {
    const queries: Array<{ text: string; values: unknown }> = [];
    const database = {
      isEnabled: () => true,
      query: vi.fn(async (text: string, values?: unknown) => {
        queries.push({ text: text.replace(/\s+/g, " ").trim(), values });
        return { rows: [] };
      }),
    } as unknown as DatabaseService;
    const repository = new SupplySubmissionRepository(database);

    const state = await repository.loadSubmissionState("sub-scoped-1");

    expect(state).toEqual({
      submissions: [],
      driverDrafts: [],
      vehicleDrafts: [],
      documents: [],
      reviewEvents: [],
    });
    expect(
      queries.map((query) => query.text.match(/FROM (\S+)/)?.[1]).sort(),
    ).toEqual([
      "fleet.driver_supply_drafts",
      "fleet.supply_documents",
      "fleet.supply_review_events",
      "fleet.supply_submissions",
      "fleet.vehicle_supply_drafts",
    ]);
    for (const query of queries) {
      expect(query.text).toContain("WHERE submission_id = $1");
      expect(query.values).toEqual(["sub-scoped-1"]);
    }
  });
});

describe("Admin review detail finds its submission without a full load", () => {
  it("reads only the requested submission", async () => {
    const repository = {
      loadState: vi.fn(),
      loadSubmissionState: vi.fn(async () => ({
        submissions: [{ submissionId: "sub-review-1", status: "submitted" }],
        driverDrafts: [],
        vehicleDrafts: [],
        documents: [],
        reviewEvents: [],
      })),
    };
    const findSubmission = (
      SupplyReviewService.prototype as unknown as {
        findSubmission: (submissionId: string) => Promise<unknown>;
      }
    ).findSubmission;

    await expect(
      findSubmission.call(
        { supplySubmissionRepository: repository, submissions: [] },
        "sub-review-1",
      ),
    ).resolves.toMatchObject({ submissionId: "sub-review-1" });
    expect(repository.loadSubmissionState).toHaveBeenCalledWith("sub-review-1");
    expect(repository.loadState).not.toHaveBeenCalled();

    repository.loadSubmissionState.mockResolvedValueOnce({
      submissions: [],
      driverDrafts: [],
      vehicleDrafts: [],
      documents: [],
      reviewEvents: [],
    } as never);
    await expect(
      findSubmission.call(
        { supplySubmissionRepository: repository, submissions: [] },
        "sub-missing",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
