export interface ScenarioFixture {
  id: string;
  name: string;
  tags: string[];
}

import type {
  Phase2ProviderCapability,
  Phase2SourceMetadata,
  ProviderCapabilityDescriptor,
  TeslaAutonomyTransition,
  TeslaFsdSession,
  TeslaIncidentEvidenceReference,
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryEvent,
  TeslaRegulatoryReasonCodeDictionary,
  TeslaRegulatoryReasonCodeEntry,
  TeslaSessionSummary,
} from "../../contracts/src";

const DEFAULT_TIMESTAMP = "2026-06-26T00:00:00.000Z";
const DEFAULT_VIN = "5YJSA1E26HF000001";
const DEFAULT_VEHICLE_ID = "vehicle-tesla-demo-001";
const DEFAULT_EXTERNAL_VEHICLE_REF = DEFAULT_VIN;
const DEFAULT_PROVIDER_CODE = "tesla_regulatory_mock";
const DEFAULT_PROVIDER_SCHEMA_VERSION = "mock-2026.06";
const DEFAULT_REASON_CODE_DICTIONARY_VERSION = "tesla-reasons-2026.06";

const PASSENGER_SERVICE_REQUIRED_CAPABILITIES: Phase2ProviderCapability[] = [
  "av_dispatch",
  "telemetry_stream",
  "regulatory_event_feed",
  "evidence_recorder",
  "odd_geofence",
  "minimal_risk_condition",
];

function buildSourceMetadata(
  overrides: Partial<Phase2SourceMetadata> = {},
): Phase2SourceMetadata {
  return {
    sourceSystem: "tesla_fleet_api",
    sourceRef: "mock-source-ref-001",
    ingestedAt: DEFAULT_TIMESTAMP,
    recordedAt: DEFAULT_TIMESTAMP,
    signatureRef: "mock-signature://tesla/sample-signature-001",
    schemaVersion: DEFAULT_PROVIDER_SCHEMA_VERSION,
    ...overrides,
  };
}

function buildCapabilityDescriptor(
  capability: Phase2ProviderCapability,
  available: boolean,
  providerCode = DEFAULT_PROVIDER_CODE,
): ProviderCapabilityDescriptor {
  return {
    providerCode,
    capability,
    available,
    schemaVersion: DEFAULT_PROVIDER_SCHEMA_VERSION,
  };
}

export function buildTeslaRegulatoryCapabilityProfile(
  overrides: Partial<TeslaRegulatoryCapabilityProfile> & {
    missingRequiredCapabilities?: Phase2ProviderCapability[];
  } = {},
): TeslaRegulatoryCapabilityProfile {
  const providerCode = overrides.providerCode ?? DEFAULT_PROVIDER_CODE;
  const missingRequiredCapabilities =
    overrides.missingRequiredCapabilities ?? [];
  const capabilities =
    overrides.capabilities ??
    ([
      "av_dispatch",
      "remote_command",
      "telemetry_stream",
      "regulatory_event_feed",
      "evidence_recorder",
      "odd_geofence",
      "minimal_risk_condition",
    ] as const).map((capability) =>
      buildCapabilityDescriptor(
        capability,
        !missingRequiredCapabilities.includes(capability),
        providerCode,
      ),
    );

  return {
    profileId: overrides.profileId ?? "9bfa7d0d-8d0e-4f1e-909e-20d6ae93d5f4",
    vehicleId: overrides.vehicleId ?? DEFAULT_VEHICLE_ID,
    vin: overrides.vin ?? DEFAULT_VIN,
    externalVehicleRef:
      overrides.externalVehicleRef ?? DEFAULT_EXTERNAL_VEHICLE_REF,
    providerCode,
    providerSchemaVersion:
      overrides.providerSchemaVersion ?? DEFAULT_PROVIDER_SCHEMA_VERSION,
    checkedAt: overrides.checkedAt ?? DEFAULT_TIMESTAMP,
    requiredCapabilities:
      overrides.requiredCapabilities ?? PASSENGER_SERVICE_REQUIRED_CAPABILITIES,
    capabilities,
    missingRequiredCapabilities:
      overrides.missingRequiredCapabilities ?? missingRequiredCapabilities,
    passengerServiceStatus:
      overrides.passengerServiceStatus ??
      (missingRequiredCapabilities.length === 0 ? "eligible" : "gated"),
    passengerServiceReasonCode:
      overrides.passengerServiceReasonCode ??
      (missingRequiredCapabilities.length === 0
        ? null
        : "required-capability-missing"),
    reasonCodeDictionaryVersion:
      overrides.reasonCodeDictionaryVersion ??
      DEFAULT_REASON_CODE_DICTIONARY_VERSION,
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaRegulatoryReasonCodeEntry(
  overrides: Partial<TeslaRegulatoryReasonCodeEntry> = {},
): TeslaRegulatoryReasonCodeEntry {
  return {
    entryId: overrides.entryId ?? "4e2c0fed-f1fd-4cdc-b8c2-30eb8f0ea1a1",
    providerCode: overrides.providerCode ?? DEFAULT_PROVIDER_CODE,
    dictionaryVersion:
      overrides.dictionaryVersion ?? DEFAULT_REASON_CODE_DICTIONARY_VERSION,
    reasonCode: overrides.reasonCode ?? "ODD_EXIT",
    displayLabel: overrides.displayLabel ?? "ODD boundary exit",
    description:
      overrides.description ??
      "Vehicle exited the configured operational design domain boundary.",
    relatedEventTypes: overrides.relatedEventTypes ?? [
      "odd_boundary_exit",
      "fsd_disengagement",
    ],
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaRegulatoryReasonCodeDictionary(
  overrides: Partial<TeslaRegulatoryReasonCodeDictionary> = {},
): TeslaRegulatoryReasonCodeDictionary {
  const providerCode = overrides.providerCode ?? DEFAULT_PROVIDER_CODE;
  const dictionaryVersion =
    overrides.dictionaryVersion ?? DEFAULT_REASON_CODE_DICTIONARY_VERSION;
  const entries =
    overrides.entries ??
    [
      buildTeslaRegulatoryReasonCodeEntry({
        providerCode,
        dictionaryVersion,
        entryId: "4e2c0fed-f1fd-4cdc-b8c2-30eb8f0ea1a1",
        reasonCode: "ODD_EXIT",
        displayLabel: "ODD boundary exit",
        description:
          "Vehicle exited the configured operational design domain boundary.",
        relatedEventTypes: ["odd_boundary_exit", "fsd_disengagement"],
      }),
      buildTeslaRegulatoryReasonCodeEntry({
        providerCode,
        dictionaryVersion,
        entryId: "7d83a5e7-9751-4d14-a1dc-7a8451db44af",
        reasonCode: "REMOTE_ASSIST_REQUESTED",
        displayLabel: "Remote assist requested",
        description:
          "Vehicle requested ROC operator assistance during the FSD session.",
        relatedEventTypes: ["remote_assist_requested"],
      }),
      buildTeslaRegulatoryReasonCodeEntry({
        providerCode,
        dictionaryVersion,
        entryId: "22eef0d6-cf11-4ea6-8198-4bcde4448428",
        reasonCode: "MINIMAL_RISK_ENTERED",
        displayLabel: "Minimal risk condition entered",
        description:
          "Vehicle entered its minimal-risk-condition safety posture.",
        relatedEventTypes: ["minimal_risk_condition_entered"],
      }),
    ];

  return {
    dictionaryId:
      overrides.dictionaryId ?? "8a09af42-ecdd-4b2d-b5be-1f632f498b58",
    providerCode,
    dictionaryVersion,
    effectiveFrom: overrides.effectiveFrom ?? DEFAULT_TIMESTAMP,
    publishedAt: overrides.publishedAt ?? DEFAULT_TIMESTAMP,
    entries,
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaRegulatoryEvents(
  overrides: {
    vin?: string;
    vehicleId?: string;
    externalVehicleRef?: string;
  } = {},
): TeslaRegulatoryEvent[] {
  const vin = overrides.vin ?? DEFAULT_VIN;
  const vehicleId = overrides.vehicleId ?? DEFAULT_VEHICLE_ID;
  const externalVehicleRef =
    overrides.externalVehicleRef ?? DEFAULT_EXTERNAL_VEHICLE_REF;
  const source = buildSourceMetadata({
    sourceRef: "mock-event-batch-001",
    signatureRef: "mock-signature://tesla/event-batch-001",
  });

  return [
    {
      eventId: "f6ca6293-9309-4cbf-aa0f-d4ce5c7ded74",
      vehicleId,
      externalVehicleRef,
      eventType: "fsd_engagement",
      occurredAt: "2026-06-26T00:00:00.000Z",
      location: {
        lat: 25.033964,
        lng: 121.564468,
      },
      speedMps: 12.3,
      headingDeg: 182,
      disengagementCause: null,
      providerReasonCode: null,
      safetyOperatorId: null,
      rocOperatorId: null,
      oddZoneId: "odd-zone-taipei-demo",
      source,
    },
    {
      eventId: "c763ea87-d1ff-4b08-bd6f-f4aa8af6f5c6",
      vehicleId,
      externalVehicleRef,
      eventType: "remote_assist_requested",
      occurredAt: "2026-06-26T00:07:00.000Z",
      location: {
        lat: 25.037541,
        lng: 121.563425,
      },
      speedMps: 4.2,
      headingDeg: 175,
      disengagementCause: null,
      providerReasonCode: "REMOTE_ASSIST_REQUESTED",
      safetyOperatorId: null,
      rocOperatorId: "roc-operator-demo-001",
      oddZoneId: "odd-zone-taipei-demo",
      source,
    },
    {
      eventId: "6d6ae108-8c5a-4b78-baa3-1f1384b4f97a",
      vehicleId,
      externalVehicleRef,
      eventType: "fsd_disengagement",
      occurredAt: "2026-06-26T00:12:00.000Z",
      location: {
        lat: 25.041378,
        lng: 121.565128,
      },
      speedMps: 0,
      headingDeg: 170,
      disengagementCause: "odd_exit",
      providerReasonCode: "ODD_EXIT",
      safetyOperatorId: "safety-operator-demo-001",
      rocOperatorId: "roc-operator-demo-001",
      oddZoneId: "odd-zone-taipei-demo",
      source,
    },
  ];
}

export function buildTeslaFsdSession(
  overrides: Partial<TeslaFsdSession> = {},
): TeslaFsdSession {
  return {
    sessionId: overrides.sessionId ?? "9a5903a3-8648-4d8b-96fd-42d708e85ec7",
    vehicleId: overrides.vehicleId ?? DEFAULT_VEHICLE_ID,
    vin: overrides.vin ?? DEFAULT_VIN,
    externalVehicleRef:
      overrides.externalVehicleRef ?? DEFAULT_EXTERNAL_VEHICLE_REF,
    startedAt: overrides.startedAt ?? "2026-06-26T00:00:00.000Z",
    endedAt: overrides.endedAt ?? "2026-06-26T00:12:00.000Z",
    startedByEventId:
      overrides.startedByEventId ?? "f6ca6293-9309-4cbf-aa0f-d4ce5c7ded74",
    endedByEventId:
      overrides.endedByEventId ?? "6d6ae108-8c5a-4b78-baa3-1f1384b4f97a",
    currentState: overrides.currentState ?? "manual",
    disengagementCount: overrides.disengagementCount ?? 1,
    interventionCount: overrides.interventionCount ?? 1,
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaAutonomyTransitions(
  overrides: {
    vin?: string;
    vehicleId?: string;
  } = {},
): TeslaAutonomyTransition[] {
  const vin = overrides.vin ?? DEFAULT_VIN;
  const vehicleId = overrides.vehicleId ?? DEFAULT_VEHICLE_ID;
  const source = buildSourceMetadata();

  return [
    {
      transitionId: "20bf2807-6125-4bf8-a993-a31807cc8afb",
      sessionId: "9a5903a3-8648-4d8b-96fd-42d708e85ec7",
      vehicleId,
      vin,
      occurredAt: "2026-06-26T00:00:00.000Z",
      fromState: "fsd_standby",
      toState: "fsd_engaged",
      triggeringEventId: "f6ca6293-9309-4cbf-aa0f-d4ce5c7ded74",
      providerReasonCode: null,
      source,
    },
    {
      transitionId: "d52ece99-07a1-47b2-8d38-a931f19152a7",
      sessionId: "9a5903a3-8648-4d8b-96fd-42d708e85ec7",
      vehicleId,
      vin,
      occurredAt: "2026-06-26T00:12:00.000Z",
      fromState: "fsd_engaged",
      toState: "manual",
      triggeringEventId: "6d6ae108-8c5a-4b78-baa3-1f1384b4f97a",
      providerReasonCode: "ODD_EXIT",
      source,
    },
  ];
}

export function buildTeslaSessionSummary(
  overrides: Partial<TeslaSessionSummary> = {},
): TeslaSessionSummary {
  return {
    summaryId: overrides.summaryId ?? "c25129b0-160d-4468-9a9c-457243fb804e",
    sessionId: overrides.sessionId ?? "9a5903a3-8648-4d8b-96fd-42d708e85ec7",
    vehicleId: overrides.vehicleId ?? DEFAULT_VEHICLE_ID,
    vin: overrides.vin ?? DEFAULT_VIN,
    generatedAt: overrides.generatedAt ?? DEFAULT_TIMESTAMP,
    fsdEngagedSeconds: overrides.fsdEngagedSeconds ?? 720,
    disengagementCount: overrides.disengagementCount ?? 1,
    interventionCount: overrides.interventionCount ?? 1,
    nearMissCount: overrides.nearMissCount ?? 0,
    collisionCount: overrides.collisionCount ?? 0,
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaIncidentEvidenceReference(
  overrides: Partial<TeslaIncidentEvidenceReference> = {},
): TeslaIncidentEvidenceReference {
  return {
    evidenceReferenceId:
      overrides.evidenceReferenceId ??
      "777c7173-f41f-4a46-a1bc-e351ad626cb8",
    vehicleId: overrides.vehicleId ?? DEFAULT_VEHICLE_ID,
    vin: overrides.vin ?? DEFAULT_VIN,
    sessionId: overrides.sessionId ?? "9a5903a3-8648-4d8b-96fd-42d708e85ec7",
    triggeringEventId:
      overrides.triggeringEventId ?? "6d6ae108-8c5a-4b78-baa3-1f1384b4f97a",
    evidenceManifestId:
      overrides.evidenceManifestId ??
      "cefa96a9-8460-4107-a0ec-b873317cf31c",
    artifactId:
      overrides.artifactId ?? "5bda59e0-95c4-444f-9357-ae24fb7029d0",
    referenceType: overrides.referenceType ?? "telemetry_export",
    recordedAt: overrides.recordedAt ?? DEFAULT_TIMESTAMP,
    notes:
      overrides.notes ??
      "Evidence retained for AV incident review and regulator export.",
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildScenarioFixture(
  overrides: Partial<ScenarioFixture> = {},
): ScenarioFixture {
  return {
    id: overrides.id ?? "fixture-scenario-001",
    name: overrides.name ?? "phase1-placeholder-scenario",
    tags: overrides.tags ?? ["phase1", "placeholder"],
  };
}

export interface MockRecorderFixture {
  recorderId: string;
  vehicleId: string;
  vendorCode: string;
  deviceId: string;
  firmwareVersion: string;
}

export function buildMockRecorderFixture(
  overrides: Partial<MockRecorderFixture> = {},
): MockRecorderFixture {
  return {
    recorderId: overrides.recorderId ?? "rec-mock-001",
    vehicleId: overrides.vehicleId ?? "veh-av-001",
    vendorCode: overrides.vendorCode ?? "mock_recorder",
    deviceId: overrides.deviceId ?? "device-mock-001",
    firmwareVersion: overrides.firmwareVersion ?? "2026.06.25",
  };
}
