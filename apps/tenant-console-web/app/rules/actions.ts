"use server";

import { revalidatePath } from "next/cache";
import {
  TENANT_APPROVAL_MODES,
  TENANT_APPROVAL_RULE_ACTIONS,
  TENANT_APPROVAL_RULE_CONDITION_FIELDS,
  TENANT_APPROVAL_RULE_CONDITION_OPERATORS,
  TENANT_PRINCIPAL_KINDS,
  type TenantApprovalFallbackPolicy,
  type TenantApprovalRuleAction,
  type TenantApprovalRuleCondition,
  type TenantApprovalRuleConditionField,
  type TenantApprovalRuleConditionOperator,
  type TenantApprovalMode,
  type TenantPrincipalRef,
  type TenantQuotaEnforcementMode,
  type UpsertTenantApprovalRuleCommand,
  type UpsertTenantQuotaPolicyCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { RulesFlashPayload } from "./constants";

type EditableConditionPayload = {
  field?: string;
  operator?: string;
  valueKind?: "text" | "number" | "boolean" | "list";
  valueText?: string;
};

type EditableApproverPayload = {
  kind?: string;
  userId?: string;
  roleCode?: string;
  costCenterCode?: string;
  displayName?: string;
};

const TENANT_APPROVAL_FALLBACK_POLICIES: readonly TenantApprovalFallbackPolicy[] =
  ["auto_reject", "escalate_to_tenant_admin", "manual_ops_review"] as const;

const TENANT_QUOTA_ENFORCEMENT_MODES: readonly TenantQuotaEnforcementMode[] = [
  "warn_only",
  "require_approval",
  "hard_block",
] as const;

type RulesTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function readTrimmedString(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function readOptionalInteger(
  formData: FormData,
  key: string,
  translate: RulesTranslator,
): number | undefined {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      translate("rules.action.error.integerRequired", {
        field: key,
      }),
    );
  }

  return parsed;
}

function readOptionalIsoTimestamp(
  formData: FormData,
  key: string,
  translate: RulesTranslator,
): string | undefined {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(rawValue);
  if (!hasExplicitTimezone) {
    throw new Error(
      translate("rules.action.error.timestampTimezoneRequired", {
        field: key,
      }),
    );
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      translate("rules.action.error.timestampInvalid", {
        field: key,
      }),
    );
  }

  return parsed.toISOString();
}

function readJsonField<T>(
  formData: FormData,
  key: string,
  translate: RulesTranslator,
): T {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    throw new Error(
      translate("rules.action.error.requiredField", {
        field: key,
      }),
    );
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    throw new Error(
      translate("rules.action.error.jsonInvalid", {
        field: key,
      }),
    );
  }
}

function assertApprovalAction(
  value: string,
  translate: RulesTranslator,
): TenantApprovalRuleAction {
  if (
    !TENANT_APPROVAL_RULE_ACTIONS.includes(value as TenantApprovalRuleAction)
  ) {
    throw new Error(
      translate("rules.action.error.unsupportedApprovalAction", { value }),
    );
  }

  return value as TenantApprovalRuleAction;
}

function assertApprovalMode(
  value: string,
  translate: RulesTranslator,
): TenantApprovalMode {
  if (!TENANT_APPROVAL_MODES.includes(value as TenantApprovalMode)) {
    throw new Error(
      translate("rules.action.error.unsupportedApprovalMode", { value }),
    );
  }

  return value as TenantApprovalMode;
}

function assertConditionField(
  value: string,
  translate: RulesTranslator,
): TenantApprovalRuleConditionField {
  if (
    !TENANT_APPROVAL_RULE_CONDITION_FIELDS.includes(
      value as TenantApprovalRuleConditionField,
    )
  ) {
    throw new Error(
      translate("rules.action.error.unsupportedConditionField", { value }),
    );
  }

  return value as TenantApprovalRuleConditionField;
}

function assertConditionOperator(
  value: string,
  translate: RulesTranslator,
): TenantApprovalRuleConditionOperator {
  if (
    !TENANT_APPROVAL_RULE_CONDITION_OPERATORS.includes(
      value as TenantApprovalRuleConditionOperator,
    )
  ) {
    throw new Error(
      translate("rules.action.error.unsupportedConditionOperator", { value }),
    );
  }

  return value as TenantApprovalRuleConditionOperator;
}

function assertPrincipalKind(
  value: string,
  translate: RulesTranslator,
): TenantPrincipalRef["kind"] {
  if (!TENANT_PRINCIPAL_KINDS.includes(value as TenantPrincipalRef["kind"])) {
    throw new Error(
      translate("rules.action.error.unsupportedApproverKind", { value }),
    );
  }

  return value as TenantPrincipalRef["kind"];
}

function assertFallbackPolicy(
  value: string,
  translate: RulesTranslator,
): TenantApprovalFallbackPolicy {
  if (
    !TENANT_APPROVAL_FALLBACK_POLICIES.includes(
      value as TenantApprovalFallbackPolicy,
    )
  ) {
    throw new Error(
      translate("rules.action.error.unsupportedFallbackPolicy", { value }),
    );
  }

  return value as TenantApprovalFallbackPolicy;
}

function assertQuotaEnforcementMode(
  value: string,
  translate: RulesTranslator,
): TenantQuotaEnforcementMode {
  if (
    !TENANT_QUOTA_ENFORCEMENT_MODES.includes(
      value as TenantQuotaEnforcementMode,
    )
  ) {
    throw new Error(
      translate("rules.action.error.unsupportedQuotaEnforcementMode", {
        value,
      }),
    );
  }

  return value as TenantQuotaEnforcementMode;
}

function parseConditionValue(
  item: EditableConditionPayload,
  translate: RulesTranslator,
) {
  const rawValue = item.valueText?.trim() ?? "";
  const valueKind = item.valueKind ?? "text";

  if (item.operator === "exists") {
    return rawValue.length > 0 ? rawValue === "true" : true;
  }

  if (rawValue.length === 0) {
    throw new Error(translate("rules.action.error.conditionValueRequired"));
  }

  switch (valueKind) {
    case "number": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(
          translate("rules.action.error.conditionNumberInvalid", {
            value: rawValue,
          }),
        );
      }
      return parsed;
    }
    case "boolean":
      if (rawValue !== "true" && rawValue !== "false") {
        throw new Error(translate("rules.action.error.conditionBooleanInvalid"));
      }
      return rawValue === "true";
    case "list":
      return rawValue
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    default:
      return rawValue;
  }
}

function readConditions(
  formData: FormData,
  translate: RulesTranslator,
): TenantApprovalRuleCondition[] {
  const items = readJsonField<EditableConditionPayload[]>(
    formData,
    "conditionsJson",
    translate,
  );

  const conditions: TenantApprovalRuleCondition[] = [];
  for (const item of items) {
    if (!item.field || !item.operator) {
      continue;
    }

    conditions.push({
      field: assertConditionField(item.field, translate),
      op: assertConditionOperator(item.operator, translate),
      value: parseConditionValue(item, translate),
    });
  }

  if (conditions.length === 0) {
    throw new Error(translate("rules.action.error.conditionRequired"));
  }

  return conditions;
}

function readApprovers(
  formData: FormData,
  translate: RulesTranslator,
): TenantPrincipalRef[] {
  const items = readJsonField<EditableApproverPayload[]>(
    formData,
    "approversJson",
    translate,
  );

  return items
    .map((item) => {
      if (!item.kind) {
        return null;
      }

      const approver: TenantPrincipalRef = {
        kind: assertPrincipalKind(item.kind, translate),
      };

      if (item.userId?.trim()) {
        approver.userId = item.userId.trim();
      }
      if (item.roleCode?.trim()) {
        approver.roleCode = item.roleCode.trim();
      }
      if (item.costCenterCode?.trim()) {
        approver.costCenterCode = item.costCenterCode.trim();
      }
      if (item.displayName?.trim()) {
        approver.displayName = item.displayName.trim();
      }

      return approver;
    })
    .filter((item): item is TenantPrincipalRef => item !== null);
}

function buildUpsertRuleCommandWithTranslator(
  formData: FormData,
  translate: RulesTranslator,
): {
  command: UpsertTenantApprovalRuleCommand;
  ruleId: string | undefined;
} {
  const ruleId = readTrimmedString(formData, "ruleId");
  const ruleName = readTrimmedString(formData, "ruleName");
  const priority = readOptionalInteger(formData, "priority", translate);
  const actionValue = readTrimmedString(formData, "action");

  if (!ruleName) {
    throw new Error(translate("rules.action.error.ruleNameRequired"));
  }

  if (priority === undefined) {
    throw new Error(translate("rules.action.error.priorityRequired"));
  }

  if (!actionValue) {
    throw new Error(translate("rules.action.error.ruleActionRequired"));
  }

  const action = assertApprovalAction(actionValue, translate);
  const approvers = readApprovers(formData, translate);
  const approvalModeValue = readTrimmedString(formData, "approvalMode");
  const fallbackPolicyValue = readTrimmedString(formData, "fallbackPolicy");
  const activeFlag = formData.get("activeFlag") === "on";
  const timeoutHoursOverride = readOptionalInteger(
    formData,
    "timeoutHoursOverride",
    translate,
  );
  const effectiveFrom = readOptionalIsoTimestamp(
    formData,
    "effectiveFrom",
    translate,
  );
  const effectiveUntil = readOptionalIsoTimestamp(
    formData,
    "effectiveUntil",
    translate,
  );

  if (action === "require_approval" && approvers.length === 0) {
    throw new Error(translate("rules.action.error.approverRequired"));
  }

  const command: UpsertTenantApprovalRuleCommand = {
    ...(ruleId ? { ruleId } : {}),
    ruleName,
    priority,
    description: readTrimmedString(formData, "description") ?? null,
    activeFlag,
    conditions: readConditions(formData, translate),
    action,
    effectiveFrom: effectiveFrom ?? null,
    effectiveUntil: effectiveUntil ?? null,
    timeoutHoursOverride: timeoutHoursOverride ?? null,
    fallbackPolicyOverride: fallbackPolicyValue
      ? assertFallbackPolicy(fallbackPolicyValue, translate)
      : null,
    disabledReason: readTrimmedString(formData, "disabledReason") ?? null,
  };

  if (action === "require_approval") {
    command.approvalMode = approvalModeValue
      ? assertApprovalMode(approvalModeValue, translate)
      : "any_of";
    command.approvers = approvers;
  } else {
    command.approvalMode = null;
    command.approvers = [];
  }

  return { command, ruleId };
}

export async function upsertApprovalRuleAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  const locale = await getServerLocale();
  const translate: RulesTranslator = (key, params) => t(key, locale, params);
  let payload: RulesFlashPayload;

  try {
    const { command, ruleId } = buildUpsertRuleCommandWithTranslator(
      formData,
      translate,
    );
    const saved = await getTenantClient().upsertApprovalRule(command, ruleId);

    payload = {
      tone: "default",
      title: translate(
        ruleId
          ? "rules.action.success.ruleUpdatedTitle"
          : "rules.action.success.ruleCreatedTitle",
      ),
      description: translate("rules.action.success.ruleSavedDescription", {
        name: saved.ruleName ?? saved.name ?? saved.ruleId,
      }),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("rules.action.error.ruleSaveTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("rules.action.error.ruleSaveDescription"),
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function disableApprovalRuleAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  const locale = await getServerLocale();
  const translate: RulesTranslator = (key, params) => t(key, locale, params);
  let payload: RulesFlashPayload;

  try {
    const ruleId = readTrimmedString(formData, "ruleId");
    const ruleName = readTrimmedString(formData, "ruleName");
    const disabledReason = readTrimmedString(formData, "disabledReason");

    if (!ruleId) {
      throw new Error(translate("rules.action.error.ruleSelectionRequired"));
    }
    if (!disabledReason) {
      throw new Error(translate("rules.action.error.disabledReasonRequired"));
    }

    await getTenantClient().disableApprovalRule(ruleId);
    payload = {
      tone: "default",
      title: translate("rules.action.success.ruleDisabledTitle"),
      description: translate("rules.action.success.ruleDisabledDescription", {
        name: ruleName ?? ruleId,
        reason: disabledReason,
      }),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("rules.action.error.ruleDisableTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("rules.action.error.ruleDisableDescription"),
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function reorderApprovalRulesAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  const locale = await getServerLocale();
  const translate: RulesTranslator = (key, params) => t(key, locale, params);
  let payload: RulesFlashPayload;

  try {
    const orderedRuleIds = readJsonField<string[]>(
      formData,
      "orderedRuleIds",
      translate,
    );
    if (orderedRuleIds.length === 0) {
      throw new Error(translate("rules.action.error.orderedRuleIdsRequired"));
    }

    await getTenantClient().reorderApprovalRules({
      orderedRuleIds,
    });

    payload = {
      tone: "default",
      title: translate("rules.action.success.ruleOrderUpdatedTitle"),
      description: translate("rules.action.success.ruleOrderUpdatedDescription"),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("rules.action.error.ruleOrderUpdateTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("rules.action.error.ruleOrderUpdateDescription"),
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function upsertTenantQuotaPolicyAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  const locale = await getServerLocale();
  const translate: RulesTranslator = (key, params) => t(key, locale, params);
  let payload: RulesFlashPayload;

  try {
    const currency = readTrimmedString(formData, "currency");
    const enforcementMode = readTrimmedString(formData, "enforcementMode");

    if (!currency) {
      throw new Error(translate("rules.action.error.quotaCurrencyRequired"));
    }

    if (!enforcementMode) {
      throw new Error(
        translate("rules.action.error.quotaEnforcementModeRequired"),
      );
    }

    const command: UpsertTenantQuotaPolicyCommand = {
      period: "monthly",
      limit: {
        bookingCountLimit:
          readOptionalInteger(formData, "bookingCountLimit", translate) ?? null,
        amountMinorLimit:
          readOptionalInteger(formData, "amountMinorLimit", translate) ?? null,
        currency: currency.toUpperCase(),
        enforcementMode: assertQuotaEnforcementMode(
          enforcementMode,
          translate,
        ),
      },
    };

    const saved = await getTenantClient().upsertTenantQuotaPolicy(command);
    payload = {
      tone: "default",
      title: translate("rules.action.success.quotaPolicyUpdatedTitle"),
      description: translate(
        "rules.action.success.quotaPolicyUpdatedDescription",
        {
          mode: translate(`rules.enum.enforcementMode.${saved.limit.enforcementMode}`),
          currency: saved.limit.currency,
        },
      ),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("rules.action.error.quotaPolicyUpdateTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("rules.action.error.quotaPolicyUpdateDescription"),
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function previewAndEvaluateApprovalRulesAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  const locale = await getServerLocale();
  const translate: RulesTranslator = (key, params) => t(key, locale, params);
  try {
    const reservationWindowStart = readOptionalIsoTimestamp(
      formData,
      "reservationWindowStart",
      translate,
    );

    if (!reservationWindowStart) {
      throw new Error(translate("rules.action.error.dryRunStartRequired"));
    }

    const amountMinor =
      readOptionalInteger(formData, "amountMinor", translate) ?? null;
    const costCenterCode = readTrimmedString(formData, "costCenterCode");
    const currency = readTrimmedString(formData, "currency") ?? "TWD";
    const client = getTenantClient();

    const preview = await client.previewTenantBookingQuotaImpact({
      reservationWindowStart,
      ...(amountMinor == null ? {} : { amountMinor }),
      ...(costCenterCode ? { costCenterCode } : {}),
      ...(currency ? { currency } : {}),
    });

    const evaluation = await client.evaluateApprovalRules({
      subject: {
        subjectType: "booking",
        bookingId: null,
        draftId: null,
        operation: "dry_run",
      },
      inputSnapshot: {
        costCenterCode: costCenterCode ?? null,
        businessDispatchSubtype:
          readTrimmedString(formData, "businessDispatchSubtype") ?? null,
        reservationWindowStart,
        passengerId: readTrimmedString(formData, "passengerId") ?? null,
        passengerRole: readTrimmedString(formData, "passengerRole") ?? null,
        amountMinor,
        currency,
        vehiclePreference:
          readTrimmedString(formData, "vehiclePreference") ?? null,
        direction: readTrimmedString(formData, "direction") ?? null,
        flightNoPresent: readTrimmedString(formData, "flightNoPresent")
          ? readTrimmedString(formData, "flightNoPresent") === "true"
          : null,
        flightNo: readTrimmedString(formData, "flightNo") ?? null,
      },
      quotaImpacts: preview.impacts,
    });

    return {
      tone: "default",
      title: translate("rules.action.success.dryRunCompletedTitle"),
      description: translate("rules.action.success.dryRunCompletedDescription", {
        decision: translate(
          `rules.enum.decision.${evaluation.outcome?.decision ?? "unknown"}`,
        ),
        count: evaluation.matchedRules.length,
        trigger: translate(
          `rules.enum.quotaTrigger.${preview.combinedTriggered}`,
        ),
      }),
      evaluation: {
        ...evaluation,
        quotaImpacts: evaluation.quotaImpacts ?? preview.impacts,
      },
    };
  } catch (error) {
    return {
      tone: "warning",
      title: translate("rules.action.error.dryRunTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("rules.action.error.dryRunDescription"),
    };
  }
}
