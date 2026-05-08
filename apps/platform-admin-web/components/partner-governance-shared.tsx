"use client";

import React from "react";
import type {
  BusinessDispatchSubtype,
  CreatePartnerChannelEntryCommand,
  PartnerChannelEntryRecord,
  PartnerEntryAuthMode,
  PartnerEntryStatus,
  PartnerEligibilityMode,
  UpdatePartnerChannelEntryCommand,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ENTRY_STATUSES,
  PARTNER_ELIGIBILITY_MODES,
} from "@drts/contracts";
import {
  formGridStyle,
  formInputStyle,
  formLabelStyle,
  formSectionTitleStyle,
} from "@/components/governance-form-styles";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export type EntryFormState = {
  tenantId: string;
  partnerCode: string;
  partnerType: string;
  programId: string;
  programCode: string;
  bankCode: string;
  entrySlug: string;
  displayName: string;
  businessDispatchSubtype: BusinessDispatchSubtype;
  authMode: PartnerEntryAuthMode;
  eligibilityMode: PartnerEligibilityMode;
  entryHost: string;
  entryPath: string;
  themeAccent: string;
  supportEmail: string;
  supportPhone: string;
  status: PartnerEntryStatus;
};

export const EMPTY_ENTRY_FORM: EntryFormState = {
  tenantId: "tenant-demo-001",
  partnerCode: "",
  partnerType: "bank_partner",
  programId: "",
  programCode: "",
  bankCode: "",
  entrySlug: "",
  displayName: "",
  businessDispatchSubtype: "credit_card_airport_transfer",
  authMode: "partner_api_key",
  eligibilityMode: "bank_card_inline",
  entryHost: "",
  entryPath: "",
  themeAccent: "#0b7285",
  supportEmail: "",
  supportPhone: "",
  status: "active",
};

export function toPartnerFormState(
  entry: PartnerChannelEntryRecord,
): EntryFormState {
  return {
    tenantId: entry.tenantId,
    partnerCode: entry.partnerCode,
    partnerType: entry.partnerType,
    programId: entry.programId,
    programCode: entry.programCode ?? "",
    bankCode: entry.bankCode ?? "",
    entrySlug: entry.entrySlug,
    displayName: entry.displayName,
    businessDispatchSubtype: entry.businessDispatchSubtype,
    authMode: entry.authMode,
    eligibilityMode: entry.eligibilityMode,
    entryHost: entry.entryHost ?? "",
    entryPath: entry.entryPath ?? "",
    themeAccent: entry.themeAccent ?? "",
    supportEmail: entry.brandingMetadata?.supportEmail ?? "",
    supportPhone: entry.brandingMetadata?.supportPhone ?? "",
    status: entry.status,
  };
}

export function toPartnerCreateCommand(
  form: EntryFormState,
): CreatePartnerChannelEntryCommand {
  return {
    tenantId: form.tenantId.trim(),
    partnerCode: form.partnerCode.trim(),
    partnerType: form.partnerType.trim(),
    programId: form.programId.trim(),
    programCode: form.programCode.trim() || null,
    bankCode: form.bankCode.trim() || null,
    entrySlug: form.entrySlug.trim(),
    displayName: form.displayName.trim(),
    businessDispatchSubtype: form.businessDispatchSubtype,
    authMode: form.authMode,
    eligibilityMode: form.eligibilityMode,
    entryHost: form.entryHost.trim() || null,
    entryPath: form.entryPath.trim() || null,
    themeAccent: form.themeAccent.trim() || null,
    brandingMetadata: {
      displayName: form.displayName.trim(),
      themeAccent: form.themeAccent.trim() || null,
      supportEmail: form.supportEmail.trim() || null,
      supportPhone: form.supportPhone.trim() || null,
    },
    status: form.status,
  };
}

export function toPartnerUpdateCommand(
  form: EntryFormState,
): UpdatePartnerChannelEntryCommand {
  const createCommand = toPartnerCreateCommand(form);
  const updateCommand: UpdatePartnerChannelEntryCommand = {
    tenantId: createCommand.tenantId,
    partnerCode: createCommand.partnerCode,
    partnerType: createCommand.partnerType,
    programId: createCommand.programId,
    displayName: createCommand.displayName,
    businessDispatchSubtype: createCommand.businessDispatchSubtype,
    authMode: createCommand.authMode,
    eligibilityMode: createCommand.eligibilityMode,
    status: createCommand.status ?? "active",
  };

  if (createCommand.brandingMetadata !== undefined) {
    updateCommand.brandingMetadata = createCommand.brandingMetadata;
  }
  if (createCommand.programCode !== undefined) {
    updateCommand.programCode = createCommand.programCode;
  }
  if (createCommand.bankCode !== undefined) {
    updateCommand.bankCode = createCommand.bankCode;
  }
  if (createCommand.entryHost !== undefined) {
    updateCommand.entryHost = createCommand.entryHost;
  }
  if (createCommand.entryPath !== undefined) {
    updateCommand.entryPath = createCommand.entryPath;
  }
  if (createCommand.themeAccent !== undefined) {
    updateCommand.themeAccent = createCommand.themeAccent;
  }

  return updateCommand;
}

export function isPartnerReady(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function partnerHasReadinessGaps(entry: PartnerChannelEntryRecord) {
  return !(
    isPartnerReady(entry.auditMetadata.source) &&
    isPartnerReady(entry.displayName) &&
    isPartnerReady(entry.themeAccent) &&
    isPartnerReady(entry.brandingMetadata?.supportEmail) &&
    isPartnerReady(entry.entryHost) &&
    isPartnerReady(entry.entryPath)
  );
}

export function partnerStatusTone(
  status: PartnerEntryStatus,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

export function buildPartnerReadinessItems(
  entry: PartnerChannelEntryRecord,
  t: TFn,
) {
  return [
    {
      label: t("partners.readiness.audit"),
      ready: isPartnerReady(entry.auditMetadata.source),
      value: entry.auditMetadata.source ?? "—",
    },
    {
      label: t("partners.readiness.auth"),
      ready: true,
      value: entry.authMode,
    },
    {
      label: t("partners.readiness.eligibility"),
      ready: true,
      value: entry.eligibilityMode,
    },
    {
      label: t("partners.readiness.branding"),
      ready:
        isPartnerReady(entry.displayName) && isPartnerReady(entry.themeAccent),
      value: entry.brandingMetadata?.displayName ?? entry.displayName,
    },
    {
      label: t("partners.readiness.support"),
      ready: isPartnerReady(entry.brandingMetadata?.supportEmail),
      value: entry.brandingMetadata?.supportEmail ?? "—",
    },
    {
      label: t("partners.readiness.hosting"),
      ready: isPartnerReady(entry.entryHost) && isPartnerReady(entry.entryPath),
      value:
        entry.entryHost && entry.entryPath
          ? `${entry.entryHost}${entry.entryPath}`
          : (entry.entryHost ?? entry.entryPath ?? "—"),
    },
  ];
}

export function EntryForm({
  form,
  setForm,
  t,
  lockSlug = false,
}: {
  form: EntryFormState;
  setForm: React.Dispatch<React.SetStateAction<EntryFormState>>;
  t: TFn;
  lockSlug?: boolean;
}) {
  return (
    <>
      <h4 style={formSectionTitleStyle}>{t("partners.section.routing")}</h4>
      <div style={{ ...formGridStyle, marginBottom: 16 }}>
        <TextField
          label={t("partners.form.tenantId")}
          value={form.tenantId}
          onChange={(value) =>
            setForm((current) => ({ ...current, tenantId: value }))
          }
        />
        <TextField
          label={t("partners.form.partnerCode")}
          value={form.partnerCode}
          onChange={(value) =>
            setForm((current) => ({ ...current, partnerCode: value }))
          }
        />
        <TextField
          label={t("partners.form.partnerType")}
          value={form.partnerType}
          onChange={(value) =>
            setForm((current) => ({ ...current, partnerType: value }))
          }
        />
        <TextField
          label={t("partners.form.programId")}
          value={form.programId}
          onChange={(value) =>
            setForm((current) => ({ ...current, programId: value }))
          }
        />
        <TextField
          label={t("partners.form.programCode")}
          value={form.programCode}
          onChange={(value) =>
            setForm((current) => ({ ...current, programCode: value }))
          }
        />
        <TextField
          label={t("partners.form.bankCode")}
          value={form.bankCode}
          onChange={(value) =>
            setForm((current) => ({ ...current, bankCode: value }))
          }
        />
        <TextField
          label={t("partners.form.entrySlug")}
          value={form.entrySlug}
          onChange={(value) =>
            setForm((current) => ({ ...current, entrySlug: value }))
          }
          disabled={lockSlug}
        />
        <TextField
          label={t("partners.form.displayName")}
          value={form.displayName}
          onChange={(value) =>
            setForm((current) => ({ ...current, displayName: value }))
          }
        />
        <SelectField
          label={t("partners.form.dispatchSubtype")}
          value={form.businessDispatchSubtype}
          options={BUSINESS_DISPATCH_SUBTYPES}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              businessDispatchSubtype: value as BusinessDispatchSubtype,
            }))
          }
        />
        <SelectField
          label={t("partners.form.authMode")}
          value={form.authMode}
          options={PARTNER_ENTRY_AUTH_MODES}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              authMode: value as PartnerEntryAuthMode,
            }))
          }
        />
        <SelectField
          label={t("partners.form.eligibilityMode")}
          value={form.eligibilityMode}
          options={PARTNER_ELIGIBILITY_MODES}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              eligibilityMode: value as PartnerEligibilityMode,
            }))
          }
        />
        <SelectField
          label={t("partners.form.status")}
          value={form.status}
          options={PARTNER_ENTRY_STATUSES.filter(
            (status) => status !== "revoked",
          )}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              status: value as PartnerEntryStatus,
            }))
          }
        />
      </div>

      <h4 style={formSectionTitleStyle}>{t("partners.section.branding")}</h4>
      <div style={{ ...formGridStyle, marginBottom: 16 }}>
        <TextField
          label={t("partners.form.entryHost")}
          value={form.entryHost}
          onChange={(value) =>
            setForm((current) => ({ ...current, entryHost: value }))
          }
          placeholder="partner.example"
        />
        <TextField
          label={t("partners.form.entryPath")}
          value={form.entryPath}
          onChange={(value) =>
            setForm((current) => ({ ...current, entryPath: value }))
          }
          placeholder="/partner/bank-demo-alpha-airport"
        />
        <TextField
          label={t("partners.form.themeAccent")}
          value={form.themeAccent}
          onChange={(value) =>
            setForm((current) => ({ ...current, themeAccent: value }))
          }
          placeholder="#0b7285"
        />
        <TextField
          label={t("partners.form.supportEmail")}
          value={form.supportEmail}
          onChange={(value) =>
            setForm((current) => ({ ...current, supportEmail: value }))
          }
        />
        <TextField
          label={t("partners.form.supportPhone")}
          value={form.supportPhone}
          onChange={(value) =>
            setForm((current) => ({ ...current, supportPhone: value }))
          }
        />
      </div>
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <div style={formLabelStyle}>{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={formInputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <div style={formLabelStyle}>{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={formInputStyle}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
