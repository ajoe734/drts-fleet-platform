/**
 * Pure decision logic behind the Fleet & compliance governance screen.
 *
 * These rules used to live inline in `page.tsx`, a client component with no
 * seam a test could reach, which is why a rejected row action blanking the
 * whole table and a dead cross-app deep link both shipped unnoticed. Anything
 * here decides what the screen offers or says; `page.tsx` renders it.
 */

import { ApiClientError } from "@drts/api-client";
import type {
  CrossAppResourceLink,
  DriverRegistryRecord,
  EmptyReason,
  ResourceActionDescriptor,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import { t as translateKey, type Locale } from "@/lib/translations";

export type GovernedVehicleRecord = VehicleRegistryRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
    offboardingAvailableActions?: ResourceActionDescriptor[];
    opsLink?: CrossAppResourceLink | null;
  };

export type GovernedDriverRecord = DriverRegistryRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
    opsLink?: CrossAppResourceLink | null;
  };

export const SUPPORTED_ACTIONS = new Set([
  "refresh_tab",
  "create_driver",
  "create_contract",
  "update_vehicle_compliance",
  "hold_vehicle_dispatch",
  "release_vehicle_dispatch",
  "activate_driver",
  "suspend_driver",
  "retire_driver",
  "revoke_device_binding",
  "approve_exclusivity",
  "reject_exclusivity",
  "initiate_offboarding",
  "complete_debranding",
  "open_ops_vehicle",
  "open_ops_driver",
]);

/** Actions whose target lives in another deployment. */
export const OPS_LINK_ACTIONS = new Set([
  "open_ops_vehicle",
  "open_ops_driver",
]);

export function isSupportedAction(action: string) {
  return SUPPORTED_ACTIONS.has(action);
}

export function actionLabel(locale: string, action: string) {
  const en: Record<string, string> = {
    refresh_tab: "Refresh",
    create_driver: "Create driver",
    create_contract: "Create contract",
    update_vehicle_compliance: "Update compliance",
    hold_vehicle_dispatch: "Hold dispatch",
    release_vehicle_dispatch: "Release dispatch",
    open_ops_vehicle: "ops-console",
    activate_driver: "Activate",
    suspend_driver: "Suspend",
    retire_driver: "Retire",
    revoke_device_binding: "Revoke binding",
    approve_exclusivity: "Approve",
    reject_exclusivity: "Reject",
    initiate_offboarding: "Initiate",
    advance_offboarding_step: "Advance",
    complete_debranding: "Complete debranding",
    open_ops_driver: "ops-console",
  };
  const zh: Record<string, string> = {
    refresh_tab: "重新整理",
    create_driver: "新增司機",
    create_contract: "建立合約",
    update_vehicle_compliance: "更新合規",
    hold_vehicle_dispatch: "停止派遣",
    release_vehicle_dispatch: "恢復派遣",
    open_ops_vehicle: "營運主控台",
    activate_driver: "啟用",
    suspend_driver: "暫停",
    retire_driver: "退役",
    revoke_device_binding: "撤銷綁定",
    approve_exclusivity: "核准",
    reject_exclusivity: "退回",
    initiate_offboarding: "啟動退場",
    advance_offboarding_step: "推進",
    complete_debranding: "完成除標識",
    open_ops_driver: "營運主控台",
  };
  return (locale === "en" ? en : zh)[action] ?? action;
}

export function makeAction(
  action: string,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  enabled = true,
  requiresReason = false,
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    requiresReason,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

/**
 * Dispatch-hold affordance for a vehicle.
 *
 * `POST /vehicles/:id/compliance` rejects a release with 409
 * VEHICLE_NOT_DISPATCHABLE while any non-manual blocker stands, so a vehicle
 * whose contract, insurance or exclusivity is outstanding gets the button
 * disabled with that blocker as its reason rather than an affordance that can
 * only fail. The gate reads `supplyLifecycle.dispatch.blockedReasons` — the
 * backend's own evaluation — so it cannot drift from the rule it projects.
 *
 * The target flag is stated explicitly rather than toggling the row's current
 * value: rows are up to 30s stale, and a toggle sent against a stale snapshot
 * flips whichever way the row happened to be drawn.
 */
export function vehicleDispatchAction(
  vehicle: GovernedVehicleRecord,
): ResourceActionDescriptor {
  if (vehicle.dispatchableFlag) {
    return makeAction("hold_vehicle_dispatch", "medium");
  }
  const blockers = vehicle.supplyLifecycle.dispatch.blockedReasons.filter(
    (reason) => reason !== "manual_hold",
  );
  return makeAction(
    "release_vehicle_dispatch",
    "medium",
    blockers.length === 0,
    false,
    blockers[0],
  );
}

/** Target dispatchable flag for one of the three compliance action ids. */
export function dispatchFlagForAction(
  action: string,
  vehicle: GovernedVehicleRecord,
): boolean {
  if (action === "hold_vehicle_dispatch") {
    return false;
  }
  if (action === "release_vehicle_dispatch") {
    return true;
  }
  return !vehicle.dispatchableFlag;
}

/**
 * Absolute href for an Ops Console deep link, or null when this deployment has
 * no Ops Console origin. A bare route resolves against platform-admin's own
 * origin, which has no `/vehicles` or `/drivers` page, so null lets the caller
 * disable the affordance instead of opening a tab onto a 404.
 */
export function resolveCrossAppHref(
  link: CrossAppResourceLink | null | undefined,
  fallbackRoute: string,
  opsConsoleOrigin: string,
): string | null {
  const route = link?.route?.trim() || fallbackRoute;
  if (/^https?:\/\//i.test(route)) {
    return route;
  }
  return opsConsoleOrigin ? `${opsConsoleOrigin}${route}` : null;
}

/**
 * Why the active tab should render an empty state instead of its table.
 *
 * Only a *load* failure means the tab has nothing to show. An action failure
 * leaves the loaded rows valid, so it must not reach this decision — passing
 * one in is what replaced a full vehicle table with "failed to load" after a
 * single 409.
 */
export function resolveEmptyReason(input: {
  previewEmptyReason: EmptyReason | null;
  envelopeEmptyReason: EmptyReason | null;
  loadError: string | null;
  itemCount: number;
}): EmptyReason | null {
  if (input.previewEmptyReason) {
    return input.previewEmptyReason;
  }
  if (input.envelopeEmptyReason) {
    return input.envelopeEmptyReason;
  }
  if (input.loadError) {
    return "fetch_failed";
  }
  return input.itemCount === 0 ? "no_data" : null;
}

export type ActionFailure = {
  title: string;
  message: string;
  reasons: string[];
  traceId: string | null;
};

/**
 * Operator-facing copy for a failed action. `ApiClientError.message` is the
 * serialized error envelope — readable to an engineer, noise to the ops user
 * reading this screen — while the fields behind it carry the same information
 * in a form this page can localize.
 */
export function describeActionFailure(
  locale: Locale,
  actionName: string,
  error: unknown,
): ActionFailure {
  const title = translateKey("fleetUi.actionFailedTitle", locale, {
    action: actionName,
  });
  if (!(error instanceof ApiClientError)) {
    return {
      title,
      message: error instanceof Error ? error.message : String(error),
      reasons: [],
      traceId: null,
    };
  }

  const rawReasons = error.details?.blockedReasons;
  const reasons = Array.isArray(rawReasons)
    ? rawReasons.map((reason) =>
        formatPlatformCodeLabel(locale, String(reason)),
      )
    : [];

  return {
    title,
    message:
      error.code === "VEHICLE_NOT_DISPATCHABLE"
        ? translateKey("fleetUi.vehicleNotDispatchable", locale)
        : error.apiMessage || error.message,
    reasons,
    traceId: error.traceId ?? null,
  };
}
