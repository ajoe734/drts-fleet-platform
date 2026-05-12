import {
  getPartnerBookingScenarioScreen,
  isPartnerBookingScenarioId,
  isPartnerBookingScreenId,
  type PartnerBookingScenarioId,
  type PartnerBookingScreenId,
} from "@drts/ui-web";

export type PartnerRouteState = {
  activeScreen: PartnerBookingScreenId;
  activeScenario?: PartnerBookingScenarioId;
};

function normalizeSingleValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolvePartnerRouteState(
  routeState: string,
): PartnerRouteState | null {
  if (isPartnerBookingScreenId(routeState)) {
    return { activeScreen: routeState };
  }

  if (isPartnerBookingScenarioId(routeState)) {
    return {
      activeScreen: getPartnerBookingScenarioScreen(routeState),
      activeScenario: routeState,
    };
  }

  return null;
}

export function resolvePartnerSearchState(
  screen: string | string[] | undefined,
  scenario: string | string[] | undefined,
): PartnerRouteState {
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
