import type { CSSProperties } from "react";
import Link from "next/link";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import { t } from "@/lib/translations";

type BankRole = "bank_program_admin" | "bank_ops_viewer" | "bank_finance";
type UserStatus = "active" | "invited" | "suspended";
type UserFilter = "all" | UserStatus;

const CURRENT_ACTOR = {
  display: "周敬文",
  role: "bank_program_admin" as BankRole,
};

const USERS: Array<{
  name: string;
  email: string;
  role: BankRole;
  status: UserStatus;
  lastActivity: string;
}> = [
  {
    name: "周敬文",
    email: "cw.chou@ctbcbank.com",
    role: "bank_program_admin",
    status: "active",
    lastActivity: "2 分鐘前",
  },
  {
    name: "黃怡安",
    email: "hy.huang@ctbcbank.com",
    role: "bank_ops_viewer",
    status: "active",
    lastActivity: "14 分鐘前",
  },
  {
    name: "湯立群",
    email: "tl.tang@ctbcbank.com",
    role: "bank_finance",
    status: "active",
    lastActivity: "1 小時前",
  },
  {
    name: "郭旻潔",
    email: "mj.kuo@ctbcbank.com",
    role: "bank_ops_viewer",
    status: "invited",
    lastActivity: "— 待接受邀請",
  },
  {
    name: "葉承勳",
    email: "cs.yeh@ctbcbank.com",
    role: "bank_finance",
    status: "suspended",
    lastActivity: "2026-05-20",
  },
];

const ROLE_CARDS: BankRole[] = [
  "bank_program_admin",
  "bank_ops_viewer",
  "bank_finance",
];

const FILTERS: UserFilter[] = ["all", "active", "invited", "suspended"];

const ctbcDarkTokens = BRAND_TEMPLATES.CTBC.tokens.dark;

function roleLabel(role: BankRole) {
  return t(`users.role.${role}`);
}

function roleCode(role: BankRole) {
  return t(`users.roleCode.${role}`);
}

function statusLabel(status: UserStatus) {
  return t(`users.status.${status}`);
}

function filterLabel(filter: UserFilter) {
  return t(`users.filter.${filter}`);
}

function getCount(filter: UserFilter) {
  if (filter === "all") {
    return USERS.length;
  }

  return USERS.filter((user) => user.status === filter).length;
}

function getActionLabel(status: UserStatus) {
  return status === "suspended"
    ? t("users.action.reactivate")
    : t("users.action.suspend");
}

function getActionHref(filter: UserFilter) {
  return filter === "all" ? "/users" : `/users?status=${filter}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const activeFilter = FILTERS.includes(params?.status as UserFilter)
    ? (params?.status as UserFilter)
    : "all";
  const canManageUsers = CURRENT_ACTOR.role === "bank_program_admin";
  const visibleUsers =
    activeFilter === "all"
      ? USERS
      : USERS.filter((user) => user.status === activeFilter);

  const issuerVars = {
    "--issuer-primary": ctbcDarkTokens.primary,
    "--issuer-primary-dark": ctbcDarkTokens.primaryDark,
    "--issuer-accent": ctbcDarkTokens.accent,
    "--issuer-ink": ctbcDarkTokens.ink,
    "--issuer-surface": ctbcDarkTokens.surface.bg,
    "--issuer-border": ctbcDarkTokens.surface.border,
  } as CSSProperties;

  return (
    <div className="page-shell bank-users-page" style={issuerVars}>
      <section className="users-hero">
        <div className="users-hero-copy">
          <span className="eyebrow">{t("users.eyebrow")}</span>
          <h1>{t("users.title")}</h1>
          <p>{t("users.lead")}</p>
        </div>
        <button
          className="table-action-button is-primary"
          disabled={!canManageUsers}
          type="button"
        >
          {canManageUsers ? t("users.invite") : t("users.action.locked")}
        </button>
      </section>

      <nav aria-label={t("users.filterNav")} className="users-filter-tabs">
        {FILTERS.map((filter) => {
          const isActive = filter === activeFilter;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`users-filter-tab${isActive ? " is-active" : ""}`}
              href={getActionHref(filter)}
              key={filter}
            >
              <span>{filterLabel(filter)}</span>
              <span className="users-filter-badge">{getCount(filter)}</span>
            </Link>
          );
        })}
      </nav>

      <section className="users-role-grid">
        {ROLE_CARDS.map((role) => (
          <article className="role-card" key={role}>
            <span className="surface-kicker">{roleCode(role)}</span>
            <strong>{roleLabel(role)}</strong>
            <p>{t(`users.roleCard.${role}`)}</p>
          </article>
        ))}
      </section>

      <section className="surface-card users-table-card">
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t("users.table.user")}</th>
                <th>{t("users.table.email")}</th>
                <th>{t("users.table.role")}</th>
                <th>{t("users.table.status")}</th>
                <th>{t("users.table.lastActivity")}</th>
                <th>{t("users.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const disableRoleChange =
                  !canManageUsers || user.status === "suspended";
                const disableLifecycleAction =
                  !canManageUsers || user.status === "invited";

                return (
                  <tr key={user.email}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar">
                          {user.name.slice(0, 1)}
                        </span>
                        <strong>{user.name}</strong>
                      </div>
                    </td>
                    <td className="mono-cell">{user.email}</td>
                    <td>
                      <span className={`role-pill role-${user.role}`}>
                        {roleLabel(user.role)}
                        <span className="role-pill-code">
                          {roleCode(user.role)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`table-status status-${user.status}`}>
                        {statusLabel(user.status)}
                      </span>
                    </td>
                    <td>{user.lastActivity}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action-button"
                          disabled={disableRoleChange}
                          type="button"
                        >
                          {canManageUsers
                            ? t("users.action.changeRole")
                            : t("users.action.locked")}
                        </button>
                        <button
                          className="table-action-button"
                          disabled={disableLifecycleAction}
                          type="button"
                        >
                          {canManageUsers
                            ? getActionLabel(user.status)
                            : t("users.action.locked")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="users-footnote">
        {t("users.auditFootnote", "zh", {
          actor: CURRENT_ACTOR.display,
          role: roleLabel(CURRENT_ACTOR.role),
        })}
      </p>
    </div>
  );
}
