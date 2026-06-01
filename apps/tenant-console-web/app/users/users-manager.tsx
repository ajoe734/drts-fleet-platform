"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  TenantUserRoleStatus,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasBtnProps,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  inviteTenantUserAction,
  setTenantUserStatusAction,
  updateTenantUserRoleAction,
} from "./actions";
import type { UsersFlashPayload } from "./constants";

const th: CanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type UsersManagerProps = {
  users: TenantUserRoleRecord[];
  roles: TenantRoleCatalogRecord[];
  errors: string[];
  emptyReason: EmptyReason | null;
  refreshMetadata: UiRefreshMetadata;
  availableActions: ResourceActionDescriptor[];
};

type UserRow = TenantUserRoleRecord & Record<string, unknown>;

type RoleActions = {
  updateRole: ResourceActionDescriptor;
  suspend: ResourceActionDescriptor;
  reactivate: ResourceActionDescriptor;
};

type ModalState =
  | { kind: "invite" }
  | { kind: "role"; user: TenantUserRoleRecord }
  | { kind: "suspend"; user: TenantUserRoleRecord }
  | { kind: "reactivate"; user: TenantUserRoleRecord }
  | null;

const STATUS_LABEL: Record<TenantUserRoleStatus, string> = {
  active: "active",
  invited: "invited",
  suspended: "suspended",
};

const STATUS_FILTERS: readonly {
  value: "all" | TenantUserRoleStatus;
  label: string;
}[] = [
  { value: "all", label: "全部狀態" },
  { value: "active", label: "active" },
  { value: "invited", label: "invited (待邀請)" },
  { value: "suspended", label: "suspended (已停用)" },
];

const numberFormatter = new Intl.NumberFormat("en");
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
}

function getStatusTone(status: TenantUserRoleStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "neutral";
}

function findAction(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor {
  return (
    actions.find((item) => item.action === action) ?? {
      action,
      enabled: false,
      riskLevel: "medium",
    }
  );
}

// Recompute per-row CTA descriptors from the user's status. The canonical
// backend does not emit a per-row `availableActions[]`, so the route-level
// capability templates are gated here (packet §3.5 / §5.7 contract note),
// mirroring the canvas TN_Users artboard which enables row actions by status.
function deriveRowActions(
  status: TenantUserRoleStatus,
  actions: ResourceActionDescriptor[],
): RoleActions {
  const updateRoleTemplate = findAction(actions, "update_role");
  const suspendTemplate = findAction(actions, "suspend_user");
  const reactivateTemplate = findAction(actions, "reactivate_user");

  return {
    updateRole: {
      ...updateRoleTemplate,
      enabled: status === "active",
      ...(status === "active" ? {} : { disabledReasonCode: "not_active" }),
    },
    suspend: {
      ...suspendTemplate,
      enabled: status === "active",
      ...(status === "active" ? {} : { disabledReasonCode: "not_active" }),
    },
    reactivate: {
      ...reactivateTemplate,
      enabled: status === "suspended",
      ...(status === "suspended"
        ? {}
        : { disabledReasonCode: "not_suspended" }),
    },
  };
}

// Distinct copy for each of the 6 tenant-relevant EmptyReason variants
// (packet §3.6). Keyed as Partial because the canonical EmptyReason union
// also carries the driver-only `driver_not_eligible`, which never reaches
// the tenant users surface.
const EMPTY_STATE_COPY: Partial<
  Record<EmptyReason, { title: string; description: string; tone: CanvasTone }>
> = {
  no_data: {
    title: "尚未有租戶成員",
    description: "此租戶目前只有管理者自己。邀請第一位成員，而不是顯示假資料。",
    tone: "accent",
  },
  not_provisioned: {
    title: "租戶帳號權限尚未開通",
    description:
      "成員名冊與角色目錄都是空的，代表此租戶尚未完成帳號權限佈建。請先完成佈建後再邀請成員。",
    tone: "accent",
  },
  fetch_failed: {
    title: "成員名冊載入失敗",
    description:
      "路由仍可進入，但成員清單讀取失敗。請於後端依賴恢復後重新整理。",
    tone: "warn",
  },
  permission_denied: {
    title: "目前的操作者無權管理成員",
    description:
      "此頁面可見，但目前操作者沒有讀取或變更租戶成員的權限（只有 tenant admin 可操作）。",
    tone: "danger",
  },
  external_unavailable: {
    title: "相依服務暫時無法使用",
    description:
      "成員資料服務目前不可用或回傳過期資料，成員管理暫時降級。請稍後再試。",
    tone: "warn",
  },
  filtered_empty: {
    title: "沒有符合篩選條件的成員",
    description:
      "此租戶有成員，但目前的角色 / 狀態篩選沒有命中任何列。請清除篩選或調整條件。",
    tone: "neutral",
  },
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "flex-end",
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: th.textMuted,
  marginBottom: 6,
};

const nativeControlStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const emptyStateStyle: CSSProperties = {
  padding: 40,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 10,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 12, 0.66)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const modalCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 460,
};

const modalFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 4,
};

function ActionCta({
  descriptor,
  label,
  onClick,
  variant = "secondary",
  size = "sm",
  icon,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  onClick: () => void;
  variant?: NonNullable<CanvasBtnProps["variant"]>;
  size?: NonNullable<CanvasBtnProps["size"]>;
  icon?: CanvasBtnProps["icon"];
}) {
  const disabled = !descriptor.enabled;
  const button = (
    <CanvasBtn
      theme={th}
      variant={variant}
      size={size}
      danger={descriptor.riskLevel === "high"}
      disabled={disabled}
      onClick={disabled ? () => undefined : onClick}
      {...(icon ? { icon } : {})}
    >
      {label}
    </CanvasBtn>
  );

  if (disabled && descriptor.disabledReasonCode) {
    return (
      <span
        style={{ display: "inline-flex" }}
        title={descriptor.disabledReasonCode}
      >
        {button}
      </span>
    );
  }
  return button;
}

export function UsersManager({
  users,
  roles,
  errors,
  emptyReason,
  refreshMetadata,
  availableActions,
}: UsersManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<UsersFlashPayload | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | TenantUserRoleStatus
  >("all");

  // Invite-modal draft.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  // Role-modal draft.
  const [draftRole, setDraftRole] = useState("");
  // Suspend-modal draft (high-risk reason; UI-only per §5.7 contract note).
  const [suspendReason, setSuspendReason] = useState("");

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.assignable),
    [roles],
  );
  const roleOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const user of users) {
      codes.add(user.roleCode);
    }
    for (const role of roles) {
      codes.add(role.roleCode);
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b, "en"));
  }, [roles, users]);

  const inviteAction = findAction(availableActions, "invite_user");

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (roleFilter !== "all" && user.roleCode !== roleFilter) {
          return false;
        }
        if (statusFilter !== "all" && user.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [users, roleFilter, statusFilter],
  );

  const hasActiveFilter = roleFilter !== "all" || statusFilter !== "all";
  const displayedEmptyReason: EmptyReason | null =
    filteredUsers.length > 0
      ? null
      : users.length > 0 || hasActiveFilter
        ? "filtered_empty"
        : (emptyReason ?? "no_data");

  const activeCount = users.filter((user) => user.status === "active").length;
  const invitedCount = users.filter((user) => user.status === "invited").length;
  const suspendedCount = users.filter(
    (user) => user.status === "suspended",
  ).length;

  const freshnessTone: CanvasTone =
    refreshMetadata.dataFreshness === "degraded"
      ? "warn"
      : refreshMetadata.dataFreshness === "stale"
        ? "warn"
        : "info";

  function closeModal() {
    setModal(null);
    setInviteEmail("");
    setInviteName("");
    setInviteRole("");
    setDraftRole("");
    setSuspendReason("");
  }

  function refreshNow() {
    setFlash(null);
    router.refresh();
  }

  function runAction(action: () => Promise<UsersFlashPayload>) {
    startTransition(async () => {
      const result = await action();
      setFlash(result);
      if (result.tone === "success") {
        closeModal();
        router.refresh();
      }
    });
  }

  function submitInvite() {
    const formData = new FormData();
    formData.set("email", inviteEmail);
    formData.set("displayName", inviteName);
    formData.set("roleCode", inviteRole);
    runAction(() => inviteTenantUserAction(formData));
  }

  function submitRoleUpdate(user: TenantUserRoleRecord) {
    const formData = new FormData();
    formData.set("userId", user.userId);
    formData.set("roleCode", draftRole);
    formData.set("displayName", user.displayName);
    runAction(() => updateTenantUserRoleAction(formData));
  }

  function submitStatusChange(
    user: TenantUserRoleRecord,
    status: TenantUserRoleStatus,
  ) {
    const formData = new FormData();
    formData.set("userId", user.userId);
    formData.set("roleCode", user.roleCode);
    formData.set("status", status);
    formData.set("displayName", user.displayName);
    if (status === "suspended") {
      formData.set("reason", suspendReason);
    }
    runAction(() => setTenantUserStatusAction(formData));
  }

  const columns: CanvasTableColumn<UserRow>[] = [
    {
      h: "NAME",
      k: "displayName",
      w: 180,
      r: (row) => <span style={namePrimaryStyle}>{row.displayName}</span>,
    },
    { h: "EMAIL", k: "email", mono: true },
    {
      h: "ROLE",
      w: 200,
      mono: true,
      r: (row) => (
        <CanvasPill theme={th} tone={getRoleTone(row.roleCode)}>
          {row.roleCode}
        </CanvasPill>
      ),
    },
    {
      h: "STATE",
      w: 130,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {STATUS_LABEL[row.status]}
        </CanvasPill>
      ),
    },
    {
      h: "UPDATED",
      w: 160,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
    {
      h: "ACTIONS",
      w: 240,
      r: (row) => {
        const rowActions = deriveRowActions(row.status, availableActions);
        return (
          <div style={rowActionsStyle}>
            <ActionCta
              descriptor={rowActions.updateRole}
              label="更新角色"
              size="xs"
              onClick={() => {
                setFlash(null);
                setDraftRole(row.roleCode);
                setModal({ kind: "role", user: row });
              }}
            />
            {row.status === "suspended" ? (
              <ActionCta
                descriptor={rowActions.reactivate}
                label="恢復"
                size="xs"
                onClick={() => {
                  setFlash(null);
                  setModal({ kind: "reactivate", user: row });
                }}
              />
            ) : (
              <ActionCta
                descriptor={rowActions.suspend}
                label="停用"
                size="xs"
                onClick={() => {
                  setFlash(null);
                  setSuspendReason("");
                  setModal({ kind: "suspend", user: row });
                }}
              />
            )}
          </div>
        );
      },
    },
  ];

  const emptyCopy = displayedEmptyReason
    ? EMPTY_STATE_COPY[displayedEmptyReason]
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="使用者"
        subtitle="只有 tenant admin 可操作 · tenant_admin / operator / finance / integration_mgr / viewer"
        actions={
          <ActionCta
            descriptor={inviteAction}
            label="邀請"
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() => {
              setFlash(null);
              setInviteRole(assignableRoles[0]?.roleCode ?? "");
              setModal({ kind: "invite" });
            }}
          />
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={freshnessTone}
          icon="clock"
          title="刷新層級 T5：租戶慢速（30 秒）"
          body={`快照於 ${formatUpdated(refreshMetadata.generatedAt)} 產生 · 資料來源 ${refreshMetadata.source} · 新鮮度 ${refreshMetadata.dataFreshness}。叫車狀態由派遣端上游觸發，於下次輪詢時呈現。`}
          actions={
            <CanvasBtn
              theme={th}
              size="xs"
              variant="secondary"
              onClick={refreshNow}
              disabled={pending}
            >
              重新整理
            </CanvasBtn>
          }
        />

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分人員資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {flash ? (
          <CanvasBanner
            theme={th}
            tone={flash.tone === "success" ? "success" : "warn"}
            icon={flash.tone === "success" ? "check" : "warn"}
            title={flash.title}
            body={flash.description}
          />
        ) : null}

        <div style={filterBarStyle}>
          <label>
            <span style={fieldLabelStyle}>角色</span>
            <select
              style={nativeControlStyle}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">全部角色</option>
              {roleOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>狀態</span>
            <select
              style={nativeControlStyle}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "all" | TenantUserRoleStatus,
                )
              }
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {hasActiveFilter ? (
            <CanvasBtn
              theme={th}
              size="sm"
              variant="ghost"
              icon="x"
              onClick={() => {
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              清除篩選
            </CanvasBtn>
          ) : null}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <CanvasPill theme={th} tone="success" dot>
              active {formatCount(activeCount)}
            </CanvasPill>
            <CanvasPill theme={th} tone="warn" dot>
              invited {formatCount(invitedCount)}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral" dot>
              suspended {formatCount(suspendedCount)}
            </CanvasPill>
          </div>
        </div>

        <CanvasCard theme={th} padding={0}>
          {filteredUsers.length > 0 ? (
            <CanvasTable<UserRow>
              theme={th}
              columns={columns}
              rows={filteredUsers as UserRow[]}
            />
          ) : emptyCopy ? (
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone={emptyCopy.tone} dot>
                {displayedEmptyReason}
              </CanvasPill>
              <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
                {emptyCopy.title}
              </div>
              <div
                style={{
                  color: th.textMuted,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  maxWidth: 420,
                }}
              >
                {emptyCopy.description}
              </div>
              {displayedEmptyReason === "filtered_empty" ? (
                <CanvasBtn
                  theme={th}
                  size="sm"
                  variant="secondary"
                  icon="x"
                  onClick={() => {
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  清除篩選
                </CanvasBtn>
              ) : displayedEmptyReason === "no_data" ||
                displayedEmptyReason === "not_provisioned" ? (
                <ActionCta
                  descriptor={inviteAction}
                  label="邀請第一位成員"
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onClick={() => {
                    setFlash(null);
                    setInviteRole(assignableRoles[0]?.roleCode ?? "");
                    setModal({ kind: "invite" });
                  }}
                />
              ) : (
                <CanvasBtn
                  theme={th}
                  size="sm"
                  variant="secondary"
                  onClick={refreshNow}
                  disabled={pending}
                >
                  重新整理
                </CanvasBtn>
              )}
            </div>
          ) : null}
        </CanvasCard>
      </div>

      {modal ? (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true">
          {modal.kind === "invite" ? (
            <CanvasCard
              theme={th}
              title="邀請成員"
              subtitle="medium 風險 · 送出後新成員狀態為 invited"
              style={modalCardStyle}
            >
              <div style={modalFieldStyle}>
                <label>
                  <span style={fieldLabelStyle}>顯示名稱</span>
                  <input
                    style={{ ...nativeControlStyle, width: "100%" }}
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="王小明"
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Email</span>
                  <input
                    style={{ ...nativeControlStyle, width: "100%" }}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="user@tenant.example"
                    type="email"
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>角色</span>
                  <select
                    style={{ ...nativeControlStyle, width: "100%" }}
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                  >
                    {assignableRoles.length === 0 ? (
                      <option value="">沒有可指派角色</option>
                    ) : (
                      assignableRoles.map((role) => (
                        <option key={role.roleCode} value={role.roleCode}>
                          {role.displayName
                            ? `${role.displayName} · ${role.roleCode}`
                            : role.roleCode}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <div style={modalActionsStyle}>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="ghost"
                    onClick={closeModal}
                  >
                    取消
                  </CanvasBtn>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="primary"
                    icon="plus"
                    disabled={
                      pending ||
                      !inviteEmail.trim() ||
                      !inviteName.trim() ||
                      !inviteRole
                    }
                    onClick={submitInvite}
                  >
                    送出邀請
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          ) : null}

          {modal.kind === "role" ? (
            <CanvasCard
              theme={th}
              title="更新角色"
              subtitle={`medium 風險 · ${modal.user.displayName}`}
              style={modalCardStyle}
            >
              <div style={modalFieldStyle}>
                <label>
                  <span style={fieldLabelStyle}>角色</span>
                  <select
                    style={{ ...nativeControlStyle, width: "100%" }}
                    value={draftRole}
                    onChange={(event) => setDraftRole(event.target.value)}
                  >
                    {assignableRoles.map((role) => (
                      <option key={role.roleCode} value={role.roleCode}>
                        {role.displayName
                          ? `${role.displayName} · ${role.roleCode}`
                          : role.roleCode}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={modalActionsStyle}>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="ghost"
                    onClick={closeModal}
                  >
                    取消
                  </CanvasBtn>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="primary"
                    disabled={pending || !draftRole}
                    onClick={() => submitRoleUpdate(modal.user)}
                  >
                    儲存角色
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          ) : null}

          {modal.kind === "suspend" ? (
            <CanvasCard
              theme={th}
              title="停用使用者"
              subtitle={`high 風險 · 需填寫原因 · ${modal.user.displayName}`}
              style={modalCardStyle}
            >
              <div style={modalFieldStyle}>
                <label>
                  <span style={fieldLabelStyle}>停用原因（必填）</span>
                  <textarea
                    style={{
                      ...nativeControlStyle,
                      width: "100%",
                      minHeight: 80,
                      resize: "vertical",
                    }}
                    value={suspendReason}
                    onChange={(event) => setSuspendReason(event.target.value)}
                    placeholder="例如：待調查的安全事件"
                  />
                </label>
                <div style={modalActionsStyle}>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="ghost"
                    onClick={closeModal}
                  >
                    取消
                  </CanvasBtn>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    danger
                    disabled={pending || !suspendReason.trim()}
                    onClick={() => submitStatusChange(modal.user, "suspended")}
                  >
                    確認停用
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          ) : null}

          {modal.kind === "reactivate" ? (
            <CanvasCard
              theme={th}
              title="恢復使用者"
              subtitle={`medium 風險 · ${modal.user.displayName}`}
              style={modalCardStyle}
            >
              <div style={modalFieldStyle}>
                <div
                  style={{
                    color: th.textMuted,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  將 {modal.user.displayName} 由 suspended 恢復為
                  active，並沿用目前角色 {modal.user.roleCode}。
                </div>
                <div style={modalActionsStyle}>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="ghost"
                    onClick={closeModal}
                  >
                    取消
                  </CanvasBtn>
                  <CanvasBtn
                    theme={th}
                    size="sm"
                    variant="primary"
                    disabled={pending}
                    onClick={() => submitStatusChange(modal.user, "active")}
                  >
                    確認恢復
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
