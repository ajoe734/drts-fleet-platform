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
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
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
  const { locale } = useTranslation();

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
            {locale === "en" ? "Close" : "關閉"}
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
  locale,
  copy,
}: {
  entry: PartnerChannelEntryRecord;
  issuedCredential: PartnerIngressCredentialIssued;
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
  locale: Locale;
  copy: {
    title: string;
    subtitle: string;
    warningTitle: string;
    warningBody: string;
    secretName: string;
    secretField: string;
    secretHint: string;
    scope: string;
    expiresAt: string;
    createdBy: string;
    createdAt: string;
    stored: string;
    cancel: string;
    complete: string;
    copyLabel: string;
    downloadLabel: string;
  };
}) {
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
          {copy.title}
        </>
      }
      subtitle={copy.subtitle}
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={!acknowledged}
            onClick={onClose}
          >
            {copy.complete}
          </Btn>
        </>
      }
    >
      <Banner
        theme={theme}
        tone="warn"
        title={copy.warningTitle}
        body={copy.warningBody}
      />

      <Field theme={theme} label={copy.secretName}>
        <div style={controlStyle({ mono: true, disabled: true })}>
          {entry.displayName}
        </div>
      </Field>

      <Field theme={theme} label={copy.secretField} hint={copy.secretHint}>
        <div style={secretRowStyle}>
          <span style={secretTextStyle}>{issuedCredential.plaintextKey}</span>
          <Btn theme={theme} size="xs" variant="secondary" onClick={onCopy}>
            {copy.copyLabel}
          </Btn>
          <Btn theme={theme} size="xs" variant="secondary" onClick={onDownload}>
            {copy.downloadLabel}
          </Btn>
        </div>
      </Field>

      <DL
        theme={theme}
        cols={2}
        items={[
          {
            k: copy.scope,
            v: formatPlatformCodeLabel(locale, credential.source),
            mono: true,
          },
          {
            k: copy.expiresAt,
            v: "—",
            mono: true,
          },
          {
            k: copy.createdBy,
            v: formatPlatformCodeLabel(
              locale,
              credential.issuedBy ?? "platform-admin",
            ),
          },
          {
            k: copy.createdAt,
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
        <span style={{ fontSize: 12.5, color: theme.text }}>{copy.stored}</span>
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
  copy,
}: {
  mode: "issue" | "rotate";
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  copy: {
    issueTitle: string;
    rotateTitle: string;
    subtitle: string;
    fieldLabel: string;
    hint: string;
    placeholderIssue: string;
    placeholderRotate: string;
    cancel: string;
    issueConfirm: string;
    rotateConfirm: string;
  };
}) {
  const isRotate = mode === "rotate";

  return (
    <ModalFrame
      title={isRotate ? copy.rotateTitle : copy.issueTitle}
      subtitle={copy.subtitle}
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={onConfirm}
          >
            {busy
              ? isRotate
                ? copy.rotateConfirm
                : copy.issueConfirm
              : isRotate
                ? copy.rotateConfirm
                : copy.issueConfirm}
          </Btn>
        </>
      }
    >
      <Banner
        theme={theme}
        tone="warn"
        title={isRotate ? copy.rotateTitle : copy.issueTitle}
        body={copy.hint}
      />
      <TextAreaField
        label={copy.fieldLabel}
        value={reason}
        onChange={onReasonChange}
        required
        placeholder={isRotate ? copy.placeholderRotate : copy.placeholderIssue}
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
  copy,
}: {
  mode: EntryActionMode | "revoke_credential";
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  copy: {
    activateTitle: string;
    deactivateTitle: string;
    revokeTitle: string;
    revokeCredentialTitle: string;
    mediumSubtitle: string;
    highSubtitle: string;
    activateBody: string;
    deactivateBody: string;
    revokeBody: string;
    revokeCredentialBody: string;
    fieldLabel: string;
    fieldHint: string;
    fieldPlaceholder: string;
    cancel: string;
    activateConfirm: string;
    deactivateConfirm: string;
    revokeConfirm: string;
    revokeCredentialConfirm: string;
  };
}) {
  const requiresReason = mode === "revoke" || mode === "revoke_credential";
  const title =
    mode === "activate"
      ? copy.activateTitle
      : mode === "deactivate"
        ? copy.deactivateTitle
        : mode === "revoke"
          ? copy.revokeTitle
          : copy.revokeCredentialTitle;
  const body =
    mode === "activate"
      ? copy.activateBody
      : mode === "deactivate"
        ? copy.deactivateBody
        : mode === "revoke"
          ? copy.revokeBody
          : copy.revokeCredentialBody;
  const confirmLabel =
    mode === "activate"
      ? copy.activateConfirm
      : mode === "deactivate"
        ? copy.deactivateConfirm
        : mode === "revoke"
          ? copy.revokeConfirm
          : copy.revokeCredentialConfirm;

  return (
    <ModalFrame
      title={title}
      subtitle={requiresReason ? copy.highSubtitle : copy.mediumSubtitle}
      onClose={onClose}
      footer={
        <>
          <Btn theme={theme} variant="secondary" onClick={onClose}>
            {copy.cancel}
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
          label={copy.fieldLabel}
          hint={copy.fieldHint}
          value={reason}
          onChange={onReasonChange}
          required
          placeholder={copy.fieldPlaceholder}
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

  const copy =
    locale === "en"
      ? {
          notFoundTitle: "Partner entry unavailable",
          notFoundBody: "The requested partner entry could not be found.",
          updateErrorTitle: "Unable to update partner entry",
          issueErrorTitle: "Unable to issue credential",
          previewModeTitle: "Preview fixture mode",
          previewNotice:
            "Platform Admin API data is unavailable in this workspace. Showing the canvas-aligned preview fixture for local verification.",
          tabs: {
            overview: "Overview",
            branding: "Branding",
            auth: "Auth",
            eligibility: "Eligibility",
            credentials: "Credentials",
            audit: "Audit",
          },
          headerSubtitle: (entry: PartnerChannelEntryRecord) =>
            `/${entry.entrySlug} · partner ID ${entry.partnerId}`,
          preview: "Preview entry",
          issueCredential: "Issue credential",
          rotateCredential: "Rotate credential",
          activateEntry: "Activate entry",
          deactivateEntry: "Deactivate entry",
          revokeEntry: "Revoke entry",
          save: "Save changes",
          saveHint:
            "Apply branding, routing, auth, and eligibility changes without moving away from the platform-governed entry model.",
          overviewTitle: "Entry basics",
          overviewSubtitle:
            "Platform-owned routing, identity, and launch posture for the selected partner entry.",
          overviewLabels: {
            tenant: "Tenant",
            bankCode: "Bank code",
            program: "Program",
            businessSubtype: "Business subtype",
            authMode: "Auth mode",
            eligibility: "Eligibility",
            entryHost: "Entry host",
            entryPath: "Entry path",
            themeAccent: "Theme accent",
            supportContact: "Support contact",
          },
          readinessTitle: "Readiness · masked governance gates",
          readinessReady: "Ready to promote",
          readinessBlocked: "Readiness gaps remain",
          readinessReadyBody:
            "All required gates are green. Promotion can proceed without hiding governance controls.",
          readinessBlockedBody:
            "Keep traffic blocked until branding, contract, audit, and credential gaps are resolved.",
          readinessOk: (count: number, total: number) => `OK ${count}/${total}`,
          readinessGap: "Gap",
          credentialsTitle: "Active credentials · masked only",
          credentialsSubtitle:
            "Plaintext values are only shown once at issue time. The roster below remains masked.",
          credentialsEmpty:
            "No active ingress credentials are available for this entry yet.",
          credentialsBannerTitle: (count: number, total: number) =>
            `${count}/${total} governance gates ready`,
          credentialsBannerBody: (count: number) =>
            `${count} active credential(s) remain masked in the table below.`,
          brandingTitle: "Branding",
          brandingSubtitle:
            "Partner-facing title, route, accent, and support metadata.",
          authTitle: "Auth",
          authSubtitle:
            "Authority stays on the platform side even when partner-specific credentials are used.",
          authBannerBodyWithCredentials: (count: number) =>
            `${count} credential(s) currently gate ingress traffic.`,
          authBannerBodyMissing:
            "Partner API key mode is active, but there is no usable ingress credential.",
          authBannerBodyNotRequired:
            "This entry does not require partner-managed ingress credentials.",
          webhookLinkageTitle: "Webhook linkage",
          webhookLinkageSubtitle:
            "Operational delivery remains masked here; only the governance binding is shown.",
          requestLineage: "Request lineage",
          bound: "Bound",
          gap: "Gap",
          auditSource: "Audit source",
          platformOwned: "Platform-owned",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "Contract snapshot, adapter posture, and fallback behavior for this entry.",
          noEligibilityVerificationBody:
            "No partner-side eligibility verification is required before fulfillment.",
          eligibilityLinkedBody:
            "Eligibility remains platform-governed and is backed by the linked contract snapshot.",
          adapterLinkageTitle: "Adapter linkage",
          adapterLinkageSubtitle:
            "Cross-link the contract snapshot to the platform adapter registry.",
          linkedAdapter: "Linked adapter",
          manualFallback: "Manual fallback",
          opsQueueRequired: "Ops queue required",
          noTimeoutFallback: "No timeout fallback",
          snapshotLinked: "Snapshot linked",
          missingSnapshot: "Missing snapshot",
          eligibilitySnapshotLabels: {
            contractId: "Contract ID",
            adapter: "Adapter",
            adapterPosture: "Adapter posture",
            fallback: "Fallback",
          },
          auditTitle: "Audit",
          auditSubtitle:
            "Creation, updates, credential events, and request lineage for platform review.",
          auditInfoLabels: {
            source: "Audit source",
            requestId: "Request ID",
            createdBy: "Created by",
            createdAt: "Created at",
            updatedBy: "Updated by",
            updatedAt: "Updated at",
            revokedAt: "Revoked at",
            revokeReason: "Revoke reason",
          },
          auditTable: {
            event: "Event",
            actor: "Actor",
            detail: "Detail",
            at: "At",
          },
          routeHint: "Public route preview",
          accentHint: "Brand accent delivered to the partner skin",
          contractEmpty:
            "No eligibility contract snapshot is currently linked to this entry.",
          authBannerTitle: "Credential posture",
          eligibilityBannerTitle: "Contract posture",
          governanceActionsTitle: "Governance actions",
          governanceActionsSubtitle:
            "State transitions and high-risk lifecycle controls.",
          governanceStatusLabel: "Status",
          governanceTrafficLabel: "Traffic posture",
          governanceTrafficReady: "Entry can accept governed traffic",
          governanceTrafficBlocked: "Entry remains blocked",
          entryRevokedTitle: "Entry revoked",
          entryRevokedBody: "Traffic should remain blocked for this entry.",
          credentialTable: {
            kind: "Kind",
            masked: "Masked",
            rotated: "Rotated",
            lastUsed: "Last used",
            actions: "Actions",
            revoke: "Revoke",
          },
          secretModal: {
            title: "Ingress credential generated · only shown once",
            subtitle: "Plaintext shown once",
            warningTitle:
              "Closing this window permanently hides the full secret",
            warningBody:
              "If the secret is lost, create a new credential and rotate immediately. Only the masked suffix is retained afterward.",
            secretName: "Credential name",
            secretField: "Secret · plaintext once",
            secretHint:
              "Copy the value now. The full secret will not be returned again.",
            scope: "Source",
            expiresAt: "Expires at",
            createdBy: "Created by",
            createdAt: "Created at",
            stored: "I stored this credential in a secure location.",
            cancel: "Cancel",
            complete: "Complete · I stored this key",
            copyLabel: "Copy",
            downloadLabel: ".txt",
          },
          credentialActionModal: {
            issueTitle: "Issue ingress credential",
            rotateTitle: "Rotate ingress credential",
            subtitle: "HIGH-RISK ACTION · audit reason required",
            fieldLabel: "Rotation reason",
            hint: "Provide an operator reason. This action is audited and the plaintext secret will be revealed once.",
            placeholderIssue:
              "Example: initial production launch for CTBC World Elite entry",
            placeholderRotate:
              "Example: rotate after key exposure drill / scheduled quarterly refresh",
            cancel: "Cancel",
            issueConfirm: "Issue credential",
            rotateConfirm: "Rotate credential",
          },
          governanceActionModal: {
            activateTitle: "Activate partner entry",
            deactivateTitle: "Deactivate partner entry",
            revokeTitle: "Revoke partner entry",
            revokeCredentialTitle: "Revoke ingress credential",
            mediumSubtitle: "MEDIUM-RISK ACTION · audit receipt",
            highSubtitle: "HIGH-RISK ACTION · audit reason required",
            activateBody:
              "Activation makes this entry eligible for governed traffic once readiness gates are satisfied.",
            deactivateBody:
              "Deactivation keeps the entry in the registry but blocks new governed traffic.",
            revokeBody:
              "Revocation is irreversible at the entry level and should only be used for contract termination or security withdrawal.",
            revokeCredentialBody:
              "Revoking this credential removes it from future ingress use. Rotate first if traffic continuity is required.",
            fieldLabel: "Audit reason",
            fieldHint:
              "Provide a concrete operator reason. This action is recorded in Platform Admin audit history.",
            fieldPlaceholder:
              "Example: revoke after partner contract termination / security investigation",
            cancel: "Cancel",
            activateConfirm: "Activate",
            deactivateConfirm: "Deactivate",
            revokeConfirm: "Revoke entry",
            revokeCredentialConfirm: "Revoke credential",
          },
        }
      : {
          notFoundTitle: "合作夥伴入口目前不可用",
          notFoundBody: "找不到指定的合作夥伴入口。",
          updateErrorTitle: "合作夥伴入口更新失敗",
          issueErrorTitle: "憑證發行失敗",
          previewModeTitle: "預覽樣板模式",
          previewNotice:
            "目前無法從平台管理端資料介面取得資料；此頁改用符合畫布的預覽樣板資料供本地驗證。",
          tabs: {
            overview: "總覽",
            branding: "品牌",
            auth: "驗證",
            eligibility: "資格",
            credentials: "憑證",
            audit: "稽核",
          },
          headerSubtitle: (entry: PartnerChannelEntryRecord) =>
            `入口代碼 ${entry.entrySlug} · 合作夥伴編號 ${entry.partnerId}`,
          preview: "預覽入口",
          issueCredential: "發行憑證",
          rotateCredential: "輪替憑證",
          activateEntry: "啟用入口",
          deactivateEntry: "停用入口",
          revokeEntry: "撤銷入口",
          save: "儲存變更",
          saveHint:
            "在不脫離平台治理模型的前提下，更新此入口的品牌、路由、驗證與資格設定。",
          overviewTitle: "入口基本資料",
          overviewSubtitle:
            "集中檢視此合作夥伴入口的平台路由、識別與上線姿態。",
          overviewLabels: {
            tenant: "租戶",
            bankCode: "銀行代碼",
            program: "方案",
            businessSubtype: "派單子類型",
            authMode: "驗證模式",
            eligibility: "資格模式",
            entryHost: "入口主機",
            entryPath: "入口路徑",
            themeAccent: "主題色",
            supportContact: "支援資訊",
          },
          readinessTitle: "上線就緒度與治理閘門",
          readinessReady: "可推進上線",
          readinessBlocked: "仍有就緒缺口",
          readinessReadyBody:
            "必要閘門已全部轉綠，可在不模糊治理邊界下推進上線。",
          readinessBlockedBody:
            "在品牌、契約、稽核與憑證缺口補齊前，不應直接導流。",
          readinessOk: (count: number, total: number) =>
            `已就緒 ${count}/${total}`,
          readinessGap: "缺口",
          credentialsTitle: "啟用中憑證 · 僅顯示遮罩",
          credentialsSubtitle:
            "完整明文密鑰只會在發行當下顯示一次；下方清單只保留遮罩資訊。",
          credentialsEmpty: "此入口目前沒有可用的入口憑證。",
          credentialsBannerTitle: (count: number, total: number) =>
            `${count}/${total} 個治理閘門已就緒`,
          credentialsBannerBody: (count: number) =>
            `下方表格仍有 ${count} 組啟用中的憑證，且只顯示遮罩資訊。`,
          brandingTitle: "品牌設定",
          brandingSubtitle:
            "設定合作夥伴對外顯示名稱、入口路由、色彩與支援資訊。",
          authTitle: "驗證",
          authSubtitle: "即使使用合作夥伴專屬憑證，驗證權限仍保留在平台側。",
          authBannerBodyWithCredentials: (count: number) =>
            `目前有 ${count} 組憑證負責控管入口流量。`,
          authBannerBodyMissing:
            "目前啟用了合作夥伴金鑰模式，但沒有可用的入口憑證。",
          authBannerBodyNotRequired: "此入口不需要合作夥伴自行管理的入口憑證。",
          webhookLinkageTitle: "回呼綁定",
          webhookLinkageSubtitle:
            "此處只顯示治理綁定關係，不展開營運投遞細節。",
          requestLineage: "請求沿革",
          bound: "已綁定",
          gap: "缺口",
          auditSource: "稽核來源",
          platformOwned: "平台治理",
          eligibilityTitle: "資格",
          eligibilitySubtitle: "檢視此入口的契約快照、介接姿態與補救策略。",
          noEligibilityVerificationBody:
            "此流程在履約前不要求合作夥伴側資格驗證。",
          eligibilityLinkedBody:
            "資格驗證仍由平台治理，且已有對應契約快照作為依據。",
          adapterLinkageTitle: "介接器綁定",
          adapterLinkageSubtitle: "將契約快照與平台介接器註冊表交叉對照。",
          linkedAdapter: "已綁定介接器",
          manualFallback: "人工補救",
          opsQueueRequired: "逾時時需進入營運佇列",
          noTimeoutFallback: "無逾時補救流程",
          snapshotLinked: "快照已綁定",
          missingSnapshot: "缺少快照",
          eligibilitySnapshotLabels: {
            contractId: "契約編號",
            adapter: "介接器",
            adapterPosture: "介接姿態",
            fallback: "補救策略",
          },
          auditTitle: "稽核",
          auditSubtitle: "平台稽核需要完整保留建立、更新、憑證事件與請求沿革。",
          auditInfoLabels: {
            source: "稽核來源",
            requestId: "請求編號",
            createdBy: "建立者",
            createdAt: "建立時間",
            updatedBy: "更新者",
            updatedAt: "更新時間",
            revokedAt: "撤銷時間",
            revokeReason: "撤銷原因",
          },
          auditTable: {
            event: "事件",
            actor: "執行者",
            detail: "內容",
            at: "時間",
          },
          routeHint: "公開入口預覽",
          accentHint: "套用到合作夥伴介面的品牌主色",
          contractEmpty: "此入口尚未綁定資格驗證契約快照。",
          authBannerTitle: "憑證姿態",
          eligibilityBannerTitle: "契約姿態",
          governanceActionsTitle: "治理動作",
          governanceActionsSubtitle: "集中執行狀態切換與高風險生命週期控制。",
          governanceStatusLabel: "狀態",
          governanceTrafficLabel: "流量姿態",
          governanceTrafficReady: "此入口可承接平台治理流量",
          governanceTrafficBlocked: "此入口仍維持封鎖",
          entryRevokedTitle: "入口已撤銷",
          entryRevokedBody: "此入口的流量應持續維持封鎖。",
          credentialTable: {
            kind: "類型",
            masked: "遮罩值",
            rotated: "輪替時間",
            lastUsed: "最後使用",
            actions: "操作",
            revoke: "撤銷",
          },
          secretModal: {
            title: "入口憑證已產生 · 僅顯示一次",
            subtitle: "完整密鑰僅顯示一次",
            warningTitle: "關閉此視窗後將永久隱藏完整明文密鑰",
            warningBody:
              "若遺失必須重新建立並立即輪替。之後平台只保留遮罩後綴，不可還原完整值。",
            secretName: "憑證名稱",
            secretField: "密鑰（僅此一次明文顯示）",
            secretHint: "請現在複製，完整密鑰不會再次回傳。",
            scope: "來源",
            expiresAt: "到期時間",
            createdBy: "建立者",
            createdAt: "建立時間",
            stored: "我已將這組憑證妥善保存於安全位置。",
            cancel: "取消",
            complete: "完成，我已保存此金鑰",
            copyLabel: "複製",
            downloadLabel: "文字檔",
          },
          credentialActionModal: {
            issueTitle: "發行入口憑證",
            rotateTitle: "輪替入口憑證",
            subtitle: "高風險動作 · 必填稽核原因",
            fieldLabel: "輪替原因",
            hint: "請填寫操作原因。此動作會留下稽核記錄，且完整密鑰只會顯示一次。",
            placeholderIssue: "例如：合作夥伴入口首次正式上線",
            placeholderRotate: "例如：金鑰外洩演練後輪替 / 季度例行更新",
            cancel: "取消",
            issueConfirm: "發行憑證",
            rotateConfirm: "輪替憑證",
          },
          governanceActionModal: {
            activateTitle: "啟用合作夥伴入口",
            deactivateTitle: "停用合作夥伴入口",
            revokeTitle: "撤銷合作夥伴入口",
            revokeCredentialTitle: "撤銷入口憑證",
            mediumSubtitle: "中風險動作 · 產出稽核收據",
            highSubtitle: "高風險動作 · 必填稽核原因",
            activateBody: "啟用後，此入口會在就緒條件滿足時承接平台治理流量。",
            deactivateBody: "停用會保留註冊資料，但封鎖新的平台治理流量。",
            revokeBody:
              "入口層級撤銷不可逆，僅適用於合約終止或安全撤出等情境。",
            revokeCredentialBody:
              "撤銷後此憑證不可再用於入口流量。若需要不中斷服務，應先輪替再撤銷。",
            fieldLabel: "稽核原因",
            fieldHint: "請具體說明操作原因。此動作會寫入平台管理端稽核歷史。",
            fieldPlaceholder: "例如：合作終止 / 安全事件調查後撤銷",
            cancel: "取消",
            activateConfirm: "啟用",
            deactivateConfirm: "停用",
            revokeConfirm: "撤銷入口",
            revokeCredentialConfirm: "撤銷憑證",
          },
        };

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
          setPreviewNotice(copy.previewNotice);
          setError(null);
        } else {
          setError(
            formatPlatformUiError(
              locale,
              toPlatformErrorMessage(nextError),
              locale === "en"
                ? "Unable to load partner entry"
                : "無法載入合作夥伴入口",
            ),
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
    [client, copy.previewNotice, entrySlug, locale],
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
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to update partner entry"
            : "無法更新合作夥伴入口",
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [client, editForm, entry, isPreviewMode, loadEntry, locale]);

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
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to issue partner credential"
            : "無法簽發合作夥伴憑證",
        ),
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
    locale,
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
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to update partner governance"
            : "無法更新合作夥伴治理狀態",
        ),
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
    locale,
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
          ["overview", copy.tabs.overview],
          ["branding", copy.tabs.branding],
          ["auth", copy.tabs.auth],
          ["eligibility", copy.tabs.eligibility],
          ["credentials", copy.tabs.credentials],
          ["audit", copy.tabs.audit],
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
    [
      copy.tabs.audit,
      copy.tabs.auth,
      copy.tabs.branding,
      copy.tabs.credentials,
      copy.tabs.eligibility,
      copy.tabs.overview,
    ],
  );

  const activeTabNode =
    tabDefs.find((definition) => definition.key === activeTab)?.node ?? null;

  const formatKnownIdentity = (value?: string | null) => {
    if (!value) {
      return "—";
    }

    if (
      value === "system" ||
      value === "platform-admin" ||
      value === "platform-admin.preview" ||
      value === "platform_admin"
    ) {
      return formatPlatformCodeLabel(locale, value);
    }

    return value;
  };

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
        k: copy.overviewLabels.tenant,
        v:
          locale === "zh"
            ? `${formatPlatformCodeLabel(locale, entry.partnerType)} · 租戶編號 ${entry.tenantId}`
            : `${formatPlatformCodeLabel(locale, entry.partnerType)} · ${entry.tenantId}`,
        mono: true,
      },
      {
        k: copy.overviewLabels.bankCode,
        v: entry.bankCode ?? "—",
        mono: true,
      },
      {
        k: copy.overviewLabels.program,
        v: entry.programId,
      },
      {
        k: copy.overviewLabels.businessSubtype,
        v: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
        mono: true,
      },
      {
        k: copy.overviewLabels.authMode,
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: copy.overviewLabels.eligibility,
        v: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        mono: true,
      },
      {
        k: copy.overviewLabels.entryHost,
        v: entry.entryHost ?? "—",
        mono: true,
      },
      {
        k: copy.overviewLabels.entryPath,
        v: entry.entryPath ?? "—",
        mono: true,
      },
      {
        k: copy.overviewLabels.themeAccent,
        v: entry.themeAccent ?? "—",
        mono: true,
      },
      {
        k: copy.overviewLabels.supportContact,
        v: supportValue,
        mono: true,
      },
    ];
  }, [copy.overviewLabels, entry, locale]);

  const eligibilitySnapshotItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    const contract = entry.eligibilityContract;

    return [
      {
        k: copy.eligibilitySnapshotLabels.contractId,
        v: contract?.contractId ?? "—",
        mono: true,
      },
      {
        k: copy.eligibilitySnapshotLabels.adapter,
        v: contract
          ? locale === "zh"
            ? `${formatPlatformCodeLabel(locale, contract.adapterCode)} · 版本 ${contract.adapterVersion}`
            : `${formatPlatformCodeLabel(locale, contract.adapterCode)} · ${contract.adapterVersion}`
          : "—",
        mono: true,
      },
      {
        k: copy.eligibilitySnapshotLabels.adapterPosture,
        v: contract?.adapterKind
          ? formatPlatformCodeLabel(locale, contract.adapterKind)
          : "—",
      },
      {
        k: copy.eligibilitySnapshotLabels.fallback,
        v: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? copy.opsQueueRequired
          : copy.noTimeoutFallback,
      },
    ];
  }, [
    copy.eligibilitySnapshotLabels,
    copy.noTimeoutFallback,
    copy.opsQueueRequired,
    entry,
    locale,
  ]);

  const auditItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: copy.auditInfoLabels.source,
        v: formatKnownIdentity(entry.auditMetadata.source),
      },
      {
        k: copy.auditInfoLabels.requestId,
        v: entry.auditMetadata.requestId ?? "—",
        mono: true,
      },
      {
        k: copy.auditInfoLabels.createdBy,
        v: formatKnownIdentity(entry.auditMetadata.createdBy),
      },
      {
        k: copy.auditInfoLabels.createdAt,
        v: formatDateTime(entry.createdAt),
        mono: true,
      },
      {
        k: copy.auditInfoLabels.updatedBy,
        v: formatKnownIdentity(entry.auditMetadata.updatedBy),
      },
      {
        k: copy.auditInfoLabels.updatedAt,
        v: formatDateTime(entry.updatedAt),
        mono: true,
      },
      {
        k: copy.auditInfoLabels.revokedAt,
        v: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        mono: true,
      },
      {
        k: copy.auditInfoLabels.revokeReason,
        v: entry.revokeReason ?? "—",
      },
    ];
  }, [copy.auditInfoLabels, entry]);

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
          kind: formatPlatformCodeLabel(locale, credential.source),
          masked: `${credential.keyPrefix}${credential.maskedSuffix}`,
          rotatedAt: formatDateTime(credential.createdAt),
          lastUsedAt: credential.lastUsedAt
            ? formatDateTime(credential.lastUsedAt)
            : "—",
          status: credential.revokedAt ? "revoked" : "active",
        })),
    [credentials, locale],
  );

  const credentialColumns = useMemo<CanvasTableColumn<CredentialRow>[]>(
    () => [
      {
        h: copy.credentialTable.kind,
        k: "kind",
        mono: true,
        w: 160,
      },
      {
        h: copy.credentialTable.masked,
        k: "masked",
        mono: true,
        w: 170,
      },
      {
        h: copy.credentialTable.rotated,
        k: "rotatedAt",
        mono: true,
        w: 160,
      },
      {
        h: copy.credentialTable.lastUsed,
        k: "lastUsedAt",
        mono: true,
        w: 160,
      },
      {
        h: copy.credentialTable.actions,
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
            {copy.credentialTable.revoke}
          </Btn>
        ),
      },
    ],
    [copy.credentialTable],
  );

  const auditRows = useMemo<AuditRow[]>(() => {
    if (!entry) {
      return [];
    }

    const rows: AuditRow[] = [
      {
        event: formatPlatformCodeLabel(locale, "entry.created"),
        actor: formatKnownIdentity(entry.auditMetadata.createdBy ?? "system"),
        detail: formatKnownIdentity(
          entry.auditMetadata.source ?? "platform-admin",
        ),
        at: formatDateTime(entry.createdAt),
      },
      {
        event: formatPlatformCodeLabel(locale, "entry.updated"),
        actor: formatKnownIdentity(entry.auditMetadata.updatedBy ?? "system"),
        detail: entry.auditMetadata.requestId ?? "—",
        at: formatDateTime(entry.updatedAt),
      },
    ];

    credentials.slice(0, 4).forEach((credential) => {
      rows.push({
        event: formatPlatformCodeLabel(
          locale,
          credential.revokedAt ? "credential.revoked" : "credential.issued",
        ),
        actor: formatKnownIdentity(credential.issuedBy ?? "platform-admin"),
        detail: `${formatPlatformCodeLabel(locale, credential.source)} · ${credential.keyPrefix}${credential.maskedSuffix}`,
        at: formatDateTime(credential.revokedAt ?? credential.createdAt),
      });
    });

    return rows;
  }, [credentials, entry, locale]);

  const auditColumns = useMemo<CanvasTableColumn<AuditRow>[]>(
    () => [
      { h: copy.auditTable.event, k: "event", mono: true, w: 170 },
      { h: copy.auditTable.actor, k: "actor", w: 180 },
      { h: copy.auditTable.detail, k: "detail", mono: true },
      { h: copy.auditTable.at, k: "at", mono: true, w: 170 },
    ],
    [copy.auditTable],
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
          title={copy.notFoundTitle}
          subtitle={copy.notFoundBody}
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
            title={copy.notFoundTitle}
            body={error ?? copy.notFoundBody}
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
          {copy.preview}
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
        {entry.activeFlag ? copy.deactivateEntry : copy.activateEntry}
      </Btn>
      <Btn
        theme={theme}
        variant="secondary"
        onClick={() => {
          setCredentialActionMode("issue");
          setCredentialActionReason("");
        }}
      >
        {copy.issueCredential}
      </Btn>
      <Btn
        theme={theme}
        variant="primary"
        onClick={() => {
          setCredentialActionMode("rotate");
          setCredentialActionReason("");
        }}
      >
        {copy.rotateCredential}
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
        {copy.revokeEntry}
      </Btn>
    </>
  );

  const renderEditableFooter = (
    <div style={saveBarStyle}>
      <div style={mutedTextStyle}>
        {copy.saveHint}
        <br />
        {formatDateTime(entry.updatedAt)}
      </div>
      <Btn
        theme={theme}
        variant="primary"
        disabled={saving || !editForm.displayName.trim()}
        onClick={() => void saveEntry()}
      >
        {saving ? t("common.saving") : copy.save}
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
        subtitle={copy.headerSubtitle(entry)}
        tabs={tabDefs.map((definition) => definition.node)}
        activeTab={activeTabNode}
        actions={headerActions}
      />

      <div style={pageBodyStyle}>
        {previewNotice ? (
          <Banner
            theme={theme}
            tone="info"
            title={copy.previewModeTitle}
            body={previewNotice}
          />
        ) : null}

        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={
              activeTab === "credentials"
                ? copy.issueErrorTitle
                : copy.updateErrorTitle
            }
            body={error}
          />
        ) : null}

        {activeTab === "overview" ? (
          <div style={gridStyle}>
            <Card
              theme={theme}
              title={copy.overviewTitle}
              subtitle={copy.overviewSubtitle}
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
              <Card theme={theme} title={copy.readinessTitle}>
                <div style={{ display: "grid", gap: 10 }}>
                  <Banner
                    theme={theme}
                    tone={readinessComplete ? "success" : "warn"}
                    title={
                      readinessComplete
                        ? copy.readinessReady
                        : copy.readinessBlocked
                    }
                    body={
                      readinessComplete
                        ? copy.readinessReadyBody
                        : copy.readinessBlockedBody
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
                            ? copy.readinessOk(
                                readinessReadyCount,
                                readinessItems.length,
                              )
                            : copy.readinessGap}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card
                theme={theme}
                title={copy.credentialsTitle}
                subtitle={copy.credentialsSubtitle}
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
                    title={copy.credentialsTitle}
                    body={copy.credentialsEmpty}
                  />
                )}
              </Card>

              <Card
                theme={theme}
                title={copy.governanceActionsTitle}
                subtitle={copy.governanceActionsSubtitle}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: copy.governanceStatusLabel,
                        v: formatPlatformCodeLabel(locale, entry.status),
                      },
                      {
                        k: copy.governanceTrafficLabel,
                        v: entry.activeFlag
                          ? copy.governanceTrafficReady
                          : copy.governanceTrafficBlocked,
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
                        ? copy.deactivateEntry
                        : copy.activateEntry}
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
                      {copy.revokeEntry}
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
              title={copy.brandingTitle}
              subtitle={copy.brandingSubtitle}
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
                  placeholder={t("partners.form.entryHostPlaceholder")}
                  mono
                />
                <TextField
                  label={t("partners.form.entryPath")}
                  value={editForm.entryPath}
                  onChange={(value) => updateFormField("entryPath", value)}
                  placeholder={t("partners.form.entryPathPlaceholder")}
                  mono
                  hint={
                    previewUrl ? `${copy.routeHint}: ${previewUrl}` : undefined
                  }
                />
                <TextField
                  label={t("partners.form.themeAccent")}
                  value={editForm.themeAccent}
                  onChange={(value) => updateFormField("themeAccent", value)}
                  placeholder={t("partners.form.themeAccentPlaceholder")}
                  mono
                  hint={copy.accentHint}
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
              title={copy.authTitle}
              subtitle={copy.authSubtitle}
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
                  title={copy.authBannerTitle}
                  body={
                    entry.authMode === "partner_api_key"
                      ? activeCredentialCount > 0
                        ? copy.authBannerBodyWithCredentials(
                            activeCredentialCount,
                          )
                        : copy.authBannerBodyMissing
                      : copy.authBannerBodyNotRequired
                  }
                />
                <Card
                  theme={theme}
                  title={copy.webhookLinkageTitle}
                  subtitle={copy.webhookLinkageSubtitle}
                >
                  <div style={linkCardStyle}>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {copy.requestLineage}
                        </div>
                        <div style={monoValueStyle}>
                          {entry.auditMetadata.requestId ?? "—"}
                        </div>
                      </div>
                      <Pill
                        theme={theme}
                        tone={entry.auditMetadata.source ? "success" : "warn"}
                      >
                        {entry.auditMetadata.source ? copy.bound : copy.gap}
                      </Pill>
                    </div>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {copy.auditSource}
                        </div>
                        <div style={monoValueStyle}>
                          {formatKnownIdentity(entry.auditMetadata.source)}
                        </div>
                      </div>
                      <Pill theme={theme} tone="info">
                        {copy.platformOwned}
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
              title={copy.eligibilityTitle}
              subtitle={copy.eligibilitySubtitle}
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
                  title={copy.eligibilityBannerTitle}
                  body={
                    entry.eligibilityMode === "none"
                      ? copy.noEligibilityVerificationBody
                      : entry.eligibilityContract?.contractId
                        ? copy.eligibilityLinkedBody
                        : copy.contractEmpty
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
              title={copy.adapterLinkageTitle}
              subtitle={copy.adapterLinkageSubtitle}
            >
              <div style={linkCardStyle}>
                <div style={linkRowStyle}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {copy.linkedAdapter}
                    </div>
                    <div style={monoValueStyle}>
                      {entry.eligibilityContract
                        ? locale === "zh"
                          ? `${formatPlatformCodeLabel(locale, entry.eligibilityContract.adapterCode)} · 版本 ${entry.eligibilityContract.adapterVersion}`
                          : `${formatPlatformCodeLabel(locale, entry.eligibilityContract.adapterCode)} · ${entry.eligibilityContract.adapterVersion}`
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
                      {copy.manualFallback}
                    </div>
                    <div style={monoValueStyle}>
                      {entry.eligibilityContract?.manualFallbackPolicy
                        ?.requiredOnTimeout
                        ? copy.opsQueueRequired
                        : copy.noTimeoutFallback}
                    </div>
                  </div>
                  <Pill
                    theme={theme}
                    tone={
                      entry.eligibilityContract?.contractId ? "accent" : "warn"
                    }
                  >
                    {entry.eligibilityContract?.contractId
                      ? copy.snapshotLinked
                      : copy.missingSnapshot}
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
              title={copy.credentialsTitle}
              subtitle={copy.credentialsSubtitle}
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
                    {copy.issueCredential}
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
                    {copy.rotateCredential}
                  </Btn>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 12 }}>
                <Banner
                  theme={theme}
                  tone={activeCredentialCount > 0 ? "success" : "warn"}
                  title={copy.credentialsBannerTitle(
                    readinessReadyCount,
                    readinessItems.length,
                  )}
                  body={
                    activeCredentialCount > 0
                      ? copy.credentialsBannerBody(activeCredentialCount)
                      : copy.credentialsEmpty
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
                    title={copy.credentialsTitle}
                    body={copy.credentialsEmpty}
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
              title={copy.auditTitle}
              subtitle={copy.auditSubtitle}
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
                    title={copy.entryRevokedTitle}
                    body={entry.revokeReason ?? copy.entryRevokedBody}
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
          copy={copy.credentialActionModal}
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
          copy={copy.governanceActionModal}
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
          locale={locale}
          copy={copy.secretModal}
        />
      ) : null}
    </div>
  );
}
