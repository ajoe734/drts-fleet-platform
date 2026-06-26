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
