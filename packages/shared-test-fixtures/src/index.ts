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
