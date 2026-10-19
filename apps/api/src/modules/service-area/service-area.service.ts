import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateServiceAreaBoundaryCommand,
  CreateStopPolicyCommand,
  EvaluateServiceAreaCommand,
  GeoCircle,
  GeoPoint,
  GeoPolygon,
  PublishServiceAreaBoundaryCommand,
  PublishStopPolicyCommand,
  RetireServiceAreaBoundaryCommand,
  RetireStopPolicyCommand,
  ServiceAreaBoundaryRecord,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceAreaEvaluationStopKind,
  ServiceAreaGeoJsonFeature,
  ServiceAreaGeoJsonResponse,
  ServiceAreaGeometry,
  ServiceAreaStopEvaluation,
  ServiceProductType,
  StopPolicyDirection,
  StopPolicyRecord,
  UpdateServiceAreaBoundaryCommand,
  UpdateStopPolicyCommand,
} from "@drts/contracts";
import {
  SERVICE_PRODUCT_TYPES,
  STOP_POLICY_DIRECTIONS,
  STOP_POLICY_EFFECTS,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { MapGeofenceObservabilityService } from "../operational-observability/map-geofence-observability.service";
import { ServiceAreaRepository } from "./service-area.repository";

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

type EvaluatedStop = {
  kind: ServiceAreaEvaluationStopKind;
  location: GeoPoint;
};

type ServiceAreaMutationContext = {
  actorId: string | null;
  actorType: AuditLogRecord["actorType"];
  requestId?: string;
};

const DEFAULT_SERVICE_AREAS: ServiceAreaBoundaryRecord[] = [
  {
    serviceAreaId: "11111111-1111-4111-8111-111111111111",
    areaCode: "TAIPEI_CORE",
    displayName: "Taipei core operating area",
    status: "active",
    geometry: {
      type: "polygon",
      coordinates: [
        { lat: 25.0005, lng: 121.4505 },
        { lat: 25.0005, lng: 121.625 },
        { lat: 25.125, lng: 121.625 },
        { lat: 25.125, lng: 121.4505 },
      ],
    },
    serviceProductTypes: [
      "taxi_realtime",
      "taxi_reservation",
      "enterprise_dispatch",
    ],
    effectiveFrom: DEFAULT_SEED_TIMESTAMP,
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: DEFAULT_SEED_TIMESTAMP,
    updatedAt: DEFAULT_SEED_TIMESTAMP,
  },
  {
    serviceAreaId: "22222222-2222-4222-8222-222222222222",
    areaCode: "TAOYUAN_AIRPORT",
    displayName: "Taoyuan airport transfer area",
    status: "active",
    geometry: {
      type: "circle",
      center: { lat: 25.0797, lng: 121.2342 },
      radiusMeters: 6500,
    },
    serviceProductTypes: ["credit_card_airport_transfer"],
    effectiveFrom: DEFAULT_SEED_TIMESTAMP,
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: DEFAULT_SEED_TIMESTAMP,
    updatedAt: DEFAULT_SEED_TIMESTAMP,
  },
];

const DEFAULT_STOP_POLICIES: StopPolicyRecord[] = [
  {
    stopPolicyId: "33333333-3333-4333-8333-333333333333",
    policyCode: "TPE_STATION_PICKUP_BLOCK",
    displayName: "Taipei station pickup curb restriction",
    status: "active",
    direction: "pickup",
    effect: "deny",
    geometry: {
      type: "circle",
      center: { lat: 25.0478, lng: 121.517 },
      radiusMeters: 220,
    },
    serviceAreaCodes: ["TAIPEI_CORE"],
    serviceProductTypes: [
      "taxi_realtime",
      "taxi_reservation",
      "enterprise_dispatch",
    ],
    reasonCode: "PICKUP_NOT_ALLOWED",
    reasonMessage: "Pickup is not allowed at this curb zone.",
    effectiveFrom: DEFAULT_SEED_TIMESTAMP,
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: DEFAULT_SEED_TIMESTAMP,
    updatedAt: DEFAULT_SEED_TIMESTAMP,
  },
  {
    stopPolicyId: "44444444-4444-4444-8444-444444444444",
    policyCode: "XINYI_HOSPITAL_MANUAL_REVIEW",
    displayName: "Xinyi hospital access manual review",
    status: "active",
    direction: "both",
    effect: "manual_review",
    geometry: {
      type: "circle",
      center: { lat: 25.0338, lng: 121.5645 },
      radiusMeters: 180,
    },
    serviceAreaCodes: ["TAIPEI_CORE"],
    serviceProductTypes: ["taxi_realtime", "taxi_reservation"],
    reasonCode: "STOP_REQUIRES_MANUAL_REVIEW",
    reasonMessage: "This stop requires ops review before dispatch.",
    effectiveFrom: DEFAULT_SEED_TIMESTAMP,
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: DEFAULT_SEED_TIMESTAMP,
    updatedAt: DEFAULT_SEED_TIMESTAMP,
  },
];

@Injectable()
export class ServiceAreaService implements OnModuleInit {
  private serviceAreas: ServiceAreaBoundaryRecord[] = [
    ...DEFAULT_SERVICE_AREAS,
  ];
  private stopPolicies: StopPolicyRecord[] = [...DEFAULT_STOP_POLICIES];

  constructor(
    @Optional() private readonly serviceAreaRepository?: ServiceAreaRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly mapGeofenceObservabilityService?: MapGeofenceObservabilityService,
  ) {}

  async onModuleInit() {
    if (!this.serviceAreaRepository) {
      return;
    }
    try {
      const state = await this.serviceAreaRepository.loadState();
      this.serviceAreas = this.mergeSeededServiceAreas(state.serviceAreas);
      this.stopPolicies = this.mergeSeededStopPolicies(state.stopPolicies);
    } catch (error) {
      this.serviceAreaRepository.reportPersistenceFailure(error, "module init");
    }
  }

  listServiceAreas() {
    return this.serviceAreas.map((record) => this.clone(record));
  }

  listStopPolicies() {
    return this.stopPolicies.map((record) => this.clone(record));
  }

  exportGeoJson(): ServiceAreaGeoJsonResponse {
    const serviceAreaFeatures =
      this.serviceAreas.map<ServiceAreaGeoJsonFeature>((record) => ({
        type: "Feature",
        id: record.serviceAreaId,
        geometry: this.geometryToGeoJson(record.geometry),
        properties: {
          recordKind: "service_area",
          serviceAreaId: record.serviceAreaId,
          areaCode: record.areaCode,
          displayName: record.displayName,
          status: record.status,
          sourceGeometry: this.clone(record.geometry),
          serviceProductTypes: [...record.serviceProductTypes],
          effectiveFrom: record.effectiveFrom,
          effectiveUntil: record.effectiveUntil,
          version: record.version,
          geometryVersionRef: this.geometryVersionRef(
            "service_area",
            record.areaCode,
            record.version,
          ),
          metadata: this.clone(record.metadata ?? {}),
        },
      }));
    const stopPolicyFeatures = this.stopPolicies.map<ServiceAreaGeoJsonFeature>(
      (record) => ({
        type: "Feature",
        id: record.stopPolicyId,
        geometry: this.geometryToGeoJson(record.geometry),
        properties: {
          recordKind: "stop_policy",
          stopPolicyId: record.stopPolicyId,
          policyCode: record.policyCode,
          displayName: record.displayName,
          status: record.status,
          direction: record.direction,
          effect: record.effect,
          sourceGeometry: this.clone(record.geometry),
          serviceAreaCodes: [...record.serviceAreaCodes],
          serviceProductTypes: [...record.serviceProductTypes],
          reasonCode: record.reasonCode,
          reasonMessage: record.reasonMessage,
          effectiveFrom: record.effectiveFrom,
          effectiveUntil: record.effectiveUntil,
          version: record.version,
          geometryVersionRef: this.geometryVersionRef(
            "stop_policy",
            record.policyCode,
            record.version,
          ),
          metadata: this.clone(record.metadata ?? {}),
        },
      }),
    );

    return {
      type: "FeatureCollection",
      features: [...serviceAreaFeatures, ...stopPolicyFeatures],
      generatedAt: new Date().toISOString(),
    };
  }

  exportOperationalGeoJson(
    requestedAt = new Date(),
  ): ServiceAreaGeoJsonResponse {
    const exported = this.exportGeoJson();
    return {
      ...exported,
      features: exported.features.filter((feature) => {
        const properties = feature.properties;
        return (
          properties.status === "active" &&
          this.recordIsEffective(
            properties.effectiveFrom,
            properties.effectiveUntil,
            requestedAt,
          )
        );
      }),
    };
  }

  async createServiceArea(
    command: CreateServiceAreaBoundaryCommand,
    context: ServiceAreaMutationContext,
  ) {
    const now = new Date().toISOString();
    const areaCode = this.normalizeCode(command.areaCode, "areaCode");
    const record: ServiceAreaBoundaryRecord = {
      serviceAreaId: randomUUID(),
      areaCode,
      displayName: this.normalizeText(command.displayName, "displayName"),
      status: "draft",
      geometry: this.normalizeGeometry(command.geometry),
      serviceProductTypes: this.normalizeServiceProducts(
        command.serviceProductTypes,
      ),
      effectiveFrom: this.normalizeEffectiveFrom(command.effectiveFrom, now),
      effectiveUntil: this.normalizeEffectiveUntil(command.effectiveUntil),
      version: this.nextServiceAreaVersion(areaCode),
      metadata: this.normalizeMetadata(command.metadata),
      createdAt: now,
      updatedAt: now,
    };
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    await this.persistServiceArea(record, "create_service_area");
    this.serviceAreas = [record, ...this.serviceAreas];
    const audit = this.recordAudit(
      "service_area.boundary.created",
      "service_area_boundary",
      record.serviceAreaId,
      {
        areaCode: record.areaCode,
        status: record.status,
        version: record.version,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async updateServiceArea(
    serviceAreaId: string,
    command: UpdateServiceAreaBoundaryCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireServiceArea(serviceAreaId);
    this.assertEditable(record.status, "service-area boundary");
    const previous = this.clone(record);
    if (command.displayName !== undefined) {
      record.displayName = this.normalizeText(
        command.displayName,
        "displayName",
      );
    }
    if (command.geometry !== undefined) {
      record.geometry = this.normalizeGeometry(command.geometry);
    }
    if (command.serviceProductTypes !== undefined) {
      record.serviceProductTypes = this.normalizeServiceProducts(
        command.serviceProductTypes,
      );
    }
    if (command.effectiveFrom !== undefined) {
      record.effectiveFrom = this.normalizeEffectiveFrom(
        command.effectiveFrom,
        record.effectiveFrom,
      );
    }
    if (command.effectiveUntil !== undefined) {
      record.effectiveUntil = this.normalizeEffectiveUntil(
        command.effectiveUntil,
      );
    }
    if (command.metadata !== undefined) {
      record.metadata = this.normalizeMetadata(command.metadata);
    }
    record.updatedAt = new Date().toISOString();
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    try {
      await this.persistServiceArea(record, "update_service_area");
    } catch (error) {
      this.replaceServiceArea(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.boundary.updated",
      "service_area_boundary",
      record.serviceAreaId,
      {
        areaCode: record.areaCode,
        status: record.status,
        version: record.version,
        previousStatus: previous.status,
      },
      context,
      {
        displayName: previous.displayName,
        status: previous.status,
        effectiveFrom: previous.effectiveFrom,
        effectiveUntil: previous.effectiveUntil,
        version: previous.version,
      },
    );
    return { record: this.clone(record), audit };
  }

  async submitServiceAreaForReview(
    serviceAreaId: string,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireServiceArea(serviceAreaId);
    if (record.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_SERVICE_AREA_LIFECYCLE",
        "Only draft service-area boundaries can be submitted for review.",
        { serviceAreaId, status: record.status },
      );
    }
    const previous = this.clone(record);
    record.status = "review";
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistServiceArea(record, "submit_service_area_review");
    } catch (error) {
      this.replaceServiceArea(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.boundary.submitted_for_review",
      "service_area_boundary",
      record.serviceAreaId,
      {
        areaCode: record.areaCode,
        status: record.status,
        version: record.version,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async publishServiceArea(
    serviceAreaId: string,
    command: PublishServiceAreaBoundaryCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireServiceArea(serviceAreaId);
    if (record.status !== "draft" && record.status !== "review") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_SERVICE_AREA_LIFECYCLE",
        "Only draft or review service-area boundaries can be published.",
        { serviceAreaId, status: record.status },
      );
    }
    const previous = this.clone(record);
    if (command.effectiveFrom !== undefined) {
      record.effectiveFrom = this.normalizeEffectiveFrom(
        command.effectiveFrom,
        record.effectiveFrom,
      );
    }
    if (command.effectiveUntil !== undefined) {
      record.effectiveUntil = this.normalizeEffectiveUntil(
        command.effectiveUntil,
      );
    }
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    this.assertNoActiveServiceAreaOverlap(record);
    record.status = "active";
    record.metadata = this.withLifecycleMetadata(record.metadata, {
      publishedAt: new Date().toISOString(),
      publishReason: command.reason ?? null,
    });
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistServiceArea(record, "publish_service_area");
    } catch (error) {
      this.replaceServiceArea(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.boundary.published",
      "service_area_boundary",
      record.serviceAreaId,
      {
        areaCode: record.areaCode,
        status: record.status,
        version: record.version,
        geometryVersionRef: this.geometryVersionRef(
          "service_area",
          record.areaCode,
          record.version,
        ),
        reason: command.reason ?? null,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async retireServiceArea(
    serviceAreaId: string,
    command: RetireServiceAreaBoundaryCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireServiceArea(serviceAreaId);
    if (record.status === "retired") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_SERVICE_AREA_LIFECYCLE",
        "Service-area boundary is already retired.",
        { serviceAreaId, status: record.status },
      );
    }
    const previous = this.clone(record);
    record.status = "retired";
    record.effectiveUntil =
      this.normalizeEffectiveUntil(command.effectiveUntil) ??
      this.retirementInstantAfter(record.effectiveFrom);
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    record.metadata = this.withLifecycleMetadata(record.metadata, {
      retiredAt: new Date().toISOString(),
      retireReason: command.reason ?? null,
    });
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistServiceArea(record, "retire_service_area");
    } catch (error) {
      this.replaceServiceArea(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.boundary.retired",
      "service_area_boundary",
      record.serviceAreaId,
      {
        areaCode: record.areaCode,
        status: record.status,
        version: record.version,
        effectiveUntil: record.effectiveUntil,
        reason: command.reason ?? null,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async createStopPolicy(
    command: CreateStopPolicyCommand,
    context: ServiceAreaMutationContext,
  ) {
    const now = new Date().toISOString();
    const policyCode = this.normalizeCode(command.policyCode, "policyCode");
    const record: StopPolicyRecord = {
      stopPolicyId: randomUUID(),
      policyCode,
      displayName: this.normalizeText(command.displayName, "displayName"),
      status: "draft",
      direction: this.normalizeStopPolicyDirection(command.direction),
      effect: this.normalizeStopPolicyEffect(command.effect),
      geometry: this.normalizeGeometry(command.geometry),
      serviceAreaCodes: command.serviceAreaCodes.map((code) =>
        this.normalizeCode(code, "serviceAreaCodes"),
      ),
      serviceProductTypes: this.normalizeServiceProducts(
        command.serviceProductTypes,
      ),
      reasonCode: this.normalizeCode(command.reasonCode, "reasonCode"),
      reasonMessage: this.normalizeText(command.reasonMessage, "reasonMessage"),
      effectiveFrom: this.normalizeEffectiveFrom(command.effectiveFrom, now),
      effectiveUntil: this.normalizeEffectiveUntil(command.effectiveUntil),
      version: this.nextStopPolicyVersion(policyCode),
      metadata: this.normalizeMetadata(command.metadata),
      createdAt: now,
      updatedAt: now,
    };
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    await this.persistStopPolicy(record, "create_stop_policy");
    this.stopPolicies = [record, ...this.stopPolicies];
    const audit = this.recordAudit(
      "service_area.stop_policy.created",
      "stop_policy",
      record.stopPolicyId,
      {
        policyCode: record.policyCode,
        status: record.status,
        version: record.version,
        effect: record.effect,
        direction: record.direction,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async updateStopPolicy(
    stopPolicyId: string,
    command: UpdateStopPolicyCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireStopPolicy(stopPolicyId);
    this.assertEditable(record.status, "stop policy");
    const previous = this.clone(record);
    if (command.displayName !== undefined) {
      record.displayName = this.normalizeText(
        command.displayName,
        "displayName",
      );
    }
    if (command.direction !== undefined) {
      record.direction = this.normalizeStopPolicyDirection(command.direction);
    }
    if (command.effect !== undefined) {
      record.effect = this.normalizeStopPolicyEffect(command.effect);
    }
    if (command.geometry !== undefined) {
      record.geometry = this.normalizeGeometry(command.geometry);
    }
    if (command.serviceAreaCodes !== undefined) {
      record.serviceAreaCodes = command.serviceAreaCodes.map((code) =>
        this.normalizeCode(code, "serviceAreaCodes"),
      );
    }
    if (command.serviceProductTypes !== undefined) {
      record.serviceProductTypes = this.normalizeServiceProducts(
        command.serviceProductTypes,
      );
    }
    if (command.reasonCode !== undefined) {
      record.reasonCode = this.normalizeCode(command.reasonCode, "reasonCode");
    }
    if (command.reasonMessage !== undefined) {
      record.reasonMessage = this.normalizeText(
        command.reasonMessage,
        "reasonMessage",
      );
    }
    if (command.effectiveFrom !== undefined) {
      record.effectiveFrom = this.normalizeEffectiveFrom(
        command.effectiveFrom,
        record.effectiveFrom,
      );
    }
    if (command.effectiveUntil !== undefined) {
      record.effectiveUntil = this.normalizeEffectiveUntil(
        command.effectiveUntil,
      );
    }
    if (command.metadata !== undefined) {
      record.metadata = this.normalizeMetadata(command.metadata);
    }
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistStopPolicy(record, "update_stop_policy");
    } catch (error) {
      this.replaceStopPolicy(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.stop_policy.updated",
      "stop_policy",
      record.stopPolicyId,
      {
        policyCode: record.policyCode,
        status: record.status,
        version: record.version,
        previousStatus: previous.status,
      },
      context,
      {
        displayName: previous.displayName,
        status: previous.status,
        effectiveFrom: previous.effectiveFrom,
        effectiveUntil: previous.effectiveUntil,
        version: previous.version,
      },
    );
    return { record: this.clone(record), audit };
  }

  async submitStopPolicyForReview(
    stopPolicyId: string,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireStopPolicy(stopPolicyId);
    if (record.status !== "draft") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_STOP_POLICY_LIFECYCLE",
        "Only draft stop policies can be submitted for review.",
        { stopPolicyId, status: record.status },
      );
    }
    const previous = this.clone(record);
    record.status = "review";
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistStopPolicy(record, "submit_stop_policy_review");
    } catch (error) {
      this.replaceStopPolicy(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.stop_policy.submitted_for_review",
      "stop_policy",
      record.stopPolicyId,
      {
        policyCode: record.policyCode,
        status: record.status,
        version: record.version,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async publishStopPolicy(
    stopPolicyId: string,
    command: PublishStopPolicyCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireStopPolicy(stopPolicyId);
    if (record.status !== "draft" && record.status !== "review") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_STOP_POLICY_LIFECYCLE",
        "Only draft or review stop policies can be published.",
        { stopPolicyId, status: record.status },
      );
    }
    const previous = this.clone(record);
    if (command.effectiveFrom !== undefined) {
      record.effectiveFrom = this.normalizeEffectiveFrom(
        command.effectiveFrom,
        record.effectiveFrom,
      );
    }
    if (command.effectiveUntil !== undefined) {
      record.effectiveUntil = this.normalizeEffectiveUntil(
        command.effectiveUntil,
      );
    }
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    this.assertNoActiveStopPolicyOverlap(record);
    record.status = "active";
    record.metadata = this.withLifecycleMetadata(record.metadata, {
      publishedAt: new Date().toISOString(),
      publishReason: command.reason ?? null,
    });
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistStopPolicy(record, "publish_stop_policy");
    } catch (error) {
      this.replaceStopPolicy(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.stop_policy.published",
      "stop_policy",
      record.stopPolicyId,
      {
        policyCode: record.policyCode,
        status: record.status,
        version: record.version,
        geometryVersionRef: this.geometryVersionRef(
          "stop_policy",
          record.policyCode,
          record.version,
        ),
        reason: command.reason ?? null,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  async retireStopPolicy(
    stopPolicyId: string,
    command: RetireStopPolicyCommand,
    context: ServiceAreaMutationContext,
  ) {
    const record = this.requireStopPolicy(stopPolicyId);
    if (record.status === "retired") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_STOP_POLICY_LIFECYCLE",
        "Stop policy is already retired.",
        { stopPolicyId, status: record.status },
      );
    }
    const previous = this.clone(record);
    record.status = "retired";
    record.effectiveUntil =
      this.normalizeEffectiveUntil(command.effectiveUntil) ??
      this.retirementInstantAfter(record.effectiveFrom);
    this.assertEffectiveWindow(record.effectiveFrom, record.effectiveUntil);
    record.metadata = this.withLifecycleMetadata(record.metadata, {
      retiredAt: new Date().toISOString(),
      retireReason: command.reason ?? null,
    });
    record.updatedAt = new Date().toISOString();
    try {
      await this.persistStopPolicy(record, "retire_stop_policy");
    } catch (error) {
      this.replaceStopPolicy(previous);
      throw error;
    }
    const audit = this.recordAudit(
      "service_area.stop_policy.retired",
      "stop_policy",
      record.stopPolicyId,
      {
        policyCode: record.policyCode,
        status: record.status,
        version: record.version,
        effectiveUntil: record.effectiveUntil,
        reason: command.reason ?? null,
      },
      context,
    );
    return { record: this.clone(record), audit };
  }

  evaluate(
    command: EvaluateServiceAreaCommand,
    requestId?: string,
  ): ServiceAreaEvaluationResult {
    if (
      !this.hasCompletePoint(command.pickup) ||
      (command.dropoff !== undefined &&
        command.dropoff !== null &&
        !this.hasCompletePoint(command.dropoff))
    ) {
      this.mapGeofenceObservabilityService?.recordServiceAreaEvaluation({
        decision: "coordinate_less_attempt",
        policyDenied: false,
      });
      this.recordServiceAreaEvaluationAudit(
        {
          decision: "coordinate_less_attempt",
          serviceProductType: command.serviceProductType,
          reasonCodes: ["COORDINATE_LESS_ATTEMPT"],
          reasonMessages: [
            "Service-area evaluation requires pickup/dropoff coordinates.",
          ],
        },
        requestId,
      );
    }
    const serviceProductType = this.normalizeServiceProductType(
      command.serviceProductType,
    );
    const requestedAt = command.requestedAt
      ? new Date(command.requestedAt)
      : new Date();
    if (Number.isNaN(requestedAt.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "requestedAt must be an ISO timestamp.",
        { field: "requestedAt" },
      );
    }

    const stops: EvaluatedStop[] = [
      {
        kind: "pickup",
        location: this.normalizePoint(command.pickup, "pickup"),
      },
    ];
    if (command.dropoff) {
      stops.push({
        kind: "dropoff",
        location: this.normalizePoint(command.dropoff, "dropoff"),
      });
    }

    const activeAreas = this.activeServiceAreas(
      serviceProductType,
      requestedAt,
    );
    const activePolicies = this.activeStopPolicies(
      serviceProductType,
      requestedAt,
    );
    const evaluatedStops = stops.map((stop) =>
      this.evaluateStop(stop, serviceProductType, activeAreas, activePolicies),
    );
    const decision = this.resolveOverallDecision(
      evaluatedStops.map((stop) => stop.decision),
    );

    const result: ServiceAreaEvaluationResult = {
      decision,
      serviceProductType,
      evaluatedAt: new Date().toISOString(),
      stops: evaluatedStops,
      serviceAreaCodes: this.unique(
        evaluatedStops.flatMap((stop) => stop.serviceAreaCodes),
      ),
      geometryVersionRefs: this.unique(
        evaluatedStops.flatMap((stop) => stop.geometryVersionRefs),
      ),
      reasonCodes: this.unique(
        evaluatedStops.flatMap((stop) => stop.reasonCodes),
      ),
      reasonMessages: this.unique(
        evaluatedStops.flatMap((stop) => stop.reasonMessages),
      ),
    };
    const policyDenied = this.isPolicyDenied(result);
    this.mapGeofenceObservabilityService?.recordServiceAreaEvaluation({
      decision: result.decision,
      policyDenied,
    });
    this.recordServiceAreaEvaluationAudit(result, requestId);
    return result;
  }

  private requireServiceArea(serviceAreaId: string) {
    const record = this.serviceAreas.find(
      (serviceArea) => serviceArea.serviceAreaId === serviceAreaId,
    );
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SERVICE_AREA_NOT_FOUND",
        "Service-area boundary was not found.",
        { serviceAreaId },
      );
    }
    return record;
  }

  private requireStopPolicy(stopPolicyId: string) {
    const record = this.stopPolicies.find(
      (stopPolicy) => stopPolicy.stopPolicyId === stopPolicyId,
    );
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "STOP_POLICY_NOT_FOUND",
        "Stop policy was not found.",
        { stopPolicyId },
      );
    }
    return record;
  }

  private assertEditable(status: string, label: string) {
    if (status === "active" || status === "retired") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "GEOMETRY_RECORD_NOT_EDITABLE",
        `Published or retired ${label} records cannot be edited; create a new version instead.`,
        { status },
      );
    }
  }

  private normalizeCode(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_:-]/g, "_");
    if (normalized.length > 100) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is too long.`,
        { field, maxLength: 100 },
      );
    }
    return normalized;
  }

  private normalizeText(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    return value.trim();
  }

  private normalizeMetadata(value: unknown) {
    if (value === undefined || value === null) {
      return {};
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "metadata must be an object.",
        { field: "metadata" },
      );
    }
    return this.clone(value as Record<string, unknown>);
  }

  private normalizeServiceProducts(
    values: ServiceProductType[],
  ): ServiceProductType[] {
    if (!Array.isArray(values)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "serviceProductTypes must be an array.",
        { field: "serviceProductTypes" },
      );
    }
    return this.unique(
      values.map((value) => this.normalizeServiceProductType(value)),
    ) as ServiceProductType[];
  }

  private normalizeStopPolicyDirection(value: StopPolicyDirection) {
    if (!STOP_POLICY_DIRECTIONS.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "direction is unsupported.",
        { field: "direction", value },
      );
    }
    return value;
  }

  private normalizeStopPolicyEffect(value: StopPolicyRecord["effect"]) {
    if (!STOP_POLICY_EFFECTS.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "effect is unsupported.",
        { field: "effect", value },
      );
    }
    return value;
  }

  private normalizeGeometry(
    geometry: ServiceAreaGeometry,
  ): ServiceAreaGeometry {
    if (!geometry || typeof geometry !== "object") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "geometry is required.",
        { field: "geometry" },
      );
    }
    if (geometry.type === "circle") {
      const center = this.normalizePoint(geometry.center, "geometry.center");
      const radiusMeters = Number(geometry.radiusMeters);
      if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_GEOMETRY",
          "geometry.radiusMeters must be greater than zero.",
          { field: "geometry.radiusMeters" },
        );
      }
      return { type: "circle", center, radiusMeters };
    }
    if (geometry.type !== "polygon" || !Array.isArray(geometry.coordinates)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GEOMETRY",
        "geometry must be a circle or polygon.",
        { field: "geometry.type" },
      );
    }
    const coordinates = this.normalizePolygonRing(
      geometry.coordinates,
      "geometry.coordinates",
    );

    const normalizedHoles: GeoPoint[][] = [];
    if (geometry.holes !== undefined && geometry.holes !== null) {
      if (!Array.isArray(geometry.holes)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_GEOMETRY",
          "polygon holes must be an array of rings.",
          { field: "geometry.holes" },
        );
      }
      geometry.holes.forEach((hole, holeIndex) => {
        const holeField = `geometry.holes.${holeIndex}`;
        const normalizedHole = this.normalizePolygonRing(hole, holeField);

        const liesStrictlyInside = normalizedHole.every(
          (vertex) =>
            this.ringContainsPoint(coordinates, vertex) &&
            !this.pointOnRingBoundary(coordinates, vertex),
        );
        if (
          !liesStrictlyInside ||
          this.ringsIntersectOrTouch(coordinates, normalizedHole)
        ) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "INVALID_GEOMETRY_HOLE_OUTSIDE_BOUNDARY",
            "polygon hole must lie strictly inside the outer boundary.",
            { field: holeField },
          );
        }

        for (const prevHole of normalizedHoles) {
          if (
            this.ringsIntersectOrTouch(prevHole, normalizedHole) ||
            this.ringContainsPoint(prevHole, normalizedHole[0]!) ||
            this.ringContainsPoint(normalizedHole, prevHole[0]!)
          ) {
            throw new ApiRequestError(
              HttpStatus.BAD_REQUEST,
              "INVALID_GEOMETRY_HOLE_OVERLAP",
              "polygon holes cannot intersect, touch, or nest.",
              { field: holeField },
            );
          }
        }

        normalizedHoles.push(normalizedHole);
      });
    }

    return normalizedHoles.length > 0
      ? { type: "polygon", coordinates, holes: normalizedHoles }
      : { type: "polygon", coordinates };
  }

  private normalizePolygonRing(points: unknown, fieldPath: string): GeoPoint[] {
    if (!Array.isArray(points)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GEOMETRY",
        "polygon geometry requires an array of points.",
        { field: fieldPath },
      );
    }
    const normalized = points.map((point, index) =>
      this.normalizePoint(point as GeoPoint, `${fieldPath}.${index}`),
    );
    let ring = normalized;
    if (
      ring.length >= 2 &&
      this.pointsEqual(ring[0]!, ring[ring.length - 1]!)
    ) {
      ring = ring.slice(0, -1);
    }
    if (ring.length < 3 || this.distinctPointCount(ring) < 3) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GEOMETRY",
        "polygon geometry requires at least three points.",
        { field: fieldPath },
      );
    }
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index]!;
      const next = ring[(index + 1) % ring.length]!;
      if (this.pointsEqual(current, next)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_GEOMETRY",
          "polygon ring cannot contain duplicate consecutive vertices or zero-length edges.",
          { field: fieldPath },
        );
      }
    }
    if (Math.abs(this.signedRingArea(ring)) < 1e-10) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GEOMETRY",
        "polygon geometry area must be non-zero.",
        { field: fieldPath },
      );
    }
    if (this.polygonSelfIntersects(ring)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GEOMETRY_SELF_INTERSECTION",
        "polygon geometry cannot self-intersect.",
        { field: fieldPath },
      );
    }
    return ring;
  }

  private signedRingArea(points: GeoPoint[]) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      area += current.lng * next.lat - next.lng * current.lat;
    }
    return area / 2;
  }

  private normalizeEffectiveFrom(
    value: string | null | undefined,
    fallback: string,
  ) {
    if (value === undefined || value === null || value.trim().length === 0) {
      return fallback;
    }
    return this.normalizeIsoTimestamp(value, "effectiveFrom");
  }

  /**
   * Default `effectiveUntil` for a retirement with no explicit end.
   *
   * "Now" is the natural answer, but `effectiveFrom` also defaults to "now"
   * at creation, and a boundary (or stop policy) created, published and
   * retired within the same millisecond then fails `assertEffectiveWindow`,
   * which requires a strictly positive window. That is not hypothetical: the
   * C106 acceptance test does exactly that and failed on fast CI runners.
   * Retiring something that was never effective is a legitimate zero-length
   * lifecycle, so the end is clamped to one millisecond after the start.
   */
  private retirementInstantAfter(effectiveFrom: string) {
    const now = Date.now();
    const from = Date.parse(effectiveFrom);
    const earliestEnd = Number.isNaN(from) ? now : from + 1;
    return new Date(Math.max(now, earliestEnd)).toISOString();
  }

  private normalizeEffectiveUntil(value: string | null | undefined) {
    if (value === undefined || value === null || value.trim().length === 0) {
      return null;
    }
    return this.normalizeIsoTimestamp(value, "effectiveUntil");
  }

  private normalizeIsoTimestamp(value: string, field: string) {
    const parsedMs = Date.parse(value);
    if (Number.isNaN(parsedMs)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} must be an ISO timestamp.`,
        { field },
      );
    }
    return new Date(parsedMs).toISOString();
  }

  private assertEffectiveWindow(
    effectiveFrom: string,
    effectiveUntil: string | null,
  ) {
    if (
      effectiveUntil &&
      Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_EFFECTIVE_WINDOW",
        "effectiveUntil must be after effectiveFrom.",
        { effectiveFrom, effectiveUntil },
      );
    }
  }

  private nextServiceAreaVersion(areaCode: string) {
    return (
      Math.max(
        0,
        ...this.serviceAreas
          .filter((area) => area.areaCode === areaCode)
          .map((area) => area.version),
      ) + 1
    );
  }

  private nextStopPolicyVersion(policyCode: string) {
    return (
      Math.max(
        0,
        ...this.stopPolicies
          .filter((policy) => policy.policyCode === policyCode)
          .map((policy) => policy.version),
      ) + 1
    );
  }

  private assertNoActiveServiceAreaOverlap(record: ServiceAreaBoundaryRecord) {
    const overlapping = this.serviceAreas.find(
      (area) =>
        area.serviceAreaId !== record.serviceAreaId &&
        area.areaCode === record.areaCode &&
        area.status === "active" &&
        this.effectiveWindowsOverlap(area, record),
    );
    if (overlapping) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SERVICE_AREA_EFFECTIVE_WINDOW_OVERLAP",
        "Published service-area versions for the same area code cannot overlap.",
        {
          areaCode: record.areaCode,
          overlappingServiceAreaId: overlapping.serviceAreaId,
        },
      );
    }
  }

  private assertNoActiveStopPolicyOverlap(record: StopPolicyRecord) {
    const overlapping = this.stopPolicies.find(
      (policy) =>
        policy.stopPolicyId !== record.stopPolicyId &&
        policy.policyCode === record.policyCode &&
        policy.status === "active" &&
        this.effectiveWindowsOverlap(policy, record),
    );
    if (overlapping) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "STOP_POLICY_EFFECTIVE_WINDOW_OVERLAP",
        "Published stop-policy versions for the same policy code cannot overlap.",
        {
          policyCode: record.policyCode,
          overlappingStopPolicyId: overlapping.stopPolicyId,
        },
      );
    }
  }

  private effectiveWindowsOverlap(
    left: Pick<ServiceAreaBoundaryRecord, "effectiveFrom" | "effectiveUntil">,
    right: Pick<ServiceAreaBoundaryRecord, "effectiveFrom" | "effectiveUntil">,
  ) {
    const leftStart = Date.parse(left.effectiveFrom);
    const leftEnd = left.effectiveUntil
      ? Date.parse(left.effectiveUntil)
      : Number.POSITIVE_INFINITY;
    const rightStart = Date.parse(right.effectiveFrom);
    const rightEnd = right.effectiveUntil
      ? Date.parse(right.effectiveUntil)
      : Number.POSITIVE_INFINITY;
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  private withLifecycleMetadata(
    metadata: Record<string, unknown> | undefined,
    lifecycle: Record<string, unknown>,
  ) {
    return {
      ...(metadata ?? {}),
      lifecycle: {
        ...((metadata?.lifecycle as Record<string, unknown> | undefined) ?? {}),
        ...lifecycle,
      },
    };
  }

  private mergeSeededServiceAreas(persisted: ServiceAreaBoundaryRecord[]) {
    const persistedKeys = new Set(
      persisted.flatMap((record) => [
        record.serviceAreaId,
        `${record.areaCode}:${record.version}`,
      ]),
    );
    const missingSeeds = DEFAULT_SERVICE_AREAS.filter(
      (seed) =>
        !persistedKeys.has(seed.serviceAreaId) &&
        !persistedKeys.has(`${seed.areaCode}:${seed.version}`),
    );
    return [
      ...persisted.map((record) => this.clone(record)),
      ...missingSeeds.map((record) => this.clone(record)),
    ];
  }

  private mergeSeededStopPolicies(persisted: StopPolicyRecord[]) {
    const persistedKeys = new Set(
      persisted.flatMap((record) => [
        record.stopPolicyId,
        `${record.policyCode}:${record.version}`,
      ]),
    );
    const missingSeeds = DEFAULT_STOP_POLICIES.filter(
      (seed) =>
        !persistedKeys.has(seed.stopPolicyId) &&
        !persistedKeys.has(`${seed.policyCode}:${seed.version}`),
    );
    return [
      ...persisted.map((record) => this.clone(record)),
      ...missingSeeds.map((record) => this.clone(record)),
    ];
  }

  private replaceServiceArea(previous: ServiceAreaBoundaryRecord) {
    this.serviceAreas = this.serviceAreas.map((record) =>
      record.serviceAreaId === previous.serviceAreaId
        ? this.clone(previous)
        : record,
    );
  }

  private replaceStopPolicy(previous: StopPolicyRecord) {
    this.stopPolicies = this.stopPolicies.map((record) =>
      record.stopPolicyId === previous.stopPolicyId
        ? this.clone(previous)
        : record,
    );
  }

  private async persistServiceArea(
    record: ServiceAreaBoundaryRecord,
    context: string,
  ) {
    try {
      await this.serviceAreaRepository?.persistServiceArea(this.clone(record));
    } catch (error) {
      this.serviceAreaRepository?.reportPersistenceFailure(error, context);
      throw this.persistenceFailure(error, context);
    }
  }

  private async persistStopPolicy(record: StopPolicyRecord, context: string) {
    try {
      await this.serviceAreaRepository?.persistStopPolicy(this.clone(record));
    } catch (error) {
      this.serviceAreaRepository?.reportPersistenceFailure(error, context);
      throw this.persistenceFailure(error, context);
    }
  }

  private persistenceFailure(error: unknown, context: string) {
    return new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "SERVICE_AREA_PERSISTENCE_FAILED",
      "Service-area governance mutation could not be persisted.",
      {
        context,
        detail: error instanceof Error ? error.message : String(error),
      },
      true,
    );
  }

  private recordAudit(
    actionName: string,
    resourceType: string,
    resourceId: string,
    newValuesSummary: Record<string, unknown>,
    context: ServiceAreaMutationContext,
    oldValuesSummary?: Record<string, unknown>,
  ) {
    this.recordGeometryMutationMetric(actionName);
    return (
      this.auditNotificationService?.recordAuditLog({
        actorId: context.actorId,
        actorType: context.actorType,
        tenantId: null,
        moduleName: "service-area",
        actionName,
        resourceType,
        resourceId,
        ...(oldValuesSummary ? { oldValuesSummary } : {}),
        newValuesSummary,
        ...(context.requestId ? { requestId: context.requestId } : {}),
      }) ?? null
    );
  }

  private recordServiceAreaEvaluationAudit(
    result:
      | ServiceAreaEvaluationResult
      | {
          decision: "coordinate_less_attempt";
          serviceProductType: unknown;
          reasonCodes: string[];
          reasonMessages: string[];
        },
    requestId?: string,
  ) {
    this.auditNotificationService?.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "service-area",
      actionName: "service_area.evaluated",
      resourceType: "service_area_evaluation",
      resourceId: null,
      newValuesSummary: {
        decision: result.decision,
        serviceProductType: result.serviceProductType ?? null,
        reasonCodes: result.reasonCodes,
        reasonMessages: result.reasonMessages,
        ...("serviceAreaCodes" in result
          ? {
              serviceAreaCodes: result.serviceAreaCodes,
              policyCodes: this.unique(
                result.stops.flatMap((stop) => stop.policyCodes),
              ),
              geometryVersionRefs: result.geometryVersionRefs,
            }
          : { coordinateLessAttempt: true }),
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private recordGeometryMutationMetric(actionName: string) {
    switch (actionName) {
      case "service_area.boundary.published":
        this.mapGeofenceObservabilityService?.recordGeometryMutation(
          "service_area_published",
        );
        return;
      case "service_area.boundary.retired":
        this.mapGeofenceObservabilityService?.recordGeometryMutation(
          "service_area_retired",
        );
        return;
      case "service_area.stop_policy.published":
        this.mapGeofenceObservabilityService?.recordGeometryMutation(
          "stop_policy_published",
        );
        return;
      case "service_area.stop_policy.retired":
        this.mapGeofenceObservabilityService?.recordGeometryMutation(
          "stop_policy_retired",
        );
        return;
      case "service_area.boundary.created":
      case "service_area.boundary.updated":
      case "service_area.stop_policy.created":
      case "service_area.stop_policy.updated":
        this.mapGeofenceObservabilityService?.recordGeometryMutation(
          "geometry_mutation",
        );
        return;
    }
  }

  private isPolicyDenied(result: ServiceAreaEvaluationResult) {
    return result.stops.some(
      (stop) =>
        stop.decision === "not_serviceable" && stop.policyCodes.length > 0,
    );
  }

  private hasCompletePoint(value: unknown) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const point = value as Record<string, unknown>;
    return point.lat !== undefined && point.lng !== undefined;
  }

  /**
   * Checks an unclosed polygon ring (exterior or hole) for repeated
   * non-adjacent vertices (pinches), adjacent-edge 180-degree fold-backs
   * (spikes/reversals), and non-adjacent edge crossing, touching, or
   * collinear overlap. Shared by exterior rings and hole rings so both are
   * held to the same non-degeneracy standard.
   */
  private polygonSelfIntersects(points: GeoPoint[]) {
    const n = points.length;
    if (n < 3) {
      return false;
    }

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (j === i + 1) {
          continue;
        }
        if (i === 0 && j === n - 1) {
          continue;
        }
        if (this.pointsEqual(points[i]!, points[j]!)) {
          return true;
        }
      }
    }

    for (let i = 0; i < n; i += 1) {
      const prev = points[(i - 1 + n) % n]!;
      const curr = points[i]!;
      const next = points[(i + 1) % n]!;
      if (this.segmentOrientation(prev, curr, next) === 0) {
        const dot =
          (prev.lng - curr.lng) * (next.lng - curr.lng) +
          (prev.lat - curr.lat) * (next.lat - curr.lat);
        if (dot > 0) {
          return true;
        }
      }
    }

    for (let i = 0; i < n; i += 1) {
      const leftStart = points[i]!;
      const leftEnd = points[(i + 1) % n]!;
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(i - j) <= 1) {
          continue;
        }
        if (i === 0 && j === n - 1) {
          continue;
        }
        const rightStart = points[j]!;
        const rightEnd = points[(j + 1) % n]!;
        if (
          this.segmentsIntersectOrTouch(
            leftStart,
            leftEnd,
            rightStart,
            rightEnd,
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private pointsEqual(left: GeoPoint, right: GeoPoint) {
    return left.lat === right.lat && left.lng === right.lng;
  }

  private distinctPointCount(points: GeoPoint[]) {
    const seen: GeoPoint[] = [];
    for (const point of points) {
      if (!seen.some((candidate) => this.pointsEqual(candidate, point))) {
        seen.push(point);
      }
    }
    return seen.length;
  }

  private segmentOrientation(
    start: GeoPoint,
    end: GeoPoint,
    point: GeoPoint,
  ): -1 | 0 | 1 {
    const cross =
      (point.lng - start.lng) * (end.lat - start.lat) -
      (point.lat - start.lat) * (end.lng - start.lng);
    if (Math.abs(cross) < 1e-10) {
      return 0;
    }
    return cross > 0 ? 1 : -1;
  }

  private segmentsIntersectOrTouch(
    leftStart: GeoPoint,
    leftEnd: GeoPoint,
    rightStart: GeoPoint,
    rightEnd: GeoPoint,
  ) {
    const d1 = this.segmentOrientation(leftStart, leftEnd, rightStart);
    const d2 = this.segmentOrientation(leftStart, leftEnd, rightEnd);
    const d3 = this.segmentOrientation(rightStart, rightEnd, leftStart);
    const d4 = this.segmentOrientation(rightStart, rightEnd, leftEnd);
    if (d1 !== d2 && d3 !== d4) {
      return true;
    }
    if (d1 === 0 && this.pointOnSegment(rightStart, leftStart, leftEnd)) {
      return true;
    }
    if (d2 === 0 && this.pointOnSegment(rightEnd, leftStart, leftEnd)) {
      return true;
    }
    if (d3 === 0 && this.pointOnSegment(leftStart, rightStart, rightEnd)) {
      return true;
    }
    if (d4 === 0 && this.pointOnSegment(leftEnd, rightStart, rightEnd)) {
      return true;
    }
    return false;
  }

  /**
   * Checks whether every edge of `leftRing` crosses, touches, or collinearly
   * overlaps any edge of `rightRing`. Used for hole-vs-outer-boundary and
   * hole-vs-hole disjointness checks, where the two rings are independent
   * (no shared adjacency to exclude).
   */
  private ringsIntersectOrTouch(leftRing: GeoPoint[], rightRing: GeoPoint[]) {
    const leftCount = leftRing.length;
    const rightCount = rightRing.length;
    for (let i = 0; i < leftCount; i += 1) {
      const leftStart = leftRing[i]!;
      const leftEnd = leftRing[(i + 1) % leftCount]!;
      for (let j = 0; j < rightCount; j += 1) {
        const rightStart = rightRing[j]!;
        const rightEnd = rightRing[(j + 1) % rightCount]!;
        if (
          this.segmentsIntersectOrTouch(
            leftStart,
            leftEnd,
            rightStart,
            rightEnd,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private evaluateStop(
    stop: EvaluatedStop,
    serviceProductType: ServiceProductType,
    activeAreas: ServiceAreaBoundaryRecord[],
    activePolicies: StopPolicyRecord[],
  ): ServiceAreaStopEvaluation {
    const matchedAreas = activeAreas.filter((area) =>
      this.geometryContainsPoint(area.geometry, stop.location),
    );
    const serviceAreaCodes = matchedAreas.map((area) => area.areaCode);
    const reasonCodes: string[] = [];
    const reasonMessages: string[] = [];
    const geometryVersionRefs = matchedAreas.map((area) =>
      this.geometryVersionRef("service_area", area.areaCode, area.version),
    );
    let decision: ServiceAreaEvaluationDecision = "serviceable";

    if (activeAreas.length > 0 && matchedAreas.length === 0) {
      decision = "not_serviceable";
      reasonCodes.push(`${stop.kind.toUpperCase()}_AREA_NOT_SERVICEABLE`);
      reasonMessages.push(`${stop.kind} is outside the service area.`);
    }

    const policies = activePolicies.filter((policy) => {
      if (!this.directionApplies(policy.direction, stop.kind)) {
        return false;
      }
      if (
        policy.serviceAreaCodes.length > 0 &&
        !policy.serviceAreaCodes.some((areaCode) =>
          serviceAreaCodes.includes(areaCode),
        )
      ) {
        return false;
      }
      return this.geometryContainsPoint(policy.geometry, stop.location);
    });

    for (const policy of policies) {
      geometryVersionRefs.push(
        this.geometryVersionRef(
          "stop_policy",
          policy.policyCode,
          policy.version,
        ),
      );
      if (policy.effect === "allow") {
        continue;
      }
      reasonCodes.push(policy.reasonCode);
      reasonMessages.push(policy.reasonMessage);
      if (policy.effect === "deny") {
        decision = "not_serviceable";
      } else if (decision === "serviceable") {
        decision = "manual_review";
      }
    }

    return {
      kind: stop.kind,
      location: stop.location,
      serviceAreaCodes,
      policyCodes: policies.map((policy) => policy.policyCode),
      geometryVersionRefs: this.unique(geometryVersionRefs),
      decision,
      reasonCodes: this.unique(reasonCodes),
      reasonMessages: this.unique(reasonMessages),
    };
  }

  private activeServiceAreas(
    serviceProductType: ServiceProductType,
    requestedAt: Date,
  ) {
    return this.serviceAreas.filter(
      (area) =>
        area.status === "active" &&
        this.recordIsEffective(
          area.effectiveFrom,
          area.effectiveUntil,
          requestedAt,
        ) &&
        this.serviceProductApplies(
          area.serviceProductTypes,
          serviceProductType,
        ),
    );
  }

  private activeStopPolicies(
    serviceProductType: ServiceProductType,
    requestedAt: Date,
  ) {
    return this.stopPolicies.filter(
      (policy) =>
        policy.status === "active" &&
        this.recordIsEffective(
          policy.effectiveFrom,
          policy.effectiveUntil,
          requestedAt,
        ) &&
        this.serviceProductApplies(
          policy.serviceProductTypes,
          serviceProductType,
        ),
    );
  }

  private serviceProductApplies(
    serviceProductTypes: ServiceProductType[],
    serviceProductType: ServiceProductType,
  ) {
    return (
      serviceProductTypes.length === 0 ||
      serviceProductTypes.includes(serviceProductType)
    );
  }

  private recordIsEffective(
    effectiveFrom: string,
    effectiveUntil: string | null,
    requestedAt: Date,
  ) {
    const from = Date.parse(effectiveFrom);
    const until = effectiveUntil ? Date.parse(effectiveUntil) : null;
    if (Number.isNaN(from) || (until !== null && Number.isNaN(until))) {
      return false;
    }
    const requestedMs = requestedAt.getTime();
    return requestedMs >= from && (until === null || requestedMs < until);
  }

  private normalizeServiceProductType(
    value: ServiceProductType,
  ): ServiceProductType {
    if (!SERVICE_PRODUCT_TYPES.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "serviceProductType is unsupported.",
        { field: "serviceProductType", value },
      );
    }
    return value;
  }

  private normalizePoint(value: GeoPoint, field: string): GeoPoint {
    if (!value || typeof value !== "object") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_COORDINATE",
        `${field}.lat must be between -90 and 90.`,
        { field: `${field}.lat` },
      );
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_COORDINATE",
        `${field}.lng must be between -180 and 180.`,
        { field: `${field}.lng` },
      );
    }
    return { lat, lng };
  }

  private geometryContainsPoint(
    geometry: ServiceAreaGeometry,
    point: GeoPoint,
  ) {
    if (geometry.type === "circle") {
      return this.circleContainsPoint(geometry, point);
    }
    return this.polygonContainsPoint(geometry, point);
  }

  private geometryToGeoJson(geometry: ServiceAreaGeometry) {
    if (geometry.type === "polygon") {
      return {
        type: "Polygon" as const,
        coordinates: [
          this.closeGeoJsonRing(geometry.coordinates, "ccw"),
          ...(geometry.holes ?? []).map((hole) =>
            this.closeGeoJsonRing(hole, "cw"),
          ),
        ],
      };
    }

    return {
      type: "Polygon" as const,
      coordinates: [
        this.circleToGeoJsonRing(geometry.center, geometry.radiusMeters),
      ],
    };
  }

  private closeGeoJsonRing(
    points: GeoPoint[],
    winding: "ccw" | "cw" = "ccw",
  ): [number, number][] {
    const ring: [number, number][] = points.map((point) => [
      point.lng,
      point.lat,
    ]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([first[0], first[1]]);
    }
    const area = this.signedRingArea(points);
    if ((winding === "ccw" && area < 0) || (winding === "cw" && area > 0)) {
      ring.reverse();
    }
    return ring;
  }

  private circleToGeoJsonRing(center: GeoPoint, radiusMeters: number) {
    const segments = 48;
    const latRadius = radiusMeters / 111_320;
    const lngRadius =
      radiusMeters /
      (111_320 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));
    const ring: number[][] = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (2 * Math.PI * index) / segments;
      ring.push([
        center.lng + lngRadius * Math.cos(angle),
        center.lat + latRadius * Math.sin(angle),
      ]);
    }
    ring.push([...ring[0]!]);
    return ring;
  }

  private circleContainsPoint(circle: GeoCircle, point: GeoPoint) {
    return this.distanceMeters(circle.center, point) <= circle.radiusMeters;
  }

  private polygonContainsPoint(polygon: GeoPolygon, point: GeoPoint) {
    if (!this.ringContainsPoint(polygon.coordinates, point)) {
      return false;
    }
    for (const hole of polygon.holes ?? []) {
      if (this.ringContainsPointStrictlyInside(hole, point)) {
        return false;
      }
    }
    return true;
  }

  private ringContainsPoint(vertices: GeoPoint[], point: GeoPoint) {
    if (vertices.length < 3) {
      return false;
    }
    if (this.pointOnRingBoundary(vertices, point)) {
      return true;
    }

    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const current = vertices[i]!;
      const previous = vertices[j]!;
      const intersects =
        current.lng > point.lng !== previous.lng > point.lng &&
        point.lat <
          ((previous.lat - current.lat) * (point.lng - current.lng)) /
            (previous.lng - current.lng) +
            current.lat;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  private ringContainsPointStrictlyInside(
    vertices: GeoPoint[],
    point: GeoPoint,
  ) {
    if (vertices.length < 3) {
      return false;
    }
    if (this.pointOnRingBoundary(vertices, point)) {
      return false;
    }
    return this.ringContainsPoint(vertices, point);
  }

  private pointOnRingBoundary(vertices: GeoPoint[], point: GeoPoint) {
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const current = vertices[i]!;
      const previous = vertices[j]!;
      if (this.pointOnSegment(point, previous, current)) {
        return true;
      }
    }
    return false;
  }

  private pointOnSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint) {
    const cross =
      (point.lng - start.lng) * (end.lat - start.lat) -
      (point.lat - start.lat) * (end.lng - start.lng);
    if (Math.abs(cross) > 1e-10) {
      return false;
    }
    const minLat = Math.min(start.lat, end.lat);
    const maxLat = Math.max(start.lat, end.lat);
    const minLng = Math.min(start.lng, end.lng);
    const maxLng = Math.max(start.lng, end.lng);
    return (
      point.lat >= minLat &&
      point.lat <= maxLat &&
      point.lng >= minLng &&
      point.lng <= maxLng
    );
  }

  private distanceMeters(from: GeoPoint, to: GeoPoint) {
    const fromLat = this.toRadians(from.lat);
    const toLat = this.toRadians(to.lat);
    const deltaLat = this.toRadians(to.lat - from.lat);
    const deltaLng = this.toRadians(to.lng - from.lng);
    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const a =
      sinLat * sinLat + Math.cos(fromLat) * Math.cos(toLat) * sinLng * sinLng;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private directionApplies(
    direction: StopPolicyDirection,
    stopKind: ServiceAreaEvaluationStopKind,
  ) {
    return direction === "both" || direction === stopKind;
  }

  private geometryVersionRef(
    kind: "service_area" | "stop_policy",
    code: string,
    version: number,
  ) {
    return `${kind}:${code}@${version}`;
  }

  private resolveOverallDecision(decisions: ServiceAreaEvaluationDecision[]) {
    if (decisions.includes("not_serviceable")) {
      return "not_serviceable";
    }
    if (decisions.includes("manual_review")) {
      return "manual_review";
    }
    return "serviceable";
  }

  private unique(values: string[]) {
    return [...new Set(values.filter((value) => value.trim()))];
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
