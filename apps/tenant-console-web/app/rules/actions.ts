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
): number | undefined {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer.`);
  }

  return parsed;
}

function readOptionalIsoTimestamp(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(rawValue);
  if (!hasExplicitTimezone) {
    throw new Error(`${key} must include an explicit timezone offset or Z.`);
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} must be a valid ISO 8601 timestamp.`);
  }

  return parsed.toISOString();
}

function readJsonField<T>(formData: FormData, key: string): T {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    throw new Error(`${key} is required.`);
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    throw new Error(`${key} must be valid JSON.`);
  }
}

function assertApprovalAction(value: string): TenantApprovalRuleAction {
  if (
    !TENANT_APPROVAL_RULE_ACTIONS.includes(value as TenantApprovalRuleAction)
  ) {
    throw new Error(`Unsupported approval-rule action: ${value}`);
  }

  return value as TenantApprovalRuleAction;
}

function assertApprovalMode(value: string): TenantApprovalMode {
  if (!TENANT_APPROVAL_MODES.includes(value as TenantApprovalMode)) {
    throw new Error(`Unsupported approval mode: ${value}`);
  }

  return value as TenantApprovalMode;
}

function assertConditionField(value: string): TenantApprovalRuleConditionField {
  if (
    !TENANT_APPROVAL_RULE_CONDITION_FIELDS.includes(
      value as TenantApprovalRuleConditionField,
    )
  ) {
    throw new Error(`Unsupported condition field: ${value}`);
  }

  return value as TenantApprovalRuleConditionField;
}

function assertConditionOperator(
  value: string,
): TenantApprovalRuleConditionOperator {
  if (
    !TENANT_APPROVAL_RULE_CONDITION_OPERATORS.includes(
      value as TenantApprovalRuleConditionOperator,
    )
  ) {
    throw new Error(`Unsupported condition operator: ${value}`);
  }

  return value as TenantApprovalRuleConditionOperator;
}

function assertPrincipalKind(value: string): TenantPrincipalRef["kind"] {
  if (!TENANT_PRINCIPAL_KINDS.includes(value as TenantPrincipalRef["kind"])) {
    throw new Error(`Unsupported approver kind: ${value}`);
  }

  return value as TenantPrincipalRef["kind"];
}

function assertFallbackPolicy(value: string): TenantApprovalFallbackPolicy {
  if (
    !TENANT_APPROVAL_FALLBACK_POLICIES.includes(
      value as TenantApprovalFallbackPolicy,
    )
  ) {
    throw new Error(`Unsupported fallback policy: ${value}`);
  }

  return value as TenantApprovalFallbackPolicy;
}

function assertQuotaEnforcementMode(value: string): TenantQuotaEnforcementMode {
  if (
    !TENANT_QUOTA_ENFORCEMENT_MODES.includes(
      value as TenantQuotaEnforcementMode,
    )
  ) {
    throw new Error(`Unsupported quota enforcement mode: ${value}`);
  }

  return value as TenantQuotaEnforcementMode;
}

function parseConditionValue(item: EditableConditionPayload) {
  const rawValue = item.valueText?.trim() ?? "";
  const valueKind = item.valueKind ?? "text";

  if (item.operator === "exists") {
    return rawValue.length > 0 ? rawValue === "true" : true;
  }

  if (rawValue.length === 0) {
    throw new Error("Condition values cannot be empty.");
  }

  switch (valueKind) {
    case "number": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Condition numeric value is invalid: ${rawValue}`);
      }
      return parsed;
    }
    case "boolean":
      if (rawValue !== "true" && rawValue !== "false") {
        throw new Error(`Condition boolean value must be true or false.`);
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

function readConditions(formData: FormData): TenantApprovalRuleCondition[] {
  const items = readJsonField<EditableConditionPayload[]>(
    formData,
    "conditionsJson",
  );

  const conditions: TenantApprovalRuleCondition[] = [];
  for (const item of items) {
    if (!item.field || !item.operator) {
      continue;
    }

    conditions.push({
      field: assertConditionField(item.field),
      op: assertConditionOperator(item.operator),
      value: parseConditionValue(item),
    });
  }

  if (conditions.length === 0) {
    throw new Error("At least one approval-rule condition is required.");
  }

  return conditions;
}

function readApprovers(formData: FormData): TenantPrincipalRef[] {
  const items = readJsonField<EditableApproverPayload[]>(
    formData,
    "approversJson",
  );

  return items
    .map((item) => {
      if (!item.kind) {
        return null;
      }

      const approver: TenantPrincipalRef = {
        kind: assertPrincipalKind(item.kind),
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

function buildUpsertRuleCommand(formData: FormData): {
  command: UpsertTenantApprovalRuleCommand;
  ruleId: string | undefined;
} {
  const ruleId = readTrimmedString(formData, "ruleId");
  const ruleName = readTrimmedString(formData, "ruleName");
  const priority = readOptionalInteger(formData, "priority");
  const actionValue = readTrimmedString(formData, "action");

  if (!ruleName) {
    throw new Error("Rule name is required.");
  }

  if (priority === undefined) {
    throw new Error("Priority is required.");
  }

  if (!actionValue) {
    throw new Error("Rule action is required.");
  }

  const action = assertApprovalAction(actionValue);
  const approvers = readApprovers(formData);
  const approvalModeValue = readTrimmedString(formData, "approvalMode");
  const fallbackPolicyValue = readTrimmedString(formData, "fallbackPolicy");
  const activeFlag = formData.get("activeFlag") === "on";
  const timeoutHoursOverride = readOptionalInteger(
    formData,
    "timeoutHoursOverride",
  );
  const effectiveFrom = readOptionalIsoTimestamp(formData, "effectiveFrom");
  const effectiveUntil = readOptionalIsoTimestamp(formData, "effectiveUntil");

  if (action === "require_approval" && approvers.length === 0) {
    throw new Error("Approval rules require at least one approver descriptor.");
  }

  const command: UpsertTenantApprovalRuleCommand = {
    ...(ruleId ? { ruleId } : {}),
    ruleName,
    priority,
    description: readTrimmedString(formData, "description") ?? null,
    activeFlag,
    conditions: readConditions(formData),
    action,
    effectiveFrom: effectiveFrom ?? null,
    effectiveUntil: effectiveUntil ?? null,
    timeoutHoursOverride: timeoutHoursOverride ?? null,
    fallbackPolicyOverride: fallbackPolicyValue
      ? assertFallbackPolicy(fallbackPolicyValue)
      : null,
    disabledReason: readTrimmedString(formData, "disabledReason") ?? null,
  };

  if (action === "require_approval") {
    command.approvalMode = approvalModeValue
      ? assertApprovalMode(approvalModeValue)
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
  let payload: RulesFlashPayload;

  try {
    const { command, ruleId } = buildUpsertRuleCommand(formData);
    const saved = await getTenantClient().upsertApprovalRule(command, ruleId);

    payload = {
      tone: "default",
      title: ruleId ? "Rule updated" : "Rule created",
      description: `${saved.ruleName ?? saved.name ?? saved.ruleId} is now persisted on the tenant approval-rule surface.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Rule could not be saved",
      description:
        error instanceof Error
          ? error.message
          : "Unable to save tenant approval rule.",
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function disableApprovalRuleAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  let payload: RulesFlashPayload;

  try {
    const ruleId = readTrimmedString(formData, "ruleId");
    const ruleName = readTrimmedString(formData, "ruleName");
    const disabledReason = readTrimmedString(formData, "disabledReason");

    if (!ruleId) {
      throw new Error("Select a rule before disabling it.");
    }
    if (!disabledReason) {
      throw new Error(
        "disabledReason is required before a rule can be paused.",
      );
    }

    await getTenantClient().disableApprovalRule(ruleId);
    payload = {
      tone: "default",
      title: "Rule disabled",
      description: `${ruleName ?? ruleId} is now paused and will no longer participate in future evaluations. Reason: ${disabledReason}.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Rule could not be disabled",
      description:
        error instanceof Error
          ? error.message
          : "Unable to disable tenant approval rule.",
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function reorderApprovalRulesAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  let payload: RulesFlashPayload;

  try {
    const orderedRuleIds = readJsonField<string[]>(formData, "orderedRuleIds");
    if (orderedRuleIds.length === 0) {
      throw new Error("A full ordered rule-id list is required.");
    }

    await getTenantClient().reorderApprovalRules({
      orderedRuleIds,
    });

    payload = {
      tone: "default",
      title: "Rule order updated",
      description:
        "Priority order was normalized through the published tenant reorder command.",
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Rule order could not be updated",
      description:
        error instanceof Error
          ? error.message
          : "Unable to reorder tenant approval rules.",
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function upsertTenantQuotaPolicyAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  let payload: RulesFlashPayload;

  try {
    const currency = readTrimmedString(formData, "currency");
    const enforcementMode = readTrimmedString(formData, "enforcementMode");

    if (!currency) {
      throw new Error("Quota currency is required.");
    }

    if (!enforcementMode) {
      throw new Error("Quota enforcement mode is required.");
    }

    const command: UpsertTenantQuotaPolicyCommand = {
      period: "monthly",
      limit: {
        bookingCountLimit:
          readOptionalInteger(formData, "bookingCountLimit") ?? null,
        amountMinorLimit:
          readOptionalInteger(formData, "amountMinorLimit") ?? null,
        currency: currency.toUpperCase(),
        enforcementMode: assertQuotaEnforcementMode(enforcementMode),
      },
    };

    const saved = await getTenantClient().upsertTenantQuotaPolicy(command);
    payload = {
      tone: "default",
      title: "Quota policy updated",
      description: `Monthly tenant quota now enforces ${saved.limit.enforcementMode} with ${saved.limit.currency} limits.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Quota policy could not be updated",
      description:
        error instanceof Error
          ? error.message
          : "Unable to update tenant quota policy.",
    };
  }

  revalidatePath("/rules");
  return payload;
}

export async function previewAndEvaluateApprovalRulesAction(
  formData: FormData,
): Promise<RulesFlashPayload> {
  try {
    const reservationWindowStart = readOptionalIsoTimestamp(
      formData,
      "reservationWindowStart",
    );

    if (!reservationWindowStart) {
      throw new Error(
        "Dry-run evaluation requires reservationWindowStart with timezone.",
      );
    }

    const amountMinor = readOptionalInteger(formData, "amountMinor") ?? null;
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
      title: "Dry-run completed",
      description: `Decision: ${evaluation.outcome?.decision ?? "unknown"} · matched ${evaluation.matchedRules.length} rule(s) · quota trigger ${preview.combinedTriggered}.`,
      evaluation: {
        ...evaluation,
        quotaImpacts: evaluation.quotaImpacts ?? preview.impacts,
      },
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "Dry-run could not be evaluated",
      description:
        error instanceof Error
          ? error.message
          : "Unable to dry-run tenant approval rules.",
    };
  }
}
