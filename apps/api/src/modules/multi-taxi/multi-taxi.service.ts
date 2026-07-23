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
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
  OwnedOrderRecord,
  PassengerRideAccessGrant,
  PassengerRideAccessToken,
  PassengerRideAuthorityView,
  PassengerRideContactOption,
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
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { MultiTaxiRepository } from "./multi-taxi.repository";

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

  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    @Optional() private readonly repository?: MultiTaxiRepository,
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

  async createRide(
    command: CreateMultiTaxiRideCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
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
    return persisted.rating;
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
    }
    return rating;
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
