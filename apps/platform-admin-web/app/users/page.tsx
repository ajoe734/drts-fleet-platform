"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

type UserFilter = "all" | PlatformAdminUserStatus;
type UserRow = PlatformAdminUserRecord & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const pillsRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const pillButtonStyle = {
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
} satisfies CSSProperties;

const tableEmptyStyle = {
  padding: 28,
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const nameButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
} satisfies CSSProperties;

const avatarStyle = {
  width: 22,
  height: 22,
  borderRadius: 11,
  background: theme.accentBg,
  color: theme.accent,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
} satisfies CSSProperties;

const nameTextStyle = {
  color: theme.text,
  fontWeight: 500,
  lineHeight: 1.3,
} satisfies CSSProperties;

const overlayScrimStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 80,
} satisfies CSSProperties;

const overlayPanelStyle = {
  width: "min(880px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
} satisfies CSSProperties;

const overlayContentStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
} satisfies CSSProperties;

const monoInputStyle = {
  ...inputStyle,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    {
      key: "users",
      href: "/users",
      icon: "users",
      label: labels.users,
    },
    { divider: labels.fleetGov },
    {
      key: "fleet",
      href: "/fleet",
      icon: "fleet",
      label: labels.fleet,
    },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "docs",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "billing",
      label: labels.payments,
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "alerts",
      label: labels.notices,
    },
    {
      key: "audit",
      href: "/audit",
      icon: "audit",
      label: labels.audit,
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "feature",
      label: labels.flags,
    },
    {
      key: "adapter-registry",
      href: "/adapter-registry",
      icon: "integration",
      label: labels.adapters,
    },
  ];
}

function getStatusTone(status: PlatformAdminUserStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "danger";
}

function getInitials(displayName: string) {
  const compact = displayName.trim().replace(/\s+/g, " ");
  if (!compact) return "PA";
  const parts = compact.split(" ");
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return compact.slice(0, 2).toUpperCase();
}

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);
  const [users, setUsers] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [creating, setCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Platform staff",
          subtitle:
            "Internal platform users and roles. RBAC gatekeeping still resolves from backend authority.",
          refresh: "Refresh",
          invite: "Invite",
          last30Days: "last 30 days",
          all: "All staff",
          errorTitle: "Unable to load platform users",
          suspendedTitle:
            "Suspended staff still appear in the authority roster",
          suspendedBody: (count: number) =>
            `${count} suspended account${count === 1 ? "" : "s"} remain visible and should be confirmed against current staffing.`,
          detailTitle: "Staff detail",
          detailSubtitle:
            "Role and status changes stay off the main roster surface until explicitly opened.",
          inviteTitle: "Invite platform staff",
          inviteSubtitle:
            "Create the internal user record and assign the initial platform role before the user enters downstream workflows.",
          visibleNow: "Visible rows",
          activeStaff: "Active staff",
          openInvites: "Open invites",
          role: "Role",
          status: "Status",
          created: "Created",
          updated: "Updated",
          activate: "Activate",
          suspend: "Suspend",
          promoteAdmin: "Promote admin",
          assignViewer: "Assign viewer",
          noUsers:
            "No platform staff found yet. Invite the first internal user.",
          filterLabels: {
            all: "All",
            active: "Active",
            invited: "Invited",
            suspended: "Suspended",
          },
        }
      : {
          title: "平台人員",
          subtitle:
            "平台內部使用者與角色治理，RBAC 守門仍以前後端 authority 真值為準。",
          refresh: "重新整理",
          invite: "邀請",
          last30Days: "last 30 days",
          all: "全部人員",
          errorTitle: "無法載入平台人員資料",
          suspendedTitle: "停權帳號仍保留在 authority roster",
          suspendedBody: (count: number) =>
            `目前仍有 ${count} 筆停權帳號顯示在平台名單中，請確認是否要保留治理軌跡。`,
          detailTitle: "人員詳情",
          detailSubtitle: "角色與狀態調整移出主名單，僅在需要時打開治理視窗。",
          inviteTitle: "邀請平台人員",
          inviteSubtitle:
            "先建立內部使用者主檔與初始平台角色，再讓該使用者進入後續工作流。",
          visibleNow: "目前筆數",
          activeStaff: "啟用中人員",
          openInvites: "待接受邀請",
          role: "角色",
          status: "狀態",
          created: "建立時間",
          updated: "更新",
          activate: "啟用",
          suspend: "停權",
          promoteAdmin: "設為 admin",
          assignViewer: "設為 viewer",
          noUsers: "目前沒有任何平台人員，請先邀請第一位內部使用者。",
          filterLabels: {
            all: "全部",
            active: "啟用",
            invited: "邀請中",
            suspended: "停權",
          },
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

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user) => user.status === "active").length,
      invited: users.filter((user) => user.status === "invited").length,
      suspended: users.filter((user) => user.status === "suspended").length,
    }),
    [users],
  );

  const visibleUsers = useMemo(() => {
    if (filter === "all") return users;
    return users.filter((user) => user.status === filter);
  }, [filter, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const createDisabled =
    creating || !formEmail.trim() || !formDisplayName.trim();

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformAdminUser({
        email: formEmail,
        displayName: formDisplayName,
        roleCode: formRoleCode,
      });
      setShowCreate(false);
      setFormEmail("");
      setFormDisplayName("");
      setFormRoleCode("operator");
      await loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = useCallback(
    async (
      userId: string,
      command: {
        roleCode: PlatformAdminUserRole;
        status?: PlatformAdminUserStatus;
      },
    ) => {
      setUpdatingUserId(userId);
      setError(null);
      try {
        await client.updatePlatformAdminUserRole(userId, command);
        await loadUsers();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("common.unknown"));
      } finally {
        setUpdatingUserId(null);
      }
    },
    [client, loadUsers, t],
  );

  const columns = useMemo<CanvasTableColumn<UserRow>[]>(
    () => [
      {
        h: "NAME",
        w: 220,
        r: (row) => (
          <button
            type="button"
            style={nameButtonStyle}
            onClick={() => setSelectedUserId(row.userId)}
          >
            <span style={avatarStyle}>{getInitials(row.displayName)}</span>
            <span style={nameTextStyle}>{row.displayName}</span>
          </button>
        ),
      },
      {
        h: "EMAIL",
        k: "email",
        w: 260,
        mono: true,
      },
      {
        h: "ROLE",
        k: "roleCode",
        w: 220,
        mono: true,
      },
      {
        h: "STATUS",
        w: 120,
        r: (row) => (
          <CanvasPill theme={theme} tone={getStatusTone(row.status)} dot>
            {row.status}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "UPDATED" : "更新",
        w: 180,
        mono: true,
        r: (row) => formatDateTime(row.updatedAt),
      },
    ],
    [locale],
  );

  const filterPills = [
    {
      value: "all" as const,
      label: copy.filterLabels.all,
      count: counts.all,
      tone: "neutral" as CanvasTone,
    },
    {
      value: "active" as const,
      label: copy.filterLabels.active,
      count: counts.active,
      tone: "success" as CanvasTone,
    },
    {
      value: "invited" as const,
      label: copy.filterLabels.invited,
      count: counts.invited,
      tone: "warn" as CanvasTone,
    },
    {
      value: "suspended" as const,
      label: copy.filterLabels.suspended,
      count: counts.suspended,
      tone: "danger" as CanvasTone,
    },
  ];

  const selectedFilterLabel = filterPills.find(
    (item) => item.value === filter,
  )?.label;

  if (loading) {
    return (
      <CanvasShell
        theme={theme}
        nav={navItems}
        active="users"
        currentPath="/users"
        breadcrumb={[
          locale === "en" ? "Tenant Governance" : "租戶治理",
          copy.title,
        ]}
        searchPlaceholder={
          locale === "en" ? "Search platform admin" : "搜尋平台治理頁面"
        }
        avatarLabel="PA"
        style={shellStyle}
      >
        <div style={pageStackStyle}>
          <CanvasCard theme={theme}>
            <div style={tableEmptyStyle}>{t("users.loading")}</div>
          </CanvasCard>
        </div>
      </CanvasShell>
    );
  }

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="users"
      currentPath="/users"
      breadcrumb={[
        locale === "en" ? "Tenant Governance" : "租戶治理",
        copy.title,
      ]}
      searchPlaceholder={
        locale === "en" ? "Search platform admin" : "搜尋平台治理頁面"
      }
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn theme={theme} onClick={() => void loadUsers()}>
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate(true)}
            >
              {copy.invite}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {!error && counts.suspended > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy.suspendedTitle}
            body={copy.suspendedBody(counts.suspended)}
          />
        ) : null}

        <div style={pillsRowStyle}>
          {filterPills.map((item) => (
            <button
              key={item.value}
              type="button"
              style={pillButtonStyle}
              onClick={() => setFilter(item.value)}
            >
              <CanvasPill
                theme={theme}
                tone={filter === item.value ? "accent" : item.tone}
                dot={item.value !== "all"}
              >
                {item.label} {item.count}
              </CanvasPill>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <CanvasPill theme={theme} tone="neutral">
            {copy.last30Days}
          </CanvasPill>
        </div>

        <CanvasCard theme={theme} padding={0}>
          {visibleUsers.length > 0 ? (
            <CanvasTable<UserRow>
              theme={theme}
              columns={columns}
              rows={visibleUsers as UserRow[]}
            />
          ) : (
            <div style={tableEmptyStyle}>{copy.noUsers}</div>
          )}
        </CanvasCard>
      </div>

      {showCreate ? (
        <div
          style={overlayScrimStyle}
          onClick={() => setShowCreate(false)}
          role="presentation"
        >
          <div
            style={overlayPanelStyle}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pa-users-invite-title"
          >
            <CanvasCard
              theme={theme}
              title={copy.inviteTitle}
              subtitle={copy.inviteSubtitle}
              actions={
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowCreate(false)}
                >
                  {t("common.close")}
                </CanvasBtn>
              }
            >
              <div style={overlayContentStyle}>
                <div id="pa-users-invite-title" style={{ display: "none" }}>
                  {copy.inviteTitle}
                </div>
                <div style={kpiGridStyle}>
                  <CanvasKPI
                    theme={theme}
                    label={copy.activeStaff}
                    value={counts.active}
                    sub={`${counts.all} total`}
                  />
                  <CanvasKPI
                    theme={theme}
                    label={copy.openInvites}
                    value={counts.invited}
                    sub={`${counts.suspended} suspended`}
                  />
                </div>

                <form onSubmit={handleCreate} style={overlayContentStyle}>
                  <div style={formGridStyle}>
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
                        style={monoInputStyle}
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
                        onChange={(event) =>
                          setFormDisplayName(event.target.value)
                        }
                        required
                        style={inputStyle}
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
                        style={inputStyle}
                      >
                        {ROLE_CODES.map((roleCode) => (
                          <option key={roleCode} value={roleCode}>
                            {roleCode}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                  </div>

                  <div style={actionRowStyle}>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      size="md"
                      disabled={createDisabled}
                    >
                      {creating ? t("common.adding") : copy.invite}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      onClick={() => setShowCreate(false)}
                    >
                      {t("common.cancel")}
                    </CanvasBtn>
                  </div>
                </form>
              </div>
            </CanvasCard>
          </div>
        </div>
      ) : null}

      {selectedUser ? (
        <div
          style={overlayScrimStyle}
          onClick={() => setSelectedUserId(null)}
          role="presentation"
        >
          <div
            style={overlayPanelStyle}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pa-users-detail-title"
          >
            <CanvasCard
              theme={theme}
              title={copy.detailTitle}
              subtitle={copy.detailSubtitle}
              actions={
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setSelectedUserId(null)}
                >
                  {t("common.close")}
                </CanvasBtn>
              }
            >
              <div style={overlayContentStyle}>
                <div id="pa-users-detail-title" style={{ display: "none" }}>
                  {copy.detailTitle}
                </div>

                <div style={kpiGridStyle}>
                  <CanvasKPI
                    theme={theme}
                    label={copy.activeStaff}
                    value={selectedUser.status}
                    sub={selectedUser.roleCode}
                  />
                  <CanvasKPI
                    theme={theme}
                    label={copy.visibleNow}
                    value={visibleUsers.length}
                    sub={selectedFilterLabel ?? copy.all}
                  />
                </div>

                {selectedUser.status === "suspended" ? (
                  <CanvasBanner
                    theme={theme}
                    tone="warn"
                    title={copy.suspendedTitle}
                    body={copy.suspendedBody(1)}
                  />
                ) : null}

                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: "NAME",
                      value: selectedUser.displayName,
                    },
                    {
                      label: "EMAIL",
                      value: selectedUser.email,
                      mono: true,
                    },
                    {
                      label: copy.role,
                      value: selectedUser.roleCode,
                      mono: true,
                    },
                    {
                      label: copy.status,
                      value: selectedUser.status,
                      mono: true,
                    },
                    {
                      label: copy.created,
                      value: formatDateTime(selectedUser.createdAt),
                      mono: true,
                    },
                    {
                      label: copy.updated,
                      value: formatDateTime(selectedUser.updatedAt),
                      mono: true,
                    },
                  ]}
                />

                <div style={actionRowStyle}>
                  <CanvasBtn
                    theme={theme}
                    size="sm"
                    disabled={
                      updatingUserId === selectedUser.userId ||
                      selectedUser.roleCode === "admin"
                    }
                    onClick={() =>
                      void handleUpdate(selectedUser.userId, {
                        roleCode: "admin",
                        status: selectedUser.status,
                      })
                    }
                  >
                    {copy.promoteAdmin}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    size="sm"
                    disabled={
                      updatingUserId === selectedUser.userId ||
                      selectedUser.roleCode === "viewer"
                    }
                    onClick={() =>
                      void handleUpdate(selectedUser.userId, {
                        roleCode: "viewer",
                        status: selectedUser.status,
                      })
                    }
                  >
                    {copy.assignViewer}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    size="sm"
                    disabled={updatingUserId === selectedUser.userId}
                    onClick={() =>
                      void handleUpdate(selectedUser.userId, {
                        roleCode: selectedUser.roleCode,
                        status:
                          selectedUser.status === "suspended"
                            ? "active"
                            : "suspended",
                      })
                    }
                  >
                    {selectedUser.status === "suspended"
                      ? copy.activate
                      : copy.suspend}
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}
