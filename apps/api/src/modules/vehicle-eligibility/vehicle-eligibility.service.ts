import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  DispatchCandidate,
  OwnedOrderRecord,
  Phase1ServiceBucket,
  ServiceProductType,
  ServiceTiming,
  VehicleLicenseType,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";

type ServiceProductDefinition = {
  serviceProduct: ServiceProductType;
  displayName: string;
  timing: ServiceTiming;
  active: boolean;
  serviceBucket: "standard_taxi" | "business_dispatch";
  requiredVehicleLicenseTypes: VehicleLicenseType[];
  requiresBusinessDispatchEligible: boolean;
  requiresAirportPermit: boolean;
  requiresFixedFareAllowed: boolean;
  requiresPlatformForwardingAllowed: boolean;
  defaultProofRequirements: string[];
};

type VehicleCapability = {
  vehicleId: string;
  licenseType: VehicleLicenseType;
  supportedProducts: ServiceProductType[];
  seatCount: number;
  luggageCapacity: number;
  airportPermit: boolean;
  businessDispatchEligible: boolean;
  fixedFareAllowed: boolean;
  platformForwardingAllowed: boolean;
  active: boolean;
};

export type EligibleSupplyRecord = DispatchCandidate & {
  serviceProduct: ServiceProductType;
  serviceTiming: ServiceTiming;
};

export type DriverEligibleProductRecord = {
  serviceProduct: ServiceProductType;
  displayName: string;
  timing: ServiceTiming;
  defaultProofRequirements: string[];
  eligibleVehicleIds: string[];
};

type EligibleSupplyContext = {
  destination?: {
    lat: number;
    lng: number;
  } | null;
  serviceBucketOverride?: Phase1ServiceBucket;
};

const SERVICE_PRODUCTS: ServiceProductDefinition[] = [
  {
    serviceProduct: "taxi_realtime",
    displayName: "Taxi Realtime",
    timing: "realtime",
    active: true,
    serviceBucket: "standard_taxi",
    requiredVehicleLicenseTypes: ["taxi", "multi_purpose_taxi"],
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresFixedFareAllowed: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: [],
  },
  {
    serviceProduct: "taxi_reservation",
    displayName: "Taxi Reservation",
    timing: "reservation",
    active: false,
    serviceBucket: "standard_taxi",
    requiredVehicleLicenseTypes: ["taxi", "multi_purpose_taxi"],
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresFixedFareAllowed: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: [],
  },
  {
    serviceProduct: "enterprise_dispatch",
    displayName: "Enterprise Dispatch",
    timing: "reservation",
    active: true,
    serviceBucket: "business_dispatch",
    requiredVehicleLicenseTypes: [
      "taxi",
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
    ],
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: false,
    requiresFixedFareAllowed: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo"],
  },
  {
    serviceProduct: "credit_card_airport_transfer",
    displayName: "Credit Card Airport Transfer",
    timing: "reservation",
    active: true,
    serviceBucket: "business_dispatch",
    requiredVehicleLicenseTypes: [
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
      "airport_transfer_vehicle",
    ],
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: true,
    requiresFixedFareAllowed: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo", "signoff"],
  },
  {
    serviceProduct: "insurance_replacement_vehicle",
    displayName: "Insurance Replacement Vehicle",
    timing: "reservation",
    active: false,
    serviceBucket: "business_dispatch",
    requiredVehicleLicenseTypes: ["rental_car", "business_vehicle"],
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: false,
    requiresFixedFareAllowed: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo"],
  },
  {
    serviceProduct: "travel_agency_transfer",
    displayName: "Travel Agency Transfer",
    timing: "reservation",
    active: false,
    serviceBucket: "business_dispatch",
    requiredVehicleLicenseTypes: [
      "business_vehicle",
      "airport_transfer_vehicle",
    ],
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: true,
    requiresFixedFareAllowed: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo", "signoff"],
  },
  {
    serviceProduct: "third_party_forwarded_order",
    displayName: "Third-party Forwarded Order",
    timing: "external_defined",
    active: true,
    serviceBucket: "standard_taxi",
    requiredVehicleLicenseTypes: ["taxi", "multi_purpose_taxi"],
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresFixedFareAllowed: false,
    requiresPlatformForwardingAllowed: true,
    defaultProofRequirements: [],
  },
];

const VEHICLE_CAPABILITY_SEED: VehicleCapability[] = [
  {
    vehicleId: "veh-demo-001",
    licenseType: "taxi",
    supportedProducts: [
      "taxi_realtime",
      "enterprise_dispatch",
      "third_party_forwarded_order",
    ],
    seatCount: 4,
    luggageCapacity: 2,
    airportPermit: false,
    businessDispatchEligible: true,
    fixedFareAllowed: true,
    platformForwardingAllowed: true,
    active: true,
  },
  {
    vehicleId: "veh-demo-002",
    licenseType: "taxi",
    supportedProducts: ["taxi_realtime", "third_party_forwarded_order"],
    seatCount: 4,
    luggageCapacity: 1,
    airportPermit: false,
    businessDispatchEligible: false,
    fixedFareAllowed: false,
    platformForwardingAllowed: true,
    active: true,
  },
  {
    vehicleId: "veh-demo-003",
    licenseType: "taxi",
    supportedProducts: ["taxi_realtime"],
    seatCount: 4,
    luggageCapacity: 1,
    airportPermit: false,
    businessDispatchEligible: false,
    fixedFareAllowed: false,
    platformForwardingAllowed: false,
    active: true,
  },
];

@Injectable()
export class VehicleEligibilityService {
  private readonly serviceProducts = new Map(
    SERVICE_PRODUCTS.map((entry) => [entry.serviceProduct, entry]),
  );

  private readonly vehicleCapabilities = new Map(
    VEHICLE_CAPABILITY_SEED.map((entry) => [entry.vehicleId, entry]),
  );

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  listEligibleSupply(
    serviceProduct: ServiceProductType,
    context?: EligibleSupplyContext,
  ): EligibleSupplyRecord[] {
    const definition = this.requireActiveServiceProduct(serviceProduct);
    const serviceBucket =
      context?.serviceBucketOverride ?? definition.serviceBucket;
    return this.regulatoryRegistryService
      .getEligibleCandidates(serviceBucket, context?.destination ?? null)
      .filter((candidate) =>
        this.isVehicleEligibleForServiceProduct(
          candidate.vehicleId,
          definition.serviceProduct,
        ),
      )
      .map((candidate) => ({
        ...candidate,
        serviceProduct: definition.serviceProduct,
        serviceTiming: definition.timing,
      }));
  }

  listDriverEligibleProducts(driverId: string): DriverEligibleProductRecord[] {
    return SERVICE_PRODUCTS.filter((entry) => entry.active)
      .map((entry) => {
        const vehicleIds = this.listEligibleSupply(entry.serviceProduct)
          .filter((candidate) => candidate.driverId === driverId)
          .map((candidate) => candidate.vehicleId);
        return {
          serviceProduct: entry.serviceProduct,
          displayName: entry.displayName,
          timing: entry.timing,
          defaultProofRequirements: [...entry.defaultProofRequirements],
          eligibleVehicleIds: [...new Set(vehicleIds)],
        };
      })
      .filter((entry) => entry.eligibleVehicleIds.length > 0);
  }

  resolveServiceProductForOwnedOrder(
    order: Pick<OwnedOrderRecord, "serviceBucket" | "businessDispatchSubtype">,
  ): ServiceProductType {
    if (order.serviceBucket === "standard_taxi") {
      return "taxi_realtime";
    }

    if (order.businessDispatchSubtype === "enterprise_dispatch") {
      return "enterprise_dispatch";
    }

    if (order.businessDispatchSubtype === "credit_card_airport_transfer") {
      return "credit_card_airport_transfer";
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SERVICE_PRODUCT_INACTIVE",
      "The order does not map to an active service product.",
    );
  }

  assertDispatchAssignmentEligible(
    order: Pick<OwnedOrderRecord, "serviceBucket" | "businessDispatchSubtype">,
    vehicleId: string,
    driverId: string,
  ) {
    const serviceProduct = this.resolveServiceProductForOwnedOrder(order);
    const definition = this.requireActiveServiceProduct(serviceProduct);
    const capability = this.requireVehicleCapability(vehicleId);

    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        vehicleId,
        definition.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle is not eligible for the requested service product.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (
      !capability.active ||
      !capability.supportedProducts.includes(serviceProduct)
    ) {
      this.throwVehicleNotEligible(
        vehicleId,
        serviceProduct,
        "unsupported_product",
      );
    }

    if (
      !definition.requiredVehicleLicenseTypes.includes(capability.licenseType)
    ) {
      this.throwVehicleNotEligible(vehicleId, serviceProduct, "license_type");
    }

    if (
      definition.requiresBusinessDispatchEligible &&
      !capability.businessDispatchEligible
    ) {
      this.throwVehicleNotEligible(
        vehicleId,
        serviceProduct,
        "business_dispatch_eligibility",
      );
    }

    if (definition.requiresAirportPermit && !capability.airportPermit) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AIRPORT_PERMIT_REQUIRED",
        "Airport permit is required for the requested service product.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (definition.requiresFixedFareAllowed && !capability.fixedFareAllowed) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIXED_FARE_NOT_ALLOWED",
        "Vehicle cannot take fixed-fare service products.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (
      definition.requiresPlatformForwardingAllowed &&
      !capability.platformForwardingAllowed
    ) {
      this.throwVehicleNotEligible(
        vehicleId,
        serviceProduct,
        "platform_forwarding_not_allowed",
      );
    }

    if (
      !this.regulatoryRegistryService.getDriverAvailability(
        driverId,
        definition.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Driver is not eligible for the requested service product.",
        {
          driverId,
          serviceProduct,
        },
      );
    }
  }

  private isVehicleEligibleForServiceProduct(
    vehicleId: string,
    serviceProduct: ServiceProductType,
  ) {
    const capability = this.vehicleCapabilities.get(vehicleId);
    const definition = this.serviceProducts.get(serviceProduct);

    if (!capability || !definition || !capability.active) {
      return false;
    }

    return (
      capability.supportedProducts.includes(serviceProduct) &&
      definition.requiredVehicleLicenseTypes.includes(capability.licenseType) &&
      (!definition.requiresBusinessDispatchEligible ||
        capability.businessDispatchEligible) &&
      (!definition.requiresAirportPermit || capability.airportPermit) &&
      (!definition.requiresFixedFareAllowed || capability.fixedFareAllowed) &&
      (!definition.requiresPlatformForwardingAllowed ||
        capability.platformForwardingAllowed)
    );
  }

  private requireActiveServiceProduct(serviceProduct: ServiceProductType) {
    const definition = this.serviceProducts.get(serviceProduct);
    if (!definition || !definition.active) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SERVICE_PRODUCT_INACTIVE",
        "Service product is inactive or unsupported.",
        {
          serviceProduct,
        },
      );
    }

    return definition;
  }

  private requireVehicleCapability(vehicleId: string) {
    const capability = this.vehicleCapabilities.get(vehicleId);
    if (!capability) {
      this.throwVehicleNotEligible(
        vehicleId,
        "taxi_realtime",
        "missing_capability",
      );
    }

    return capability;
  }

  private throwVehicleNotEligible(
    vehicleId: string,
    serviceProduct: ServiceProductType,
    reason: string,
  ): never {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
      "Vehicle is not eligible for the requested service product.",
      {
        vehicleId,
        serviceProduct,
        reason,
      },
    );
  }
}
