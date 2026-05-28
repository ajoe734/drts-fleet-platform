"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

type UserFilter = "all" | PlatformAdminUserStatus;

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
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
    if (filter === "all") {
      return users;
    }
    return users.filter((user) => user.status === filter);
  }, [filter, users]);

  const handleCreate = async (event: React.FormEvent) => {
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

  if (loading) {
    return <div className="admin-empty">{t("users.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Identity Governance" : "身分治理"}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => void loadUsers()}
            >
              {copy.refresh}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : copy.add}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Unable to load platform users"
              : "無法載入平台人員資料"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Active staff" : "啟用中人員"}
          value={counts.active}
          detail={`${counts.invited} invited · ${counts.suspended} suspended`}
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "Admin coverage" : "管理角色覆蓋"}
          value={counts.admins}
          detail={locale === "en" ? "superadmin + admin" : "superadmin + admin"}
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Operators" : "Operator 角色"}
          value={counts.operators}
          detail={
            locale === "en"
              ? "Frontline platform operators"
              : "前線平台營運人員"
          }
          tone="accent"
        />
      </KpiRow>

      {showCreate ? (
        <WorkflowPanel
          title={copy.createTitle}
          description={copy.createSubtitle}
          tone="info"
        >
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <label>
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}
                >
                  {t("users.form.email")}
                </div>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                  }}
                  placeholder="staff@platform.drts"
                />
              </label>
              <label>
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}
                >
                  {t("users.form.displayName")}
                </div>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(event) => setFormDisplayName(event.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                  }}
                />
              </label>
              <label>
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}
                >
                  {t("users.form.role")}
                </div>
                <select
                  value={formRoleCode}
                  onChange={(event) =>
                    setFormRoleCode(event.target.value as PlatformAdminUserRole)
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                  }}
                >
                  {ROLE_CODES.map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !formEmail.trim() || !formDisplayName.trim()
              }
            >
              {creating ? t("common.adding") : copy.add}
            </button>
          </form>
        </WorkflowPanel>
      ) : null}

      <DataViewCard
        title={copy.title}
        subtitle={copy.subtitle}
        filters={
          <DataFilterBar
            value={filter}
            onChange={setFilter}
            ariaLabel={copy.filtersLabel}
            filters={[
              {
                value: "all",
                label: locale === "en" ? "All" : "全部",
                count: counts.all,
                tone: "neutral",
              },
              {
                value: "active",
                label: "active",
                count: counts.active,
                tone: "success",
              },
              {
                value: "invited",
                label: "invited",
                count: counts.invited,
                tone: "info",
              },
              {
                value: "suspended",
                label: "suspended",
                count: counts.suspended,
                tone: "danger",
              },
            ]}
          />
        }
      >
        <DataTable
          columns={[
            { label: t("users.col.user"), width: "260px" },
            { label: t("users.col.role"), width: "180px" },
            { label: t("common.status"), width: "140px" },
            { label: locale === "en" ? "Created" : "建立時間", width: "180px" },
            { label: locale === "en" ? "Updated" : "更新時間", width: "180px" },
            { label: t("common.actions"), width: "260px" },
          ]}
          empty={t("users.empty")}
        >
          {visibleUsers.map((user) => (
            <Tr key={user.userId}>
              <Td>
                <DataCellStack
                  primary={<strong>{user.displayName}</strong>}
                  secondary={user.email}
                  tertiary={user.userId}
                />
              </Td>
              <Td>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, user.roleCode)}
                  tone={
                    user.roleCode === "superadmin" || user.roleCode === "admin"
                      ? "info"
                      : user.roleCode === "operator"
                        ? "accent"
                        : "neutral"
                  }
                />
              </Td>
              <Td>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, user.status)}
                  tone={
                    user.status === "active"
                      ? "success"
                      : user.status === "invited"
                        ? "warning"
                        : "danger"
                  }
                />
              </Td>
              <Td>{formatDateTime(user.createdAt)}</Td>
              <Td>{formatDateTime(user.updatedAt)}</Td>
              <Td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    disabled={
                      updatingUserId === user.userId ||
                      user.roleCode === "admin"
                    }
                    onClick={() =>
                      void handleUpdate(user.userId, {
                        roleCode: "admin",
                        status: user.status,
                      })
                    }
                  >
                    {formatPlatformCodeLabel(locale, "admin")}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    disabled={
                      updatingUserId === user.userId ||
                      user.roleCode === "viewer"
                    }
                    onClick={() =>
                      void handleUpdate(user.userId, {
                        roleCode: "viewer",
                        status: user.status,
                      })
                    }
                  >
                    {formatPlatformCodeLabel(locale, "viewer")}
                  </button>
                  {user.status === "suspended" ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      disabled={updatingUserId === user.userId}
                      onClick={() =>
                        void handleUpdate(user.userId, {
                          roleCode: user.roleCode,
                          status: "active",
                        })
                      }
                    >
                      {locale === "en" ? "Activate" : "啟用"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      disabled={updatingUserId === user.userId}
                      onClick={() =>
                        void handleUpdate(user.userId, {
                          roleCode: user.roleCode,
                          status: "suspended",
                        })
                      }
                    >
                      {locale === "en" ? "Suspend" : "停用"}
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
