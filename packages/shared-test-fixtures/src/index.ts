import type {
  GeoPoint,
  Phase2SourceMetadata,
  TeslaDiscoveredVehicle,
  TeslaFleetRegion,
  TeslaPublicTelemetrySample,
} from "../../contracts/src";

export interface ScenarioFixture {
  id: string;
  name: string;
  tags: string[];
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

function buildPhase2SourceMetadata(
  overrides: Partial<Phase2SourceMetadata> = {},
): Phase2SourceMetadata {
  return {
    sourceSystem: overrides.sourceSystem ?? "tesla_public_telemetry",
    sourceRef: overrides.sourceRef ?? "fixture-source-ref-001",
    ingestedAt: overrides.ingestedAt ?? "2026-06-26T00:00:00.000Z",
    recordedAt: overrides.recordedAt ?? "2026-06-26T00:00:00.000Z",
    signatureRef: overrides.signatureRef ?? null,
    schemaVersion: overrides.schemaVersion ?? "fixture-v1",
  };
}

export function buildTeslaDiscoveredVehicleFixture(
  overrides: Partial<TeslaDiscoveredVehicle> = {},
): TeslaDiscoveredVehicle {
  return {
    vin: overrides.vin ?? "5YJ3E1EA7JF000001",
    externalVehicleRef:
      overrides.externalVehicleRef ?? "tesla-public-veh-demo-001",
    connectionId: overrides.connectionId ?? "tesla-conn-demo-001",
    region: overrides.region ?? ("north_america" satisfies TeslaFleetRegion),
    model: overrides.model ?? "Model 3",
    online: overrides.online ?? true,
    batteryLevelPct: overrides.batteryLevelPct ?? 78,
    lastSeenAt: overrides.lastSeenAt ?? "2026-06-26T00:05:00.000Z",
    source:
      overrides.source ??
      buildPhase2SourceMetadata({
        sourceSystem: "tesla_fleet_api",
        sourceRef: overrides.vin ?? "5YJ3E1EA7JF000001",
      }),
  };
}

export function buildTeslaPublicTelemetrySampleFixture(
  overrides: Partial<TeslaPublicTelemetrySample> = {},
): TeslaPublicTelemetrySample {
  const defaultLocation: GeoPoint = {
    lat: 25.033964,
    lng: 121.564468,
  };

  return {
    sampleId: overrides.sampleId ?? "tesla-public-sample-001",
    externalVehicleRef:
      overrides.externalVehicleRef ?? "tesla-public-veh-demo-001",
    capturedAt: overrides.capturedAt ?? "2026-06-26T00:06:00.000Z",
    location: overrides.location ?? defaultLocation,
    batteryLevelPct: overrides.batteryLevelPct ?? 76,
    online: overrides.online ?? true,
    source:
      overrides.source ??
      buildPhase2SourceMetadata({
        sourceSystem: "tesla_public_telemetry",
        sourceRef: overrides.sampleId ?? "tesla-public-sample-001",
      }),
  };
}
