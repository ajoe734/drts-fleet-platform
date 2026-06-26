import type {
  Phase2ProviderCapability,
  Phase2SourceMetadata,
  ProviderCapabilityDescriptor,
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryEvent,
  TeslaRegulatoryReasonCodeDictionary,
  TeslaRegulatoryReasonCodeEntry,
} from "@drts/contracts";

const DEFAULT_TIMESTAMP = "2026-06-26T00:00:00.000Z";
const DEFAULT_VIN = "5YJSA1E26HF000001";
const DEFAULT_VEHICLE_ID = "vehicle-tesla-demo-001";
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

export function buildTeslaRegulatoryMockCapabilityProfile(
  overrides: Partial<TeslaRegulatoryCapabilityProfile> & {
    missingRequiredCapabilities?: Phase2ProviderCapability[];
  } = {},
): TeslaRegulatoryCapabilityProfile {
  const providerCode = overrides.providerCode ?? DEFAULT_PROVIDER_CODE;
  const missingRequiredCapabilities =
    overrides.missingRequiredCapabilities ?? [];

  return {
    profileId: overrides.profileId ?? "9bfa7d0d-8d0e-4f1e-909e-20d6ae93d5f4",
    vehicleId: overrides.vehicleId ?? DEFAULT_VEHICLE_ID,
    vin: overrides.vin ?? DEFAULT_VIN,
    externalVehicleRef: overrides.externalVehicleRef ?? DEFAULT_VIN,
    providerCode,
    providerSchemaVersion:
      overrides.providerSchemaVersion ?? DEFAULT_PROVIDER_SCHEMA_VERSION,
    checkedAt: overrides.checkedAt ?? DEFAULT_TIMESTAMP,
    requiredCapabilities:
      overrides.requiredCapabilities ?? PASSENGER_SERVICE_REQUIRED_CAPABILITIES,
    capabilities:
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
      ),
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

export function buildTeslaRegulatoryMockReasonCodeEntry(
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

export function buildTeslaRegulatoryMockReasonCodeDictionary(
  overrides: Partial<TeslaRegulatoryReasonCodeDictionary> = {},
): TeslaRegulatoryReasonCodeDictionary {
  const providerCode = overrides.providerCode ?? DEFAULT_PROVIDER_CODE;
  const dictionaryVersion =
    overrides.dictionaryVersion ?? DEFAULT_REASON_CODE_DICTIONARY_VERSION;

  return {
    dictionaryId:
      overrides.dictionaryId ?? "8a09af42-ecdd-4b2d-b5be-1f632f498b58",
    providerCode,
    dictionaryVersion,
    effectiveFrom: overrides.effectiveFrom ?? DEFAULT_TIMESTAMP,
    publishedAt: overrides.publishedAt ?? DEFAULT_TIMESTAMP,
    entries:
      overrides.entries ??
      [
        buildTeslaRegulatoryMockReasonCodeEntry({
          providerCode,
          dictionaryVersion,
          reasonCode: "ODD_EXIT",
          displayLabel: "ODD boundary exit",
          description:
            "Vehicle exited the configured operational design domain boundary.",
          relatedEventTypes: ["odd_boundary_exit", "fsd_disengagement"],
        }),
        buildTeslaRegulatoryMockReasonCodeEntry({
          providerCode,
          dictionaryVersion,
          entryId: "7d83a5e7-9751-4d14-a1dc-7a8451db44af",
          reasonCode: "REMOTE_ASSIST_REQUESTED",
          displayLabel: "Remote assist requested",
          description:
            "Vehicle requested ROC operator assistance during the FSD session.",
          relatedEventTypes: ["remote_assist_requested"],
        }),
        buildTeslaRegulatoryMockReasonCodeEntry({
          providerCode,
          dictionaryVersion,
          entryId: "22eef0d6-cf11-4ea6-8198-4bcde4448428",
          reasonCode: "MINIMAL_RISK_ENTERED",
          displayLabel: "Minimal risk condition entered",
          description:
            "Vehicle entered its minimal-risk-condition safety posture.",
          relatedEventTypes: ["minimal_risk_condition_entered"],
        }),
      ],
    source: overrides.source ?? buildSourceMetadata(),
  };
}

export function buildTeslaRegulatoryMockEvents(
  overrides: {
    vin?: string;
    vehicleId?: string;
    externalVehicleRef?: string;
  } = {},
): TeslaRegulatoryEvent[] {
  const vin = overrides.vin ?? DEFAULT_VIN;
  const vehicleId = overrides.vehicleId ?? DEFAULT_VEHICLE_ID;
  const externalVehicleRef = overrides.externalVehicleRef ?? vin;
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
