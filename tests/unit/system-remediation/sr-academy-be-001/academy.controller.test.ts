import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import {
  DriverAcademyController,
  FleetPartnerTrainingController,
} from "../../../../apps/api/src/modules/driver-academy/academy.controller";
import type { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";

function identity(
  overrides: Partial<BootstrapRequestIdentity>,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: null,
    realm: "driver",
    tenantId: null,
    roleFamilies: [],
    roles: [],
    scopes: [],
    requestId: null,
    ...overrides,
  };
}

function fakeService(overrides: Partial<AcademyService> = {}) {
  return {
    listCourses: vi.fn().mockResolvedValue([]),
    getCourseDetail: vi.fn(),
    submitQuiz: vi.fn(),
    listRecords: vi.fn().mockResolvedValue([]),
    getAttempt: vi.fn(),
    fleetTrainingSummary: vi.fn(),
    fleetRoster: vi.fn().mockResolvedValue([]),
    fleetAttemptDrilldown: vi.fn(),
    ...overrides,
  } as unknown as AcademyService;
}

describe("SR-ACADEMY-BE-001 driver-academy controllers (IAM boundary, no HTTP-server claim)", () => {
  it("driver-scoped read/write derives driverId from identity, never from client input", async () => {
    const service = fakeService();
    const controller = new DriverAcademyController(service);
    await controller.submitQuiz(
      "crs_basics_001",
      { courseVersion: 1, answers: [] },
      identity({ realm: "driver", actorId: "drv_9" }),
    );
    expect(service.submitQuiz).toHaveBeenCalledWith("crs_basics_001", "drv_9", {
      courseVersion: 1,
      answers: [],
    });
  });

  it("rejects submit/records for a non-driver or missing identity", async () => {
    const controller = new DriverAcademyController(fakeService());
    await expect(
      controller.submitQuiz(
        "crs_basics_001",
        { courseVersion: 1, answers: [] },
        null,
      ),
    ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_REQUIRED" });
    await expect(
      controller.listRecords(identity({ realm: "tenant", actorId: "t_1" })),
    ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_REQUIRED" });
  });

  it("hides another driver's attempt behind ATTEMPT_NOT_FOUND rather than 403", async () => {
    const service = fakeService({
      getAttempt: vi
        .fn()
        .mockResolvedValue({ attemptId: "att_1", driverId: "drv_other" }),
    });
    const controller = new DriverAcademyController(service);
    await expect(
      controller.getAttempt(
        "att_1",
        identity({ realm: "driver", actorId: "drv_self" }),
      ),
    ).rejects.toMatchObject({ code: "ATTEMPT_NOT_FOUND" });
  });

  it("a tenant fleet admin may only query their own fleetPartnerId", async () => {
    const service = fakeService({
      fleetTrainingSummary: vi
        .fn()
        .mockResolvedValue({ fleetPartnerId: "fleet-own" }),
    });
    const controller = new FleetPartnerTrainingController(service);

    await controller.summary(
      undefined,
      identity({ realm: "tenant", tenantId: "fleet-own" }),
    );
    expect(service.fleetTrainingSummary).toHaveBeenCalledWith("fleet-own");

    await expect(
      controller.summary(
        "fleet-other",
        identity({ realm: "tenant", tenantId: "fleet-own" }),
      ),
    ).rejects.toMatchObject({ code: "ACADEMY_FORBIDDEN_FLEET_ACCESS" });
  });

  it("platform/ops callers have global fleetPartnerId visibility via explicit query", async () => {
    const service = fakeService({
      fleetRoster: vi.fn().mockResolvedValue([]),
    });
    const controller = new FleetPartnerTrainingController(service);
    await controller.roster(
      "fleet-any",
      identity({ realm: "platform", actorType: "platform_admin" }),
    );
    expect(service.fleetRoster).toHaveBeenCalledWith("fleet-any");
  });

  it("rejects a fleet query with no resolvable fleetPartnerId", async () => {
    const controller = new FleetPartnerTrainingController(fakeService());
    await expect(
      controller.summary(
        undefined,
        identity({ realm: "platform", actorType: "platform_admin" }),
      ),
    ).rejects.toMatchObject({ code: "FLEET_PARTNER_ID_REQUIRED" });
  });
});
