import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import { IncidentService } from "../../src/modules/incident/incident.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SearchController } from "../../src/modules/search/search.controller";
import { SearchService } from "../../src/modules/search/search.service";
import { ShiftAttendanceService } from "../../src/modules/shift-attendance/shift-attendance.service";

async function createHarness() {
  const auditNotificationService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
  );
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
  };
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService as never,
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    opsDispatchEventsService,
  );
  const forwarderService = new ForwarderService(
    regulatoryRegistryService,
    auditNotificationService,
    [],
    undefined,
    ownedMobilityService,
  );
  const shiftAttendanceService = new ShiftAttendanceService(
    auditNotificationService,
  );
  const complaintService = new ComplaintService(auditNotificationService);
  const incidentService = new IncidentService(auditNotificationService);

  await forwarderService.onModuleInit();

  const searchService = new SearchService(
    ownedMobilityService,
    forwarderService,
    regulatoryRegistryService,
    driverProfileService,
    shiftAttendanceService,
    complaintService,
    incidentService,
  );

  const order = ownedMobilityService.createPassengerOrder({
    pickup: {
      address: "Search Pickup 001",
      lat: 24.2657,
      lng: 120.5678,
    },
    dropoff: {
      address: "Search Dropoff 001",
      lat: 24.1706,
      lng: 120.6105,
    },
    passenger: {
      name: "Passenger 001",
      phone: "+886-900-000-001",
    },
  });
  ownedMobilityService.dispatchOrder(order.orderId, { mode: "auto" });

  forwarderService.ingestExternalOrder({
    platformCode: "forwarder_sandbox",
    externalOrderId: "external-001",
    payload: {
      note: "Dispatch mirror 001",
    },
  });

  shiftAttendanceService.clockIn({
    driverId: "drv-demo-001",
    vehicleId: "veh-demo-001",
    location: "Depot 001",
  });

  complaintService.createComplaintCase({
    caseSource: "ops",
    relatedOrderId: order.orderId,
    category: "route_issue",
    severity: "high",
    description: "Complaint 001 for delayed passenger follow-up.",
  });

  incidentService.createIncident({
    title: "Incident 001 dispatch follow-up",
    description: "Incident 001 needs coordinated ops review.",
    category: "operational",
    severity: "high",
    relatedOrderId: order.orderId,
    relatedVehicleId: "veh-demo-001",
    relatedDriverId: "drv-demo-001",
    reportedBy: "ops-user-001",
  });

  return {
    searchService,
    controller: new SearchController(searchService),
  };
}

describe("SearchService.searchOps", () => {
  it("returns grouped cross-entity results for ops search", async () => {
    const { searchService } = await createHarness();

    const result = searchService.searchOps("001");

    expect(result.query).toBe("001");
    expect(result.groups.map((group) => group.category)).toEqual([
      "orders",
      "dispatch",
      "drivers",
      "vehicles",
      "complaints",
      "incidents",
    ]);
    expect(result.totalResults).toBeGreaterThanOrEqual(7);

    const dispatchGroup = result.groups.find(
      (group) => group.category === "dispatch",
    );
    expect(dispatchGroup?.items.map((item) => item.resourceType)).toEqual(
      expect.arrayContaining(["dispatch_job", "forwarded_order"]),
    );

    const driverGroup = result.groups.find(
      (group) => group.category === "drivers",
    );
    expect(driverGroup?.items[0]).toEqual(
      expect.objectContaining({
        resourceId: "drv-demo-001",
        primaryLabel: "Driver Demo One",
        link: expect.objectContaining({
          route: "/drivers/drv-demo-001",
        }),
      }),
    );
  });

  it("filters results to the requested categories", async () => {
    const { searchService } = await createHarness();

    const result = searchService.searchOps("001", "drivers,incidents");

    expect(result.types).toEqual(["drivers", "incidents"]);
    expect(result.groups.map((group) => group.category)).toEqual([
      "drivers",
      "incidents",
    ]);
    expect(
      result.groups.flatMap((group) =>
        group.items.map((item) => item.category),
      ),
    ).toEqual(["drivers", "incidents"]);
  });

  it("rejects blank search queries", async () => {
    const { searchService } = await createHarness();

    expect(() => searchService.searchOps("   ")).toThrowError(ApiRequestError);

    try {
      searchService.searchOps("   ");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "SEARCH_QUERY_REQUIRED",
          }),
        }),
      );
    }
  });
});

describe("SearchController.searchOps", () => {
  it("wraps grouped search results in the API success envelope", async () => {
    const { controller } = await createHarness();

    const response = controller.searchOps(
      "001",
      "orders,vehicles",
      "req-search-001",
    );

    expect(response.meta.requestId).toBe("req-search-001");
    expect(response.data.groups.map((group) => group.category)).toEqual([
      "orders",
      "vehicles",
    ]);
  });
});
