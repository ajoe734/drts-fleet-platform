"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
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

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const tableEmptyStyle = {
  padding: 28,
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const inputStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const createSubmitStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

const nameCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
} satisfies CSSProperties;

const avatarStyle = {
  width: 32,
  height: 32,
  borderRadius: 10,
  background: theme.accentSoft,
  color: theme.accent,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
} satisfies CSSProperties;

const primaryTextStyle = {
  color: theme.text,
  fontWeight: 600,
  lineHeight: 1.3,
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: theme.textDim,
  fontSize: 11.5,
  lineHeight: 1.4,
} satisfies CSSProperties;

const monoSubtleStyle = {
  color: theme.textDim,
  fontSize: 11,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const updatedCellStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const actionStackStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
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

function getRoleTone(roleCode: PlatformAdminUserRole): CanvasTone {
  if (roleCode === "superadmin") return "platform";
  if (roleCode === "admin") return "info";
  if (roleCode === "operator") return "accent";
  return "neutral";
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
            "Govern internal roles, invite state, and platform-only access from a single desk.",
          refresh: "Refresh",
          add: "Invite staff user",
          createTitle: "Invite platform staff",
          createSubtitle:
            "Create a new internal user record and assign the initial role before the user enters any tenant or ops workflow.",
          filtersLabel: "Filter staff users",
          filterTitle: "Roster scope",
          filterSubtitle:
            "Match the PA_Users board: keep a clean roster, but surface current invite and suspension lanes.",
          errorTitle: "Unable to load platform users",
          attentionTitle: "Suspended staff need governance review",
          attentionBody: (count: number) =>
            `${count} suspended accounts still remain in the authority roster and should be confirmed against current staffing.`,
          lastUpdated: "Latest roster update",
          allRoles: "Governed roles",
          noUsers: "No platform staff found yet. Invite the first internal user.",
          created: "Created",
          activate: "Activate",
          suspend: "Suspend",
          inviteLane: "Invite-only",
          kpis: {
            active: "Active staff",
            admin: "Admin coverage",
            operators: "Operators",
          },
          detail: {
            selection: "Selection",
            visible: "Visible rows",
            latest: "Latest updated",
            pending: "Invited",
          },
        }
      : {
          title: "平台人員",
          subtitle: "統一治理平台內部角色、邀請狀態與平台專屬權限。",
          refresh: "重新整理",
          add: "邀請平台人員",
          createTitle: "邀請平台人員",
          createSubtitle:
            "先建立內部使用者主檔與初始角色，再讓該使用者進入 tenant 或 ops workflow。",
          filtersLabel: "篩選平台人員",
          filterTitle: "名單範圍",
          filterSubtitle:
            "對齊 PA_Users 的乾淨 roster 版型，同時補上目前邀請與停權治理所需的篩選脈絡。",
          errorTitle: "無法載入平台人員資料",
          attentionTitle: "停權中的平台帳號待確認",
          attentionBody: (count: number) =>
            `目前有 ${count} 筆停權帳號仍保留在 authority roster，請確認是否仍需保留治理軌跡。`,
          lastUpdated: "最近名單更新",
          allRoles: "治理角色",
          noUsers: "目前沒有任何平台人員，請先邀請第一位內部使用者。",
          created: "建立時間",
          activate: "啟用",
          suspend: "停權",
          inviteLane: "限邀請加入",
          kpis: {
            active: "啟用中人員",
            admin: "管理角色覆蓋",
            operators: "Operator 角色",
          },
          detail: {
            selection: "目前範圍",
            visible: "可見筆數",
            latest: "最近更新",
            pending: "待接受邀請",
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
      operators: users.filter((user) => user.roleCode === "operator").length,
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
    return formatPlatformCodeLabel(locale, filter);
  }, [filter, locale]);

  const createDisabled =
    creating || !formEmail.trim() || !formDisplayName.trim();

  const filterPills = useMemo(
    () => [
      {
        value: "all" as const,
        label: locale === "en" ? "All" : "全部",
        count: counts.all,
        tone: "neutral" as CanvasTone,
      },
      {
        value: "active" as const,
        label: formatPlatformCodeLabel(locale, "active"),
        count: counts.active,
        tone: "success" as CanvasTone,
      },
      {
        value: "invited" as const,
        label: formatPlatformCodeLabel(locale, "invited"),
        count: counts.invited,
        tone: "warn" as CanvasTone,
      },
      {
        value: "suspended" as const,
        label: formatPlatformCodeLabel(locale, "suspended"),
        count: counts.suspended,
        tone: "danger" as CanvasTone,
      },
    ],
    [counts, locale],
  );

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
        k: "displayName",
        w: 250,
        r: (row) => (
          <div style={nameCellStyle}>
            <span style={avatarStyle}>{getInitials(row.displayName)}</span>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={primaryTextStyle}>{row.displayName}</span>
              <span style={monoSubtleStyle}>{row.userId}</span>
            </div>
          </div>
        ),
      },
      {
        h: "EMAIL",
        k: "email",
        mono: true,
      },
      {
        h: "ROLE",
        k: "roleCode",
        w: 170,
        r: (row) => (
          <CanvasPill theme={theme} tone={getRoleTone(row.roleCode)}>
            {formatPlatformCodeLabel(locale, row.roleCode)}
          </CanvasPill>
        ),
      },
      {
        h: "STATUS",
        k: "status",
        w: 150,
        r: (row) => (
          <CanvasPill theme={theme} tone={getStatusTone(row.status)} dot>
            {formatPlatformCodeLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "UPDATED" : "更新",
        k: "updatedAt",
        w: 250,
        r: (row) => (
          <div style={updatedCellStyle}>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={secondaryTextStyle}>{formatDateTime(row.updatedAt)}</span>
              <span style={monoSubtleStyle}>
                {copy.created}: {formatDateTime(row.createdAt)}
              </span>
            </div>
            <div style={actionStackStyle}>
              <CanvasBtn
                theme={theme}
                size="sm"
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
                {formatPlatformCodeLabel(locale, "admin")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                size="sm"
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
                {formatPlatformCodeLabel(locale, "viewer")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                size="sm"
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
    [copy.activate, copy.created, copy.suspend, handleUpdate, locale, updatingUserId],
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
        searchPlaceholder={locale === "en" ? "Search platform admin" : "搜尋平台治理頁面"}
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
      searchPlaceholder={locale === "en" ? "Search platform admin" : "搜尋平台治理頁面"}
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
              variant={showCreate ? "secondary" : "primary"}
              icon={showCreate ? "x" : "plus"}
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
            title={copy.attentionTitle}
            body={copy.attentionBody(counts.suspended)}
          />
        ) : null}

        <CanvasCard
          theme={theme}
          title={copy.filterTitle}
          subtitle={copy.filterSubtitle}
          actions={
            <CanvasPill theme={theme} tone="platform">
              {copy.inviteLane}
            </CanvasPill>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div style={pillsRowStyle}>
              {filterPills.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  style={pillButtonStyle}
                  onClick={() => setFilter(item.value)}
                  aria-label={`${copy.filtersLabel}: ${item.label}`}
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
                {copy.lastUpdated}: {latestUpdatedAt}
              </CanvasPill>
            </div>

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={copy.kpis.active}
                value={counts.active}
                sub={`${counts.invited} invited / ${counts.suspended} suspended`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpis.admin}
                value={counts.admins}
                sub="superadmin + admin"
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpis.operators}
                value={counts.operators}
                sub={copy.allRoles}
              />
            </div>

            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  label: copy.detail.selection,
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
                  label: copy.detail.pending,
                  value: `${counts.invited}`,
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
            <form onSubmit={handleCreate}>
              <div style={formGridStyle}>
                <CanvasField theme={theme} label={t("users.form.email")} required>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    required
                    placeholder="staff@platform.drts"
                    style={inputStyle(true)}
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
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={t("users.form.role")}>
                  <select
                    value={formRoleCode}
                    onChange={(event) =>
                      setFormRoleCode(event.target.value as PlatformAdminUserRole)
                    }
                    style={inputStyle()}
                  >
                    {ROLE_CODES.map((roleCode) => (
                      <option key={roleCode} value={roleCode}>
                        {formatPlatformCodeLabel(locale, roleCode)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="submit"
                  style={createSubmitStyle(createDisabled)}
                  disabled={createDisabled}
                >
                  {creating ? t("common.adding") : copy.add}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

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
