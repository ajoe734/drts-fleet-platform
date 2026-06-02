"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

// Platform Admin canvas body parity: PA_Users (docs/05-ui/drts-design-canvas/
// platform-screens-1.jsx). Table-first canvas layout — header invite action +
// a single Card/Table with NAME / EMAIL / ROLE / STATUS / 更新 / ACTIONS. The
// legacy KPI row, the embedded create panel, and the userId/created columns
// from the old generic management body are intentionally removed; the invite
// form now lives in a drawer behind the header action. See
// docs/05-ui/platform-admin-body-parity-audit-20260602.md §7.7.

const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

type UserRow = PlatformAdminUserRecord & Record<string, unknown>;

// Medium-risk role edit vs high-risk suspend. The canvas descriptor renders a
// disabled `suspend` (disabledReasonCode: already_suspended) for non-active
// rows; we keep that affordance but pair it with a reactivate action so the
// backend status transition stays reachable instead of becoming a dead button.
type PendingAction =
  | {
      kind: "role";
      user: PlatformAdminUserRecord;
      roleCode: PlatformAdminUserRole;
    }
  | { kind: "suspend"; user: PlatformAdminUserRecord; reason: string }
  | { kind: "activate"; user: PlatformAdminUserRecord };

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "32px 16px",
  textAlign: "center",
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const nameCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
} satisfies CSSProperties;

const avatarStyle = {
  width: 24,
  height: 24,
  borderRadius: 12,
  background: theme.accentBg,
  color: theme.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
  textTransform: "uppercase",
} satisfies CSSProperties;

const nameTextStyle = {
  fontWeight: 500,
  color: theme.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const rowActionsStyle = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
} satisfies CSSProperties;

const disabledReasonStyle = {
  fontSize: 10.5,
  color: theme.textDim,
  alignSelf: "center",
} satisfies CSSProperties;

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 60,
} satisfies CSSProperties;

const modalStyle = {
  width: "min(520px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  boxShadow: "0 24px 64px rgba(2, 6, 23, 0.45)",
} satisfies CSSProperties;

const modalHeaderStyle = {
  padding: "16px 20px",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const modalTitleStyle = {
  margin: 0,
  fontSize: 14.5,
  fontWeight: 700,
  color: theme.text,
} satisfies CSSProperties;

const modalSubtitleStyle = {
  margin: "4px 0 0",
  fontSize: 12,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const modalBodyStyle = {
  padding: 20,
} satisfies CSSProperties;

const modalFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "14px 20px",
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

function controlStyle(th: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 7,
    border: `1px solid ${th.border}`,
    background: th.bgRaised,
    color: th.text,
    fontFamily: th.fontFamily,
    fontSize: 12.5,
    padding: "8px 10px",
    outline: "none",
  };
}

function roleTone(role: PlatformAdminUserRole): CanvasTone {
  if (role === "superadmin" || role === "admin") {
    return "info";
  }
  if (role === "operator") {
    return "accent";
  }
  return "neutral";
}

function statusTone(status: PlatformAdminUserStatus): CanvasTone {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "warn";
  }
  return "danger";
}

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [users, setUsers] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Platform staff",
          subtitle: "6 roles · RBAC gatekeeping stays backend-authoritative",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          invite: "Invite",
          inviteTitle: "Invite platform staff",
          inviteSubtitle:
            "Create an internal user record and assign the initial role before the user enters any tenant or ops workflow.",
          colName: "NAME",
          colEmail: "EMAIL",
          colRole: "ROLE",
          colStatus: "STATUS",
          colUpdated: "UPDATED",
          colActions: "ACTIONS",
          actionRole: "Role",
          actionSuspend: "Suspend",
          actionActivate: "Activate",
          alreadySuspended: "already suspended",
          roleTitle: "Update role",
          roleSubtitle:
            "Medium-risk change. The new role takes effect immediately and is recorded to the audit trail.",
          roleField: "Role",
          suspendTitle: "Suspend platform staff",
          suspendSubtitle:
            "High-risk change. A confirmation reason is required before the user loses platform access. Access is revoked immediately on confirm.",
          reasonField: "Reason",
          reasonHint: "Required to confirm this high-risk suspension.",
          reasonPlaceholder: "e.g. Offboarding / suspected credential leak",
          activateTitle: "Reactivate platform staff",
          activateSubtitle:
            "Restore platform access for this user. Access is granted immediately on confirm.",
          confirmSuspend: "Confirm suspend",
          confirmActivate: "Confirm activate",
          save: "Save",
          empty: t("users.empty"),
          loading: t("users.loading"),
        }
      : {
          title: "平台人員",
          subtitle: "6 個角色 · RBAC 守門以後端為準",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          invite: "邀請",
          inviteTitle: "邀請平台人員",
          inviteSubtitle:
            "先建立內部使用者主檔與初始角色，再讓該使用者進入 tenant 或 ops workflow。",
          colName: "NAME",
          colEmail: "EMAIL",
          colRole: "ROLE",
          colStatus: "STATUS",
          colUpdated: "更新",
          colActions: "ACTIONS",
          actionRole: "更新角色",
          actionSuspend: "停用",
          actionActivate: "啟用",
          alreadySuspended: "已停用",
          roleTitle: "更新角色",
          roleSubtitle: "中風險變更，套用後立即生效並寫入稽核軌跡。",
          roleField: "角色",
          suspendTitle: "停用平台人員",
          suspendSubtitle:
            "高風險變更，需填寫原因確認後才停用；確認後使用者隨即失去平台存取權限。",
          reasonField: "原因",
          reasonHint: "高風險停用確認必填。",
          reasonPlaceholder: "例如：離職 / 疑似憑證外洩",
          activateTitle: "重新啟用平台人員",
          activateSubtitle: "恢復此使用者的平台存取權限；確認後立即生效。",
          confirmSuspend: "確認停用",
          confirmActivate: "確認啟用",
          save: "儲存",
          empty: t("users.empty"),
          loading: t("users.loading"),
        };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformAdminUsers();
      setUsers(result ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const rows = useMemo<UserRow[]>(
    () => users.map((user) => ({ ...user })),
    [users],
  );

  const resetInvite = useCallback(() => {
    setShowInvite(false);
    setFormEmail("");
    setFormDisplayName("");
    setFormRoleCode("operator");
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformAdminUser({
        email: formEmail.trim(),
        displayName: formDisplayName.trim(),
        roleCode: formRoleCode,
      });
      resetInvite();
      await loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setCreating(false);
    }
  };

  const applyUpdate = useCallback(
    async (
      userId: string,
      roleCode: PlatformAdminUserRole,
      status: PlatformAdminUserStatus,
    ) => {
      setUpdatingUserId(userId);
      setError(null);
      try {
        await client.updatePlatformAdminUserRole(userId, { roleCode, status });
        setPendingAction(null);
        await loadUsers();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("common.unknown"));
      } finally {
        setUpdatingUserId(null);
      }
    },
    [client, loadUsers, t],
  );

  const handleConfirm = async () => {
    if (!pendingAction) {
      return;
    }
    const { kind, user } = pendingAction;
    if (kind === "role") {
      await applyUpdate(user.userId, pendingAction.roleCode, user.status);
    } else if (kind === "suspend") {
      // The canvas descriptor marks `suspend` as requiresReason: true, so the
      // operator must type a reason as a confirmation gate before this
      // high-risk status transition. The reason is intentionally NOT sent to
      // the backend: UpdatePlatformAdminUserRoleCommand only carries
      // { roleCode, status } (packages/contracts/src/index.ts) and widening
      // that contract is outside this page-scoped task. The backend audit
      // record for this action captures only roleCode, not the status value
      // (platform-admin.service.ts update_platform_admin_user_role), so the
      // copy above frames suspend/activate as a confirmation gate that changes
      // access on confirm — it does NOT claim the status change is audited.
      await applyUpdate(user.userId, user.roleCode, "suspended");
    } else {
      await applyUpdate(user.userId, user.roleCode, "active");
    }
  };

  const columns: CanvasTableColumn<UserRow>[] = [
    {
      h: copy.colName,
      w: 200,
      r: (row) => (
        <div style={nameCellStyle}>
          <span style={avatarStyle}>{row.displayName.slice(0, 2)}</span>
          <span style={nameTextStyle}>{row.displayName}</span>
        </div>
      ),
    },
    { h: copy.colEmail, k: "email", w: 240, mono: true },
    {
      h: copy.colRole,
      w: 200,
      r: (row) => (
        <CanvasPill theme={theme} tone={roleTone(row.roleCode)}>
          {formatPlatformCodeLabel(locale, row.roleCode)}
        </CanvasPill>
      ),
    },
    {
      h: copy.colStatus,
      w: 120,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.colUpdated,
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.colActions,
      w: 220,
      r: (row) => {
        const busy = updatingUserId === row.userId;
        const isActive = row.status === "active";
        return (
          <div style={rowActionsStyle}>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  kind: "role",
                  user: row,
                  roleCode: row.roleCode,
                })
              }
            >
              {copy.actionRole}
            </CanvasBtn>
            {isActive ? (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                danger
                disabled={busy}
                onClick={() =>
                  setPendingAction({ kind: "suspend", user: row, reason: "" })
                }
              >
                {copy.actionSuspend}
              </CanvasBtn>
            ) : row.status === "suspended" ? (
              <>
                <CanvasBtn theme={theme} size="xs" variant="secondary" disabled>
                  {copy.actionSuspend}
                </CanvasBtn>
                <span style={disabledReasonStyle}>{copy.alreadySuspended}</span>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    setPendingAction({ kind: "activate", user: row })
                  }
                >
                  {copy.actionActivate}
                </CanvasBtn>
              </>
            ) : (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setPendingAction({ kind: "activate", user: row })
                }
              >
                {copy.actionActivate}
              </CanvasBtn>
            )}
          </div>
        );
      },
    },
  ];

  const pendingBusy = pendingAction
    ? updatingUserId === pendingAction.user.userId
    : false;

  function renderModal(): ReactNode {
    if (showInvite) {
      const canSubmit =
        Boolean(formEmail.trim()) &&
        Boolean(formDisplayName.trim()) &&
        !creating;
      return (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>{copy.inviteTitle}</h2>
              <p style={modalSubtitleStyle}>{copy.inviteSubtitle}</p>
            </div>
            <form onSubmit={handleCreate}>
              <div style={modalBodyStyle}>
                <CanvasField
                  theme={theme}
                  label={t("users.form.email")}
                  required
                >
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    required
                    placeholder="staff@platform.drts"
                    style={controlStyle(theme)}
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label={t("users.form.displayName")}
                  required
                >
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(event) => setFormDisplayName(event.target.value)}
                    required
                    style={controlStyle(theme)}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={t("users.form.role")}>
                  <select
                    value={formRoleCode}
                    onChange={(event) =>
                      setFormRoleCode(
                        event.target.value as PlatformAdminUserRole,
                      )
                    }
                    style={controlStyle(theme)}
                  >
                    {ROLE_CODES.map((roleCode) => (
                      <option key={roleCode} value={roleCode}>
                        {formatPlatformCodeLabel(locale, roleCode)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>
              <div style={modalFooterStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={resetInvite}
                >
                  {t("common.cancel")}
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    icon="plus"
                    disabled={!canSubmit}
                  >
                    {creating ? t("common.adding") : copy.invite}
                  </CanvasBtn>
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    if (!pendingAction) {
      return null;
    }

    const { kind, user } = pendingAction;
    const modalTitle =
      kind === "role"
        ? copy.roleTitle
        : kind === "suspend"
          ? copy.suspendTitle
          : copy.activateTitle;
    const modalSubtitle =
      kind === "role"
        ? copy.roleSubtitle
        : kind === "suspend"
          ? copy.suspendSubtitle
          : copy.activateSubtitle;
    const confirmLabel =
      kind === "role"
        ? copy.save
        : kind === "suspend"
          ? copy.confirmSuspend
          : copy.confirmActivate;
    const canConfirm =
      !pendingBusy &&
      (kind !== "suspend" || pendingAction.reason.trim().length > 0);

    return (
      <div style={overlayStyle} role="dialog" aria-modal="true">
        <div style={modalStyle}>
          <div style={modalHeaderStyle}>
            <h2 style={modalTitleStyle}>{modalTitle}</h2>
            <p style={modalSubtitleStyle}>{modalSubtitle}</p>
          </div>
          <div style={modalBodyStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span style={avatarStyle}>{user.displayName.slice(0, 2)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: theme.text }}>
                  {user.displayName}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: theme.textMuted,
                    fontFamily: theme.monoFamily,
                  }}
                >
                  {user.email}
                </div>
              </div>
            </div>

            {kind === "role" ? (
              <CanvasField theme={theme} label={copy.roleField}>
                <select
                  value={pendingAction.roleCode}
                  onChange={(event) =>
                    setPendingAction({
                      kind: "role",
                      user,
                      roleCode: event.target.value as PlatformAdminUserRole,
                    })
                  }
                  style={controlStyle(theme)}
                >
                  {ROLE_CODES.map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </option>
                  ))}
                </select>
              </CanvasField>
            ) : null}

            {kind === "suspend" ? (
              <CanvasField
                theme={theme}
                label={copy.reasonField}
                hint={copy.reasonHint}
                required
              >
                <textarea
                  value={pendingAction.reason}
                  onChange={(event) =>
                    setPendingAction({
                      kind: "suspend",
                      user,
                      reason: event.target.value,
                    })
                  }
                  rows={3}
                  placeholder={copy.reasonPlaceholder}
                  style={{ ...controlStyle(theme), resize: "vertical" }}
                />
              </CanvasField>
            ) : null}
          </div>
          <div style={modalFooterStyle}>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              disabled={pendingBusy}
              onClick={() => setPendingAction(null)}
            >
              {t("common.cancel")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              danger={kind === "suspend"}
              disabled={!canConfirm}
              onClick={() => void handleConfirm()}
            >
              {pendingBusy ? t("common.updating") : confirmLabel}
            </CanvasBtn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadUsers()}
            >
              {loading && users.length > 0 ? copy.refreshing : copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowInvite(true)}
            >
              {copy.invite}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={`${getPlatformLabel(locale, "error")}: ${error}`}
          />
        ) : null}

        <CanvasCard theme={theme} padding={0} style={{ overflow: "hidden" }}>
          {loading && users.length === 0 ? (
            <div style={loadingStateStyle}>{copy.loading}</div>
          ) : rows.length === 0 ? (
            <div style={emptyStateStyle}>{copy.empty}</div>
          ) : (
            <CanvasTable<UserRow> theme={theme} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>

      {renderModal()}
    </>
  );
}
