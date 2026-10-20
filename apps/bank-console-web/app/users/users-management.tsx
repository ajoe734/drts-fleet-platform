"use client";

import { useState, type FormEvent } from "react";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@drts/tenant-auth/constants";
import { t, type Locale } from "../../lib/translations";
import type { BankUserDirectory, BankUserMutation } from "../../lib/users-data";

function csrfToken() {
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${TENANT_CSRF_COOKIE_NAME}=`));
  return value
    ? decodeURIComponent(value.slice(TENANT_CSRF_COOKIE_NAME.length + 1))
    : "";
}

export default function UsersManagement({
  initial,
  locale,
  initialFilter,
}: {
  initial: BankUserDirectory;
  locale: Locale;
  initialFilter?: string | undefined;
}) {
  const [directory, setDirectory] = useState<BankUserDirectory | null>(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState(initialFilter ?? "all");
  const en = locale === "en";
  async function request(command?: BankUserMutation) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: command ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        ...(command
          ? {
              headers: {
                "Content-Type": "application/json",
                [TENANT_CSRF_HEADER_NAME]: csrfToken(),
              },
              body: JSON.stringify(command),
            }
          : {}),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          setDirectory(null);
        throw new Error(
          `${body?.error?.code ?? response.status}: ${body?.error?.message ?? (en ? "Request failed" : "操作失敗")}`,
        );
      }
      setDirectory(body.data);
      setMessage(en ? "Updated state confirmed." : "已確認最新狀態。");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : en
            ? "Request failed. Reload before retrying."
            : "操作失敗，請重新讀取確認狀態。",
      );
    } finally {
      setPending(false);
    }
  }
  async function logout() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { [TENANT_CSRF_HEADER_NAME]: csrfToken() },
      });
      if (!response.ok) throw new Error(en ? "Sign out failed" : "登出失敗");
      setDirectory(null);
      window.location.assign("/api/auth/tenant/login?return_url=%2Fusers");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setPending(false);
    }
  }
  const canManage = directory?.canManageUsers === true && !pending;
  const roles = directory?.roles ?? [];
  function roleOptions() {
    return roles.map((role) => (
      <option key={role.roleCode} value={role.roleCode}>
        {role.displayName} ({role.roleCode})
      </option>
    ));
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void request({
      action: "invite",
      email: String(data.get("email")),
      displayName: String(data.get("displayName")),
      roleCode: String(data.get("roleCode")),
    });
  }
  const users = directory?.users ?? [];
  const visible = ["active", "invited", "suspended"].includes(filter)
    ? users.filter((user) => user.status === filter)
    : users;
  return (
    <>
      <section className="surface-card">
        <p>
          {en ? "Current tenant" : "目前租戶"}: {directory?.tenantId ?? "—"}
        </p>
        <button type="button" disabled={pending} onClick={() => void request()}>
          {en ? "Reload users" : "重新讀取人員"}
        </button>
        <button type="button" disabled={pending} onClick={() => void logout()}>
          {en ? "Sign out / switch account" : "登出／切換帳戶"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {!directory && (
          <a href="/api/auth/tenant/login?return_url=%2Fusers">
            {en ? "Sign in with tenant account" : "使用租戶帳戶登入"}
          </a>
        )}
        <form onSubmit={invite} aria-label={en ? "Invite user" : "邀請人員"}>
          <label>
            {en ? "Name" : "姓名"}
            <input name="displayName" required disabled={!canManage} />
          </label>
          <label>
            Email
            <input name="email" type="email" required disabled={!canManage} />
          </label>
          <label>
            {en ? "Role" : "角色"}
            <select
              name="roleCode"
              required
              disabled={!canManage}
              defaultValue=""
            >
              <option value="" disabled>
                {en ? "Select role" : "選擇角色"}
              </option>
              {roleOptions()}
            </select>
          </label>
          <button
            className="table-action-button is-primary"
            disabled={!canManage}
            type="submit"
          >
            {t("users.invite", locale)}
          </button>
        </form>
      </section>
      <nav
        className="users-filter-tabs"
        aria-label={t("users.filterNav", locale)}
      >
        {(["all", "active", "invited", "suspended"] as const).map((value) => (
          <button
            type="button"
            className={`users-filter-tab${value === filter ? " is-active" : ""}`}
            aria-pressed={value === filter}
            key={value}
            onClick={() => setFilter(value)}
          >
            {t(`users.filter.${value}`, locale)}{" "}
            <span className="users-filter-badge">
              {value === "all"
                ? users.length
                : users.filter((user) => user.status === value).length}
            </span>
          </button>
        ))}
      </nav>
      <section className="surface-card users-table-card">
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                {(
                  [
                    "user",
                    "email",
                    "role",
                    "status",
                    "lastActivity",
                    "actions",
                  ] as const
                ).map((key) => (
                  <th key={key}>{t(`users.table.${key}`, locale)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <strong>{user.name}</strong>
                  </td>
                  <td className="mono-cell">{user.email}</td>
                  <td>
                    <span className={`role-pill role-${user.role}`}>
                      {t(`users.role.${user.role}`, locale)}
                      <span className="role-pill-code">{user.roleCode}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`table-status status-${user.status}`}>
                      {t(`users.status.${user.status}`, locale)}
                    </span>
                  </td>
                  <td>{user.lastActivity}</td>
                  <td>
                    <div className="row-actions">
                      <form
                        key={`${user.userId}:${user.roleCode}`}
                        aria-label={`${en ? "Change role" : "變更角色"}: ${user.email}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void request({
                            action: "role",
                            userId: user.userId,
                            roleCode: String(data.get("roleCode")),
                          });
                        }}
                      >
                        <select
                          aria-label={`${en ? "Role" : "角色"}: ${user.email}`}
                          name="roleCode"
                          defaultValue={user.roleCode}
                          disabled={!canManage}
                          required
                        >
                          {!roles.some(
                            (role) => role.roleCode === user.roleCode,
                          ) && (
                            <option value={user.roleCode} disabled>
                              {user.roleCode}
                            </option>
                          )}
                          {roleOptions()}
                        </select>
                        <button
                          className="table-action-button is-primary"
                          disabled={!canManage}
                          type="submit"
                        >
                          {t("users.action.changeRole", locale)}
                        </button>
                      </form>
                      <button
                        className="table-action-button is-ghost"
                        type="button"
                        disabled={!canManage || user.status === "invited"}
                        onClick={() =>
                          void request({
                            action: "status",
                            userId: user.userId,
                            status:
                              user.status === "suspended"
                                ? "active"
                                : "suspended",
                          })
                        }
                      >
                        {t(
                          user.status === "suspended"
                            ? "users.action.reactivate"
                            : "users.action.suspend",
                          locale,
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
