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

const heroGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 0.9fr)",
  alignItems: "start",
} satisfies CSSProperties;

const heroSummaryStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const inviteFormStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const inviteGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const tableEmptyStyle = {
  padding: 28,
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const nameCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
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

const updatedCellStyle = {
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
} satisfies CSSProperties;

const responsiveStyle = `
  @media (max-width: 980px) {
    .pa-users-hero {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

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
          add: "Invite",
          createTitle: "Invite platform staff",
          createSubtitle:
            "Create the internal user record and assign the initial platform role before the user enters downstream workflows.",
          errorTitle: "Unable to load platform users",
          suspendedTitle:
            "Suspended staff still appear in the authority roster",
          suspendedBody: (count: number) =>
            `${count} suspended account${count === 1 ? "" : "s"} remain visible and should be confirmed against current staffing.`,
          noUsers:
            "No platform staff found yet. Invite the first internal user.",
          created: "Created",
          activate: "Activate",
          suspend: "Suspend",
          filtersLabel: "Roster scope",
          stats: {
            active: "Active staff",
            admins: "Admin coverage",
            invited: "Open invites",
          },
          detail: {
            scope: "Visible scope",
            visible: "Rows",
            latest: "Latest update",
            suspended: "Suspended",
          },
        }
      : {
          title: "平台人員",
          subtitle:
            "平台內部使用者與角色治理，RBAC 守門仍以前後端 authority 真值為準。",
          refresh: "重新整理",
          add: "邀請",
          createTitle: "邀請平台人員",
          createSubtitle:
            "先建立內部使用者主檔與初始平台角色，再讓該使用者進入後續工作流。",
          errorTitle: "無法載入平台人員資料",
          suspendedTitle: "停權帳號仍保留在 authority roster",
          suspendedBody: (count: number) =>
            `目前仍有 ${count} 筆停權帳號顯示在平台名單中，請確認是否要保留治理軌跡。`,
          noUsers: "目前沒有任何平台人員，請先邀請第一位內部使用者。",
          created: "建立時間",
          activate: "啟用",
          suspend: "停權",
          filtersLabel: "名單範圍",
          stats: {
            active: "啟用中人員",
            admins: "管理角色覆蓋",
            invited: "待接受邀請",
          },
          detail: {
            scope: "目前範圍",
            visible: "筆數",
            latest: "最近更新",
            suspended: "停權中",
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
      admins: users.filter(
        (user) => user.roleCode === "superadmin" || user.roleCode === "admin",
      ).length,
    }),
    [users],
  );

  const visibleUsers = useMemo(() => {
    if (filter === "all") return users;
    return users.filter((user) => user.status === filter);
  }, [filter, users]);

  const latestUpdatedAt = useMemo(() => {
    const latest = users.reduce<string | null>((acc, user) => {
      if (!acc) return user.updatedAt;
      return new Date(user.updatedAt) > new Date(acc) ? user.updatedAt : acc;
    }, null);
    return latest ? formatDateTime(latest) : "—";
  }, [users]);

  const selectedFilterLabel = useMemo(() => {
    if (filter === "all") {
      return locale === "en" ? "All staff" : "全部人員";
    }
    return filter;
  }, [filter, locale]);

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
          <div style={nameCellStyle}>
            <span style={avatarStyle}>{getInitials(row.displayName)}</span>
            <span style={nameTextStyle}>{row.displayName}</span>
          </div>
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
        w: 220,
        r: (row) => (
          <div style={updatedCellStyle}>
            <span style={{ fontFamily: theme.monoFamily }}>
              {formatDateTime(row.updatedAt)}
            </span>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                size="xs"
                disabled={
                  updatingUserId === row.userId || row.roleCode === "admin"
                }
                onClick={() =>
                  void handleUpdate(row.userId, {
                    roleCode: "admin",
                    status: row.status,
                  })
                }
              >
                admin
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                size="xs"
                disabled={
                  updatingUserId === row.userId || row.roleCode === "viewer"
                }
                onClick={() =>
                  void handleUpdate(row.userId, {
                    roleCode: "viewer",
                    status: row.status,
                  })
                }
              >
                viewer
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                disabled={updatingUserId === row.userId}
                onClick={() =>
                  void handleUpdate(row.userId, {
                    roleCode: row.roleCode,
                    status: row.status === "suspended" ? "active" : "suspended",
                  })
                }
              >
                {row.status === "suspended" ? copy.activate : copy.suspend}
              </CanvasBtn>
            </div>
          </div>
        ),
      },
    ],
    [copy.activate, copy.suspend, handleUpdate, locale, updatingUserId],
  );

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
      <style>{responsiveStyle}</style>
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
              variant={showCreate ? "secondary" : "primary"}
              icon="plus"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : copy.add}
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

        <div className="pa-users-hero" style={heroGridStyle}>
          <CanvasCard theme={theme}>
            <div style={heroSummaryStyle}>
              <div style={kpiGridStyle}>
                <CanvasKPI
                  theme={theme}
                  label={copy.stats.active}
                  value={counts.active}
                  sub={`${counts.all} total`}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.stats.admins}
                  value={counts.admins}
                  sub="superadmin + admin"
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.stats.invited}
                  value={counts.invited}
                  sub={`${counts.suspended} suspended`}
                />
              </div>
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    label: copy.detail.scope,
                    value: selectedFilterLabel,
                  },
                  {
                    label: copy.detail.visible,
                    value: `${visibleUsers.length}`,
                    mono: true,
                  },
                  {
                    label: copy.detail.latest,
                    value: latestUpdatedAt,
                    mono: true,
                  },
                  {
                    label: copy.detail.suspended,
                    value: `${counts.suspended}`,
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>

          {showCreate ? (
            <CanvasCard
              theme={theme}
              title={copy.createTitle}
              subtitle={copy.createSubtitle}
            >
              <form onSubmit={handleCreate} style={inviteFormStyle}>
                <div style={inviteGridStyle}>
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
                <div>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    size="md"
                    disabled={createDisabled}
                  >
                    {creating ? t("common.adding") : copy.add}
                  </CanvasBtn>
                </div>
              </form>
            </CanvasCard>
          ) : (
            <CanvasCard
              theme={theme}
              title={copy.filtersLabel}
              subtitle={
                locale === "en"
                  ? "Keep the roster close to the PA_Users artboard while exposing invite and suspension lanes when needed."
                  : "維持接近 PA_Users 的純表格姿態，必要時再切換到邀請或停權治理視角。"
              }
            >
              <CanvasField theme={theme} label={copy.filtersLabel}>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as UserFilter)
                  }
                  style={inputStyle}
                >
                  <option value="all">
                    {locale === "en" ? "All staff" : "全部人員"}
                  </option>
                  <option value="active">active</option>
                  <option value="invited">invited</option>
                  <option value="suspended">suspended</option>
                </select>
              </CanvasField>
            </CanvasCard>
          )}
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
    </CanvasShell>
  );
}
