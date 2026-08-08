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
            Close
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
  copy,
}: {
  entry: PartnerChannelEntryRecord;
  issuedCredential: PartnerIngressCredentialIssued;
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
  copy: {
    title: string;
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
      subtitle="PLAINTEXT-ONCE · Q-ADM07"
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
          { k: copy.scope, v: credential.source, mono: true },
          {
            k: copy.expiresAt,
            v: "—",
            mono: true,
          },
          { k: copy.createdBy, v: credential.issuedBy ?? "platform-admin" },
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
          tabs: {
            overview: "Overview",
            branding: "Branding",
            auth: "Auth",
            eligibility: "Eligibility",
            credentials: "Credentials",
            audit: "Audit",
          },
          preview: "Preview entry",
          issueCredential: "Issue credential",
          rotateCredential: "Rotate credential",
          save: "Save changes",
          saveHint:
            "Apply branding, routing, auth, and eligibility changes without moving away from the platform-governed entry model.",
          overviewTitle: "Entry basics",
          overviewSubtitle:
            "Platform-owned routing, identity, and launch posture for the selected partner entry.",
          readinessTitle: "Readiness · masked governance gates",
          readinessReady: "Ready to promote",
          readinessBlocked: "Readiness gaps remain",
          readinessReadyBody:
            "All required gates are green. Promotion can proceed without hiding governance controls.",
          readinessBlockedBody:
            "Keep traffic blocked until branding, contract, audit, and credential gaps are resolved.",
          credentialsTitle: "Active credentials · masked only",
          credentialsSubtitle:
            "Plaintext values are only shown once at issue time. The roster below remains masked.",
          credentialsEmpty:
            "No active ingress credentials are available for this entry yet.",
          brandingTitle: "Branding",
          brandingSubtitle:
            "Partner-facing title, route, accent, and support metadata.",
          authTitle: "Auth",
          authSubtitle:
            "Authority stays on the platform side even when partner-specific credentials are used.",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "Contract snapshot, adapter posture, and fallback behavior for this entry.",
          auditTitle: "Audit",
          auditSubtitle:
            "Creation, updates, credential events, and request lineage for platform review.",
          routeHint: "Public route preview",
          accentHint: "Brand accent delivered to the partner skin",
          contractEmpty:
            "No eligibility contract snapshot is currently linked to this entry.",
          authBannerTitle: "Credential posture",
          eligibilityBannerTitle: "Contract posture",
          secretModal: {
            title: "Ingress credential generated · only shown once",
            warningTitle:
              "Closing this window permanently hides the full secret",
            warningBody:
              "If the secret is lost, create a new credential and rotate immediately. Only the masked suffix is retained afterward.",
            secretName: "Credential name",
            secretField: "Secret · plaintext once",
            secretHint:
              "Copy the value now. The full secret will not be returned again.",
            scope: "SOURCE",
            expiresAt: "EXPIRES AT",
            createdBy: "CREATED BY",
            createdAt: "CREATED AT",
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
          notFoundTitle: "Partner entry 目前不可用",
          notFoundBody: "找不到指定的 partner entry。",
          updateErrorTitle: "Partner entry 更新失敗",
          issueErrorTitle: "Credential 發行失敗",
          tabs: {
            overview: "Overview",
            branding: "Branding",
            auth: "Auth",
            eligibility: "Eligibility",
            credentials: "Credentials",
            audit: "Audit",
          },
          preview: "預覽 entry",
          issueCredential: "發行 credential",
          rotateCredential: "輪替 credential",
          save: "儲存變更",
          saveHint:
            "在不脫離平台治理模型的前提下，更新此 entry 的 branding、routing、auth 與 eligibility 設定。",
          overviewTitle: "Entry 基本資料",
          overviewSubtitle:
            "集中檢視此 partner entry 的平台 routing、識別與上線姿態。",
          readinessTitle: "Readiness · masked governance gates",
          readinessReady: "可推進上線",
          readinessBlocked: "仍有 readiness 缺口",
          readinessReadyBody:
            "必要 gate 已全部轉綠，可在不模糊治理邊界下推進 promotion。",
          readinessBlockedBody:
            "在 branding、contract、audit 與 credential 缺口補齊前，不應直接導流。",
          credentialsTitle: "Active credentials · masked only",
          credentialsSubtitle:
            "完整 plaintext secret 只在發行當下顯示一次；下方清單只保留遮罩資訊。",
          credentialsEmpty: "此 entry 目前沒有可用的 ingress credential。",
          brandingTitle: "Branding",
          brandingSubtitle:
            "partner-facing 顯示名稱、入口路由、色彩與支援資訊。",
          authTitle: "Auth",
          authSubtitle:
            "即使使用 partner 專屬 credential，驗證權限仍保留在平台側。",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "檢視此 entry 的 contract snapshot、adapter posture 與 fallback policy。",
          auditTitle: "Audit",
          auditSubtitle:
            "平台稽核需要完整保留建立、更新、credential 事件與 request lineage。",
          routeHint: "公開入口預覽",
          accentHint: "套用到 partner skin 的品牌 accent",
          contractEmpty: "此 entry 尚未綁定 eligibility contract snapshot。",
          authBannerTitle: "Credential posture",
          eligibilityBannerTitle: "Contract posture",
          secretModal: {
            title: "Ingress credential 已產生 · only shown once",
            warningTitle: "關閉此視窗後將永久隱藏完整 secret",
            warningBody:
              "若遺失必須重新建立並立即輪替。之後平台只保留遮罩後綴，不可還原完整值。",
            secretName: "Credential 名稱",
            secretField: "Secret · plaintext once",
            secretHint: "請現在複製。完整 secret 不會再被回傳。",
            scope: "SOURCE",
            expiresAt: "EXPIRES AT",
            createdBy: "建立者",
            createdAt: "建立時間",
            stored: "我已將這組 credential 妥善保存於安全位置。",
            cancel: "取消",
            complete: "完成 · 我已保存此 key",
            copyLabel: "複製",
            downloadLabel: ".txt",
          },
          credentialActionModal: {
            issueTitle: "發行 ingress credential",
            rotateTitle: "輪替 ingress credential",
            subtitle: "HIGH-RISK ACTION · 必填 audit reason",
            fieldLabel: "輪替原因",
            hint: "請填寫操作原因。此動作會留下 audit 記錄，且完整 secret 只會顯示一次。",
            placeholderIssue:
              "例如：CTBC World Elite entry 首次 production 上線",
            placeholderRotate: "例如：金鑰外洩演練後輪替 / 季度例行更新",
            cancel: "取消",
            issueConfirm: "發行 credential",
            rotateConfirm: "輪替 credential",
          },
          governanceActionModal: {
            activateTitle: "啟用 partner entry",
            deactivateTitle: "停用 partner entry",
            revokeTitle: "撤銷 partner entry",
            revokeCredentialTitle: "撤銷 ingress credential",
            mediumSubtitle: "MEDIUM-RISK ACTION · 產出 audit receipt",
            highSubtitle: "HIGH-RISK ACTION · 必填 audit reason",
            activateBody:
              "啟用後，此 entry 會在 readiness 條件滿足時可承接平台治理流量。",
            deactivateBody:
              "停用會保留 registry 紀錄，但封鎖新的平台治理流量。",
            revokeBody:
              "entry 層級撤銷不可逆，僅適用於合約終止或安全撤出等情境。",
            revokeCredentialBody:
              "撤銷後此 credential 不可再用於 ingress。若需要不中斷流量，應先輪替再撤銷。",
            fieldLabel: "Audit 原因",
            fieldHint:
              "請具體說明操作原因。此動作會寫入 Platform Admin audit 歷史。",
            fieldPlaceholder: "例如：合作終止 / 安全事件調查後撤銷",
            cancel: "取消",
            activateConfirm: "啟用",
            deactivateConfirm: "停用",
            revokeConfirm: "撤銷 entry",
            revokeCredentialConfirm: "撤銷 credential",
          },
        };

  const loadEntry = useCallback(
    async (options?: { preserveIssuedCredential?: boolean }) => {
      if (!entrySlug) {
        setEntry(null);
        setEditForm(EMPTY_ENTRY_FORM);
        setCredentials([]);
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
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
        setEntry(null);
        setEditForm(EMPTY_ENTRY_FORM);
        setCredentials([]);
      } finally {
        setLoading(false);
      }
    },
    [client, entrySlug],
  );

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const saveEntry = useCallback(async () => {
    if (!entry) {
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
  }, [client, editForm, entry, loadEntry]);

  const issueCredential = useCallback(async () => {
    if (!entry || !credentialActionMode) {
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
    entry,
    loadEntry,
  ]);

  const runGovernanceAction = useCallback(async () => {
    if (!entry) {
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
        k: "TENANT",
        v: `${entry.partnerType} · ${entry.tenantId}`,
        mono: true,
      },
      {
        k: "BANK CODE",
        v: entry.bankCode ?? "—",
        mono: true,
      },
      {
        k: "PROGRAM",
        v: entry.programId,
      },
      {
        k: "BUSINESS SUBTYPE",
        v: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
        mono: true,
      },
      {
        k: "AUTH MODE",
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: "ELIGIBILITY",
        v: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        mono: true,
      },
      {
        k: "ENTRY HOST",
        v: entry.entryHost ?? "—",
        mono: true,
      },
      {
        k: "ENTRY PATH",
        v: entry.entryPath ?? "—",
        mono: true,
      },
      {
        k: "THEME ACCENT",
        v: entry.themeAccent ?? "—",
        mono: true,
      },
      {
        k: "SUPPORT CONTACT",
        v: supportValue,
        mono: true,
      },
    ];
  }, [entry, locale]);

  const eligibilitySnapshotItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    const contract = entry.eligibilityContract;

    return [
      {
        k: t("partnerDetail.eligibility.contractId"),
        v: contract?.contractId ?? "—",
        mono: true,
      },
      {
        k: t("partnerDetail.eligibility.adapter"),
        v: contract
          ? `${contract.adapterCode} · ${contract.adapterVersion}`
          : "—",
        mono: true,
      },
      {
        k: t("partnerDetail.eligibility.adapterPosture"),
        v: contract?.adapterKind ?? "—",
      },
      {
        k: t("partnerDetail.eligibility.fallback"),
        v: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? t("partnerDetail.eligibility.opsQueueRequired")
          : t("partnerDetail.eligibility.noTimeoutFallback"),
      },
    ];
  }, [entry, t]);

  const auditItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: t("partnerDetail.audit.source"),
        v: entry.auditMetadata.source ?? "—",
      },
      {
        k: t("partnerDetail.audit.requestId"),
        v: entry.auditMetadata.requestId ?? "—",
        mono: true,
      },
      {
        k: t("partnerDetail.audit.createdBy"),
        v: entry.auditMetadata.createdBy ?? "—",
      },
      {
        k: t("partnerDetail.audit.createdAt"),
        v: formatDateTime(entry.createdAt),
        mono: true,
      },
      {
        k: t("partnerDetail.audit.updatedBy"),
        v: entry.auditMetadata.updatedBy ?? "—",
      },
      {
        k: t("partnerDetail.audit.updatedAt"),
        v: formatDateTime(entry.updatedAt),
        mono: true,
      },
      {
        k: t("partnerDetail.audit.revokedAt"),
        v: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        mono: true,
      },
      {
        k: t("partnerDetail.audit.revokeReason"),
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
        h: "kind",
        k: "kind",
        mono: true,
        w: 160,
      },
      {
        h: "masked",
        k: "masked",
        mono: true,
        w: 170,
      },
      {
        h: "rotated",
        k: "rotatedAt",
        mono: true,
        w: 160,
      },
      {
        h: "last_used",
        k: "lastUsedAt",
        mono: true,
        w: 160,
      },
      {
        h: "actions",
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
            Revoke
          </Btn>
        ),
      },
    ],
    [],
  );

  const auditRows = useMemo<AuditRow[]>(() => {
    if (!entry) {
      return [];
    }

    const rows: AuditRow[] = [
      {
        event: locale === "en" ? "entry.created" : "entry.created",
        actor: entry.auditMetadata.createdBy ?? "system",
        detail: entry.auditMetadata.source ?? "platform-admin",
        at: formatDateTime(entry.createdAt),
      },
      {
        event: locale === "en" ? "entry.updated" : "entry.updated",
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
      { h: "EVENT", k: "event", mono: true, w: 170 },
      { h: "ACTOR", k: "actor", w: 180 },
      { h: "DETAIL", k: "detail", mono: true },
      { h: "AT", k: "at", mono: true, w: 170 },
    ],
    [],
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
        {entry.activeFlag
          ? t("partnerDetail.action.deactivateEntry")
          : t("partnerDetail.action.activateEntry")}
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
        {t("partnerDetail.action.revokeEntry")}
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
        subtitle={`/${entry.entrySlug} · partner_id ${entry.partnerId}`}
        tabs={tabDefs.map((definition) => definition.node)}
        activeTab={activeTabNode}
        actions={headerActions}
      />

      <div style={pageBodyStyle}>
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
                            ? `OK ${readinessReadyCount}/${readinessItems.length}`
                            : "GAP"}
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
                title={t("partnerDetail.governance.title")}
                subtitle={t("partnerDetail.governance.subtitle")}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("partnerDetail.governance.status"),
                        v: formatPlatformCodeLabel(locale, entry.status),
                      },
                      {
                        k: t("partnerDetail.governance.trafficPosture"),
                        v: entry.activeFlag
                          ? t("partnerDetail.governance.trafficAccept")
                          : t("partnerDetail.governance.trafficBlocked"),
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
                        ? t("partnerDetail.governance.deactivate")
                        : t("partnerDetail.governance.activate")}
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
                      {t("partnerDetail.action.revokeEntry")}
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
                    previewUrl ? `${copy.routeHint}: ${previewUrl}` : undefined
                  }
                />
                <TextField
                  label={t("partners.form.themeAccent")}
                  value={editForm.themeAccent}
                  onChange={(value) => updateFormField("themeAccent", value)}
                  placeholder="#0b7285"
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
                        ? `${activeCredentialCount} credential(s) currently gate ingress traffic.`
                        : "Partner API key mode is active, but there is no usable ingress credential."
                      : "This entry does not require partner-managed ingress credentials."
                  }
                />
                <Card
                  theme={theme}
                  title={t("partnerDetail.auth.webhookLinkage")}
                  subtitle={t("partnerDetail.auth.webhookSubtitle")}
                >
                  <div style={linkCardStyle}>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("partnerDetail.auth.requestLineage")}
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
                          ? t("partnerDetail.auth.bound")
                          : t("partnerDetail.auth.gap")}
                      </Pill>
                    </div>
                    <div style={linkRowStyle}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("partnerDetail.audit.source")}
                        </div>
                        <div style={monoValueStyle}>
                          {entry.auditMetadata.source ?? "—"}
                        </div>
                      </div>
                      <Pill theme={theme} tone="info">
                        {t("partnerDetail.auth.platformOwned")}
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
                      ? t("partnerDetail.eligibility.noVerification")
                      : entry.eligibilityContract?.contractId
                        ? t("partnerDetail.eligibility.platformGoverned")
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
              title={t("partnerDetail.adapter.linkage")}
              subtitle={t("partnerDetail.adapter.subtitle")}
            >
              <div style={linkCardStyle}>
                <div style={linkRowStyle}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {t("partnerDetail.adapter.linkedAdapter")}
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
                      {t("partnerDetail.adapter.manualFallback")}
                    </div>
                    <div style={monoValueStyle}>
                      {entry.eligibilityContract?.manualFallbackPolicy
                        ?.requiredOnTimeout
                        ? t("partnerDetail.adapter.opsConsoleRequired")
                        : t("partnerDetail.adapter.noTimeoutFallback")}
                    </div>
                  </div>
                  <Pill
                    theme={theme}
                    tone={
                      entry.eligibilityContract?.contractId ? "accent" : "warn"
                    }
                  >
                    {entry.eligibilityContract?.contractId
                      ? t("partnerDetail.adapter.snapshotLinked")
                      : t("partnerDetail.adapter.snapshotMissing")}
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
                  title={`${readinessReadyCount}/${readinessItems.length} governance gates ready`}
                  body={
                    activeCredentialCount > 0
                      ? `${activeCredentialCount} active credential(s) remain masked in the table below.`
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
                    title={t("partnerDetail.audit.entryRevoked")}
                    body={
                      entry.revokeReason ??
                      t("partnerDetail.audit.entryRevokedBody")
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
          copy={copy.secretModal}
        />
      ) : null}
    </div>
  );
}
