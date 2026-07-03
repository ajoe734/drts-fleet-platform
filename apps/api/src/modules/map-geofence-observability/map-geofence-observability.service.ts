import { Injectable } from "@nestjs/common";

import type {
  GeoCoordinateSource,
  GeoResolutionSurface,
  ServiceAreaEvaluationResult,
  ServiceProductType,
  StopPolicyDirection,
  StopPolicyRecord,
} from "@drts/contracts";

const MAX_SAMPLES = 1000;

export const MAP_GEOFENCE_METRIC_NAMES = [
  "map_geocode_requests_total",
  "map_geocode_latency_ms",
  "map_provider_errors_total",
  "map_provider_quota_usage_percent",
  "geo_provider_unavailable_total",
  "coordinate_less_booking_attempts_total",
  "service_area_evaluations_total",
  "service_area_policy_blocks_total",
  "service_area_geometry_mutations_total",
] as const;

export type MapGeofenceMetricName = (typeof MAP_GEOFENCE_METRIC_NAMES)[number];

export const MAP_GEOFENCE_AUDIT_EVENT_NAMES = [
  "geo.address.resolved",
  "geo.pin.confirmed",
  "service_area.evaluated",
  "service_area.policy.published",
  "service_area.policy.retired",
  "geo.manual_override.created",
] as const;

export type MapGeofenceAuditEventName =
  (typeof MAP_GEOFENCE_AUDIT_EVENT_NAMES)[number];

export type MapGeofenceMetricDefinition = {
  name: MapGeofenceMetricName;
  kind: "counter" | "gauge" | "histogram";
  description: string;
  requiredLabels: string[];
};

export type MapGeofenceAuditEventDefinition = {
  name: MapGeofenceAuditEventName;
  description: string;
  requiredFields: string[];
};

export type MapGeofenceMetricSample = {
  name: MapGeofenceMetricName;
  value: number;
  labels: Record<string, string>;
  observedAt: string;
};

export type MapGeofenceAuditEventSample = {
  name: MapGeofenceAuditEventName;
  actorId: string | null;
  actorType: string | null;
  surface: GeoResolutionSurface;
  requestId: string | null;
  resourceType: string;
  resourceId: string | null;
  summary: Record<string, unknown>;
  observedAt: string;
};

export type MapGeofenceObservabilitySnapshot = {
  generatedAt: string;
  metricDefinitions: MapGeofenceMetricDefinition[];
  auditEventDefinitions: MapGeofenceAuditEventDefinition[];
  recentMetrics: MapGeofenceMetricSample[];
  recentAuditEvents: MapGeofenceAuditEventSample[];
};

export const MAP_GEOFENCE_METRIC_DEFINITIONS: Record<
  MapGeofenceMetricName,
  MapGeofenceMetricDefinition
> = {
  map_geocode_requests_total: {
    name: "map_geocode_requests_total",
    kind: "counter",
    description: "Geocode, resolve, and reverse-geocode attempts.",
    requiredLabels: ["provider", "surface", "operation", "result"],
  },
  map_geocode_latency_ms: {
    name: "map_geocode_latency_ms",
    kind: "histogram",
    description: "Provider-backed geocode operation latency in milliseconds.",
    requiredLabels: ["provider", "surface", "operation"],
  },
  map_provider_errors_total: {
    name: "map_provider_errors_total",
    kind: "counter",
    description: "Map provider errors grouped by stable domain code.",
    requiredLabels: ["provider", "surface", "operation", "error_code"],
  },
  map_provider_quota_usage_percent: {
    name: "map_provider_quota_usage_percent",
    kind: "gauge",
    description: "Current map provider quota usage percentage.",
    requiredLabels: ["provider", "quota_scope"],
  },
  geo_provider_unavailable_total: {
    name: "geo_provider_unavailable_total",
    kind: "counter",
    description: "Provider-unavailable events visible to booking surfaces.",
    requiredLabels: ["provider", "surface", "error_code"],
  },
  coordinate_less_booking_attempts_total: {
    name: "coordinate_less_booking_attempts_total",
    kind: "counter",
    description:
      "Booking or dispatch attempts missing required pickup/dropoff coordinates.",
    requiredLabels: ["surface", "outcome", "missing_item"],
  },
  service_area_evaluations_total: {
    name: "service_area_evaluations_total",
    kind: "counter",
    description: "Backend service-area evaluation decisions.",
    requiredLabels: ["surface", "decision", "service_product_type"],
  },
  service_area_policy_blocks_total: {
    name: "service_area_policy_blocks_total",
    kind: "counter",
    description: "Stop-policy deny or manual-review matches.",
    requiredLabels: ["policy_code", "effect", "direction"],
  },
  service_area_geometry_mutations_total: {
    name: "service_area_geometry_mutations_total",
    kind: "counter",
    description: "Service-area and stop-policy geometry lifecycle mutations.",
    requiredLabels: ["record_kind", "action", "actor_type"],
  },
};

export const MAP_GEOFENCE_AUDIT_EVENT_DEFINITIONS: Record<
  MapGeofenceAuditEventName,
  MapGeofenceAuditEventDefinition
> = {
  "geo.address.resolved": {
    name: "geo.address.resolved",
    description:
      "Address resolution with provider, candidate, surface, and provenance context.",
    requiredFields: [
      "surface",
      "actorId",
      "provider",
      "coordinateSource",
      "candidateId",
      "placeId",
    ],
  },
  "geo.pin.confirmed": {
    name: "geo.pin.confirmed",
    description: "Confirmed map pin or manual pin selection.",
    requiredFields: ["surface", "actorId", "coordinateSource"],
  },
  "service_area.evaluated": {
    name: "service_area.evaluated",
    description:
      "Backend service-area decision snapshot with policy and geometry refs.",
    requiredFields: [
      "surface",
      "actorId",
      "decision",
      "serviceProductType",
      "geometryVersionRefs",
    ],
  },
  "service_area.policy.published": {
    name: "service_area.policy.published",
    description: "Published service-area or stop-policy geometry version.",
    requiredFields: [
      "actorId",
      "actorType",
      "recordKind",
      "policyCode",
      "version",
      "geometryVersionRef",
    ],
  },
  "service_area.policy.retired": {
    name: "service_area.policy.retired",
    description: "Retired service-area or stop-policy geometry version.",
    requiredFields: [
      "actorId",
      "actorType",
      "recordKind",
      "policyCode",
      "version",
      "effectiveUntil",
    ],
  },
  "geo.manual_override.created": {
    name: "geo.manual_override.created",
    description:
      "Manual coordinate override used when provider selection is unavailable or insufficient.",
    requiredFields: [
      "surface",
      "actorId",
      "manualOverrideReason",
      "coordinateSource",
    ],
  },
};

@Injectable()
export class MapGeofenceObservabilityService {
  private readonly metricSamples: MapGeofenceMetricSample[] = [];
  private readonly auditEventSamples: MapGeofenceAuditEventSample[] = [];

  getSnapshot(referenceDate = new Date()): MapGeofenceObservabilitySnapshot {
    return {
      generatedAt: referenceDate.toISOString(),
      metricDefinitions: Object.values(MAP_GEOFENCE_METRIC_DEFINITIONS),
      auditEventDefinitions: Object.values(
        MAP_GEOFENCE_AUDIT_EVENT_DEFINITIONS,
      ),
      recentMetrics: this.listMetricSamples(),
      recentAuditEvents: this.listAuditEventSamples(),
    };
  }

  listMetricSamples(name?: MapGeofenceMetricName) {
    return this.metricSamples
      .filter((sample) => !name || sample.name === name)
      .map((sample) => ({ ...sample, labels: { ...sample.labels } }));
  }

  listAuditEventSamples(name?: MapGeofenceAuditEventName) {
    return this.auditEventSamples
      .filter((sample) => !name || sample.name === name)
      .map((sample) => ({
        ...sample,
        summary: { ...sample.summary },
      }));
  }

  recordGeocodeRequest(input: {
    provider?: string | null;
    surface: GeoResolutionSurface;
    operation: "search" | "resolve" | "reverse" | "health";
    result: "success" | "error" | "fail_closed";
    latencyMs: number;
    observedAt?: string;
  }) {
    const observedAt = input.observedAt ?? new Date().toISOString();
    const provider = this.label(input.provider);
    this.recordMetric({
      name: "map_geocode_requests_total",
      value: 1,
      labels: {
        provider,
        surface: input.surface,
        operation: input.operation,
        result: input.result,
      },
      observedAt,
    });
    this.recordMetric({
      name: "map_geocode_latency_ms",
      value: Math.max(0, input.latencyMs),
      labels: {
        provider,
        surface: input.surface,
        operation: input.operation,
      },
      observedAt,
    });
  }

  recordProviderError(input: {
    provider?: string | null;
    surface: GeoResolutionSurface;
    operation: "search" | "resolve" | "reverse" | "health";
    errorCode: string;
    observedAt?: string;
  }) {
    const observedAt = input.observedAt ?? new Date().toISOString();
    const provider = this.label(input.provider);
    const errorCode = this.label(input.errorCode);
    this.recordMetric({
      name: "map_provider_errors_total",
      value: 1,
      labels: {
        provider,
        surface: input.surface,
        operation: input.operation,
        error_code: errorCode,
      },
      observedAt,
    });
    if (
      errorCode === "GEO_PROVIDER_UNAVAILABLE" ||
      errorCode === "GEO_PROVIDER_NOT_CONFIGURED"
    ) {
      this.recordMetric({
        name: "geo_provider_unavailable_total",
        value: 1,
        labels: {
          provider,
          surface: input.surface,
          error_code: errorCode,
        },
        observedAt,
      });
    }
  }

  recordProviderQuotaUsage(input: {
    provider?: string | null;
    quotaScope?: string | null;
    usagePercent: number;
    observedAt?: string;
  }) {
    this.recordMetric({
      name: "map_provider_quota_usage_percent",
      value: input.usagePercent,
      labels: {
        provider: this.label(input.provider),
        quota_scope: this.label(input.quotaScope),
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordCoordinateLessBookingAttempt(input: {
    surface: GeoResolutionSurface;
    outcome:
      | "blocked"
      | "manual_review"
      | "normal_dispatch"
      | "dispatch_attempt";
    missingItem: string;
    observedAt?: string;
  }) {
    this.recordMetric({
      name: "coordinate_less_booking_attempts_total",
      value: 1,
      labels: {
        surface: input.surface,
        outcome: input.outcome,
        missing_item: this.label(input.missingItem),
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordServiceAreaEvaluation(input: {
    surface: GeoResolutionSurface;
    actorId?: string | null;
    requestId?: string | null;
    serviceProductType: ServiceProductType;
    result: ServiceAreaEvaluationResult;
    observedAt?: string;
  }) {
    const observedAt = input.observedAt ?? new Date().toISOString();
    this.recordMetric({
      name: "service_area_evaluations_total",
      value: 1,
      labels: {
        surface: input.surface,
        decision: input.result.decision,
        service_product_type: input.serviceProductType,
      },
      observedAt,
    });
    this.recordAuditEvent({
      name: "service_area.evaluated",
      actorId: input.actorId ?? null,
      actorType: null,
      surface: input.surface,
      requestId: input.requestId ?? null,
      resourceType: "service_area_evaluation",
      resourceId: null,
      summary: {
        decision: input.result.decision,
        serviceProductType: input.serviceProductType,
        serviceAreaCodes: [...input.result.serviceAreaCodes],
        policyCodes: this.unique(
          input.result.stops.flatMap((stop) => stop.policyCodes),
        ),
        geometryVersionRefs: [...input.result.geometryVersionRefs],
        reasonCodes: [...input.result.reasonCodes],
        evaluatedAt: input.result.evaluatedAt,
      },
      observedAt,
    });
  }

  recordServiceAreaPolicyBlock(input: {
    policyCode: string;
    effect: Exclude<StopPolicyRecord["effect"], "allow">;
    direction: StopPolicyDirection;
    observedAt?: string;
  }) {
    this.recordMetric({
      name: "service_area_policy_blocks_total",
      value: 1,
      labels: {
        policy_code: this.label(input.policyCode),
        effect: input.effect,
        direction: input.direction,
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordServiceAreaGeometryMutation(input: {
    recordKind: "service_area_boundary" | "stop_policy";
    action:
      | "created"
      | "updated"
      | "submitted_for_review"
      | "published"
      | "retired";
    actorType?: string | null;
    observedAt?: string;
  }) {
    this.recordMetric({
      name: "service_area_geometry_mutations_total",
      value: 1,
      labels: {
        record_kind: input.recordKind,
        action: input.action,
        actor_type: this.label(input.actorType),
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordAddressResolved(input: {
    surface: GeoResolutionSurface;
    actorId?: string | null;
    requestId?: string | null;
    provider?: string | null;
    coordinateSource: GeoCoordinateSource;
    candidateId?: string | null;
    placeId?: string | null;
    addressText?: string | null;
    observedAt?: string;
  }) {
    this.recordAuditEvent({
      name: "geo.address.resolved",
      actorId: input.actorId ?? null,
      actorType: null,
      surface: input.surface,
      requestId: input.requestId ?? null,
      resourceType: "geo_address",
      resourceId: input.placeId ?? input.candidateId ?? null,
      summary: {
        provider: input.provider ?? null,
        coordinateSource: input.coordinateSource,
        candidateId: input.candidateId ?? null,
        placeId: input.placeId ?? null,
        addressText: input.addressText ?? null,
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordPinConfirmed(input: {
    surface: GeoResolutionSurface;
    actorId?: string | null;
    requestId?: string | null;
    coordinateSource: GeoCoordinateSource;
    placeId?: string | null;
    observedAt?: string;
  }) {
    this.recordAuditEvent({
      name: "geo.pin.confirmed",
      actorId: input.actorId ?? null,
      actorType: null,
      surface: input.surface,
      requestId: input.requestId ?? null,
      resourceType: "geo_pin",
      resourceId: input.placeId ?? null,
      summary: {
        coordinateSource: input.coordinateSource,
        placeId: input.placeId ?? null,
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordManualOverride(input: {
    surface: GeoResolutionSurface;
    actorId?: string | null;
    requestId?: string | null;
    manualOverrideReason?: string | null;
    coordinateSource: GeoCoordinateSource;
    observedAt?: string;
  }) {
    this.recordAuditEvent({
      name: "geo.manual_override.created",
      actorId: input.actorId ?? null,
      actorType: null,
      surface: input.surface,
      requestId: input.requestId ?? null,
      resourceType: "geo_manual_override",
      resourceId: null,
      summary: {
        manualOverrideReason: input.manualOverrideReason ?? null,
        coordinateSource: input.coordinateSource,
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  recordPolicyLifecycleAudit(input: {
    eventName: "service_area.policy.published" | "service_area.policy.retired";
    actorId?: string | null;
    actorType?: string | null;
    requestId?: string | null;
    resourceType: "service_area_boundary" | "stop_policy";
    resourceId: string;
    policyCode?: string | null;
    version?: number | null;
    geometryVersionRef?: string | null;
    effectiveUntil?: string | null;
    observedAt?: string;
  }) {
    this.recordAuditEvent({
      name: input.eventName,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? null,
      surface: "platform_admin",
      requestId: input.requestId ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      summary: {
        actorType: input.actorType ?? null,
        recordKind: input.resourceType,
        policyCode: input.policyCode ?? null,
        version: input.version ?? null,
        geometryVersionRef: input.geometryVersionRef ?? null,
        effectiveUntil: input.effectiveUntil ?? null,
      },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  private recordMetric(input: {
    name: MapGeofenceMetricName;
    value: number;
    labels: Record<string, string>;
    observedAt?: string;
  }) {
    const definition = MAP_GEOFENCE_METRIC_DEFINITIONS[input.name];
    for (const labelName of definition.requiredLabels) {
      if (!input.labels[labelName]) {
        throw new Error(`${input.name} missing required label ${labelName}`);
      }
    }
    this.metricSamples.unshift({
      name: input.name,
      value: input.value,
      labels: { ...input.labels },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
    this.trim(this.metricSamples);
  }

  private recordAuditEvent(input: MapGeofenceAuditEventSample) {
    this.auditEventSamples.unshift({
      ...input,
      summary: { ...input.summary },
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
    this.trim(this.auditEventSamples);
  }

  private trim<T>(samples: T[]) {
    if (samples.length > MAX_SAMPLES) {
      samples.splice(MAX_SAMPLES);
    }
  }

  private label(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : "unknown";
  }

  private unique(values: string[]) {
    return [...new Set(values)];
  }
}
