#!/usr/bin/env node
import { createServer } from "node:http";

const HOST = process.env.MAP_GEOFENCE_OPS_MOCK_API_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MAP_GEOFENCE_OPS_MOCK_API_PORT ?? "3106");
const GENERATED_AT = "2026-07-08T05:05:00.000Z";
const REQUEST_ID = "req-map-geofence-ops-closeout";

const ORDER_ID = "ORD-SMOKE-001";
const JOB_ID = "JOB-OPS-CLOSEOUT-001";

const pickup = addressPayload({
  address: "No. 1, City Hall Road, Xinyi District, Taipei",
  addressName: "Taipei City Hall pickup curb",
  lat: 25.037519,
  lng: 121.56368,
  providerCandidateId: "place-city-hall",
});
const dropoff = addressPayload({
  address: "No. 100, Songren Road, Xinyi District, Taipei",
  addressName: "Xinyi office dropoff",
  lat: 25.033879,
  lng: 121.568743,
  providerCandidateId: "place-xinyi-office",
});

const orders = [
  {
    orderId: ORDER_ID,
    orderNo: ORDER_ID,
    orderSource: "phone",
    orderDomain: "owned",
    tenantId: "tenant-map-ops",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    serviceBucket: "standard_taxi",
    dispatchSemantics: "realtime",
    businessDispatchSubtype: null,
    serviceProductCode: "taxi_realtime",
    status: "assigned",
    pickup,
    dropoff,
    passenger: {
      name: "Smoke Caller",
      phone: "0912-000-301",
      roles: [],
    },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: "CALL-SMOKE-001",
    recordingId: "REC-SMOKE-001",
    reservationWindowStart: null,
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes:
      "Ops map closeout proof with governed pickup/dropoff and stale or missing supply.",
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceGates: [],
    complianceFlags: [],
    spatialAudit: spatialAuditSnapshot(),
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    queueFamily: "realtime_ready_queue",
    queueEntryReason: "realtime_ready_for_dispatch",
    dispatchAttemptCount: 1,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    availableActions: [],
  },
];

const dispatchJobs = [
  {
    dispatchJobId: JOB_ID,
    orderId: ORDER_ID,
    status: "assigned",
    mode: "auto",
    latestEtaMinutes: 4,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    availableActions: [],
  },
];

const dispatchCandidates = {
  [JOB_ID]: [
    candidate({
      vehicleId: "VH-MAP-001",
      driverId: "driver-map-fresh",
      lat: 25.03688,
      lng: 121.56608,
      accuracyM: 8,
      etaMinutes: 4,
      locationState: "fresh",
      recordedAt: GENERATED_AT,
    }),
    candidate({
      vehicleId: "VH-MAP-002",
      driverId: "driver-map-low-accuracy",
      lat: 25.04035,
      lng: 121.56097,
      accuracyM: 86,
      etaMinutes: 8,
      locationState: "low_accuracy",
      recordedAt: "2026-07-08T04:58:00.000Z",
    }),
    {
      vehicleId: "VH-MAP-003",
      driverId: "driver-map-missing",
      operatingArea: "TAIPEI_CORE",
      serviceBuckets: ["standard_taxi"],
      etaMinutes: 11,
      currentLocation: null,
      locationState: "missing",
    },
  ],
};

const driverTasks = [
  {
    taskId: "TASK-OPS-CLOSEOUT-001",
    orderId: ORDER_ID,
    dispatchJobId: JOB_ID,
    assignmentId: "ASSIGN-OPS-CLOSEOUT-001",
    serviceProductCode: "taxi_realtime",
    driverId: "driver-map-fresh",
    vehicleId: "VH-MAP-001",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
    status: "accepted",
    acceptedAt: GENERATED_AT,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: null,
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
    complianceGates: [],
    forwardedStatus: null,
  },
];

const drivers = [
  {
    driverId: "driver-map-fresh",
    name: "Map Fresh Driver",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "reserved",
    licensesValid: true,
    lifecycleStatus: "active",
    eligibilityBlockedReasons: [],
    dispatchEligible: true,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    activatedAt: GENERATED_AT,
    suspendedAt: null,
    retiredAt: null,
    profileUpdatedAt: GENERATED_AT,
    deviceBindings: [],
  },
  {
    driverId: "driver-map-low-accuracy",
    name: "Map Low Accuracy Driver",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "available",
    licensesValid: true,
    lifecycleStatus: "active",
    eligibilityBlockedReasons: [],
    dispatchEligible: true,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    activatedAt: GENERATED_AT,
    suspendedAt: null,
    retiredAt: null,
    profileUpdatedAt: GENERATED_AT,
    deviceBindings: [],
  },
];

const identityContext = {
  actorType: "ops_user",
  actorId: "ops-map-closeout",
  realm: "ops",
  authMode: "bootstrap_headers",
  roleFamilies: ["ops"],
  roles: ["ops_dispatcher"],
  scopes: ["dispatch:read"],
  tenantId: null,
  supportedExecutionModes: ["supervisor_managed_execution"],
};

const server = createServer((request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? `${HOST}:${PORT}`}`,
  );

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, notFoundEnvelope(url.pathname), 404);
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, {
      status: "healthy",
      timestamp: GENERATED_AT,
      service: "map-geofence-ops-mock-api",
      mode: "mock",
    });
    return;
  }

  if (url.pathname === "/api/orders") {
    sendJson(response, envelope(listEnvelope(orders)));
    return;
  }

  if (url.pathname === "/api/dispatch/tasks") {
    sendJson(response, envelope(listEnvelope(dispatchJobs)));
    return;
  }

  const candidateMatch = url.pathname.match(
    /^\/api\/dispatch\/tasks\/([^/]+)\/candidates$/,
  );
  if (candidateMatch) {
    const dispatchJobId = decodeURIComponent(candidateMatch[1]);
    sendJson(
      response,
      envelope(listEnvelope(dispatchCandidates[dispatchJobId] ?? [])),
    );
    return;
  }

  if (url.pathname === "/api/driver/tasks") {
    sendJson(response, envelope(listEnvelope(driverTasks)));
    return;
  }

  if (url.pathname === "/api/drivers") {
    sendJson(response, envelope(listEnvelope(drivers)));
    return;
  }

  if (
    url.pathname === "/api/forwarder/orders" ||
    url.pathname === "/api/forwarder/adapters/health" ||
    url.pathname === "/api/forwarder/reconciliation-issues" ||
    url.pathname === "/api/ops/partner/eligibility/reviews"
  ) {
    sendJson(response, envelope(listEnvelope([])));
    return;
  }

  if (url.pathname === "/api/identity/context") {
    sendJson(response, envelope(identityContext));
    return;
  }

  sendJson(response, notFoundEnvelope(url.pathname), 404);
});

server.listen(PORT, HOST, () => {
  console.log(
    `[map-geofence-ops-mock-api] listening on http://${HOST}:${PORT}`,
  );
});

server.on("error", (error) => {
  console.error("[map-geofence-ops-mock-api] failed", error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function addressPayload({
  address,
  addressName,
  lat,
  lng,
  providerCandidateId,
}) {
  const provenance = {
    coordinateSource: "provider_candidate",
    geocodeProvider: "mock",
    geocodeConfidence: "exact",
    providerCandidateId,
    placeId: providerCandidateId,
    coordinateAccuracyM: 8,
    selectedByActorId: "ops-map-closeout",
    selectedAt: GENERATED_AT,
    surface: "callcenter",
  };

  return {
    address,
    addressName,
    normalizedAddress: address,
    maskedAddress: address,
    sensitive: false,
    lat,
    lng,
    placeId: providerCandidateId,
    geocodeProvider: "mock",
    geocodeConfidence: "exact",
    coordinateSource: "provider_candidate",
    coordinateAccuracyM: 8,
    providerCandidateId,
    selectedByActorId: "ops-map-closeout",
    selectedAt: GENERATED_AT,
    surface: "callcenter",
    coordinateProvenance: provenance,
  };
}

function spatialAuditSnapshot() {
  const serviceAreaEvaluation = {
    decision: "serviceable",
    serviceProductType: "taxi_realtime",
    evaluatedAt: GENERATED_AT,
    stops: [
      {
        kind: "pickup",
        location: { lat: pickup.lat, lng: pickup.lng },
        serviceAreaCodes: ["TAIPEI_CORE"],
        policyCodes: ["PICKUP_ZONE_A"],
        geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
        decision: "serviceable",
        reasonCodes: [],
        reasonMessages: [],
      },
      {
        kind: "dropoff",
        location: { lat: dropoff.lat, lng: dropoff.lng },
        serviceAreaCodes: ["TAIPEI_CORE"],
        policyCodes: ["DROPOFF_ZONE_B"],
        geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
        decision: "serviceable",
        reasonCodes: [],
        reasonMessages: [],
      },
    ],
    serviceAreaCodes: ["TAIPEI_CORE"],
    geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
    reasonCodes: [],
    reasonMessages: [],
  };

  return {
    snapshotId: "snapshot-serviceable-001",
    snapshotVersion: 1,
    capturedAt: GENERATED_AT,
    capturedReason: "booking_creation",
    actorId: "ops-map-closeout",
    actorType: "ops_user",
    surface: "callcenter",
    serviceProductType: "taxi_realtime",
    decision: "serviceable",
    stops: [
      {
        kind: "pickup",
        addressText: pickup.address,
        location: { lat: pickup.lat, lng: pickup.lng },
        coordinateProvenance: pickup.coordinateProvenance,
        provenanceComplete: true,
        missingItems: [],
      },
      {
        kind: "dropoff",
        addressText: dropoff.address,
        location: { lat: dropoff.lat, lng: dropoff.lng },
        coordinateProvenance: dropoff.coordinateProvenance,
        provenanceComplete: true,
        missingItems: [],
      },
    ],
    serviceAreaEvaluation,
    serviceAreaCodes: ["TAIPEI_CORE"],
    geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
    reasonCodes: [],
    reasonMessages: [],
    missingItems: [],
    auditEvents: [
      {
        auditId: "AUD-SMOKE-001",
        actionName: "order.spatial_audit.snapshot_created",
        actorId: "ops-map-closeout",
        actorType: "ops_user",
        createdAt: GENERATED_AT,
      },
    ],
  };
}

function candidate({
  vehicleId,
  driverId,
  lat,
  lng,
  accuracyM,
  etaMinutes,
  locationState,
  recordedAt,
}) {
  return {
    vehicleId,
    driverId,
    operatingArea: "TAIPEI_CORE",
    serviceBuckets: ["standard_taxi"],
    etaMinutes,
    currentLocation: {
      driverId,
      lat,
      lng,
      accuracyM,
      recordedAt,
      updatedAt: recordedAt,
    },
    locationState,
  };
}

function envelope(data) {
  return {
    data,
    meta: {
      requestId: REQUEST_ID,
      timestamp: GENERATED_AT,
    },
  };
}

function listEnvelope(items) {
  return {
    items,
    refresh: refreshMetadata(),
    health: healthEnvelope(),
  };
}

function refreshMetadata() {
  return {
    generatedAt: GENERATED_AT,
    staleAfterMs: 30_000,
    dataFreshness: "fresh",
    source: "mock",
  };
}

function healthEnvelope() {
  return {
    status: "healthy",
    degradedServices: [],
    lastCheckedAt: GENERATED_AT,
  };
}

function notFoundEnvelope(pathname) {
  return {
    error: {
      code: "MAP_GEOFENCE_OPS_MOCK_NOT_FOUND",
      message: `No mock route registered for ${pathname}.`,
      retryable: false,
      traceId: REQUEST_ID,
    },
    meta: {
      requestId: REQUEST_ID,
      timestamp: GENERATED_AT,
    },
  };
}

function sendJson(response, body, status = 200) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers":
      "content-type,authorization,x-actor-id,x-actor-type,x-realm",
  });
  response.end();
}
