import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  ActivateInsurancePolicyCommand,
  ActivateVehicleContractCommand,
  ApproveExclusivityCommand,
  CompleteVehicleDebrandingCommand,
  CreateDriverMasterCommand,
  CreateInsurancePolicyCommand,
  CreateVehicleContractCommand,
  DriverLocationHeartbeatCommand,
  InitiateVehicleOffboardingCommand,
  RejectExclusivityCommand,
  RegulatoryRegistrySummary,
  SubmitExclusivityReviewCommand,
  UpdateDriverMasterLifecycleCommand,
  UpdateDriverServiceBucketsCommand,
  UpdateDriverWorkStateCommand,
  UpdateVehicleComplianceCommand,
  PassengerServiceRuntimeProfile,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Controller("regulatory-registry")
export class RegulatoryRegistryController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Get("summary")
  getSummary(@Headers("x-request-id") requestId?: string) {
    const summary: RegulatoryRegistrySummary = {
      entities: [
        "vehicle",
        "vehicle_reg_profile",
        "driver",
        "driver_reg_profile",
        "qualification_profile",
      ],
      bootstrapSources: [
        "infra/migrations/V0012__phase1_remaining_runtime_snapshots.sql",
        "infra/migrations/V0013__phase1_source_of_truth_snapshots.sql",
      ],
      notes: [
        "Vehicle, driver, contract, insurance, and exclusivity runtime truth stays in the regulatory registry lane.",
        "Dispatchability is derived from compliance flags rather than dispatch logic.",
      ],
    };

    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("passenger-runtime-profiles/:code")
  getPassengerRuntimeProfile(
    @Param("code") code: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (code !== "multi_taxi_direct") {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "RUNTIME_PROFILE_NOT_FOUND",
        `Passenger service runtime profile '${code}' not found.`,
      );
    }

    const profile: PassengerServiceRuntimeProfile = {
      code: "multi_taxi_direct",
      displayName: "Multi-Taxi Direct",
      orderDomains: ["owned"],
      allowedServiceProducts: ["taxi_reservation"],
      acquisitionMode: "platform_reserved",
      timingModes: ["on_demand", "scheduled"],
      passengerSurface: "direct_ride",
      driverSurface: "multi_taxi_driver",
      opsSurface: "multi_taxi_ops",
      forbiddenCapabilities: [
        "forwarded_order_ui",
        "external_platform_badge",
        "sandbox_disclosure",
        "av_fulfillment",
        "safety_operator",
        "remote_takeover",
      ],
    };

    return toApiSuccessEnvelope(profile, requestId);
  }

  @Get("vehicles")
  listVehicles(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listVehicles(),
      },
      requestId,
    );
  }

  @Post("vehicles/:vehicleId/compliance")
  updateVehicleCompliance(
    @Param("vehicleId") vehicleId: string,
    @Body() command: UpdateVehicleComplianceCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.updateVehicleCompliance(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("vehicles/:vehicleId/offboarding")
  initiateVehicleOffboarding(
    @Param("vehicleId") vehicleId: string,
    @Body() command: InitiateVehicleOffboardingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.initiateVehicleOffboarding(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("vehicles/:vehicleId/offboarding/complete-debranding")
  completeVehicleDebranding(
    @Param("vehicleId") vehicleId: string,
    @Body() command: CompleteVehicleDebrandingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.completeVehicleDebranding(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Get("drivers")
  listDrivers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listDrivers(),
      },
      requestId,
    );
  }

  @Get("driver-locations")
  listDriverLocations(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listLatestDriverLocations(),
      },
      requestId,
    );
  }

  @Post("drivers")
  createDriver(
    @Body() command: CreateDriverMasterCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.createDriver(command, requestId),
      requestId,
    );
  }

  @Post("driver-location")
  async recordDriverLocation(
    @Body() command: DriverLocationHeartbeatCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.recordDriverLocation(command),
      requestId,
    );
  }

  @Get("driver-eta")
  async getDriverEta(
    @Query("driverId") driverId: string,
    @Query("destLat") destLat: string,
    @Query("destLng") destLng: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.getDriverEta(
        driverId,
        this.parseFiniteQueryNumber(destLat, "destLat"),
        this.parseFiniteQueryNumber(destLng, "destLng"),
      ),
      requestId,
    );
  }

  @Post("drivers/:driverId/work-state")
  updateDriverWorkState(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverWorkStateCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.updateDriverWorkState(driverId, command),
      requestId,
    );
  }

  // `SD-DP-20260817-010` (PRD 11.4) makes this the platform's call, but it could
  // only ever be made at registration -- the one moment the platform knows least
  // about the driver.
  @Post("drivers/:driverId/service-buckets")
  updateDriverServiceBuckets(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverServiceBucketsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.updateDriverServiceBuckets(
        driverId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("drivers/:driverId/lifecycle")
  updateDriverLifecycle(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverMasterLifecycleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.updateDriverLifecycle(
        driverId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("contracts")
  listContracts(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listContracts(),
      },
      requestId,
    );
  }

  @Post("contracts")
  createContract(
    @Body() command: CreateVehicleContractCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.createContract(command),
      requestId,
    );
  }

  @Post("contracts/:contractId/activate")
  activateContract(
    @Param("contractId") contractId: string,
    @Body() command: ActivateVehicleContractCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.activateContract(contractId, command),
      requestId,
    );
  }

  @Get("policies/expiring")
  listExpiringPolicies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listExpiringPolicies(),
      },
      requestId,
    );
  }

  @Get("policies")
  listPolicies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listPolicies(),
      },
      requestId,
    );
  }

  @Post("policies")
  createInsurancePolicy(
    @Body() command: CreateInsurancePolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.createInsurancePolicy(command),
      requestId,
    );
  }

  @Post("policies/:policyId/activate")
  activateInsurancePolicy(
    @Param("policyId") policyId: string,
    @Body() command: ActivateInsurancePolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.activateInsurancePolicy(policyId, command),
      requestId,
    );
  }

  @Get("exclusivities")
  listExclusivities(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listExclusivities(),
      },
      requestId,
    );
  }

  @Post("exclusivities/:vehicleId/submit-review")
  submitExclusivityReview(
    @Param("vehicleId") vehicleId: string,
    @Body() command: SubmitExclusivityReviewCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.submitExclusivityReview(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("exclusivities/:vehicleId/approve")
  approveExclusivity(
    @Param("vehicleId") vehicleId: string,
    @Body() command: ApproveExclusivityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.approveExclusivity(vehicleId, command),
      requestId,
    );
  }

  @Post("exclusivities/:vehicleId/reject")
  rejectExclusivity(
    @Param("vehicleId") vehicleId: string,
    @Body() command: RejectExclusivityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryRegistryService.rejectExclusivity(vehicleId, command),
      requestId,
    );
  }

  @Get("vehicles/:vehicleId/disclosure-profile")
  getVehiclePassengerDisclosureProfile(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const profile =
      this.regulatoryRegistryService.getVehiclePassengerDisclosureProfile(
        vehicleId,
      );
    if (!profile) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DISCLOSURE_PROFILE_NOT_FOUND",
        `Vehicle passenger disclosure profile for '${vehicleId}' not found.`,
      );
    }
    return toApiSuccessEnvelope(profile, requestId);
  }

  @Get("drivers/:driverId/registration-credential")
  getDriverPublicRegistrationCredential(
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const credential =
      this.regulatoryRegistryService.getDriverPublicRegistrationCredential(
        driverId,
      );
    if (!credential) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CREDENTIAL_NOT_FOUND",
        `Driver public registration credential for '${driverId}' not found.`,
      );
    }
    const projected = {
      ...credential,
      registrationNo: credential.maskedDisplay,
    };
    return toApiSuccessEnvelope(projected, requestId);
  }

  private parseFiniteQueryNumber(
    value: string | undefined,
    fieldName: string,
  ): number {
    const normalizedValue = value?.trim() ?? "";
    if (normalizedValue.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_NUMBER",
        `${fieldName} must be a finite number.`,
        {
          field: fieldName,
        },
      );
    }

    const numericValue = Number(normalizedValue);
    if (!Number.isFinite(numericValue)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_NUMBER",
        `${fieldName} must be a finite number.`,
        {
          field: fieldName,
        },
      );
    }

    return numericValue;
  }
}
