import type { CSSProperties } from "react";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { t } from "@/lib/translations";

type BankRole = "bank_program_admin" | "bank_ops_viewer" | "bank_finance";
type UserStatus = "active" | "invited" | "suspended";
type AuditEvent = "invite" | "roleChange" | "suspend" | "reactivate";

const CURRENT_ACTOR = {
  name: "林宜君",
  role: "bank_program_admin" as BankRole,
  lastActivity: "2026-06-11 10:32",
};

const USERS: Array<{
  name: string;
  email: string;
  role: BankRole;
  status: UserStatus;
  lastActivity: string;
}> = [
  {
    name: "林宜君",
    email: "yl.lin@ctbc-bank.tw",
    role: "bank_program_admin",
    status: "active",
    lastActivity: "2026-06-11 10:32",
  },
  {
    name: "王若涵",
    email: "jo.han@ctbc-bank.tw",
    role: "bank_program_admin",
    status: "active",
    lastActivity: "2026-06-11 09:44",
  },
  {
    name: "陳思穎",
    email: "sy.chen@ctbc-bank.tw",
    role: "bank_ops_viewer",
    status: "active",
    lastActivity: "2026-06-11 09:18",
  },
  {
    name: "張維真",
    email: "wj.chang@ctbc-bank.tw",
    role: "bank_finance",
    status: "active",
    lastActivity: "2026-06-11 08:52",
  },
  {
    name: "李紹安",
    email: "sa.li@ctbc-bank.tw",
    role: "bank_ops_viewer",
    status: "invited",
    lastActivity: "2026-06-10 18:24",
  },
  {
    name: "黃佳恩",
    email: "je.huang@ctbc-bank.tw",
    role: "bank_finance",
    status: "suspended",
    lastActivity: "2026-06-08 16:12",
  },
];

const AUDIT_ROWS: Array<{
  at: string;
  event: AuditEvent;
  actor: string;
  target: string;
  requestId: string;
}> = [
  {
    at: "2026-06-11 09:44",
    event: "roleChange",
    actor: "林宜君",
    target: "張維真",
    requestId: "req_usr_10321",
  },
  {
    at: "2026-06-11 08:15",
    event: "invite",
    actor: "王若涵",
    target: "李紹安",
    requestId: "req_usr_10308",
  },
  {
    at: "2026-06-10 17:52",
    event: "reactivate",
    actor: "林宜君",
    target: "黃佳恩",
    requestId: "req_usr_10284",
  },
  {
    at: "2026-06-10 15:26",
    event: "suspend",
    actor: "王若涵",
    target: "黃佳恩",
    requestId: "req_usr_10275",
  },
];

const ctbcDarkTokens = BRAND_TEMPLATES.CTBC.tokens.dark;

function roleLabel(role: BankRole) {
  return t(`users.role.${role}`);
}

function roleDescription(role: BankRole) {
  return t(`users.roleDescription.${role}`);
}

function statusLabel(status: UserStatus) {
  return t(`users.status.${status}`);
}

function auditLabel(event: AuditEvent) {
  return t(`users.audit.event.${event}`);
}

function actionLabel(status: UserStatus) {
  return status === "suspended"
    ? t("users.action.reactivate")
    : t("users.action.suspend");
}

export default function UsersPage() {
  const canManageUsers = CURRENT_ACTOR.role === "bank_program_admin";
  const activeCount = USERS.filter((user) => user.status === "active").length;
  const invitedCount = USERS.filter((user) => user.status === "invited").length;
  const suspendedCount = USERS.filter(
    (user) => user.status === "suspended",
  ).length;
  const adminCount = USERS.filter(
    (user) => user.role === "bank_program_admin",
  ).length;

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
      <PageHero
        eyebrow={t("users.eyebrow")}
        title={
          <span className="bank-users-title">
            {t("users.title")}
            <span className="issuer-badge">CTBC</span>
          </span>
        }
        description={t("users.lead")}
      />

      <section className="users-summary-grid">
        <SurfaceCard
          kicker={t("users.summary.active")}
          title={String(activeCount)}
          description={t("users.scopeValue")}
        />
        <SurfaceCard
          kicker={t("users.summary.invited")}
          title={String(invitedCount)}
          description={t("users.action.invite")}
        />
        <SurfaceCard
          kicker={t("users.summary.suspended")}
          title={String(suspendedCount)}
          description={t("users.action.reactivate")}
        />
        <SurfaceCard
          kicker={t("users.summary.admin")}
          title={String(adminCount)}
          description={roleLabel("bank_program_admin")}
        />
      </section>

      <section className="users-top-grid">
        <CalloutPanel
          title={t("users.accessTitle")}
          description={t("users.accessBody")}
        >
          <div className="users-meta-grid">
            <div className="meta-pill">
              <span>{t("users.scopeLabel")}</span>
              <strong>{t("users.scopeValue")}</strong>
            </div>
            <div className="meta-pill">
              <span>{t("users.actorLabel")}</span>
              <strong>
                {CURRENT_ACTOR.name} · {roleLabel(CURRENT_ACTOR.role)}
              </strong>
            </div>
            <div className="meta-pill">
              <span>{t("users.lastActivityLabel")}</span>
              <strong>{CURRENT_ACTOR.lastActivity}</strong>
            </div>
          </div>
        </CalloutPanel>

        <CalloutPanel
          title={t("users.auditTitle")}
          description={t("users.auditBody")}
          tone="warning"
        />
      </section>

      <section className="users-role-grid">
        {(
          ["bank_program_admin", "bank_ops_viewer", "bank_finance"] as const
        ).map((role) => (
          <article className="role-card" key={role}>
            <div className="role-card-head">
              <span className="role-dot" />
              <strong>{roleLabel(role)}</strong>
              <span className="role-permission">
                {role === "bank_program_admin"
                  ? t("users.permission.allowed")
                  : t("users.permission.readOnly")}
              </span>
            </div>
            <p>{roleDescription(role)}</p>
          </article>
        ))}
      </section>

      <section className="surface-card users-table-card">
        <div className="users-table-header">
          <div>
            <span className="surface-kicker">{t("users.purpose")}</span>
            <h3>{t("users.title")}</h3>
          </div>
          <button
            className="table-action-button is-primary"
            disabled={!canManageUsers}
            type="button"
          >
            {canManageUsers ? t("users.invite") : t("users.action.locked")}
          </button>
        </div>

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
              {USERS.map((user) => (
                <tr key={user.email}>
                  <td>
                    <div className="user-cell">
                      <span className="user-avatar">
                        {user.name.slice(0, 2)}
                      </span>
                      <div>
                        <strong>{user.name}</strong>
                        <span>{roleDescription(user.role)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono-cell">{user.email}</td>
                  <td>
                    <span className="role-pill">{roleLabel(user.role)}</span>
                  </td>
                  <td>
                    <span className={`table-status status-${user.status}`}>
                      {statusLabel(user.status)}
                    </span>
                  </td>
                  <td className="mono-cell">{user.lastActivity}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action-button"
                        disabled={!canManageUsers}
                        type="button"
                      >
                        {canManageUsers
                          ? t("users.action.changeRole")
                          : t("users.action.locked")}
                      </button>
                      <button
                        className="table-action-button"
                        disabled={!canManageUsers || user.status === "invited"}
                        type="button"
                      >
                        {canManageUsers
                          ? actionLabel(user.status)
                          : t("users.action.locked")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card users-audit-card">
        <div className="users-table-header">
          <div>
            <span className="surface-kicker">{t("audit.title")}</span>
            <h3>{t("users.auditTitle")}</h3>
          </div>
        </div>

        <div className="users-table-scroll">
          <table className="users-table users-audit-table">
            <thead>
              <tr>
                <th>{t("users.table.lastActivity")}</th>
                <th>{t("users.table.actions")}</th>
                <th>{t("users.audit.actor")}</th>
                <th>{t("users.audit.target")}</th>
                <th>{t("users.audit.request")}</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT_ROWS.map((row) => (
                <tr key={row.requestId}>
                  <td className="mono-cell">{row.at}</td>
                  <td>
                    <span className="role-pill">{auditLabel(row.event)}</span>
                  </td>
                  <td>{row.actor}</td>
                  <td>{row.target}</td>
                  <td className="mono-cell">{row.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
