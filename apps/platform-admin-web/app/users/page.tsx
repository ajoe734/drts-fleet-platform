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

type UserTableRow = PlatformAdminUserRecord &
  Record<string, unknown> & {
    _selected?: boolean;
  };

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

const tableCardStyle = {
  overflow: "hidden",
} satisfies CSSProperties;

const detailStackStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const editorSplitStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
} satisfies CSSProperties;

const formCardStyle = {
  flex: "1.4 1 640px",
  minWidth: 0,
} satisfies CSSProperties;

const sideCardStyle = {
  flex: "1 1 320px",
  minWidth: 280,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const rolePillGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: 24,
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
} satisfies CSSProperties;

const nameCellButtonStyle = (selected: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  color: theme.text,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  fontWeight: selected ? 600 : 500,
});

const avatarStyle = (selected: boolean): CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: 11,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: selected ? theme.accent : theme.accentBg,
  color: selected ? "#fff" : theme.accent,
  border: `1px solid ${selected ? theme.accent : theme.accentBorder}`,
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
});

const nameTextStyle = {
  display: "grid",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const namePrimaryStyle = {
  color: theme.text,
  fontWeight: 500,
  lineHeight: 1.2,
} satisfies CSSProperties;

const nameMetaStyle = {
  color: theme.textMuted,
  fontSize: 10.5,
  fontFamily: theme.monoFamily,
  lineHeight: 1.2,
} satisfies CSSProperties;

const roleCodeStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.text,
} satisfies CSSProperties;

const inputStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  outline: "none",
  fontSize: 12.5,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
});

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 34,
  padding: "8px 14px",
  borderRadius: 7,
  border: `1px solid ${theme.accent}`,
  background: theme.accent,
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: theme.fontFamily,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

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
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
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
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function getInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "??";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return Array.from(trimmed).slice(0, 2).join("").toUpperCase();
}

function getStatusTone(status: PlatformAdminUserStatus): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "invited":
      return "info";
    case "suspended":
    default:
      return "warn";
  }
}

function formatRosterDate(value: string) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [users, setUsers] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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
            "Platform internal users and roles. RBAC authority remains backend-enforced.",
          breadcrumbRoot: "Tenant Governance",
          searchPlaceholder: "Search staff, role, or email...",
          add: "Invite",
          retry: "Refresh",
          errorTitle: "Unable to load platform users",
          createTitle: "Invite platform staff",
          createSubtitle:
            "Create an internal staff identity and assign the initial platform role before workflow access begins.",
          summaryTitle: "Roster summary",
          summarySubtitle: "Live platform staff mix and role catalog",
          detailTitle: "Access controls",
          detailSubtitle: "Select a staff record to adjust role or access state.",
        }
      : {
          title: "平台人員",
          subtitle: "平台內部使用者與角色 · RBAC 守門以後端為準",
          breadcrumbRoot: "租戶治理",
          searchPlaceholder: "搜尋人員、角色或 email...",
          add: "邀請",
          retry: "重新整理",
          errorTitle: "無法載入平台人員資料",
          createTitle: "邀請平台人員",
          createSubtitle:
            "先建立平台內部身分與初始角色，再讓該使用者進入後續治理流程。",
          summaryTitle: "人員摘要",
          summarySubtitle: "平台人員組成與角色目錄",
          detailTitle: "存取調整",
          detailSubtitle: "選取一筆人員資料後，再調整角色或存取狀態。",
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

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

  const latestUpdated = useMemo(() => {
    return users.reduce<string | null>((latest, user) => {
      if (!latest) {
        return user.updatedAt;
      }
      return new Date(user.updatedAt) > new Date(latest)
        ? user.updatedAt
        : latest;
    }, null);
  }, [users]);

  useEffect(() => {
    if (selectedUserId && !users.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId, users]);

  const selectedUser =
    users.find((user) => user.userId === selectedUserId) ?? null;

  const tableRows = useMemo<UserTableRow[]>(
    () =>
      users.map((user) => ({
        ...user,
        _selected: user.userId === selectedUserId,
      })),
    [selectedUserId, users],
  );

  const columns = useMemo<CanvasTableColumn<UserTableRow>[]>(
    () => [
      {
        h: "NAME",
        w: 220,
        r: (row) => (
          <button
            type="button"
            onClick={() => setSelectedUserId(row.userId)}
            style={nameCellButtonStyle(Boolean(row._selected))}
          >
            <span style={avatarStyle(Boolean(row._selected))}>
              {getInitials(row.displayName)}
            </span>
            <span style={nameTextStyle}>
              <span style={namePrimaryStyle}>{row.displayName}</span>
              {row._selected ? (
                <span style={nameMetaStyle}>{row.userId}</span>
              ) : null}
            </span>
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
        w: 180,
        mono: true,
        r: (row) => <span style={roleCodeStyle}>{row.roleCode}</span>,
      },
      {
        h: "STATUS",
        w: 110,
        r: (row) => (
          <CanvasPill theme={theme} tone={getStatusTone(row.status)} dot>
            {row.status}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "UPDATED" : "更新",
        w: 130,
        mono: true,
        r: (row) => formatRosterDate(row.updatedAt),
      },
    ],
    [locale],
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
        setSelectedUserId(userId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("common.unknown"));
      } finally {
        setUpdatingUserId(null);
      }
    },
    [client, loadUsers, t],
  );

  const createDisabled =
    creating || !formEmail.trim() || !formDisplayName.trim();

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="users"
      currentPath="/users"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <CanvasBtn
            theme={theme}
            variant={showCreate ? "secondary" : "primary"}
            icon={showCreate ? "x" : "plus"}
            onClick={() => setShowCreate((current) => !current)}
          >
            {showCreate ? t("common.cancel") : copy.add}
          </CanvasBtn>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
            actions={
              <CanvasBtn theme={theme} size="xs" onClick={() => void loadUsers()}>
                {copy.retry}
              </CanvasBtn>
            }
          />
        ) : null}

        <CanvasCard theme={theme} padding={0} style={tableCardStyle}>
          {loading ? (
            <div style={emptyStateStyle}>{t("users.loading")}</div>
          ) : tableRows.length > 0 ? (
            <CanvasTable<UserTableRow>
              theme={theme}
              columns={columns}
              rows={tableRows}
            />
          ) : (
            <div style={emptyStateStyle}>{t("users.empty")}</div>
          )}
        </CanvasCard>

        {selectedUser ? (
          <CanvasCard
            theme={theme}
            title={copy.detailTitle}
            subtitle={copy.detailSubtitle}
          >
            <div style={detailStackStyle}>
              <CanvasDL
                theme={theme}
                cols={4}
                items={[
                  {
                    k: locale === "en" ? "NAME" : "姓名",
                    v: selectedUser.displayName,
                  },
                  {
                    k: "EMAIL",
                    v: selectedUser.email,
                    mono: true,
                  },
                  {
                    k: "ROLE",
                    v: selectedUser.roleCode,
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "UPDATED" : "更新",
                    v: formatDateTime(selectedUser.updatedAt),
                    mono: true,
                  },
                ]}
              />

              <CanvasField
                theme={theme}
                label={locale === "en" ? "Role reassignment" : "角色調整"}
                hint={
                  locale === "en"
                    ? "Role commands call the existing platform admin update endpoint."
                    : "角色調整沿用既有 platform admin update endpoint。"
                }
              >
                <div style={actionRowStyle}>
                  {ROLE_CODES.map((roleCode) => (
                    <CanvasBtn
                      key={roleCode}
                      theme={theme}
                      size="xs"
                      variant={
                        selectedUser.roleCode === roleCode
                          ? "primary"
                          : "secondary"
                      }
                      disabled={
                        updatingUserId === selectedUser.userId ||
                        selectedUser.roleCode === roleCode
                      }
                      onClick={() =>
                        void handleUpdate(selectedUser.userId, {
                          roleCode,
                          status: selectedUser.status,
                        })
                      }
                    >
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </CanvasBtn>
                  ))}
                </div>
              </CanvasField>

              <CanvasField
                theme={theme}
                label={locale === "en" ? "Access state" : "存取狀態"}
                hint={
                  locale === "en"
                    ? "Suspended users can be reactivated without changing their current role."
                    : "停用中的使用者可直接恢復啟用，不會改變目前角色。"
                }
              >
                <div style={actionRowStyle}>
                  <CanvasPill
                    theme={theme}
                    tone={getStatusTone(selectedUser.status)}
                    dot
                  >
                    {selectedUser.status}
                  </CanvasPill>
                  {selectedUser.status === "suspended" ? (
                    <CanvasBtn
                      theme={theme}
                      size="xs"
                      disabled={updatingUserId === selectedUser.userId}
                      onClick={() =>
                        void handleUpdate(selectedUser.userId, {
                          roleCode: selectedUser.roleCode,
                          status: "active",
                        })
                      }
                    >
                      {locale === "en" ? "Activate" : "啟用"}
                    </CanvasBtn>
                  ) : (
                    <CanvasBtn
                      theme={theme}
                      size="xs"
                      disabled={updatingUserId === selectedUser.userId}
                      onClick={() =>
                        void handleUpdate(selectedUser.userId, {
                          roleCode: selectedUser.roleCode,
                          status: "suspended",
                        })
                      }
                    >
                      {locale === "en" ? "Suspend" : "停用"}
                    </CanvasBtn>
                  )}
                </div>
              </CanvasField>
            </div>
          </CanvasCard>
        ) : null}

        {showCreate ? (
          <div style={editorSplitStyle}>
            <CanvasCard
              theme={theme}
              title={copy.createTitle}
              subtitle={copy.createSubtitle}
              style={formCardStyle}
            >
              <form onSubmit={handleCreate} style={{ display: "grid", gap: 4 }}>
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
                  <CanvasField theme={theme} label={t("users.form.role")} required>
                    <select
                      value={formRoleCode}
                      onChange={(event) =>
                        setFormRoleCode(
                          event.target.value as PlatformAdminUserRole,
                        )
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

                <button
                  type="submit"
                  style={submitButtonStyle(createDisabled)}
                  disabled={createDisabled}
                >
                  {creating ? t("common.adding") : copy.add}
                </button>
              </form>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.summaryTitle}
              subtitle={copy.summarySubtitle}
              style={sideCardStyle}
            >
              <div style={kpiGridStyle}>
                <CanvasKPI
                  theme={theme}
                  label="ACTIVE"
                  value={counts.active}
                  sub={locale === "en" ? "platform access" : "平台存取"}
                />
                <CanvasKPI
                  theme={theme}
                  label="INVITED"
                  value={counts.invited}
                  sub={locale === "en" ? "pending acceptance" : "等待接受"}
                />
                <CanvasKPI
                  theme={theme}
                  label="SUSPENDED"
                  value={counts.suspended}
                  sub={locale === "en" ? "manual hold" : "人工停用"}
                />
              </div>

              <div style={{ height: 16 }} />

              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: locale === "en" ? "STAFF" : "人員總數",
                    v: counts.all,
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "LATEST UPDATE" : "最後更新",
                    v: latestUpdated ? formatRosterDate(latestUpdated) : "—",
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "ROLE COUNT" : "角色數",
                    v: ROLE_CODES.length,
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "SELECTED" : "目前選取",
                    v: selectedUser ? selectedUser.displayName : "—",
                  },
                ]}
              />

              <div style={{ height: 16 }} />

              <CanvasField
                theme={theme}
                label={locale === "en" ? "Role catalog" : "角色目錄"}
                hint={
                  locale === "en"
                    ? "Displayed labels are localized, but update commands still use the underlying role codes."
                    : "畫面顯示可本地化，但 update command 仍沿用底層 role code。"
                }
              >
                <div style={rolePillGridStyle}>
                  {ROLE_CODES.map((roleCode) => (
                    <CanvasPill key={roleCode} theme={theme} tone="accent">
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </CanvasPill>
                  ))}
                </div>
              </CanvasField>
            </CanvasCard>
          </div>
        ) : null}
      </div>
    </CanvasShell>
  );
}
