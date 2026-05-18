import {
  getPartnerBookingScenarioScreen,
  isPartnerBookingScenarioId,
  isPartnerBookingScreenId,
  type PartnerBookingScenarioId,
  type PartnerBookingScreenId,
} from "@drts/ui-web";

export type PartnerRouteStateResolution = {
  activeScreen: PartnerBookingScreenId;
  activeScenario?: PartnerBookingScenarioId;
};

function normalizeSingleValue(
  value: string | ReadonlyArray<string> | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value[0] : undefined;
}

export function resolvePartnerRouteState(
  routeState: string,
): PartnerRouteStateResolution | null {
  if (isPartnerBookingScenarioId(routeState)) {
    return {
      activeScreen: getPartnerBookingScenarioScreen(routeState),
      activeScenario: routeState,
    };
  }

  return null;
}

export function resolvePartnerSearchState(
  screen?: string | ReadonlyArray<string>,
  scenario?: string | ReadonlyArray<string>,
): PartnerRouteStateResolution {
  const normalizedScenario = normalizeSingleValue(scenario);
  if (normalizedScenario && isPartnerBookingScenarioId(normalizedScenario)) {
    return {
      activeScreen: getPartnerBookingScenarioScreen(normalizedScenario),
      activeScenario: normalizedScenario,
    };
  }

  const normalizedScreen = normalizeSingleValue(screen);
  if (normalizedScreen && isPartnerBookingScreenId(normalizedScreen)) {
    return { activeScreen: normalizedScreen };
  }

  return { activeScreen: "landing" };
}
