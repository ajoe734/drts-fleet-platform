"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantBootstrapRoleDefault,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_MODULES,
  type AcknowledgeTenantRoleCommand,
  type InviteTenantRoleCommand,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

type ActionReceipt = {
  action: string;
  reason?: string;
  at: string;
};

type RoleRow = PlatformTenantBootstrapRoleDefault &
  Record<string, unknown> & {
    invitee: string;
    stateLabel: string;
  };

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies React.CSSProperties;

const bannerGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const stackStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 280,
  padding: "40px 24px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.textMuted,
  textAlign: "center",
} satisfies React.CSSProperties;

const stepperStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
} satisfies React.CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.48)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 40,
} satisfies React.CSSProperties;

const modalCardStyle = {
  width: "min(100%, 560px)",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.22)",
} satisfies React.CSSProperties;

const modalBodyStyle = {
  display: "grid",
  gap: 14,
  padding: 18,
} satisfies React.CSSProperties;

const textareaStyle = {
  width: "100%",
  minHeight: 112,
  boxSizing: "border-box",
  padding: "9px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  resize: "vertical",
} satisfies React.CSSProperties;

const actionRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
} satisfies React.CSSProperties;

const mutedTextStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function formatList(value: string[]) {
  return value.length > 0 ? value.join(" · ") : "—";
}

function formatNullableLabel(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "—";
}

function getGateTone(
  gate: PlatformAdminTenantRecord["rollout"]["sandboxStatus"],
): CanvasTone {
  if (gate === "approved") {
    return "success";
  }
  if (gate === "ready") {
    return "info";
  }
  if (gate === "blocked") {
    return "danger";
  }
  return "warn";
}

function getStatusTone(
  status: PlatformAdminTenantRecord["status"],
): CanvasTone {
  if (status === "rollback_hold") {
    return "danger";
  }
  if (status === "active") {
    return "success";
  }
  if (status === "draft") {
    return "warn";
  }
  return "neutral";
}

function getRolloutGateSummary(tenant: PlatformAdminTenantRecord) {
  if (tenant.status === "rollback_hold") {
    return "blocked";
  }

  if (tenant.rollout.stage === "production") {
    return tenant.rollout.productionStatus;
  }

  if (tenant.rollout.stage === "pilot") {
    return tenant.rollout.pilotStatus;
  }

  return tenant.rollout.sandboxStatus;
}

function buildTenantConsoleHref(tenant: PlatformAdminTenantRecord) {
  return (
    tenant.integrationPackage.productionBaseUrl ??
    tenant.integrationPackage.sandboxBaseUrl ??
    `http://localhost:3004/settings?tenant=${encodeURIComponent(tenant.code)}`
  );
}

function buildInviteeHint(
  role: PlatformTenantBootstrapRoleDefault,
  tenant: PlatformAdminTenantRecord,
  t: TranslateFn,
) {
  const billingEmail = tenant.bootstrapDefaults.billingBaseline.email;

  if (billingEmail && /admin/i.test(role.roleCode)) {
    return billingEmail;
  }

  if (role.acknowledgedAt) {
    return t("tenants.detail.role.acknowledgedHint", {
      name: role.displayName,
    });
  }

  if (role.invitedAt) {
    return t("tenants.detail.role.invitedHint", { name: role.displayName });
  }

  return t("tenants.detail.role.pendingAssignment");
}

function getRoleStateLabel(
  role: PlatformTenantBootstrapRoleDefault,
  t: TranslateFn,
) {
  if (role.acknowledgedAt) {
    return t("tenants.role.acknowledged");
  }
  if (role.invitedAt) {
    return t("tenants.role.invited");
  }
  return t("tenants.role.pending");
}

function getRoleTone(role: PlatformTenantBootstrapRoleDefault): CanvasTone {
  if (role.acknowledgedAt) {
    return "success";
  }
  if (role.invitedAt) {
    return "warn";
  }
  return "neutral";
}

function buildTabs(t: TranslateFn) {
  return [
    t("tenants.detail.tab.overview"),
    t("tenants.detail.tab.modules"),
    t("tenants.detail.tab.onboarding"),
    t("tenants.detail.tab.rollout"),
    t("tenants.detail.tab.roles"),
    t("tenants.detail.tab.webhookBaseline"),
    t("tenants.detail.tab.billingBaseline"),
    t("tenants.detail.tab.audit"),
  ];
}

function RolloutStep({
  label,
  subtitle,
  tone,
  active,
}: {
  label: string;
  subtitle: string;
  tone: CanvasTone;
  active: boolean;
}) {
  const accent =
    tone === "success"
      ? theme.success
      : tone === "info"
        ? theme.info
        : tone === "danger"
          ? theme.danger
          : tone === "warn"
            ? theme.warn
            : theme.border;

  return (
    <div
      style={{
        border: `1px solid ${active ? accent : theme.border}`,
        borderRadius: 10,
        padding: "12px 12px 10px",
        background: active ? theme.surface : theme.bgRaised,
        boxShadow: active ? "0 0 0 1px rgba(15, 23, 42, 0.04)" : "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.text,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: theme.textMuted,
          lineHeight: 1.45,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = Array.isArray(params?.tenantId)
    ? params.tenantId[0]
    : params?.tenantId;
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [roleActionKey, setRoleActionKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError(t("tenants.detail.missingTenantId"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await client.getPlatformTenant(tenantId);
      setTenant(result);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [client, t, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const tabs = useMemo(() => buildTabs(t), [t]);
  const activeTab = tabs[3];

  const acknowledgedRoles =
    tenant?.bootstrapDefaults.roleDefaults.filter((role) =>
      Boolean(role.acknowledgedAt),
    ).length ?? 0;
  const totalRoles = tenant?.bootstrapDefaults.roleDefaults.length ?? 0;
  const rolloutGate = tenant ? getRolloutGateSummary(tenant) : null;

  const roleRows = useMemo<RoleRow[]>(
    () =>
      tenant
        ? tenant.bootstrapDefaults.roleDefaults.map((role) => ({
            ...role,
            invitee: buildInviteeHint(role, tenant, t),
            stateLabel: getRoleStateLabel(role, t),
          }))
        : [],
    [t, tenant],
  );

  const handleInviteRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) {
        return;
      }

      const command: InviteTenantRoleCommand = { roleCode };
      const actionKey = `invite:${roleCode}`;
      setRoleActionKey(actionKey);
      setError(null);

      try {
        const updated = await client.inviteTenantRole(tenant.id, command);
        setTenant(updated);
        setReceipt({
          action: `${t("tenants.role.invited")} ${roleCode}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, t, tenant],
  );

  const handleAcknowledgeRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) {
        return;
      }

      const command: AcknowledgeTenantRoleCommand = { roleCode };
      const actionKey = `ack:${roleCode}`;
      setRoleActionKey(actionKey);
      setError(null);

      try {
        const updated = await client.acknowledgeTenantRole(tenant.id, command);
        setTenant(updated);
        setReceipt({
          action: `${t("tenants.role.acknowledged")} ${roleCode}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, t, tenant],
  );

  const handleOpenTenantConsole = useCallback(() => {
    if (!tenant) {
      return;
    }

    window.open(
      buildTenantConsoleHref(tenant),
      "_blank",
      "noopener,noreferrer",
    );
  }, [tenant]);

  const handleConfirmRollbackHold = useCallback(async () => {
    if (!tenant || !rollbackReason.trim()) {
      return;
    }

    setRollbackSubmitting(true);
    setError(null);

    try {
      const updated = await client.rollbackHoldTenant(tenant.id);
      setTenant(updated);
      setReceipt({
        action: t("tenants.detail.enterRollbackHold"),
        reason: rollbackReason.trim(),
        at: new Date().toISOString(),
      });
      setShowRollbackModal(false);
      setRollbackReason("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRollbackSubmitting(false);
    }
  }, [client, rollbackReason, t, tenant]);

  const roleColumns = useMemo<CanvasTableColumn<RoleRow>[]>(
    () => [
      {
        h: t("tenants.detail.role.col.invitee"),
        w: 220,
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ color: theme.text }}>{row.invitee}</span>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11,
                fontFamily: theme.monoFamily,
              }}
            >
              {row.required
                ? t("tenants.detail.role.required")
                : t("tenants.detail.role.optional")}
            </span>
          </div>
        ),
      },
      {
        h: t("tenants.detail.role.col.role"),
        w: 180,
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
              {row.roleCode}
            </span>
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {row.displayName}
            </span>
          </div>
        ),
      },
      {
        h: t("tenants.detail.role.col.state"),
        w: 112,
        r: (row) => (
          <Pill theme={theme} tone={getRoleTone(row)} dot>
            {row.stateLabel}
          </Pill>
        ),
      },
      {
        h: t("tenants.detail.role.col.updated"),
        w: 112,
        mono: true,
        r: (row) =>
          formatShortDate(row.acknowledgedAt ?? row.invitedAt ?? undefined),
      },
      {
        h: t("tenants.detail.role.col.action"),
        w: 140,
        r: (row) => {
          const inviteKey = `invite:${row.roleCode}`;
          const ackKey = `ack:${row.roleCode}`;

          if (!row.invitedAt) {
            return (
              <Btn
                theme={theme}
                variant="secondary"
                size="xs"
                disabled={roleActionKey !== null}
                onClick={() => void handleInviteRole(row.roleCode)}
              >
                {roleActionKey === inviteKey
                  ? t("tenants.detail.role.inviting")
                  : t("tenants.role.invite")}
              </Btn>
            );
          }

          if (!row.acknowledgedAt) {
            return (
              <Btn
                theme={theme}
                variant="secondary"
                size="xs"
                disabled={roleActionKey !== null}
                onClick={() => void handleAcknowledgeRole(row.roleCode)}
              >
                {roleActionKey === ackKey
                  ? t("tenants.detail.role.saving")
                  : t("tenants.role.acknowledge")}
              </Btn>
            );
          }

          return (
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>—</span>
          );
        },
      },
    ],
    [handleAcknowledgeRole, handleInviteRole, roleActionKey, t],
  );

  const onboardingItems = useMemo(
    () =>
      tenant
        ? [
            {
              k: t("tenants.form.integrationMode"),
              v: tenant.integrationPackage.mode,
              mono: true,
            },
            {
              k: t("tenants.form.bootstrapAdminEmail"),
              v: tenant.bootstrapDefaults.billingBaseline.email || "—",
              mono: true,
            },
            {
              k: t("tenants.form.sandboxBaseUrl"),
              v: tenant.integrationPackage.sandboxBaseUrl || "—",
              mono: true,
            },
            {
              k: t("tenants.form.productionBaseUrl"),
              v: tenant.integrationPackage.productionBaseUrl || "—",
              mono: true,
            },
            {
              k: t("tenants.detail.tab.billingBaseline"),
              v: `${tenant.bootstrapDefaults.billingBaseline.invoiceTitle || "—"} · ${tenant.bootstrapDefaults.billingBaseline.contactName || "—"}`,
            },
            {
              k: t("tenants.detail.tab.webhookBaseline"),
              v: formatList(tenant.bootstrapDefaults.webhookEvents),
              mono: true,
            },
            {
              k: t("tenants.detail.onboarding.quotaPerMonth"),
              v: `${tenant.quotas.monthlyBookings.toLocaleString(locale === "en" ? "en-US" : "zh-TW")} ${t("tenants.list.kpi.bookingsSub")}`,
              mono: true,
            },
            {
              k: t("tenants.detail.onboarding.modules"),
              v: `${tenant.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`,
              mono: true,
            },
          ]
        : [],
    [locale, t, tenant],
  );

  const stepDefinitions = useMemo<
    Array<{
      label: string;
      subtitle: string;
      tone: CanvasTone;
      active: boolean;
    }>
  >(() => {
    if (!tenant) {
      return [];
    }

    return [
      {
        label: t("tenants.list.filter.sandbox"),
        subtitle: t("tenants.detail.step.gate", {
          status: tenant.rollout.sandboxStatus,
        }),
        tone: getGateTone(tenant.rollout.sandboxStatus),
        active:
          tenant.rollout.stage === "sandbox" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: t("tenants.list.filter.pilot"),
        subtitle: t("tenants.detail.step.gate", {
          status: tenant.rollout.pilotStatus,
        }),
        tone: getGateTone(tenant.rollout.pilotStatus),
        active:
          tenant.rollout.stage === "pilot" && tenant.status !== "rollback_hold",
      },
      {
        label: t("tenants.list.filter.production"),
        subtitle: t("tenants.detail.step.gate", {
          status: tenant.rollout.productionStatus,
        }),
        tone: getGateTone(tenant.rollout.productionStatus),
        active:
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: t("tenants.detail.step.rollbackReady"),
        subtitle: tenant.rollout.rollbackOwner
          ? t("tenants.detail.step.owner", {
              owner: tenant.rollout.rollbackOwner,
            })
          : t("tenants.detail.step.ownerUnassigned"),
        tone: tenant.status === "rollback_hold" ? "danger" : "neutral",
        active: tenant.status === "rollback_hold",
      },
    ];
  }, [t, tenant]);

  if (loading) {
    return (
      <div style={pageBodyStyle}>
        <div style={emptyStateStyle}>
          {t("tenants.detail.loadingWorkspace")}
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={t("tenants.detail.pageTitle")}
          subtitle={
            tenantId
              ? t("tenants.detail.pageSubtitle", { tenantId })
              : t("tenants.detail.pageTitle")
          }
          actions={
            <Btn
              theme={theme}
              variant="secondary"
              onClick={() => window.location.assign("/tenants")}
            >
              {t("tenants.detail.backToTenants")}
            </Btn>
          }
        />
        <div style={pageBodyStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("tenants.detail.loadErrorTitle")}
              body={error}
            />
          ) : null}
          <div style={emptyStateStyle}>
            <div>
              <div
                style={{ color: theme.text, fontWeight: 600, marginBottom: 8 }}
              >
                {t("tenants.detail.notFoundTitle")}
              </div>
              <p style={mutedTextStyle}>{t("tenants.detail.notFoundBody")}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {tenant.name}
            <Pill theme={theme} tone={getStatusTone(tenant.status)} dot>
              {tenant.status === "rollback_hold"
                ? t("tenants.list.filter.rollbackHold")
                : tenant.rollout.stage}
            </Pill>
          </span>
        }
        subtitle={`${tenant.code} · ${tenant.id}`}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <>
            <Btn
              theme={theme}
              variant="secondary"
              icon="ext"
              onClick={handleOpenTenantConsole}
            >
              {t("tenants.detail.openConsole")}
            </Btn>
            <Btn
              theme={theme}
              danger
              icon="warn"
              disabled={tenant.status === "rollback_hold"}
              onClick={() => setShowRollbackModal(true)}
            >
              {t("tenants.detail.enterRollbackHold")}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("tenants.detail.actionFailed")}
            body={error}
          />
        ) : null}

        {receipt ? (
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={t("tenants.detail.auditReceipt", {
              action: receipt.action,
            })}
            body={
              receipt.reason
                ? t("tenants.detail.reasonCaptured", {
                    reason: receipt.reason,
                    at: formatDateTime(receipt.at),
                  })
                : formatDateTime(receipt.at)
            }
          />
        ) : null}

        <Card
          theme={theme}
          title={t("tenants.detail.rolloutProgressTitle")}
          subtitle={t("tenants.detail.rolloutProgressSubtitle", {
            cutoverOwner: formatNullableLabel(tenant.rollout.cutoverOwner),
            rollbackOwner: formatNullableLabel(tenant.rollout.rollbackOwner),
          })}
        >
          <div style={stepperStyle}>
            {stepDefinitions.map((step) => (
              <RolloutStep
                key={step.label}
                label={step.label}
                subtitle={step.subtitle}
                tone={step.tone}
                active={step.active}
              />
            ))}
          </div>
          <div style={{ ...bannerGridStyle, marginTop: 14 }}>
            <Banner
              theme={theme}
              tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
              icon={tenant.rollout.rollbackPrepared ? "ok" : "warn"}
              title={t("tenants.detail.rollbackPreparedTitle", {
                value: tenant.rollout.rollbackPrepared
                  ? t("common.true")
                  : t("common.false"),
              })}
              body={
                tenant.rollout.rollbackPrepared
                  ? t("tenants.detail.rollbackPrepared.ready")
                  : t("tenants.detail.rollbackPrepared.pending")
              }
            />
            <Banner
              theme={theme}
              tone={
                acknowledgedRoles === totalRoles && totalRoles > 0
                  ? "success"
                  : "warn"
              }
              icon={
                acknowledgedRoles === totalRoles && totalRoles > 0
                  ? "ok"
                  : "warn"
              }
              title={t("tenants.detail.roleAcknowledgementsTitle")}
              body={t("tenants.detail.roleAcknowledgementsBody", {
                acknowledged: acknowledgedRoles,
                total: totalRoles,
              })}
            />
            <Banner
              theme={theme}
              tone={rolloutGate === "blocked" ? "danger" : "info"}
              icon={rolloutGate === "blocked" ? "warn" : "clock"}
              title={t("tenants.detail.currentGateTitle", {
                gate: formatNullableLabel(rolloutGate),
              })}
              body={
                tenant.rollout.notes?.trim()
                  ? tenant.rollout.notes
                  : t("tenants.detail.currentGateEmpty")
              }
            />
          </div>
        </Card>

        <div style={detailGridStyle}>
          <Card theme={theme} title={t("tenants.detail.onboardingPackage")}>
            <DL theme={theme} cols={2} items={onboardingItems} />
          </Card>

          <div style={stackStyle}>
            <Card
              theme={theme}
              title={t("tenants.detail.rolesInvitesTitle", {
                acknowledged: acknowledgedRoles,
                total: totalRoles,
              })}
            >
              <Table
                theme={theme}
                dense
                columns={roleColumns}
                rows={roleRows}
              />
            </Card>

            <Card theme={theme} title={t("tenants.detail.tenantBaseline")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: t("tenants.detail.baseline.stage"),
                    v: tenant.rollout.stage,
                    mono: true,
                  },
                  {
                    k: t("tenants.detail.baseline.currentGate"),
                    v: formatNullableLabel(rolloutGate),
                    mono: true,
                  },
                  {
                    k: t("tenants.detail.baseline.updated"),
                    v: formatDateTime(tenant.updatedAt),
                    mono: true,
                  },
                  {
                    k: t("tenants.detail.baseline.lastPromoted"),
                    v: formatDateTime(tenant.rollout.lastPromotedAt ?? ""),
                    mono: true,
                  },
                ]}
              />
            </Card>
          </div>
        </div>

        <Card
          theme={theme}
          title={t("tenants.detail.recentActivity")}
          subtitle={t("tenants.detail.recentActivitySubtitle")}
        >
          <div style={bannerGridStyle}>
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={t("tenants.detail.recordUpdated")}
              body={t("tenants.detail.recordUpdatedBody", {
                at: formatDateTime(tenant.updatedAt),
                code: tenant.code,
              })}
            />
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={t("tenants.detail.recordCreated")}
              body={t("tenants.detail.recordCreatedBody", {
                at: formatDateTime(tenant.createdAt),
              })}
            />
            <Banner
              theme={theme}
              tone={tenant.status === "rollback_hold" ? "danger" : "success"}
              icon={tenant.status === "rollback_hold" ? "warn" : "ok"}
              title={
                tenant.status === "rollback_hold"
                  ? t("tenants.detail.rollbackHoldActive")
                  : t("tenants.detail.rollbackHoldInactive")
              }
              body={
                tenant.rollout.lastPromotedAt
                  ? t("tenants.detail.lastPromotion", {
                      at: formatDateTime(tenant.rollout.lastPromotedAt),
                    })
                  : t("tenants.detail.noPromotionHistory")
              }
            />
          </div>
        </Card>
      </div>

      {showRollbackModal ? (
        <div
          style={modalBackdropStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-hold-title"
        >
          <div style={modalCardStyle}>
            <div
              style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div
                  id="rollback-hold-title"
                  style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}
                >
                  {t("tenants.detail.modal.title")}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11.5,
                    marginTop: 2,
                  }}
                >
                  {t("tenants.detail.modal.subtitle")}
                </div>
              </div>
              <Btn
                theme={theme}
                variant="ghost"
                icon="x"
                onClick={() => {
                  if (!rollbackSubmitting) {
                    setShowRollbackModal(false);
                  }
                }}
              >
                {t("tenants.detail.modal.close")}
              </Btn>
            </div>
            <div style={modalBodyStyle}>
              <Banner
                theme={theme}
                tone="danger"
                icon="warn"
                title={t("tenants.detail.modal.warningTitle", {
                  tenant: tenant.name,
                })}
                body={t("tenants.detail.modal.warningBody")}
              />
              <Field
                theme={theme}
                label={t("tenants.detail.modal.reasonLabel")}
                required
              >
                <textarea
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  placeholder={t("tenants.detail.modal.reasonPlaceholder")}
                  style={textareaStyle}
                />
              </Field>
              <div style={actionRowStyle}>
                <Btn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowRollbackModal(false)}
                  disabled={rollbackSubmitting}
                >
                  {t("common.cancel")}
                </Btn>
                <Btn
                  theme={theme}
                  danger
                  disabled={
                    rollbackSubmitting || rollbackReason.trim().length === 0
                  }
                  onClick={() => void handleConfirmRollbackHold()}
                >
                  {rollbackSubmitting
                    ? t("tenants.detail.modal.submitting")
                    : t("tenants.detail.modal.confirm")}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
