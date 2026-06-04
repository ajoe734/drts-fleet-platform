"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  partnerStatusTone,
  toPartnerFormState,
  toPartnerUpdateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ELIGIBILITY_MODES,
  type BusinessDispatchSubtype,
  type PartnerChannelEntryRecord,
  type PartnerEntryAuthMode,
  type PartnerEligibilityMode,
  type PartnerIngressCredentialIssued,
  type PartnerIngressCredentialRecord,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type TabKey =
  | "overview"
  | "branding"
  | "auth"
  | "eligibility"
  | "credentials"
  | "audit";

type CredentialRow = Record<string, unknown> & {
  keyId: string;
  kind: string;
  masked: string;
  rotatedAt: string;
  lastUsedAt: string;
  status: string;
};

type AuditRow = Record<string, unknown> & {
  event: string;
  actor: string;
  detail: string;
  at: string;
};

type EntryActionMode = "activate" | "deactivate" | "revoke";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageShellStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const loadingStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 240,
  color: theme.textMuted,
  fontSize: 13,
} satisfies CSSProperties;

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies CSSProperties;

const heroGridCompactStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 16,
} satisfies CSSProperties;

const sideStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const fieldGridCompactStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 12,
} satisfies CSSProperties;

const mutedTextStyle = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: theme.textMuted,
} satisfies CSSProperties;

const controlStyle = ({
  mono = false,
  disabled = false,
}: {
  mono?: boolean;
  disabled?: boolean;
} = {}) =>
  ({
    width: "100%",
    minHeight: 32,
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: disabled ? theme.surfaceLo : theme.bgRaised,
    color: disabled ? theme.textDim : theme.text,
    fontSize: 12.5,
    lineHeight: 1.45,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    outline: "none",
    opacity: disabled ? 0.72 : 1,
    resize: "vertical",
  }) satisfies CSSProperties;

const inlinePillRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const readinessRowStyle = (ready: boolean) =>
  ({
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 0",
    borderBottom: `1px solid ${theme.border}`,
    color: ready ? theme.text : theme.textMuted,
  }) satisfies CSSProperties;

const saveBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
} satisfies CSSProperties;

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(12, 18, 28, 0.56)",
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  boxShadow: "0 18px 48px rgba(8, 15, 30, 0.28)",
} satisfies CSSProperties;

const modalHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 20px 14px",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const modalBodyStyle = {
  display: "grid",
  gap: 14,
  padding: 20,
} satisfies CSSProperties;

const modalFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "0 20px 20px",
} satisfies CSSProperties;

const secretRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  overflowX: "auto",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.warnBorder}`,
  background: theme.warnBg,
  color: theme.text,
} satisfies CSSProperties;

const secretTextStyle = {
  flex: 1,
  minWidth: 0,
  userSelect: "all",
  whiteSpace: "nowrap",
  fontFamily: theme.monoFamily,
  fontSize: 12,
} satisfies CSSProperties;

const iconBadgeStyle = (accent: string) =>
  ({
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: accent || theme.accent,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  }) satisfies CSSProperties;

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 8,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const actionClusterStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const linkCardStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const linkRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const monoValueStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textMuted,
} satisfies CSSProperties;

const LOCAL_PARTNER_ENTRY: PartnerChannelEntryRecord = {
  partnerId: "partner_ctbc_world_elite",
  partnerCode: "ctbc",
  partnerType: "bank_partner",
  programId: "World Elite",
  programCode: "world_elite",
  tenantId: "tnt_003",
  bankCode: "CTBC_BIZ",
  entrySlug: "ctbc-elite",
  displayName: "CTBC World Elite",
  businessDispatchSubtype: "credit_card_airport_transfer",
  authMode: "partner_api_key",
  eligibilityMode: "bank_card_inline",
  entryHost: "ctbc.drts.io",
  entryPath: "/partner/ctbc-elite",
  themeAccent: "#0B7285",
  brandingMetadata: {
    displayName: "CTBC World Elite",
    themeAccent: "#0B7285",
    supportEmail: "biz-card@ctbcbank.com",
    supportPhone: "+886-2-1234-5678",
  },
  eligibilityContract: {
    contractId: "elig_ctbc_we_2026q2",
    adapterCode: "card_bin",
    adapterKind: "issuer_card_lookup",
    adapterVersion: "2026.05",
    eligibilityMode: "bank_card_inline",
    decisionTtlSeconds: 300,
    retryPolicy: {
      timeoutMs: 1500,
      maxAttempts: 2,
      initialBackoffMs: 250,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
      retryableErrorCodes: ["timeout", "upstream_5xx"],
    },
    manualFallbackPolicy: {
      queue: "ops_console",
      requiredOnTimeout: true,
      requiredOnRetryExhausted: true,
      requiredOnAmbiguousResponse: true,
      requiredAuditFields: ["reasonCode", "requestedBy", "notes"],
    },
    sensitiveDataPolicy: {
      referenceTokenStorage: "hash_only",
      rawTokenExposure: "never",
      benefitReferencePolicy: "canonical_internal_masked_exports",
      issuerAuthorizationReferencePolicy: "canonical_internal_masked_exports",
      auditExposure: "status_reason_only",
    },
    notes: ["World Elite card BIN list synced with issuer on 2026-05-20."],
  },
  status: "active",
  activeFlag: true,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  createdAt: "2026-04-12T03:20:00.000Z",
  updatedAt: "2026-06-01T09:15:00.000Z",
  auditMetadata: {
    source: "platform-admin.preview",
    requestId: "req_preview_ctbc_elite",
    createdBy: "platform-admin",
    updatedBy: "platform-admin",
  },
};

const LOCAL_PARTNER_CREDENTIALS: PartnerIngressCredentialRecord[] = [
  {
    keyId: "cred_ctbc_oauth",
    entrySlug: "ctbc-elite",
    keyPrefix: "drts_partner_live_",
    maskedSuffix: "aE32",
    source: "platform_admin",
    createdAt: "2026-04-12T03:22:00.000Z",
    lastUsedAt: "2026-06-02T18:45:00.000Z",
    revokedAt: null,
    issuedBy: "platform-admin",
    revokedBy: null,
    rotationReason: "initial production launch",
    revokeReason: null,
  },
  {
    keyId: "cred_ctbc_webhook",
    entrySlug: "ctbc-elite",
    keyPrefix: "drts_partner_live_",
    maskedSuffix: "8B2k",
    source: "platform_admin",
    createdAt: "2026-04-12T03:23:00.000Z",
    lastUsedAt: "2026-06-02T18:43:00.000Z",
    revokedAt: null,
    issuedBy: "platform-admin",
    revokedBy: null,
    rotationReason: "webhook bootstrap",
    revokeReason: null,
  },
  {
    keyId: "cred_ctbc_ingress",
    entrySlug: "ctbc-elite",
    keyPrefix: "drts_partner_live_",
    maskedSuffix: "K1yQ",
    source: "platform_admin",
    createdAt: "2026-03-01T02:10:00.000Z",
    lastUsedAt: "2026-06-02T18:41:00.000Z",
    revokedAt: null,
    issuedBy: "platform-admin",
    revokedBy: null,
    rotationReason: "quarterly refresh",
    revokeReason: null,
  },
];

function cloneLocalPartnerEntry() {
  return structuredClone(LOCAL_PARTNER_ENTRY);
}

function cloneLocalPartnerCredentials() {
  return structuredClone(LOCAL_PARTNER_CREDENTIALS);
}

function buildLocalIssuedCredential(
  entrySlug: string,
  reason: string,
  previousCredentialId?: string | null,
): PartnerIngressCredentialIssued {
  const createdAt = new Date().toISOString();
  const nonce = Math.random().toString(36).slice(2, 10);
  const plaintextKey = `drts_partner_live_${nonce}_preview_secret`;
  return {
    credential: {
      keyId: `cred_preview_${nonce}`,
      entrySlug,
      keyPrefix: "drts_partner_live_",
      maskedSuffix: plaintextKey.slice(-4),
      source: "platform_admin",
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
      issuedBy: "platform-admin.preview",
      revokedBy: null,
      rotationReason: reason.trim() || "preview issue",
      revokeReason: null,
    },
    plaintextKey,
    revokedCredentialId: previousCredentialId ?? null,
  };
}

function applyFormToEntry(
  entry: PartnerChannelEntryRecord,
  form: EntryFormState,
): PartnerChannelEntryRecord {
  return {
    ...entry,
    tenantId: form.tenantId,
    partnerCode: form.partnerCode,
    partnerType: form.partnerType,
    programId: form.programId,
    programCode: form.programCode || null,
    bankCode: form.bankCode || null,
    displayName: form.displayName,
    businessDispatchSubtype: form.businessDispatchSubtype,
    authMode: form.authMode,
    eligibilityMode: form.eligibilityMode,
    entryHost: form.entryHost || null,
    entryPath: form.entryPath || null,
    themeAccent: form.themeAccent || null,
    brandingMetadata: {
      displayName: form.displayName,
      themeAccent: form.themeAccent || null,
      supportEmail: form.supportEmail || null,
      supportPhone: form.supportPhone || null,
    },
    updatedAt: new Date().toISOString(),
    auditMetadata: {
      ...entry.auditMetadata,
      updatedBy: "platform-admin.preview",
    },
  };
}

function toCanvasTone(
  tone: ReturnType<typeof partnerStatusTone>,
): "neutral" | "success" | "warn" | "danger" {
  if (tone === "warning") {
    return "warn";
  }
  return tone;
}

function initialsForEntry(entry: PartnerChannelEntryRecord) {
  return (
    entry.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || entry.partnerCode.slice(0, 2).toUpperCase()
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  mono = false,
  required = false,
  disabled = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={hint} required={required}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={controlStyle({ mono, disabled })}
      />
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  required = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={hint} required={required}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        style={controlStyle()}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  formatOption,
  hint,
}: {
  label: React.ReactNode;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  formatOption: (value: string) => string;
  hint?: React.ReactNode;
}) {
  return (
    <Field theme={theme} label={label} hint={hint}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={controlStyle()}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ModalFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={modalOverlayStyle} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        style={modalCardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 17,
                fontWeight: 700,
                color: theme.text,
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: theme.textMuted,
                  fontFamily: theme.monoFamily,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <Btn theme={theme} variant="ghost" size="xs" onClick={onClose}>
            {t("common.close")}
          </Btn>
        </div>
        <div style={modalBodyStyle}>{children}</div>
        <div style={modalFooterStyle}>{footer}</div>
      </div>
    </div>
  );
}

function SecretRevealModal({
  entry,
  issuedCredential,
  acknowledged,
  onAcknowledgedChange,
  onClose,
  onCopy,
  onDownload,
}: {
  entry: PartnerChannelEntryRecord;
  issuedCredential: PartnerIngressCredentialIssued;
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const credential = issuedCredential.credential;

  return (
    <ModalFrame
      title={
        <>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: theme.warnBg,
              color: theme.warn,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CanvasIcon name="apiKeys" size={13} stroke={2} />
          </span>
          {t("partners.detail.secret.title")}
        </>
      }
      subtitle="PLAINTEXT-ONCE · Q-ADM07"
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {t("partners.detail.secret.cancel")}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={!acknowledged}
            onClick={onClose}
          >
            {t("partners.detail.secret.complete")}
          </Btn>
        </>
      }
    >
      <Banner
        theme={theme}
        tone="warn"
        title={t("partners.detail.secret.warningTitle")}
        body={t("partners.detail.secret.warningBody")}
      />

      <Field theme={theme} label={t("partners.detail.secret.name")}>
        <div style={controlStyle({ mono: true, disabled: true })}>
          {entry.displayName}
        </div>
      </Field>

      <Field
        theme={theme}
        label={t("partners.detail.secret.field")}
        hint={t("partners.detail.secret.hint")}
      >
        <div style={secretRowStyle}>
          <span style={secretTextStyle}>{issuedCredential.plaintextKey}</span>
          <Btn theme={theme} size="xs" variant="secondary" onClick={onCopy}>
            {t("partners.detail.secret.copy")}
          </Btn>
          <Btn theme={theme} size="xs" variant="secondary" onClick={onDownload}>
            {t("partners.detail.secret.download")}
          </Btn>
        </div>
      </Field>

      <DL
        theme={theme}
        cols={2}
        items={[
          {
            k: t("partners.detail.secret.scope"),
            v: credential.source,
            mono: true,
          },
          {
            k: t("partners.detail.secret.expiresAt"),
            v: "—",
            mono: true,
          },
          {
            k: t("partners.detail.secret.createdBy"),
            v: credential.issuedBy ?? "platform-admin",
          },
          {
            k: t("partners.detail.secret.createdAt"),
            v: formatDateTime(credential.createdAt),
            mono: true,
          },
        ]}
      />

      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
        />
        <span style={{ fontSize: 12.5, color: theme.text }}>
          {t("partners.detail.secret.stored")}
        </span>
      </label>
    </ModalFrame>
  );
}

function CredentialActionModal({
  mode,
  reason,
  busy,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  mode: "issue" | "rotate";
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const isRotate = mode === "rotate";

  return (
    <ModalFrame
      title={
        isRotate
          ? t("partners.detail.credentialAction.rotateTitle")
          : t("partners.detail.credentialAction.issueTitle")
      }
      subtitle={t("partners.detail.credentialAction.subtitle")}
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {t("partners.detail.credentialAction.cancel")}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={onConfirm}
          >
            {busy
              ? isRotate
                ? t("partners.detail.credentialAction.rotateConfirm")
                : t("partners.detail.credentialAction.issueConfirm")
              : isRotate
                ? t("partners.detail.credentialAction.rotateConfirm")
                : t("partners.detail.credentialAction.issueConfirm")}
          </Btn>
        </>
      }
    >
      <Banner
        theme={theme}
        tone="warn"
        title={
          isRotate
            ? t("partners.detail.credentialAction.rotateTitle")
            : t("partners.detail.credentialAction.issueTitle")
        }
        body={t("partners.detail.credentialAction.hint")}
      />
      <TextAreaField
        label={t("partners.detail.credentialAction.fieldLabel")}
        value={reason}
        onChange={onReasonChange}
        required
        placeholder={
          isRotate
            ? t("partners.detail.credentialAction.placeholderRotate")
            : t("partners.detail.credentialAction.placeholderIssue")
        }
      />
    </ModalFrame>
  );
}

function GovernanceActionModal({
  mode,
  reason,
  busy,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  mode: EntryActionMode | "revoke_credential";
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const requiresReason = mode === "revoke" || mode === "revoke_credential";
  const title =
    mode === "activate"
      ? t("partners.detail.governance.activateTitle")
      : mode === "deactivate"
        ? t("partners.detail.governance.deactivateTitle")
        : mode === "revoke"
          ? t("partners.detail.governance.revokeTitle")
          : t("partners.detail.governance.revokeCredentialTitle");
  const body =
    mode === "activate"
      ? t("partners.detail.governance.activateBody")
      : mode === "deactivate"
        ? t("partners.detail.governance.deactivateBody")
        : mode === "revoke"
          ? t("partners.detail.governance.revokeBody")
          : t("partners.detail.governance.revokeCredentialBody");
  const confirmLabel =
    mode === "activate"
      ? t("partners.detail.governance.activateConfirm")
      : mode === "deactivate"
        ? t("partners.detail.governance.deactivateConfirm")
        : mode === "revoke"
          ? t("partners.detail.governance.revokeConfirm")
          : t("partners.detail.governance.revokeCredentialConfirm");

  return (
    <ModalFrame
      title={title}
      subtitle={
        requiresReason
          ? t("partners.detail.governance.highSubtitle")
          : t("partners.detail.governance.mediumSubtitle")
      }
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {t("partners.detail.governance.cancel")}
          </Btn>
          <Btn
            theme={theme}
            variant={requiresReason ? "secondary" : "primary"}
            danger={requiresReason}
            disabled={busy || (requiresReason && !reason.trim())}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <Banner
        theme={theme}
        tone={requiresReason ? "danger" : "warn"}
        title={title}
        body={body}
      />
      {requiresReason ? (
        <TextAreaField
          label={t("partners.detail.governance.fieldLabel")}
          hint={t("partners.detail.governance.fieldHint")}
          value={reason}
          onChange={onReasonChange}
          required
          placeholder={t("partners.detail.governance.fieldPlaceholder")}
        />
      ) : null}
    </ModalFrame>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ entrySlug: string }>();
  const entrySlug = Array.isArray(params?.entrySlug)
    ? params.entrySlug[0]
    : (params?.entrySlug ?? "");
  const client = usePlatformAdminClient();
  const { t, locale } = useTranslation();

  const [entry, setEntry] = useState<PartnerChannelEntryRecord | null>(null);
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const [credentials, setCredentials] = useState<
    PartnerIngressCredentialRecord[]
  >([]);
  const [issuedCredential, setIssuedCredential] =
    useState<PartnerIngressCredentialIssued | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuingCredential, setIssuingCredential] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [credentialActionMode, setCredentialActionMode] = useState<
    "issue" | "rotate" | null
  >(null);
  const [credentialActionReason, setCredentialActionReason] = useState("");
  const [entryActionMode, setEntryActionMode] =
    useState<EntryActionMode | null>(null);
  const [credentialToRevoke, setCredentialToRevoke] =
    useState<CredentialRow | null>(null);
  const [governanceReason, setGovernanceReason] = useState("");
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1080px)");
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const loadEntry = useCallback(
    async (options?: { preserveIssuedCredential?: boolean }) => {
      if (!entrySlug) {
        setEntry(null);
        setEditForm(EMPTY_ENTRY_FORM);
        setCredentials([]);
        setIsPreviewMode(false);
        setPreviewNotice(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const entries = await client.listPlatformPartnerEntries();
        const selected =
          entries.find((candidate) => candidate.entrySlug === entrySlug) ??
          null;

        setEntry(selected);
        setEditForm(selected ? toPartnerFormState(selected) : EMPTY_ENTRY_FORM);
        setIsPreviewMode(false);
        setPreviewNotice(null);

        if (!options?.preserveIssuedCredential) {
          setIssuedCredential(null);
          setSecretAcknowledged(false);
        }

        if (!selected) {
          setCredentials([]);
          return;
        }

        const nextCredentials =
          await client.listPlatformPartnerIngressCredentials(
            selected.entrySlug,
          );
        setCredentials(nextCredentials ?? []);
      } catch (nextError: unknown) {
        if (entrySlug === LOCAL_PARTNER_ENTRY.entrySlug) {
          const fallbackEntry = cloneLocalPartnerEntry();
          setEntry(fallbackEntry);
          setEditForm(toPartnerFormState(fallbackEntry));
          setCredentials(cloneLocalPartnerCredentials());
          setIsPreviewMode(true);
          setPreviewNotice(t("partners.detail.previewNotice"));
          setError(null);
        } else {
          setError(
            nextError instanceof Error ? nextError.message : String(nextError),
          );
          setEntry(null);
          setEditForm(EMPTY_ENTRY_FORM);
          setCredentials([]);
          setIsPreviewMode(false);
          setPreviewNotice(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [client, entrySlug, t],
  );

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const saveEntry = useCallback(async () => {
    if (!entry) {
      return;
    }

    if (isPreviewMode) {
      const nextEntry = applyFormToEntry(entry, editForm);
      setEntry(nextEntry);
      setEditForm(toPartnerFormState(nextEntry));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await client.updatePlatformPartnerEntry(
        entry.entrySlug,
        toPartnerUpdateCommand(editForm),
      );
      await loadEntry({ preserveIssuedCredential: true });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setSaving(false);
    }
  }, [client, editForm, entry, isPreviewMode, loadEntry]);

  const issueCredential = useCallback(async () => {
    if (!entry || !credentialActionMode) {
      return;
    }

    if (isPreviewMode) {
      const previousActiveCredential = credentials.find(
        (credential) => !credential.revokedAt,
      );
      const issued = buildLocalIssuedCredential(
        entry.entrySlug,
        credentialActionReason,
        credentialActionMode === "rotate"
          ? (previousActiveCredential?.keyId ?? null)
          : null,
      );
      const nextCredentials = credentials.map((credential) =>
        credentialActionMode === "rotate" &&
        previousActiveCredential &&
        credential.keyId === previousActiveCredential.keyId
          ? {
              ...credential,
              revokedAt: issued.credential.createdAt,
              revokedBy: "platform-admin.preview",
              revokeReason: credentialActionReason.trim() || "preview rotate",
            }
          : credential,
      );
      setCredentials([issued.credential, ...nextCredentials]);
      setIssuedCredential(issued);
      setSecretAcknowledged(false);
      setCredentialActionMode(null);
      setCredentialActionReason("");
      setActiveTab("credentials");
      return;
    }

    setIssuingCredential(true);
    setError(null);

    try {
      const issued = await client.issuePlatformPartnerIngressCredential(
        entry.entrySlug,
        {
          rotationReason: credentialActionReason.trim(),
        },
      );

      setIssuedCredential(issued);
      setSecretAcknowledged(false);
      setCredentialActionMode(null);
      setCredentialActionReason("");
      setActiveTab("credentials");
      await loadEntry({ preserveIssuedCredential: true });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setIssuingCredential(false);
    }
  }, [
    client,
    credentialActionMode,
    credentialActionReason,
    credentials,
    entry,
    isPreviewMode,
    loadEntry,
  ]);

  const runGovernanceAction = useCallback(async () => {
    if (!entry) {
      return;
    }

    if (isPreviewMode) {
      const now = new Date().toISOString();
      if (entryActionMode === "activate") {
        setEntry((current) =>
          current
            ? {
                ...current,
                activeFlag: true,
                status: "active",
                revokedAt: null,
                revokedBy: null,
                revokeReason: null,
                updatedAt: now,
              }
            : current,
        );
      } else if (entryActionMode === "deactivate") {
        setEntry((current) =>
          current
            ? {
                ...current,
                activeFlag: false,
                status: "inactive",
                updatedAt: now,
              }
            : current,
        );
      } else if (entryActionMode === "revoke") {
        setEntry((current) =>
          current
            ? {
                ...current,
                activeFlag: false,
                status: "revoked",
                revokedAt: now,
                revokedBy: "platform-admin.preview",
                revokeReason: governanceReason.trim() || "preview revoke",
                updatedAt: now,
              }
            : current,
        );
      } else if (credentialToRevoke) {
        setCredentials((current) =>
          current.map((credential) =>
            credential.keyId === credentialToRevoke.keyId
              ? {
                  ...credential,
                  revokedAt: now,
                  revokedBy: "platform-admin.preview",
                  revokeReason:
                    governanceReason.trim() || "preview credential revoke",
                }
              : credential,
          ),
        );
      }

      setEntryActionMode(null);
      setCredentialToRevoke(null);
      setGovernanceReason("");
      return;
    }

    setGovernanceBusy(true);
    setError(null);

    try {
      if (entryActionMode === "activate") {
        await client.activatePlatformPartnerEntry(entry.entrySlug);
      } else if (entryActionMode === "deactivate") {
        await client.deactivatePlatformPartnerEntry(entry.entrySlug);
      } else if (entryActionMode === "revoke") {
        await client.revokePlatformPartnerEntry(entry.entrySlug);
      } else if (credentialToRevoke) {
        await client.revokePlatformPartnerIngressCredential(
          entry.entrySlug,
          credentialToRevoke.keyId,
          { revokeReason: governanceReason.trim() || null },
        );
      }

      setEntryActionMode(null);
      setCredentialToRevoke(null);
      setGovernanceReason("");
      await loadEntry({ preserveIssuedCredential: true });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setGovernanceBusy(false);
    }
  }, [
    client,
    credentialToRevoke,
    entry,
    entryActionMode,
    governanceReason,
    isPreviewMode,
    loadEntry,
  ]);

  const updateFormField = <Key extends keyof EntryFormState>(
    key: Key,
    value: EntryFormState[Key],
  ) => {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const activeCredentialCount = useMemo(
    () => credentials.filter((credential) => !credential.revokedAt).length,
    [credentials],
  );

  const readinessItems = useMemo(
    () =>
      entry
        ? buildPartnerReadinessItems(entry, t, {
            activeCredentialCount,
          })
        : [],
    [activeCredentialCount, entry, t],
  );

  const readinessReadyCount = readinessItems.filter(
    (item) => item.ready,
  ).length;
  const readinessComplete =
    readinessItems.length > 0 && readinessItems.every((item) => item.ready);

  const previewUrl =
    entry?.entryHost && entry?.entryPath
      ? `https://${entry.entryHost}${entry.entryPath}`
      : null;

  const tabDefs = useMemo(
    () =>
      (
        [
          ["overview", t("partners.detail.tabs.overview")],
          ["branding", t("partners.detail.tabs.branding")],
          ["auth", t("partners.detail.tabs.auth")],
          ["eligibility", t("partners.detail.tabs.eligibility")],
          ["credentials", t("partners.detail.tabs.credentials")],
          ["audit", t("partners.detail.tabs.audit")],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        node: (
          <button
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ),
      })),
    [t],
  );

  const activeTabNode =
    tabDefs.find((definition) => definition.key === activeTab)?.node ?? null;

  const overviewItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    const supportValue =
      [
        entry.brandingMetadata?.supportEmail,
        entry.brandingMetadata?.supportPhone,
      ]
        .filter(Boolean)
        .join(" · ") || "—";

    return [
      {
        k: t("partners.detail.overview.tenant"),
        v: `${entry.partnerType} · ${entry.tenantId}`,
        mono: true,
      },
      {
        k: t("partners.detail.overview.bankCode"),
        v: entry.bankCode ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.overview.program"),
        v: entry.programId,
      },
      {
        k: t("partners.detail.overview.dispatchSubtype"),
        v: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
        mono: true,
      },
      {
        k: t("partners.detail.overview.authMode"),
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: t("partners.detail.overview.eligibility"),
        v: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        mono: true,
      },
      {
        k: t("partners.detail.overview.entryHost"),
        v: entry.entryHost ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.overview.entryPath"),
        v: entry.entryPath ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.overview.themeAccent"),
        v: entry.themeAccent ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.overview.supportContact"),
        v: supportValue,
        mono: true,
      },
    ];
  }, [entry, locale, t]);

  const eligibilitySnapshotItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    const contract = entry.eligibilityContract;

    return [
      {
        k: t("partners.detail.eligibilitySnapshot.contractId"),
        v: contract?.contractId ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.eligibilitySnapshot.adapter"),
        v: contract
          ? `${contract.adapterCode} · ${contract.adapterVersion}`
          : "—",
        mono: true,
      },
      {
        k: t("partners.detail.eligibilitySnapshot.adapterPosture"),
        v: contract?.adapterKind ?? "—",
      },
      {
        k: t("partners.detail.eligibilitySnapshot.fallback"),
        v: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? t("partners.detail.eligibilitySnapshot.fallbackRequired")
          : t("partners.detail.eligibilitySnapshot.fallbackNone"),
      },
    ];
  }, [entry, t]);

  const auditItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: t("partners.detail.auditMeta.source"),
        v: entry.auditMetadata.source ?? "—",
      },
      {
        k: t("partners.detail.auditMeta.requestId"),
        v: entry.auditMetadata.requestId ?? "—",
        mono: true,
      },
      {
        k: t("partners.detail.auditMeta.createdBy"),
        v: entry.auditMetadata.createdBy ?? "—",
      },
      {
        k: t("partners.detail.auditMeta.createdAt"),
        v: formatDateTime(entry.createdAt),
        mono: true,
      },
      {
        k: t("partners.detail.auditMeta.updatedBy"),
        v: entry.auditMetadata.updatedBy ?? "—",
      },
      {
        k: t("partners.detail.auditMeta.updatedAt"),
        v: formatDateTime(entry.updatedAt),
        mono: true,
      },
      {
        k: t("partners.detail.auditMeta.revokedAt"),
        v: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        mono: true,
      },
      {
        k: t("partners.detail.auditMeta.revokeReason"),
        v: entry.revokeReason ?? "—",
      },
    ];
  }, [entry, t]);

  const credentialRows = useMemo<CredentialRow[]>(
    () =>
      [...credentials]
        .filter((credential) => !credential.revokedAt)
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )
        .map((credential) => ({
          keyId: credential.keyId,
          kind: credential.source,
          masked: `${credential.keyPrefix}${credential.maskedSuffix}`,
          rotatedAt: formatDateTime(credential.createdAt),
          lastUsedAt: credential.lastUsedAt
            ? formatDateTime(credential.lastUsedAt)
            : "—",
          status: credential.revokedAt ? "revoked" : "active",
        })),
    [credentials],
  );

  const credentialColumns = useMemo<CanvasTableColumn<CredentialRow>[]>(
    () => [
      {
        h: t("partners.detail.credentialsTable.kind"),
        k: "kind",
        mono: true,
        w: 160,
      },
      {
        h: t("partners.detail.credentialsTable.masked"),
        k: "masked",
        mono: true,
        w: 170,
      },
      {
        h: t("partners.detail.credentialsTable.rotated"),
        k: "rotatedAt",
        mono: true,
        w: 160,
      },
      {
        h: t("partners.detail.credentialsTable.lastUsed"),
        k: "lastUsedAt",
        mono: true,
        w: 160,
      },
      {
        h: t("partners.detail.credentialsTable.actions"),
        w: 120,
        r: (row) => (
          <Btn
            theme={theme}
            variant="secondary"
            danger
            size="xs"
            onClick={() => {
              setCredentialToRevoke(row);
              setGovernanceReason("");
            }}
          >
            {t("partners.detail.credentialsTable.revoke")}
          </Btn>
        ),
      },
    ],
    [t],
  );

  const auditRows = useMemo<AuditRow[]>(() => {
    if (!entry) {
      return [];
    }

    const rows: AuditRow[] = [
      {
        event: "entry.created",
        actor: entry.auditMetadata.createdBy ?? "system",
        detail: entry.auditMetadata.source ?? "platform-admin",
        at: formatDateTime(entry.createdAt),
      },
      {
        event: "entry.updated",
        actor: entry.auditMetadata.updatedBy ?? "system",
        detail: entry.auditMetadata.requestId ?? "—",
        at: formatDateTime(entry.updatedAt),
      },
    ];

    credentials.slice(0, 4).forEach((credential) => {
      rows.push({
        event: credential.revokedAt
          ? "credential.revoked"
          : "credential.issued",
        actor: credential.issuedBy ?? "platform-admin",
        detail: `${credential.source} · ${credential.keyPrefix}${credential.maskedSuffix}`,
        at: formatDateTime(credential.revokedAt ?? credential.createdAt),
      });
    });

    return rows;
  }, [credentials, entry, locale]);

  const auditColumns = useMemo<CanvasTableColumn<AuditRow>[]>(
    () => [
      {
        h: t("partners.detail.auditTable.event"),
        k: "event",
        mono: true,
        w: 170,
      },
      { h: t("partners.detail.auditTable.actor"), k: "actor", w: 180 },
      { h: t("partners.detail.auditTable.detail"), k: "detail", mono: true },
      { h: t("partners.detail.auditTable.at"), k: "at", mono: true, w: 170 },
    ],
    [t],
  );

  const handleCopySecret = useCallback(async () => {
    if (!issuedCredential || typeof navigator === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(issuedCredential.plaintextKey);
  }, [issuedCredential]);

  const handleDownloadSecret = useCallback(() => {
    if (!issuedCredential || typeof window === "undefined") {
      return;
    }

    const blob = new Blob([issuedCredential.plaintextKey], {
      type: "text/plain;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${entrySlug || "partner-entry"}-credential.txt`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }, [entrySlug, issuedCredential]);

  if (loading) {
    return <div style={loadingStateStyle}>{t("partners.loading")}</div>;
  }

  if (!entry) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
          theme={theme}
          title={t("partners.detail.notFoundTitle")}
          subtitle={t("partners.detail.notFoundBody")}
          actions={
            <Link
              href="/partners"
              style={{
                color: theme.text,
                textDecoration: "none",
                fontSize: 12.5,
              }}
            >
              /partners
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            title={t("partners.detail.notFoundTitle")}
            body={error ?? t("partners.detail.notFoundBody")}
          />
        </div>
      </div>
    );
  }

  const statusTone = toCanvasTone(partnerStatusTone(entry.status));
  const titleNode = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span style={iconBadgeStyle(entry.themeAccent ?? theme.accent)}>
        {initialsForEntry(entry)}
      </span>
      <span>
        {(entry.bankCode ?? entry.partnerCode).toUpperCase()} ·{" "}
        {entry.programId}
      </span>
      <Pill theme={theme} tone={statusTone} dot>
        {formatPlatformCodeLabel(locale, entry.status)}
      </Pill>
    </span>
  );

  const headerActions = (
    <>
      {previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 28,
            padding: "5px 10px",
            borderRadius: 7,
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            color: theme.text,
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {t("partners.detail.preview")}
        </a>
      ) : null}
      <Btn
        theme={theme}
        variant={entry.activeFlag ? "ghost" : "secondary"}
        onClick={() => {
          setEntryActionMode(entry.activeFlag ? "deactivate" : "activate");
          setGovernanceReason("");
        }}
      >
        {entry.activeFlag
          ? t("partners.detail.deactivateEntry")
          : t("partners.detail.activateEntry")}
      </Btn>
      <Btn
        theme={theme}
        variant="secondary"
        onClick={() => {
          setCredentialActionMode("issue");
          setCredentialActionReason("");
        }}
      >
        {t("partners.detail.issueCredential")}
      </Btn>
      <Btn
        theme={theme}
        variant="primary"
        onClick={() => {
          setCredentialActionMode("rotate");
          setCredentialActionReason("");
        }}
      >
        {t("partners.detail.rotateCredential")}
      </Btn>
      <Btn
        theme={theme}
        variant="secondary"
        danger
        onClick={() => {
          setEntryActionMode("revoke");
          setGovernanceReason("");
        }}
      >
        {t("partners.detail.revokeEntry")}
      </Btn>
    </>
  );

  const renderEditableFooter = (
    <div style={saveBarStyle}>
      <div style={mutedTextStyle}>
        {t("partners.detail.saveHint")}
        <br />
        {formatDateTime(entry.updatedAt)}
      </div>
      <Btn
        theme={theme}
        variant="primary"
        disabled={saving || !editForm.displayName.trim()}
        onClick={() => void saveEntry()}
      >
        {saving ? t("common.saving") : t("partners.detail.save")}
      </Btn>
    </div>
  );

  const gridStyle = isCompactViewport ? heroGridCompactStyle : heroGridStyle;
  const formGrid = isCompactViewport ? fieldGridCompactStyle : fieldGridStyle;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        theme={theme}
        title={titleNode}
        subtitle={`/${entry.entrySlug} · partner_id ${entry.partnerId}`}
        tabs={tabDefs.map((definition) => definition.node)}
        activeTab={activeTabNode}
        actions={headerActions}
      />

      <div style={pageBodyStyle}>
        {previewNotice ? (
          <Banner
            theme={theme}
            tone="info"
            title={t("partners.detail.previewModeTitle")}
            body={previewNotice}
          />
        ) : null}

        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={
              activeTab === "credentials"
                ? t("partners.detail.issueErrorTitle")
                : t("partners.detail.updateErrorTitle")
            }
            body={error}
          />
        ) : null}

        {activeTab === "overview" ? (
          <div style={gridStyle}>
            <Card
              theme={theme}
              title={t("partners.detail.overviewTitle")}
              subtitle={t("partners.detail.overviewSubtitle")}
              actions={
                <div style={inlinePillRowStyle}>
                  <Pill theme={theme} tone={statusTone} dot>
                    {formatPlatformCodeLabel(locale, entry.status)}
                  </Pill>
                  <Pill theme={theme} tone="info">
                    {formatPlatformCodeLabel(locale, entry.authMode)}
                  </Pill>
                  <Pill theme={theme} tone="accent">
                    {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                  </Pill>
                </div>
              }
            >
              <DL
                theme={theme}
                items={overviewItems}
                cols={isCompactViewport ? 1 : 2}
              />
            </Card>

            <div style={sideStackStyle}>
              <Card theme={theme} title={t("partners.detail.readinessTitle")}>
                <div style={{ display: "grid", gap: 10 }}>
                  <Banner
                    theme={theme}
                    tone={readinessComplete ? "success" : "warn"}
                    title={
                      readinessComplete
                        ? t("partners.detail.readinessReady")
                        : t("partners.detail.readinessBlocked")
                    }
                    body={
                      readinessComplete
                        ? t("partners.detail.readinessReadyBody")
                        : t("partners.detail.readinessBlockedBody")
                    }
                  />

                  <div style={{ display: "grid" }}>
                    {readinessItems.map((item, index) => (
                      <div
                        key={`${item.label}-${index}`}
                        style={{
                          ...readinessRowStyle(item.ready),
                          borderBottom:
                            index === readinessItems.length - 1
                              ? "none"
                              : readinessRowStyle(item.ready).borderBottom,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: item.ready
                                ? theme.successBg
                                : theme.warnBg,
                              color: item.ready ? theme.success : theme.warn,
                              flexShrink: 0,
                            }}
                          >
                            <CanvasIcon
                              name={item.ready ? "check" : "warn"}
                              size={12}
                              stroke={2}
                            />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: theme.text,
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                ...mutedTextStyle,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {item.value}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontFamily: theme.monoFamily,
                            fontSize: 11,
                            fontWeight: 600,
                            color: item.ready ? theme.success : theme.warn,
                            flexShrink: 0,
                          }}
                        >
                          {item.ready
                            ? t("partners.detail.readiness.ok", {
                                ready: readinessReadyCount,
                                total: readinessItems.length,
                              })
                            : t("partners.detail.readiness.gap")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card
                theme={theme}
                title={t("partners.detail.credentialsTitle")}
                subtitle={t("partners.detail.credentialsSubtitle")}
              >
                {credentialRows.length > 0 ? (
                  <Table<CredentialRow>
                    theme={theme}
                    dense
                    columns={credentialColumns}
                    rows={credentialRows}
                  />
                ) : (
                  <Banner
                    theme={theme}
                    tone="info"
                    title={t("partners.detail.credentialsTitle")}
                    body={t("partners.detail.credentialsEmpty")}
                  />
                )}
              </Card>

              <Card
                theme={theme}
                title={t("partners.detail.governanceCard.title")}
                subtitle={t("partners.detail.governanceCard.subtitle")}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("partners.detail.governanceCard.status"),
                        v: formatPlatformCodeLabel(locale, entry.status),
                      },
                      {
                        k: t("partners.detail.governanceCard.trafficPosture"),
                        v: entry.activeFlag
                          ? t("partners.detail.governanceCard.trafficActive")
                          : t("partners.detail.governanceCard.trafficBlocked"),
                      },
                    ]}
                  />
                  <div style={actionClusterStyle}>
                    <Btn
                      theme={theme}
                      variant={entry.activeFlag ? "ghost" : "secondary"}
                      size="xs"
                      onClick={() => {
                        setEntryActionMode(
                          entry.activeFlag ? "deactivate" : "activate",
                        );
                        setGovernanceReason("");
                      }}
                    >
                      {entry.activeFlag
                        ? t("partners.detail.deactivateEntry")
                        : t("partners.detail.activateEntry")}
                    </Btn>
                    <Btn
                      theme={theme}
                      variant="secondary"
                      danger
                      size="xs"
                      onClick={() => {
                        setEntryActionMode("revoke");
                        setGovernanceReason("");
                      }}
                    >
                      {t("partners.detail.revokeEntry")}
                    </Btn>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        ) : null}

        {activeTab === "branding" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Card
              theme={theme}
              title={t("partners.detail.brandingTitle")}
              subtitle={t("partners.detail.brandingSubtitle")}
            >
              <div style={formGrid}>
                <TextField
                  label={t("partners.form.displayName")}
                  value={editForm.displayName}
                  onChange={(value) => updateFormField("displayName", value)}
                  required
                />
                <TextField
                  label={t("partners.form.entryHost")}
                  value={editForm.entryHost}
                  onChange={(value) => updateFormField("entryHost", value)}
                  placeholder="partner.example"
                  mono
                />
                <TextField
                  label={t("partners.form.entryPath")}
                  value={editForm.entryPath}
                  onChange={(value) => updateFormField("entryPath", value)}
                  placeholder="/partner/world-elite"
                  mono
                  hint={
                    previewUrl
                      ? `${t("partners.detail.routeHint")}: ${previewUrl}`
                      : undefined
                  }
                />
                <TextField
                  label={t("partners.form.themeAccent")}
                  value={editForm.themeAccent}
                  onChange={(value) => updateFormField("themeAccent", value)}
                  placeholder="#0b7285"
                  mono
                  hint={t("partners.detail.accentHint")}
                />
                <TextField
                  label={t("partners.form.supportEmail")}
                  value={editForm.supportEmail}
                  onChange={(value) => updateFormField("supportEmail", value)}
                />
                <TextField
                  label={t("partners.form.supportPhone")}
                  value={editForm.supportPhone}
                  onChange={(value) => updateFormField("supportPhone", value)}
                />
              </div>
            </Card>
            {renderEditableFooter}
          </div>
        ) : null}

        {activeTab === "auth" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Card
              theme={theme}
              title={t("partners.detail.authTitle")}
              subtitle={t("partners.detail.authSubtitle")}
              actions={
                <div style={inlinePillRowStyle}>
                  <Pill theme={theme} tone={statusTone} dot>
                    {formatPlatformCodeLabel(locale, entry.status)}
                  </Pill>
                  <Pill theme={theme} tone="info">
                    {formatPlatformCodeLabel(locale, entry.authMode)}
                  </Pill>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 12 }}>
                <Banner
                  theme={theme}
                  tone={
                    entry.authMode !== "partner_api_key"
                      ? "info"
                      : activeCredentialCount > 0
                        ? "success"
                        : "warn"
                  }
                  title={t("partners.detail.authBannerTitle")}
                  body={
                    entry.authMode === "partner_api_key"
                      ? activeCredentialCount > 0
                        ? t("partners.detail.authBannerBody.active", {
                            count: activeCredentialCount,
                          })
                        : t("partners.detail.authBannerBody.none")
                      : t("partners.detail.authBannerBody.notRequired")
                  }
                />
                <Card
                  theme={theme}
                  title={t("partners.detail.webhook.title")}
                  subtitle={t("partners.detail.webhook.subtitle")}
                >
                  <div style={linkCardStyle}>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("partners.detail.webhook.requestLineage")}
                        </div>
                        <div style={monoValueStyle}>
                          {entry.auditMetadata.requestId ?? "—"}
                        </div>
                      </div>
                      <Pill
                        theme={theme}
                        tone={entry.auditMetadata.source ? "success" : "warn"}
                      >
                        {entry.auditMetadata.source
                          ? t("partners.detail.webhook.bound")
                          : t("partners.detail.webhook.gap")}
                      </Pill>
                    </div>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("partners.detail.webhook.auditSource")}
                        </div>
                        <div style={monoValueStyle}>
                          {entry.auditMetadata.source ?? "—"}
                        </div>
                      </div>
                      <Pill theme={theme} tone="info">
                        {t("partners.detail.webhook.platformOwned")}
                      </Pill>
                    </div>
                  </div>
                </Card>
                <div style={formGrid}>
                  <TextField
                    label={t("partners.form.tenantId")}
                    value={editForm.tenantId}
                    onChange={(value) => updateFormField("tenantId", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.partnerType")}
                    value={editForm.partnerType}
                    onChange={(value) => updateFormField("partnerType", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.partnerCode")}
                    value={editForm.partnerCode}
                    onChange={(value) => updateFormField("partnerCode", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.programId")}
                    value={editForm.programId}
                    onChange={(value) => updateFormField("programId", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.programCode")}
                    value={editForm.programCode}
                    onChange={(value) => updateFormField("programCode", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.bankCode")}
                    value={editForm.bankCode}
                    onChange={(value) => updateFormField("bankCode", value)}
                    mono
                  />
                  <TextField
                    label={t("partners.form.entrySlug")}
                    value={editForm.entrySlug}
                    onChange={(value) => updateFormField("entrySlug", value)}
                    mono
                    disabled
                  />
                  <SelectField
                    label={t("partners.form.dispatchSubtype")}
                    value={editForm.businessDispatchSubtype}
                    options={BUSINESS_DISPATCH_SUBTYPES}
                    onChange={(value) =>
                      updateFormField(
                        "businessDispatchSubtype",
                        value as BusinessDispatchSubtype,
                      )
                    }
                    formatOption={(value) =>
                      formatPlatformCodeLabel(locale, value)
                    }
                  />
                  <SelectField
                    label={t("partners.form.authMode")}
                    value={editForm.authMode}
                    options={PARTNER_ENTRY_AUTH_MODES}
                    onChange={(value) =>
                      updateFormField("authMode", value as PartnerEntryAuthMode)
                    }
                    formatOption={(value) =>
                      formatPlatformCodeLabel(locale, value)
                    }
                  />
                </div>
              </div>
            </Card>
            {renderEditableFooter}
          </div>
        ) : null}

        {activeTab === "eligibility" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Card
              theme={theme}
              title={t("partners.detail.eligibilityTitle")}
              subtitle={t("partners.detail.eligibilitySubtitle")}
            >
              <div style={{ display: "grid", gap: 12 }}>
                <Banner
                  theme={theme}
                  tone={
                    entry.eligibilityMode === "none"
                      ? "info"
                      : entry.eligibilityContract?.contractId
                        ? "accent"
                        : "warn"
                  }
                  title={t("partners.detail.eligibilityBannerTitle")}
                  body={
                    entry.eligibilityMode === "none"
                      ? t("partners.detail.eligibilityBannerBody.none")
                      : entry.eligibilityContract?.contractId
                        ? t("partners.detail.eligibilityBannerBody.linked")
                        : t("partners.detail.contractEmpty")
                  }
                />

                <SelectField
                  label={t("partners.form.eligibilityMode")}
                  value={editForm.eligibilityMode}
                  options={PARTNER_ELIGIBILITY_MODES}
                  onChange={(value) =>
                    updateFormField(
                      "eligibilityMode",
                      value as PartnerEligibilityMode,
                    )
                  }
                  formatOption={(value) =>
                    formatPlatformCodeLabel(locale, value)
                  }
                />

                <DL
                  theme={theme}
                  items={eligibilitySnapshotItems}
                  cols={isCompactViewport ? 1 : 2}
                />

                {entry.eligibilityContract?.notes?.[0] ? (
                  <div style={mutedTextStyle}>
                    {entry.eligibilityContract.notes[0]}
                  </div>
                ) : null}
              </div>
            </Card>
            <Card
              theme={theme}
              title={t("partners.detail.adapterLinkage.title")}
              subtitle={t("partners.detail.adapterLinkage.subtitle")}
            >
              <div style={linkCardStyle}>
                <div style={linkRowStyle}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {t("partners.detail.adapterLinkage.linkedAdapter")}
                    </div>
                    <div style={monoValueStyle}>
                      {entry.eligibilityContract
                        ? `${entry.eligibilityContract.adapterCode} · ${entry.eligibilityContract.adapterVersion}`
                        : "—"}
                    </div>
                  </div>
                  <Link
                    href="/adapter-registry"
                    style={{
                      color: theme.text,
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    /adapter-registry
                  </Link>
                </div>
                <div style={linkRowStyle}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {t("partners.detail.adapterLinkage.manualFallback")}
                    </div>
                    <div style={monoValueStyle}>
                      {entry.eligibilityContract?.manualFallbackPolicy
                        ?.requiredOnTimeout
                        ? t("partners.detail.adapterLinkage.timeoutRequired")
                        : t("partners.detail.adapterLinkage.noTimeoutFallback")}
                    </div>
                  </div>
                  <Pill
                    theme={theme}
                    tone={
                      entry.eligibilityContract?.contractId ? "accent" : "warn"
                    }
                  >
                    {entry.eligibilityContract?.contractId
                      ? t("partners.detail.adapterLinkage.snapshotLinked")
                      : t("partners.detail.adapterLinkage.snapshotMissing")}
                  </Pill>
                </div>
              </div>
            </Card>
            {renderEditableFooter}
          </div>
        ) : null}

        {activeTab === "credentials" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Card
              theme={theme}
              title={t("partners.detail.credentialsTitle")}
              subtitle={t("partners.detail.credentialsSubtitle")}
              actions={
                <div style={inlinePillRowStyle}>
                  <Btn
                    theme={theme}
                    variant="secondary"
                    size="xs"
                    onClick={() => {
                      setCredentialActionMode("issue");
                      setCredentialActionReason("");
                    }}
                  >
                    {t("partners.detail.issueCredential")}
                  </Btn>
                  <Btn
                    theme={theme}
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      setCredentialActionMode("rotate");
                      setCredentialActionReason("");
                    }}
                  >
                    {t("partners.detail.rotateCredential")}
                  </Btn>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 12 }}>
                <Banner
                  theme={theme}
                  tone={activeCredentialCount > 0 ? "success" : "warn"}
                  title={t("partners.detail.credentialsBannerTitle", {
                    ready: readinessReadyCount,
                    total: readinessItems.length,
                  })}
                  body={
                    activeCredentialCount > 0
                      ? t("partners.detail.credentialsBannerBody", {
                          count: activeCredentialCount,
                        })
                      : t("partners.detail.credentialsEmpty")
                  }
                />

                {credentialRows.length > 0 ? (
                  <Table<CredentialRow>
                    theme={theme}
                    dense
                    columns={credentialColumns}
                    rows={credentialRows}
                  />
                ) : (
                  <Banner
                    theme={theme}
                    tone="info"
                    title={t("partners.detail.credentialsTitle")}
                    body={t("partners.detail.credentialsEmpty")}
                  />
                )}
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "audit" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Card
              theme={theme}
              title={t("partners.detail.auditTitle")}
              subtitle={t("partners.detail.auditSubtitle")}
              actions={
                <Pill theme={theme} tone={statusTone} dot>
                  {formatPlatformCodeLabel(locale, entry.status)}
                </Pill>
              }
            >
              <div style={{ display: "grid", gap: 12 }}>
                {entry.revokedAt ? (
                  <Banner
                    theme={theme}
                    tone="danger"
                    title={t("partners.detail.auditRevokedTitle")}
                    body={
                      entry.revokeReason ??
                      t("partners.detail.auditRevokedBodyDefault")
                    }
                  />
                ) : null}

                <DL
                  theme={theme}
                  items={auditItems}
                  cols={isCompactViewport ? 1 : 2}
                />

                <Table<AuditRow>
                  theme={theme}
                  dense
                  columns={auditColumns}
                  rows={auditRows}
                />
              </div>
            </Card>
          </div>
        ) : null}
      </div>

      {credentialActionMode ? (
        <CredentialActionModal
          mode={credentialActionMode}
          reason={credentialActionReason}
          busy={issuingCredential}
          onReasonChange={setCredentialActionReason}
          onClose={() => {
            if (issuingCredential) {
              return;
            }
            setCredentialActionMode(null);
            setCredentialActionReason("");
          }}
          onConfirm={() => void issueCredential()}
        />
      ) : null}

      {entryActionMode || credentialToRevoke ? (
        <GovernanceActionModal
          mode={credentialToRevoke ? "revoke_credential" : entryActionMode!}
          reason={governanceReason}
          busy={governanceBusy}
          onReasonChange={setGovernanceReason}
          onClose={() => {
            if (governanceBusy) {
              return;
            }
            setEntryActionMode(null);
            setCredentialToRevoke(null);
            setGovernanceReason("");
          }}
          onConfirm={() => void runGovernanceAction()}
        />
      ) : null}

      {issuedCredential ? (
        <SecretRevealModal
          entry={entry}
          issuedCredential={issuedCredential}
          acknowledged={secretAcknowledged}
          onAcknowledgedChange={setSecretAcknowledged}
          onClose={() => {
            if (!secretAcknowledged) {
              setSecretAcknowledged(false);
            }
            setIssuedCredential(null);
          }}
          onCopy={() => void handleCopySecret()}
          onDownload={handleDownloadSecret}
        />
      ) : null}
    </div>
  );
}
