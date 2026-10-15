"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  formGridStyle,
  formInputStyle,
  formLabelStyle,
  formSectionTitleStyle,
} from "../../../components/governance-form-styles";
import {
  EMPTY_TENANT_FORM,
  ModuleFields,
  QuotaFields,
  TenantIdentityFields,
  createTenantModuleLabels,
  toTenantSettingsFormState,
  toggleTenantModule,
  type TenantFormState,
} from "../../../components/tenant-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "../../../lib/platform-admin-authority";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantBootstrapRoleDefault,
  PlatformTenantGateStatus,
  PlatformTenantIntegrationMode,
  PlatformTenantModule,
  PlatformTenantRolloutStage,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_GATE_STATUSES,
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
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
import {
  acknowledgeTenantRoleWithReadback,
  activateTenantWithReadback,
  buildTenantLifecycleAvailableActions,
  fetchAuthoritativeTenant,
  hasTenantLifecycleWriteAuthority,
  inviteTenantRoleWithReadback,
  rollbackHoldTenantWithReadback,
  setTenantRolloutStageWithReadback,
  suspendTenantWithReadback,
  toTenantOnboardingDraftState,
  updateTenantOnboardingWithReadback,
  updateTenantSettingsWithReadback,
  type TenantLifecycleAuthorityInput,
  type TenantLifecycleMutationOutcome,
  type TenantOnboardingDraftState,
} from "../tenant-lifecycle-client";
import {
  translateTenantLifecycle,
  type TenantLifecycleTranslationKey,
} from "../translations";

type CanonicalAckBannerState = {
  actionLabel: string;
  outcome: TenantLifecycleMutationOutcome;
};

type RoleRow = PlatformTenantBootstrapRoleDefault &
  Record<string, unknown> & {
    invitee: string;
    stateLabel: string;
  };

const EMPTY_ONBOARDING_DRAFT: TenantOnboardingDraftState = {
  invoiceTitle: "",
  billingContactName: "",
  billingContactEmail: "",
  integrationMode: "none",
  sandboxBaseUrl: "",
  productionBaseUrl: "",
  apiKeyScopes: "",
  webhookEvents: "",
  cutoverOwner: "",
  rollbackOwner: "",
  notes: "",
  rollbackPrepared: false,
  sandboxStatus: "pending",
  pilotStatus: "pending",
  productionStatus: "pending",
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
  alignItems: "center",
} satisfies React.CSSProperties;

const confirmRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  marginTop: 12,
} satisfies React.CSSProperties;

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  color: theme.text,
  cursor: "pointer",
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
  pendingLabel: string,
) {
  const billingEmail = tenant.bootstrapDefaults.billingBaseline.email;

  if (billingEmail && /admin/i.test(role.roleCode)) {
    return billingEmail;
  }

  if (role.acknowledgedAt) {
    return `${role.displayName} (${role.roleCode})`;
  }

  if (role.invitedAt) {
    return `${role.displayName} (${role.roleCode})`;
  }

  return pendingLabel;
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
  const authority = usePlatformAdminAuthority() as TenantLifecycleAuthorityInput;
  const { locale, t } = useTranslation();

  const td = useCallback(
    (
      key: TenantLifecycleTranslationKey,
      paramsMap?: Record<string, string | number>,
    ) => translateTenantLifecycle(locale, key, paramsMap),
    [locale],
  );

  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ackBanner, setAckBanner] = useState<CanonicalAckBannerState | null>(
    null,
  );

  // Settings, Quotas & Modules draft state
  const [settingsForm, setSettingsForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [confirmSettings, setConfirmSettings] = useState(true);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);

  // Onboarding Package & Gate Readiness draft state
  const [onboardingForm, setOnboardingForm] =
    useState<TenantOnboardingDraftState>(EMPTY_ONBOARDING_DRAFT);
  const [confirmOnboarding, setConfirmOnboarding] = useState(true);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Rollout Stage promotion draft state
  const [rolloutStageDraft, setRolloutStageDraft] =
    useState<PlatformTenantRolloutStage>("sandbox");
  const [rolloutStageNotes, setRolloutStageNotes] = useState("");
  const [confirmRolloutStage, setConfirmRolloutStage] = useState(true);
  const [rolloutStageSubmitting, setRolloutStageSubmitting] = useState(false);

  // Lifecycle Status transitions (Activate / Suspend / Rollback Hold)
  const [confirmActivate, setConfirmActivate] = useState(true);
  const [activateSubmitting, setActivateSubmitting] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);

  // Bootstrap Role Invite / Acknowledge action key
  const [roleActionKey, setRoleActionKey] = useState<string | null>(null);

  const syncDraftsFromAuthoritativeTenant = useCallback(
    (record: PlatformAdminTenantRecord) => {
      setTenant(record);
      setSettingsForm(toTenantSettingsFormState(record));
      setOnboardingForm(toTenantOnboardingDraftState(record));
      setRolloutStageDraft(record.rollout.stage);
      setRolloutStageNotes(record.rollout.notes ?? "");
    },
    [],
  );

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError("Missing tenant id.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuthoritativeTenant(client, tenantId);
      syncDraftsFromAuthoritativeTenant(result);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [client, syncDraftsFromAuthoritativeTenant, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const canWriteLifecycle = useMemo(
    () => hasTenantLifecycleWriteAuthority(authority),
    [authority],
  );

  const availableActions = useMemo(
    () =>
      tenant ? buildTenantLifecycleAvailableActions(tenant, authority) : null,
    [authority, tenant],
  );

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);
  const tabs = useMemo(() => buildTabs(), []);
  const activeTab = tabs[3];

  const acknowledgedRoles =
    tenant?.bootstrapDefaults.roleDefaults.filter((role) =>
      Boolean(role.acknowledgedAt),
    ).length ?? 0;
  const totalRoles = tenant?.bootstrapDefaults.roleDefaults.length ?? 0;
  const rolloutGate = tenant ? getRolloutGateSummary(tenant) : null;

  const getRoleStateLabel = useCallback(
    (role: PlatformTenantBootstrapRoleDefault) => {
      if (role.acknowledgedAt) {
        return td("tenantLifecycle.roleAcknowledged");
      }
      if (role.invitedAt) {
        return td("tenantLifecycle.roleInvited");
      }
      return td("tenantLifecycle.roleUninvited");
    },
    [td],
  );

  const roleRows = useMemo<RoleRow[]>(
    () =>
      tenant
        ? tenant.bootstrapDefaults.roleDefaults.map((role) => ({
            ...role,
            invitee: buildInviteeHint(
              role,
              tenant,
              td("tenantLifecycle.pendingAssignment"),
            ),
            stateLabel: getRoleStateLabel(role),
          }))
        : [],
    [getRoleStateLabel, td, tenant],
  );

  const handleToggleModule = useCallback((moduleCode: PlatformTenantModule) => {
    setSettingsForm((current) => toggleTenantModule(current, moduleCode));
  }, []);

  const handleSaveSettings = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!tenant) {
        return;
      }

      if (!confirmSettings) {
        setError(td("tenantLifecycle.confirmationRequiredError"));
        return;
      }

      setSettingsSubmitting(true);
      setError(null);
      setAckBanner(null);

      try {
        const outcome = await updateTenantSettingsWithReadback(
          client,
          tenant.id,
          settingsForm,
          authority,
        );
        syncDraftsFromAuthoritativeTenant(outcome.tenant);
        setAckBanner({
          actionLabel: td("tenantLifecycle.action.updateSettings"),
          outcome,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSettingsSubmitting(false);
      }
    },
    [
      authority,
      client,
      confirmSettings,
      settingsForm,
      syncDraftsFromAuthoritativeTenant,
      td,
      tenant,
    ],
  );

  const handleSaveOnboarding = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!tenant) {
        return;
      }

      if (!confirmOnboarding) {
        setError(td("tenantLifecycle.confirmationRequiredError"));
        return;
      }

      setOnboardingSubmitting(true);
      setError(null);
      setAckBanner(null);

      try {
        const outcome = await updateTenantOnboardingWithReadback(
          client,
          tenant.id,
          onboardingForm,
          authority,
        );
        syncDraftsFromAuthoritativeTenant(outcome.tenant);
        setAckBanner({
          actionLabel: td("tenantLifecycle.action.updateOnboarding"),
          outcome,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setOnboardingSubmitting(false);
      }
    },
    [
      authority,
      client,
      confirmOnboarding,
      onboardingForm,
      syncDraftsFromAuthoritativeTenant,
      td,
      tenant,
    ],
  );

  const executeRolloutStageTransition = useCallback(
    async (targetStage: PlatformTenantRolloutStage, notesValue: string) => {
      if (!tenant) {
        return;
      }

      if (!confirmRolloutStage) {
        setError(td("tenantLifecycle.confirmationRequiredError"));
        return;
      }

      setRolloutStageSubmitting(true);
      setError(null);
      setAckBanner(null);

      try {
        const outcome = await setTenantRolloutStageWithReadback(
          client,
          tenant.id,
          {
            stage: targetStage,
            notes: notesValue.trim() ? notesValue.trim() : null,
          },
          authority,
        );
        syncDraftsFromAuthoritativeTenant(outcome.tenant);
        setAckBanner({
          actionLabel: td("tenantLifecycle.action.setRolloutStage", {
            stage: outcome.tenant.rollout.stage,
          }),
          outcome,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRolloutStageSubmitting(false);
      }
    },
    [
      authority,
      client,
      confirmRolloutStage,
      syncDraftsFromAuthoritativeTenant,
      td,
      tenant,
    ],
  );

  const handleApplyRolloutStageForm = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await executeRolloutStageTransition(rolloutStageDraft, rolloutStageNotes);
    },
    [executeRolloutStageTransition, rolloutStageDraft, rolloutStageNotes],
  );

  const handleActivateTenant = useCallback(async () => {
    if (!tenant) {
      return;
    }

    if (!confirmActivate) {
      setError(td("tenantLifecycle.confirmationRequiredError"));
      return;
    }

    setActivateSubmitting(true);
    setError(null);
    setAckBanner(null);

    try {
      const outcome = await activateTenantWithReadback(
        client,
        tenant.id,
        authority,
      );
      syncDraftsFromAuthoritativeTenant(outcome.tenant);
      setAckBanner({
        actionLabel: td("tenantLifecycle.action.activate"),
        outcome,
      });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setActivateSubmitting(false);
    }
  }, [
    authority,
    client,
    confirmActivate,
    syncDraftsFromAuthoritativeTenant,
    td,
    tenant,
  ]);

  const handleConfirmSuspend = useCallback(async () => {
    if (!tenant || !suspendReason.trim()) {
      return;
    }

    setSuspendSubmitting(true);
    setError(null);
    setAckBanner(null);

    try {
      const outcome = await suspendTenantWithReadback(
        client,
        tenant.id,
        suspendReason,
        authority,
      );
      syncDraftsFromAuthoritativeTenant(outcome.tenant);
      setAckBanner({
        actionLabel: td("tenantLifecycle.action.suspend"),
        outcome,
      });
      setShowSuspendModal(false);
      setSuspendReason("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSuspendSubmitting(false);
    }
  }, [
    authority,
    client,
    suspendReason,
    syncDraftsFromAuthoritativeTenant,
    td,
    tenant,
  ]);

  const handleConfirmRollbackHold = useCallback(async () => {
    if (!tenant || !rollbackReason.trim()) {
      return;
    }

    setRollbackSubmitting(true);
    setError(null);
    setAckBanner(null);

    try {
      const outcome = await rollbackHoldTenantWithReadback(
        client,
        tenant.id,
        rollbackReason,
        authority,
      );
      syncDraftsFromAuthoritativeTenant(outcome.tenant);
      setAckBanner({
        actionLabel: td("tenantLifecycle.action.rollbackHold"),
        outcome,
      });
      setShowRollbackModal(false);
      setRollbackReason("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRollbackSubmitting(false);
    }
  }, [
    authority,
    client,
    rollbackReason,
    syncDraftsFromAuthoritativeTenant,
    td,
    tenant,
  ]);

  const handleInviteRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) {
        return;
      }

      const command: InviteTenantRoleCommand = { roleCode };
      const actionKey = `invite:${roleCode}`;
      setRoleActionKey(actionKey);
      setError(null);
      setAckBanner(null);

      try {
        const outcome = await inviteTenantRoleWithReadback(
          client,
          tenant.id,
          command,
          authority,
        );
        syncDraftsFromAuthoritativeTenant(outcome.tenant);
        setAckBanner({
          actionLabel: td("tenantLifecycle.action.inviteRole", { roleCode }),
          outcome,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [authority, client, syncDraftsFromAuthoritativeTenant, td, tenant],
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
      setAckBanner(null);

      try {
        const outcome = await acknowledgeTenantRoleWithReadback(
          client,
          tenant.id,
          command,
          authority,
        );
        syncDraftsFromAuthoritativeTenant(outcome.tenant);
        setAckBanner({
          actionLabel: td("tenantLifecycle.action.acknowledgeRole", {
            roleCode,
          }),
          outcome,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRoleActionKey(null);
      }
    },
    [authority, client, syncDraftsFromAuthoritativeTenant, td, tenant],
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
              {row.required
                ? td("tenantLifecycle.roleRequired")
                : td("tenantLifecycle.roleOptional")}
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
                disabled={!canWriteLifecycle || roleActionKey !== null}
                onClick={() => void handleInviteRole(row.roleCode)}
              >
                {roleActionKey === inviteKey
                  ? td("tenantLifecycle.invitingAction")
                  : td("tenantLifecycle.inviteAction")}
              </Btn>
            );
          }

          if (!row.acknowledgedAt) {
            return (
              <Btn
                theme={theme}
                variant="secondary"
                size="xs"
                disabled={!canWriteLifecycle || roleActionKey !== null}
                onClick={() => void handleAcknowledgeRole(row.roleCode)}
              >
                {roleActionKey === ackKey
                  ? td("tenantLifecycle.acknowledgingAction")
                  : td("tenantLifecycle.acknowledgeAction")}
              </Btn>
            );
          }

          return (
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>—</span>
          );
        },
      },
    ],
    [
      canWriteLifecycle,
      handleAcknowledgeRole,
      handleInviteRole,
      roleActionKey,
      td,
    ],
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
          subtitle={
            tenantId
              ? `tenantId: ${tenantId}`
              : t("tenantDetail.subtitleFallback")
          }
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
              <p style={mutedTextStyle}>{t("tenantDetail.notFoundBody")}</p>
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
              {tenant.status}
            </Pill>
            <Pill theme={theme} tone="info">
              {tenant.rollout.stage}
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
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                data-testid="confirm-activate-checkbox"
                checked={confirmActivate}
                disabled={!canWriteLifecycle}
                onChange={(event) => setConfirmActivate(event.target.checked)}
              />
              <span>{t("common.active")}</span>
            </label>
            <button
              type="button"
              data-testid="activate-tenant-btn"
              disabled={
                !canWriteLifecycle ||
                activateSubmitting ||
                tenant.status === "active"
              }
              onClick={() => void handleActivateTenant()}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.text,
                fontWeight: 500,
                fontSize: 12,
                cursor:
                  !canWriteLifecycle ||
                  activateSubmitting ||
                  tenant.status === "active"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  !canWriteLifecycle ||
                  activateSubmitting ||
                  tenant.status === "active"
                    ? 0.55
                    : 1,
              }}
            >
              {activateSubmitting
                ? td("tenantLifecycle.activatingTenant")
                : td("tenantLifecycle.activateTenant")}
            </button>
            <button
              type="button"
              data-testid="open-suspend-modal-btn"
              disabled={
                !canWriteLifecycle ||
                suspendSubmitting ||
                tenant.status === "paused"
              }
              onClick={() => setShowSuspendModal(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.text,
                fontWeight: 500,
                fontSize: 12,
                cursor:
                  !canWriteLifecycle ||
                  suspendSubmitting ||
                  tenant.status === "paused"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  !canWriteLifecycle ||
                  suspendSubmitting ||
                  tenant.status === "paused"
                    ? 0.55
                    : 1,
              }}
            >
              {suspendSubmitting
                ? td("tenantLifecycle.suspendingTenant")
                : td("tenantLifecycle.suspendTenant")}
            </button>
            <button
              type="button"
              data-testid="open-rollback-modal-btn"
              disabled={
                !canWriteLifecycle || tenant.status === "rollback_hold"
              }
              onClick={() => setShowRollbackModal(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: `1px solid ${theme.danger}`,
                background: theme.danger,
                color: "#ffffff",
                fontWeight: 500,
                fontSize: 12,
                cursor:
                  !canWriteLifecycle || tenant.status === "rollback_hold"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  !canWriteLifecycle || tenant.status === "rollback_hold"
                    ? 0.55
                    : 1,
              }}
            >
              {t("tenantDetail.enterRollbackHold")}
            </button>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {!canWriteLifecycle ? (
          <div data-testid="tenant-authority-readonly-banner">
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title={td("tenantLifecycle.authorityNoticeTitle")}
              body={td("tenantLifecycle.authorityNoticeBody")}
            />
          </div>
        ) : null}

        {error ? (
          <div data-testid="tenant-lifecycle-error-banner" role="alert">
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("tenantDetail.actionFailed")}
              body={error}
            />
          </div>
        ) : null}

        {ackBanner ? (
          <div data-testid="tenant-canonical-ack-banner" role="status">
            <Banner
              theme={theme}
              tone="success"
              icon="ok"
              title={td("tenantLifecycle.ackTitle", {
                action: ackBanner.actionLabel,
              })}
              body={
                ackBanner.outcome.reason
                  ? td("tenantLifecycle.ackBodyWithReason", {
                      code: ackBanner.outcome.tenant.code,
                      id: ackBanner.outcome.tenant.id,
                      status: ackBanner.outcome.tenant.status,
                      stage: ackBanner.outcome.tenant.rollout.stage,
                      reason: ackBanner.outcome.reason,
                      updatedAt: formatDateTime(ackBanner.outcome.updatedAt),
                    })
                  : td("tenantLifecycle.ackBody", {
                      code: ackBanner.outcome.tenant.code,
                      id: ackBanner.outcome.tenant.id,
                      status: ackBanner.outcome.tenant.status,
                      stage: ackBanner.outcome.tenant.rollout.stage,
                      updatedAt: formatDateTime(ackBanner.outcome.updatedAt),
                    })
              }
            />
          </div>
        ) : null}

        <Card
          theme={theme}
          title={td("tenantLifecycle.settingsCardTitle")}
          subtitle={td("tenantLifecycle.settingsCardSubtitle")}
        >
          <form
            data-testid="tenant-settings-form"
            noValidate
            onSubmit={(event) => void handleSaveSettings(event)}
          >
            <fieldset
              disabled={!canWriteLifecycle || settingsSubmitting}
              style={{ border: "none", margin: 0, padding: 0 }}
            >
              <TenantIdentityFields
                form={settingsForm}
                setForm={setSettingsForm}
                t={t}
                hideCode
                hideStatus
              />
              <QuotaFields
                form={settingsForm}
                setForm={setSettingsForm}
                t={t}
              />
              <ModuleFields
                form={settingsForm}
                onToggle={handleToggleModule}
                moduleLabels={moduleLabels}
                t={t}
              />
            </fieldset>
            <div style={confirmRowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="confirm-settings-checkbox"
                  checked={confirmSettings}
                  disabled={!canWriteLifecycle || settingsSubmitting}
                  onChange={(event) => setConfirmSettings(event.target.checked)}
                />
                <span>
                  {td("tenantLifecycle.settingsConfirmLabel", {
                    code: tenant.code,
                  })}
                </span>
              </label>
              <div style={actionRowStyle}>
                <Btn
                  theme={theme}
                  variant="secondary"
                  size="sm"
                  disabled={!canWriteLifecycle || settingsSubmitting}
                  onClick={() =>
                    setSettingsForm(toTenantSettingsFormState(tenant))
                  }
                >
                  {td("tenantLifecycle.resetForm")}
                </Btn>
                <button
                  type="submit"
                  data-testid="save-tenant-settings-btn"
                  disabled={
                    !canWriteLifecycle ||
                    settingsSubmitting ||
                    !(availableActions?.update_settings.enabled ?? true)
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `1px solid ${theme.accent}`,
                    background: theme.accent,
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor:
                      !canWriteLifecycle || settingsSubmitting
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !canWriteLifecycle || settingsSubmitting ? 0.6 : 1,
                  }}
                >
                  {settingsSubmitting
                    ? td("tenantLifecycle.savingSettings")
                    : td("tenantLifecycle.saveSettings")}
                </button>
              </div>
            </div>
          </form>
        </Card>

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
                  ? td("tenantLifecycle.rollbackPreparedTrueBody")
                  : td("tenantLifecycle.rollbackPreparedFalseBody")
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
              body={td("tenantLifecycle.roleAckSummaryBody", {
                acknowledged: acknowledgedRoles ?? 0,
                total: totalRoles,
              })}
            />
            <Banner
              theme={theme}
              tone={rolloutGate === "blocked" ? "danger" : "info"}
              icon={rolloutGate === "blocked" ? "warn" : "clock"}
              title={`current gate = ${rolloutGate}`}
              body={
                tenant.rollout.notes?.trim()
                  ? tenant.rollout.notes
                  : td("tenantLifecycle.noCutoverNote")
              }
            />
          </div>

          <form
            data-testid="tenant-rollout-stage-form"
            noValidate
            onSubmit={(event) => void handleApplyRolloutStageForm(event)}
            style={{ marginTop: 16 }}
          >
            <h4 style={formSectionTitleStyle}>
              {td("tenantLifecycle.rolloutStageControlTitle")}
            </h4>
            <div style={formGridStyle}>
              <label>
                <div style={formLabelStyle}>
                  {td("tenantLifecycle.rolloutStageSelectLabel")}
                </div>
                <select
                  data-testid="rollout-stage-select"
                  value={rolloutStageDraft}
                  disabled={!canWriteLifecycle || rolloutStageSubmitting}
                  onChange={(event) =>
                    setRolloutStageDraft(
                      event.target.value as PlatformTenantRolloutStage,
                    )
                  }
                  style={formInputStyle}
                >
                  {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div style={formLabelStyle}>
                  {td("tenantLifecycle.rolloutStageNotesLabel")}
                </div>
                <input
                  data-testid="rollout-stage-notes-input"
                  value={rolloutStageNotes}
                  disabled={!canWriteLifecycle || rolloutStageSubmitting}
                  onChange={(event) => setRolloutStageNotes(event.target.value)}
                  placeholder={td(
                    "tenantLifecycle.rolloutStageNotesPlaceholder",
                  )}
                  style={formInputStyle}
                />
              </label>
            </div>
            <div style={confirmRowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="confirm-rollout-checkbox"
                  checked={confirmRolloutStage}
                  disabled={!canWriteLifecycle || rolloutStageSubmitting}
                  onChange={(event) =>
                    setConfirmRolloutStage(event.target.checked)
                  }
                />
                <span>
                  {td("tenantLifecycle.rolloutConfirmLabel", {
                    code: tenant.code,
                    stage: rolloutStageDraft,
                  })}
                </span>
              </label>
              <div style={actionRowStyle}>
                {PLATFORM_TENANT_ROLLOUT_STAGES.map((stageOption) => (
                  <button
                    key={stageOption}
                    type="button"
                    data-testid={`promote-stage-${stageOption}-btn`}
                    disabled={!canWriteLifecycle || rolloutStageSubmitting}
                    onClick={() => {
                      setRolloutStageDraft(stageOption);
                      void executeRolloutStageTransition(
                        stageOption,
                        rolloutStageNotes,
                      );
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                      color: theme.text,
                      fontSize: 11.5,
                      fontWeight: 500,
                      cursor:
                        !canWriteLifecycle || rolloutStageSubmitting
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        !canWriteLifecycle || rolloutStageSubmitting ? 0.55 : 1,
                    }}
                  >
                    {stageOption}
                  </button>
                ))}
                <button
                  type="submit"
                  data-testid="apply-rollout-stage-btn"
                  disabled={!canWriteLifecycle || rolloutStageSubmitting}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `1px solid ${theme.accent}`,
                    background: theme.accent,
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor:
                      !canWriteLifecycle || rolloutStageSubmitting
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !canWriteLifecycle || rolloutStageSubmitting ? 0.6 : 1,
                  }}
                >
                  {rolloutStageSubmitting
                    ? td("tenantLifecycle.applyingRolloutStage")
                    : td("tenantLifecycle.applyRolloutStage")}
                </button>
              </div>
            </div>
          </form>
        </Card>

        <div style={detailGridStyle}>
          <Card
            theme={theme}
            title={td("tenantLifecycle.onboardingCardTitle")}
            subtitle={td("tenantLifecycle.onboardingCardSubtitle")}
          >
            <DL theme={theme} cols={2} items={onboardingItems} />

            <form
              data-testid="tenant-onboarding-form"
              noValidate
              onSubmit={(event) => void handleSaveOnboarding(event)}
              style={{ marginTop: 16 }}
            >
              <fieldset
                disabled={!canWriteLifecycle || onboardingSubmitting}
                style={{ border: "none", margin: 0, padding: 0 }}
              >
                <div style={formGridStyle}>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.invoiceTitle")}
                    </div>
                    <input
                      data-testid="onboarding-invoice-title-input"
                      value={onboardingForm.invoiceTitle}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          invoiceTitle: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.billingContactName")}
                    </div>
                    <input
                      data-testid="onboarding-contact-name-input"
                      value={onboardingForm.billingContactName}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          billingContactName: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.billingContactEmail")}
                    </div>
                    <input
                      data-testid="onboarding-contact-email-input"
                      value={onboardingForm.billingContactEmail}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          billingContactEmail: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.integrationMode")}
                    </div>
                    <select
                      data-testid="onboarding-integration-mode-select"
                      value={onboardingForm.integrationMode}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          integrationMode: event.target
                            .value as PlatformTenantIntegrationMode,
                        }))
                      }
                      style={formInputStyle}
                    >
                      {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.sandboxBaseUrl")}
                    </div>
                    <input
                      data-testid="onboarding-sandbox-url-input"
                      value={onboardingForm.sandboxBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          sandboxBaseUrl: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.productionBaseUrl")}
                    </div>
                    <input
                      data-testid="onboarding-production-url-input"
                      value={onboardingForm.productionBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          productionBaseUrl: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.apiKeyScopes")}
                    </div>
                    <input
                      data-testid="onboarding-api-scopes-input"
                      value={onboardingForm.apiKeyScopes}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          apiKeyScopes: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.webhookEvents")}
                    </div>
                    <input
                      data-testid="onboarding-webhook-events-input"
                      value={onboardingForm.webhookEvents}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          webhookEvents: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.cutoverOwner")}
                    </div>
                    <input
                      data-testid="onboarding-cutover-owner-input"
                      value={onboardingForm.cutoverOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          cutoverOwner: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.rollbackOwner")}
                    </div>
                    <input
                      data-testid="onboarding-rollback-owner-input"
                      value={onboardingForm.rollbackOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          rollbackOwner: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.sandboxGateStatus")}
                    </div>
                    <select
                      data-testid="onboarding-sandbox-gate-select"
                      value={onboardingForm.sandboxStatus}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          sandboxStatus: event.target
                            .value as PlatformTenantGateStatus,
                        }))
                      }
                      style={formInputStyle}
                    >
                      {PLATFORM_TENANT_GATE_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.pilotGateStatus")}
                    </div>
                    <select
                      data-testid="onboarding-pilot-gate-select"
                      value={onboardingForm.pilotStatus}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          pilotStatus: event.target
                            .value as PlatformTenantGateStatus,
                        }))
                      }
                      style={formInputStyle}
                    >
                      {PLATFORM_TENANT_GATE_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.productionGateStatus")}
                    </div>
                    <select
                      data-testid="onboarding-production-gate-select"
                      value={onboardingForm.productionStatus}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          productionStatus: event.target
                            .value as PlatformTenantGateStatus,
                        }))
                      }
                      style={formInputStyle}
                    >
                      {PLATFORM_TENANT_GATE_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div style={formLabelStyle}>
                      {td("tenantLifecycle.rolloutNotes")}
                    </div>
                    <input
                      data-testid="onboarding-notes-input"
                      value={onboardingForm.notes}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      style={formInputStyle}
                    />
                  </label>
                </div>

                <label
                  style={{
                    ...checkboxLabelStyle,
                    marginTop: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="onboarding-rollback-prepared-checkbox"
                    checked={onboardingForm.rollbackPrepared}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        rollbackPrepared: event.target.checked,
                      }))
                    }
                  />
                  <span>{td("tenantLifecycle.rollbackPreparedLabel")}</span>
                </label>
              </fieldset>

              <div style={confirmRowStyle}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    data-testid="confirm-onboarding-checkbox"
                    checked={confirmOnboarding}
                    disabled={!canWriteLifecycle || onboardingSubmitting}
                    onChange={(event) =>
                      setConfirmOnboarding(event.target.checked)
                    }
                  />
                  <span>
                    {td("tenantLifecycle.onboardingConfirmLabel", {
                      code: tenant.code,
                    })}
                  </span>
                </label>
                <div style={actionRowStyle}>
                  <Btn
                    theme={theme}
                    variant="secondary"
                    size="sm"
                    disabled={!canWriteLifecycle || onboardingSubmitting}
                    onClick={() =>
                      setOnboardingForm(toTenantOnboardingDraftState(tenant))
                    }
                  >
                    {td("tenantLifecycle.resetForm")}
                  </Btn>
                  <button
                    type="submit"
                    data-testid="save-tenant-onboarding-btn"
                    disabled={!canWriteLifecycle || onboardingSubmitting}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${theme.accent}`,
                      background: theme.accent,
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: 12.5,
                      cursor:
                        !canWriteLifecycle || onboardingSubmitting
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        !canWriteLifecycle || onboardingSubmitting ? 0.6 : 1,
                    }}
                  >
                    {onboardingSubmitting
                      ? td("tenantLifecycle.savingOnboarding")
                      : td("tenantLifecycle.saveOnboarding")}
                  </button>
                </div>
              </div>
            </form>
          </Card>

          <div style={stackStyle}>
            <Card
              theme={theme}
              title={td("tenantLifecycle.rolesCardTitle", {
                acknowledged: acknowledgedRoles ?? 0,
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

            <Card theme={theme} title={t("tenantDetail.tenantBaseline")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "STATUS",
                    v: tenant.status,
                    mono: true,
                  },
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
              body={`${formatDateTime(tenant.createdAt)} · ${tenant.id}`}
            />
            <Banner
              theme={theme}
              tone={tenant.status === "rollback_hold" ? "danger" : "success"}
              icon={tenant.status === "rollback_hold" ? "warn" : "ok"}
              title={
                tenant.status === "rollback_hold"
                  ? td("tenantLifecycle.activeRollbackHoldTitle")
                  : td("tenantLifecycle.noActiveRollbackHoldTitle")
              }
              body={
                tenant.rollout.lastPromotedAt
                  ? td("tenantLifecycle.lastPromotionBody", {
                      at: formatDateTime(tenant.rollout.lastPromotedAt),
                    })
                  : td("tenantLifecycle.noPromotionHistory")
              }
            />
          </div>
        </Card>
      </div>

      {showSuspendModal ? (
        <div
          style={modalBackdropStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspend-tenant-title"
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
                  id="suspend-tenant-title"
                  style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}
                >
                  {td("tenantLifecycle.suspendModalTitle")}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11.5,
                    marginTop: 2,
                  }}
                >
                  {td("tenantLifecycle.suspendModalSubtitle")}
                </div>
              </div>
              <Btn
                theme={theme}
                variant="ghost"
                icon="x"
                onClick={() => {
                  if (!suspendSubmitting) {
                    setShowSuspendModal(false);
                  }
                }}
              >
                {td("tenantLifecycle.closeModal")}
              </Btn>
            </div>
            <div style={modalBodyStyle}>
              <Banner
                theme={theme}
                tone="danger"
                icon="warn"
                title={td("tenantLifecycle.suspendModalBannerTitle", {
                  name: tenant.name,
                })}
                body={td("tenantLifecycle.suspendModalBannerBody")}
              />
              <Field
                theme={theme}
                label={td("tenantLifecycle.suspendReasonLabel")}
                required
              >
                <textarea
                  data-testid="suspend-reason-input"
                  value={suspendReason}
                  onChange={(event) => setSuspendReason(event.target.value)}
                  placeholder={td("tenantLifecycle.suspendReasonPlaceholder")}
                  style={textareaStyle}
                />
              </Field>
              <div style={actionRowStyle}>
                <Btn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowSuspendModal(false)}
                  disabled={suspendSubmitting}
                >
                  {td("tenantLifecycle.cancelModal")}
                </Btn>
                <button
                  type="button"
                  data-testid="confirm-suspend-btn"
                  disabled={
                    suspendSubmitting || suspendReason.trim().length === 0
                  }
                  onClick={() => void handleConfirmSuspend()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: `1px solid ${theme.danger}`,
                    background: theme.danger,
                    color: "#ffffff",
                    fontWeight: 500,
                    fontSize: 12,
                    cursor:
                      suspendSubmitting || suspendReason.trim().length === 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      suspendSubmitting || suspendReason.trim().length === 0
                        ? 0.55
                        : 1,
                  }}
                >
                  {suspendSubmitting
                    ? td("tenantLifecycle.submitting")
                    : td("tenantLifecycle.confirmSuspend")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                {td("tenantLifecycle.closeModal")}
              </Btn>
            </div>
            <div style={modalBodyStyle}>
              <Banner
                theme={theme}
                tone="danger"
                icon="warn"
                title={td("tenantLifecycle.rollbackModalBannerTitle", {
                  name: tenant.name,
                })}
                body={td("tenantLifecycle.rollbackModalBannerBody")}
              />
              <Field
                theme={theme}
                label={td("tenantLifecycle.rollbackReasonLabel")}
                required
              >
                <textarea
                  data-testid="rollback-reason-input"
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
                  {td("tenantLifecycle.cancelModal")}
                </Btn>
                <button
                  type="button"
                  data-testid="confirm-rollback-btn"
                  disabled={
                    rollbackSubmitting || rollbackReason.trim().length === 0
                  }
                  onClick={() => void handleConfirmRollbackHold()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: `1px solid ${theme.danger}`,
                    background: theme.danger,
                    color: "#ffffff",
                    fontWeight: 500,
                    fontSize: 12,
                    cursor:
                      rollbackSubmitting || rollbackReason.trim().length === 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      rollbackSubmitting || rollbackReason.trim().length === 0
                        ? 0.55
                        : 1,
                  }}
                >
                  {rollbackSubmitting
                    ? td("tenantLifecycle.submitting")
                    : td("tenantLifecycle.confirmRollbackHold")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
