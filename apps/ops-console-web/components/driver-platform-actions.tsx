"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import type {
  PlatformCode,
  PlatformPresenceStatus,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasField as Field,
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
  actions: ResourceActionDescriptor[];
  platformCode?: PlatformCode;
  platformStatus?: PlatformPresenceStatus;
  statementPeriod?: string;
  activeForwardedOrderId?: string | null;
  compact?: boolean;
};

type ActionReceipt = {
  actionId: string;
  auditId: string;
  resourceType: string;
  resourceId: string;
  status: "accepted" | "completed" | "failed";
  message: string;
};

type ActionDraft = {
  descriptor: ResourceActionDescriptor;
  reasonCode: string;
  note: string;
  expiresAt: string;
};

const modalCardStyle = {
  width: "min(520px, calc(100vw - 32px))",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 12,
  boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
} as const;

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
  return action === "generate_driver_statement"
    ? zh
      ? "產生中…"
      : "Generating…"
    : zh
      ? "更新中…"
      : "Updating…";
}

function buildAuditHref(auditId: string) {
  const path = `/audit?auditId=${encodeURIComponent(auditId)}`;
  const baseOrigin =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN?.trim() ||
    process.env.PROD_PLATFORM_ADMIN_ORIGIN?.trim() ||
    "";

  return baseOrigin ? `${baseOrigin.replace(/\/$/, "")}${path}` : path;
}

function buildDefaultExpiry(action: string) {
  const now = Date.now();
  const plusHours = action === "suppress_matching" ? 24 : 4;
  const date = new Date(now + plusHours * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 16)}`;
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getReasonCodeOptions(action: string, locale: "en" | "zh") {
  if (action === "force_offline") {
    return [
      {
        value: "incident_response",
        label:
          locale === "zh" ? "incident_response 事故處理" : "incident_response",
      },
      {
        value: "compliance_hold",
        label: locale === "zh" ? "compliance_hold 合規暫停" : "compliance_hold",
      },
      {
        value: "safety_override",
        label: locale === "zh" ? "safety_override 安全覆蓋" : "safety_override",
      },
    ];
  }

  if (action === "suppress_matching") {
    return [
      {
        value: "incident",
        label: locale === "zh" ? "incident 事故處理" : "incident",
      },
      {
        value: "compliance_hold",
        label: locale === "zh" ? "compliance_hold 合規暫停" : "compliance_hold",
      },
      {
        value: "manual_ops_hold",
        label: locale === "zh" ? "manual_ops_hold 人工暫停" : "manual_ops_hold",
      },
    ];
  }

  return [];
}

function needsModal(descriptor: ResourceActionDescriptor) {
  return descriptor.riskLevel !== "low";
}

function createDraft(
  descriptor: ResourceActionDescriptor,
  locale: "en" | "zh",
): ActionDraft {
  const reasonOptions = getReasonCodeOptions(descriptor.action, locale);
  return {
    descriptor,
    reasonCode: reasonOptions[0]?.value ?? "",
    note: "",
    expiresAt: buildDefaultExpiry(descriptor.action),
  };
}

export function DriverAvailableActions({
  driverId,
  actions,
  platformCode,
  platformStatus,
  statementPeriod,
  activeForwardedOrderId,
  compact = false,
}: DriverAvailableActionsProps) {
  const client = getOpsClient();
  const router = useRouter();
  const { locale } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [, startTransition] = useTransition();

  const visibleActions = actions.filter(Boolean);

  async function submitAction(
    descriptor: ResourceActionDescriptor,
    currentDraft?: ActionDraft | null,
  ) {
    setPendingAction(descriptor.action);
    setError(null);
    setReceipt(null);

    try {
      let actionReceipt: ActionReceipt;
      switch (descriptor.action) {
        case "force_offline":
          if (!platformCode) {
            throw new Error(
              locale === "zh"
                ? "需要 platformCode。"
                : "platformCode is required.",
            );
          }
          if (!currentDraft?.note.trim()) {
            throw new Error(
              locale === "zh" ? "請填寫說明。" : "Note is required.",
            );
          }
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/platforms/${encodeURIComponent(platformCode)}/force-offline`,
            {
              body: {
                reasonCode: currentDraft.reasonCode,
                note: currentDraft.note.trim(),
                expiresAt: toIso(currentDraft.expiresAt),
              },
            },
          );
          break;
        case "request_reauth":
          if (!platformCode) {
            throw new Error(
              locale === "zh"
                ? "需要 platformCode。"
                : "platformCode is required.",
            );
          }
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/platforms/${encodeURIComponent(platformCode)}/request-reauth`,
            {
              body: {
                tokenExpiresAt: new Date().toISOString(),
              },
            },
          );
          break;
        case "suppress_matching":
          if (!currentDraft?.note.trim()) {
            throw new Error(
              locale === "zh" ? "請填寫說明。" : "Note is required.",
            );
          }
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/matching-suppression`,
            {
              body: {
                reasonCode: currentDraft.reasonCode,
                note: currentDraft.note.trim(),
                expiresAt: toIso(currentDraft.expiresAt),
              },
            },
          );
          break;
        case "lift_suppression":
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/matching-suppression/lift`,
            {
              body: {
                note: currentDraft?.note.trim() || null,
              },
            },
          );
          break;
        case "mark_forwarded_unavailable":
          if (!activeForwardedOrderId) {
            throw new Error(
              locale === "zh"
                ? "目前沒有進行中的 forwarded order。"
                : "No active forwarded order is available.",
            );
          }
          if (!currentDraft?.note.trim()) {
            throw new Error(
              locale === "zh" ? "請填寫說明。" : "Note is required.",
            );
          }
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/forwarded-orders/${encodeURIComponent(activeForwardedOrderId)}/mark-unavailable`,
            {
              body: {
                reason: currentDraft.note.trim(),
                note: currentDraft.note.trim(),
              },
            },
          );
          break;
        case "generate_driver_statement":
          actionReceipt = await client.post<ActionReceipt>(
            `/api/ops/drivers/${encodeURIComponent(driverId)}/statements/generate`,
            {
              body: {
                periodMonth:
                  statementPeriod ?? new Date().toISOString().slice(0, 7),
              },
            },
          );
          break;
        default:
          throw new Error(`Unsupported action: ${descriptor.action}`);
      }

      setReceipt(actionReceipt);
      setDraft(null);
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
    <>
      <div style={{ display: "grid", gap: compact ? "0.35rem" : "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {visibleActions.map((descriptor) => {
            const disabled =
              !descriptor.enabled ||
              pendingAction !== null ||
              (descriptor.action === "force_offline" &&
                (platformStatus !== "online" || !platformCode)) ||
              (descriptor.action === "request_reauth" && !platformCode) ||
              (descriptor.action === "mark_forwarded_unavailable" &&
                !activeForwardedOrderId);

            return (
              <Btn
                key={descriptor.action}
                theme={theme}
                size={compact ? "xs" : "sm"}
                variant={
                  descriptor.riskLevel === "low" ? "secondary" : "primary"
                }
                danger={descriptor.riskLevel === "high"}
                disabled={disabled}
                onClick={() => {
                  if (needsModal(descriptor)) {
                    setDraft(createDraft(descriptor, locale));
                    setError(null);
                    return;
                  }
                  void submitAction(descriptor, null);
                }}
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
            descriptor.disabledReasonCode ||
            (descriptor.action === "force_offline" &&
              platformStatus !== "online") ||
            (descriptor.action === "mark_forwarded_unavailable" &&
              !activeForwardedOrderId),
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
                  descriptor.disabledReasonCode ||
                  (descriptor.action === "force_offline" &&
                    platformStatus !== "online") ||
                  (descriptor.action === "mark_forwarded_unavailable" &&
                    !activeForwardedOrderId),
              )
              .map((descriptor) => (
                <div key={`${descriptor.action}-hint`}>
                  {getActionLabel(descriptor.action, locale)}:{" "}
                  {formatReasonLabel(
                    descriptor.disabledReasonCode ??
                      (descriptor.action === "force_offline" &&
                      platformStatus !== "online"
                        ? "platform_offline"
                        : descriptor.action === "mark_forwarded_unavailable"
                          ? "no_forwarded_task"
                          : "already_active"),
                    locale,
                  )}
                </div>
              ))}
          </div>
        ) : null}

        {error ? (
          <div style={{ color: theme.danger, fontSize: compact ? 11 : 11.5 }}>
            {locale === "zh" ? "操作失敗" : "Action failed"}: {error}
          </div>
        ) : null}

        {receipt ? (
          <Banner
            theme={theme}
            tone={receipt.status === "failed" ? "danger" : "success"}
            icon="audit"
            title={
              locale === "zh"
                ? `${getActionLabel(receipt.actionId, locale)} 已送出`
                : `${getActionLabel(receipt.actionId, locale)} submitted`
            }
            body={
              locale === "zh"
                ? `Audit 已建立：${receipt.auditId}`
                : `Audit recorded: ${receipt.auditId}`
            }
            actions={
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
                {locale === "zh" ? "查看 audit" : "View audit"}
              </a>
            }
          />
        ) : null}
      </div>

      {draft ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div style={modalCardStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {getActionLabel(draft.descriptor.action, locale)}
              </div>
              <div style={{ color: theme.textMuted, fontSize: 12 }}>
                {draft.descriptor.riskLevel === "high"
                  ? locale === "zh"
                    ? "高風險動作需要確認與說明。"
                    : "High-risk action requires confirmation and reason."
                  : locale === "zh"
                    ? "請確認是否執行這項操作。"
                    : "Confirm that you want to run this action."}
              </div>
            </div>

            {getReasonCodeOptions(draft.descriptor.action, locale).length >
            0 ? (
              <Field
                theme={theme}
                label={locale === "zh" ? "Reason code" : "Reason code"}
              >
                <select
                  value={draft.reasonCode}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setDraft((current) =>
                      current
                        ? { ...current, reasonCode: event.currentTarget.value }
                        : current,
                    )
                  }
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgRaised,
                    color: theme.text,
                    padding: "10px 12px",
                  }}
                >
                  {getReasonCodeOptions(draft.descriptor.action, locale).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            ) : null}

            {["force_offline", "suppress_matching"].includes(
              draft.descriptor.action,
            ) ? (
              <Field theme={theme} label={locale === "zh" ? "TTL" : "TTL"}>
                <input
                  type="datetime-local"
                  value={draft.expiresAt}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft((current) =>
                      current
                        ? { ...current, expiresAt: event.currentTarget.value }
                        : current,
                    )
                  }
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgRaised,
                    color: theme.text,
                    padding: "10px 12px",
                  }}
                />
              </Field>
            ) : null}

            {draft.descriptor.riskLevel === "high" ||
            draft.descriptor.action === "mark_forwarded_unavailable" ? (
              <Field
                theme={theme}
                label={locale === "zh" ? "Note" : "Note"}
                hint={
                  locale === "zh"
                    ? "這個說明會寫入 audit receipt。"
                    : "This note is written into the audit receipt."
                }
              >
                <textarea
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, note: event.currentTarget.value }
                        : current,
                    )
                  }
                  rows={4}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgRaised,
                    color: theme.text,
                    padding: 10,
                    resize: "vertical",
                  }}
                />
              </Field>
            ) : null}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <Btn
                theme={theme}
                variant="secondary"
                onClick={() => setDraft(null)}
              >
                {locale === "zh" ? "取消" : "Cancel"}
              </Btn>
              <Btn
                theme={theme}
                danger={draft.descriptor.riskLevel === "high"}
                onClick={() => void submitAction(draft.descriptor, draft)}
              >
                {pendingAction === draft.descriptor.action
                  ? getPendingLabel(draft.descriptor.action, locale)
                  : locale === "zh"
                    ? "確認執行"
                    : "Confirm"}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
