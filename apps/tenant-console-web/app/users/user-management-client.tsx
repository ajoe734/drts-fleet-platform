"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import type {
  CanonicalIdentitySessionRecord,
  IdentityContext,
  ResourceActionDescriptor,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  inviteTenantUserAction,
  reactivateTenantUserAction,
  resendTenantUserInviteAction,
  revokeAllTenantUserSessionsAction,
  revokeTenantUserInviteAction,
  revokeTenantUserSessionAction,
  suspendTenantUserAction,
  updateTenantUserRoleAction,
  type UserActionPayload,
} from "./actions";

export interface UserManagementClientProps {
  initialUsers: TenantUserRoleRecord[];
  roles: TenantRoleCatalogRecord[];
  identity: IdentityContext | null;
  availableActions: ResourceActionDescriptor[];
  initialSessions?: CanonicalIdentitySessionRecord[];
  refreshMetadata: UiRefreshMetadata | null;
}

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const navTabContainerStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  borderBottom: `1px solid ${th.border}`,
  paddingBottom: 8,
  marginBottom: 12,
};

const navTabButtonStyle = (active: boolean): CSSProperties => ({
  background: active ? th.accent : "transparent",
  color: active ? "#ffffff" : th.textMuted,
  border: active ? "none" : `1px solid ${th.border}`,
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s ease-in-out",
});

const formModalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 16,
};

const formModalContainerStyle: CSSProperties = {
  backgroundColor: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  width: "100%",
  maxWidth: 520,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
  color: th.text,
};

const formFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: th.text,
};

const inputStyle: CSSProperties = {
  width: "100%",
  backgroundColor: th.surfaceLo,
  border: `1px solid ${th.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  color: th.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 6,
  backgroundColor: "rgba(15, 118, 110, 0.15)",
  border: `1px solid ${th.border}`,
};

const stepUpLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#5EEAD4",
};

const modalActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 8,
};

const rolePillTone = (roleCode: string): CanvasTone => {
  if (roleCode === "tc_admin" || roleCode === "tenant_admin") return "accent";
  if (roleCode === "tc_operator" || roleCode === "operator") return "info";
  if (roleCode === "tc_finance" || roleCode === "finance") return "warn";
  return "neutral";
};

const statusPillTone = (status: string): CanvasTone => {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "neutral";
};

const maskIpAddress = (ip: string | undefined | null): string => {
  if (!ip) return "192.168.x.x";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ip;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.length > 2 ? `${parts[0]}:${parts[1]}::xxxx` : ip;
  }
  return ip;
};

const maskSessionToken = (token: string | undefined | null): string => {
  if (!token) return "ses_live_••••";
  if (token.length <= 12) return `${token.slice(0, 4)}••••`;
  return `${token.slice(0, 8)}••••${token.slice(-4)}`;
};

export function UserManagementClient({
  initialUsers,
  roles,
  identity,
  availableActions,
  initialSessions = [],
  refreshMetadata,
}: UserManagementClientProps) {
  const { t, locale } = useTranslation();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"users" | "sessions">("users");
  const [users, setUsers] = useState<TenantUserRoleRecord[]>(initialUsers);
  const [sessions, setSessions] = useState<CanonicalIdentitySessionRecord[]>(initialSessions);
  const [flashPayload, setFlashPayload] = useState<UserActionPayload | null>(null);

  // Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [targetUser, setTargetUser] = useState<TenantUserRoleRecord | null>(null);
  const [modalType, setModalType] = useState<
    "role" | "suspend" | "reactivate" | "revoke_invite" | "revoke_session" | "revoke_all_sessions" | null
  >(null);
  const [selectedRole, setSelectedRole] = useState<string>("tc_operator");
  const [suspendReason, setSuspendReason] = useState<string>("");
  const [stepUpChecked, setStepUpChecked] = useState<boolean>(true);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);

  const activeAdmins = useMemo(() => {
    return users.filter(
      (u) => (u.roleCode === "tc_admin" || u.roleCode === "tenant_admin") && u.status === "active",
    );
  }, [users]);

  const currentActorId = identity?.actorId ?? "demo-tenant-user";

  const closeModals = () => {
    setShowInviteModal(false);
    setTargetUser(null);
    setModalType(null);
    setSuspendReason("");
    setTargetSessionId(null);
  };

  const handleInviteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await inviteTenantUserAction(formData);
      setFlashPayload(res);
      if (res.success) {
        closeModals();
      }
    });
  };

  const handleUpdateRoleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("currentActorId", currentActorId);
    formData.set("activeAdminCount", activeAdmins.length.toString());
    if (targetUser) {
      formData.set("targetCurrentRole", targetUser.roleCode);
    }

    startTransition(async () => {
      const res = await updateTenantUserRoleAction(formData);
      setFlashPayload(res);
      if (res.success) {
        closeModals();
      }
    });
  };

  const handleSuspendSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("activeAdminCount", activeAdmins.length.toString());
    if (targetUser) {
      formData.set("targetCurrentRole", targetUser.roleCode);
    }

    startTransition(async () => {
      const res = await suspendTenantUserAction(formData);
      setFlashPayload(res);
      if (res.success) {
        closeModals();
      }
    });
  };

  const handleReactivateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await reactivateTenantUserAction(formData);
      setFlashPayload(res);
      if (res.success) {
        closeModals();
      }
    });
  };

  const handleResendInvite = (user: TenantUserRoleRecord) => {
    const formData = new FormData();
    formData.set("userId", user.userId);
    formData.set("email", user.email);

    startTransition(async () => {
      const res = await resendTenantUserInviteAction(formData);
      setFlashPayload(res);
    });
  };

  const handleRevokeInviteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await revokeTenantUserInviteAction(formData);
      setFlashPayload(res);
      if (res.success) {
        closeModals();
      }
    });
  };

  const handleRevokeSessionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await revokeTenantUserSessionAction(formData);
      setFlashPayload(res);
      if (res.success) {
        if (targetSessionId) {
          setSessions((prev) => prev.filter((s) => s.sessionId !== targetSessionId));
        }
        closeModals();
      }
    });
  };

  const handleRevokeAllSessionsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await revokeAllTenantUserSessionsAction(formData);
      setFlashPayload(res);
      if (res.success) {
        if (targetUser) {
          setSessions((prev) => prev.filter((s) => s.principalId !== targetUser.userId));
        }
        closeModals();
      }
    });
  };

  const sessionColumns: CanvasTableColumn<CanonicalIdentitySessionRecord>[] = [
    {
      h: "SESSION ID",
      k: "sessionId",
      w: 160,
      r: (row) => (
        <span style={{ fontFamily: th.monoFamily, fontWeight: 600 }}>
          {maskSessionToken(row.sessionId)}
        </span>
      ),
    },
    {
      h: "USER / PRINCIPAL",
      k: "principalId",
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>{row.principalId}</span>
          <span style={{ fontSize: 11, color: th.textMuted }}>{row.realm}</span>
        </div>
      ),
    },
    {
      h: "DEVICE / IP (MASKED)",
      w: 200,
      r: (row) => {
        const dev = row.deviceSummary as { browser?: string; os?: string; ip?: string } | undefined;
        return (
          <div style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
            <span>{dev?.browser ?? "Chrome 128 / macOS"}</span>
            <span style={{ fontFamily: th.monoFamily, color: th.textDim, fontSize: 11 }}>
              IP: {maskIpAddress(dev?.ip)}
            </span>
          </div>
        );
      },
    },
    {
      h: "AUTH TIME / EXPIRY",
      w: 180,
      mono: true,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", fontSize: 11 }}>
          <span>Auth: {row.authTime ? new Date(row.authTime).toLocaleTimeString() : "—"}</span>
          <span>Exp: {row.absoluteExpiresAt ? new Date(row.absoluteExpiresAt).toLocaleTimeString() : "—"}</span>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={row.status === "active" ? "success" : row.status === "compromised" ? "danger" : "neutral"}
          dot
        >
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (row) => (
        <CanvasBtn
          theme={th}
          size="xs"
          variant="secondary"
          danger
          disabled={row.status !== "active"}
          onClick={() => {
            setTargetSessionId(row.sessionId);
            setModalType("revoke_session");
          }}
        >
          Revoke Session
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("users.header.title")}
        subtitle={t("users.header.subtitle")}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              onClick={() => setShowInviteModal(true)}
            >
              {t("users.action.invite")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {/* Flash Banner Feedback */}
        {flashPayload ? (
          <CanvasBanner
            theme={th}
            tone={flashPayload.success ? "success" : "warn"}
            icon={flashPayload.success ? "check" : "warn"}
            title={
              flashPayload.success
                ? "Operation Succeeded"
                : flashPayload.error === "last_admin_protected"
                ? "Last-Admin Protection Triggered"
                : flashPayload.error === "self_escalation_denied"
                ? "Self-Escalation Denied"
                : "Operation Blocked / Failed"
            }
            body={
              flashPayload.errorMessage ??
              (flashPayload.error === "last_admin_protected"
                ? "系統阻止此操作：此使用者為租戶最後一名活躍的 tenant_admin。租戶必須保留至少一名 active admin。"
                : flashPayload.error === "self_escalation_denied"
                ? "系統阻止此操作：使用者禁止對自己進行權限升級或變更角色為 tenant_admin。"
                : `Action '${flashPayload.action}' failed: ${flashPayload.error ?? "unknown error"}`)
            }
          />
        ) : null}

        {/* Tab Navigation */}
        <div style={navTabContainerStyle}>
          <button
            type="button"
            style={navTabButtonStyle(activeTab === "users")}
            onClick={() => setActiveTab("users")}
          >
            使用者與角色 Roster ({users.length})
          </button>
          <button
            type="button"
            style={navTabButtonStyle(activeTab === "sessions")}
            onClick={() => setActiveTab("sessions")}
          >
            線上會話與憑證 Session Administration ({sessions.length})
          </button>
        </div>

        {activeTab === "users" ? (
          <CanvasCard
            theme={th}
            title={t("users.tableCard.title")}
            subtitle={t("users.tableCard.subtitle")}
            padding={0}
          >
            <CanvasTable<TenantUserRoleRecord & Record<string, unknown>>
              theme={th}
              columns={[
                {
                  h: t("users.table.name"),
                  k: "displayName",
                  w: 200,
                  r: (r) => (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 600, color: th.text }}>{r.displayName}</span>
                      <span style={{ fontSize: 11, fontFamily: th.monoFamily, color: th.textMuted }}>
                        {r.userId}
                      </span>
                    </div>
                  ),
                },
                {
                  h: t("users.table.email"),
                  k: "email",
                  mono: true,
                  w: 220,
                },
                {
                  h: t("users.table.role"),
                  k: "roleCode",
                  w: 160,
                  r: (r) => (
                    <CanvasPill theme={th} tone={rolePillTone(r.roleCode)}>
                      {r.roleCode}
                    </CanvasPill>
                  ),
                },
                {
                  h: t("users.table.status"),
                  w: 120,
                  r: (r) => (
                    <CanvasPill theme={th} tone={statusPillTone(r.status)} dot>
                      {r.status}
                    </CanvasPill>
                  ),
                },
                {
                  h: t("users.table.updated"),
                  k: "updatedAt",
                  w: 150,
                  mono: true,
                  r: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"),
                },
                {
                  h: t("users.table.actions"),
                  w: 280,
                  r: (r) => (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.status === "invited" ? (
                        <>
                          <CanvasBtn
                            theme={th}
                            size="xs"
                            variant="secondary"
                            onClick={() => handleResendInvite(r)}
                          >
                            重發邀請
                          </CanvasBtn>
                          <CanvasBtn
                            theme={th}
                            size="xs"
                            variant="secondary"
                            danger
                            onClick={() => {
                              setTargetUser(r);
                              setModalType("revoke_invite");
                            }}
                          >
                            撤銷邀請
                          </CanvasBtn>
                        </>
                      ) : null}

                      {r.status === "active" ? (
                        <>
                          <CanvasBtn
                            theme={th}
                            size="xs"
                            variant="secondary"
                            onClick={() => {
                              setTargetUser(r);
                              setSelectedRole(r.roleCode);
                              setModalType("role");
                            }}
                          >
                            變更角色
                          </CanvasBtn>
                          <CanvasBtn
                            theme={th}
                            size="xs"
                            variant="secondary"
                            danger
                            onClick={() => {
                              setTargetUser(r);
                              setModalType("suspend");
                            }}
                          >
                            停用
                          </CanvasBtn>
                          <CanvasBtn
                            theme={th}
                            size="xs"
                            variant="secondary"
                            onClick={() => {
                              setTargetUser(r);
                              setModalType("revoke_all_sessions");
                            }}
                          >
                            終止會話
                          </CanvasBtn>
                        </>
                      ) : null}

                      {r.status === "suspended" ? (
                        <CanvasBtn
                          theme={th}
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            setTargetUser(r);
                            setModalType("reactivate");
                          }}
                        >
                          重新啟用
                        </CanvasBtn>
                      ) : null}
                    </div>
                  ),
                },
              ]}
              rows={users as (TenantUserRoleRecord & Record<string, unknown>)[]}
            />
          </CanvasCard>
        ) : (
          <CanvasCard
            theme={th}
            title="線上身份會話與憑證 (Active Identity Sessions)"
            subtitle="Tenant-bounded identity session tokens with masked device IP and termination control"
            padding={0}
          >
            <CanvasTable<CanonicalIdentitySessionRecord & Record<string, unknown>>
              theme={th}
              columns={sessionColumns as CanvasTableColumn<CanonicalIdentitySessionRecord & Record<string, unknown>>[]}
              rows={sessions as (CanonicalIdentitySessionRecord & Record<string, unknown>)[]}
            />
          </CanvasCard>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>邀請新使用者 (Invite Tenant User)</h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              發送邀請郵件給新成員，指定適當的角色權限。
            </p>
            <form onSubmit={handleInviteSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>Email 地址</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="user@yamato.com"
                  style={inputStyle}
                />
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>成員姓名 (Display Name)</label>
                <input
                  name="displayName"
                  type="text"
                  required
                  placeholder="Yamato Operator"
                  style={inputStyle}
                />
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>初始角色 (Role)</label>
                <select name="roleCode" defaultValue="tc_operator" style={selectStyle}>
                  <option value="tc_admin">tc_admin (Tenant Administrator)</option>
                  <option value="tc_operator">tc_operator (Operations Staff)</option>
                  <option value="tc_finance">tc_finance (Financial Manager)</option>
                  <option value="tc_viewer">tc_viewer (Read-Only Viewer)</option>
                </select>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" icon="plus" disabled={isPending} type="submit">
                  {isPending ? "發送中..." : "發送邀請"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Update Role Modal */}
      {modalType === "role" && targetUser ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>變更成員角色 (Update Role)</h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              變更 <strong>{targetUser.displayName}</strong> ({targetUser.email}) 的權限角色。
            </p>

            {/* Self Escalation or Last Admin Hints */}
            {targetUser.userId === currentActorId ? (
              <CanvasBanner
                theme={th}
                tone="warn"
                icon="warn"
                title="Self-Escalation Warning"
                body="您正在編輯自己的帳號。注意：系統禁止自我升級為 tenant_admin。"
              />
            ) : null}

            {activeAdmins.length <= 1 &&
            (targetUser.roleCode === "tc_admin" || targetUser.roleCode === "tenant_admin") ? (
              <CanvasBanner
                theme={th}
                tone="warn"
                icon="warn"
                title="Last-Admin Protection Warning"
                body="該成員為租戶目前唯一活躍的 tenant_admin。降級此成員將被系統阻止。"
              />
            ) : null}

            <form onSubmit={handleUpdateRoleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="userId" value={targetUser.userId} />

              <div style={formFieldStyle}>
                <label style={labelStyle}>新角色 (New Role)</label>
                <select
                  name="roleCode"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  style={selectStyle}
                >
                  <option value="tc_admin">tc_admin (Tenant Administrator)</option>
                  <option value="tc_operator">tc_operator (Operations Staff)</option>
                  <option value="tc_finance">tc_finance (Financial Manager)</option>
                  <option value="tc_viewer">tc_viewer (Read-Only Viewer)</option>
                </select>
              </div>

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpRole"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpRole" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified (已二次身分確認)
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" disabled={isPending || !stepUpChecked} type="submit">
                  {isPending ? "更新中..." : "確認更新角色"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Suspend User Modal */}
      {modalType === "suspend" && targetUser ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>
              停用成員帳號 (Suspend User Account)
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              停用 <strong>{targetUser.displayName}</strong> ({targetUser.email})。停用後該使用者將無法登入 system。
            </p>

            {activeAdmins.length <= 1 &&
            (targetUser.roleCode === "tc_admin" || targetUser.roleCode === "tenant_admin") ? (
              <CanvasBanner
                theme={th}
                tone="warn"
                icon="warn"
                title="Last-Admin Protection Warning"
                body="該成員為租戶最後一名 tenant_admin。停用此成員將被系統阻止 (Last-admin protection)。"
              />
            ) : null}

            <form onSubmit={handleSuspendSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="userId" value={targetUser.userId} />

              <div style={formFieldStyle}>
                <label style={labelStyle}>停用原因 (Reason Required)</label>
                <input
                  name="reason"
                  type="text"
                  required
                  placeholder="Security audit requirement / employee departure"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpSuspend"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpSuspend" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified (高風險動作授權)
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  danger
                  disabled={isPending || !suspendReason.trim() || !stepUpChecked}
                  type="submit"
                >
                  {isPending ? "處理中..." : "確認停用帳號"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Revoke Session Modal */}
      {modalType === "revoke_session" && targetSessionId ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>
              強制登出會話 (Revoke Identity Session)
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              確定要立即終止會話 <strong>{maskSessionToken(targetSessionId)}</strong> 嗎？
            </p>

            <form onSubmit={handleRevokeSessionSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="sessionId" value={targetSessionId} />

              <div style={formFieldStyle}>
                <label style={labelStyle}>撤銷原因 (Revoke Reason)</label>
                <input
                  name="reason"
                  type="text"
                  placeholder="Security session invalidation"
                  style={inputStyle}
                />
              </div>

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpSession"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpSession" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" danger disabled={isPending || !stepUpChecked} type="submit">
                  {isPending ? "處理中..." : "確認終止會話"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Revoke All Sessions Modal */}
      {modalType === "revoke_all_sessions" && targetUser ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>
              終止使用者所有會話 (Revoke All Sessions)
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              確定要讓 <strong>{targetUser.displayName}</strong> ({targetUser.email}) 在所有裝置強制登出嗎？
            </p>

            <form onSubmit={handleRevokeAllSessionsSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="userId" value={targetUser.userId} />

              <div style={formFieldStyle}>
                <label style={labelStyle}>原因說明 (Reason)</label>
                <input
                  name="reason"
                  type="text"
                  placeholder="Compromised device or password reset"
                  style={inputStyle}
                />
              </div>

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpAllSessions"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpAllSessions" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" danger disabled={isPending || !stepUpChecked} type="submit">
                  {isPending ? "處理中..." : "強制登出所有裝置"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Revoke Invite Modal */}
      {modalType === "revoke_invite" && targetUser ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>
              撤銷未決邀請 (Revoke Pending Invitation)
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              撤銷給 <strong>{targetUser.email}</strong> 的邀請。
            </p>

            <form onSubmit={handleRevokeInviteSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="userId" value={targetUser.userId} />

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpRevokeInvite"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpRevokeInvite" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" danger disabled={isPending || !stepUpChecked} type="submit">
                  {isPending ? "處理中..." : "確認撤銷邀請"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reactivate User Modal */}
      {modalType === "reactivate" && targetUser ? (
        <div style={formModalBackdropStyle}>
          <div style={formModalContainerStyle}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              重新啟用成員帳號 (Reactivate User Account)
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: th.textMuted }}>
              重新啟用 <strong>{targetUser.displayName}</strong> ({targetUser.email})。
            </p>

            <form onSubmit={handleReactivateSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="userId" value={targetUser.userId} />
              <input type="hidden" name="roleCode" value={targetUser.roleCode} />

              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  id="stepUpReactivate"
                  name="stepUpConfirmed"
                  value="true"
                  checked={stepUpChecked}
                  onChange={(e) => setStepUpChecked(e.target.checked)}
                />
                <label htmlFor="stepUpReactivate" style={stepUpLabelStyle}>
                  Step-up Re-Authentication Verified
                </label>
              </div>

              <div style={modalActionRowStyle}>
                <CanvasBtn theme={th} variant="secondary" onClick={closeModals} type="button">
                  取消
                </CanvasBtn>
                <CanvasBtn theme={th} variant="primary" disabled={isPending || !stepUpChecked} type="submit">
                  {isPending ? "處理中..." : "確認重新啟用"}
                </CanvasBtn>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
