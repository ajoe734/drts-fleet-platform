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
) {
  const billingEmail = tenant.bootstrapDefaults.billingBaseline.email;

  if (billingEmail && /admin/i.test(role.roleCode)) {
    return billingEmail;
  }

  if (role.acknowledgedAt) {
    return `${role.displayName} acknowledged`;
  }

  if (role.invitedAt) {
    return `${role.displayName} invited`;
  }

  return "Pending assignment";
}

function getRoleStateLabel(role: PlatformTenantBootstrapRoleDefault) {
  if (role.acknowledgedAt) {
    return "已確認";
  }
  if (role.invitedAt) {
    return "邀請中";
  }
  return "未邀請";
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

function buildTabs() {
  return [
    "Overview",
    "Modules",
    "Onboarding",
    "Rollout",
    "Roles",
    "Webhook baseline",
    "Billing baseline",
    "Audit",
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
      setError("Missing tenant id.");
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
  }, [client, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const tabs = useMemo(() => buildTabs(), []);
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
            invitee: buildInviteeHint(role, tenant),
            stateLabel: getRoleStateLabel(role),
          }))
        : [],
    [tenant],
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
          action: `Invited ${roleCode}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, tenant],
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
          action: `Acknowledged ${roleCode}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, tenant],
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
        action: "Entered rollback_hold",
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
  }, [client, rollbackReason, tenant]);

  const roleColumns = useMemo<CanvasTableColumn<RoleRow>[]>(
    () => [
      {
        h: "INVITEE",
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
              {row.required ? "required role" : "optional role"}
            </span>
          </div>
        ),
      },
      {
        h: "ROLE",
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
        h: "STATE",
        w: 112,
        r: (row) => (
          <Pill theme={theme} tone={getRoleTone(row)} dot>
            {row.stateLabel}
          </Pill>
        ),
      },
      {
        h: "UPDATED",
        w: 112,
        mono: true,
        r: (row) =>
          formatShortDate(row.acknowledgedAt ?? row.invitedAt ?? undefined),
      },
      {
        h: "ACTION",
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
                {roleActionKey === inviteKey ? "Inviting…" : "Invite"}
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
                {roleActionKey === ackKey ? "Saving…" : "Acknowledge"}
              </Btn>
            );
          }

          return (
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>—</span>
          );
        },
      },
    ],
    [handleAcknowledgeRole, handleInviteRole, roleActionKey],
  );

  const onboardingItems = useMemo(
    () =>
      tenant
        ? [
            {
              k: "INTEGRATION MODE",
              v: tenant.integrationPackage.mode,
              mono: true,
            },
            {
              k: "BOOTSTRAP ADMIN",
              v: tenant.bootstrapDefaults.billingBaseline.email || "—",
              mono: true,
            },
            {
              k: "SANDBOX BASE URL",
              v: tenant.integrationPackage.sandboxBaseUrl || "—",
              mono: true,
            },
            {
              k: "PRODUCTION BASE URL",
              v: tenant.integrationPackage.productionBaseUrl || "—",
              mono: true,
            },
            {
              k: "BILLING BASELINE",
              v: `${tenant.bootstrapDefaults.billingBaseline.invoiceTitle || "—"} · ${tenant.bootstrapDefaults.billingBaseline.contactName || "—"}`,
            },
            {
              k: "WEBHOOK BASELINE",
              v: formatList(tenant.bootstrapDefaults.webhookEvents),
              mono: true,
            },
            {
              k: "QUOTA / 月",
              v: `${tenant.quotas.monthlyBookings.toLocaleString(locale === "en" ? "en-US" : "zh-TW")} bookings`,
              mono: true,
            },
            {
              k: "MODULES",
              v: `${tenant.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`,
              mono: true,
            },
          ]
        : [],
    [locale, tenant],
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
        label: "sandbox",
        subtitle: `gate ${tenant.rollout.sandboxStatus}`,
        tone: getGateTone(tenant.rollout.sandboxStatus),
        active:
          tenant.rollout.stage === "sandbox" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: "pilot",
        subtitle: `gate ${tenant.rollout.pilotStatus}`,
        tone: getGateTone(tenant.rollout.pilotStatus),
        active:
          tenant.rollout.stage === "pilot" && tenant.status !== "rollback_hold",
      },
      {
        label: "production",
        subtitle: `gate ${tenant.rollout.productionStatus}`,
        tone: getGateTone(tenant.rollout.productionStatus),
        active:
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: "rollback_hold ready",
        subtitle: tenant.rollout.rollbackOwner
          ? `owner: ${tenant.rollout.rollbackOwner}`
          : "owner not assigned",
        tone: tenant.status === "rollback_hold" ? "danger" : "neutral",
        active: tenant.status === "rollback_hold",
      },
    ];
  }, [tenant]);

  if (loading) {
    return (
      <div style={pageBodyStyle}>
        <div style={emptyStateStyle}>{t("tenantDetail.loadingWorkspace")}</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={t("tenantDetail.title")}
          subtitle={tenantId ? `tenantId: ${tenantId}` : t("tenantDetail.subtitleFallback")}
          actions={
            <Btn
              theme={theme}
              variant="secondary"
              onClick={() => window.location.assign("/tenants")}
            >
              {t("tenantDetail.backToTenants")}
            </Btn>
          }
        />
        <div style={pageBodyStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("tenantDetail.unableToLoad")}
              body={error}
            />
          ) : null}
          <div style={emptyStateStyle}>
            <div>
              <div
                style={{ color: theme.text, fontWeight: 600, marginBottom: 8 }}
              >
                {t("tenantDetail.notFoundHeading")}
              </div>
              <p style={mutedTextStyle}>
                {t("tenantDetail.notFoundBody")}
              </p>
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
                ? "rollback_hold"
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
              {t("tenantDetail.openInTenantConsole")}
            </Btn>
            <Btn
              theme={theme}
              danger
              icon="warn"
              disabled={tenant.status === "rollback_hold"}
              onClick={() => setShowRollbackModal(true)}
            >
              {t("tenantDetail.enterRollbackHold")}
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
            title={t("tenantDetail.actionFailed")}
            body={error}
          />
        ) : null}

        {receipt ? (
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={`Audit receipt · ${receipt.action}`}
            body={
              receipt.reason
                ? `Reason captured: ${receipt.reason} · ${formatDateTime(receipt.at)}`
                : formatDateTime(receipt.at)
            }
          />
        ) : null}

        <Card
          theme={theme}
          title={t("tenantDetail.rolloutCardTitle")}
          subtitle={`cutover owner: ${tenant.rollout.cutoverOwner ?? "unassigned"} · rollback owner: ${tenant.rollout.rollbackOwner ?? "unassigned"} (linked user records · Q-ADM06)`}
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
              title={`rollbackPrepared = ${tenant.rollout.rollbackPrepared ? "true" : "false"}`}
              body={
                tenant.rollout.rollbackPrepared
                  ? "租戶已具備 production rollback 條件。"
                  : "推進到 production 前，需先補齊 rollback plan。"
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
              title={t("tenantDetail.roleAcknowledgements")}
              body={`${acknowledgedRoles ?? 0}/${totalRoles} 角色已邀請並確認。`}
            />
            <Banner
              theme={theme}
              tone={rolloutGate === "blocked" ? "danger" : "info"}
              icon={rolloutGate === "blocked" ? "warn" : "clock"}
              title={`current gate = ${rolloutGate}`}
              body={
                tenant.rollout.notes?.trim()
                  ? tenant.rollout.notes
                  : "尚未記錄額外 cutover note。"
              }
            />
          </div>
        </Card>

        <div style={detailGridStyle}>
          <Card theme={theme} title={t("tenantDetail.onboardingPackage")}>
            <DL theme={theme} cols={2} items={onboardingItems} />
          </Card>

          <div style={stackStyle}>
            <Card
              theme={theme}
              title={`Roles & invites · ${acknowledgedRoles ?? 0}/${totalRoles} acknowledged`}
            >
              <Table
                theme={theme}
                dense
                columns={roleColumns}
                rows={roleRows}
              />
            </Card>

            <Card theme={theme} title={t("tenantDetail.tenantBaseline")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "STAGE",
                    v: tenant.rollout.stage,
                    mono: true,
                  },
                  {
                    k: "CURRENT GATE",
                    v: rolloutGate ?? "—",
                    mono: true,
                  },
                  {
                    k: "UPDATED",
                    v: formatDateTime(tenant.updatedAt),
                    mono: true,
                  },
                  {
                    k: "LAST PROMOTED",
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
          title={t("tenantDetail.recentActivity")}
          subtitle={t("tenantDetail.recentActivitySubtitle")}
        >
          <div style={bannerGridStyle}>
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={t("tenantDetail.tenantRecordUpdated")}
              body={`${formatDateTime(tenant.updatedAt)} · ${tenant.code}`}
            />
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={t("tenantDetail.tenantCreated")}
              body={`${formatDateTime(tenant.createdAt)} · bootstrap package recorded`}
            />
            <Banner
              theme={theme}
              tone={tenant.status === "rollback_hold" ? "danger" : "success"}
              icon={tenant.status === "rollback_hold" ? "warn" : "ok"}
              title={
                tenant.status === "rollback_hold"
                  ? "Tenant is currently in rollback_hold"
                  : "No active rollback hold"
              }
              body={
                tenant.rollout.lastPromotedAt
                  ? `Last promotion: ${formatDateTime(tenant.rollout.lastPromotedAt)}`
                  : "Promotion history not yet recorded."
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
                  {t("tenantDetail.modalTitle")}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11.5,
                    marginTop: 2,
                  }}
                >
                  {t("tenantDetail.modalHighRiskNote")}
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
                Close
              </Btn>
            </div>
            <div style={modalBodyStyle}>
              <Banner
                theme={theme}
                tone="danger"
                icon="warn"
                title={`${tenant.name} will be blocked from further promotion.`}
                body="Use this when rollout risk or incident state requires an explicit governance hold."
              />
              <Field theme={theme} label="Reason" required>
                <textarea
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  placeholder={t("tenantDetail.reasonPlaceholder")}
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
                  Cancel
                </Btn>
                <Btn
                  theme={theme}
                  danger
                  disabled={
                    rollbackSubmitting || rollbackReason.trim().length === 0
                  }
                  onClick={() => void handleConfirmRollbackHold()}
                >
                  {rollbackSubmitting ? "Submitting…" : "Confirm rollback_hold"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
