"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AuditLogRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantSlaProfile,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  recalculateTenantSlaBookingsAction,
  type SlaFlashPayload,
  updateTenantSlaProfileAction,
} from "./actions";

type RefreshSnapshot = {
  tierLabel: string;
  freshness: "fresh" | "stale" | "degraded" | "unknown";
  generatedAt: string | null;
  sourceLabel: string;
  synthetic: boolean;
};

type SlaProfileManagerProps = {
  profile: TenantSlaProfile | null;
  governance: TenantIntegrationGovernancePackage | null;
  latestAudit: AuditLogRecord | null;
  errors: string[];
  emptyReason: EmptyReason | null;
  refresh: RefreshSnapshot;
  availableActions: ResourceActionDescriptor[];
  opsConsoleUrl: string;
  platformAdminUrl: string;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const thresholdGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const footerStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const fieldInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.monoFamily,
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...fieldInputStyle,
  fontFamily: th.fontFamily,
  minHeight: 78,
  resize: "vertical",
};

const mutedCopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.55,
};

const linkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const linkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  textDecoration: "none",
  color: th.text,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const emptyShellStyle: CSSProperties = {
  padding: "28px 20px",
  borderRadius: 10,
  border: `1px dashed ${th.border}`,
  background: th.surfaceLo,
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 15,
};

const emptyCodeStyle: CSSProperties = {
  color: th.textDim,
  fontFamily: th.monoFamily,
  fontSize: 11,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.55,
  maxWidth: 420,
  margin: "0 auto",
};

const receiptListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.6,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  actionName: string,
) {
  return actions.find((action) => action.action === actionName) ?? null;
}

function getActionTone(descriptor: ResourceActionDescriptor | null) {
  if (!descriptor?.enabled) return "neutral";
  if (descriptor.riskLevel === "high") return "danger";
  if (descriptor.riskLevel === "medium") return "accent";
  return "info";
}

function getRefreshTone(refresh: RefreshSnapshot) {
  switch (refresh.freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    default:
      return "neutral";
  }
}

function getRefreshLabel(refresh: RefreshSnapshot) {
  switch (refresh.freshness) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    case "degraded":
      return "degraded";
    default:
      return "unknown";
  }
}

function getActorLabel(audit: AuditLogRecord | null) {
  if (!audit) return "—";

  const actorTypeLabel = {
    system: "system",
    platform_admin: "platform",
    tenant_admin: "tenant",
    ops_user: "ops",
    partner_api_key: "partner",
  }[audit.actorType];

  return audit.actorId
    ? `${audit.actorId} · ${actorTypeLabel}`
    : `${actorTypeLabel} actor`;
}

function getEmptyCopy(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未建立 SLA profile",
        body: "租戶還沒有可用的 wait / arrival / completion 門檻。先完成 tenant provisioning，才能開始寫入分鐘制 SLA。",
      };
    case "fetch_failed":
      return {
        title: "SLA profile 載入失敗",
        body: "後端沒有提供可用 snapshot。請先檢查 tenant API health，再重新整理本頁。",
      };
    case "permission_denied":
      return {
        title: "目前角色無法讀取 SLA",
        body: "這個 surface 只在 backend 授權後才會回資料。若你本來應該有權限，請確認租戶角色或 cross-tenant context。",
      };
    case "external_unavailable":
      return {
        title: "外部 SLA 相依目前不可用",
        body: "頁面保留框架，但依賴服務未就緒，因此無法提供最新 SLA 治理狀態。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有結果",
        body: "這個畫面支援 distinct empty-state contract。調整 filter / preview 參數後，可回到有資料的 SLA snapshot。",
      };
    default:
      return {
        title: "目前沒有 SLA data",
        body: "租戶暫時沒有可顯示的 SLA profile 資料。這和 not_provisioned 不同，表示 surface 已存在，但當前沒有可呈現資料。",
      };
  }
}

export function SlaProfileManager({
  profile,
  governance,
  latestAudit,
  errors,
  emptyReason,
  refresh,
  availableActions,
  opsConsoleUrl,
  platformAdminUrl,
}: SlaProfileManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<SlaFlashPayload | null>(null);
  const [waitThresholdMin, setWaitThresholdMin] = useState(
    String(profile?.waitThresholdMin ?? 5),
  );
  const [arrivalThresholdMin, setArrivalThresholdMin] = useState(
    String(profile?.arrivalThresholdMin ?? 8),
  );
  const [completionThresholdMin, setCompletionThresholdMin] = useState(
    String(profile?.completionThresholdMin ?? 15),
  );
  const [reason, setReason] = useState("");

  const saveAction = getActionDescriptor(availableActions, "save");
  const recalculateAction = getActionDescriptor(
    availableActions,
    "recalculate",
  );

  function runAction(
    action: (formData: FormData) => Promise<SlaFlashPayload>,
    formData: FormData,
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);
      if (result.tone === "default") {
        router.refresh();
      }
    });
  }

  function buildUpdateFormData() {
    const formData = new FormData();
    formData.set("waitThresholdMin", waitThresholdMin);
    formData.set("arrivalThresholdMin", arrivalThresholdMin);
    formData.set("completionThresholdMin", completionThresholdMin);
    formData.set("reason", reason);
    return formData;
  }

  function buildRecalculateFormData() {
    const formData = new FormData();
    formData.set("reason", reason);
    return formData;
  }

  function renderPrimaryBanner() {
    if (flash) {
      return (
        <CanvasBanner
          theme={th}
          tone={flash.tone === "warning" ? "warn" : "success"}
          icon="warn"
          title={flash.title}
          body={flash.description}
        />
      );
    }

    if (refresh.freshness === "stale") {
      return (
        <CanvasBanner
          theme={th}
          tone="warn"
          icon="warn"
          title="資料已進入 stale 視窗"
          body={`SLA profile 屬於 ${refresh.tierLabel}。請重新整理以拉回最新 snapshot。`}
        />
      );
    }

    if (refresh.freshness === "degraded") {
      return (
        <CanvasBanner
          theme={th}
          tone="warn"
          icon="warn"
          title="SLA surface degraded"
          body="部分 SLA 依賴或治理資料無法同步，畫面保留最後可用 snapshot 並要求人工 refresh。"
        />
      );
    }

    return (
      <CanvasBanner
        theme={th}
        tone="info"
        icon="warn"
        title="變更影響範圍 · Q-TEN07"
        body="變更只影響新建立的訂單，及之後重新計算的 SLA event。既有訂單保留建立時 snapshot，除非管理員另行觸發重算命令。"
      />
    );
  }

  function renderEmptyState() {
    if (!emptyReason) return null;
    const copy = getEmptyCopy(emptyReason);

    return (
      <div style={emptyShellStyle}>
        <div style={emptyTitleStyle}>{copy.title}</div>
        <div style={emptyCodeStyle}>{emptyReason}</div>
        <div style={emptyBodyStyle}>{copy.body}</div>
        <div style={actionRowStyle}>
          <CanvasBtn
            theme={th}
            icon="refresh"
            size="sm"
            onClick={() => router.refresh()}
          >
            重新整理
          </CanvasBtn>
          <CanvasBtn
            theme={th}
            variant="primary"
            icon="ext"
            size="sm"
            onClick={() =>
              window.open("/audit?resourceType=tenant_sla", "_self")
            }
          >
            前往 tenant audit
          </CanvasBtn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="SLA Profile"
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘 (Q-TEN07)"
        actions={
          <>
            <CanvasPill theme={th} tone={getRefreshTone(refresh)} dot>
              {refresh.tierLabel} · {getRefreshLabel(refresh)}
            </CanvasPill>
            <CanvasBtn
              theme={th}
              icon="refresh"
              size="sm"
              onClick={() => router.refresh()}
            >
              重新整理
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {renderPrimaryBanner()}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 SLA 資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin"
            subtitle="availableActions 驅動 CTA；高風險動作需原因。"
          >
            {emptyReason ? (
              renderEmptyState()
            ) : (
              <>
                <div style={thresholdGridStyle}>
                  <CanvasField
                    theme={th}
                    label="waitThresholdMin · 等候門檻"
                    hint="超過此分鐘數標記為 wait 違規"
                    required
                  >
                    <input
                      value={waitThresholdMin}
                      onChange={(event) =>
                        setWaitThresholdMin(event.target.value)
                      }
                      style={fieldInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="arrivalThresholdMin · 抵達門檻"
                    hint="ETA 與實際抵達差異上限"
                    required
                  >
                    <input
                      value={arrivalThresholdMin}
                      onChange={(event) =>
                        setArrivalThresholdMin(event.target.value)
                      }
                      style={fieldInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="completionThresholdMin · 完成門檻"
                    hint="預估 vs 實際行車時間差異上限"
                    required
                  >
                    <input
                      value={completionThresholdMin}
                      onChange={(event) =>
                        setCompletionThresholdMin(event.target.value)
                      }
                      style={fieldInputStyle}
                    />
                  </CanvasField>
                </div>

                <div style={{ height: 12 }} />

                <CanvasField
                  theme={th}
                  label="原因 · reason"
                  hint="高風險動作會把原因帶進 audit follow-up。"
                  required
                >
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    style={textareaStyle}
                    placeholder="請說明為何調整 SLA 門檻或觸發重算…"
                  />
                </CanvasField>

                <div style={footerStyle}>
                  <div style={mutedCopyStyle}>
                    Current snapshot: {formatDateTime(profile?.updatedAt)} ·
                    Updated by {getActorLabel(latestAudit)}
                  </div>
                  <div style={actionRowStyle}>
                    <span title={recalculateAction?.disabledReasonCode}>
                      <CanvasBtn
                        theme={th}
                        size="sm"
                        disabled={!recalculateAction?.enabled || pending}
                        onClick={() =>
                          runAction(
                            recalculateTenantSlaBookingsAction,
                            buildRecalculateFormData(),
                          )
                        }
                      >
                        重算既有訂單
                      </CanvasBtn>
                    </span>
                    <span title={saveAction?.disabledReasonCode}>
                      <CanvasBtn
                        theme={th}
                        variant="primary"
                        size="sm"
                        disabled={!saveAction?.enabled || pending}
                        onClick={() =>
                          runAction(
                            updateTenantSlaProfileAction,
                            buildUpdateFormData(),
                          )
                        }
                      >
                        {pending ? "儲存中..." : "儲存設定"}
                      </CanvasBtn>
                    </span>
                  </div>
                </div>
              </>
            )}
          </CanvasCard>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={th} title="治理與刷新">
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "tenantId",
                    v: profile?.tenantId ?? governance?.tenantId ?? "—",
                    mono: true,
                  },
                  {
                    k: "updatedAt",
                    v: formatDateTime(profile?.updatedAt),
                    mono: true,
                  },
                  {
                    k: "updated by",
                    v: getActorLabel(latestAudit),
                    mono: true,
                  },
                  { k: "refresh tier", v: refresh.tierLabel, mono: true },
                  {
                    k: "snapshot",
                    v: formatDateTime(refresh.generatedAt),
                    mono: true,
                  },
                  { k: "source", v: refresh.sourceLabel, mono: true },
                ]}
              />

              <div style={{ height: 14 }} />
              <div style={actionRowStyle}>
                {[saveAction, recalculateAction]
                  .filter(Boolean)
                  .map((action) => (
                    <CanvasPill
                      key={action?.action}
                      theme={th}
                      tone={getActionTone(action ?? null)}
                    >
                      {action?.action}
                      {action?.enabled
                        ? ` · ${action?.riskLevel}`
                        : ` · ${action?.disabledReasonCode ?? "disabled"}`}
                    </CanvasPill>
                  ))}
              </div>

              {refresh.synthetic ? (
                <div style={{ ...mutedCopyStyle, marginTop: 14 }}>
                  Refresh metadata is currently synthesized from the latest SLA
                  timestamps because the tenant SLA endpoint does not yet emit
                  `UiRefreshMetadata`.
                </div>
              ) : null}
            </CanvasCard>

            <CanvasCard theme={th} title="Cross-app deep links">
              <div style={linkListStyle}>
                <a
                  href={`${platformAdminUrl}/audit?tenantId=${encodeURIComponent(profile?.tenantId ?? governance?.tenantId ?? "tenant-demo-001")}&resourceType=tenant_sla`}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  <span>Platform Admin · tenant governance audit</span>
                  <span style={emptyCodeStyle}>new tab</span>
                </a>
                <a
                  href={`${opsConsoleUrl}/audit?tenantId=${encodeURIComponent(profile?.tenantId ?? governance?.tenantId ?? "tenant-demo-001")}&resourceType=tenant_sla`}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  <span>Ops Console · SLA incident follow-up</span>
                  <span style={emptyCodeStyle}>new tab</span>
                </a>
                <Link href="/audit?resourceType=tenant_sla" style={linkStyle}>
                  <span>Tenant Console · audit trail</span>
                  <span style={emptyCodeStyle}>same app</span>
                </Link>
              </div>
            </CanvasCard>

            <CanvasCard theme={th} title="Operational notes">
              <ul style={receiptListStyle}>
                <li>變更後只影響新建立訂單與後續 SLA event 計算。</li>
                <li>既有訂單保留 creation-time snapshot，直到重算命令可用。</li>
                <li>
                  Baseline webhook events:{" "}
                  {String(governance?.baselineWebhookEvents.length ?? 0)}
                </li>
                <li>
                  Onboarding checklist:{" "}
                  {String(governance?.onboardingChecklist.length ?? 0)}
                </li>
              </ul>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
