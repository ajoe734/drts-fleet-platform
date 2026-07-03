import { Injectable } from "@nestjs/common";

import type {
  GeoProviderOperationalStatus,
  ServiceAreaEvaluationDecision,
} from "@drts/contracts";

export type MapGeofenceGeoOutcome =
  | "resolved"
  | "manual_override"
  | "address_ambiguity"
  | "coordinate_less_attempt"
  | "provider_outage";

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
  };
  geo: {
    providerOutageCount: number;
    addressAmbiguityCount: number;
    coordinateLessAttemptCount: number;
    manualOverrideCount: number;
    resolvedAddressCount: number;
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
  recentAlertSignals: {
    providerOutageCount: number;
    policyDenialCount: number;
    windowMinutes: number;
  };
  lastEventAt: string | null;
}

type RollingAlertEventKind = "provider_outage" | "policy_denial";

type RollingAlertEvent = {
  kind: RollingAlertEventKind;
  observedAtMs: number;
};

const MAP_GEOFENCE_ALERT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ROLLING_ALERT_EVENTS = 2_000;

@Injectable()
export class MapGeofenceObservabilityService {
  private providerHealth: MapGeofenceObservabilitySnapshot["providerHealth"] = {
    status: "unknown",
    provider: null,
    mode: null,
    failClosed: false,
    lastCheckedAt: null,
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

  private lastEventAt: string | null = null;
  private readonly rollingAlertEvents: RollingAlertEvent[] = [];

  recordProviderHealth(input: {
    status: GeoProviderOperationalStatus;
    provider: string;
    mode: string;
    failClosed: boolean;
  }) {
    const observedAt = this.touch();
    this.providerHealth = {
      status: input.status,
      provider: input.provider,
      mode: input.mode,
      failClosed: input.failClosed,
      lastCheckedAt: observedAt,
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
        this.recordRollingAlertEvent("provider_outage");
        return;
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
      this.recordRollingAlertEvent("policy_denial");
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

  getSnapshot(referenceDate = new Date()): MapGeofenceObservabilitySnapshot {
    return {
      providerHealth: { ...this.providerHealth },
      geo: { ...this.geoCounters },
      serviceArea: { ...this.serviceAreaCounters },
      governance: { ...this.governanceCounters },
      recentAlertSignals: this.getRecentAlertSignals(referenceDate),
      lastEventAt: this.lastEventAt,
    };
  }

  getRecentAlertSignals(
    referenceDate = new Date(),
    windowMs = MAP_GEOFENCE_ALERT_WINDOW_MS,
  ) {
    const referenceMs = referenceDate.getTime();
    const cutoffMs = referenceMs - windowMs;
    this.pruneRollingAlertEvents(cutoffMs);

    const eventsInWindow = this.rollingAlertEvents.filter(
      (event) =>
        event.observedAtMs >= cutoffMs && event.observedAtMs <= referenceMs,
    );
    const failClosedCheckedAtMs = this.providerHealth.lastCheckedAt
      ? Date.parse(this.providerHealth.lastCheckedAt)
      : Number.NaN;
    const failClosedInWindow =
      this.providerHealth.failClosed &&
      Number.isFinite(failClosedCheckedAtMs) &&
      failClosedCheckedAtMs >= cutoffMs &&
      failClosedCheckedAtMs <= referenceMs;

    return {
      providerOutageCount:
        eventsInWindow.filter((event) => event.kind === "provider_outage")
          .length + (failClosedInWindow ? 1 : 0),
      policyDenialCount: eventsInWindow.filter(
        (event) => event.kind === "policy_denial",
      ).length,
      windowMinutes: Math.round(windowMs / 60_000),
    };
  }

  private touch() {
    this.lastEventAt = new Date().toISOString();
    return this.lastEventAt;
  }

  private recordRollingAlertEvent(kind: RollingAlertEventKind) {
    const observedAtMs = Date.now();
    this.rollingAlertEvents.push({ kind, observedAtMs });
    const cutoffMs = observedAtMs - MAP_GEOFENCE_ALERT_WINDOW_MS;
    this.pruneRollingAlertEvents(cutoffMs);
  }

  private pruneRollingAlertEvents(cutoffMs: number) {
    const firstRetainedIndex = this.rollingAlertEvents.findIndex(
      (event) => event.observedAtMs >= cutoffMs,
    );
    if (firstRetainedIndex > 0) {
      this.rollingAlertEvents.splice(0, firstRetainedIndex);
    } else if (firstRetainedIndex === -1) {
      this.rollingAlertEvents.splice(0);
    }

    if (this.rollingAlertEvents.length > MAX_ROLLING_ALERT_EVENTS) {
      this.rollingAlertEvents.splice(
        0,
        this.rollingAlertEvents.length - MAX_ROLLING_ALERT_EVENTS,
      );
    }
  }
}
