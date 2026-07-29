import {
  CANVAS_REALM_DARK,
  CANVAS_REALM_LIGHT,
  CANVAS_SURFACE_ACCENTS,
} from "@drts/ui-web/canvas-tokens";
import { t, type Locale } from "./translations";

export type DispatchQueueMode =
  | "virtual_matching"
  | "physical_rank"
  | "taxi_stand";
export type RuntimeProfileCode =
  | "ordinary_taxi"
  | "multi_taxi_direct"
  | "business_dispatch";

export type QueueSemanticsInfo = {
  queueMode: DispatchQueueMode | null;
  queueModeText: string;
  serviceTypeText: string;
  matchingModeText: string;
  siteDisplay: string;
  isSiteBlank: boolean;
  isMultiTaxi: boolean;
  isStatutoryRefusal: boolean;
  refusalCopy: string | null;
};

/**
 * Resolves the queue semantics for an order based on doc08 §7 / §4.2:
 * 1. queue mode as text (never color-only).
 * 2. siteId blank not masquerading as virtual.
 * 3. denial copy per doc08 §7.3 (no raw reason code primary).
 * 4. no override/force-checkin control for statutory refusal state.
 */
export function resolveQueueSemantics(
  order: any,
  locale: Locale,
): QueueSemanticsInfo {
  const serviceBucketStr = String(order?.serviceBucket ?? "");
  const runtimeProfileCode = (order?.runtimeProfileCode ??
    (serviceBucketStr === "multi_taxi_direct"
      ? "multi_taxi_direct"
      : null)) as RuntimeProfileCode | null;
  const isMultiTaxi =
    runtimeProfileCode === "multi_taxi_direct" ||
    serviceBucketStr === "multi_taxi_direct";

  const rawQueueMode = (order?.queueMode ??
    (isMultiTaxi ? "virtual_matching" : null)) as DispatchQueueMode | null;

  const siteId =
    (order?.siteId as string | undefined) ??
    (order?.taxiStandId as string | undefined) ??
    (order?.physicalRankId as string | undefined) ??
    null;
  const isSiteBlank = !siteId || typeof siteId !== "string" || !siteId.trim();

  // 1. queueModeText - always human readable text, never color-only
  let queueModeText = t("common.notAvailable", locale);
  if (rawQueueMode === "virtual_matching") {
    queueModeText = t("dispatch.queue.virtualMatchingText", locale);
  } else if (rawQueueMode === "physical_rank") {
    queueModeText = t("dispatch.queue.physicalRankText", locale);
  } else if (rawQueueMode === "taxi_stand") {
    queueModeText = t("dispatch.queue.taxiStandText", locale);
  } else if (isMultiTaxi) {
    queueModeText = t("dispatch.queue.virtualMatchingText", locale);
  }

  // 2. siteId blank not masquerading as virtual
  // If siteId is blank, display "未指定站點" (unassigned site), but do NOT masquerade physical_rank/taxi_stand as virtual.
  const siteDisplay = isSiteBlank
    ? t("dispatch.queue.unassignedSite", locale)
    : siteId.trim();

  // 3. Multi-taxi statutory refusal state check (physical_rank or taxi_stand or street_hail attempt on multi_taxi_direct)
  const failureReason = String(
    order?.lastDispatchFailureReason ?? order?.queueEntryReason ?? "",
  );
  const isStatutoryRefusal =
    isMultiTaxi &&
    (rawQueueMode === "physical_rank" ||
      rawQueueMode === "taxi_stand" ||
      order?.acquisitionMode === "street_hail" ||
      order?.acquisitionMode === "physical_rank" ||
      failureReason.includes("QUEUE_MODE_NOT_ALLOWED") ||
      failureReason.includes("PROFILE_QUEUE_POLICY_VIOLATION") ||
      failureReason.includes("physical_rank") ||
      failureReason.includes("taxi_stand"));

  const refusalCopy = isStatutoryRefusal
    ? t("dispatch.denial.multiTaxiRefusalCopy", locale)
    : null;

  const serviceTypeText = isMultiTaxi
    ? t("dispatch.queue.multiTaxiDirectService", locale)
    : runtimeProfileCode
      ? t(`opsCode.${runtimeProfileCode.toLowerCase()}`, locale)
      : t("common.notAvailable", locale);

  const matchingModeText = isMultiTaxi
    ? t("dispatch.queue.platformReservedAcquisition", locale)
    : queueModeText;

  return {
    queueMode: rawQueueMode,
    queueModeText,
    serviceTypeText,
    matchingModeText,
    siteDisplay,
    isSiteBlank,
    isMultiTaxi,
    isStatutoryRefusal,
    refusalCopy,
  };
}

/**
 * Returns coral / ops realm styling tokens from @drts/ui-web / @drts/ui-tokens
 */
export function getOpsCoralRealmTokens(dark = true) {
  return {
    realm: dark ? CANVAS_REALM_DARK.ops : CANVAS_REALM_LIGHT.ops,
    accent: CANVAS_SURFACE_ACCENTS.ops[dark ? "dark" : "light"],
  };
}

/**
 * Checks if an action descriptor or action name represents an override, fare-override, or force-checkin action
 * that must be forbidden during multi-taxi statutory refusal state (doc08 §7.3).
 * Canonical & legacy actions:
 * - request_exception_override / request_override / request_fare_override
 * - approve_exception_override / approve_override
 * - reject_exception_override / reject_override
 * - manual_fare_override / fare_override
 * - force_checkin / force_checkin_rank / force_check_in
 */
export function isForbiddenStatutoryOverrideAction(action: string): boolean {
  if (!action || typeof action !== "string") {
    return false;
  }
  const normalized = action.toLowerCase().trim();
  return (
    normalized.includes("override") ||
    normalized.includes("force_checkin") ||
    normalized.includes("force_check_in") ||
    normalized.includes("manual_fare") ||
    normalized.includes("approval_request") ||
    normalized.includes("jump_approval")
  );
}
