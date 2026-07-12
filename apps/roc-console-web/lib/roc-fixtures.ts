import type {
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
  ResourceActionDescriptor,
  RocAlertReadModel,
  RocOverviewReadModel,
  RocProviderHealthSnapshot,
  RocTripReadModel,
  RocVehicleReadModel,
  UiRefreshMetadata,
} from "@drts/contracts";

export type RocEvidenceSource =
  | "tesla_provided"
  | "operator_reported"
  | "device_recorded"
  | "roc_assessed"
  | "not_exposed_by_provider";

export type RocEvidenceFileStatus = "sealed" | "uploading" | "unavailable";

export interface RocEvidenceFile {
  name: string;
  vehicleId: string;
  source: RocEvidenceSource;
  durationLabel: string;
  shaLabel: string;
  status: RocEvidenceFileStatus;
}

export interface RocVehicleCanvasMeta {
  model: string;
  areaLabel: string;
  safetyOperatorLabel: string;
  speedKmh: number;
  approvedRouteLabel: string;
  mapLeft: string;
  mapTop: string;
}

export interface RocTripCanvasMeta {
  routeLabel: string;
  startLabel: string;
  distanceLabel: string;
  takeoverCount: number;
}

export interface RocAlertCanvasMeta {
  source: RocEvidenceSource;
}

export const FALLBACK_GENERATED_AT = "2026-06-26T15:05:00Z";

export const FALLBACK_REFRESH: UiRefreshMetadata = {
  generatedAt: FALLBACK_GENERATED_AT,
  staleAfterMs: 5_000,
  dataFreshness: "fresh",
  source: "sandbox",
};

function minutesBefore(now: string, minutes: number) {
  return new Date(new Date(now).getTime() - minutes * 60_000).toISOString();
}

function secondsBefore(now: string, seconds: number) {
  return new Date(new Date(now).getTime() - seconds * 1_000).toISOString();
}

function buildAction(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode = "roc_role_required",
  requiresReason = false,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(enabled ? {} : { disabledReasonCode }),
    ...(requiresReason ? { requiresReason: true } : {}),
  };
}

function buildSourceMetadata(
  sourceSystem: "tesla_fleet_api" | "roc_operator" | "manual_entry",
) {
  return {
    sourceSystem,
    sourceRef: null,
    ingestedAt: FALLBACK_GENERATED_AT,
    recordedAt: null,
    signatureRef: null,
    schemaVersion: "2026.06",
  } as const;
}

export const ROC_VEHICLE_CANVAS_META: Record<string, RocVehicleCanvasMeta> = {
  "AV-7720": {
    model: "Model Y",
    areaLabel: "信義",
    safetyOperatorLabel: "陳柏宇",
    speedKmh: 38,
    approvedRouteLabel: "R-信義-01",
    mapLeft: "28%",
    mapTop: "40%",
  },
  "AV-7732": {
    model: "Model 3",
    areaLabel: "南港",
    safetyOperatorLabel: "吳明翰",
    speedKmh: 0,
    approvedRouteLabel: "R-南港-02",
    mapLeft: "62%",
    mapTop: "55%",
  },
  "AV-7715": {
    model: "Model Y",
    areaLabel: "信義",
    safetyOperatorLabel: "林佳蓉",
    speedKmh: 24,
    approvedRouteLabel: "R-信義-02",
    mapLeft: "45%",
    mapTop: "30%",
  },
  "AV-7708": {
    model: "Model Y",
    areaLabel: "南港場站",
    safetyOperatorLabel: "—",
    speedKmh: 0,
    approvedRouteLabel: "R-南港-待命",
    mapLeft: "18%",
    mapTop: "68%",
  },
  "AV-7741": {
    model: "Model 3",
    areaLabel: "信義",
    safetyOperatorLabel: "黃志明",
    speedKmh: 41,
    approvedRouteLabel: "R-信義-03",
    mapLeft: "74%",
    mapTop: "46%",
  },
};

export const ROC_TRIP_CANVAS_META: Record<string, RocTripCanvasMeta> = {
  trip_88231: {
    routeLabel: "信義 → 南港",
    startLabel: "14:05",
    distanceLabel: "8.4 km",
    takeoverCount: 1,
  },
  trip_88240: {
    routeLabel: "南港 → 內湖",
    startLabel: "14:40",
    distanceLabel: "3.1 km",
    takeoverCount: 1,
  },
  trip_88228: {
    routeLabel: "信義 → 信義",
    startLabel: "13:50",
    distanceLabel: "5.0 km",
    takeoverCount: 0,
  },
  trip_88210: {
    routeLabel: "信義 → 南港",
    startLabel: "13:20",
    distanceLabel: "9.2 km",
    takeoverCount: 2,
  },
};

export const ROC_ALERT_CANVAS_META: Record<string, RocAlertCanvasMeta> = {
  "roc-alert-discrepancy-tko_0215": { source: "operator_reported" },
  "roc-alert-provider-tesla-regulatory": {
    source: "not_exposed_by_provider",
  },
  "roc-alert-provider-AV-7708": { source: "roc_assessed" },
  "roc-alert-boundary-AV-7741": { source: "roc_assessed" },
  "roc-alert-telemetry-AV-7715": { source: "device_recorded" },
  "roc-alert-takeover-rate-AV-7732": { source: "roc_assessed" },
};

export const FALLBACK_OVERVIEW: RocOverviewReadModel = {
  generatedAt: FALLBACK_GENERATED_AT,
  activeVehicleCount: 5,
  activeTripCount: 4,
  activeTakeoverCount: 3,
  openAlertCount: 5,
  criticalAlertCount: 1,
  acknowledgedAlertCount: 0,
  stopNewDispatchVehicleCount: 1,
  operationalHoldVehicleCount: 1,
  evidenceFreezeVehicleCount: 1,
  humanFallbackVehicleCount: 0,
  providerHealth: {
    status: "degraded",
    lastCheckedAt: FALLBACK_GENERATED_AT,
    degradedServices: [
      {
        service: "Tesla Regulatory Data Interface",
        impact: "AV-7708 provider unreachable for 6 minutes.",
        severity: "critical",
      },
      {
        service: "Regulatory-event feed",
        impact: "2 vehicles exceed regulatory freshness budget.",
        severity: "warning",
      },
    ],
  },
};

export const FALLBACK_VEHICLES: RocVehicleReadModel[] = [
  {
    vehicleId: "AV-7720",
    sandboxProgramId: "exp_fsd_taipei_01",
    currentOrderId: "ord_trip_88231",
    safetyOperatorId: "so_chen_boyu",
    autonomyState: "fsd_engaged",
    location: { lat: 25.033, lng: 121.5654 },
    telemetryFreshness: {
      dataFreshness: "fresh",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 2),
      staleAfterMs: 30_000,
    },
    regulatoryFreshness: {
      dataFreshness: "stale",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 48),
      staleAfterMs: 300_000,
    },
    stopNewDispatchActive: false,
    operationalHoldActive: false,
    evidenceFreezeActive: false,
    humanFallbackActive: false,
    dispatchGateStatus: "allow",
    gateReasonCodes: [],
    alertIds: ["roc-alert-provider-tesla-regulatory"],
  },
  {
    vehicleId: "AV-7732",
    sandboxProgramId: "exp_fsd_taipei_01",
    currentOrderId: "ord_trip_88240",
    safetyOperatorId: "so_wu_minghan",
    autonomyState: "manual",
    location: { lat: 25.0562, lng: 121.6177 },
    telemetryFreshness: {
      dataFreshness: "fresh",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 1),
      staleAfterMs: 30_000,
    },
    regulatoryFreshness: {
      dataFreshness: "fresh",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 6),
      staleAfterMs: 300_000,
    },
    stopNewDispatchActive: false,
    operationalHoldActive: true,
    evidenceFreezeActive: true,
    humanFallbackActive: false,
    dispatchGateStatus: "block",
    gateReasonCodes: ["ROC_OPERATIONAL_HOLD"],
    alertIds: [
      "roc-alert-discrepancy-tko_0215",
      "roc-alert-takeover-rate-AV-7732",
    ],
  },
  {
    vehicleId: "AV-7715",
    sandboxProgramId: "exp_fsd_taipei_01",
    currentOrderId: "ord_trip_88228",
    safetyOperatorId: "so_lin_jiarong",
    autonomyState: "fsd_engaged",
    location: { lat: 25.0388, lng: 121.5688 },
    telemetryFreshness: {
      dataFreshness: "stale",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 12),
      staleAfterMs: 30_000,
    },
    regulatoryFreshness: {
      dataFreshness: "stale",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 95),
      staleAfterMs: 300_000,
    },
    stopNewDispatchActive: true,
    operationalHoldActive: false,
    evidenceFreezeActive: false,
    humanFallbackActive: false,
    dispatchGateStatus: "block",
    gateReasonCodes: ["ROC_STOP_NEW_DISPATCH"],
    alertIds: ["roc-alert-telemetry-AV-7715"],
  },
  {
    vehicleId: "AV-7708",
    sandboxProgramId: "exp_fsd_taipei_01",
    currentOrderId: null,
    safetyOperatorId: null,
    autonomyState: "unknown",
    location: null,
    telemetryFreshness: {
      dataFreshness: "unknown",
      observedAt: null,
      staleAfterMs: 30_000,
    },
    regulatoryFreshness: {
      dataFreshness: "unknown",
      observedAt: null,
      staleAfterMs: 300_000,
    },
    stopNewDispatchActive: false,
    operationalHoldActive: false,
    evidenceFreezeActive: false,
    humanFallbackActive: false,
    dispatchGateStatus: "allow",
    gateReasonCodes: [],
    alertIds: ["roc-alert-provider-AV-7708"],
  },
  {
    vehicleId: "AV-7741",
    sandboxProgramId: "exp_fsd_taipei_01",
    currentOrderId: "ord_trip_88251",
    safetyOperatorId: "so_huang_zhiming",
    autonomyState: "fsd_engaged",
    location: { lat: 25.0419, lng: 121.5721 },
    telemetryFreshness: {
      dataFreshness: "fresh",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 3),
      staleAfterMs: 30_000,
    },
    regulatoryFreshness: {
      dataFreshness: "fresh",
      observedAt: secondsBefore(FALLBACK_GENERATED_AT, 8),
      staleAfterMs: 300_000,
    },
    stopNewDispatchActive: false,
    operationalHoldActive: false,
    evidenceFreezeActive: false,
    humanFallbackActive: false,
    dispatchGateStatus: "allow",
    gateReasonCodes: [],
    alertIds: ["roc-alert-boundary-AV-7741"],
  },
];

export const FALLBACK_TRIPS: RocTripReadModel[] = [
  {
    tripId: "trip_88231",
    orderId: "ord_trip_88231",
    vehicleId: "AV-7720",
    sandboxProgramId: "exp_fsd_taipei_01",
    safetyOperatorId: "so_chen_boyu",
    status: "monitoring",
    latestTakeoverOccurredAt: minutesBefore(FALLBACK_GENERATED_AT, 33),
    stopNewDispatchActive: false,
    operationalHoldActive: false,
    humanFallbackActive: false,
    alertIds: ["roc-alert-provider-tesla-regulatory"],
  },
  {
    tripId: "trip_88240",
    orderId: "ord_trip_88240",
    vehicleId: "AV-7732",
    sandboxProgramId: "exp_fsd_taipei_01",
    safetyOperatorId: "so_wu_minghan",
    status: "takeover_active",
    latestTakeoverOccurredAt: minutesBefore(FALLBACK_GENERATED_AT, 16),
    stopNewDispatchActive: false,
    operationalHoldActive: true,
    humanFallbackActive: false,
    alertIds: ["roc-alert-discrepancy-tko_0215"],
  },
  {
    tripId: "trip_88228",
    orderId: "ord_trip_88228",
    vehicleId: "AV-7715",
    sandboxProgramId: "exp_fsd_taipei_01",
    safetyOperatorId: "so_lin_jiarong",
    status: "monitoring",
    latestTakeoverOccurredAt: null,
    stopNewDispatchActive: true,
    operationalHoldActive: false,
    humanFallbackActive: false,
    alertIds: ["roc-alert-telemetry-AV-7715"],
  },
  {
    tripId: "trip_88210",
    orderId: "ord_trip_88210",
    vehicleId: "AV-7741",
    sandboxProgramId: "exp_fsd_taipei_01",
    safetyOperatorId: "so_huang_zhiming",
    status: "completed",
    latestTakeoverOccurredAt: minutesBefore(FALLBACK_GENERATED_AT, 97),
    stopNewDispatchActive: false,
    operationalHoldActive: false,
    humanFallbackActive: false,
    alertIds: [],
  },
];

export const FALLBACK_ALERTS: RocAlertReadModel[] = [
  {
    alertId: "roc-alert-provider-tesla-regulatory",
    alertType: "provider_health",
    status: "open",
    severity: "warning",
    title: "監理事件鮮度過期",
    summary: "AV-7720 regulatory-event feed delayed 48 seconds.",
    vehicleId: "AV-7720",
    orderId: "ord_trip_88231",
    sandboxProgramId: "exp_fsd_taipei_01",
    providerCode: "tesla-regulatory",
    sourceRecordId: "evt_tesla_7720_1",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedTo: null,
    assignedAt: null,
    linkedIncidentId: null,
    resolvedAt: null,
    resolvedBy: null,
    openedAt: minutesBefore(FALLBACK_GENERATED_AT, 7),
    updatedAt: minutesBefore(FALLBACK_GENERATED_AT, 7),
    availableActions: [
      buildAction("ack", true, "low"),
      buildAction("notify", true, "low"),
      buildAction("resolve", true, "medium", "roc_role_required", true),
    ],
  },
  {
    alertId: "roc-alert-discrepancy-tko_0215",
    alertType: "takeover_discrepancy",
    status: "open",
    severity: "critical",
    title: "Tesla 整合失聯 / 接管待研判",
    summary: "AV-7732 requires ROC review and linked incident decision.",
    vehicleId: "AV-7732",
    orderId: "ord_trip_88240",
    sandboxProgramId: "exp_fsd_taipei_01",
    providerCode: "tesla-regulatory",
    sourceRecordId: "tko_0215",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedTo: null,
    assignedAt: null,
    linkedIncidentId: null,
    resolvedAt: null,
    resolvedBy: null,
    openedAt: minutesBefore(FALLBACK_GENERATED_AT, 17),
    updatedAt: minutesBefore(FALLBACK_GENERATED_AT, 16),
    availableActions: [
      buildAction("ack", true, "low"),
      buildAction("open-incident", true, "high", "roc_role_required", true),
      buildAction(
        "start-evidence-freeze",
        true,
        "high",
        "roc_role_required",
        true,
      ),
      buildAction("fallback-to-human", true, "high", "roc_role_required", true),
    ],
  },
  {
    alertId: "roc-alert-telemetry-AV-7715",
    alertType: "provider_health",
    status: "open",
    severity: "warning",
    title: "telemetry 鮮度降級",
    summary: "AV-7715 telemetry snapshot exceeds dispatch freshness target.",
    vehicleId: "AV-7715",
    orderId: "ord_trip_88228",
    sandboxProgramId: "exp_fsd_taipei_01",
    providerCode: "telemetry-stream",
    sourceRecordId: "tele_7715_1",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedTo: null,
    assignedAt: null,
    linkedIncidentId: null,
    resolvedAt: null,
    resolvedBy: null,
    openedAt: minutesBefore(FALLBACK_GENERATED_AT, 13),
    updatedAt: minutesBefore(FALLBACK_GENERATED_AT, 13),
    availableActions: [
      buildAction("ack", true, "low"),
      buildAction("stop-new-dispatch", true, "high", "roc_role_required", true),
      buildAction("notify", true, "low"),
    ],
  },
  {
    alertId: "roc-alert-provider-AV-7708",
    alertType: "provider_health",
    status: "open",
    severity: "critical",
    title: "Tesla 整合失聯",
    summary: "AV-7708 provider unreachable for 6 minutes.",
    vehicleId: "AV-7708",
    orderId: null,
    sandboxProgramId: "exp_fsd_taipei_01",
    providerCode: "tesla-regulatory",
    sourceRecordId: "provider_7708_1",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedTo: null,
    assignedAt: null,
    linkedIncidentId: null,
    resolvedAt: null,
    resolvedBy: null,
    openedAt: minutesBefore(FALLBACK_GENERATED_AT, 8),
    updatedAt: minutesBefore(FALLBACK_GENERATED_AT, 8),
    availableActions: [
      buildAction("ack", true, "low"),
      buildAction("operational-hold", true, "high", "roc_role_required", true),
      buildAction("notify", true, "low"),
    ],
  },
  {
    alertId: "roc-alert-boundary-AV-7741",
    alertType: "dispatch_gate",
    status: "open",
    severity: "warning",
    title: "離開核准區域邊界",
    summary: "AV-7741 approaches sandbox boundary within 120 meters.",
    vehicleId: "AV-7741",
    orderId: "ord_trip_88251",
    sandboxProgramId: "exp_fsd_taipei_01",
    providerCode: "sandbox-governance",
    sourceRecordId: "bound_7741_1",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedTo: null,
    assignedAt: null,
    linkedIncidentId: null,
    resolvedAt: null,
    resolvedBy: null,
    openedAt: minutesBefore(FALLBACK_GENERATED_AT, 10),
    updatedAt: minutesBefore(FALLBACK_GENERATED_AT, 10),
    availableActions: [
      buildAction("ack", true, "low"),
      buildAction(
        "request-safety-action",
        false,
        "medium",
        "vehicle_context_required",
      ),
      buildAction("notify", true, "low"),
    ],
  },
];

export const FALLBACK_TAKEOVERS: CorrelatedTakeoverCase[] = [
  {
    correlatedTakeoverCaseId: "takeover-case-rpt_0215",
    vehicleId: "AV-7732",
    orderId: "ord_trip_88240",
    takeoverCorrelationId: "tko_0215",
    correlationPriority: 1,
    matchedBy: "takeover_correlation_id",
    sourceRecordIds: {
      teslaEventId: "evt_tesla_0215",
      safetyOperatorTakeoverReportId: "rpt_0215",
      rocTakeoverResponseId: "roc_rsp_0215",
    },
    sourceTimestamps: {
      teslaOccurredAt: "2026-06-26T14:48:02Z",
      safetyOccurredAt: "2026-06-26T14:48:11Z",
      safetyServerReceivedAt: "2026-06-26T14:48:28Z",
      rocRequestedAt: "2026-06-26T14:48:19Z",
      rocRespondedAt: "2026-06-26T14:49:02Z",
      rocResolvedAt: null,
    },
    teslaEvent: {
      eventId: "evt_tesla_0215",
      takeoverCorrelationId: "tko_0215",
      autonomySessionId: "sess_7732",
      vehicleId: "AV-7732",
      orderId: "ord_trip_88240",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T14:48:02Z",
      source: buildSourceMetadata("tesla_fleet_api"),
    },
    safetyOperatorTakeoverReport: {
      reportId: "rpt_0215",
      clientGeneratedReportId: "client_rpt_0215",
      safetyOperatorId: "so_wu_minghan",
      vehicleId: "AV-7732",
      orderId: "ord_trip_88240",
      sandboxProgramId: "exp_fsd_taipei_01",
      shiftId: "shift_roc_day_01",
      assignmentId: "asg_7732",
      correlationId: "tko_0215",
      trigger: "roc_request",
      reasonCode: "remote_assist_request",
      disposition: "remote_assist",
      fsdResumed: false,
      bookmarkId: "bm_0215",
      incidentId: "inc_roc_0215",
      evidenceArtifactIds: ["ev_0215_1", "ev_0215_2"],
      notes:
        "Tesla upstream disconnected; safety operator requested evidence freeze.",
      occurredAt: "2026-06-26T14:48:11Z",
      serverReceivedAt: "2026-06-26T14:48:28Z",
    },
    rocTakeoverResponse: {
      responseId: "roc_rsp_0215",
      takeoverCorrelationId: "tko_0215",
      autonomySessionId: "sess_7732",
      triggeredByTeslaEventId: "evt_tesla_0215",
      rocOperatorId: "roc_duty_01",
      vehicleId: "AV-7732",
      orderId: "ord_trip_88240",
      responseType: "manual_takeover",
      requestedAt: "2026-06-26T14:48:19Z",
      respondedAt: "2026-06-26T14:49:02Z",
      resolvedAt: null,
      outcomeNote: "Evidence freeze initiated and incident workspace opened.",
      source: buildSourceMetadata("roc_operator"),
    },
    manualCorrelation: null,
    discrepancyCaseIds: ["takeover-discrepancy-rpt_0215"],
    investigationLink: {
      targetApp: "platform-admin",
      route: "/platform-admin/investigations",
      resourceType: "sandbox_takeover_case",
      resourceId: "takeover-case-rpt_0215",
      openMode: "new_tab",
      label: "Open investigations queue",
      requiredScopes: ["sandbox.investigation.read"],
    },
  },
  {
    correlatedTakeoverCaseId: "takeover-case-rpt_0209",
    vehicleId: "AV-7720",
    orderId: "ord_trip_88231",
    takeoverCorrelationId: "tko_0209",
    correlationPriority: 2,
    matchedBy: "vehicle_time_trip",
    sourceRecordIds: {
      teslaEventId: "evt_tesla_0209",
      safetyOperatorTakeoverReportId: "rpt_0209",
      rocTakeoverResponseId: "roc_rsp_0209",
    },
    sourceTimestamps: {
      teslaOccurredAt: "2026-06-26T14:31:02Z",
      safetyOccurredAt: "2026-06-26T14:31:15Z",
      safetyServerReceivedAt: "2026-06-26T14:31:30Z",
      rocRequestedAt: "2026-06-26T14:31:18Z",
      rocRespondedAt: "2026-06-26T14:31:44Z",
      rocResolvedAt: "2026-06-26T14:34:10Z",
    },
    teslaEvent: {
      eventId: "evt_tesla_0209",
      takeoverCorrelationId: null,
      autonomySessionId: "sess_7720",
      vehicleId: "AV-7720",
      orderId: "ord_trip_88231",
      transitionType: "fsd_disengagement",
      occurredAt: "2026-06-26T14:31:02Z",
      source: buildSourceMetadata("tesla_fleet_api"),
    },
    safetyOperatorTakeoverReport: {
      reportId: "rpt_0209",
      clientGeneratedReportId: "client_rpt_0209",
      safetyOperatorId: "so_chen_boyu",
      vehicleId: "AV-7720",
      orderId: "ord_trip_88231",
      sandboxProgramId: "exp_fsd_taipei_01",
      shiftId: "shift_roc_day_01",
      assignmentId: "asg_7720",
      correlationId: "tko_0209",
      trigger: "safety_operator",
      reasonCode: "map_mismatch",
      disposition: "fsd_resumed",
      fsdResumed: true,
      bookmarkId: null,
      incidentId: null,
      evidenceArtifactIds: ["ev_0209_1"],
      notes: "Vehicle resumed FSD after route verification.",
      occurredAt: "2026-06-26T14:31:15Z",
      serverReceivedAt: "2026-06-26T14:31:30Z",
    },
    rocTakeoverResponse: {
      responseId: "roc_rsp_0209",
      takeoverCorrelationId: null,
      autonomySessionId: "sess_7720",
      triggeredByTeslaEventId: "evt_tesla_0209",
      rocOperatorId: "roc_duty_02",
      vehicleId: "AV-7720",
      orderId: "ord_trip_88231",
      responseType: "remote_assist",
      requestedAt: "2026-06-26T14:31:18Z",
      respondedAt: "2026-06-26T14:31:44Z",
      resolvedAt: "2026-06-26T14:34:10Z",
      outcomeNote: "Confirmed approved route and monitored safe resume.",
      source: buildSourceMetadata("roc_operator"),
    },
    manualCorrelation: null,
    discrepancyCaseIds: [],
    investigationLink: {
      targetApp: "platform-admin",
      route: "/platform-admin/investigations",
      resourceType: "sandbox_takeover_case",
      resourceId: "takeover-case-rpt_0209",
      openMode: "new_tab",
      label: "Open investigations queue",
      requiredScopes: ["sandbox.investigation.read"],
    },
  },
];

export const FALLBACK_EVIDENCE_DISCREPANCIES: EvidenceDiscrepancyCase[] = [
  {
    discrepancyCaseId: "takeover-discrepancy-rpt_0215",
    correlatedTakeoverCaseId: "takeover-case-rpt_0215",
    vehicleId: "AV-7732",
    discrepancyTypes: ["timestamp_mismatch", "correlation_id_mismatch"],
    openedAt: "2026-06-26T14:50:00Z",
    summary:
      "Discrepancies detected across Tesla, safety-operator, and ROC takeover sources.",
    investigationLink: {
      targetApp: "platform-admin",
      route: "/platform-admin/investigations",
      resourceType: "sandbox_takeover_discrepancy",
      resourceId: "takeover-discrepancy-rpt_0215",
      openMode: "new_tab",
      label: "Open investigations queue",
      requiredScopes: ["sandbox.investigation.read"],
    },
    sourceFacts: {
      teslaOccurredAt: "2026-06-26T14:48:02Z",
      safetyOccurredAt: "2026-06-26T14:48:11Z",
      rocRequestedAt: "2026-06-26T14:48:19Z",
      rocRespondedAt: "2026-06-26T14:49:02Z",
      teslaOrderId: "ord_trip_88240",
      safetyOrderId: "ord_trip_88240",
      rocOrderId: "ord_trip_88240",
      teslaTakeoverCorrelationId: "tko_0215",
      safetyTakeoverCorrelationId: "tko_0215",
      rocTakeoverCorrelationId: "tko_0215",
    },
  },
];

export const FALLBACK_PROVIDER_HEALTH: RocProviderHealthSnapshot = {
  health: {
    status: "degraded",
    lastCheckedAt: FALLBACK_GENERATED_AT,
    degradedServices: [
      {
        service: "Tesla Regulatory Data Interface",
        impact: "AV-7708 provider unreachable.",
        severity: "critical",
      },
      {
        service: "Regulatory-event feed",
        impact: "2 vehicles stale beyond regulatory SLA.",
        severity: "warning",
      },
    ],
  },
  items: [
    {
      providerCode: "tesla-regulatory",
      displayName: "Tesla Regulatory Data Interface",
      status: "degraded",
      lastCheckedAt: minutesBefore(FALLBACK_GENERATED_AT, 6),
      message: "AV-7708 provider_unreachable · 6m",
      affectedVehicleIds: ["AV-7708"],
    },
    {
      providerCode: "telemetry-stream",
      displayName: "Telemetry stream",
      status: "healthy",
      lastCheckedAt: minutesBefore(FALLBACK_GENERATED_AT, 1),
      message: "4 / 5 vehicles fresh",
      affectedVehicleIds: [],
    },
    {
      providerCode: "evidence-recorder",
      displayName: "Evidence recorder uplink",
      status: "healthy",
      lastCheckedAt: minutesBefore(FALLBACK_GENERATED_AT, 1),
      message: "Upload queue 1",
      affectedVehicleIds: ["AV-7732"],
    },
    {
      providerCode: "regulatory-feed",
      displayName: "Regulatory-event feed",
      status: "degraded",
      lastCheckedAt: minutesBefore(FALLBACK_GENERATED_AT, 2),
      message: "2 vehicles stale > 60s",
      affectedVehicleIds: ["AV-7720", "AV-7715"],
    },
  ],
};

export const FALLBACK_EVIDENCE_FILES: RocEvidenceFile[] = [
  {
    name: "front_cam_1432.mp4",
    vehicleId: "AV-7720",
    source: "device_recorded",
    durationLabel: "02:14",
    shaLabel: "9f2a…7c41",
    status: "sealed",
  },
  {
    name: "tesla_event_log.json",
    vehicleId: "AV-7732",
    source: "not_exposed_by_provider",
    durationLabel: "—",
    shaLabel: "—",
    status: "unavailable",
  },
  {
    name: "cabin_cam_1448.mp4",
    vehicleId: "AV-7732",
    source: "device_recorded",
    durationLabel: "01:50",
    shaLabel: "pending",
    status: "uploading",
  },
  {
    name: "so_report_0215.pdf",
    vehicleId: "AV-7732",
    source: "operator_reported",
    durationLabel: "—",
    shaLabel: "3b81…22aa",
    status: "sealed",
  },
];

export const FALLBACK_HANDOVER_NOTE =
  "AV-7708 integration remains degraded. Prioritize provider follow-up and verify regulatory-event freshness before next dispatch window.";
