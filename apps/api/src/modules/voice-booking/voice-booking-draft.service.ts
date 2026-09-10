import { assertAutonomousServiceArea } from "../service-area/autonomous-service-area";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  voiceAbsoluteTimeSchema,
  voiceOrdinaryRuntimeMappingSchema,
} from "@drts/contracts";
import type {
  BookingQualification,
  BookingRequirements,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import {
  VoiceLocationService,
  type VoiceLocationSelection,
} from "../geo/voice-location.service";
import { ServiceAreaService } from "../service-area/service-area.service";
import { ServiceProductService } from "../service-product/service-product.service";
import { validateBookingRequirements } from "../vehicle-eligibility/booking-requirements";
import { VoiceBookingRepository } from "./voice-booking.repository";

export interface QualifyVoiceBookingCommand {
  pickup: VoiceLocationSelection;
  dropoff: VoiceLocationSelection;
  timingMode: "on_demand" | "scheduled";
  requestedAt: string;
  timeZone: "Asia/Taipei";
  requirements: Omit<
    BookingRequirements,
    "policyVersion" | "validationReference"
  >;
}

/** Domain preparation only. The receipt/confirmation writer consumes this
 * snapshot and must re-run qualification at its commit boundary. No legacy
 * agentId is invented and this service cannot create an order. */
@Injectable()
export class VoiceBookingDraftService {
  constructor(
    private readonly repository: VoiceBookingRepository,
    private readonly locations: VoiceLocationService,
    private readonly areas: ServiceAreaService,
    private readonly products: ServiceProductService,
  ) {}

  async qualify(
    voiceSessionId: string,
    command: QualifyVoiceBookingCommand,
  ): Promise<{
    bookingRequirements: BookingRequirements;
    bookingQualification: BookingQualification;
  }> {
    const session = await this.repository.findSessionById(voiceSessionId);
    if (
      !session ||
      session.controlOwner !== "ai" ||
      session.dialogState === "closed"
    )
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "An active AI session is required.",
      );
    const scope = await this.repository.findResourceScopeById(
      session.resourceScopeId,
    );
    const mapping = voiceOrdinaryRuntimeMappingSchema.safeParse(
      scope?.runtimeMapping,
    );
    // SD §4.3: multi_taxi_direct has its own authorization/acquisition/queue
    // semantics. v0.2 routes it to the operator, never the ordinary command.
    if (
      !scope ||
      scope.status !== "active" ||
      !mapping.success ||
      scope.runtimeMapping.operatingAuthorizationId != null
    )
      throw new ApiRequestError(
        409,
        "VOICE_PRODUCT_HANDOFF_REQUIRED",
        "This runtime requires its dedicated operator.",
      );
    if (command.timingMode !== "on_demand")
      throw new ApiRequestError(
        409,
        "VOICE_RESERVATION_NOT_ENABLED",
        "Reservation must retain its requested time and be handed off.",
      );
    const parsedTime = voiceAbsoluteTimeSchema.safeParse(command.requestedAt);
    const requestedMs = parsedTime.success ? Date.parse(parsedTime.data) : NaN;
    if (
      !Number.isFinite(requestedMs) ||
      command.timeZone !== "Asia/Taipei" ||
      Math.abs(requestedMs - Date.now()) > 120_000
    )
      throw new ApiRequestError(
        409,
        "VOICE_ABSOLUTE_TIME_REQUIRED",
        "Confirm an absolute immediate pickup time in the operating timezone.",
      );
    const product =
      this.products.getRuntimeServiceProductByType("taxi_realtime");
    if (!product?.active || product.timing !== "realtime")
      throw new ApiRequestError(
        409,
        "VOICE_PRODUCT_HANDOFF_REQUIRED",
        "The immediate product is not active.",
      );
    const policy = this.products.assertRuntimeProfileServiceProductActive(
      "ordinary_taxi",
      "taxi_realtime",
    );
    const bookingRequirements = validateBookingRequirements({
      ...command.requirements,
      policyVersion: `voice-v1:${scope.version}:${policy.updatedAt}:${product.updatedAt}`,
      validationReference: randomUUID(),
    });
    const pickup = await this.locations.resolve(command.pickup);
    const dropoff = await this.locations.resolve(command.dropoff);
    const requestedAt = new Date(requestedMs).toISOString();
    const serviceArea = this.areas.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: pickup.address,
      dropoff: dropoff.address,
      requestedAt,
    });
    assertAutonomousServiceArea(serviceArea);
    const validUntil = new Date(
      Math.min(
        Date.parse(pickup.validUntil),
        Date.parse(dropoff.validUntil),
        requestedMs + 120_000,
      ),
    ).toISOString();
    const currentSession =
      await this.repository.findSessionById(voiceSessionId);
    const currentScope = await this.repository.findResourceScopeById(
      scope.scopeId,
    );
    if (
      !currentSession ||
      currentSession.sessionVersion !== session.sessionVersion ||
      currentSession.inputEpoch !== session.inputEpoch ||
      currentSession.controlOwner !== "ai" ||
      !currentScope ||
      currentScope.status !== "active" ||
      currentScope.version !== scope.version ||
      Date.parse(validUntil) <= Date.now()
    )
      throw new ApiRequestError(
        409,
        "VOICE_QUALIFICATION_STALE",
        "Session or qualification changed during preparation.",
      );
    return {
      bookingRequirements,
      bookingQualification: {
        resourceScopeId: scope.scopeId,
        scopeVersion: scope.version,
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
        timingMode: "on_demand",
        requestedAt,
        timeZone: "Asia/Taipei",
        pickup,
        dropoff,
        serviceArea,
        validUntil,
        validatedAt: new Date().toISOString(),
      },
    };
  }
}
