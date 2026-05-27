"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  AuditLogRecord,
  DriverRegistryRecord,
  PlatformCode,
  PlatformPresenceStatus,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasIcon,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type DriverAvailableActionsProps = {
  driverId: string;
  workState: DriverRegistryRecord["workState"];
  actions: ResourceActionDescriptor[];
  platformCode?: PlatformCode;
  platformStatus?: PlatformPresenceStatus;
  statementPeriod?: string;
  compact?: boolean;
};

type ActionReceiptState = {
  action: string;
  auditId: string | null;
  requestId: string | null;
};

function getActionContractGap(action: string, locale: "en" | "zh") {
  if (action === "force_offline") {
    return locale === "zh"
      ? "依 spec 需提交 reasonCode / note / TTL，但目前 ops-console command contract 只接受 platformCode。"
      : "Spec requires reasonCode / note / TTL, but the current ops-console command contract only accepts platformCode.";
  }

  if (action === "suppress_matching") {
    return locale === "zh"
      ? "依 spec 需提交 suppression reason 與 TTL，但目前 ops-console command contract 只能切換 workState。"
      : "Spec requires a suppression reason and TTL, but the current ops-console command contract can only toggle workState.";
  }

  return null;
}

function formatReasonLabel(reason: string, locale: "en" | "zh") {
  const normalized = reason.replace(/_/g, " ");
  if (locale === "zh") {
    switch (reason) {
      case "sos_in_response":
        return "SOS 處理中，dispatch 類動作暫停";
      case "already_active":
        return "目前已經處於啟用狀態";
      case "platform_offline":
        return "平台目前已離線";
      case "platform_unbound":
        return "尚未綁定平台帳號";
      case "no_forwarded_task":
        return "目前沒有可標記的轉派任務";
      case "read_model_gap":
        return "目前 contract 尚未提供完整欄位";
      case "action_not_supported":
        return "目前 API 尚未支援此操作";
      case "missing_command_fields":
        return "現有 command contract 缺少 spec 要求欄位";
      default:
        return normalized;
    }
  }

  switch (reason) {
    case "sos_in_response":
      return "Dispatch-impacting actions are paused during SOS response";
    case "already_active":
      return "This action is already active";
    case "platform_offline":
      return "Platform is already offline";
    case "platform_unbound":
      return "No bound account on this platform";
    case "no_forwarded_task":
      return "No forwarded task is currently active";
    case "read_model_gap":
      return "Current contract does not expose this state";
    case "action_not_supported":
      return "No writable API is available for this action";
    case "missing_command_fields":
      return "The current command contract is missing spec-required fields";
    default:
      return normalized;
  }
}

function getActionLabel(action: string, locale: "en" | "zh") {
  const zh = locale === "zh";
  switch (action) {
    case "force_offline":
      return zh ? "強制平台下線" : "Force offline";
    case "request_reauth":
      return zh ? "要求重新驗證" : "Request re-auth";
    case "suppress_matching":
      return zh ? "暫停媒合" : "Suppress matching";
    case "lift_suppression":
      return zh ? "解除媒合暫停" : "Lift suppression";
    case "mark_forwarded_unavailable":
      return zh ? "標記轉派不可用" : "Mark unavailable";
    case "generate_driver_statement":
      return zh ? "產生帳單" : "Generate statement";
    default:
      return action;
  }
}

function getPendingLabel(action: string, locale: "en" | "zh") {
  const zh = locale === "zh";
  switch (action) {
    case "generate_driver_statement":
      return zh ? "產生中…" : "Generating…";
    default:
      return zh ? "更新中…" : "Updating…";
  }
}

function getActionAuditName(action: string) {
  switch (action) {
    case "force_offline":
      return "force_offline";
    case "request_reauth":
      return "request_reauth";
    case "suppress_matching":
      return "suppress_matching";
    case "lift_suppression":
      return "lift_suppression";
    case "generate_driver_statement":
      return "generate_driver_statement";
    default:
      return action;
  }
}

function buildAuditHref(auditId: string) {
  const path = `/audit?auditId=${encodeURIComponent(auditId)}`;
  const baseOrigin =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN?.trim() ||
    process.env.PROD_PLATFORM_ADMIN_ORIGIN?.trim() ||
    "";

  return baseOrigin ? `${baseOrigin.replace(/\/$/, "")}${path}` : path;
}

export function DriverAvailableActions({
  driverId,
  workState,
  actions,
  platformCode,
  platformStatus,
  statementPeriod,
  compact = false,
}: DriverAvailableActionsProps) {
  const client = getOpsClient();
  const router = useRouter();
  const { locale } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceiptState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visibleActions = actions.filter(Boolean);
  const actionContractGaps = visibleActions
    .map((descriptor) => ({
      action: descriptor.action,
      message: getActionContractGap(descriptor.action, locale),
    }))
    .filter(
      (
        gap,
      ): gap is {
        action: string;
        message: string;
      } => Boolean(gap.message),
    );

  async function runAction(descriptor: ResourceActionDescriptor) {
    const { action, requiresReason, riskLevel } = descriptor;
    const highRisk = riskLevel === "high";
    const mediumRisk = riskLevel === "medium";
    const contractGap = getActionContractGap(action, locale);

    if (contractGap) {
      setError(contractGap);
      return;
    }

    let reason = "";
    if (requiresReason || highRisk) {
      const promptLabel =
        locale === "zh"
          ? `${getActionLabel(action, "zh")}原因`
          : `Reason for ${getActionLabel(action, "en").toLowerCase()}`;
      const value = window.prompt(promptLabel, "");
      if (!value || value.trim().length === 0) {
        return;
      }
      reason = value.trim();
    } else if (mediumRisk) {
      const confirmed = window.confirm(
        locale === "zh"
          ? `確認執行「${getActionLabel(action, "zh")}」？`
          : `Confirm ${getActionLabel(action, "en").toLowerCase()}?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setPendingAction(action);
    setError(null);
    setReceipt(null);
    const startedAt = new Date().toISOString();

    try {
      switch (action) {
        case "force_offline":
          if (!platformCode) {
            throw new Error("platformCode required");
          }
          await client.setPlatformOffline({ platformCode }, { driverId });
          break;
        case "request_reauth":
          if (!platformCode) {
            throw new Error("platformCode required");
          }
          await client.setPlatformOnline(
            {
              platformCode,
              tokenExpiresAt: new Date().toISOString(),
            },
            { driverId },
          );
          break;
        case "suppress_matching":
          await client.updateDriverWorkState(driverId, {
            workState: "incident_hold",
          });
          break;
        case "lift_suppression":
          await client.updateDriverWorkState(driverId, {
            workState: workState === "incident_hold" ? "available" : workState,
          });
          break;
        case "generate_driver_statement":
          await client.generateDriverStatements({
            driverId,
            periodMonth:
              statementPeriod ?? new Date().toISOString().slice(0, 7),
          });
          break;
        case "mark_forwarded_unavailable":
          throw new Error(
            reason ||
              (locale === "zh"
                ? "目前尚無對應 API。"
                : "No writable API is available yet."),
          );
        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      const latestAudit = (await client.listAuditLogs())
        .filter((entry: AuditLogRecord) => {
          if (entry.actionName !== getActionAuditName(action)) {
            return false;
          }
          if (entry.createdAt < startedAt) {
            return false;
          }
          if (action === "generate_driver_statement") {
            return entry.newValuesSummary?.driverId === driverId;
          }
          if (platformCode) {
            return (
              entry.resourceId === `${driverId}:${platformCode}` ||
              entry.newValuesSummary?.driverId === driverId
            );
          }
          return (
            entry.resourceId === driverId ||
            entry.newValuesSummary?.driverId === driverId
          );
        })
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];

      setReceipt({
        action,
        auditId: latestAudit?.auditId ?? null,
        requestId: latestAudit?.requestId ?? null,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : locale === "zh"
            ? "發生未知錯誤"
            : "Unknown error",
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: compact ? "0.35rem" : "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {visibleActions.map((descriptor) => {
          const contractGap = getActionContractGap(descriptor.action, locale);
          const unsupported =
            descriptor.action === "mark_forwarded_unavailable" ||
            Boolean(contractGap) ||
            (descriptor.action === "force_offline" && !platformCode) ||
            (descriptor.action === "request_reauth" && !platformCode);
          const disabled =
            !descriptor.enabled ||
            unsupported ||
            pendingAction !== null ||
            (descriptor.action === "force_offline" &&
              platformStatus !== "online") ||
            (descriptor.action === "request_reauth" &&
              platformStatus === undefined);

          return (
            <Btn
              key={descriptor.action}
              theme={theme}
              size={compact ? "xs" : "sm"}
              variant={descriptor.riskLevel === "low" ? "secondary" : "primary"}
              danger={descriptor.riskLevel === "high"}
              disabled={disabled}
              onClick={() => void runAction(descriptor)}
            >
              {pendingAction === descriptor.action
                ? getPendingLabel(descriptor.action, locale)
                : getActionLabel(descriptor.action, locale)}
            </Btn>
          );
        })}
      </div>

      {visibleActions.some(
        (descriptor) =>
          !descriptor.enabled ||
          Boolean(getActionContractGap(descriptor.action, locale)) ||
          descriptor.disabledReasonCode ||
          descriptor.action === "mark_forwarded_unavailable",
      ) ? (
        <div
          style={{
            display: "grid",
            gap: "0.2rem",
            fontSize: compact ? 11 : 11.5,
            color: theme.textMuted,
          }}
        >
          {visibleActions
            .filter(
              (descriptor) =>
                !descriptor.enabled ||
                Boolean(getActionContractGap(descriptor.action, locale)) ||
                descriptor.disabledReasonCode ||
                descriptor.action === "mark_forwarded_unavailable",
            )
            .map((descriptor) => (
              <div key={`${descriptor.action}-hint`}>
                {getActionLabel(descriptor.action, locale)}:{" "}
                {formatReasonLabel(
                  (getActionContractGap(descriptor.action, locale)
                    ? "missing_command_fields"
                    : descriptor.disabledReasonCode) ??
                    (descriptor.action === "mark_forwarded_unavailable"
                      ? "action_not_supported"
                      : platformStatus !== "online" &&
                          descriptor.action === "force_offline"
                        ? "platform_offline"
                        : "read_model_gap"),
                  locale,
                )}
              </div>
            ))}
        </div>
      ) : null}

      {actionContractGaps.length > 0 ? (
        <Banner
          theme={theme}
          tone="warn"
          icon="warn"
          title={
            locale === "zh"
              ? "部分高風險動作因 command contract 缺口而暫停"
              : "Some high-risk actions are paused due to command-contract gaps"
          }
          body={
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {actionContractGaps.map((gap) => (
                <div key={gap.action}>
                  {getActionLabel(gap.action, locale)}: {gap.message}
                </div>
              ))}
            </div>
          }
        />
      ) : null}

      {error ? (
        <div style={{ color: theme.danger, fontSize: compact ? 11 : 11.5 }}>
          {locale === "zh" ? "操作失敗" : "Action failed"}: {error}
        </div>
      ) : null}

      {receipt ? (
        <Banner
          theme={theme}
          tone="success"
          icon="audit"
          title={
            locale === "zh"
              ? `${getActionLabel(receipt.action, locale)} 已送出`
              : `${getActionLabel(receipt.action, locale)} submitted`
          }
          body={
            receipt.auditId
              ? locale === "zh"
                ? `Audit 已建立：${receipt.auditId}`
                : `Audit recorded: ${receipt.auditId}`
              : locale === "zh"
                ? `請用 requestId ${receipt.requestId ?? "—"} 追蹤後續 audit。`
                : `Track the follow-up audit with requestId ${receipt.requestId ?? "—"}.`
          }
          actions={
            receipt.auditId ? (
              <a
                href={buildAuditHref(receipt.auditId)}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: theme.text,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: compact ? 11 : 12,
                }}
              >
                <CanvasIcon name="ext" size={12} />
                {locale === "zh" ? "View audit" : "View audit"}
              </a>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}
