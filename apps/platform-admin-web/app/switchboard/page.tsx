/**
 * Switchboard Page
 * Public information versioning and placard generation for platform compliance.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import {
  actionButtonStyle,
  emptyStateStyle,
  linkStyle,
  mergeStyles,
  statusBadgeStyle,
  surfaceCardStyle,
  tableCardStyle,
  tableCellStyle,
  tableEmptyStateStyle,
  tableHeadCellStyle,
  tableStyle,
  toggleButtonStyle,
  toggleGroupStyle,
  inputStyle,
  monoTextStyle,
} from "@/components/platform-ui";
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
import {
  CalloutBanner,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";
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

function publicInfoStatusTone(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "success" as const;
  }
  if (status === "retired") {
    return "neutral" as const;
  }
  return "warning" as const;
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
  const livePublicInfoVersion = publishedVersions[0] ?? null;
  const livePlacardVersion =
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null;
  const switchboardWorkflowCopy =
    locale === "en"
      ? {
          governanceTitle: "Versioning governance",
          governanceNote:
            "Public-info disclosure versions and placard artifacts remain linked so publication history, rider disclosure, and physical placard issuance can be audited together.",
          liveVersion: "Live disclosure",
          livePlacard: "Current placard",
          history: "History framing",
          historyNote:
            "Drafts can be edited or deleted until publication. Published versions stay immutable and feed downstream placard lineage.",
          noLiveVersion: "No published public info version yet.",
          noLivePlacard: "No placard artifact generated yet.",
        }
      : {
          governanceTitle: "版本治理",
          governanceNote:
            "公開資訊版本與立牌成品維持可追溯連結，讓發布歷史、乘客揭露與實體立牌發放可以一起被稽核。",
          liveVersion: "目前生效揭露",
          livePlacard: "現行立牌",
          history: "歷史框架",
          historyNote:
            "草稿在發布前可編輯或刪除；一旦發布即保持不可變，並成為後續立牌沿革來源。",
          noLiveVersion: "目前尚無已發布公開資訊版本。",
          noLivePlacard: "目前尚未產生立牌成品。",
        };

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
    return <div style={emptyStateStyle}>{t("switchboard.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Disclosure Governance" : "揭露治理"}
        title={t("switchboard.title")}
        subtitle={t("switchboard.subtitle")}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeTab === "public-info" ? (
              <button
                type="button"
                style={actionButtonStyle({ tone: "primary" })}
                onClick={() => setShowPublicInfoForm((current) => !current)}
              >
                {showPublicInfoForm
                  ? t("common.cancel")
                  : t("switchboard.newPublicInfoVersion")}
              </button>
            ) : (
              <button
                type="button"
                style={actionButtonStyle({ tone: "primary" })}
                onClick={() => setShowPlacardForm((current) => !current)}
                disabled={publicInfo.length === 0}
              >
                {showPlacardForm
                  ? t("common.cancel")
                  : t("switchboard.generatePlacardVersion")}
              </button>
            )}
            <button
              type="button"
              style={actionButtonStyle({ tone: "secondary" })}
              onClick={() => void loadData()}
            >
              {t("common.refresh")}
            </button>
          </div>
        }
      />

      {error && (
        <CalloutBanner
          tone="danger"
          title={getPlatformLabel(locale, "error")}
          description={error}
        />
      )}

      <CalloutBanner
        tone="info"
        eyebrow={switchboardWorkflowCopy.governanceTitle}
        title={
          locale === "en"
            ? "Public disclosure and placard issuance remain linked for audit."
            : "公開揭露與牌貼發布維持連動，便於稽核追溯。"
        }
        description={switchboardWorkflowCopy.governanceNote}
        meta={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusChip
              tone="success"
              label={`${switchboardWorkflowCopy.liveVersion} · ${
                livePublicInfoVersion?.versionId ?? "—"
              }`}
            />
            <StatusChip
              tone="info"
              label={`${switchboardWorkflowCopy.livePlacard} · ${
                livePlacardVersion?.versionCode ?? "—"
              }`}
            />
          </div>
        }
        footer={switchboardWorkflowCopy.historyNote}
      />

      <KpiRow minWidth="220px">
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
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.note}
            tone={
              card.label === t("switchboard.publishedPublicInfo")
                ? "success"
                : card.label === t("switchboard.draftPublicInfo")
                  ? "warning"
                  : "info"
            }
          />
        ))}
      </KpiRow>

      <DataViewCard
        title={locale === "en" ? "Live posture" : "現況姿態"}
        subtitle={switchboardWorkflowCopy.historyNote}
        filters={
          <div style={toggleGroupStyle}>
            <button
              type="button"
              style={toggleButtonStyle(activeTab === "public-info")}
              onClick={() => setActiveTab("public-info")}
            >
              {t("switchboard.tab.publicInfo")} ({publicInfo.length})
            </button>
            <button
              type="button"
              style={toggleButtonStyle(activeTab === "placards")}
              onClick={() => setActiveTab("placards")}
            >
              {t("switchboard.tab.placards")} ({placards.length})
            </button>
          </div>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          <div
            style={mergeStyles(surfaceCardStyle, {
              marginBottom: 0,
              background: "rgba(15,118,110,0.04)",
            })}
          >
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
              {switchboardWorkflowCopy.governanceTitle}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
              {switchboardWorkflowCopy.governanceNote}
            </p>
          </div>
          <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
              {switchboardWorkflowCopy.liveVersion}
            </p>
            {livePublicInfoVersion ? (
              <>
                <strong style={{ display: "block", fontSize: 20 }}>
                  {livePublicInfoVersion.title}
                </strong>
                <small style={{ color: "#6b7280" }}>
                  {livePublicInfoVersion.versionId} ·{" "}
                  {formatDateTime(livePublicInfoVersion.publishedAt ?? "")}
                </small>
              </>
            ) : (
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                {switchboardWorkflowCopy.noLiveVersion}
              </p>
            )}
          </div>
          <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
              {switchboardWorkflowCopy.livePlacard}
            </p>
            {livePlacardVersion ? (
              <>
                <strong style={{ display: "block", fontSize: 20 }}>
                  {livePlacardVersion.versionCode}
                </strong>
                <small style={{ color: "#6b7280" }}>
                  {livePlacardVersion.templateName} ·{" "}
                  {formatDateTime(
                    livePlacardVersion.publishedAt ??
                      livePlacardVersion.createdAt,
                  )}
                </small>
              </>
            ) : (
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                {switchboardWorkflowCopy.noLivePlacard}
              </p>
            )}
          </div>
          <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
              {switchboardWorkflowCopy.history}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
              {switchboardWorkflowCopy.historyNote}
            </p>
          </div>
        </div>
      </DataViewCard>

      {activeTab === "public-info" && showPublicInfoForm && (
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
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
                style={actionButtonStyle({ tone: "primary" })}
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
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
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
                style={actionButtonStyle({ tone: "primary" })}
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

      <div style={tableCardStyle}>
        {activeTab === "public-info" ? (
          publicInfo.length === 0 ? (
            <p style={tableEmptyStateStyle}>{t("switchboard.noPublicInfo")}</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.version")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.phones")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.fare")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.lifecycle")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {publicInfo.map((version) => (
                  <tr key={version.versionId}>
                    <td style={tableCellStyle}>
                      <div style={cellTitleStyle}>{version.title}</div>
                      <div style={monoSubcopyStyle}>{version.versionId}</div>
                      <div style={subcopyStyle}>
                        {formatDateTime(version.createdAt)}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <div>
                        {getPlatformLabel(locale, "call")}:{" "}
                        {version.callPhone ?? "—"}
                      </div>
                      <div>
                        {getPlatformLabel(locale, "complaint")}:{" "}
                        {version.complaintPhone ?? "—"}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <div>
                        {version.callRateText ?? t("switchboard.noRateText")}
                      </div>
                      <div style={subcopyStyle}>{version.fareText ?? "—"}</div>
                      <div style={subcopyStyle}>
                        {version.paymentMethodText ?? "—"}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <span
                        style={statusBadgeStyle(
                          publicInfoStatusTone(version.status),
                        )}
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
                    <td style={tableCellStyle}>
                      {version.status === "draft" ? (
                        <div style={actionsStyle}>
                          <button
                            style={actionButtonStyle({ tone: "primary" })}
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
                            style={actionButtonStyle()}
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
          <p style={tableEmptyStateStyle}>{t("switchboard.noPlacards")}</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeadCellStyle}>
                  {t("switchboard.col.placardId")}
                </th>
                <th style={tableHeadCellStyle}>
                  {t("switchboard.col.sourceVersion")}
                </th>
                <th style={tableHeadCellStyle}>
                  {t("switchboard.col.template")}
                </th>
                <th style={tableHeadCellStyle}>
                  {t("switchboard.col.artifact")}
                </th>
                <th style={tableHeadCellStyle}>{t("fleet.col.status")}</th>
                <th style={tableHeadCellStyle}>
                  {t("switchboard.col.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {placards.map((placard) => {
                const sourceVersion =
                  publicInfoById[placard.publicInfoVersionId];
                return (
                  <tr key={placard.placardVersionId}>
                    <td style={tableCellStyle}>
                      <div style={cellTitleStyle}>{placard.versionCode}</div>
                      <div style={monoSubcopyStyle}>
                        {placard.placardVersionId}
                      </div>
                      <div style={subcopyStyle}>
                        {formatDateTime(placard.createdAt)}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
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
                    <td style={tableCellStyle}>{placard.templateName}</td>
                    <td style={tableCellStyle}>
                      <div style={monoSubcopyStyle}>
                        {placard.artifactFileId ??
                          getPlatformLabel(locale, "pendingArtifactId")}
                      </div>
                      <div style={monoSubcopyStyle}>
                        {shortHash(placard.artifactManifestHash)}
                      </div>
                      {placard.artifactDownloadUrl ? (
                        <a
                          style={linkStyle}
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
                    <td style={tableCellStyle}>
                      <span
                        style={statusBadgeStyle(
                          placard.publishedAt ? "success" : "warning",
                        )}
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
                    <td style={tableCellStyle}>
                      {!placard.publishedAt ? (
                        <button
                          style={actionButtonStyle({ tone: "primary" })}
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
  ...monoTextStyle,
};
