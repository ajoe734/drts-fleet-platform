import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  HttpStatus,
  Injectable,
  type MessageEvent,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import {
  distinctUntilChanged,
  filter,
  from,
  map,
  type Observable,
  switchMap,
  timer,
} from "rxjs";

import type {
  AddMultiTaxiAuthorizedVehicleCommand,
  CreateCallCenterMultiTaxiRideCommand,
  CreateMultiTaxiOperatingAuthorizationCommand,
  CreateMultiTaxiRideCommand,
  DriverRatingAuthorityView,
  DriverRatingSummary,
  InvalidatePassengerTripRatingCommand,
  InvalidatePassengerTripRatingResult,
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
  MultiTaxiTripOperationalAdminView,
  MultiTaxiTripOperationalExportRow,
  MultiTaxiTripOperationalRecordQuery,
  OwnedOrderRecord,
  PassengerRideAccessGrant,
  PassengerRideAccessToken,
  PassengerRideAuthorityView,
  PassengerRideContactOption,
  PassengerRatingModerationAuditRecord,
  PassengerRatingModerationView,
  PassengerRatingReviewDetail,
  PassengerRatingReviewListData,
  PassengerRatingReviewListItem,
  PassengerRatingReviewQuery,
  PassengerRideSseEvent,
  PassengerRideSseEventEnvelope,
  PassengerRideTokenScope,
  PassengerTripRatingRecord,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  SubmitPassengerTripRatingCommand,
  UpdateMultiTaxiOperatingAuthorizationCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { maskOpaqueToken } from "../../common/sensitive-data-policy";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../service-product/service-product.service";
import {
  MultiTaxiRepository,
  type PassengerRatingReviewRepositoryDetail,
  type PassengerRatingReviewRepositoryQuery,
} from "./multi-taxi.repository";

@Injectable()
export class MultiTaxiService implements OnModuleInit {
  private authorizations: MultiTaxiOperatingAuthorizationRecord[] = [];
  private vehicles: MultiTaxiAuthorizedVehicleRecord[] = [];
  private readonly accessTokensByDigest = new Map<
    string,
    PassengerRideAccessToken
  >();
  private readonly ratingsByPassengerOrder = new Map<
    string,
    PassengerTripRatingRecord
  >();
  private readonly ratingsById = new Map<string, PassengerTripRatingRecord>();
  private readonly driverRatingSummaries = new Map<
    string,
    DriverRatingSummary
  >();
  private readonly ratingInvalidationsByIdempotencyKey = new Map<
    string,
    InvalidatePassengerTripRatingResult
  >();
  private readonly ratingModerationAuditsByRatingId = new Map<
    string,
    PassengerRatingModerationAuditRecord[]
  >();

  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    @Optional() private readonly repository?: MultiTaxiRepository,
    @Optional() private readonly serviceProductService?: ServiceProductService,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }
    try {
      const state = await this.repository.loadState();
      this.authorizations = state.authorizations;
      this.vehicles = state.vehicles;
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listAuthorizations() {
    return this.authorizations.map((record) => this.cloneAuthorization(record));
  }

  getAuthorization(authorizationId: string) {
    return this.cloneAuthorization(this.requireAuthorization(authorizationId));
  }

  listAuthorizedVehicles(authorizationId: string) {
    this.requireAuthorization(authorizationId);
    return this.vehicles
      .filter((vehicle) => vehicle.authorizationId === authorizationId)
      .map((vehicle) => ({ ...vehicle }));
  }

  createAuthorization(command: CreateMultiTaxiOperatingAuthorizationCommand) {
    const now = new Date().toISOString();
    const effectiveFrom = this.requireIso(
      command.effectiveFrom,
      "effectiveFrom",
    );
    const effectiveUntil = this.optionalIso(
      command.effectiveUntil,
      "effectiveUntil",
    );
    this.assertWindow(effectiveFrom, effectiveUntil);

    const authorization: MultiTaxiOperatingAuthorizationRecord = {
      authorizationId: randomUUID(),
      operatorId: this.requireText(command.operatorId, "operatorId"),
      authorityCode: this.requireText(command.authorityCode, "authorityCode"),
      businessPlanVersion: this.requireText(
        command.businessPlanVersion,
        "businessPlanVersion",
      ),
      status: "draft",
      serviceAreaCodes: this.requireStringList(
        command.serviceAreaCodes,
        "serviceAreaCodes",
      ),
      activeFareVersionId: this.requireText(
        command.activeFareVersionId,
        "activeFareVersionId",
      ),
      effectiveFrom,
      effectiveUntil,
      createdAt: now,
      updatedAt: now,
    };
    this.authorizations = [authorization, ...this.authorizations];
    this.persistAuthorization(authorization, "create authorization");
    return this.cloneAuthorization(authorization);
  }

  updateAuthorization(
    authorizationId: string,
    command: UpdateMultiTaxiOperatingAuthorizationCommand,
  ) {
    const authorization = this.requireAuthorization(authorizationId);
    if (authorization.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AUTHORIZATION_NOT_EDITABLE",
        "Only a draft operating authorization can be edited.",
      );
    }

    authorization.authorityCode =
      command.authorityCode === undefined
        ? authorization.authorityCode
        : this.requireText(command.authorityCode, "authorityCode");
    authorization.businessPlanVersion =
      command.businessPlanVersion === undefined
        ? authorization.businessPlanVersion
        : this.requireText(command.businessPlanVersion, "businessPlanVersion");
    authorization.serviceAreaCodes =
      command.serviceAreaCodes === undefined
        ? authorization.serviceAreaCodes
        : this.requireStringList(command.serviceAreaCodes, "serviceAreaCodes");
    authorization.activeFareVersionId =
      command.activeFareVersionId === undefined
        ? authorization.activeFareVersionId
        : this.requireText(command.activeFareVersionId, "activeFareVersionId");
    authorization.effectiveFrom =
      command.effectiveFrom === undefined
        ? authorization.effectiveFrom
        : this.requireIso(command.effectiveFrom, "effectiveFrom");
    authorization.effectiveUntil =
      command.effectiveUntil === undefined
        ? authorization.effectiveUntil
        : this.optionalIso(command.effectiveUntil, "effectiveUntil");
    this.assertWindow(
      authorization.effectiveFrom,
      authorization.effectiveUntil,
    );
    authorization.updatedAt = new Date().toISOString();
    this.persistAuthorization(authorization, "update authorization");
    return this.cloneAuthorization(authorization);
  }

  activateAuthorization(authorizationId: string) {
    const authorization = this.requireAuthorization(authorizationId);
    if (!["draft", "suspended"].includes(authorization.status)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AUTHORIZATION_CANNOT_ACTIVATE",
        "Only a draft or suspended authorization can be activated.",
      );
    }
    this.assertAuthorizationWindow(authorization);
    authorization.status = "approved";
    authorization.updatedAt = new Date().toISOString();
    this.persistAuthorization(authorization, "activate authorization");
    return this.cloneAuthorization(authorization);
  }

  suspendAuthorization(authorizationId: string) {
    const authorization = this.requireAuthorization(authorizationId);
    if (authorization.status !== "approved") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AUTHORIZATION_NOT_ACTIVE",
        "Only an approved authorization can be suspended.",
      );
    }
    authorization.status = "suspended";
    authorization.updatedAt = new Date().toISOString();
    this.persistAuthorization(authorization, "suspend authorization");
    return this.cloneAuthorization(authorization);
  }

  addAuthorizedVehicle(
    authorizationId: string,
    command: AddMultiTaxiAuthorizedVehicleCommand,
  ) {
    this.requireAuthorization(authorizationId);
    const effectiveFrom = this.requireIso(
      command.effectiveFrom,
      "effectiveFrom",
    );
    const effectiveUntil = this.optionalIso(
      command.effectiveUntil,
      "effectiveUntil",
    );
    this.assertWindow(effectiveFrom, effectiveUntil);

    const existing = this.vehicles.find(
      (vehicle) =>
        vehicle.authorizationId === authorizationId &&
        vehicle.vehicleId === command.vehicleId,
    );
    const vehicle: MultiTaxiAuthorizedVehicleRecord = existing ?? {
      authorizationVehicleId: randomUUID(),
      authorizationId,
      vehicleId: this.requireText(command.vehicleId, "vehicleId"),
      status: "active",
      effectiveFrom,
      effectiveUntil,
    };
    vehicle.status = "active";
    vehicle.effectiveFrom = effectiveFrom;
    vehicle.effectiveUntil = effectiveUntil;
    if (!existing) {
      this.vehicles = [vehicle, ...this.vehicles];
    }
    this.persistVehicle(vehicle, "authorize vehicle");
    return { ...vehicle };
  }

  async listTripOperationalRecords(
    query: MultiTaxiTripOperationalRecordQuery,
  ): Promise<MultiTaxiTripOperationalAdminView[]> {
    const month = this.normalizeMonthFilter(query.month);
    const needle = query.q?.trim().toLowerCase() ?? "";
    const records = await Promise.all(
      this.ownedMobilityService
        .listOrders()
        .filter((order) => this.isCompletedMultiTaxiOrder(order))
        .map((order) => this.mapOrderToOperationalRecord(order)),
    );

    return records
      .filter((record) =>
        month ? record.reservedAt.slice(0, 7) === month : true,
      )
      .filter((record) =>
        needle.length === 0
          ? true
          : [
              record.orderNo,
              record.plateNo,
              record.orderId,
              record.tripId,
              record.farePolicyVersion,
            ].some((value) => value.toLowerCase().includes(needle)),
      )
      .sort((left, right) => right.reservedAt.localeCompare(left.reservedAt));
  }

  async exportTripOperationalRecords(
    query: MultiTaxiTripOperationalRecordQuery,
  ): Promise<{
    exportedAt: string;
    filename: string;
    rows: MultiTaxiTripOperationalExportRow[];
  }> {
    const records = await this.listTripOperationalRecords(query);
    const suffix =
      this.normalizeMonthFilter(query.month)?.replace("-", "") ?? "all";

    return {
      exportedAt: new Date().toISOString(),
      filename: `multi-taxi-trip-records-${suffix}.csv`,
      rows: records.map((record) => ({
        orderNoMasked: maskOpaqueToken(record.orderNo, 3, 2) ?? "***",
        plateNoMasked: maskOpaqueToken(record.plateNo, 2, 2) ?? "***",
        reservedAt: record.reservedAt,
        pickupAt: record.pickupAt,
        dropoffAt: record.dropoffAt,
        payableFareMinor: record.payableFareMinor,
        actualFareMinor: record.actualFareMinor,
        tollMinor: record.tollMinor,
        currency: record.currency,
        farePolicyVersion: record.farePolicyVersion,
        chargingMode: record.chargingMode,
        generatedAt: record.generatedAt,
        retainUntil: record.retainUntil,
      })),
    };
  }

  async createRide(
    command: CreateMultiTaxiRideCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.assertServiceProductPolicy();
    const authorization = this.resolveActiveAuthorization();
    const order = this.ownedMobilityService.createMultiTaxiRide(
      command,
      authorization,
      identity,
      requestId,
    );
    return this.createRideAccessResult(order, requestId);
  }

  async createCallCenterRide(
    command: CreateCallCenterMultiTaxiRideCommand,
    requestId?: string,
  ) {
    this.assertServiceProductPolicy();
    const authorization = this.resolveActiveAuthorization();
    const order = this.ownedMobilityService.createMultiTaxiRide(
      command,
      authorization,
      null,
      requestId,
      {
        callId: command.callId,
        recordingId: command.recordingId ?? null,
        notes: command.notes ?? null,
      },
    );
    return this.createRideAccessResult(order, requestId);
  }

  async getPassengerRide(
    accessToken: string,
  ): Promise<PassengerRideAuthorityView> {
    const token = await this.requireAccessToken(accessToken, "ride:read");
    const order = this.requireMultiTaxiOrder(token.orderId);
    const assignment =
      this.ownedMobilityService.findPassengerAssignmentDisclosure(
        order.orderId,
      );
    const rating = await this.findPassengerRating(
      order.orderId,
      token.passengerSubjectRef,
    );
    const [payment, receipt] = await Promise.all([
      this.repository?.findPassengerPayment(order.orderId) ?? null,
      this.repository?.findElectronicReceipt(order.orderId) ?? null,
    ]);

    return {
      order: {
        orderId: order.orderId,
        orderNo: order.orderNo,
        status: order.status,
        timingMode: order.timingMode ?? "on_demand",
        requestedPickupAt: order.reservationWindowStart ?? order.createdAt,
        pickup: structuredClone(order.pickup),
        dropoff: structuredClone(order.dropoff),
        cancelableUntil: order.cancelableUntil,
        cancelledAt: order.cancelledAt,
        completedAt: order.status === "completed" ? order.updatedAt : null,
      },
      assignment,
      rating,
      payment: payment ?? null,
      receipt: receipt ?? null,
      actions: {
        canCancel:
          token.scopes.includes("ride:cancel") &&
          this.isPassengerCancelable(order),
        canRate:
          token.scopes.includes("ride:rate") &&
          order.status === "completed" &&
          rating === null,
        canContact:
          token.scopes.includes("ride:contact") &&
          assignment !== null &&
          !["completed", "cancelled"].includes(order.status),
        canReadReceipt: token.scopes.includes("receipt:read"),
      },
    };
  }

  async cancelPassengerRide(
    accessToken: string,
    reason: string | undefined,
    requestId?: string,
  ) {
    const token = await this.requireAccessToken(accessToken, "ride:cancel");
    const order = this.requireMultiTaxiOrder(token.orderId);
    return this.ownedMobilityService.cancelOwnedOrder(
      order.orderId,
      {
        reason: reason?.trim() || "passenger_requested",
      },
      requestId,
    );
  }

  async submitPassengerRating(
    accessToken: string,
    command: SubmitPassengerTripRatingCommand,
  ) {
    const token = await this.requireAccessToken(accessToken, "ride:rate");
    const order = this.requireMultiTaxiOrder(token.orderId);
    if (order.status !== "completed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_RATING_TRIP_NOT_COMPLETED",
        "A passenger rating can only be submitted after trip completion.",
        { orderId: order.orderId, status: order.status },
      );
    }
    const assignment =
      this.ownedMobilityService.findPassengerAssignmentDisclosure(
        order.orderId,
      );
    if (!assignment) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_RATING_ASSIGNMENT_MISSING",
        "The completed trip has no passenger assignment authority.",
        { orderId: order.orderId },
      );
    }

    const score = this.requireRatingScore(command.score);
    const tags = this.normalizeRatingTags(command.tags);
    const comment = command.comment?.trim() || null;
    const existing = await this.findPassengerRating(
      order.orderId,
      token.passengerSubjectRef,
    );
    if (existing) {
      this.assertIdempotentRating(existing, score, tags, comment);
      return existing;
    }

    const now = new Date().toISOString();
    const rating: PassengerTripRatingRecord = {
      ratingId: randomUUID(),
      orderId: order.orderId,
      tripId: assignment.assignmentId,
      driverId: assignment.driver.driverId,
      passengerSubjectRef: token.passengerSubjectRef,
      score,
      tags,
      comment,
      status: "active",
      submittedAt: now,
      updatedAt: now,
    };
    const persisted = (await this.repository?.persistPassengerRating(
      rating,
    )) ?? {
      rating,
      summary: null,
    };
    this.assertIdempotentRating(persisted.rating, score, tags, comment);
    this.ratingsByPassengerOrder.set(
      this.ratingKey(order.orderId, token.passengerSubjectRef),
      persisted.rating,
    );
    this.ratingsById.set(persisted.rating.ratingId, persisted.rating);
    if (persisted.summary) {
      this.driverRatingSummaries.set(
        persisted.summary.driverId,
        persisted.summary,
      );
    } else {
      this.rebuildInMemoryDriverRatingSummary(
        persisted.rating.driverId,
        persisted.rating.updatedAt,
      );
    }
    return persisted.rating;
  }

  async listPassengerRatingReviews(
    query: PassengerRatingReviewQuery,
  ): Promise<PassengerRatingReviewListData> {
    const normalized = this.normalizePassengerRatingReviewQuery(query);
    const generatedAt = new Date().toISOString();

    if (this.repository?.isEnabled()) {
      const result =
        await this.repository.listPassengerRatingReviews(normalized);
      return {
        items: result.items.map((item) => structuredClone(item)),
        pageInfo: this.toRatingReviewPageInfo(
          normalized.page,
          normalized.pageSize,
          result.totalItems,
        ),
        refresh: this.createRatingGovernanceRefresh(generatedAt),
      };
    }

    const ordersById = new Map(
      this.ownedMobilityService
        .listOrders()
        .map((order) => [order.orderId, order] as const),
    );
    const filtered = [...this.ratingsById.values()]
      .filter((rating) =>
        normalized.status ? rating.status === normalized.status : true,
      )
      .filter((rating) =>
        normalized.score ? rating.score === normalized.score : true,
      )
      .filter((rating) =>
        normalized.tag ? rating.tags.includes(normalized.tag) : true,
      )
      .filter((rating) =>
        normalized.driverId ? rating.driverId === normalized.driverId : true,
      )
      .filter((rating) => {
        if (!normalized.tripOrOrder) {
          return true;
        }
        const needle = normalized.tripOrOrder.toLowerCase();
        const orderNo = ordersById.get(rating.orderId)?.orderNo ?? "";
        return [rating.tripId, rating.orderId, orderNo].some((value) =>
          value.toLowerCase().includes(needle),
        );
      })
      .filter((rating) => {
        const submittedDate = this.toTaipeiCalendarDate(rating.submittedAt);
        return (
          (!normalized.from || submittedDate >= normalized.from) &&
          (!normalized.to || submittedDate <= normalized.to)
        );
      })
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.ratingId.localeCompare(right.ratingId),
      );
    const offset = (normalized.page - 1) * normalized.pageSize;
    const items = filtered
      .slice(offset, offset + normalized.pageSize)
      .map((rating) => this.toPassengerRatingReviewListItem(rating));

    return {
      items,
      pageInfo: this.toRatingReviewPageInfo(
        normalized.page,
        normalized.pageSize,
        filtered.length,
      ),
      refresh: this.createRatingGovernanceRefresh(generatedAt),
    };
  }

  async getPassengerRatingReview(
    ratingId: string,
    canInvalidate: boolean,
  ): Promise<PassengerRatingReviewDetail> {
    const normalizedRatingId = this.requireRatingReadIdentifier(
      ratingId,
      "ratingId",
    );
    const authority = this.repository?.isEnabled()
      ? await this.repository.findPassengerRatingReview(normalizedRatingId)
      : this.findInMemoryPassengerRatingReview(normalizedRatingId);
    if (!authority) {
      this.throwRatingNotFound(normalizedRatingId);
    }
    if (!authority.summary) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DRIVER_RATING_AUTHORITY_UNAVAILABLE",
        "The canonical driver rating summary is unavailable for this rating.",
        {
          ratingId: normalizedRatingId,
          driverId: authority.rating.driverId,
        },
      );
    }
    this.assertCanonicalDriverRatingSummary(
      authority.summary,
      authority.rating.driverId,
    );

    return {
      rating: this.toPassengerRatingModerationView(authority.rating),
      orderNo: authority.orderNo,
      driverDisplayName: authority.driverDisplayName,
      passengerSubjectMasked: maskOpaqueToken(
        authority.rating.passengerSubjectRef,
        3,
        3,
      ),
      driverRatingSummary: structuredClone(authority.summary),
      moderationHistory: authority.moderationHistory.map((audit) =>
        structuredClone(audit),
      ),
      availableActions: {
        invalidate: this.resolveRatingInvalidationAction(
          authority.rating,
          canInvalidate,
        ),
      },
      refresh: this.createRatingGovernanceRefresh(new Date().toISOString()),
    };
  }

  async getDriverRatingAuthority(
    driverId: string,
  ): Promise<DriverRatingAuthorityView> {
    const normalizedDriverId = this.requireRatingReadIdentifier(
      driverId,
      "driverId",
    );
    const summary = this.repository?.isEnabled()
      ? await this.repository.findDriverRatingSummary(normalizedDriverId)
      : (this.driverRatingSummaries.get(normalizedDriverId) ?? null);
    if (!summary) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_RATING_AUTHORITY_NOT_FOUND",
        "The canonical driver rating authority was not found.",
        { driverId: normalizedDriverId },
      );
    }
    this.assertCanonicalDriverRatingSummary(summary, normalizedDriverId);

    return {
      summary: structuredClone(summary),
      refresh: this.createRatingGovernanceRefresh(new Date().toISOString()),
      unavailableReason: null,
    };
  }

  async invalidatePassengerRating(
    ratingId: string,
    command: InvalidatePassengerTripRatingCommand,
    actorId: string,
    requestId?: string,
  ): Promise<InvalidatePassengerTripRatingResult> {
    const normalizedRatingId = this.requireRatingModerationText(
      ratingId,
      "ratingId",
      255,
    );
    const reason = this.requireRatingModerationText(
      command?.reason,
      "reason",
      1000,
    );
    const idempotencyKey = this.requireRatingModerationText(
      command?.idempotencyKey,
      "idempotencyKey",
      255,
    );
    const normalizedActorId = this.requireRatingModerationText(
      actorId,
      "actorId",
      255,
    );
    if (
      command?.confirmation?.action !== "invalidate_rating" ||
      command.confirmation.ratingId !== normalizedRatingId
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RATING_INVALIDATION_CONFIRMATION_INVALID",
        "confirmation must explicitly invalidate the rating in the request path.",
        { ratingId: normalizedRatingId },
      );
    }

    if (this.repository?.isEnabled()) {
      const persisted = await this.repository.invalidatePassengerRating({
        auditId: randomUUID(),
        ratingId: normalizedRatingId,
        reason,
        actorId: normalizedActorId,
        idempotencyKey,
        requestId: requestId?.trim() || null,
        invalidatedAt: new Date().toISOString(),
      });
      if (persisted.outcome === "not_found") {
        this.throwRatingNotFound(normalizedRatingId);
      }
      if (persisted.outcome === "already_invalidated") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "RATING_ALREADY_INVALIDATED",
          "The passenger rating has already been invalidated.",
          { ratingId: normalizedRatingId },
        );
      }
      this.assertRatingInvalidationReplay(
        persisted.audit,
        reason,
        normalizedActorId,
      );
      this.cacheRatingAndSummary(persisted.rating, persisted.summary);
      this.cacheRatingModerationAudit(persisted.audit);
      return this.toRatingInvalidationResult(
        persisted.rating,
        persisted.summary,
        persisted.audit,
        persisted.outcome === "replayed",
      );
    }

    return this.invalidatePassengerRatingInMemory(
      normalizedRatingId,
      reason,
      idempotencyKey,
      normalizedActorId,
      requestId?.trim() || null,
    );
  }

  async getPassengerContact(
    accessToken: string,
  ): Promise<PassengerRideContactOption> {
    const token = await this.requireAccessToken(accessToken, "ride:contact");
    const order = this.requireMultiTaxiOrder(token.orderId);
    const assignment =
      this.ownedMobilityService.findPassengerAssignmentDisclosure(
        order.orderId,
      );
    if (!assignment || ["completed", "cancelled"].includes(order.status)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_CONTACT_NOT_AVAILABLE",
        "Passenger contact is not available for the current ride state.",
        { orderId: order.orderId, status: order.status },
      );
    }

    const supportUri = process.env.MULTI_TAXI_SUPPORT_TEL_URI?.trim() || null;
    if (supportUri?.startsWith("tel:")) {
      return {
        mode: "support_fallback",
        contactUri: supportUri,
        expiresAt: null,
      };
    }
    return {
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
    };
  }

  async getPassengerReceipt(accessToken: string) {
    const token = await this.requireAccessToken(accessToken, "receipt:read");
    const order = this.requireMultiTaxiOrder(token.orderId);
    const receipt =
      (await this.repository?.findElectronicReceipt(order.orderId)) ?? null;
    if (!receipt) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_RECEIPT_NOT_READY",
        "The electronic receipt is not ready.",
        { orderId: order.orderId },
      );
    }
    return receipt;
  }

  streamPassengerRide(accessToken: string): Observable<MessageEvent> {
    return timer(0, 3_000).pipe(
      switchMap(() => from(this.getPassengerRide(accessToken))),
      map((view) => ({
        view,
        eventType: this.resolvePassengerEventType(view),
      })),
      filter(
        (
          value,
        ): value is {
          view: PassengerRideAuthorityView;
          eventType: PassengerRideSseEvent;
        } => value.eventType !== null,
      ),
      distinctUntilChanged(
        (previous, current) =>
          this.passengerViewVersionKey(previous.view, previous.eventType) ===
          this.passengerViewVersionKey(current.view, current.eventType),
      ),
      map(({ view, eventType }) => {
        const envelope: PassengerRideSseEventEnvelope = {
          eventId: randomUUID(),
          eventType,
          eventVersion: view.assignment?.assignmentVersion ?? 1,
          orderId: view.order.orderId,
          occurredAt: new Date().toISOString(),
          data: view,
        };
        return {
          type: eventType,
          data: envelope,
          retry: 3_000,
        };
      }),
    );
  }

  queueCheckIn(command: QueueCheckInCommand, requestId?: string) {
    const authorization = this.resolveActiveAuthorization();
    this.assertAuthorizedVehicle(
      authorization.authorizationId,
      command.vehicleId,
    );
    return this.ownedMobilityService.queueCheckInMultiTaxi(
      {
        ...command,
        queueMode: command.queueMode ?? "virtual_matching",
      },
      authorization,
      requestId,
    );
  }

  queueCheckOut(command: QueueCheckOutCommand, requestId?: string) {
    const authorization = this.resolveActiveAuthorization();
    this.assertAuthorizedVehicle(
      authorization.authorizationId,
      command.vehicleId,
    );
    return this.ownedMobilityService.queueCheckOutMultiTaxi(
      {
        ...command,
        queueMode: command.queueMode ?? "virtual_matching",
      },
      authorization,
      requestId,
    );
  }

  private resolveActiveAuthorization() {
    const now = Date.now();
    const defaultAuthorizationId =
      process.env.MULTI_TAXI_DEFAULT_AUTHORIZATION_ID?.trim() || null;
    const active = this.authorizations.filter(
      (authorization) =>
        authorization.status === "approved" &&
        Date.parse(authorization.effectiveFrom) <= now &&
        (authorization.effectiveUntil === null ||
          Date.parse(authorization.effectiveUntil) > now),
    );
    const resolved = defaultAuthorizationId
      ? active.find(
          (authorization) =>
            authorization.authorizationId === defaultAuthorizationId,
        )
      : active.length === 1
        ? active[0]
        : null;

    if (!resolved) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        active.length > 1
          ? "MULTI_TAXI_AUTHORIZATION_AMBIGUOUS"
          : "MULTI_TAXI_AUTHORIZATION_UNAVAILABLE",
        active.length > 1
          ? "Multiple active authorizations require a server-side channel mapping."
          : "No approved and effective multi-taxi operating authorization is available.",
      );
    }
    return this.cloneAuthorization(resolved);
  }

  private assertServiceProductPolicy() {
    this.serviceProductService?.assertRuntimeProfileServiceProductActive(
      "multi_taxi_direct",
      "taxi_reservation",
    );
  }

  private assertAuthorizedVehicle(authorizationId: string, vehicleId: string) {
    const now = Date.now();
    const membership = this.vehicles.find(
      (vehicle) =>
        vehicle.authorizationId === authorizationId &&
        vehicle.vehicleId === vehicleId &&
        vehicle.status === "active" &&
        Date.parse(vehicle.effectiveFrom) <= now &&
        (vehicle.effectiveUntil === null ||
          Date.parse(vehicle.effectiveUntil) > now),
    );
    if (!membership) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MULTI_TAXI_VEHICLE_NOT_AUTHORIZED",
        "The vehicle is not active on the resolved operating authorization.",
        { authorizationId, vehicleId },
      );
    }
  }

  private async createRideAccessResult(
    order: OwnedOrderRecord,
    requestId?: string,
  ) {
    const passengerAccess = this.issueRideAccessGrant(order);
    if (
      process.env.NODE_ENV === "production" &&
      !this.repository?.isEnabled()
    ) {
      this.failRideAccessCreation(order, passengerAccess, requestId);
    }
    try {
      await this.repository?.persistRideAccessToken(
        passengerAccess,
        this.digestAccessToken(passengerAccess.accessToken),
      );
    } catch {
      this.failRideAccessCreation(order, passengerAccess, requestId);
    }
    return {
      ride: order,
      passengerAccess,
    };
  }

  private issueRideAccessGrant(
    order: OwnedOrderRecord,
  ): PassengerRideAccessGrant {
    const accessToken = randomBytes(32).toString("base64url");
    const ttlHours = this.resolveAccessTokenTtlHours();
    const token: PassengerRideAccessToken = {
      tokenId: randomUUID(),
      orderId: order.orderId,
      passengerSubjectRef: this.resolvePassengerSubjectRef(order),
      scopes: [
        "ride:read",
        "ride:cancel",
        "ride:rate",
        "ride:contact",
        "receipt:read",
      ],
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
    };
    this.accessTokensByDigest.set(this.digestAccessToken(accessToken), token);
    return {
      ...token,
      scopes: [...token.scopes],
      accessToken,
    };
  }

  private failRideAccessCreation(
    order: OwnedOrderRecord,
    passengerAccess: PassengerRideAccessGrant,
    requestId?: string,
  ): never {
    this.accessTokensByDigest.delete(
      this.digestAccessToken(passengerAccess.accessToken),
    );
    try {
      this.ownedMobilityService.cancelOwnedOrder(
        order.orderId,
        { reason: "passenger_access_token_persistence_failed" },
        requestId,
      );
    } catch {
      // The persistence failure remains the authoritative error.
    }
    throw new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PASSENGER_ACCESS_TOKEN_PERSISTENCE_FAILED",
      "The ride could not be made safely accessible to the passenger.",
      { orderId: order.orderId },
    );
  }

  private resolvePassengerSubjectRef(order: OwnedOrderRecord) {
    const passengerId = order.passenger.passengerId?.trim();
    if (passengerId) {
      return passengerId;
    }
    const pepper =
      process.env.PASSENGER_SUBJECT_PEPPER?.trim() ||
      process.env.PASSENGER_RIDE_TOKEN_PEPPER?.trim() ||
      "";
    const digest = createHash("sha256")
      .update(`phone\0${pepper}\0${order.passenger.phone.trim()}`)
      .digest("hex");
    return `phone_sha256:${digest}`;
  }

  private async requireAccessToken(
    accessToken: string,
    scope: PassengerRideTokenScope,
  ) {
    const normalized = accessToken?.trim();
    if (!normalized || normalized.length > 512) {
      throw this.invalidPassengerToken();
    }
    const digest = this.digestAccessToken(normalized);
    const token =
      this.accessTokensByDigest.get(digest) ??
      (await this.repository?.findRideAccessTokenByDigest(digest)) ??
      null;
    if (
      !token ||
      token.revokedAt !== null ||
      Date.parse(token.expiresAt) <= Date.now()
    ) {
      throw this.invalidPassengerToken();
    }
    if (!token.scopes.includes(scope)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PASSENGER_RIDE_SCOPE_FORBIDDEN",
        "The passenger ride token does not grant this action.",
        { scope },
      );
    }
    this.accessTokensByDigest.set(digest, token);
    return {
      ...token,
      scopes: [...token.scopes],
    };
  }

  private invalidPassengerToken() {
    return new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "PASSENGER_RIDE_TOKEN_INVALID",
      "The passenger ride link is invalid or expired.",
    );
  }

  private digestAccessToken(accessToken: string) {
    const pepper = process.env.PASSENGER_RIDE_TOKEN_PEPPER?.trim() ?? "";
    return createHash("sha256")
      .update(`${pepper}\0${accessToken}`)
      .digest("hex");
  }

  private resolveAccessTokenTtlHours() {
    const configured = Number(process.env.PASSENGER_RIDE_TOKEN_TTL_HOURS);
    return Number.isFinite(configured) && configured >= 1 && configured <= 8760
      ? configured
      : 24 * 30;
  }

  private requireMultiTaxiOrder(orderId: string) {
    const order = this.ownedMobilityService.getOrder(orderId);
    if (order.runtimeProfileCode !== "multi_taxi_direct") {
      throw this.invalidPassengerToken();
    }
    return order;
  }

  private isCompletedMultiTaxiOrder(order: OwnedOrderRecord) {
    return (
      order.runtimeProfileCode === "multi_taxi_direct" &&
      order.status === "completed"
    );
  }

  private normalizeMonthFilter(month: string | undefined) {
    const normalized = month?.trim();
    if (!normalized) {
      return null;
    }
    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_RECORDS_MONTH_INVALID",
        "month must use YYYY-MM format.",
      );
    }
    return normalized;
  }

  private async mapOrderToOperationalRecord(
    order: OwnedOrderRecord,
  ): Promise<MultiTaxiTripOperationalAdminView> {
    const assignment =
      this.ownedMobilityService.findPassengerAssignmentDisclosure(
        order.orderId,
      );
    const receipt =
      (await this.repository?.findElectronicReceipt(order.orderId)) ?? null;
    const payableFareMinor = order.quotedFare?.amountMinor ?? 0;
    const actualFareMinor = receipt?.amountMinor ?? payableFareMinor;
    const completedAt = order.updatedAt;
    const generatedAt = completedAt;

    return {
      recordId: `mtr-${order.orderId}`,
      orderId: order.orderId,
      orderNo: order.orderNo,
      tripId: assignment?.assignmentId ?? order.orderId,
      assignmentId: assignment?.assignmentId ?? null,
      vehicleId: assignment?.vehicle?.vehicleId ?? "unassigned",
      plateNo: assignment?.vehicle?.plateNo ?? "—",
      reservedAt: order.reservationWindowStart ?? order.createdAt,
      pickupAt: assignment?.createdAt ?? null,
      dropoffAt: completedAt,
      route: {
        encodedPolyline: assignment?.routeFare?.encodedPolyline ?? null,
        pointCount: assignment?.routeFare?.encodedPolyline ? 1 : 0,
        distanceMeters: assignment?.routeFare?.estimatedDistanceMeters ?? null,
        durationSeconds:
          assignment?.routeFare?.estimatedDurationSeconds ?? null,
        source: "provider_route",
      },
      payableFareMinor,
      actualFareMinor,
      tollMinor: 0,
      currency: "NTD",
      farePolicyVersion:
        assignment?.routeFare?.farePolicyVersion ??
        order.quotedFareRuleVersion ??
        "active_authorization_fare",
      chargingMode: order.fixedPrice ? "platform_quote" : "meter",
      generatedAt,
      retainUntil: this.plusRetentionDays(generatedAt, 730),
    };
  }

  private plusRetentionDays(iso: string, days: number) {
    const date = new Date(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  private isPassengerCancelable(order: OwnedOrderRecord) {
    return !["on_trip", "proof_pending", "completed", "cancelled"].includes(
      order.status,
    );
  }

  private async findPassengerRating(
    orderId: string,
    passengerSubjectRef: string,
  ) {
    const key = this.ratingKey(orderId, passengerSubjectRef);
    const rating =
      this.ratingsByPassengerOrder.get(key) ??
      (await this.repository?.findPassengerRating(
        orderId,
        passengerSubjectRef,
      )) ??
      null;
    if (rating) {
      this.ratingsByPassengerOrder.set(key, rating);
      this.ratingsById.set(rating.ratingId, rating);
    }
    return rating;
  }

  private invalidatePassengerRatingInMemory(
    ratingId: string,
    reason: string,
    idempotencyKey: string,
    actorId: string,
    requestId: string | null,
  ): InvalidatePassengerTripRatingResult {
    const replayKey = `${ratingId}\0${idempotencyKey}`;
    const existing =
      this.ratingInvalidationsByIdempotencyKey.get(replayKey) ?? null;
    if (existing) {
      this.assertRatingInvalidationReplay(existing.audit, reason, actorId);
      return {
        rating: structuredClone(existing.rating),
        driverRatingSummary: structuredClone(existing.driverRatingSummary),
        audit: structuredClone(existing.audit),
        replayed: true,
      };
    }

    const rating = this.ratingsById.get(ratingId);
    if (!rating) {
      this.throwRatingNotFound(ratingId);
    }
    if (rating.status === "invalidated") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "RATING_ALREADY_INVALIDATED",
        "The passenger rating has already been invalidated.",
        { ratingId },
      );
    }

    const invalidatedAt = new Date().toISOString();
    const updatedRating: PassengerTripRatingRecord = {
      ...rating,
      status: "invalidated",
      updatedAt: invalidatedAt,
    };
    this.ratingsById.set(updatedRating.ratingId, updatedRating);
    this.ratingsByPassengerOrder.set(
      this.ratingKey(updatedRating.orderId, updatedRating.passengerSubjectRef),
      updatedRating,
    );
    const summary = this.rebuildInMemoryDriverRatingSummary(
      updatedRating.driverId,
      invalidatedAt,
    );
    const audit: PassengerRatingModerationAuditRecord = {
      auditId: randomUUID(),
      ratingId,
      action: "invalidate",
      reason,
      actorId,
      idempotencyKey,
      previousStatus: rating.status,
      resultingStatus: "invalidated",
      aggregateVersion: summary.aggregateVersion,
      requestId,
      createdAt: invalidatedAt,
    };
    const result = this.toRatingInvalidationResult(
      updatedRating,
      summary,
      audit,
      false,
    );
    this.ratingInvalidationsByIdempotencyKey.set(replayKey, result);
    this.cacheRatingModerationAudit(audit);
    return result;
  }

  private rebuildInMemoryDriverRatingSummary(
    driverId: string,
    calculatedAt: string,
  ): DriverRatingSummary {
    const activeRatings = [...this.ratingsById.values()].filter(
      (rating) => rating.driverId === driverId && rating.status === "active",
    );
    const previous = this.driverRatingSummaries.get(driverId);
    const ratingCount = activeRatings.length;
    const averageRating =
      ratingCount === 0
        ? null
        : Math.round(
            (activeRatings.reduce((total, rating) => total + rating.score, 0) /
              ratingCount) *
              100,
          ) / 100;
    const lastRatedAt =
      activeRatings
        .map((rating) => rating.submittedAt)
        .sort((left, right) => right.localeCompare(left))[0] ?? null;
    const summary: DriverRatingSummary = {
      driverId,
      displayState: ratingCount === 0 ? "new_driver" : "rated",
      averageRating,
      ratingCount,
      lastRatedAt,
      aggregateVersion: previous ? previous.aggregateVersion + 1 : 1,
      calculatedAt,
    };
    this.driverRatingSummaries.set(driverId, summary);
    return summary;
  }

  private cacheRatingAndSummary(
    rating: PassengerTripRatingRecord,
    summary: DriverRatingSummary,
  ) {
    this.ratingsById.set(rating.ratingId, rating);
    this.ratingsByPassengerOrder.set(
      this.ratingKey(rating.orderId, rating.passengerSubjectRef),
      rating,
    );
    this.driverRatingSummaries.set(summary.driverId, summary);
  }

  private cacheRatingModerationAudit(
    audit: PassengerRatingModerationAuditRecord,
  ) {
    const current =
      this.ratingModerationAuditsByRatingId.get(audit.ratingId) ?? [];
    if (current.some((record) => record.auditId === audit.auditId)) {
      return;
    }
    this.ratingModerationAuditsByRatingId.set(
      audit.ratingId,
      [structuredClone(audit), ...current].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.auditId.localeCompare(right.auditId),
      ),
    );
  }

  private toRatingInvalidationResult(
    rating: PassengerTripRatingRecord,
    summary: DriverRatingSummary,
    audit: PassengerRatingModerationAuditRecord,
    replayed: boolean,
  ): InvalidatePassengerTripRatingResult {
    return {
      rating: {
        ratingId: rating.ratingId,
        orderId: rating.orderId,
        tripId: rating.tripId,
        driverId: rating.driverId,
        score: rating.score,
        tags: [...rating.tags],
        comment: rating.comment,
        status: rating.status,
        submittedAt: rating.submittedAt,
        updatedAt: rating.updatedAt,
      },
      driverRatingSummary: structuredClone(summary),
      audit: structuredClone(audit),
      replayed,
    };
  }

  private toPassengerRatingModerationView(
    rating: PassengerTripRatingRecord,
  ): PassengerRatingModerationView {
    return {
      ratingId: rating.ratingId,
      orderId: rating.orderId,
      tripId: rating.tripId,
      driverId: rating.driverId,
      score: rating.score,
      tags: [...rating.tags],
      comment: rating.comment,
      status: rating.status,
      submittedAt: rating.submittedAt,
      updatedAt: rating.updatedAt,
    };
  }

  private toPassengerRatingReviewListItem(
    rating: PassengerTripRatingRecord,
  ): PassengerRatingReviewListItem {
    const comment =
      rating.comment && rating.comment.length > 160
        ? `${rating.comment.slice(0, 157)}...`
        : rating.comment;
    return {
      ratingId: rating.ratingId,
      orderId: rating.orderId,
      tripId: rating.tripId,
      driverId: rating.driverId,
      driverDisplayName: null,
      score: rating.score,
      tags: [...rating.tags],
      commentExcerpt: comment,
      status: rating.status,
      submittedAt: rating.submittedAt,
      updatedAt: rating.updatedAt,
    };
  }

  private findInMemoryPassengerRatingReview(
    ratingId: string,
  ): PassengerRatingReviewRepositoryDetail | null {
    const rating = this.ratingsById.get(ratingId);
    if (!rating) {
      return null;
    }
    const order = this.ownedMobilityService
      .listOrders()
      .find((candidate) => candidate.orderId === rating.orderId);
    return {
      rating: structuredClone(rating),
      orderNo: order?.orderNo ?? null,
      driverDisplayName: null,
      summary: this.driverRatingSummaries.get(rating.driverId) ?? null,
      moderationHistory: (
        this.ratingModerationAuditsByRatingId.get(ratingId) ?? []
      ).map((audit) => structuredClone(audit)),
    };
  }

  private resolveRatingInvalidationAction(
    rating: PassengerTripRatingRecord,
    canInvalidate: boolean,
  ) {
    if (rating.status === "invalidated") {
      return {
        enabled: false,
        disabledReason: "rating_already_invalidated",
      };
    }
    if (!canInvalidate) {
      return {
        enabled: false,
        disabledReason: "missing_multi_taxi_ratings_moderate",
      };
    }
    return { enabled: true, disabledReason: null };
  }

  private createRatingGovernanceRefresh(generatedAt: string) {
    return {
      generatedAt,
      staleAfterMs: 300_000,
      stale: false,
    };
  }

  private toRatingReviewPageInfo(
    page: number,
    pageSize: number,
    totalItems: number,
  ) {
    return {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    };
  }

  private normalizePassengerRatingReviewQuery(
    query: PassengerRatingReviewQuery,
  ): PassengerRatingReviewRepositoryQuery {
    const status = query?.status;
    if (
      status !== undefined &&
      !["active", "under_review", "invalidated"].includes(status)
    ) {
      this.throwRatingReviewQueryInvalid(
        "status",
        "status must be active, under_review, or invalidated.",
      );
    }
    const score =
      query?.score === undefined || query.score === ""
        ? null
        : Number(query.score);
    if (
      score !== null &&
      (!Number.isInteger(score) || score < 1 || score > 5)
    ) {
      this.throwRatingReviewQueryInvalid(
        "score",
        "score must be an integer from 1 through 5.",
      );
    }
    const from = this.normalizeRatingReviewDate(query?.from, "from");
    const to = this.normalizeRatingReviewDate(query?.to, "to");
    if (from && to && from > to) {
      this.throwRatingReviewQueryInvalid("to", "to must be on or after from.");
    }

    return {
      status: status ?? null,
      score: score as PassengerTripRatingRecord["score"] | null,
      tag: this.normalizeRatingReviewText(query?.tag, "tag", 100),
      driverId: this.normalizeRatingReviewText(
        query?.driverId,
        "driverId",
        255,
      ),
      tripOrOrder: this.normalizeRatingReviewText(
        query?.tripOrOrder,
        "tripOrOrder",
        255,
      ),
      from,
      to,
      page: this.normalizeRatingReviewPositiveInteger(query?.page, "page", 1),
      pageSize: this.normalizeRatingReviewPositiveInteger(
        query?.pageSize,
        "pageSize",
        50,
        100,
      ),
    };
  }

  private normalizeRatingReviewText(
    value: unknown,
    field: string,
    maxLength: number,
  ) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    if (typeof value !== "string") {
      this.throwRatingReviewQueryInvalid(field, `${field} must be a string.`);
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (normalized.length > maxLength) {
      this.throwRatingReviewQueryInvalid(
        field,
        `${field} must not exceed ${maxLength} characters.`,
      );
    }
    return normalized;
  }

  private normalizeRatingReviewDate(value: unknown, field: string) {
    const normalized = this.normalizeRatingReviewText(value, field, 10);
    if (!normalized) {
      return null;
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ) {
      this.throwRatingReviewQueryInvalid(
        field,
        `${field} must be a valid YYYY-MM-DD date.`,
      );
    }
    return normalized;
  }

  private normalizeRatingReviewPositiveInteger(
    value: unknown,
    field: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ) {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
      this.throwRatingReviewQueryInvalid(
        field,
        `${field} must be an integer from 1 through ${maximum}.`,
      );
    }
    return parsed;
  }

  private throwRatingReviewQueryInvalid(field: string, message: string): never {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "RATING_REVIEW_QUERY_INVALID",
      message,
      { field },
    );
  }

  private requireRatingReadIdentifier(value: unknown, field: string) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || normalized.length > 255) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RATING_READ_IDENTIFIER_INVALID",
        `${field} is required and must not exceed 255 characters.`,
        { field },
      );
    }
    return normalized;
  }

  private assertCanonicalDriverRatingSummary(
    summary: DriverRatingSummary,
    expectedDriverId: string,
  ) {
    const averageValid =
      summary.averageRating === null ||
      (Number.isFinite(summary.averageRating) &&
        summary.averageRating >= 1 &&
        summary.averageRating <= 5);
    const canonical =
      summary.driverId === expectedDriverId &&
      Number.isInteger(summary.ratingCount) &&
      summary.ratingCount >= 0 &&
      Number.isInteger(summary.aggregateVersion) &&
      summary.aggregateVersion >= 1 &&
      Number.isFinite(Date.parse(summary.calculatedAt)) &&
      averageValid &&
      ((summary.displayState === "rated" &&
        summary.averageRating !== null &&
        summary.ratingCount > 0) ||
        (summary.displayState === "new_driver" &&
          summary.averageRating === null &&
          summary.ratingCount === 0) ||
        (summary.displayState === "unavailable" &&
          summary.averageRating === null));
    if (!canonical) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DRIVER_RATING_AUTHORITY_INCONSISTENT",
        "The canonical driver rating authority is internally inconsistent.",
        { driverId: expectedDriverId },
      );
    }
  }

  private toTaipeiCalendarDate(value: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(value))
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private assertRatingInvalidationReplay(
    audit: PassengerRatingModerationAuditRecord,
    reason: string,
    actorId: string,
  ) {
    if (audit.reason !== reason || audit.actorId !== actorId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "RATING_INVALIDATION_IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with different invalidation data.",
        { ratingId: audit.ratingId },
      );
    }
  }

  private throwRatingNotFound(ratingId: string): never {
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "PASSENGER_RATING_NOT_FOUND",
      "Passenger rating was not found.",
      { ratingId },
    );
  }

  private requireRatingModerationText(
    value: unknown,
    field: string,
    maxLength: number,
  ) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || normalized.length > maxLength) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RATING_INVALIDATION_FIELD_INVALID",
        `${field} is required and must not exceed ${maxLength} characters.`,
        { field, maxLength },
      );
    }
    return normalized;
  }

  private ratingKey(orderId: string, passengerSubjectRef: string) {
    return `${orderId}\0${passengerSubjectRef}`;
  }

  private requireRatingScore(value: number): 1 | 2 | 3 | 4 | 5 {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_RATING_SCORE_INVALID",
        "score must be an integer from 1 through 5.",
      );
    }
    return value as 1 | 2 | 3 | 4 | 5;
  }

  private normalizeRatingTags(value: string[] | undefined) {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value) || value.length > 10) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_RATING_TAGS_INVALID",
        "tags must contain at most 10 values.",
      );
    }
    return [
      ...new Set(
        value.map((item) => item?.trim()).filter((item) => item.length > 0),
      ),
    ].sort();
  }

  private assertIdempotentRating(
    existing: PassengerTripRatingRecord,
    score: number,
    tags: string[],
    comment: string | null,
  ) {
    if (
      existing.score !== score ||
      existing.comment !== comment ||
      JSON.stringify([...existing.tags].sort()) !== JSON.stringify(tags)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_RATING_ALREADY_SUBMITTED",
        "A different rating has already been submitted for this trip.",
        { orderId: existing.orderId },
      );
    }
  }

  private resolvePassengerEventType(
    view: PassengerRideAuthorityView,
  ): PassengerRideSseEvent | null {
    if (view.order.status === "cancelled") {
      return "trip_cancelled";
    }
    if (view.receipt) {
      return "receipt_ready";
    }
    if (view.order.status === "completed") {
      return "trip_completed";
    }
    if (view.order.status === "on_trip") {
      return "trip_started";
    }
    if (view.order.status === "arrived_pickup") {
      return "driver_arrived";
    }
    if (!view.assignment) {
      return null;
    }
    return view.assignment.assignmentVersion > 1
      ? "assignment_replaced"
      : "assignment_disclosure_ready";
  }

  private passengerViewVersionKey(
    view: PassengerRideAuthorityView,
    eventType: PassengerRideSseEvent,
  ) {
    return JSON.stringify({
      eventType,
      status: view.order.status,
      assignmentVersion: view.assignment?.assignmentVersion ?? null,
      eta: view.assignment?.eta ?? null,
      ratingId: view.rating?.ratingId ?? null,
      paymentStatus: view.payment?.status ?? null,
      receiptId: view.receipt?.receiptId ?? null,
    });
  }

  private requireAuthorization(authorizationId: string) {
    const authorization = this.authorizations.find(
      (record) => record.authorizationId === authorizationId,
    );
    if (!authorization) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "MULTI_TAXI_AUTHORIZATION_NOT_FOUND",
        "Multi-taxi operating authorization was not found.",
        { authorizationId },
      );
    }
    return authorization;
  }

  private assertAuthorizationWindow(
    authorization: MultiTaxiOperatingAuthorizationRecord,
  ) {
    const now = Date.now();
    if (
      Date.parse(authorization.effectiveFrom) > now ||
      (authorization.effectiveUntil !== null &&
        Date.parse(authorization.effectiveUntil) <= now)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AUTHORIZATION_OUTSIDE_EFFECTIVE_WINDOW",
        "The authorization is outside its effective window.",
      );
    }
  }

  private requireText(value: string, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private requireStringList(value: string[], field: string) {
    const normalized = [
      ...new Set(value?.map((item) => item.trim()).filter(Boolean)),
    ];
    if (normalized.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_FIELD_REQUIRED",
        `${field} must contain at least one value.`,
        { field },
      );
    }
    return normalized;
  }

  private requireIso(value: string, field: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_TIMESTAMP_INVALID",
        `${field} must be an ISO-8601 timestamp.`,
        { field },
      );
    }
    return new Date(timestamp).toISOString();
  }

  private optionalIso(value: string | null | undefined, field: string) {
    return value === null || value === undefined
      ? null
      : this.requireIso(value, field);
  }

  private assertWindow(effectiveFrom: string, effectiveUntil: string | null) {
    if (
      effectiveUntil !== null &&
      Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_EFFECTIVE_WINDOW_INVALID",
        "effectiveUntil must be later than effectiveFrom.",
      );
    }
  }

  private persistAuthorization(
    authorization: MultiTaxiOperatingAuthorizationRecord,
    context: string,
  ) {
    void this.repository
      ?.persistAuthorization(this.cloneAuthorization(authorization))
      .catch((error) =>
        this.repository?.reportPersistenceFailure(error, context),
      );
  }

  private persistVehicle(
    vehicle: MultiTaxiAuthorizedVehicleRecord,
    context: string,
  ) {
    void this.repository
      ?.persistVehicle({ ...vehicle })
      .catch((error) =>
        this.repository?.reportPersistenceFailure(error, context),
      );
  }

  private cloneAuthorization(
    authorization: MultiTaxiOperatingAuthorizationRecord,
  ) {
    return {
      ...authorization,
      serviceAreaCodes: [...authorization.serviceAreaCodes],
    };
  }
}
