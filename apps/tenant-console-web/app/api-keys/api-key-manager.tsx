"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ResourceActionDescriptor } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  issueTenantApiKeyAction,
  revokeTenantApiKeyAction,
  rotateTenantApiKeyAction,
} from "./actions";
import type { ApiKeyFlashPayload } from "./constants";
import {
  API_KEYS_REFRESH_TIER_LABEL,
  API_KEY_EMPTY_REASON_CODES,
  type ApiKeyEmptyReason,
  type ApiKeyRuntimeRecord,
  type ApiKeyState,
} from "./runtime";
import type { ApiKeyManagerProps } from "./page";

type ApiKeyRow = ApiKeyRuntimeRecord & Record<string, unknown>;
type StatusFilter = "all" | ApiKeyState;

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

const actionCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const scopeGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const formFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 4,
};

const formNoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  lineHeight: 1.45,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 10px",
  fontSize: 12,
  height: 28,
  fontWeight: 500,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
};

const filterFieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const filterLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: th.textMuted,
};

const selectStyle: CSSProperties = {
  ...nativeInputStyle,
  height: 32,
  width: "auto",
  minWidth: 150,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const nameMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const actionCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const inlineActionStyle: CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: th.accent,
  fontSize: 11.5,
  fontFamily: th.fontFamily,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  textDecoration: "none",
};

const inlineDangerActionStyle: CSSProperties = {
  ...inlineActionStyle,
  color: th.danger,
};

const inlineDisabledActionStyle: CSSProperties = {
  ...inlineActionStyle,
  color: th.textMuted,
  cursor: "not-allowed",
};

const scopeTextStyle: CSSProperties = {
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const crossAppRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const crossAppLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.infoBorder}`,
  background: th.infoBg,
  color: th.info,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
};

const refreshBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  height: 28,
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: th.fontFamily,
};

const sectionLabelStyle: CSSProperties = {
  marginTop: 14,
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const aliasListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.5,
};

// --- empty state -----------------------------------------------------------

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "32px 22px",
};

// --- modal overlay ---------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4, 8, 14, 0.66)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const modalStyle: CSSProperties = {
  width: "min(520px, 100%)",
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.45)",
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: th.text,
};

const modalBodyStyle: CSSProperties = {
  fontSize: 12.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const plaintextKeyStyle: CSSProperties = {
  display: "block",
  background: "rgba(6, 11, 19, 0.72)",
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "10px 12px",
  color: th.text,
  fontSize: 12,
  fontFamily: th.monoFamily,
  overflowX: "auto",
  wordBreak: "break-all",
};

const reasonInputStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 64,
  resize: "vertical",
};

const ackRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  color: th.text,
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
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return dateTimeFormatter.format(parsed);
}

const STATE_TONE: Record<ApiKeyState, CanvasTone> = {
  active: "success",
  expiring: "warn",
  expired: "neutral",
  revoked: "danger",
};

const STATE_LABEL: Record<ApiKeyState, string> = {
  active: "active",
  expiring: "expiring",
  expired: "expired",
  revoked: "revoked",
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部狀態" },
  { value: "active", label: "有效 active" },
  { value: "expiring", label: "即將到期 expiring" },
  { value: "expired", label: "已過期 expired" },
  { value: "revoked", label: "已撤銷 revoked" },
];

function actionLabel(action: string): string {
  switch (action) {
    case "issue":
      return "建立金鑰";
    case "rotate":
      return "輪替";
    case "revoke":
      return "撤銷";
    case "open_audit":
      return "稽核紀錄";
    default:
      return action;
  }
}

function disabledReasonLabel(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }
  switch (code) {
    case "already_revoked":
      return "金鑰已撤銷，無法再操作。";
    case "governance_unavailable":
      return "整合治理政策尚未載入，暫時無法建立金鑰。";
    default:
      return code;
  }
}

function riskMeta(action: ResourceActionDescriptor): string {
  const risk =
    action.riskLevel === "high"
      ? "高風險"
      : action.riskLevel === "medium"
        ? "中風險"
        : "低風險";
  return action.requiresReason ? `${risk} · 需填原因` : risk;
}

type SecretReveal = {
  title: string;
  description: string;
  plaintextKey: string;
};

type ConfirmTarget = {
  kind: "rotate" | "revoke";
  row: ApiKeyRuntimeRecord;
};

type ApiKeyEmptyIcon =
  | "warn"
  | "users"
  | "adapters"
  | "health"
  | "filter"
  | "apiKeys";

type EmptyStateView = {
  tone: CanvasTone;
  icon: ApiKeyEmptyIcon;
  title: string;
  description: string;
  action: {
    label: string;
    href?: string;
    newTab?: boolean;
    onClick?: () => void;
  } | null;
};

export function ApiKeyManager({
  rows,
  governance,
  pageActions,
  crossAppLinks,
  refresh,
  health,
  serverEmptyReason,
  errors,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [secret, setSecret] = useState<SecretReveal | null>(null);
  const [secretAck, setSecretAck] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );
  const [confirmReason, setConfirmReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [showPolicyCard, setShowPolicyCard] = useState(false);
  const [stale, setStale] = useState(refresh.dataFreshness !== "fresh");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allowedScopes = useMemo(
    () => governance?.apiKeyPolicy.allowedScopes ?? [],
    [governance],
  );
  const compatibilityAliases = Object.entries(
    governance?.apiKeyPolicy.compatibilityAliases ?? {},
  );

  const [draftName, setDraftName] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftScopes, setDraftScopes] = useState<string[]>(allowedScopes);

  useEffect(() => {
    setDraftScopes((current) => {
      const filtered = current.filter((scope) => allowedScopes.includes(scope));
      return filtered.length > 0 ? filtered : [...allowedScopes];
    });
  }, [allowedScopes]);

  // T5 tenant-slow tier (packet §3.2): reset freshness on every new snapshot,
  // mark stale once the snapshot ages past staleAfterMs, and auto-poll at the
  // tier cadence. A manual refresh affordance is always available.
  useEffect(() => {
    setStale(refresh.dataFreshness !== "fresh");
  }, [refresh.generatedAt, refresh.dataFreshness]);

  useEffect(() => {
    const generatedMs = Date.parse(refresh.generatedAt);
    if (Number.isNaN(generatedMs)) {
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() - generatedMs > refresh.staleAfterMs) {
        setStale(true);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [refresh.generatedAt, refresh.staleAfterMs]);

  useEffect(() => {
    const poll = setInterval(() => {
      router.refresh();
    }, refresh.staleAfterMs);
    return () => clearInterval(poll);
  }, [router, refresh.staleAfterMs]);

  const refreshNow = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  function resetCreateDraft() {
    setDraftName("");
    setDraftExpiresAt("");
    setDraftScopes([...allowedScopes]);
  }

  function toggleScope(scope: string) {
    setDraftScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    );
  }

  function runAction(
    action: (formData: FormData) => Promise<ApiKeyFlashPayload>,
    formData: FormData,
    options?: { onSuccess?: () => void },
  ) {
    startTransition(async () => {
      const result = await action(formData);

      if (result.tone === "default" && result.plaintextKey) {
        setSecretAck(false);
        setSecret({
          title: result.title,
          description: result.description,
          plaintextKey: result.plaintextKey,
        });
        setFlash(null);
      } else {
        setFlash(result);
      }

      if (result.tone === "default") {
        options?.onSuccess?.();
        router.refresh();
      }
    });
  }

  function submitCreate() {
    const formData = new FormData();
    formData.set("keyName", draftName);
    if (draftExpiresAt.trim().length > 0) {
      formData.set("expiresAt", draftExpiresAt);
    }
    draftScopes.forEach((scope) => formData.append("scopes", scope));

    setFlash(null);
    runAction(issueTenantApiKeyAction, formData, {
      onSuccess: () => {
        resetCreateDraft();
        setShowCreateCard(false);
      },
    });
  }

  function submitConfirm() {
    if (!confirmTarget) {
      return;
    }
    const { kind, row } = confirmTarget;
    const formData = new FormData();
    formData.set("apiKeyId", row.apiKeyId);
    formData.set("keyName", row.keyName);
    // High-risk reason is collected as a confirmation gate (packet §3.4). It is
    // forwarded for any future audit wiring; the current backend command logs
    // the actor + action server-side.
    formData.set("reason", confirmReason.trim());

    if (kind === "rotate") {
      if (row.expiresAt) {
        formData.set("expiresAt", row.expiresAt);
      }
      row.scopes.forEach((scope) => formData.append("scopes", scope));
      runAction(rotateTenantApiKeyAction, formData);
    } else {
      runAction(revokeTenantApiKeyAction, formData);
    }

    setConfirmTarget(null);
    setConfirmReason("");
  }

  function downloadSecret() {
    if (!secret) {
      return;
    }
    const blob = new Blob(
      [
        `# DRTS tenant API key — store securely, shown once only\n`,
        `name: ${secret.title}\n`,
        `key: ${secret.plaintextKey}\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "drts-api-key.txt";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function copySecret() {
    if (!secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(secret.plaintextKey);
    } catch {
      // Clipboard can be unavailable (insecure context); the value stays
      // selectable in the modal as a fallback.
    }
  }

  // --- filtering + empty reason --------------------------------------------

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.state !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [row.keyName, row.keyPrefix, row.apiKeyId]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, statusFilter, searchQuery]);

  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [filteredRows],
  );

  const emptyReason: ApiKeyEmptyReason | null =
    sortedRows.length > 0
      ? null
      : rows.length === 0
        ? (serverEmptyReason ?? "no_data")
        : "filtered_empty";

  const issueAction = pageActions.find((action) => action.action === "issue");

  function openCreate() {
    setShowCreateCard(true);
    setStatusFilter("all");
    setSearchQuery("");
  }

  const emptyView: EmptyStateView | null = emptyReason
    ? buildEmptyStateView(emptyReason, {
        onRefresh: refreshNow,
        onClearFilters: () => {
          setStatusFilter("all");
          setSearchQuery("");
        },
        onIssue: issueAction?.enabled ? openCreate : undefined,
        governanceLink: crossAppLinks[0]?.href,
      })
    : null;

  // --- table columns --------------------------------------------------------

  const columns: CanvasTableColumn<ApiKeyRow>[] = [
    {
      h: "NAME",
      w: 260,
      r: (row) => (
        <div style={nameCellStyle}>
          <span style={namePrimaryStyle}>{row.keyName}</span>
          <div style={nameMetaRowStyle}>
            <span>{row.apiKeyId}</span>
            {row.state === "revoked" ? (
              <span>revoked {formatDateTime(row.revokedAt)}</span>
            ) : null}
          </div>
        </div>
      ),
    },
    { h: "PREFIX", k: "keyPrefix", w: 110, mono: true },
    {
      h: "MASK",
      w: 116,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: "SCOPE",
      w: 260,
      mono: true,
      r: (row) => (
        <div style={scopeTextStyle}>
          {row.scopes.length > 0 ? row.scopes.join(" · ") : "—"}
        </div>
      ),
    },
    {
      h: "LAST",
      w: 140,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "EXPIRES",
      w: 140,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: "STATE",
      w: 104,
      r: (row) => (
        <CanvasPill theme={th} tone={STATE_TONE[row.state]} dot>
          {STATE_LABEL[row.state]}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => (
        <div style={actionCellStyle}>
          {row.availableActions.map((action) => renderRowAction(action, row))}
        </div>
      ),
    },
  ];

  function renderRowAction(
    action: ResourceActionDescriptor,
    row: ApiKeyRuntimeRecord,
  ): ReactNode {
    const key = `${row.apiKeyId}-${action.action}`;
    const label = actionLabel(action.action);

    if (action.action === "open_audit") {
      return (
        <Link key={key} href={row.auditHref} style={inlineActionStyle}>
          <CanvasIcon name="audit" size={11} />
          {label}
        </Link>
      );
    }

    const disabledReason = !action.enabled
      ? disabledReasonLabel(action.disabledReasonCode)
      : undefined;
    const isDanger = action.action === "revoke";
    const disabled = !action.enabled || pending;

    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        title={disabledReason ?? riskMeta(action)}
        onClick={() => {
          if (!action.enabled) {
            return;
          }
          setFlash(null);
          setConfirmReason("");
          setConfirmTarget({
            kind: action.action === "revoke" ? "revoke" : "rotate",
            row,
          });
        }}
        style={
          !action.enabled
            ? inlineDisabledActionStyle
            : isDanger
              ? { ...inlineDangerActionStyle, opacity: pending ? 0.55 : 1 }
              : { ...inlineActionStyle, opacity: pending ? 0.55 : 1 }
        }
      >
        {action.action === "rotate" ? (
          <CanvasIcon name="arrow" size={11} />
        ) : null}
        {label}
      </button>
    );
  }

  function renderPrimaryBanner() {
    if (flash) {
      return (
        <CanvasBanner
          theme={th}
          tone={flash.tone === "warning" ? "warn" : "success"}
          icon={flash.tone === "warning" ? "warn" : "ok"}
          title={flash.title}
          body={flash.description}
        />
      );
    }

    return (
      <CanvasBanner
        theme={th}
        tone="info"
        icon="warn"
        title="只在建立當下顯示完整金鑰 · Q-TEN09 plaintext-once"
        body="關閉視窗後僅顯示 mask；遺失須重新建立。請務必妥善保存。"
      />
    );
  }

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="API 金鑰"
        subtitle="Live 與 sandbox · scope · last seen · 撤銷後永久不可復原"
        actions={
          <>
            <CanvasPill theme={th} tone={stale ? "warn" : "success"} dot>
              {stale ? "STALE" : "FRESH"} · {API_KEYS_REFRESH_TIER_LABEL}
            </CanvasPill>
            <button
              type="button"
              onClick={refreshNow}
              disabled={pending}
              style={{ ...refreshBtnStyle, opacity: pending ? 0.6 : 1 }}
            >
              <CanvasIcon name="arrow" size={12} />
              {pending ? "更新中…" : "重新整理"}
            </button>
            <CanvasBtn
              theme={th}
              icon="ext"
              onClick={() => setShowPolicyCard((current) => !current)}
              size="sm"
            >
              API 文件
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="apiKeys"
              disabled={!issueAction?.enabled}
              onClick={() => setShowCreateCard((current) => !current)}
              size="sm"
            >
              建立金鑰
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {renderPrimaryBanner()}

        {health && health.status !== "healthy" ? (
          <CanvasBanner
            theme={th}
            tone={health.status === "down" ? "danger" : "warn"}
            icon={health.status === "down" ? "warn" : "health"}
            title="API 金鑰頁面目前為降級模式"
            body={`${health.degradedServices
              .map((service) => `${service.service}: ${service.impact}`)
              .join(" · ")} · 檢查時間 ${formatDateTime(health.lastCheckedAt)}`}
          />
        ) : null}

        {stale ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="clock"
            title="目前顯示的快照非最新"
            body={`快照於 ${formatDateTime(refresh.generatedAt)} 產生（T5 租戶慢速 30 秒節律）。按「重新整理」可立即重新載入。`}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 API 金鑰資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {crossAppLinks.length > 0 ? (
          <div style={crossAppRowStyle}>
            <span style={formNoteStyle}>跨應用治理 (新分頁開啟)：</span>
            {crossAppLinks.map((link) => (
              <a
                key={`${link.resourceType}-${link.label}`}
                href={link.href}
                target={link.openMode === "new_tab" ? "_blank" : undefined}
                rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                style={crossAppLinkStyle}
              >
                {link.label}
                {link.openMode === "new_tab" ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </a>
            ))}
          </div>
        ) : null}

        {showCreateCard || showPolicyCard ? (
          <div style={actionCardGridStyle}>
            {showCreateCard ? (
              <CanvasCard
                theme={th}
                title="建立金鑰"
                subtitle="Plaintext 只在成功建立或輪替時揭露一次。"
                actions={
                  <CanvasBtn
                    theme={th}
                    variant="ghost"
                    onClick={() => setShowCreateCard(false)}
                    size="xs"
                  >
                    收合
                  </CanvasBtn>
                }
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitCreate();
                  }}
                >
                  <div style={fieldGridStyle}>
                    <CanvasField theme={th} label="名稱" required>
                      <input
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder="Operations reporting integration"
                        required
                        style={nativeInputStyle}
                        value={draftName}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      hint={
                        governance
                          ? `請填入 ISO 8601 與時區；留空則使用預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天。`
                          : "請填入 ISO 8601 與時區，例如 2026-08-09T01:52:30Z。"
                      }
                      label="到期時間"
                    >
                      <input
                        onChange={(event) =>
                          setDraftExpiresAt(event.target.value)
                        }
                        placeholder="2026-08-09T01:52:30Z"
                        spellCheck={false}
                        style={nativeMonoInputStyle}
                        value={draftExpiresAt}
                      />
                    </CanvasField>
                  </div>

                  <CanvasField
                    theme={th}
                    hint="至少選擇一個已發布 scope；輪替時會沿用該金鑰當前的 scope。"
                    label="Scopes"
                    required
                  >
                    <div style={scopeGridStyle}>
                      {allowedScopes.length > 0 ? (
                        allowedScopes.map((scope) => {
                          const selected = draftScopes.includes(scope);
                          return (
                            <label
                              key={scope}
                              style={getScopeChipStyle(selected)}
                            >
                              <input
                                checked={selected}
                                onChange={() => toggleScope(scope)}
                                style={{ display: "none" }}
                                type="checkbox"
                              />
                              <span>{scope}</span>
                            </label>
                          );
                        })
                      ) : (
                        <div style={formNoteStyle}>
                          Governance policy 尚未載入，暫時無法建立新金鑰。
                        </div>
                      )}
                    </div>
                  </CanvasField>

                  <div style={formFooterStyle}>
                    <div style={formNoteStyle}>
                      {governance
                        ? `Default ${governance.apiKeyPolicy.defaultLifetimeDays} days · Max ${governance.apiKeyPolicy.maxLifetimeDays} days`
                        : "Integration governance unavailable"}
                    </div>
                    <button
                      disabled={
                        pending ||
                        draftName.trim().length === 0 ||
                        draftScopes.length === 0
                      }
                      style={{
                        ...primaryButtonStyle,
                        cursor:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftScopes.length === 0
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftScopes.length === 0
                            ? 0.55
                            : 1,
                      }}
                      type="submit"
                    >
                      {pending ? "建立中..." : "建立金鑰"}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {showPolicyCard ? (
              <CanvasCard
                theme={th}
                title="API 文件"
                subtitle="Published tenant integration governance package"
                actions={
                  <CanvasBtn
                    theme={th}
                    variant="ghost"
                    onClick={() => setShowPolicyCard(false)}
                    size="xs"
                  >
                    收合
                  </CanvasBtn>
                }
              >
                {governance ? (
                  <>
                    <CanvasDL
                      theme={th}
                      cols={2}
                      items={[
                        {
                          k: "Default",
                          v: `${governance.apiKeyPolicy.defaultLifetimeDays} days`,
                          mono: true,
                        },
                        {
                          k: "Maximum",
                          v: `${governance.apiKeyPolicy.maxLifetimeDays} days`,
                          mono: true,
                        },
                        {
                          k: "Expiry",
                          v: governance.apiKeyPolicy.requireExpiry
                            ? "required"
                            : "optional",
                          mono: true,
                        },
                        {
                          k: "Revoke",
                          v: governance.apiKeyPolicy.revokeEffect,
                          mono: true,
                        },
                        {
                          k: "Break-glass",
                          v: governance.apiKeyPolicy
                            .breakGlassRequiresPlatformApproval
                            ? "platform approval"
                            : "not published",
                          mono: true,
                        },
                        {
                          k: "Generated",
                          v: formatDateTime(governance.generatedAt),
                          mono: true,
                        },
                      ]}
                    />

                    <div style={sectionLabelStyle}>Allowed scopes</div>
                    <div style={scopeGridStyle}>
                      {allowedScopes.map((scope) => (
                        <CanvasPill key={scope} theme={th} tone="info">
                          {scope}
                        </CanvasPill>
                      ))}
                    </div>

                    {compatibilityAliases.length > 0 ? (
                      <>
                        <div style={sectionLabelStyle}>
                          Compatibility aliases
                        </div>
                        <ul style={aliasListStyle}>
                          {compatibilityAliases.map(([alias, target]) => (
                            <li key={`${alias}-${target}`}>
                              <code style={{ fontFamily: th.monoFamily }}>
                                {alias}
                              </code>{" "}
                              {"->"}{" "}
                              <code style={{ fontFamily: th.monoFamily }}>
                                {target}
                              </code>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div style={formNoteStyle}>
                    Integration governance could not be loaded for this tenant.
                  </div>
                )}
              </CanvasCard>
            ) : null}
          </div>
        ) : null}

        <CanvasCard theme={th}>
          <div style={filterBarStyle}>
            <label style={filterFieldStyle}>
              <span style={filterLabelStyle}>搜尋名稱</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="key 名稱 / prefix / id"
                style={{ ...nativeInputStyle, minWidth: 220 }}
              />
            </label>
            <label style={filterFieldStyle}>
              <span style={filterLabelStyle}>狀態</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                style={selectStyle}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ ...formNoteStyle, marginLeft: "auto" }}>
              顯示 {sortedRows.length} / 共 {rows.length} 筆 · CTA 以
              availableActions 為準
            </span>
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0}>
          {emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
              />
              <strong style={{ color: th.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: th.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              {emptyView.action ? (
                emptyView.action.href ? (
                  <a
                    href={emptyView.action.href}
                    target={emptyView.action.newTab ? "_blank" : undefined}
                    rel={emptyView.action.newTab ? "noreferrer" : undefined}
                    style={crossAppLinkStyle}
                  >
                    {emptyView.action.label}
                    {emptyView.action.newTab ? (
                      <CanvasIcon name="ext" size={11} />
                    ) : null}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={emptyView.action.onClick}
                    style={refreshBtnStyle}
                  >
                    {emptyView.action.label}
                  </button>
                )
              ) : null}
              <span
                style={{ ...formNoteStyle, color: toneColor(emptyView.tone) }}
              >
                emptyReason · {emptyReason} ·{" "}
                {API_KEY_EMPTY_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <CanvasTable<ApiKeyRow>
              theme={th}
              columns={columns}
              rows={sortedRows as ApiKeyRow[]}
            />
          )}
        </CanvasCard>
      </div>

      {confirmTarget ? (
        <div style={overlayStyle} role="dialog" aria-modal>
          <div style={modalStyle}>
            <h2 style={modalTitleStyle}>
              {confirmTarget.kind === "rotate" ? "輪替金鑰" : "撤銷金鑰"} ·
              高風險
            </h2>
            <p style={modalBodyStyle}>
              {confirmTarget.kind === "rotate"
                ? `輪替「${confirmTarget.row.keyName}」會立即失效目前的密鑰並產生新的 plaintext（只顯示一次）。`
                : `撤銷「${confirmTarget.row.keyName}」後將永久無法再使用此金鑰進行驗證，且不可復原。`}
            </p>
            <CanvasField theme={th} label="原因 (必填)" required>
              <textarea
                value={confirmReason}
                onChange={(event) => setConfirmReason(event.target.value)}
                placeholder="說明此次高風險操作的原因，供稽核記錄。"
                style={reasonInputStyle}
              />
            </CanvasField>
            <div style={modalFooterStyle}>
              <CanvasBtn
                theme={th}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmTarget(null);
                  setConfirmReason("");
                }}
              >
                取消
              </CanvasBtn>
              <button
                type="button"
                disabled={pending || confirmReason.trim().length === 0}
                onClick={submitConfirm}
                style={{
                  ...primaryButtonStyle,
                  ...(confirmTarget.kind === "revoke"
                    ? { background: th.danger, borderColor: th.danger }
                    : {}),
                  cursor:
                    pending || confirmReason.trim().length === 0
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    pending || confirmReason.trim().length === 0 ? 0.55 : 1,
                }}
              >
                {pending
                  ? "處理中…"
                  : confirmTarget.kind === "rotate"
                    ? "確認輪替"
                    : "確認撤銷"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {secret ? (
        <div style={overlayStyle} role="dialog" aria-modal>
          <div style={modalStyle}>
            <h2 style={modalTitleStyle}>新的完整金鑰只顯示一次</h2>
            <p style={modalBodyStyle}>{secret.description}</p>
            <code style={plaintextKeyStyle}>{secret.plaintextKey}</code>
            <div style={crossAppRowStyle}>
              <button
                type="button"
                onClick={copySecret}
                style={refreshBtnStyle}
              >
                <CanvasIcon name="copy" size={12} />
                複製
              </button>
              <button
                type="button"
                onClick={downloadSecret}
                style={refreshBtnStyle}
              >
                <CanvasIcon name="reports" size={12} />
                下載 .txt
              </button>
            </div>
            <label style={ackRowStyle}>
              <input
                type="checkbox"
                checked={secretAck}
                onChange={(event) => setSecretAck(event.target.checked)}
              />
              我已安全保存此金鑰 (I stored this key)
            </label>
            <div style={modalFooterStyle}>
              <button
                type="button"
                disabled={!secretAck}
                onClick={() => {
                  setSecret(null);
                  setSecretAck(false);
                }}
                style={{
                  ...primaryButtonStyle,
                  cursor: secretAck ? "pointer" : "not-allowed",
                  opacity: secretAck ? 1 : 0.55,
                }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getScopeChipStyle(selected: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${selected ? th.accent : th.border}`,
    background: selected ? "rgba(34, 197, 94, 0.14)" : th.surface,
    color: selected ? th.text : th.textMuted,
    cursor: "pointer",
    fontSize: 11.5,
    fontFamily: th.monoFamily,
  };
}

function toneColor(tone: CanvasTone): string {
  const colors: Record<CanvasTone, string> = {
    success: th.success,
    warn: th.warn,
    danger: th.danger,
    info: th.info,
    accent: th.accent,
    neutral: th.textMuted,
  };
  return colors[tone];
}

function buildEmptyStateView(
  reason: ApiKeyEmptyReason,
  handlers: {
    onRefresh: () => void;
    onClearFilters: () => void;
    onIssue?: (() => void) | undefined;
    governanceLink?: string | undefined;
  },
): EmptyStateView {
  switch (reason) {
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: "API 金鑰快照讀取失敗",
        description:
          "金鑰清單端點未回傳可用內容，請稍候重試或確認後端服務狀態。",
        action: { label: "重新整理", onClick: handlers.onRefresh },
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "users",
        title: "無法存取 API 金鑰範圍",
        description:
          "目前帳號可進入租戶主控台，但沒有 API 金鑰管理的讀取權限，請洽租戶管理員。",
        action: { label: "返回首頁", href: "/" },
      };
    case "not_provisioned":
      return {
        tone: "info",
        icon: "adapters",
        title: "尚未開通 API 金鑰整合",
        description:
          "此租戶的整合治理政策尚未發布任何可用 scope，需先由平台完成開通才能建立金鑰。",
        action: handlers.governanceLink
          ? {
              label: "開啟平台整合治理",
              href: handlers.governanceLink,
              newTab: true,
            }
          : null,
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "health",
        title: "整合治理服務暫時不可用",
        description:
          "金鑰清單為空且整合治理政策無法載入；在政策恢復前，建立與輪替金鑰將受限。",
        action: { label: "重新整理", onClick: handlers.onRefresh },
      };
    case "filtered_empty":
      return {
        tone: "accent",
        icon: "filter",
        title: "目前條件沒有符合的金鑰",
        description: "放寬狀態或清除名稱搜尋即可恢復結果。",
        action: { label: "清除篩選", onClick: handlers.onClearFilters },
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        icon: "apiKeys",
        title: "尚未建立任何租戶 API 金鑰",
        description:
          "整合治理政策已就緒，但此租戶目前還沒有任何 API 金鑰。建立第一支金鑰以開始整合。",
        action: handlers.onIssue
          ? { label: "建立金鑰", onClick: handlers.onIssue }
          : null,
      };
  }
}
