/**
 * Switchboard Page
 * Public information versioning and placard generation for platform compliance.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";
import { getPlacardVersionCodePrecheckMessage } from "./placard-version-code";
import {
  formatPlacardSourceOptionLabel,
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  getPlacardRetiredSourceAuditNote,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};

const EMPTY_PUBLIC_INFO_FORM: CreatePublicInfoVersionCommand = {
  title: "",
  callPhone: "",
  complaintPhone: "",
  callRateText: "",
  fareText: "",
  paymentMethodText: "",
  effectiveFrom: "",
  effectiveTo: "",
};

const EMPTY_PLACARD_FORM: PlacardFormState = {
  versionCode: "",
  publicInfoVersionId: "",
  templateName: "seatback-default",
  artifactFileId: "",
};

function cleanNullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return `${value.slice(0, 12)}...`;
}

function publicInfoStatusBadge(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "admin-badge--success";
  }
  if (status === "retired") {
    return "admin-badge--neutral";
  }
  return "admin-badge--warning";
}

export default function SwitchboardPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"public-info" | "placards">(
    "public-info",
  );
  const [showPublicInfoForm, setShowPublicInfoForm] = useState(false);
  const [showPlacardForm, setShowPlacardForm] = useState(false);
  const [publicInfoForm, setPublicInfoForm] = useState(EMPTY_PUBLIC_INFO_FORM);
  const [placardForm, setPlacardForm] = useState(EMPTY_PLACARD_FORM);
  const [creatingPublicInfo, setCreatingPublicInfo] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(
    null,
  );
  const [creatingPlacard, setCreatingPlacard] = useState(false);
  const [publishingPlacardId, setPublishingPlacardId] = useState<string | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [publicInfoVersions, placardVersions] = await Promise.all([
        client.listPublicInfo(),
        client.listPlacards(),
      ]);
      setPublicInfo(publicInfoVersions ?? []);
      setPlacards(placardVersions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const publicInfoById = useMemo(
    () =>
      Object.fromEntries(
        publicInfo.map((version) => [version.versionId, version]),
      ),
    [publicInfo],
  );

  const publishedVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "published"),
    [publicInfo],
  );

  const draftVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "draft"),
    [publicInfo],
  );

  useEffect(() => {
    const preferredVersion = getPreferredPlacardSourceVersion(publicInfo);
    if (!preferredVersion || placardForm.publicInfoVersionId) {
      return;
    }
    setPlacardForm((current) => ({
      ...current,
      publicInfoVersionId: preferredVersion.versionId,
    }));
  }, [placardForm.publicInfoVersionId, publicInfo, publishedVersions]);

  const selectedPublicInfoVersion =
    publicInfoById[placardForm.publicInfoVersionId] ?? null;
  const versionCodePrecheckMessage = useMemo(
    () =>
      getPlacardVersionCodePrecheckMessage(
        placardForm.versionCode,
        placards,
        locale,
      ),
    [locale, placardForm.versionCode, placards],
  );
  const placardSourceBlocked = isPlacardSourceSelectionBlocked(
    selectedPublicInfoVersion,
  );

  async function handleCreatePublicInfo(event: React.FormEvent) {
    event.preventDefault();
    setCreatingPublicInfo(true);
    setError(null);
    try {
      await client.createPublicInfoVersion({
        title: publicInfoForm.title.trim(),
        callPhone: cleanNullable(publicInfoForm.callPhone ?? ""),
        complaintPhone: cleanNullable(publicInfoForm.complaintPhone ?? ""),
        callRateText: cleanNullable(publicInfoForm.callRateText ?? ""),
        fareText: cleanNullable(publicInfoForm.fareText ?? ""),
        paymentMethodText: cleanNullable(
          publicInfoForm.paymentMethodText ?? "",
        ),
        effectiveFrom: cleanNullable(publicInfoForm.effectiveFrom ?? ""),
        effectiveTo: cleanNullable(publicInfoForm.effectiveTo ?? ""),
      });
      setPublicInfoForm(EMPTY_PUBLIC_INFO_FORM);
      setShowPublicInfoForm(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPublicInfo(false);
    }
  }

  async function handlePublish(versionId: string) {
    setPublishingVersionId(versionId);
    setError(null);
    try {
      await client.publishPublicInfoVersion(versionId, {});
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingVersionId(null);
    }
  }

  async function handleDeleteDraft(versionId: string) {
    setDeletingVersionId(versionId);
    setError(null);
    try {
      await client.deletePublicInfoVersion(versionId);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingVersionId(null);
    }
  }

  async function handleGeneratePlacard(event: React.FormEvent) {
    event.preventDefault();
    setCreatingPlacard(true);
    setError(null);
    try {
      const command: GeneratePlacardVersionCommand = {
        versionCode: placardForm.versionCode.trim(),
        publicInfoVersionId: placardForm.publicInfoVersionId,
        templateName: placardForm.templateName.trim(),
        artifactFileId: cleanNullable(placardForm.artifactFileId),
      };
      await client.generatePlacardVersion(command);
      setPlacardForm((current) => ({
        ...EMPTY_PLACARD_FORM,
        publicInfoVersionId: current.publicInfoVersionId,
      }));
      setShowPlacardForm(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPlacard(false);
    }
  }

  async function handlePublishPlacard(placardVersionId: string) {
    setPublishingPlacardId(placardVersionId);
    setError(null);
    try {
      await client.publishPlacardVersion(placardVersionId);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingPlacardId(null);
    }
  }

  if (loading) {
    return <div className="admin-empty">{t("switchboard.loading")}</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("switchboard.title")}</h1>
        <p>{t("switchboard.subtitle")}</p>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: t("switchboard.publishedPublicInfo"),
            value: publishedVersions.length,
            note: t("switchboard.publishedPublicInfoNote"),
          },
          {
            label: t("switchboard.draftPublicInfo"),
            value: draftVersions.length,
            note: t("switchboard.draftPublicInfoNote"),
          },
          {
            label: t("switchboard.placardVersions"),
            value: placards.length,
            note: t("switchboard.placardVersionsNote"),
          },
          {
            label: t("switchboard.placardsTiedToLive"),
            value: placards.filter((placard) => {
              const source = publicInfoById[placard.publicInfoVersionId];
              return source?.status === "published";
            }).length,
            note: t("switchboard.placardsTiedToLiveNote"),
          },
        ].map((card) => (
          <div key={card.label} className="admin-card">
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
              {card.label}
            </p>
            <strong style={{ display: "block", fontSize: 24 }}>
              {card.value}
            </strong>
            <small style={{ color: "#6b7280" }}>{card.note}</small>
          </div>
        ))}
      </div>

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "public-info" ? "active" : ""}`}
            onClick={() => setActiveTab("public-info")}
          >
            {t("switchboard.tab.publicInfo")} ({publicInfo.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "placards" ? "active" : ""}`}
            onClick={() => setActiveTab("placards")}
          >
            {t("switchboard.tab.placards")} ({placards.length})
          </button>
        </div>
        {activeTab === "public-info" ? (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setShowPublicInfoForm((current) => !current)}
          >
            {showPublicInfoForm
              ? t("common.cancel")
              : t("switchboard.newPublicInfoVersion")}
          </button>
        ) : (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setShowPlacardForm((current) => !current)}
            disabled={publicInfo.length === 0}
          >
            {showPlacardForm
              ? t("common.cancel")
              : t("switchboard.generatePlacardVersion")}
          </button>
        )}
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          {t("common.refresh")}
        </button>
      </div>

      {activeTab === "public-info" && showPublicInfoForm && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("switchboard.newPublicInfoVersion")}
          </h3>
          <form onSubmit={handleCreatePublicInfo}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("switchboard.form.title")}
                <input
                  value={publicInfoForm.title ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "2026 Q3 public info"
                      : "2026 Q3 公開資訊版"
                  }
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.callPhone")}
                <input
                  value={publicInfoForm.callPhone ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="0800-000-123"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.complaintPhone")}
                <input
                  value={publicInfoForm.complaintPhone ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      complaintPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="0800-000-456"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.effectiveFrom")}
                <input
                  value={publicInfoForm.effectiveFrom ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="2026-07-01T00:00:00.000Z"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.effectiveTo")}
                <input
                  value={publicInfoForm.effectiveTo ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={t("switchboard.form.effectiveToHint")}
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.callRateText")}
                <input
                  value={publicInfoForm.callRateText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callRateText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={locale === "en" ? "Metered pricing" : "依表計費"}
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.fareText")}
                <input
                  value={publicInfoForm.fareText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      fareText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "Night and remote surcharges per notice"
                      : "夜間與偏遠加成依公告"
                  }
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.paymentMethodText")}
                <input
                  value={publicInfoForm.paymentMethodText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      paymentMethodText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "Cash, credit card, corporate charge"
                      : "現金、信用卡、企業簽單"
                  }
                />
              </label>
            </div>
            <div style={actionsStyle}>
              <button
                className="admin-btn admin-btn--primary"
                type="submit"
                disabled={creatingPublicInfo}
              >
                {creatingPublicInfo
                  ? t("switchboard.creating")
                  : t("switchboard.createDraftVersion")}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "placards" && showPlacardForm && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("switchboard.generatePlacardVersion")}
          </h3>
          <form onSubmit={handleGeneratePlacard}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("switchboard.form.sourceVersion")}
                <select
                  value={placardForm.publicInfoVersionId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      publicInfoVersionId: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {publicInfo.map((version) => (
                    <option
                      key={version.versionId}
                      value={version.versionId}
                      disabled={isPlacardSourceSelectionBlocked(version)}
                    >
                      {formatPlacardSourceOptionLabel(version, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.versionCode")}
                <input
                  value={placardForm.versionCode}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      versionCode: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="placard-2026-q3"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.template")}
                <input
                  value={placardForm.templateName}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      templateName: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="seatback-default"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.artifactFileId")}
                <input
                  value={placardForm.artifactFileId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      artifactFileId: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={t("switchboard.form.artifactHint")}
                />
              </label>
            </div>
            <p style={{ marginTop: 12, marginBottom: 0, color: "#6b7280" }}>
              {getPlacardSourceSelectionHint(selectedPublicInfoVersion, locale)}
            </p>
            {placardSourceBlocked && (
              <p style={{ marginTop: 8, marginBottom: 0, color: "#92400e" }}>
                {getPlacardRetiredSourceAuditNote(locale)}
              </p>
            )}
            {versionCodePrecheckMessage && (
              <p style={{ marginTop: 8, marginBottom: 0, color: "#b45309" }}>
                {versionCodePrecheckMessage}
              </p>
            )}
            <div style={actionsStyle}>
              <button
                className="admin-btn admin-btn--primary"
                type="submit"
                disabled={
                  creatingPlacard ||
                  placardForm.publicInfoVersionId.trim() === "" ||
                  placardSourceBlocked ||
                  versionCodePrecheckMessage !== null
                }
              >
                {creatingPlacard
                  ? t("switchboard.generating")
                  : t("switchboard.generatePlacardVersion")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-card" style={{ overflowX: "auto" }}>
        {activeTab === "public-info" ? (
          publicInfo.length === 0 ? (
            <p className="admin-empty">{t("switchboard.noPublicInfo")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("switchboard.col.version")}</th>
                  <th>{t("switchboard.col.phones")}</th>
                  <th>{t("switchboard.col.fare")}</th>
                  <th>{t("switchboard.col.lifecycle")}</th>
                  <th>{t("switchboard.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {publicInfo.map((version) => (
                  <tr key={version.versionId}>
                    <td>
                      <div style={cellTitleStyle}>{version.title}</div>
                      <div style={monoSubcopyStyle}>{version.versionId}</div>
                      <div style={subcopyStyle}>
                        {formatDateTime(version.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div>
                        {getPlatformLabel(locale, "call")}:{" "}
                        {version.callPhone ?? "—"}
                      </div>
                      <div>
                        {getPlatformLabel(locale, "complaint")}:{" "}
                        {version.complaintPhone ?? "—"}
                      </div>
                    </td>
                    <td>
                      <div>
                        {version.callRateText ?? t("switchboard.noRateText")}
                      </div>
                      <div style={subcopyStyle}>{version.fareText ?? "—"}</div>
                      <div style={subcopyStyle}>
                        {version.paymentMethodText ?? "—"}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${publicInfoStatusBadge(version.status)}`}
                      >
                        {formatPlatformCodeLabel(locale, version.status)}
                      </span>
                      <div style={subcopyStyle}>
                        {version.effectiveFrom ?? "—"}
                      </div>
                      <div style={subcopyStyle}>
                        {formatDateTime(version.publishedAt ?? "")}
                      </div>
                      <div style={subcopyStyle}>
                        {version.publishedBy ?? "—"}
                      </div>
                    </td>
                    <td>
                      {version.status === "draft" ? (
                        <div style={actionsStyle}>
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary"
                            onClick={() =>
                              void handlePublish(version.versionId)
                            }
                            disabled={
                              publishingVersionId === version.versionId ||
                              deletingVersionId === version.versionId
                            }
                          >
                            {publishingVersionId === version.versionId
                              ? t("switchboard.publishing")
                              : t("switchboard.publishDraft")}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            onClick={() =>
                              void handleDeleteDraft(version.versionId)
                            }
                            disabled={
                              deletingVersionId === version.versionId ||
                              publishingVersionId === version.versionId
                            }
                          >
                            {deletingVersionId === version.versionId
                              ? t("common.deleting")
                              : t("switchboard.deleteDraft")}
                          </button>
                        </div>
                      ) : (
                        <span style={subcopyStyle}>
                          {t("switchboard.immutableHistory")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : placards.length === 0 ? (
          <p className="admin-empty">{t("switchboard.noPlacards")}</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("switchboard.col.placardId")}</th>
                <th>{t("switchboard.col.sourceVersion")}</th>
                <th>{t("switchboard.col.template")}</th>
                <th>{t("switchboard.col.artifact")}</th>
                <th>{t("fleet.col.status")}</th>
                <th>{t("switchboard.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {placards.map((placard) => {
                const sourceVersion =
                  publicInfoById[placard.publicInfoVersionId];
                return (
                  <tr key={placard.placardVersionId}>
                    <td>
                      <div style={cellTitleStyle}>{placard.versionCode}</div>
                      <div style={monoSubcopyStyle}>
                        {placard.placardVersionId}
                      </div>
                      <div style={subcopyStyle}>
                        {formatDateTime(placard.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div>
                        {sourceVersion?.title ?? placard.publicInfoVersionId}
                      </div>
                      <div style={subcopyStyle}>
                        {formatPlatformCodeLabel(
                          locale,
                          sourceVersion?.status ?? "unknown",
                        )}
                      </div>
                    </td>
                    <td>{placard.templateName}</td>
                    <td>
                      <div style={monoSubcopyStyle}>
                        {placard.artifactFileId ??
                          getPlatformLabel(locale, "pendingArtifactId")}
                      </div>
                      <div style={monoSubcopyStyle}>
                        {shortHash(placard.artifactManifestHash)}
                      </div>
                      {placard.artifactDownloadUrl ? (
                        <a
                          className="admin-link"
                          href={placard.artifactDownloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("payments.downloadPdf")}
                        </a>
                      ) : (
                        <div style={subcopyStyle}>—</div>
                      )}
                      <div style={subcopyStyle}>
                        {formatDateTime(placard.artifactExpiresAt ?? "")}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          placard.publishedAt
                            ? "admin-badge--success"
                            : "admin-badge--warning"
                        }`}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          placard.publishedAt ? "published" : "draft",
                        )}
                      </span>
                      <div style={subcopyStyle}>
                        {formatDateTime(placard.publishedAt ?? "")}
                      </div>
                    </td>
                    <td>
                      {!placard.publishedAt ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          onClick={() =>
                            void handlePublishPlacard(placard.placardVersionId)
                          }
                          disabled={
                            publishingPlacardId === placard.placardVersionId
                          }
                        >
                          {publishingPlacardId === placard.placardVersionId
                            ? t("switchboard.publishing")
                            : t("common.publish")}
                        </button>
                      ) : (
                        <span style={subcopyStyle}>
                          {t("switchboard.immutableHistory")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.45)",
  background: "#fff",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginTop: 16,
};

const cellTitleStyle: React.CSSProperties = {
  fontWeight: 600,
};

const subcopyStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
};

const monoSubcopyStyle: React.CSSProperties = {
  ...subcopyStyle,
  fontFamily: "monospace",
};
