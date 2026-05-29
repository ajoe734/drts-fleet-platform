"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantSlaProfile,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { updateSlaProfileAction } from "./actions";
import {
  REFRESH_TIER_LABEL,
  SLA_ACTION_META,
  SLA_ACTION_RECALCULATE,
  SLA_ACTION_UPDATE,
  SLA_DISABLED_REASON_LABEL,
  SLA_EMPTY_REASON_META,
  type SlaEmptyReason,
  type SlaFlashPayload,
} from "./constants";

type SlaProfileManagerProps = {
  profile: TenantSlaProfile | null;
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata;
  availableActions: ResourceActionDescriptor[];
  crossAppLink: CrossAppResourceLink;
  refreshTier: RefreshTier;
  errors: string[];
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

const profileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 16,
};

const thresholdGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: th.text,
  marginBottom: 5,
};

const fieldHintStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  marginTop: 4,
  lineHeight: 1.35,
};

const numberInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.monoFamily,
  boxSizing: "border-box",
};

const reasonInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 60,
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
  resize: "vertical",
};

const footerStyle: CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const freshnessMetaStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  fontFamily: th.monoFamily,
};

const emptyStateCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 12,
  padding: "40px 24px",
};

const emptyIconWrapStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: th.surfaceLo,
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  fontSize: 12.5,
  color: th.textMuted,
  lineHeight: 1.5,
  maxWidth: 420,
};

const messageCodeStyle: CSSProperties = {
  fontSize: 10.5,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : dateTimeFormatter.format(parsed);
}

function freshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
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

const FRESHNESS_LABEL: Record<UiRefreshMetadata["dataFreshness"], string> = {
  fresh: "fresh",
  stale: "stale",
  degraded: "degraded",
  unknown: "unknown",
};

export function SlaProfileManager({
  profile,
  emptyState,
  refreshMetadata,
  availableActions,
  crossAppLink,
  refreshTier,
  errors,
}: SlaProfileManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<SlaFlashPayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [draftWait, setDraftWait] = useState(
    profile ? String(profile.waitThresholdMin) : "",
  );
  const [draftArrival, setDraftArrival] = useState(
    profile ? String(profile.arrivalThresholdMin) : "",
  );
  const [draftCompletion, setDraftCompletion] = useState(
    profile ? String(profile.completionThresholdMin) : "",
  );

  const updateAction = availableActions.find(
    (action) => action.action === SLA_ACTION_UPDATE,
  );
  const recalculateAction = availableActions.find(
    (action) => action.action === SLA_ACTION_RECALCULATE,
  );

  function handleRefresh() {
    setFlash(null);
    router.refresh();
  }

  function submitUpdate() {
    const formData = new FormData();
    formData.set("waitThresholdMin", draftWait.trim());
    formData.set("arrivalThresholdMin", draftArrival.trim());
    formData.set("completionThresholdMin", draftCompletion.trim());
    formData.set("reason", reason.trim());

    startTransition(async () => {
      const result = await updateSlaProfileAction(formData);
      setFlash(result);
      if (result.tone === "default") {
        setConfirming(false);
        setEditing(false);
        setReason("");
        router.refresh();
      }
    });
  }

  function renderRefreshAffordance() {
    return (
      <div style={freshnessRowStyle}>
        <CanvasPill
          theme={th}
          tone={freshnessTone(refreshMetadata.dataFreshness)}
          dot
        >
          {FRESHNESS_LABEL[refreshMetadata.dataFreshness]}
        </CanvasPill>
        <span style={freshnessMetaStyle}>
          tier {refreshTier} · {REFRESH_TIER_LABEL[refreshTier]} ·{" "}
          {refreshMetadata.source} ·{" "}
          {formatDateTime(refreshMetadata.generatedAt)}
        </span>
        <CanvasBtn
          theme={th}
          icon="arrow"
          size="sm"
          onClick={handleRefresh}
          disabled={pending}
        >
          更新
        </CanvasBtn>
      </div>
    );
  }

  function renderFlash() {
    if (!flash) {
      return null;
    }
    return (
      <CanvasBanner
        theme={th}
        tone={flash.tone === "warning" ? "warn" : "success"}
        icon={flash.tone === "warning" ? "warn" : "check"}
        title={flash.title}
        body={flash.description}
      />
    );
  }

  function renderThresholdForm() {
    const reasonRequired = updateAction?.requiresReason ?? false;
    const reasonMissing = reasonRequired && reason.trim().length === 0;

    return (
      <>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title="變更影響範圍 · Q-TEN07"
          body="變更只影響新建立的訂單，及之後計算的 SLA event。既有訂單會保留建立時的 SLA snapshot，除非管理員執行 recalculate 命令。"
        />
        <div style={{ height: 14 }} />
        <div style={thresholdGridStyle}>
          <div>
            <label style={fieldLabelStyle}>waitThresholdMin · 等候門檻</label>
            <input
              type="number"
              min={1}
              step={1}
              value={draftWait}
              onChange={(event) => setDraftWait(event.target.value)}
              style={numberInputStyle}
              disabled={pending}
            />
            <div style={fieldHintStyle}>超過此分鐘數標記為 wait 違規</div>
          </div>
          <div>
            <label style={fieldLabelStyle}>
              arrivalThresholdMin · 抵達門檻
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={draftArrival}
              onChange={(event) => setDraftArrival(event.target.value)}
              style={numberInputStyle}
              disabled={pending}
            />
            <div style={fieldHintStyle}>ETA 與實際抵達差異上限（分鐘）</div>
          </div>
          <div>
            <label style={fieldLabelStyle}>
              completionThresholdMin · 完成門檻
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={draftCompletion}
              onChange={(event) => setDraftCompletion(event.target.value)}
              style={numberInputStyle}
              disabled={pending}
            />
            <div style={fieldHintStyle}>
              預估 vs 實際行車時間差異上限（分鐘）
            </div>
          </div>
        </div>

        {confirming ? (
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabelStyle}>變更原因（高風險操作必填）</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="例如：依 Q2 營運檢討調整等候門檻"
              style={reasonInputStyle}
              disabled={pending}
            />
            <div style={fieldHintStyle}>
              {SLA_ACTION_META[SLA_ACTION_UPDATE]?.help}
            </div>
          </div>
        ) : null}

        <div style={footerStyle}>
          {recalculateAction ? (
            <span
              title={
                recalculateAction.disabledReasonCode
                  ? SLA_DISABLED_REASON_LABEL[
                      recalculateAction.disabledReasonCode
                    ]
                  : undefined
              }
            >
              <CanvasBtn
                theme={th}
                size="sm"
                disabled={!recalculateAction.enabled || pending}
              >
                {SLA_ACTION_META[SLA_ACTION_RECALCULATE]?.label}
              </CanvasBtn>
            </span>
          ) : null}

          {confirming ? (
            <>
              <CanvasBtn
                theme={th}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setReason("");
                }}
                disabled={pending}
              >
                取消
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="check"
                size="sm"
                onClick={submitUpdate}
                disabled={pending || reasonMissing}
              >
                {pending ? "儲存中..." : "確認儲存"}
              </CanvasBtn>
            </>
          ) : updateAction ? (
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              size="sm"
              onClick={() => {
                setFlash(null);
                setConfirming(true);
              }}
              disabled={!updateAction.enabled || pending}
            >
              {SLA_ACTION_META[SLA_ACTION_UPDATE]?.label}
            </CanvasBtn>
          ) : null}
        </div>
      </>
    );
  }

  function renderMetadataCard() {
    return (
      <CanvasCard theme={th} title="效果範圍與稽核">
        <CanvasDL
          theme={th}
          cols={1}
          items={[
            { k: "tenantId", v: profile?.tenantId ?? "—", mono: true },
            {
              k: "updatedAt",
              v: formatDateTime(profile?.updatedAt),
              mono: true,
            },
            {
              k: "資料來源",
              v: `${refreshMetadata.source} · ${FRESHNESS_LABEL[refreshMetadata.dataFreshness]}`,
              mono: true,
            },
            { k: "refresh tier", v: `${refreshTier} (T5)`, mono: true },
          ]}
        />
        <div style={{ ...fieldHintStyle, marginTop: 12 }}>
          門檻屬租戶層級設定，變更套用至新訂單；既有訂單保留建立時的 SLA
          snapshot。變更者紀錄可於稽核軌跡查詢。
        </div>
        <div style={{ ...footerStyle, justifyContent: "flex-start" }}>
          <CanvasBtn
            theme={th}
            icon="audit"
            size="sm"
            onClick={() => router.push("/audit?resourceType=tenant_sla")}
          >
            稽核軌跡
          </CanvasBtn>
          <a
            href={crossAppLink.route}
            target={crossAppLink.openMode === "new_tab" ? "_blank" : undefined}
            rel={
              crossAppLink.openMode === "new_tab"
                ? "noopener noreferrer"
                : undefined
            }
            style={{ textDecoration: "none" }}
          >
            <CanvasBtn theme={th} icon="ext" size="sm">
              {crossAppLink.label}
            </CanvasBtn>
          </a>
        </div>
      </CanvasCard>
    );
  }

  function renderEmptyState(envelope: EmptyStateEnvelope) {
    const meta = SLA_EMPTY_REASON_META[envelope.reason as SlaEmptyReason];
    const canConfigure = envelope.reason === "not_provisioned";

    return (
      <CanvasCard theme={th} padding={0}>
        <div style={emptyStateCardStyle}>
          <div style={emptyIconWrapStyle}>
            <CanvasIcon name={meta.icon} size={20} />
          </div>
          <CanvasPill theme={th} tone={meta.tone} dot>
            {envelope.reason}
          </CanvasPill>
          <div style={emptyTitleStyle}>{meta.title}</div>
          <div style={emptyBodyStyle}>{meta.body}</div>
          <span style={messageCodeStyle}>{envelope.messageCode}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {canConfigure && envelope.nextAction ? (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                size="sm"
                onClick={() => {
                  setFlash(null);
                  setEditing(true);
                }}
              >
                設定 SLA 門檻
              </CanvasBtn>
            ) : null}
            <CanvasBtn
              theme={th}
              icon="arrow"
              size="sm"
              onClick={handleRefresh}
              disabled={pending}
            >
              重新整理
            </CanvasBtn>
          </div>
        </div>
      </CanvasCard>
    );
  }

  // not_provisioned + admin clicked "設定 SLA 門檻" → show the editable form
  // (with empty drafts) using the same wired update action.
  const showForm = profile !== null || editing;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="SLA Profile"
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘 (Q-TEN07)"
        actions={renderRefreshAffordance()}
      />

      <div style={pageBodyStyle}>
        {renderFlash()}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 SLA 資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {emptyState && !showForm ? (
          renderEmptyState(emptyState)
        ) : (
          <div style={profileGridStyle}>
            <CanvasCard
              theme={th}
              title="當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin"
            >
              {renderThresholdForm()}
            </CanvasCard>
            {renderMetadataCard()}
          </div>
        )}
      </div>
    </div>
  );
}
