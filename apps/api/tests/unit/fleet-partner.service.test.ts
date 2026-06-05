import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  const auditSpy = vi.spyOn(auditNotificationService, "recordAuditLog");
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const repository = {
    upsertFleetPartner: vi.fn().mockResolvedValue(undefined),
    upsertDriverFleetAffiliation: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const service = new FleetPartnerService(
    auditNotificationService,
    driverProfileService,
    repository as never,
  );

  return {
    service,
    repository,
    auditSpy,
  };
}

function createFleetPartner(service: FleetPartnerService) {
  return service.createFleetPartner({
    legalName: "North Route Fleet Ltd.",
    displayName: "North Route",
    businessRegistrationNo: "nr-001",
    contactName: "Admin North",
    contactPhone: "+886-2-7700-2001",
    partnershipType: "business_dispatch_fleet",
  });
}

describe("FleetPartnerService", () => {
  it("creates a fleet partner, persists it, and records an audit log", () => {
    const { service, repository, auditSpy } = createService();

    const created = service.createFleetPartner(
      {
        legalName: "North Route Fleet Ltd.",
        displayName: "North Route",
        businessRegistrationNo: "nr-001",
        contactName: "Admin North",
        contactPhone: "+886-2-7700-2001",
        partnershipType: "business_dispatch_fleet",
      },
      {
        actorId: "platform-admin-001",
        actorType: "platform_admin",
        tenantId: null,
      },
      "req-fleet-create-001",
    );

    expect(created.businessRegistrationNo).toBe("NR-001");
    expect(created.active).toBe(true);
    expect(repository.upsertFleetPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        fleetPartnerId: created.fleetPartnerId,
        displayName: "North Route",
      }),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-fleet-create-001",
        actorId: "platform-admin-001",
        actionName: "create_fleet_partner",
        resourceId: created.fleetPartnerId,
      }),
    );
  });

  it("updates an existing fleet partner and returns the stored record", () => {
    const { service, repository, auditSpy } = createService();
    const created = createFleetPartner(service);

    const updated = service.updateFleetPartner(
      created.fleetPartnerId,
      {
        displayName: "North Route Prime",
        active: false,
      },
      {
        actorId: "platform-admin-002",
        actorType: "platform_admin",
        tenantId: null,
      },
      "req-fleet-update-001",
    );

    expect(updated.displayName).toBe("North Route Prime");
    expect(updated.active).toBe(false);
    expect(repository.upsertFleetPartner).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fleetPartnerId: created.fleetPartnerId,
        displayName: "North Route Prime",
        active: false,
      }),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "update_fleet_partner",
        resourceId: created.fleetPartnerId,
      }),
    );
  });

  it("creates driver fleet affiliations and exposes them through the partner driver list", () => {
    const { service, repository, auditSpy } = createService();
    const partner = createFleetPartner(service);

    const affiliation = service.createDriverFleetAffiliation(
      "drv-demo-003",
      {
        fleetPartnerId: partner.fleetPartnerId,
        affiliationType: "contracted_under",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      },
      {
        actorId: "platform-admin-003",
        actorType: "platform_admin",
        tenantId: null,
      },
      "req-affiliation-create-001",
    );
    const drivers = service.listFleetPartnerDrivers(partner.fleetPartnerId);

    expect(affiliation.driverId).toBe("drv-demo-003");
    expect(repository.upsertDriverFleetAffiliation).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliationId: affiliation.affiliationId,
        driverId: "drv-demo-003",
      }),
    );
    expect(drivers).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-003",
        driverName: "Driver Demo Three",
        affiliationType: "contracted_under",
      }),
    ]);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "create_driver_fleet_affiliation",
        resourceId: affiliation.affiliationId,
      }),
    );
  });

  it("rejects overlapping affiliations for the same driver and affiliation type", () => {
    const { service, repository } = createService();
    const firstPartner = createFleetPartner(service);
    const secondPartner = service.createFleetPartner({
      legalName: "Second Fleet Ltd.",
      displayName: "Second Fleet",
      businessRegistrationNo: "nr-002",
      contactName: "Admin Second",
      contactPhone: "+886-2-7700-2002",
      partnershipType: "fleet_management",
    });

    service.createDriverFleetAffiliation("drv-demo-001", {
      fleetPartnerId: firstPartner.fleetPartnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2026-05-01T00:00:00.000Z",
    });

    expect(() =>
      service.createDriverFleetAffiliation("drv-demo-001", {
        fleetPartnerId: secondPartner.fleetPartnerId,
        affiliationType: "managed_by",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      }),
    ).toThrowError(ApiRequestError);
    expect(repository.upsertDriverFleetAffiliation).toHaveBeenCalledTimes(1);
  });

  it("does not treat removed demo seed registration numbers as conflicts", () => {
    const { service } = createService();

    const created = service.createFleetPartner({
      legalName: "Demo Registration Reuse Ltd.",
      displayName: "Registration Reuse",
      businessRegistrationNo: "demo-fleet-001",
      contactName: "Admin Reuse",
      contactPhone: "+886-2-7700-2003",
      partnershipType: "fleet_management",
    });

    expect(created.businessRegistrationNo).toBe("DEMO-FLEET-001");
  });

  it("rejects affiliations for unknown drivers", () => {
    const { service } = createService();
    const partner = createFleetPartner(service);

    try {
      service.createDriverFleetAffiliation("drv-missing-001", {
        fleetPartnerId: partner.fleetPartnerId,
        affiliationType: "managed_by",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      });
      throw new Error("Expected missing driver affiliation creation to fail.");
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "DRIVER_NOT_FOUND",
            }),
          }),
        }),
      );
    }
  });

  it("returns 400 for malformed create payloads instead of throwing type errors", () => {
    const { service } = createService();

    expect(() => service.createFleetPartner(undefined as never)).toThrowError(
      ApiRequestError,
    );
    expect(() =>
      service.createDriverFleetAffiliation("drv-demo-001", {
        fleetPartnerId: undefined,
        affiliationType: "managed_by",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      } as never),
    ).toThrowError(ApiRequestError);
  });
});
