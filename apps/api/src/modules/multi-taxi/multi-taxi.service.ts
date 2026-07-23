import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddMultiTaxiAuthorizedVehicleCommand,
  CreateCallCenterMultiTaxiRideCommand,
  CreateMultiTaxiOperatingAuthorizationCommand,
  CreateMultiTaxiRideCommand,
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
  QueueCheckInCommand,
  QueueCheckOutCommand,
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

  createRide(
    command: CreateMultiTaxiRideCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const authorization = this.resolveActiveAuthorization();
    return this.ownedMobilityService.createMultiTaxiRide(
      command,
      authorization,
      identity,
      requestId,
    );
  }

  createCallCenterRide(
    command: CreateCallCenterMultiTaxiRideCommand,
    requestId?: string,
  ) {
    const authorization = this.resolveActiveAuthorization();
    return this.ownedMobilityService.createMultiTaxiRide(
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
