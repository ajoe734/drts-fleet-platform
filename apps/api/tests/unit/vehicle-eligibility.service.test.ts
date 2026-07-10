import { describe, expect, it, vi } from "vitest";

import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

function createService(options?: {
  serviceProductOverrides?: Record<string, unknown>;
  vehicleLicenseTypes?: Record<string, string>;
  candidates?: Array<{
    vehicleId: string;
    driverId: string;
    operatingArea: string;
    serviceBuckets: string[];
    etaMinutes: number;
    currentLocation: null;
  }>;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(
      (serviceBucket: string, destination?: unknown) => {
        if (options?.candidates) {
          return options.candidates;
        }

        if (serviceBucket === "business_dispatch") {
          return [
            {
              vehicleId: "veh-demo-001",
              driverId: "drv-demo-001",
              operatingArea: "taichung-port",
              serviceBuckets: ["standard_taxi", "business_dispatch"],
              etaMinutes: 5,
              currentLocation: null,
            },
          ];
        }

        if (destination) {
          return [
            {
              vehicleId: "veh-demo-001",
              driverId: "drv-demo-001",
              operatingArea: "taichung-port",
              serviceBuckets: ["standard_taxi", "business_dispatch"],
              etaMinutes: 11,
              currentLocation: null,
            },
          ];
        }

        return [
          {
            vehicleId: "veh-demo-001",
            driverId: "drv-demo-001",
            operatingArea: "taichung-port",
            serviceBuckets: ["standard_taxi", "business_dispatch"],
            etaMinutes: 4,
            currentLocation: null,
          },
        ];
      },
    ),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(
      (vehicleId: string) => options?.vehicleLicenseTypes?.[vehicleId] ?? null,
    ),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  if (options?.serviceProductOverrides) {
    serviceProductService.createServiceProduct(
      options.serviceProductOverrides as never,
    );
  }

  return {
    service: new VehicleEligibilityService(
      regulatoryRegistryService as never,
      undefined,
      undefined,
      serviceProductService,
    ),
    regulatoryRegistryService,
  };
}

describe("VehicleEligibilityService", () => {
  it("filters eligible supply by service-product capability matrix", () => {
    const { service } = createService();

    const eligibleSupply = service.listEligibleSupply("enterprise_dispatch");

    expect(eligibleSupply).toHaveLength(1);
    expect(eligibleSupply[0]).toMatchObject({
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
      serviceProduct: "enterprise_dispatch",
      serviceTiming: "reservation",
    });
    expect(service.listMatrix()[0]).toMatchObject({
      conditionallyAllowed: false,
      requiredDocuments: [],
      trainingRequired: false,
      permitRequired: false,
    });
  });

  it("treats the seeded AV demo vehicle as a business-vehicle capability", () => {
    const { service } = createService({
      candidates: [
        {
          vehicleId: "veh-av-demo-001",
          driverId: "safety-op-001",
          operatingArea: "taichung-port",
          serviceBuckets: ["business_dispatch"],
          etaMinutes: 6,
          currentLocation: null,
        },
      ],
    });

    expect(service.listEligibleSupply("enterprise_dispatch")).toEqual([
      expect.objectContaining({
        vehicleId: "veh-av-demo-001",
        driverId: "safety-op-001",
        serviceProduct: "enterprise_dispatch",
      }),
    ]);
    expect(
      service.resolveRuntimeVehicleCapability("veh-av-demo-001"),
    ).toMatchObject({
      vehicleId: "veh-av-demo-001",
      licenseType: "business_vehicle",
      businessDispatchEligible: true,
    });
  });

  it("resolves runtime capability for registry-backed UUID vehicles", () => {
    const registryVehicleId = "10000000-0000-0000-0000-000000000353";
    const { service } = createService({
      candidates: [
        {
          vehicleId: registryVehicleId,
          driverId: "10000000-0000-0000-0000-000000000383",
          operatingArea: "taichung-port",
          serviceBuckets: ["business_dispatch"],
          etaMinutes: 4,
          currentLocation: null,
        },
      ],
      vehicleLicenseTypes: {
        [registryVehicleId]: "rental_car",
      },
    });

    expect(service.listEligibleSupply("enterprise_dispatch")).toEqual([
      expect.objectContaining({
        vehicleId: registryVehicleId,
        serviceProduct: "enterprise_dispatch",
      }),
    ]);
    expect(
      service.resolveRuntimeVehicleCapability(registryVehicleId),
    ).toMatchObject({
      vehicleId: registryVehicleId,
      licenseType: "rental_car",
      businessDispatchEligible: true,
    });
  });

  it("lists only the products a driver can currently serve", () => {
    const { service } = createService();

    const products = service.listDriverEligibleProducts("drv-demo-001");

    expect(products.map((entry) => entry.serviceProduct)).toEqual([
      "taxi_realtime",
      "enterprise_dispatch",
      "credit_card_airport_transfer",
      "third_party_forwarded_order",
    ]);
  });

  it("passes dispatch destination context through to registry selection", () => {
    const { service, regulatoryRegistryService } = createService();

    const eligibleSupply = service.listEligibleSupply("taxi_realtime", {
      destination: { lat: 25.033, lng: 121.5654 },
    });

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("standard_taxi", {
      lat: 25.033,
      lng: 121.5654,
    });
    expect(eligibleSupply[0]?.etaMinutes).toBe(11);
  });

  it("supports overriding the regulatory service bucket for forwarded matching", () => {
    const { service, regulatoryRegistryService } = createService();

    const eligibleSupply = service.listEligibleSupply(
      "third_party_forwarded_order",
      {
        serviceBucketOverride: "business_dispatch",
      },
    );

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("business_dispatch", null);
    expect(eligibleSupply).toHaveLength(1);
    expect(eligibleSupply[0]).toMatchObject({
      vehicleId: "veh-demo-001",
      serviceProduct: "third_party_forwarded_order",
    });
  });

  it("hides inactive service products from runtime eligibility", () => {
    const { service } = createService({
      serviceProductOverrides: {
        serviceProductType: "credit_card_airport_transfer",
        displayName: "Airport transfer",
        timing: "reservation",
        active: false,
        defaultBillingMode: "fixed_fare",
        defaultProofRequirements: ["photo", "signoff"],
      },
    });

    expect(() =>
      service.listEligibleSupply("credit_card_airport_transfer"),
    ).toThrowError();
    expect(
      service
        .listDriverEligibleProducts("drv-demo-001")
        .map((entry) => entry.serviceProduct),
    ).not.toContain("credit_card_airport_transfer");
  });

  it("applies runtime service-product license and meter overrides to eligibility", () => {
    const { service } = createService({
      serviceProductOverrides: {
        serviceProductType: "enterprise_dispatch",
        displayName: "Metered Enterprise Dispatch",
        timing: "reservation",
        active: true,
        allowedLicenseTypes: ["business_vehicle"],
        meterRequired: true,
        fixedFareAllowed: true,
        defaultBillingMode: "tenant_invoice",
        defaultProofRequirements: ["photo"],
      },
    });

    expect(service.listEligibleSupply("enterprise_dispatch")).toEqual([]);
  });
});
