import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Optional,
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
  UpdateDriverLicensesCommand,
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
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import type {
  DisclosureSubjectType,
  DisclosureReviewCommand,
} from "./disclosure-review.types";
import { ContractOperationalViewService } from "./contract-operational-view.service";
import type {
  DeliveryIntentStatus,
  ExpiryEntityType,
  ExpiryEventStatus,
} from "./regulatory-registry.repository";
import {
  RegulatoryRegistryService,
  type ReconcileExpiryCommand,
} from "./regulatory-registry.service";

@Controller("regulatory-registry")
export class RegulatoryRegistryController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    private readonly contractOperationalViewService?: ContractOperationalViewService,
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
  async initiateVehicleOffboarding(
    @Param("vehicleId") vehicleId: string,
    @Body() command: InitiateVehicleOffboardingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.initiateVehicleOffboarding(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("vehicles/:vehicleId/offboarding/complete-debranding")
  async completeVehicleDebranding(
    @Param("vehicleId") vehicleId: string,
    @Body() command: CompleteVehicleDebrandingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.completeVehicleDebranding(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Get("drivers")
  listDrivers(@Headers("x-request-id") requestId?: string) {
    const respond = () =>
      toApiSuccessEnvelope(
        {
          items: this.regulatoryRegistryService.listDrivers(),
        },
        requestId,
      );
    const refresh =
      this.regulatoryRegistryService.prepareMatchingSuppressions();
    return refresh instanceof Promise ? refresh.then(respond) : respond();
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
  async createDriver(
    @Body() command: CreateDriverMasterCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.createDriver(command, requestId),
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
  async updateDriverWorkState(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverWorkStateCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.updateDriverWorkStateFromPersistence(
        driverId,
        command,
      ),
      requestId,
    );
  }

  // `SD-DP-20260817-010` (PRD 11.4) makes this the platform's call, but it could
  // only ever be made at registration -- the one moment the platform knows least
  // about the driver.
  @Post("drivers/:driverId/service-buckets")
  async updateDriverServiceBuckets(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverServiceBucketsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.updateDriverServiceBuckets(
        driverId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("drivers/:driverId/lifecycle")
  async updateDriverLifecycle(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverMasterLifecycleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.updateDriverLifecycle(
        driverId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("drivers/expiring-licenses")
  listExpiringDriverLicenses(
    @Query("windowDays") windowDays?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const parsedDays = windowDays ? parseInt(windowDays, 10) : 30;
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listExpiringDriverLicenses(
          Number.isNaN(parsedDays) ? 30 : parsedDays,
        ),
      },
      requestId,
    );
  }

  @Post("drivers/:driverId/licenses")
  async updateDriverLicenses(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverLicensesCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.updateDriverLicenses(
        driverId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("contracts/expiring")
  listExpiringContracts(
    @Query("windowDays") windowDays?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const parsedDays = windowDays ? parseInt(windowDays, 10) : 30;
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listExpiringContracts(
          Number.isNaN(parsedDays) ? 30 : parsedDays,
        ),
      },
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
  async createContract(
    @Body() command: CreateVehicleContractCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.createContract(command),
      requestId,
    );
  }

  @Post("contracts/:contractId/activate")
  async activateContract(
    @Param("contractId") contractId: string,
    @Body() command: ActivateVehicleContractCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.activateContract(
        contractId,
        command,
      ),
      requestId,
    );
  }

  @Get("contracts/:contractId/operational-view")
  getContractOperationalView(
    @Param("contractId") contractId: string,
    @Headers("x-tenant-id") headerTenantId?: string,
    @Headers("x-partner-id") headerPartnerId?: string,
    @Headers("x-service-scope") headerServiceScope?: string,
    @Query("tenantId") queryTenantId?: string,
    @Query("partnerId") queryPartnerId?: string,
    @Query("serviceScope") queryServiceScope?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scopeContext = {
      tenantId: headerTenantId || queryTenantId || undefined,
      partnerId: headerPartnerId || queryPartnerId || undefined,
      serviceScope: headerServiceScope || queryServiceScope || undefined,
    };
    const view =
      this.requireContractOperationalViewService().getOperationalView(
        contractId,
        scopeContext,
      );
    return toApiSuccessEnvelope(view, requestId);
  }

  @Get("contracts/:contractId/operational-terms")
  getContractOperationalTerms(
    @Param("contractId") contractId: string,
    @Headers("x-tenant-id") headerTenantId?: string,
    @Headers("x-partner-id") headerPartnerId?: string,
    @Headers("x-service-scope") headerServiceScope?: string,
    @Query("tenantId") queryTenantId?: string,
    @Query("partnerId") queryPartnerId?: string,
    @Query("serviceScope") queryServiceScope?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scopeContext = {
      tenantId: headerTenantId || queryTenantId || undefined,
      partnerId: headerPartnerId || queryPartnerId || undefined,
      serviceScope: headerServiceScope || queryServiceScope || undefined,
    };
    const terms =
      this.requireContractOperationalViewService().getOperationalTerms(
        contractId,
        scopeContext,
      );
    return toApiSuccessEnvelope(terms, requestId);
  }

  @Get("contracts/:contractId")
  getContract(
    @Param("contractId") contractId: string,
    @Headers("x-tenant-id") headerTenantId?: string,
    @Headers("x-partner-id") headerPartnerId?: string,
    @Headers("x-service-scope") headerServiceScope?: string,
    @Query("tenantId") queryTenantId?: string,
    @Query("partnerId") queryPartnerId?: string,
    @Query("serviceScope") queryServiceScope?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scopeContext = {
      tenantId: headerTenantId || queryTenantId || undefined,
      partnerId: headerPartnerId || queryPartnerId || undefined,
      serviceScope: headerServiceScope || queryServiceScope || undefined,
    };
    const contract =
      this.requireContractOperationalViewService().validateContractScope(
        contractId,
        scopeContext,
      );
    return toApiSuccessEnvelope(contract, requestId);
  }

  private requireContractOperationalViewService(): ContractOperationalViewService {
    if (!this.contractOperationalViewService) {
      throw new ApiRequestError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "SERVICE_UNAVAILABLE",
        "Contract operational view service is not available.",
      );
    }
    return this.contractOperationalViewService;
  }

  @Get("policies/expiring")
  listExpiringPolicies(
    @Query("windowDays") windowDays?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const parsedDays = windowDays ? parseInt(windowDays, 10) : 30;
    return toApiSuccessEnvelope(
      {
        items: this.regulatoryRegistryService.listExpiringPolicies(
          Number.isNaN(parsedDays) ? 30 : parsedDays,
        ),
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
  async createInsurancePolicy(
    @Body() command: CreateInsurancePolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.createInsurancePolicy(command),
      requestId,
    );
  }

  @Post("policies/:policyId/activate")
  async activateInsurancePolicy(
    @Param("policyId") policyId: string,
    @Body() command: ActivateInsurancePolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.activateInsurancePolicy(
        policyId,
        command,
      ),
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
  async submitExclusivityReview(
    @Param("vehicleId") vehicleId: string,
    @Body() command: SubmitExclusivityReviewCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.submitExclusivityReview(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("exclusivities/:vehicleId/approve")
  async approveExclusivity(
    @Param("vehicleId") vehicleId: string,
    @Body() command: ApproveExclusivityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.approveExclusivity(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Post("exclusivities/:vehicleId/reject")
  async rejectExclusivity(
    @Param("vehicleId") vehicleId: string,
    @Body() command: RejectExclusivityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.rejectExclusivity(
        vehicleId,
        command,
      ),
      requestId,
    );
  }

  @Get("disclosure-reviews")
  async listDisclosureReviews(
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.listDisclosureReviews(identity),
      requestId,
    );
  }

  @Get("disclosure-reviews/:subjectType/:subjectId")
  async getDisclosureReview(
    @Param("subjectType") type: DisclosureSubjectType,
    @Param("subjectId") id: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.getDisclosureReview(
        type,
        id,
        identity,
      ),
      requestId,
    );
  }

  @Post("disclosure-reviews/:subjectType/:subjectId")
  @RequireScopes("regulatory:write")
  async reviewDisclosure(
    @Param("subjectType") type: DisclosureSubjectType,
    @Param("subjectId") id: string,
    @Body() command: DisclosureReviewCommand,
    @Headers("idempotency-key") key?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.reviewDisclosure(
        type,
        id,
        command,
        key,
        identity,
      ),
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

  @Post("credentials/reconcile-expiry")
  async reconcileExpiry(
    @Body() command?: ReconcileExpiryCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result =
      await this.regulatoryRegistryService.reconcileExpiredCredentials(command);
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get("expiry-backlog")
  async getExpiryBacklog(
    @Query("scope") scope?: string,
    @Query("entityType") entityType?: ExpiryEntityType,
    @Query("status") status?: ExpiryEventStatus,
    @Query("limit") limitRaw?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const limit = limitRaw
      ? this.parseFiniteQueryNumber(limitRaw, "limit")
      : undefined;
    const backlog = await this.regulatoryRegistryService.getExpiryBacklog({
      ...(scope ? { scope } : {}),
      ...(entityType ? { entityType } : {}),
      ...(status ? { status } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return toApiSuccessEnvelope(backlog, requestId);
  }

  @Get("expiry-receipts")
  async getExpiryReceipts(
    @Query("tenantId") tenantId?: string,
    @Query("deliveryStatus") deliveryStatus?: DeliveryIntentStatus,
    @Query("limit") limitRaw?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const limit = limitRaw
      ? this.parseFiniteQueryNumber(limitRaw, "limit")
      : undefined;
    const receipts = await this.regulatoryRegistryService.getExpiryReceipts({
      ...(tenantId ? { tenantId } : {}),
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return toApiSuccessEnvelope(receipts, requestId);
  }

  @Get("partners/:partnerId/contacts")
  getFleetPartnerContacts(
    @Param("partnerId") partnerId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        partnerId,
        emails: this.regulatoryRegistryService.getFleetPartnerContacts(
          partnerId,
        ),
      },
      requestId,
    );
  }

  @Post("partners/:partnerId/contacts")
  registerFleetPartnerContacts(
    @Param("partnerId") partnerId: string,
    @Body() body: { emails?: readonly string[] | string; email?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    const input = body?.emails ?? (body?.email ? [body.email] : []);
    const emails = this.regulatoryRegistryService.registerFleetPartnerContacts(
      partnerId,
      input,
    );
    return toApiSuccessEnvelope(
      {
        partnerId,
        emails,
      },
      requestId,
    );
  }

  @Get("expiry-events/:eventId")
  async getExpiryEvent(
    @Param("eventId") eventId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const event = await this.regulatoryRegistryService.getExpiryEvent(eventId);
    if (!event) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CREDENTIAL_EXPIRY_EVENT_NOT_FOUND",
        `Expiry event '${eventId}' not found.`,
      );
    }
    return toApiSuccessEnvelope(event, requestId);
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

/**
 * Scheduled reconciliation entry point for GCP Cloud Scheduler (WIF Entry C).
 *
 * Architectural choice (BUREAU-R14):
 * Cloud Run scales to zero when idle, so an unmonitored in-process `setInterval`
 * (`ENABLE_EXPIRY_RECONCILIATION_LOOP`) is not reliable on shared dev/prod.
 * Instead, periodic expiry & pre-expiry reconciliation is wired identically to
 * `drts-dev-mail-outbox-drain` and `drts-billing-monthly`: Cloud Scheduler sends
 * an OIDC-authenticated POST request as `drts-dev-scheduler` (system realm,
 * scope `regulatory:write`) to this internal route.
 */
@Controller()
export class RegulatoryExpiryScheduledController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Post("internal/scheduled-tasks/regulatory-expiry/run")
  @RequireRealms("system")
  @RequireScopes("regulatory:write")
  async run(
    @Body() command: ReconcileExpiryCommand | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (
      !identity ||
      identity.realm !== "system" ||
      identity.actorType !== "system" ||
      !identity.scopes.includes("regulatory:write")
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Only the authorized system regulatory expiry scheduler workload can run this reconciliation.",
      );
    }
    const result =
      await this.regulatoryRegistryService.reconcileExpiredCredentials(command);
    return toApiSuccessEnvelope(result, requestId ?? idempotencyKey);
  }
}
