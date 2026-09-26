"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME } from "@drts/contracts";

import {
  buildCanvasTheme,
  CanvasBtn,
  CanvasCard,
  CanvasPill,
  CanvasDL,
  CanvasField,
  CanvasBanner,
  CanvasIcon,
  CanvasEmptyState,
  CanvasTable,
  CanvasKPI,
} from "@drts/ui-web";

import { resolveCrossAppHref } from "./assistant/route-context";

export function PanelActionBtn({
  theme,
  descriptor,
  label,
  en,
  icon,
  onClick,
  size = "sm",
  variant,
}: any) {
  if (!descriptor) return null;
  const isHigh = descriptor.riskLevel === "high";
  const resolvedVariant =
    variant ?? (descriptor.riskLevel === "medium" ? "primary" : "secondary");
  return (
    <div
      title={
        !descriptor.enabled
          ? descriptor.reason || descriptor.disabledReasonCode
          : undefined
      }
    >
      <CanvasBtn
        theme={theme}
        size={size}
        danger={isHigh}
        variant={resolvedVariant}
        onClick={descriptor.enabled ? onClick : undefined}
        disabled={!descriptor.enabled}
        icon={icon}
      >
        {label}
        {en && <span style={{ opacity: 0.72 }}> · {en}</span>}
      </CanvasBtn>
    </div>
  );
}

function PnBinding({
  theme: th,
  binding,
  testStatus,
  t,
  onEdit,
  canWriteBinding,
  tenantId,
  canWriteWebhooks,
}: any) {
  const state = binding ? binding.state : "none";
  const PN_BIND: Record<string, [string, any]> = {
    ready: [t("partnerNotification.state.ready") ?? "就緒", "success"],
    test_pending: ["待測試", "warn"],
    disabled: [t("partnerNotification.state.disabled") ?? "已停用", "neutral"],
  };
  const TEST_STATUS: Record<string, [string, any]> = {
    passed_current: ["測試通過 · 目前端點", "success"],
    passed_stale: ["測試已失效 · 端點 fingerprint 已變", "warn"],
    failed: ["測試失敗", "danger"],
    none: ["尚未測試", "neutral"],
  };

  const m = PN_BIND[state] || ["未知", "neutral"];
  const testDisplay = TEST_STATUS[testStatus] || ["尚未測試", "neutral"];

  const ZH_MAP: Record<string, string> = {
    assignment_disclosure_ready:
      t("partnerNotification.event.assignment_disclosure_ready") ??
      "派車揭露就緒",
    assignment_replaced:
      t("partnerNotification.event.assignment_replaced") ?? "派車已更換",
    eta_changed: t("partnerNotification.event.eta_changed") ?? "ETA 變更",
    driver_arrived:
      t("partnerNotification.event.driver_arrived") ?? "駕駛已抵達",
    receipt_ready: t("partnerNotification.event.receipt_ready") ?? "收據就緒",
  };
  const PN_EVENTS: [string, string, string][] = Object.entries(
    PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
  ).map(([k, v]) => [k, v, ZH_MAP[k] || k]);

  return (
    <CanvasCard
      theme={th}
      title={
        t("partnerNotification.binding.title") ??
        "通知綁定 · Notification Binding"
      }
      subtitle="引用既有 webhook · 端點/密鑰於既有 /webhooks 管理（依權限顯示）"
      actions={
        <>
          <CanvasBtn
            theme={th}
            size="xs"
            icon="edit"
            onClick={onEdit}
            disabled={!canWriteBinding}
          >
            {t("partnerNotification.edit") ?? "編輯綁定"}
          </CanvasBtn>
          <CanvasPill theme={th} tone={m[1] as any} dot>
            {m[0]}
            <span
              style={{
                marginLeft: 4,
                opacity: 0.6,
                fontFamily: th.monoFamily,
                fontSize: 9,
              }}
            >
              {state}
            </span>
          </CanvasPill>
        </>
      }
    >
      <CanvasDL
        theme={th}
        cols={2}
        items={[
          {
            k: "webhookId",
            v: (
              <span style={{ fontFamily: th.monoFamily }}>
                {binding?.webhookId || "—"}{" "}
                {tenantId && canWriteWebhooks ? (
                  <a
                    href={resolveCrossAppHref({
                      targetApp: "tenant-console",
                      route: `/api/auth/tenant/login?tenant_id=${encodeURIComponent(tenantId)}&redirect_uri=${encodeURIComponent("/webhooks")}`,
                      resourceType: "webhook",
                      resourceId: "",
                      openMode: "new_tab",
                      label: "Webhooks",
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <CanvasBtn theme={th} size="xs" variant="ghost" icon="ext">
                      {t("partnerNotification.webhookHelp") ??
                        "既有 /webhooks 管理（需 tenant:webhooks:write）"}
                    </CanvasBtn>
                  </a>
                ) : (
                  <CanvasBtn
                    theme={th}
                    size="xs"
                    variant="ghost"
                    icon="ext"
                    disabled
                  >
                    {t("partnerNotification.webhookHelp") ??
                      "既有 /webhooks 管理（需 tenant:webhooks:write）"}
                  </CanvasBtn>
                )}
              </span>
            ),
          },
          { k: "端點（唯讀）", v: binding?.endpointUrl || "—", mono: true },
          {
            k: "端點 fingerprint",
            v: binding?.endpointFingerprint || "未知",
            mono: true,
          },
          { k: "version", v: String(binding?.version || 0), mono: true },
          {
            k: "最近測試",
            v: (
              <CanvasPill theme={th} tone={testDisplay[1] as any} dot>
                {testDisplay[0]}
              </CanvasPill>
            ),
          },
          {
            k: "測試時間",
            v:
              testStatus === "none"
                ? "—"
                : binding?.validatedAt
                  ? `${new Date(binding.validatedAt).toLocaleString()} · fp:${binding.validatedEndpointFingerprint}`
                  : "—",
            mono: true,
          },
          {
            k: "最後更新",
            v: binding?.updatedAt
              ? new Date(binding.updatedAt).toLocaleString()
              : "—",
            mono: false,
          },
          {
            k: "簽章密鑰",
            v: (
              <span style={{ fontFamily: th.monoFamily }}>
                {t("partnerNotification.secretHidden") ??
                  "••••••••（此頁不顯示、不編輯）"}
              </span>
            ),
          },
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: th.textMuted,
            marginBottom: 6,
          }}
        >
          {t("partnerNotification.subscribedEvents") ??
            "訂閱事件（內部 → 對外映射）"}
        </div>
        {state === "disabled" ? (
          <span style={{ fontSize: 11.5, color: th.textDim }}>
            {t("partnerNotification.disabledDesc") ??
              "已停用 · 不派送任何事件；訂閱設定保留，可恢復"}
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(binding?.eventTypes || []).map((i: string) => {
              const row = PN_EVENTS.find((e) => e[0] === i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11.5,
                  }}
                >
                  <CanvasPill theme={th} tone="accent">
                    {i}
                  </CanvasPill>
                  <CanvasIcon
                    name="chevR"
                    size={11}
                    style={{ color: th.textDim }}
                  />
                  <span
                    style={{ fontFamily: th.monoFamily, color: th.textMuted }}
                  >
                    {row ? row[1] : i}
                  </span>
                  <span style={{ color: th.textDim }}>{row ? row[2] : ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CanvasCard>
  );
}

function PnLifecycle({
  theme: th,
  binding,
  testStatus,
  testingState,
  enableState,
  disableState,
  resumeState,
  canWriteBinding,
  onTest,
  onEnable,
  onDisable,
  onResume,
  t,
}: any) {
  const state = binding ? binding.state : "none";
  const isPending =
    testingState === "pending" ||
    enableState === "pending" ||
    disableState === "pending" ||
    resumeState === "pending";
  const canEnable = state === "test_pending" && testStatus === "passed_current";
  const canMutate = canWriteBinding;
  const enableReason =
    state === "ready"
      ? "already_enabled"
      : state === "disabled"
        ? "use_resume"
        : testStatus === "passed_stale"
          ? "ENDPOINT_FINGERPRINT_CHANGED"
          : testStatus === "failed"
            ? "LAST_TEST_FAILED"
            : "TEST_REQUIRED";

  return (
    <CanvasCard
      theme={th}
      title={t("partnerNotification.lifecycleCtrl") ?? "生命週期控制"}
      subtitle="test → enable · disable · resume"
    >
      {!canMutate && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="lock"
            title={t("partnerNotification.permissionDenied") ?? "權限不足"}
            body="您沒有本 entry 綁定的寫入權限，無法執行生命週期操作（需 foundation:write）。"
          />
        </div>
      )}
      {testingState === "rejected" && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={t("partnerNotification.testRejected") ?? "綁定測試遭拒"}
            body="夥伴端點回傳錯誤狀態碼，拒絕了測試要求，無法啟用。"
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                icon="refresh"
                disabled={!canMutate || isPending}
                onClick={onTest}
              >
                {t("partnerNotification.retest") ?? "重測"}
              </CanvasBtn>
            }
          />
        </div>
      )}
      {enableState === "failed" && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={t("partnerNotification.enableFailed") ?? "啟用失敗"}
            body="無法啟用綁定，請確認測試狀態有效後重試。"
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                icon="refresh"
                disabled={!canMutate || isPending || !canEnable}
                onClick={onEnable}
              >
                {t("partnerNotification.retry") ?? "重試"}
              </CanvasBtn>
            }
          />
        </div>
      )}
      {disableState === "failed" && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={t("partnerNotification.disableFailed") ?? "停用失敗"}
            body="無法停用綁定，請重試。"
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                icon="refresh"
                disabled={!canMutate || isPending}
                onClick={onDisable}
              >
                {t("partnerNotification.retry") ?? "重試"}
              </CanvasBtn>
            }
          />
        </div>
      )}
      {resumeState === "failed" && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={t("partnerNotification.resumeFailed") ?? "恢復失敗"}
            body="無法恢復綁定狀態，請重試。"
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                icon="refresh"
                disabled={!canMutate || isPending}
                onClick={onResume}
              >
                {t("partnerNotification.retry") ?? "重試"}
              </CanvasBtn>
            }
          />
        </div>
      )}
      {testStatus === "failed" && testingState !== "rejected" && (
        <div style={{ marginBottom: 10 }}>
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={
              t("partnerNotification.testFailedAck") ??
              "測試失敗 · ack 驗證不符"
            }
            body="夥伴回 200，但 ack.delivery_id 與送出不符（notification_id / partner_entry_slug 亦須一致，status/receipt 須合法）。請確認夥伴端實作後重測。"
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                icon="refresh"
                disabled={!canMutate || isPending}
                onClick={onTest}
              >
                {t("partnerNotification.retest") ?? "重測"}
              </CanvasBtn>
            }
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <PanelActionBtn
          theme={th}
          descriptor={{
            action: "test",
            enabled: canMutate && !isPending,
            disabledReasonCode: !canMutate
              ? "missing_scope"
              : isPending
                ? "in_flight"
                : undefined,
            riskLevel: "low",
          }}
          icon="refresh"
          label={testingState === "pending" ? "測試中..." : "發送測試事件"}
          en="test"
          onClick={onTest}
        />
        <PanelActionBtn
          theme={th}
          descriptor={{
            action: "enable",
            enabled: canMutate && canEnable && !isPending,
            disabledReasonCode: !canMutate
              ? "missing_scope"
              : canEnable
                ? undefined
                : enableReason,
            riskLevel: "medium",
            requiresReason: true,
          }}
          icon="check"
          label={enableState === "pending" ? "啟用中..." : "啟用"}
          en="enable"
          onClick={onEnable}
        />
        {state === "disabled" ? (
          <PanelActionBtn
            theme={th}
            descriptor={{
              action: "resume",
              enabled: canMutate && !isPending,
              disabledReasonCode: !canMutate
                ? "missing_scope"
                : isPending
                  ? "in_flight"
                  : undefined,
              riskLevel: "medium",
              requiresReason: true,
            }}
            icon="check"
            label={
              resumeState === "pending"
                ? "恢復通知中..."
                : testStatus === "passed_current"
                  ? "恢復通知"
                  : "恢復通知（恢復後需重新測試，通過後才能啟用）"
            }
            en="resume"
            onClick={onResume}
          />
        ) : (
          <PanelActionBtn
            theme={th}
            descriptor={{
              action: "disable",
              enabled: canMutate && state === "ready" && !isPending,
              disabledReasonCode: !canMutate
                ? "missing_scope"
                : state === "ready"
                  ? undefined
                  : "not_enabled",
              riskLevel: "high",
              requiresReason: true,
            }}
            icon="lock"
            label={disableState === "pending" ? "停用中..." : "停用"}
            en="disable"
            onClick={onDisable}
          />
        )}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: th.textDim,
          marginTop: 9,
          lineHeight: 1.5,
        }}
      >
        {t("partnerNotification.enableThreshold") ??
          "啟用門檻：目前端點 fingerprint "}

        <br />
        {t("partnerNotification.resumeDep") ??
          "「恢復」依據目前端點是否 passed_current 來決定是否需重測，無獨立 "}
      </div>
    </CanvasCard>
  );
}

function PnRetryCell({
  theme: th,
  row,
  r,
  retryState,
  retryRowId,
  retryError,
  onRetry,
  t,
  canWriteBinding,
  bindingState,
}: any) {
  const item = row || r;
  const RETRY_DENY: Record<string, string> = {
    terminal: "已是終止狀態",
    configuration_blocked: "綁定未就緒",
    none: "無重試機制",
    exhausted: "重試預算耗盡",
    expired: "生命週期已過期",
    no_write: "無權限重試",
    active_lease: "處理中 (排隊或發送中)",
  };

  if (!item) return null;

  const isExpired = item.expiresAt && new Date(item.expiresAt) <= new Date();
  const isExhausted =
    typeof item.maxAttempts === "number" &&
    (item.attempts || item.attemptCount || 0) >= item.maxAttempts;

  const isActiveLease =
    item.leaseExpiresAt && new Date(item.leaseExpiresAt) > new Date();
  const isPending = item.status === "pending" || item.status === "sending";

  let denyCode: string | null = null;
  if (!canWriteBinding) denyCode = "no_write";
  else if (bindingState !== "ready") denyCode = "configuration_blocked";
  else if (item.retryDisposition === "terminal") denyCode = "terminal";
  else if (item.retryDisposition === "none") denyCode = "none";
  else if (isExpired) denyCode = "expired";
  else if (isExhausted) denyCode = "exhausted";
  else if (isActiveLease || isPending) denyCode = "active_lease";

  if (denyCode) {
    return (
      <span
        title={denyCode}
        style={{
          fontSize: 10.5,
          color: th.textDim,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <CanvasIcon name="warn" size={10} />
        {RETRY_DENY[denyCode] || denyCode}
      </span>
    );
  }

  const retryValue = item.retryDisposition;
  if (!retryValue || retryValue === "n/a")
    return <span style={{ fontSize: 10.5, color: th.textDim }}>—</span>;

  if (retryValue === "inflight")
    return (
      <CanvasPill theme={th} tone="info" dot>
        {t("partnerNotification.enqueued") ?? "入列中 · 待 claim"}
      </CanvasPill>
    );

  const isTargetRow = item.outboxId === retryRowId;

  if (isTargetRow && retryState === "pending")
    return (
      <PanelActionBtn
        theme={th}
        descriptor={{ enabled: false, riskLevel: "low" }}
        icon="refresh"
        label="重送中..."
        en="resend"
        size="xs"
      />
    );

  if (isTargetRow && retryState === "failed")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <PanelActionBtn
          theme={th}
          descriptor={{ enabled: true, riskLevel: "low" }}
          icon="refresh"
          label="重送"
          en="resend"
          size="xs"
          onClick={() => onRetry(item.outboxId)}
        />
        <span style={{ fontSize: 10, color: th.danger }}>
          {retryError
            ? retryError
            : (t("partnerNotification.enqueueFailed") ?? "入列要求失敗")}
        </span>
      </div>
    );

  if (
    retryValue === "allowed" ||
    retryValue === "manual_only" ||
    retryValue === "automatic" ||
    retryValue === "configuration_blocked"
  )
    return (
      <PanelActionBtn
        theme={th}
        descriptor={{ enabled: retryState !== "pending", riskLevel: "low" }}
        icon="refresh"
        label="重送"
        en="resend"
        size="xs"
        onClick={() => onRetry(item.outboxId)}
      />
    );

  return null;
}

function PnDeliveries({
  theme: th,
  loading,
  deliveries,
  retryState,
  retryRowId,
  retryError,
  onRetry,
  onRefresh,
  t,
  canWriteBinding,
  bindingState,
  page,
  total,
  onPageChange,
}: any) {
  const PN_DLV: Record<string, [string, any]> = {
    accepted: ["端點已接受，裝置未知", "info"],
    ack_invalid: ["回應成功但 ack 驗證失敗", "danger"],
    failed: ["失敗", "danger"],
    queued: ["排隊中", "neutral"],
    requeued: ["已受理重新入列", "info"],
    superseded: ["已被新通知取代", "neutral"],
    ttl_expired: ["生命週期逾時 (ttl)", "neutral"],
    budget_exhausted: ["重試次數耗盡 (budget)", "danger"],
    delivered: ["歷史紀錄（裝置未知）", "neutral"],
    pending: ["排隊中", "neutral"],
    sending: ["發送中", "info"],
  };

  if (loading && deliveries.length === 0) {
    return (
      <CanvasCard
        theme={th}
        title={
          t("partnerNotification.deliveries.title") ?? "派送紀錄 · Deliveries"
        }
        subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控"
        padding={16}
      >
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: th.surfaceLo,
            marginBottom: 10,
          }}
        />
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: th.surfaceLo,
            marginBottom: 10,
          }}
        />
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: th.surfaceLo,
            marginBottom: 10,
          }}
        />
      </CanvasCard>
    );
  }

  if (deliveries.length === 0) {
    return (
      <CanvasCard
        theme={th}
        title={
          t("partnerNotification.deliveries.title") ?? "派送紀錄 · Deliveries"
        }
        subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控"
        padding={24}
        actions={
          <CanvasBtn theme={th} size="xs" icon="refresh" onClick={onRefresh}>
            {t("partnerNotification.refresh") ?? "重新整理"}
          </CanvasBtn>
        }
      >
        <CanvasEmptyState
          theme={th}
          title={t("partnerNotification.noDeliveries") ?? "尚無派送紀錄"}
          body="通過測試並啟用後，紀錄會顯示於此。"
        />
      </CanvasCard>
    );
  }

  return (
    <CanvasCard
      theme={th}
      title={
        t("partnerNotification.deliveries.title") ?? "派送紀錄 · Deliveries"
      }
      subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控"
      padding={0}
      actions={
        <CanvasBtn theme={th} size="xs" icon="refresh" onClick={onRefresh}>
          {t("partnerNotification.refresh") ?? "重新整理"}
        </CanvasBtn>
      }
    >
      <CanvasTable
        theme={th}
        columns={[
          {
            h: "Delivery ID",
            k: "deliveryId",
            w: 110,
            mono: true,
            r: (r: any) => (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: th.accent, fontWeight: 600 }}>
                  {r.deliveryId || r.id || "—"}
                </span>
                <span style={{ fontSize: 10, color: th.textDim }}>
                  {r.outboxId}
                </span>
              </div>
            ),
          },
          {
            h: "事件（內部）",
            k: "eventType",
            w: 170,
            mono: true,
            r: (r: any) => r.eventType || r.ev || r.event,
          },
          {
            h: "目標（遮罩）",
            w: 150,
            mono: true,
            r: (r: any) => (
              <span style={{ fontSize: 10.5 }}>
                {r.deliveryTarget || r.target || (
                  <span style={{ color: th.textDim }}>
                    {t("partnerNotification.unknownTarget") ??
                      "未知／尚未建立派送目標"}
                  </span>
                )}
              </span>
            ),
          },
          {
            h: "HTTP",
            w: 56,
            mono: true,
            r: () => "—",
          },
          {
            h: "ack",
            w: 70,
            r: (r: any) =>
              r.failureReason === "partner_ack_invalid" ? (
                <CanvasPill theme={th} tone="danger">
                  {t("partnerNotification.mismatch") ?? "不符"}
                </CanvasPill>
              ) : r.deliveryStage === "partner_accepted" && r.receiptId ? (
                <CanvasPill theme={th} tone="success">
                  {t("partnerNotification.pass") ?? "通過"}
                </CanvasPill>
              ) : (
                <span style={{ color: th.textDim }}>—</span>
              ),
          },
          {
            h: "送達狀態",
            w: 190,
            r: (r: any) => {
              if (r.deliveryStage === "partner_accepted" && r.receiptId) {
                return (
                  <CanvasPill theme={th} tone="info" dot>
                    {t("partnerNotification.accepted_unknown") ??
                      "端點已接受，裝置未知"}
                  </CanvasPill>
                );
              }
              if (r.status === "delivered") {
                return (
                  <CanvasPill theme={th} tone="neutral" dot>
                    {t("partnerNotification.historical_unknown") ??
                      "歷史紀錄（裝置未知）"}
                  </CanvasPill>
                );
              }
              return (
                <CanvasPill
                  theme={th}
                  tone={(PN_DLV[r.status] || ["未知", "neutral"])[1] as any}
                  dot
                >
                  {(PN_DLV[r.status] || ["未知", "neutral"])[0]}
                </CanvasPill>
              );
            },
          },
          {
            h: "說明",
            w: 150,
            r: (r: any) => (
              <span style={{ fontSize: 11.5, color: th.textMuted }}>
                {r.failureReason || r.reason}
              </span>
            ),
          },
          {
            h: "時間",
            k: "createdAt",
            w: 120,
            mono: true,
            r: (r: any) => r.createdAt || r.at || "—",
          },
          {
            h: "次",
            k: "attempts",
            w: 36,
            mono: true,
            align: "center",
            r: (r: any) =>
              typeof r.attempts === "number"
                ? r.attempts
                : (r.attemptCount ?? 1),
          },
          {
            h: "重送",
            w: 150,
            r: (r: any) => (
              <PnRetryCell
                theme={th}
                row={r}
                retryState={retryState}
                retryRowId={retryRowId}
                retryError={retryError}
                onRetry={onRetry}
                t={t}
                canWriteBinding={canWriteBinding}
                bindingState={bindingState}
              />
            ),
          },
        ]}
        rows={deliveries.map((r: any) => {
          if (
            r.deliveryId === retryRowId ||
            r.outboxId === retryRowId ||
            r.id === retryRowId
          ) {
            if (retryState === "queued")
              return {
                ...r,
                status: "queued",
                failureReason: "已受理重新入列",
                retryDisposition: "inflight",
              };
          }
          return r;
        })}
      />
      {total > 0 && (
        <div
          style={{
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${th.border}`,
          }}
        >
          <span style={{ fontSize: 12, color: th.textSecondary }}>
            {t("partnerNotification.pagination.total", { total: total }) ??
              `共 ${total} 筆紀錄`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn
              theme={th}
              size="xs"
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange?.(page - 1)}
            >
              {t("partnerNotification.pagination.prev") ?? "上一頁"}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              size="xs"
              variant="secondary"
              disabled={page * 50 >= total || loading}
              onClick={() => onPageChange?.(page + 1)}
            >
              {t("partnerNotification.pagination.next") ?? "下一頁"}
            </CanvasBtn>
          </div>
        </div>
      )}
    </CanvasCard>
  );
}

function PnEditView({
  theme: th,
  editWebhookId,
  setEditWebhookId,
  editEventTypes,
  setEditEventTypes,
  editExpectedVersion,
  saveState,
  error,
  onSave,
  onCancel,
  onReload,
  t,
  canWriteBinding,
  availableWebhooks,
  webhookError,
  tenantId,
  canWriteWebhooks,
}: any) {
  const isSaving = saveState === "pending";
  const isSaveDisabled =
    isSaving ||
    !editWebhookId ||
    !canWriteBinding ||
    webhookError === "missing_scope";

  const ZH_MAP: Record<string, string> = {
    assignment_disclosure_ready:
      t("partnerNotification.event.assignment_disclosure_ready") ??
      "派車揭露就緒",
    assignment_replaced:
      t("partnerNotification.event.assignment_replaced") ?? "派車已更換",
    eta_changed: t("partnerNotification.event.eta_changed") ?? "ETA 變更",
    driver_arrived:
      t("partnerNotification.event.driver_arrived") ?? "駕駛已抵達",
    receipt_ready: t("partnerNotification.event.receipt_ready") ?? "收據就緒",
  };
  const PN_EVENTS: [string, string, string][] = Object.entries(
    PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
  ).map(([k, v]) => [k, v, ZH_MAP[k] || k]);

  return (
    <div
      style={{
        padding: 24,
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!canWriteBinding && (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="lock"
            title={t("partnerNotification.permissionDenied") ?? "權限不足"}
            body="您沒有本 entry 綁定的寫入權限，無法儲存（需要 entry 對應之 foundation/tenant write 權限）。"
          />
        )}
        {saveState === "failed" && (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={t("partnerNotification.saveFailed") ?? "儲存失敗"}
            body={error?.message || "請檢查連線或重試。"}
          />
        )}
        {error?.kind === "409" &&
          error.code === "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT" && (
            <CanvasBanner
              theme={th}
              tone="warn"
              icon="warn"
              title={`綁定已被他人更新（expectedVersion ${editExpectedVersion}）`}
              body="您的選擇已保留。請重新載入後再儲存；不會靜默覆寫。"
              actions={
                <CanvasBtn
                  theme={th}
                  size="xs"
                  variant="primary"
                  icon="refresh"
                  onClick={onReload}
                >
                  {t("partnerNotification.reload") ?? "重新載入"}
                </CanvasBtn>
              }
            />
          )}
        <CanvasCard
          theme={th}
          title={t("partnerNotification.editBinding.title") ?? "編輯通知綁定"}
          subtitle="PUT /partner-entries/:id/notification-binding · webhookId + eventTypes + expectedVersion"
        >
          <CanvasField
            theme={th}
            label="webhookId · 選擇既有 webhook"
            required
            hint="端點 URL、密鑰、逾時/重試由既有 webhook 管理維護，本頁不重複 CRUD"
          >
            {webhookError ? (
              <div style={{ fontSize: 12, color: th.danger, marginBottom: 8 }}>
                {webhookError === "Forbidden" ||
                webhookError === "missing_scope"
                  ? "無權限讀取端點列表 (需 tenant:webhooks:read)"
                  : `端點讀取失敗: ${webhookError}`}
              </div>
            ) : null}
            <select
              value={editWebhookId}
              onChange={(e) => setEditWebhookId(e.target.value)}
              disabled={isSaving || !!webhookError}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${th.border}`,
                borderRadius: 4,
                background: th.surfaceLo,
                color: th.text,
                fontSize: 13,
              }}
            >
              <option value="" disabled>
                {t("partnerNotification.selectWebhookEndpoint")}
              </option>
              {availableWebhooks?.map((wh: any) => (
                <option key={wh.webhookId} value={wh.webhookId}>
                  {wh.webhookId} ({wh.url})
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6 }}>
              {tenantId && canWriteWebhooks ? (
                <a
                  href={resolveCrossAppHref({
                    targetApp: "tenant-console",
                    route: `/api/auth/tenant/login?tenant_id=${encodeURIComponent(tenantId)}&redirect_uri=${encodeURIComponent("/webhooks")}`,
                    resourceType: "webhook",
                    resourceId: "",
                    openMode: "new_tab",
                    label: "Webhooks",
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <CanvasBtn theme={th} size="xs" variant="ghost" icon="ext">
                    {t("partnerNotification.webhookHelp") ??
                      "前往既有 /webhooks 管理（需 tenant:webhooks:write）"}
                  </CanvasBtn>
                </a>
              ) : (
                <CanvasBtn
                  theme={th}
                  size="xs"
                  variant="ghost"
                  icon="ext"
                  disabled
                >
                  {t("partnerNotification.webhookHelp") ??
                    "前往既有 /webhooks 管理（需 tenant:webhooks:write）"}
                </CanvasBtn>
              )}
            </div>
          </CanvasField>
          <CanvasField theme={th} label="eventTypes · 內部事件" required>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PN_EVENTS.map(([i, o, zh]) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <input
                    type="checkbox"
                    checked={editEventTypes.includes(i)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setEditEventTypes([...editEventTypes, i]);
                      else
                        setEditEventTypes(
                          editEventTypes.filter((x: string) => x !== i),
                        );
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10.5,
                      fontFamily: th.monoFamily,
                      color: th.textDim,
                    }}
                  >
                    → {o}
                  </span>
                  <span style={{ fontSize: 10.5, color: th.textDim }}>
                    {zh}
                  </span>
                </div>
              ))}
            </div>
          </CanvasField>
          <CanvasField
            theme={th}
            label="expectedVersion"
            hint="樂觀鎖 · 不符將回 409"
          >
            <input
              type="text"
              value={String(editExpectedVersion)}
              readOnly
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${th.border}`,
                borderRadius: 4,
                background: th.surfaceLo,
                color: th.textDim,
                fontSize: 13,
                fontFamily: th.monoFamily,
              }}
            />
          </CanvasField>
        </CanvasCard>
      </div>
      <CanvasCard
        theme={th}
        title={t("partnerNotification.summary.title") ?? "變更摘要"}
      >
        <CanvasDL
          theme={th}
          cols={1}
          items={[
            { k: "webhookId", v: editWebhookId || "未設定", mono: true },
            {
              k: "eventTypes",
              v: editEventTypes.length > 0 ? editEventTypes.join(", ") : "無",
            },
            {
              k: "expectedVersion",
              v: `${editExpectedVersion} → 儲存後 ${editExpectedVersion + 1}`,
              mono: true,
            },
          ]}
        />
        <div style={{ marginTop: 8 }}>
          <CanvasBanner
            theme={th}
            tone="info"
            icon="flags"
            body="儲存後綁定回到 test_pending；若 webhook 端點 fingerprint 改變，先前測試失效，需重測方可啟用。"
          />
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <CanvasBtn theme={th} disabled={isSaving} onClick={onCancel}>
            {t("partnerNotification.cancel") ?? "取消"}
          </CanvasBtn>
          <PanelActionBtn
            theme={th}
            descriptor={{
              action: "save",
              enabled: !isSaveDisabled,
              riskLevel: "medium",
            }}
            variant="primary"
            icon="check"
            label={isSaving ? "儲存中..." : "儲存"}
            en="save"
            onClick={onSave}
          />
        </div>
      </CanvasCard>
    </div>
  );
}

export function PartnerNotificationPanel({
  entrySlug,
  canWriteBinding,
  tenantId,
  canReadWebhooks,
  canWriteWebhooks,
}: {
  entrySlug: string;
  partnerName?: string;
  programName?: string;
  partnerId?: string;
  tenantId?: string;
  canWriteBinding?: boolean;
  canReadWebhooks?: boolean;
  canWriteWebhooks?: boolean;
}) {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const theme = buildCanvasTheme({ surface: "platform" });

  const [binding, setBinding] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [availableWebhooks, setAvailableWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    kind: "error" | "404" | "403" | "409";
    message: string;
    code?: string;
  } | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const currentRequest = React.useRef(0);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "failed">(
    "idle",
  );
  const [testingState, setTestingState] = useState<
    "idle" | "pending" | "rejected"
  >("idle");
  const [enableState, setEnableState] = useState<"idle" | "pending" | "failed">(
    "idle",
  );
  const [disableState, setDisableState] = useState<
    "idle" | "pending" | "failed"
  >("idle");
  const [resumeState, setResumeState] = useState<"idle" | "pending" | "failed">(
    "idle",
  );
  const [retryState, setRetryState] = useState<
    "idle" | "pending" | "failed" | "queued"
  >("idle");
  const [retryRowId, setRetryRowId] = useState<string | null>(null);
  const [retryErrorMsg, setRetryErrorMsg] = useState<string | null>(null);

  const [editWebhookId, setEditWebhookId] = useState("");
  const [editEventTypes, setEditEventTypes] = useState<string[]>([]);
  const [editExpectedVersion, setEditExpectedVersion] = useState(0);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const activeEntry = React.useRef(entrySlug);
  activeEntry.current = entrySlug;
  const fetchStateRef = React.useRef<any>(null);
  const pageRef = React.useRef(page);
  pageRef.current = page;

  const fetchState = useCallback(async () => {
    const reqId = ++currentRequest.current;
    setLoading(true);
    try {
      const p: Promise<any>[] = [
        (client as any).getPartnerEntryNotificationBinding(entrySlug),
        (client as any).listPartnerNotificationDeliveries(entrySlug, {
          pageSize: 50,
          page: pageRef.current,
        }),
      ];
      if (tenantId && canReadWebhooks) {
        p.push(
          (client as any).getList("/api/tenant/webhooks", {
            headers: { "x-tenant-id": tenantId },
          }),
        );
      }
      const _results = await Promise.allSettled(p);
      let bReq = _results[0] as any;
      const dReq = _results[1] as any;
      const wReq = tenantId && canReadWebhooks ? (_results[2] as any) : null;
      if (reqId !== currentRequest.current) return;

      if (
        bReq.status === "fulfilled" &&
        bReq.value &&
        wReq?.status === "fulfilled"
      ) {
        const ep = (wReq.value || []).find(
          (w: any) => w.webhookId === bReq.value.webhookId,
        );
        if (ep) {
          const material = JSON.stringify({
            url: ep.url,
            events: [...(ep.events || [])].sort(),
            secretVersion: ep.secretVersion,
            ownerRef: ep.ownerRef ?? null,
          });
          const encoder = new TextEncoder();
          const data = encoder.encode(material);
          const hashBuffer = await crypto.subtle.digest("SHA-256", data);
          if (reqId !== currentRequest.current) return;
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const fingerprint = hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          bReq = {
            ...bReq,
            value: {
              ...bReq.value,
              endpointFingerprint: fingerprint,
              endpointUrl: ep.url,
            },
          };
        }
      }

      if (bReq.status === "rejected") {
        const statusCode = bReq.reason?.statusCode;
        const errCode = bReq.reason?.code || bReq.reason?.error;
        if (statusCode === 404) {
          setBinding(null);
          setEditExpectedVersion(0);
          setError({ kind: "404", message: "Not found", code: errCode });
        } else if (statusCode === 403) {
          setError({ kind: "403", message: "Forbidden", code: errCode });
        } else if (statusCode === 409) {
          setError({
            kind: "409",
            message: bReq.reason?.message || "Conflict",
            code: errCode,
          });
        } else {
          setError({
            kind: "error",
            message: bReq.reason?.message || "Failed to load binding",
            code: errCode,
          });
        }
      } else {
        setBinding(bReq.value);
        setEditExpectedVersion(bReq.value?.version || 0);
        setError(null);
      }

      if (dReq.status === "fulfilled") {
        setDeliveries(dReq.value?.items || dReq.value || []);
        setTotal(dReq.value?.pageInfo?.totalItems ?? dReq.value?.total ?? 0);
        setDeliveryError(null);
      } else {
        setDeliveries([]);
        if (dReq.reason?.statusCode === 403) {
          setDeliveryError("無權限讀取派送紀錄 (Forbidden)");
        } else {
          setDeliveryError(dReq.reason?.message || "Failed to load deliveries");
        }
      }

      if (wReq) {
        if (wReq.status === "fulfilled") {
          setAvailableWebhooks(wReq.value || []);
          setWebhookError(null);
        } else if (wReq.reason?.statusCode === 403) {
          setWebhookError("Forbidden");
        } else {
          setWebhookError(wReq.reason?.message || "Failed to load webhooks");
        }
      } else {
        setAvailableWebhooks([]);
        setWebhookError(canReadWebhooks === false ? "missing_scope" : null);
      }
    } catch (err: any) {
      if (reqId !== currentRequest.current) return;
      setError({
        kind: "error",
        message: err.message,
        code: err.code || err.error,
      });
    } finally {
      if (reqId === currentRequest.current) {
        setLoading(false);
      }
    }
  }, [client, entrySlug, tenantId, canReadWebhooks]);

  fetchStateRef.current = fetchState;

  useEffect(() => {
    setBinding(null);
    setDeliveries([]);
    setAvailableWebhooks([]);
    setWebhookError(null);
    setError(null);
    setDeliveryError(null);
    setTestingState("idle");
    setEnableState("idle");
    setDisableState("idle");
    setResumeState("idle");
    setRetryState("idle");
    setRetryRowId(null);
    setIsEditing(false);
    setPage(1);
    setEditExpectedVersion(0);
    setEditWebhookId("");
    setEditEventTypes([]);
    setSaveState("idle");
  }, [entrySlug]);

  useEffect(() => {
    fetchState();
  }, [page, fetchState]);

  const currentMutationSession = React.useRef(0);
  useEffect(() => {
    currentMutationSession.current++;
    setTestingState("idle");
    setEnableState("idle");
    setDisableState("idle");
    setResumeState("idle");
    setRetryState("idle");
    setSaveState("idle");
    return () => {
      currentMutationSession.current++;
    };
  }, [client, entrySlug, tenantId, canWriteBinding, canReadWebhooks]);

  const handleSave = async () => {
    setSaveState("pending");
    const session = currentMutationSession.current;
    try {
      await (client as any).updatePartnerEntryNotificationBinding(entrySlug, {
        webhookId: editWebhookId,
        eventTypes: editEventTypes as any,
        expectedVersion: editExpectedVersion,
      });
      if (session !== currentMutationSession.current) return;
      setIsEditing(false);
      setSaveState("idle");
      fetchStateRef.current?.();
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setSaveState("failed");
      if (err.statusCode === 409) {
        setError({
          kind: "409",
          message: err.message,
          code: err.code || err.error,
        });
      } else {
        setError({
          kind: "error",
          message: err.message || "Save failed",
          code: err.code || err.error,
        });
      }
    }
  };

  const handleTest = async () => {
    setTestingState("pending");
    const session = currentMutationSession.current;
    try {
      const res = await (client as any).testPartnerEntryNotificationBinding(
        entrySlug,
      );
      if (session !== currentMutationSession.current) return;
      if (res.kind === "failed") {
        setTestingState("rejected");
        setError({
          kind: "error",
          message:
            "測試失敗：" + (res.failure?.detail || res.failure?.failureReason),
          code: res.failure?.failureReason,
        });
      } else {
        setTestingState("idle");
        fetchStateRef.current?.();
      }
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setTestingState("rejected");
      setError({
        kind: "error",
        message: err.message || "測試發生未預期錯誤",
        code: err.code || err.error,
      });
    }
  };

  const handleEnable = async () => {
    if (!binding) return;
    setEnableState("pending");
    const session = currentMutationSession.current;
    try {
      await (client as any).enablePartnerEntryNotificationBinding(
        entrySlug,
        binding.version,
      );
      if (session !== currentMutationSession.current) return;
      fetchStateRef.current?.();
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setError({
        kind: "error",
        message: err.message,
        code: err.code || err.error,
      });
      setEnableState("failed");
    } finally {
      if (session === currentMutationSession.current) {
        setEnableState((prev) => (prev === "pending" ? "idle" : prev));
      }
    }
  };

  const handleDisable = async () => {
    if (!binding) return;
    setDisableState("pending");
    const session = currentMutationSession.current;
    try {
      await (client as any).disablePartnerEntryNotificationBinding(
        entrySlug,
        binding.version,
      );
      if (session !== currentMutationSession.current) return;
      fetchStateRef.current?.();
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setError({
        kind: "error",
        message: err.message,
        code: err.code || err.error,
      });
      setDisableState("failed");
    } finally {
      if (session === currentMutationSession.current) {
        setDisableState((prev) => (prev === "pending" ? "idle" : prev));
      }
    }
  };

  const handleResumeLifecycle = async () => {
    if (!binding) return;
    setResumeState("pending");
    const session = currentMutationSession.current;
    try {
      const isStale =
        !binding.validatedAt ||
        binding.validatedEndpointFingerprint !== binding.endpointFingerprint;

      let currentVersion = binding.version;
      if (isStale) {
        const testRes = await (
          client as any
        ).testPartnerEntryNotificationBinding(entrySlug, currentVersion);
        if (session !== currentMutationSession.current) return;
        if (testRes.kind === "failed") {
          setError({
            kind: "error",
            message:
              "復原測試失敗：" +
              (testRes.failure?.detail || testRes.failure?.failureReason),
            code: testRes.failure?.failureReason,
          });
          setResumeState("failed");
          return;
        }
        currentVersion = testRes.version || currentVersion;
      }

      await (client as any).enablePartnerEntryNotificationBinding(
        entrySlug,
        currentVersion,
      );
      if (session !== currentMutationSession.current) return;
      fetchStateRef.current?.();
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setError({
        kind: "error",
        message: err.message,
        code: err.code || err.error,
      });
      setResumeState("failed");
    } finally {
      if (session === currentMutationSession.current) {
        setResumeState((prev) => (prev === "pending" ? "idle" : prev));
      }
    }
  };

  const handleRetry = async (outboxId: string) => {
    setRetryRowId(outboxId);
    setRetryState("pending");
    setRetryErrorMsg(null);
    const session = currentMutationSession.current;
    try {
      const outcome = await (client as any).retryPartnerNotificationDelivery(
        entrySlug,
        outboxId,
      );
      if (session !== currentMutationSession.current) return;
      if (outcome.kind === "failed") {
        setRetryState("failed");
        setRetryErrorMsg(
          outcome.failure?.detail ||
            outcome.failure?.failureReason ||
            "重試失敗",
        );
      } else {
        setRetryState("queued");
      }
      fetchStateRef.current?.();
    } catch (err: any) {
      if (session !== currentMutationSession.current) return;
      setRetryState("failed");
      setRetryErrorMsg(err.message || "發生錯誤");
    }
  };

  if (error?.kind === "403") {
    return (
      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <CanvasCard
          theme={theme}
          title={
            t("partnerNotification.scopeDeniedTitle") ??
            "403 · PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED（含 getBinding）"
          }
          padding={14}
        >
          <div style={{ padding: "18px 8px" }}>
            <CanvasEmptyState
              theme={theme}
              title={t("partnerNotification.permissionDenied")}
              body="您無此夥伴 entry 的存取範圍；綁定、派送紀錄與所有動作皆不可見。此頁不提供唯讀降級。"
            />
          </div>
        </CanvasCard>
      </div>
    );
  }

  if (isEditing) {
    return (
      <PnEditView
        theme={theme}
        editWebhookId={editWebhookId}
        setEditWebhookId={setEditWebhookId}
        editEventTypes={editEventTypes}
        setEditEventTypes={setEditEventTypes}
        editExpectedVersion={editExpectedVersion}
        saveState={saveState}
        error={error}
        onSave={handleSave}
        onCancel={() => {
          setIsEditing(false);
          if (binding) {
            setEditWebhookId(binding.webhookId || "");
            setEditEventTypes(binding.eventTypes || []);
          }
        }}
        onReload={() => fetchStateRef.current?.(false)}
        tenantId={tenantId}
        t={t}
        canWriteBinding={canWriteBinding}
        canWriteWebhooks={canWriteWebhooks}
        availableWebhooks={availableWebhooks}
        webhookError={webhookError}
      />
    );
  }

  let testStatus = "none";
  if (binding?.validatedEndpointFingerprint) {
    if (binding.validatedEndpointFingerprint === binding.endpointFingerprint) {
      testStatus = "passed_current";
    } else {
      testStatus = "passed_stale";
    }
  } else if (testingState === "rejected") {
    testStatus = "failed";
  }

  return (
    <div
      style={{
        padding: 24,
        display: "grid",
        gridTemplateColumns: "1.5fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error?.kind === "404" ? (
          <CanvasCard
            theme={theme}
            title="404 · PARTNER_NOTIFICATION_BINDING_NOT_FOUND"
            padding={14}
          >
            <CanvasBanner
              theme={theme}
              tone="info"
              icon="info"
              title={t("partnerNotification.notFound.title")}
              body="選擇既有 webhook 與事件即可建立。"
              actions={
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant="primary"
                  icon="plus"
                  onClick={() => {
                    setEditWebhookId("");
                    setEditEventTypes(Object.keys(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME));
                    setEditExpectedVersion(0);
                    setSaveState("idle");
                    setIsEditing(true);
                  }}
                  disabled={!canWriteBinding}
                >
                  {t("partnerNotification.createBinding") ?? "建立綁定"}
                </CanvasBtn>
              }
            />
          </CanvasCard>
        ) : (
          <PnBinding
            theme={theme}
            binding={binding}
            tenantId={tenantId}
            testStatus={testStatus}
            t={t}
            onEdit={() => {
              setEditWebhookId(binding?.webhookId || "");
              setEditEventTypes(binding?.eventTypes || Object.keys(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME));
              setIsEditing(true);
            }}
            canWriteBinding={canWriteBinding}
            canWriteWebhooks={canWriteWebhooks}
          />
        )}

        <PnDeliveries
          theme={theme}
          loading={loading}
          deliveries={deliveries}
          retryState={retryState}
          retryRowId={retryRowId}
          retryError={retryErrorMsg}
          onRetry={handleRetry}
          onRefresh={fetchState}
          t={t}
          canWriteBinding={canWriteBinding}
          bindingState={binding?.state}
          page={page}
          total={total}
          onPageChange={setPage}
        />
        {deliveryError && (
          <div style={{ marginTop: 8 }}>
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              body={deliveryError}
            />
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error?.kind && error.kind !== "404" && error.kind !== "409" ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            body={error.message || "發生錯誤"}
          />
        ) : null}

        <PnLifecycle
          theme={theme}
          binding={binding}
          testStatus={testStatus}
          testingState={testingState}
          enableState={enableState}
          disableState={disableState}
          resumeState={resumeState}
          canWriteBinding={canWriteBinding}
          onTest={handleTest}
          onEnable={handleEnable}
          onDisable={handleDisable}
          onResume={handleResumeLifecycle}
          t={t}
        />

        <CanvasCard
          theme={theme}
          title={
            t("partnerNotification.deliverySummary") ?? "近期派送摘要 (本頁)"
          }
          subtitle="「已接受」≠ 裝置已收到"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <CanvasKPI
              theme={theme}
              label="端點已接受"
              value={deliveries
                .filter(
                  (d: any) =>
                    d.deliveryStage === "partner_accepted" && !!d.receiptId,
                )
                .length.toString()}
            />
            <CanvasKPI
              theme={theme}
              label="ack 不符"
              value={deliveries
                .filter((d: any) => d.failureReason === "partner_ack_invalid")
                .length.toString()}
            />
            <CanvasKPI
              theme={theme}
              label="失敗/耗盡"
              value={deliveries
                .filter(
                  (d: any) =>
                    d.status === "failed" || d.status === "budget_exhausted",
                )
                .length.toString()}
            />
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
