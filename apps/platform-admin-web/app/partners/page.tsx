"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  BusinessDispatchSubtype,
  CreatePartnerChannelEntryCommand,
  PartnerChannelEntryRecord,
  PartnerEntryAuthMode,
  PartnerEntryStatus,
  PartnerEligibilityMode,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
  UpdatePartnerChannelEntryCommand,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ELIGIBILITY_MODES,
  PARTNER_ENTRY_STATUSES,
} from "@drts/contracts";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type EntryFormState = {
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

const EMPTY_FORM: EntryFormState = {
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

function toFormState(entry: PartnerChannelEntryRecord): EntryFormState {
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

function toCreateCommand(
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

function toUpdateCommand(
  form: EntryFormState,
): UpdatePartnerChannelEntryCommand {
  const createCommand = toCreateCommand(form);
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

function isReady(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function readinessItems(entry: PartnerChannelEntryRecord, t: TFn) {
  return [
    {
      label: t("partners.readiness.audit"),
      ready: isReady(entry.auditMetadata.source),
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
      ready: isReady(entry.displayName) && isReady(entry.themeAccent),
      value: entry.brandingMetadata?.displayName ?? entry.displayName,
    },
    {
      label: t("partners.readiness.support"),
      ready:
        isReady(entry.brandingMetadata?.supportEmail) ||
        isReady(entry.brandingMetadata?.supportPhone),
      value:
        entry.brandingMetadata?.supportEmail ??
        entry.brandingMetadata?.supportPhone ??
        "—",
    },
    {
      label: t("partners.readiness.hosting"),
      ready: isReady(entry.entryPath) || isReady(entry.entryHost),
      value: entry.entryHost ?? entry.entryPath ?? "—",
    },
  ];
}

function badgeTone(status: string) {
  if (status === "active" || status === "eligible" || status === "ready") {
    return "admin-badge--success";
  }
  if (
    status === "inactive" ||
    status === "revoked" ||
    status === "ineligible" ||
    status === "missing"
  ) {
    return "admin-badge--danger";
  }
  return "admin-badge--info";
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EntryFormState>(EMPTY_FORM);
  const [selectedEntrySlug, setSelectedEntrySlug] = useState<string | null>(
    null,
  );
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<
    PartnerIngressCredentialRecord[]
  >([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [issuingCredential, setIssuingCredential] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] = useState<
    string | null
  >(null);
  const [issuedCredential, setIssuedCredential] =
    useState<PartnerIngressCredentialIssued | null>(null);

  const selectedEntry = useMemo(
    () =>
      entries.find((entry) => entry.entrySlug === selectedEntrySlug) ?? null,
    [entries, selectedEntrySlug],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformPartnerEntries();
      setEntries(result ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!selectedEntry) {
      setCredentials([]);
      setIssuedCredential(null);
      return;
    }
    setEditForm(toFormState(selectedEntry));
  }, [selectedEntry]);

  const loadCredentials = useCallback(
    async (entrySlug: string) => {
      setCredentialsLoading(true);
      try {
        const result =
          await client.listPlatformPartnerIngressCredentials(entrySlug);
        setCredentials(result ?? []);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setCredentialsLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!selectedEntrySlug) {
      return;
    }
    void loadCredentials(selectedEntrySlug);
  }, [loadCredentials, selectedEntrySlug]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformPartnerEntry(toCreateCommand(createForm));
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await loadEntries();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEntry) return;
    setSaving(true);
    setError(null);
    try {
      await client.updatePlatformPartnerEntry(
        selectedEntry.entrySlug,
        toUpdateCommand(editForm),
      );
      await loadEntries();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const setEntryStatus = useCallback(
    async (
      entrySlug: string,
      nextStatus: "active" | "inactive" | "revoked",
    ) => {
      setChangingStatus(entrySlug);
      setError(null);
      try {
        if (nextStatus === "active") {
          await client.activatePlatformPartnerEntry(entrySlug);
        } else if (nextStatus === "inactive") {
          await client.deactivatePlatformPartnerEntry(entrySlug);
        } else {
          await client.revokePlatformPartnerEntry(entrySlug);
        }
        await loadEntries();
        if (selectedEntrySlug === entrySlug) {
          await loadCredentials(entrySlug);
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setChangingStatus(null);
      }
    },
    [client, loadCredentials, loadEntries, selectedEntrySlug],
  );

  const issueCredential = useCallback(async () => {
    if (!selectedEntry) return;
    setIssuingCredential(true);
    setError(null);
    try {
      const issued = await client.issuePlatformPartnerIngressCredential(
        selectedEntry.entrySlug,
        {},
      );
      setIssuedCredential(issued);
      await loadCredentials(selectedEntry.entrySlug);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIssuingCredential(false);
    }
  }, [client, loadCredentials, selectedEntry]);

  const revokeCredential = useCallback(
    async (keyId: string) => {
      if (!selectedEntry) return;
      setRevokingCredentialId(keyId);
      setError(null);
      try {
        await client.revokePlatformPartnerIngressCredential(
          selectedEntry.entrySlug,
          keyId,
          {},
        );
        await loadCredentials(selectedEntry.entrySlug);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setRevokingCredentialId(null);
      }
    },
    [client, loadCredentials, selectedEntry],
  );

  if (loading) {
    return <div className="admin-empty">{t("partners.loading")}</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("partners.title")}</h1>
        <p>{t("partners.subtitle", { count: entries.length })}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <div className="admin-toolbar">
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
          type="button"
        >
          {showCreate ? t("common.cancel") : t("partners.newEntry")}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadEntries()}
          type="button"
        >
          {t("common.refresh")}
        </button>
      </div>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("partners.createEntry")}
          </h3>
          <form onSubmit={handleCreate}>
            <EntryForm form={createForm} setForm={setCreateForm} t={t} />
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating ||
                !createForm.partnerCode.trim() ||
                !createForm.programId.trim() ||
                !createForm.entrySlug.trim() ||
                !createForm.displayName.trim()
              }
            >
              {creating ? t("common.creating") : t("partners.createEntry")}
            </button>
          </form>
        </div>
      )}

      {selectedEntry && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {selectedEntry.displayName}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                <code>{selectedEntry.entrySlug}</code> ·{" "}
                {selectedEntry.partnerCode} · {selectedEntry.programId}
              </p>
            </div>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setSelectedEntrySlug(null)}
              type="button"
            >
              {t("common.close")}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <form
              onSubmit={handleSave}
              className="admin-card"
              style={nestedCardStyle}
            >
              <h4 style={sectionTitleStyle}>{t("partners.section.routing")}</h4>
              <EntryForm form={editForm} setForm={setEditForm} t={t} lockSlug />
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={saving || !editForm.displayName.trim()}
              >
                {saving ? t("common.saving") : t("partners.saveEntry")}
              </button>
            </form>

            <div style={{ display: "grid", gap: 16 }}>
              <div className="admin-card" style={nestedCardStyle}>
                <h4 style={sectionTitleStyle}>
                  {t("partners.section.lifecycle")}
                </h4>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <StatusBadge
                    label={t(`partners.status.${selectedEntry.status}`)}
                    tone={badgeTone(selectedEntry.status)}
                  />
                  <StatusBadge
                    label={formatPlatformCodeLabel(
                      locale,
                      selectedEntry.authMode,
                    )}
                    tone="admin-badge--info"
                  />
                  <StatusBadge
                    label={formatPlatformCodeLabel(
                      locale,
                      selectedEntry.eligibilityMode,
                    )}
                    tone="admin-badge--info"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedEntry.status === "active" ? (
                    <button
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      type="button"
                      disabled={changingStatus === selectedEntry.entrySlug}
                      onClick={() =>
                        void setEntryStatus(selectedEntry.entrySlug, "inactive")
                      }
                    >
                      {t("partners.deactivate")}
                    </button>
                  ) : selectedEntry.status === "inactive" ? (
                    <button
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      type="button"
                      disabled={changingStatus === selectedEntry.entrySlug}
                      onClick={() =>
                        void setEntryStatus(selectedEntry.entrySlug, "active")
                      }
                    >
                      {t("partners.activate")}
                    </button>
                  ) : null}
                  {selectedEntry.status !== "revoked" ? (
                    <button
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      type="button"
                      disabled={changingStatus === selectedEntry.entrySlug}
                      onClick={() =>
                        void setEntryStatus(selectedEntry.entrySlug, "revoked")
                      }
                    >
                      {t("partners.revoke")}
                    </button>
                  ) : (
                    <span style={smallMutedStyle}>
                      {selectedEntry.revokedAt
                        ? `${t("partners.revokedAt")} ${formatDateTime(selectedEntry.revokedAt)}`
                        : t("partners.status.revoked")}
                    </span>
                  )}
                </div>
              </div>

              <div className="admin-card" style={nestedCardStyle}>
                <h4 style={sectionTitleStyle}>
                  {t("partners.section.readiness")}
                </h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {readinessItems(selectedEntry, t).map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontSize: 13,
                      }}
                    >
                      <span>{item.label}</span>
                      <span
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span
                          className={`admin-badge ${badgeTone(item.ready ? "ready" : "missing")}`}
                        >
                          {item.ready
                            ? t("partners.ready")
                            : t("partners.missing")}
                        </span>
                        <span style={{ color: "#64748b" }}>{item.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card" style={nestedCardStyle}>
                <h4 style={sectionTitleStyle}>
                  {t("partners.section.credentials")}
                </h4>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <button
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    type="button"
                    disabled={
                      issuingCredential || selectedEntry.status === "revoked"
                    }
                    onClick={() => void issueCredential()}
                  >
                    {issuingCredential
                      ? t("partners.rotatingCredential")
                      : t("partners.rotateCredential")}
                  </button>
                </div>
                {issuedCredential && (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {t("partners.plaintextCredential")}
                    </div>
                    <code style={{ wordBreak: "break-all" }}>
                      {issuedCredential.plaintextKey}
                    </code>
                  </div>
                )}
                {credentialsLoading ? (
                  <p style={smallMutedStyle}>
                    {t("partners.loadingCredentials")}
                  </p>
                ) : credentials.length === 0 ? (
                  <p style={smallMutedStyle}>
                    {t("partners.emptyCredentials")}
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {credentials.map((credential) => (
                      <div
                        key={credential.keyId}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              <code>
                                {credential.keyPrefix}
                                {credential.maskedSuffix}
                              </code>
                            </div>
                            <div style={smallMutedStyle}>
                              {credential.keyId}
                            </div>
                          </div>
                          <span
                            className={`admin-badge ${badgeTone(
                              credential.revokedAt ? "revoked" : "active",
                            )}`}
                          >
                            {credential.revokedAt
                              ? t("partners.credentialStatus.revoked")
                              : t("partners.credentialStatus.active")}
                          </span>
                        </div>
                        <div style={{ ...smallMutedStyle, marginTop: 8 }}>
                          {t("partners.credentialMeta.createdAt")}:{" "}
                          {formatDateTime(credential.createdAt)}
                        </div>
                        <div style={smallMutedStyle}>
                          {t("partners.credentialMeta.lastUsedAt")}:{" "}
                          {credential.lastUsedAt
                            ? formatDateTime(credential.lastUsedAt)
                            : "—"}
                        </div>
                        <div style={smallMutedStyle}>
                          {t("partners.credentialMeta.source")}:{" "}
                          {credential.source}
                        </div>
                        {credential.revokedAt ? (
                          <div style={smallMutedStyle}>
                            {t("partners.revokedAt")}{" "}
                            {formatDateTime(credential.revokedAt)}
                          </div>
                        ) : (
                          <div style={{ marginTop: 10 }}>
                            <button
                              className="admin-btn admin-btn--secondary admin-btn--sm"
                              type="button"
                              disabled={
                                revokingCredentialId === credential.keyId
                              }
                              onClick={() =>
                                void revokeCredential(credential.keyId)
                              }
                            >
                              {revokingCredentialId === credential.keyId
                                ? t("partners.revokingCredential")
                                : t("partners.revokeCredential")}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-card" style={nestedCardStyle}>
                <h4 style={sectionTitleStyle}>{t("partners.section.audit")}</h4>
                <AuditRow
                  label={t("partners.audit.createdBy")}
                  value={selectedEntry.auditMetadata.createdBy ?? "—"}
                />
                <AuditRow
                  label={t("partners.audit.updatedBy")}
                  value={selectedEntry.auditMetadata.updatedBy ?? "—"}
                />
                <AuditRow
                  label={t("partners.audit.requestId")}
                  value={selectedEntry.auditMetadata.requestId ?? "—"}
                />
                <AuditRow
                  label={t("partners.audit.createdAt")}
                  value={formatDateTime(selectedEntry.createdAt)}
                />
                <AuditRow
                  label={t("partners.audit.updatedAt")}
                  value={formatDateTime(selectedEntry.updatedAt)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{t("partners.empty")}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("partners.col.entry")}</th>
                <th>{t("partners.col.partner")}</th>
                <th>{t("partners.col.tenant")}</th>
                <th>{t("partners.col.lifecycle")}</th>
                <th>{t("partners.col.updated")}</th>
                <th>{t("partners.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.entrySlug}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{entry.displayName}</div>
                    <div style={smallMutedStyle}>
                      <code>{entry.entrySlug}</code>
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{entry.partnerCode}</div>
                    <div style={smallMutedStyle}>
                      {entry.programCode ?? entry.programId}
                    </div>
                  </td>
                  <td>
                    <code>{entry.tenantId}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>
                      <span
                        className={`admin-badge ${badgeTone(entry.status)}`}
                      >
                        {t(`partners.status.${entry.status}`)}
                      </span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {formatPlatformCodeLabel(locale, entry.authMode)}
                    </div>
                    <div style={smallMutedStyle}>
                      {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                    </div>
                  </td>
                  <td>{formatDateTime(entry.updatedAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => setSelectedEntrySlug(entry.entrySlug)}
                        type="button"
                      >
                        {t("partners.configure")}
                      </button>
                      {entry.status === "active" ? (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void setEntryStatus(entry.entrySlug, "inactive")
                          }
                          type="button"
                          disabled={changingStatus === entry.entrySlug}
                        >
                          {t("partners.deactivate")}
                        </button>
                      ) : entry.status === "inactive" ? (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void setEntryStatus(entry.entrySlug, "active")
                          }
                          type="button"
                          disabled={changingStatus === entry.entrySlug}
                        >
                          {t("partners.activate")}
                        </button>
                      ) : null}
                      {entry.status !== "revoked" ? (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void setEntryStatus(entry.entrySlug, "revoked")
                          }
                          type="button"
                          disabled={changingStatus === entry.entrySlug}
                        >
                          {t("partners.revoke")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EntryForm({
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
      <div style={gridStyle}>
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

      <h4 style={sectionTitleStyle}>{t("partners.section.branding")}</h4>
      <div style={{ ...gridStyle, marginBottom: 16 }}>
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
      <div style={labelStyle}>{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
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
      <div style={labelStyle}>{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
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

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`admin-badge ${tone}`}>{label}</span>;
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        marginBottom: 8,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "#64748b" }}>{value}</span>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const nestedCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  boxShadow: "none",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  boxSizing: "border-box",
};

const smallMutedStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};
