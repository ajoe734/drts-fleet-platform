import type { CSSProperties } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  resolveLocale,
  type BankDemoTenant,
} from "@/lib/demo-tenants";
import { loadBankUsersData } from "@/lib/bank-dev-read-models";
import {
  BANK_CONSOLE_SESSION_COOKIE,
  BANK_CONSOLE_ROLE_COOKIE,
  getBankConsoleSession,
  resolveBankPageSession,
  type BankConsoleRole,
} from "@/lib/session";
import { t, type Locale } from "@/lib/translations";

type BankRole = BankConsoleRole;
type UserStatus = "active" | "invited" | "suspended";
type UserFilter = "all" | UserStatus;

const ROLE_CARDS: BankRole[] = [
  "bank_program_admin",
  "bank_ops_viewer",
  "bank_finance",
];

const FILTERS: UserFilter[] = ["all", "active", "invited", "suspended"];

function roleLabel(role: BankRole, locale: Locale) {
  return t(`users.role.${role}`, locale);
}

function roleCode(role: BankRole, locale: Locale) {
  return t(`users.roleCode.${role}`, locale);
}

function statusLabel(status: UserStatus, locale: Locale) {
  return t(`users.status.${status}`, locale);
}

function filterLabel(filter: UserFilter, locale: Locale) {
  return t(`users.filter.${filter}`, locale);
}

function getCount(
  filter: UserFilter,
  users: Array<{ status: UserStatus }>,
) {
  if (filter === "all") {
    return users.length;
  }

  return users.filter((user) => user.status === filter).length;
}

function getActionLabel(status: UserStatus, locale: Locale) {
  return status === "suspended"
    ? t("users.action.reactivate", locale)
    : t("users.action.suspend", locale);
}

function getActionHref(
  filter: UserFilter,
  bank: BankDemoTenant,
  locale: Locale,
  role: BankRole,
) {
  const params = new URLSearchParams({ bank: bank.code, locale, role });
  if (filter !== "all") {
    params.set("status", filter);
  }
  return `/users?${params.toString()}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    bank?: string | string[];
    locale?: string | string[];
    role?: string | string[];
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(BANK_CONSOLE_SESSION_COOKIE)?.value ||
    cookieStore.get(BANK_CONSOLE_ROLE_COOKIE)?.value;
  const authenticated = resolveBankPageSession(cookieValue, params?.bank, params?.role);
  if (!authenticated) notFound();
  const tenant = authenticated.bank;
  const session = getBankConsoleSession(tenant, locale, authenticated.role);
  const userData = await loadBankUsersData(tenant.tenantId, session.role);
  const issuerTokens = tenant.template.tokens.dark;
  const activeFilter = FILTERS.includes(params?.status as UserFilter)
    ? (params?.status as UserFilter)
    : "all";
  const canManageUsers = session.role === "bank_program_admin";
  const visibleUsers =
    activeFilter === "all"
      ? userData.data.users
      : userData.data.users.filter((user) => user.status === activeFilter);

  const issuerVars = {
    "--issuer-primary": issuerTokens.primary,
    "--issuer-primary-dark": issuerTokens.primaryDark,
    "--issuer-accent": issuerTokens.accent,
    "--issuer-ink": issuerTokens.ink,
    "--issuer-surface": issuerTokens.surface.bg,
    "--issuer-border": issuerTokens.surface.border,
  } as CSSProperties;

  return (
    <div className="page-shell bank-users-page" style={issuerVars}>
      <section className="users-hero">
        <div className="users-hero-copy">
          <span className="eyebrow">{t("users.eyebrow", locale)}</span>
          <h1>{t("users.title", locale)}</h1>
          <p>{t("users.lead", locale)}</p>
        </div>
        <button
          className="table-action-button is-primary"
          disabled={!canManageUsers}
          type="button"
        >
          {canManageUsers
            ? t("users.invite", locale)
            : t("users.action.locked", locale)}
        </button>
      </section>

      {userData.degradedMessage ? (
        <section className="surface-card">
          <p>{userData.degradedMessage}</p>
        </section>
      ) : null}

      <nav
        aria-label={t("users.filterNav", locale)}
        className="users-filter-tabs"
      >
        {FILTERS.map((filter) => {
          const isActive = filter === activeFilter;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`users-filter-tab${isActive ? " is-active" : ""}`}
              href={getActionHref(filter, tenant, locale, session.role)}
              key={filter}
            >
              <span>{filterLabel(filter, locale)}</span>
              <span className="users-filter-badge">
                {getCount(filter, userData.data.users)}
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="users-role-grid">
        {ROLE_CARDS.map((role) => (
          <article className="role-card" key={role}>
            <span className="surface-kicker">{roleCode(role, locale)}</span>
            <strong>{roleLabel(role, locale)}</strong>
            <p>{t(`users.roleCard.${role}`, locale)}</p>
          </article>
        ))}
      </section>

      <section className="surface-card users-table-card">
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t("users.table.user", locale)}</th>
                <th>{t("users.table.email", locale)}</th>
                <th>{t("users.table.role", locale)}</th>
                <th>{t("users.table.status", locale)}</th>
                <th>{t("users.table.lastActivity", locale)}</th>
                <th>{t("users.table.actions", locale)}</th>
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
                    <td className="mono-cell">
                      {user.email}
                    </td>
                    <td>
                      <span className={`role-pill role-${user.role}`}>
                        {roleLabel(user.role, locale)}
                        <span className="role-pill-code">
                          {roleCode(user.role, locale)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`table-status status-${user.status}`}>
                        {statusLabel(user.status, locale)}
                      </span>
                    </td>
                    <td>{user.lastActivity}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action-button is-primary"
                          disabled={disableRoleChange}
                          type="button"
                        >
                          {canManageUsers
                            ? t("users.action.changeRole", locale)
                            : t("users.action.locked", locale)}
                        </button>
                        <button
                          className="table-action-button is-ghost"
                          disabled={disableLifecycleAction}
                          type="button"
                        >
                          {canManageUsers
                            ? getActionLabel(user.status, locale)
                            : t("users.action.locked", locale)}
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
        {t("users.auditFootnote", locale, {
          actor: session.actorName,
          role: session.roleLabel,
        })}
      </p>
    </div>
  );
}
