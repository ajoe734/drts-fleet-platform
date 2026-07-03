import { Injectable } from "@nestjs/common";

import type {
  GeoProviderQuotaStatus,
  GeoProviderOperationalStatus,
  ServiceAreaEvaluationDecision,
} from "@drts/contracts";

export type MapGeofenceGeoOutcome =
  | "resolved"
  | "manual_override"
  | "address_ambiguity"
  | "coordinate_less_attempt"
  | "provider_outage";

export type MapGeofenceGeocodeOperation = "search" | "resolve" | "reverse";

export type MapGeofenceGeometryMutationKind =
  | "service_area_published"
  | "service_area_retired"
  | "stop_policy_published"
  | "stop_policy_retired"
  | "geometry_mutation";

export interface MapGeofenceObservabilitySnapshot {
  providerHealth: {
    status: GeoProviderOperationalStatus | "unknown";
    provider: string | null;
    mode: string | null;
    failClosed: boolean;
    lastCheckedAt: string | null;
    quota: {
      dailyLimit: number | null;
      minuteLimit: number | null;
      dailyUsed: number | null;
      minuteUsed: number | null;
      usagePercent: number | null;
      status: GeoProviderQuotaStatus;
      warningThresholdPercent: number | null;
      criticalThresholdPercent: number | null;
      policy: "mock_unlimited" | "provider_enforced" | null;
    };
  };
  geo: {
    providerOutageCount: number;
    addressAmbiguityCount: number;
    coordinateLessAttemptCount: number;
    manualOverrideCount: number;
    resolvedAddressCount: number;
    requests: {
      total: number;
      successful: number;
      providerErrorCount: number;
      successRatePercent: number | null;
      byOperation: {
        search: number;
        resolve: number;
        reverse: number;
      };
      byResult: {
        resolved: number;
        manualOverride: number;
        addressAmbiguity: number;
        coordinateLessAttempt: number;
        providerOutage: number;
      };
    };
    latencyMs: {
      count: number;
      average: number | null;
      max: number | null;
      p95: number | null;
    };
  };
  serviceArea: {
    evaluations: number;
    serviceableCount: number;
    manualReviewCount: number;
    policyDenialCount: number;
    outOfAreaCount: number;
    coordinateLessAttemptCount: number;
  };
  governance: {
    geometryMutationCount: number;
    serviceAreaPublishedCount: number;
    serviceAreaRetiredCount: number;
    stopPolicyPublishedCount: number;
    stopPolicyRetiredCount: number;
    manualOverrideCount: number;
  };
  lastEventAt: string | null;
}

@Injectable()
export class MapGeofenceObservabilityService {
  private providerHealth: MapGeofenceObservabilitySnapshot["providerHealth"] = {
    status: "unknown",
    provider: null,
    mode: null,
    failClosed: false,
    lastCheckedAt: null,
    quota: {
      dailyLimit: null,
      minuteLimit: null,
      dailyUsed: null,
      minuteUsed: null,
      usagePercent: null,
      status: "unknown",
      warningThresholdPercent: null,
      criticalThresholdPercent: null,
      policy: null,
    },
  };

  private readonly geoCounters = {
    providerOutageCount: 0,
    addressAmbiguityCount: 0,
    coordinateLessAttemptCount: 0,
    manualOverrideCount: 0,
    resolvedAddressCount: 0,
  };

  private readonly serviceAreaCounters = {
    evaluations: 0,
    serviceableCount: 0,
    manualReviewCount: 0,
    policyDenialCount: 0,
    outOfAreaCount: 0,
    coordinateLessAttemptCount: 0,
  };

  private readonly governanceCounters = {
    geometryMutationCount: 0,
    serviceAreaPublishedCount: 0,
    serviceAreaRetiredCount: 0,
    stopPolicyPublishedCount: 0,
    stopPolicyRetiredCount: 0,
    manualOverrideCount: 0,
  };

  private readonly geocodeRequests = {
    total: 0,
    successful: 0,
    providerErrorCount: 0,
    byOperation: {
      search: 0,
      resolve: 0,
      reverse: 0,
    },
    byResult: {
      resolved: 0,
      manualOverride: 0,
      addressAmbiguity: 0,
      coordinateLessAttempt: 0,
      providerOutage: 0,
    },
  };

  private readonly geocodeLatencySamplesMs: number[] = [];

  private lastEventAt: string | null = null;

  recordProviderHealth(input: {
    status: GeoProviderOperationalStatus;
    provider: string;
    mode: string;
    failClosed: boolean;
    quota: {
      dailyLimit: number | null;
      minuteLimit: number | null;
      dailyUsed: number | null;
      minuteUsed: number | null;
      usagePercent: number | null;
      status: GeoProviderQuotaStatus;
      warningThresholdPercent: number;
      criticalThresholdPercent: number;
      policy: "mock_unlimited" | "provider_enforced";
    };
  }) {
    const observedAt = this.touch();
    this.providerHealth = {
      status: input.status,
      provider: input.provider,
      mode: input.mode,
      failClosed: input.failClosed,
      lastCheckedAt: observedAt,
      quota: { ...input.quota },
    };
  }

  recordGeoOutcome(outcome: MapGeofenceGeoOutcome) {
    this.touch();
    switch (outcome) {
      case "resolved":
        this.geoCounters.resolvedAddressCount += 1;
        return;
      case "manual_override":
        this.geoCounters.manualOverrideCount += 1;
        this.governanceCounters.manualOverrideCount += 1;
        return;
      case "address_ambiguity":
        this.geoCounters.addressAmbiguityCount += 1;
        return;
      case "coordinate_less_attempt":
        this.geoCounters.coordinateLessAttemptCount += 1;
        return;
      case "provider_outage":
        this.geoCounters.providerOutageCount += 1;
        return;
    }
  }

  recordGeocodeRequest(input: {
    operation: MapGeofenceGeocodeOperation;
    result: MapGeofenceGeoOutcome;
    durationMs: number;
  }) {
    this.touch();
    this.geocodeRequests.total += 1;
    this.geocodeRequests.byOperation[input.operation] += 1;

    switch (input.result) {
      case "resolved":
        this.geocodeRequests.successful += 1;
        this.geocodeRequests.byResult.resolved += 1;
        break;
      case "manual_override":
        this.geocodeRequests.successful += 1;
        this.geocodeRequests.byResult.manualOverride += 1;
        break;
      case "address_ambiguity":
        this.geocodeRequests.byResult.addressAmbiguity += 1;
        break;
      case "coordinate_less_attempt":
        this.geocodeRequests.byResult.coordinateLessAttempt += 1;
        break;
      case "provider_outage":
        this.geocodeRequests.providerErrorCount += 1;
        this.geocodeRequests.byResult.providerOutage += 1;
        break;
    }

    const durationMs = Math.max(0, Math.round(input.durationMs));
    this.geocodeLatencySamplesMs.push(durationMs);
    if (this.geocodeLatencySamplesMs.length > 200) {
      this.geocodeLatencySamplesMs.shift();
    }
  }

  recordServiceAreaEvaluation(input: {
    decision: ServiceAreaEvaluationDecision | "coordinate_less_attempt";
    policyDenied: boolean;
  }) {
    this.serviceAreaCounters.evaluations += 1;
    this.touch();
    if (input.decision === "coordinate_less_attempt") {
      this.serviceAreaCounters.coordinateLessAttemptCount += 1;
      return;
    }
    if (input.policyDenied) {
      this.serviceAreaCounters.policyDenialCount += 1;
      return;
    }
    if (input.decision === "serviceable") {
      this.serviceAreaCounters.serviceableCount += 1;
      return;
    }
    if (input.decision === "manual_review") {
      this.serviceAreaCounters.manualReviewCount += 1;
      return;
    }
    this.serviceAreaCounters.outOfAreaCount += 1;
  }

  recordGeometryMutation(kind: MapGeofenceGeometryMutationKind) {
    this.governanceCounters.geometryMutationCount += 1;
    this.touch();
    switch (kind) {
      case "service_area_published":
        this.governanceCounters.serviceAreaPublishedCount += 1;
        return;
      case "service_area_retired":
        this.governanceCounters.serviceAreaRetiredCount += 1;
        return;
      case "stop_policy_published":
        this.governanceCounters.stopPolicyPublishedCount += 1;
        return;
      case "stop_policy_retired":
        this.governanceCounters.stopPolicyRetiredCount += 1;
        return;
      case "geometry_mutation":
        return;
    }
  }

  getSnapshot(): MapGeofenceObservabilitySnapshot {
    const latencyCount = this.geocodeLatencySamplesMs.length;
    const latencyTotal = this.geocodeLatencySamplesMs.reduce(
      (sum, value) => sum + value,
      0,
    );
    const successRatePercent =
      this.geocodeRequests.total === 0
        ? null
        : this.roundPercent(
            (this.geocodeRequests.successful / this.geocodeRequests.total) *
              100,
          );
    return {
      providerHealth: {
        ...this.providerHealth,
        quota: { ...this.providerHealth.quota },
      },
      geo: {
        ...this.geoCounters,
        requests: {
          total: this.geocodeRequests.total,
          successful: this.geocodeRequests.successful,
          providerErrorCount: this.geocodeRequests.providerErrorCount,
          successRatePercent,
          byOperation: { ...this.geocodeRequests.byOperation },
          byResult: { ...this.geocodeRequests.byResult },
        },
        latencyMs: {
          count: latencyCount,
          average:
            latencyCount === 0
              ? null
              : this.roundPercent(latencyTotal / latencyCount),
          max:
            latencyCount === 0
              ? null
              : Math.max(...this.geocodeLatencySamplesMs),
          p95: this.percentile(95),
        },
      },
      serviceArea: { ...this.serviceAreaCounters },
      governance: { ...this.governanceCounters },
      lastEventAt: this.lastEventAt,
    };
  }

  private touch() {
    this.lastEventAt = new Date().toISOString();
    return this.lastEventAt;
  }

  private percentile(percentile: number) {
    if (this.geocodeLatencySamplesMs.length === 0) {
      return null;
    }
    const sorted = [...this.geocodeLatencySamplesMs].sort((left, right) => {
      return left - right;
    });
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
    );
    return sorted[index] ?? null;
  }

  private roundPercent(value: number) {
    return Math.round(value * 10) / 10;
  }
}
