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
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
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
    throw new Error(`${key} 必須是整數。`);
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
    throw new Error(`${key} 必須包含時區偏移量或 UTC 結尾標記。`);
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} 必須是有效的 ISO 8601 時間格式。`);
  }

  return parsed.toISOString();
}

function readJsonField<T>(formData: FormData, key: string): T {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    throw new Error(`${key} 為必填欄位。`);
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    throw new Error(`${key} 必須是有效的 JSON 格式。`);
  }
}

function assertApprovalAction(value: string): TenantApprovalRuleAction {
  if (
    !TENANT_APPROVAL_RULE_ACTIONS.includes(value as TenantApprovalRuleAction)
  ) {
    throw new Error(`不支援的審批規則動作：${value}`);
  }

  return value as TenantApprovalRuleAction;
}

function assertApprovalMode(value: string): TenantApprovalMode {
  if (!TENANT_APPROVAL_MODES.includes(value as TenantApprovalMode)) {
    throw new Error(`不支援的審批模式：${value}`);
  }

  return value as TenantApprovalMode;
}

function assertConditionField(value: string): TenantApprovalRuleConditionField {
  if (
    !TENANT_APPROVAL_RULE_CONDITION_FIELDS.includes(
      value as TenantApprovalRuleConditionField,
    )
  ) {
    throw new Error(`不支援的條件欄位：${value}`);
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
    throw new Error(`不支援的條件運算子：${value}`);
  }

  return value as TenantApprovalRuleConditionOperator;
}

function assertPrincipalKind(value: string): TenantPrincipalRef["kind"] {
  if (!TENANT_PRINCIPAL_KINDS.includes(value as TenantPrincipalRef["kind"])) {
    throw new Error(`不支援的審批人類型：${value}`);
  }

  return value as TenantPrincipalRef["kind"];
}

function assertFallbackPolicy(value: string): TenantApprovalFallbackPolicy {
  if (
    !TENANT_APPROVAL_FALLBACK_POLICIES.includes(
      value as TenantApprovalFallbackPolicy,
    )
  ) {
    throw new Error(`不支援的 fallback 策略：${value}`);
  }

  return value as TenantApprovalFallbackPolicy;
}

function assertQuotaEnforcementMode(value: string): TenantQuotaEnforcementMode {
  if (
    !TENANT_QUOTA_ENFORCEMENT_MODES.includes(
      value as TenantQuotaEnforcementMode,
    )
  ) {
    throw new Error(`不支援的配額管制模式：${value}`);
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
    throw new Error("條件值不可為空。");
  }

  switch (valueKind) {
    case "number": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`條件數值格式不正確：${rawValue}`);
      }
      return parsed;
    }
    case "boolean":
      if (rawValue !== "true" && rawValue !== "false") {
        throw new Error("布林條件值必須為布林型別。");
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
    throw new Error("至少需要一個審批規則條件。");
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
    throw new Error("規則名稱為必填。");
  }

  if (priority === undefined) {
    throw new Error("優先順序為必填。");
  }

  if (!actionValue) {
    throw new Error("規則動作為必填。");
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
    throw new Error("需審批規則至少要有一位審批人。");
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
      title: ruleId ? "規則已更新" : "規則已建立",
      description: `規則「${saved.ruleName ?? saved.name ?? saved.ruleId}」已儲存到租戶審批規則。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "無法儲存規則",
      description: formatTenantUiError(
        toTenantErrorMessage(error, "無法儲存租戶審批規則。"),
        "規則儲存失敗",
      ),
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
      throw new Error("請先選擇要停用的規則。");
    }
    if (!disabledReason) {
      throw new Error("停用規則前必須填寫停用原因。");
    }

    await getTenantClient().disableApprovalRule(ruleId);
    payload = {
      tone: "default",
      title: "規則已停用",
      description: `規則「${ruleName ?? ruleId}」已暫停，不會再參與後續評估。原因：${disabledReason}。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "無法停用規則",
      description: formatTenantUiError(
        toTenantErrorMessage(error, "無法停用租戶審批規則。"),
        "規則停用失敗",
      ),
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
      throw new Error("必須提供完整的規則排序清單。");
    }

    await getTenantClient().reorderApprovalRules({
      orderedRuleIds,
    });

    payload = {
      tone: "default",
      title: "規則順序已更新",
      description: "優先順序已透過正式的租戶排序指令重新整理。",
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "無法更新規則順序",
      description: formatTenantUiError(
        toTenantErrorMessage(error, "無法重新排序租戶審批規則。"),
        "規則排序更新失敗",
      ),
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
      throw new Error("配額幣別為必填。");
    }

    if (!enforcementMode) {
      throw new Error("配額管制模式為必填。");
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
      title: "配額政策已更新",
      description: `每月租戶配額已改為「${formatTenantCodeLabel(saved.limit.enforcementMode)}」，幣別為 ${saved.limit.currency}。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "無法更新配額政策",
      description: formatTenantUiError(
        toTenantErrorMessage(error, "無法更新租戶配額政策。"),
        "配額政策更新失敗",
      ),
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
      throw new Error("試跑評估必須提供含時區的預約起始時間。");
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
      title: "試跑評估完成",
      description: `結果：${formatTenantCodeLabel(evaluation.outcome?.decision ?? "unknown")} · 命中 ${evaluation.matchedRules.length} 條規則 · 配額觸發：${formatTenantCodeLabel(preview.combinedTriggered)}。`,
      evaluation: {
        ...evaluation,
        quotaImpacts: evaluation.quotaImpacts ?? preview.impacts,
      },
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "無法完成試跑評估",
      description: formatTenantUiError(
        toTenantErrorMessage(error, "無法試跑租戶審批規則。"),
        "試跑評估失敗",
      ),
    };
  }
}
