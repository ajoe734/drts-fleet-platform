/**
 * Switchboard Page
 * Public information versioning and placard generation for platform compliance.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";

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
    const preferredVersion = publishedVersions[0] ?? publicInfo[0];
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
    return <div className="admin-empty">Loading switchboard data...</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Switchboard</h1>
        <p>
          Manage public disclosures and seat-back placards from the
          authoritative platform admin surface.
        </p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>Error: {error}</p>
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
            label: "Published public info",
            value: publishedVersions.length,
            note: "Live disclosure versions",
          },
          {
            label: "Draft public info",
            value: draftVersions.length,
            note: "Awaiting compliance publish",
          },
          {
            label: "Placard versions",
            value: placards.length,
            note: "Traceable seat-back outputs",
          },
          {
            label: "Placards tied to live info",
            value: placards.filter((placard) => {
              const source = publicInfoById[placard.publicInfoVersionId];
              return source?.status === "published";
            }).length,
            note: "Ready to distribute to fleet",
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
            Public Info ({publicInfo.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "placards" ? "active" : ""}`}
            onClick={() => setActiveTab("placards")}
          >
            Placards ({placards.length})
          </button>
        </div>
        {activeTab === "public-info" ? (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setShowPublicInfoForm((current) => !current)}
          >
            {showPublicInfoForm ? "Cancel" : "New Public Info Version"}
          </button>
        ) : (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setShowPlacardForm((current) => !current)}
            disabled={publicInfo.length === 0}
          >
            {showPlacardForm ? "Cancel" : "Generate Placard Version"}
          </button>
        )}
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          Refresh
        </button>
      </div>

      {activeTab === "public-info" && showPublicInfoForm && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Create Public Info Version
          </h3>
          <form onSubmit={handleCreatePublicInfo}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                Version title
                <input
                  value={publicInfoForm.title ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="2026 Q3 公開資訊版"
                />
              </label>
              <label style={labelStyle}>
                Call phone
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
                Complaint phone
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
                Effective from
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
                Effective to
                <input
                  value={publicInfoForm.effectiveTo ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="Optional sunset timestamp"
                />
              </label>
              <label style={labelStyle}>
                Call rate text
                <input
                  value={publicInfoForm.callRateText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callRateText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="依表計費"
                />
              </label>
              <label style={labelStyle}>
                Fare text
                <input
                  value={publicInfoForm.fareText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      fareText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="夜間與偏遠加成依公告"
                />
              </label>
              <label style={labelStyle}>
                Payment methods
                <input
                  value={publicInfoForm.paymentMethodText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      paymentMethodText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="現金、信用卡、企業簽單"
                />
              </label>
            </div>
            <div style={actionsStyle}>
              <button
                className="admin-btn admin-btn--primary"
                type="submit"
                disabled={creatingPublicInfo}
              >
                {creatingPublicInfo ? "Creating..." : "Create draft version"}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "placards" && showPlacardForm && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Generate Placard Version
          </h3>
          <form onSubmit={handleGeneratePlacard}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                Source public info version
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
                  <option value="">Select source version</option>
                  {publicInfo.map((version) => (
                    <option key={version.versionId} value={version.versionId}>
                      {version.title} ({version.status})
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Version code
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
                Template name
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
                Artifact file ID
                <input
                  value={placardForm.artifactFileId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      artifactFileId: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="Optional external asset reference"
                />
              </label>
            </div>
            <p style={{ marginTop: 12, marginBottom: 0, color: "#6b7280" }}>
              {selectedPublicInfoVersion
                ? selectedPublicInfoVersion.status === "published"
                  ? "Published source selected: generated placard will inherit the live disclosure timestamp."
                  : "Draft source selected: generated placard stays draft until the linked public info is published."
                : "Select a source public info version to keep placard lineage traceable."}
            </p>
            <div style={actionsStyle}>
              <button
                className="admin-btn admin-btn--primary"
                type="submit"
                disabled={
                  creatingPlacard ||
                  placardForm.publicInfoVersionId.trim() === ""
                }
              >
                {creatingPlacard ? "Generating..." : "Generate placard version"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-card" style={{ overflowX: "auto" }}>
        {activeTab === "public-info" ? (
          publicInfo.length === 0 ? (
            <p className="admin-empty">No public info versions available.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Phones</th>
                  <th>Fare & Payment</th>
                  <th>Lifecycle</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {publicInfo.map((version) => (
                  <tr key={version.versionId}>
                    <td>
                      <div style={cellTitleStyle}>{version.title}</div>
                      <div style={monoSubcopyStyle}>{version.versionId}</div>
                      <div style={subcopyStyle}>
                        Created {formatDateTime(version.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div>Call: {version.callPhone ?? "—"}</div>
                      <div>Complaint: {version.complaintPhone ?? "—"}</div>
                    </td>
                    <td>
                      <div>{version.callRateText ?? "No rate text"}</div>
                      <div style={subcopyStyle}>{version.fareText ?? "—"}</div>
                      <div style={subcopyStyle}>
                        {version.paymentMethodText ?? "—"}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${publicInfoStatusBadge(version.status)}`}
                      >
                        {version.status}
                      </span>
                      <div style={subcopyStyle}>
                        Effective {version.effectiveFrom ?? "immediately"}
                      </div>
                      <div style={subcopyStyle}>
                        Published {formatDateTime(version.publishedAt ?? "")}
                      </div>
                      <div style={subcopyStyle}>
                        By {version.publishedBy ?? "pending approval"}
                      </div>
                    </td>
                    <td>
                      {version.status === "draft" ? (
                        <div style={actionsStyle}>
                          <button
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
                              ? "Publishing..."
                              : "Publish"}
                          </button>
                          <button
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
                              ? "Deleting..."
                              : "Delete draft"}
                          </button>
                        </div>
                      ) : (
                        <span style={subcopyStyle}>Immutable history</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : placards.length === 0 ? (
          <p className="admin-empty">No placard versions available.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Placard</th>
                <th>Source Public Info</th>
                <th>Template</th>
                <th>Artifact</th>
                <th>Status</th>
                <th>Actions</th>
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
                        Created {formatDateTime(placard.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div>
                        {sourceVersion?.title ?? placard.publicInfoVersionId}
                      </div>
                      <div style={subcopyStyle}>
                        Status {sourceVersion?.status ?? "unknown"}
                      </div>
                    </td>
                    <td>{placard.templateName}</td>
                    <td>
                      <div style={monoSubcopyStyle}>
                        {placard.artifactFileId ?? "pending-artifact-id"}
                      </div>
                      <div style={monoSubcopyStyle}>
                        Manifest {shortHash(placard.artifactManifestHash)}
                      </div>
                      {placard.artifactDownloadUrl ? (
                        <a
                          className="admin-link"
                          href={placard.artifactDownloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Download signed artifact
                        </a>
                      ) : (
                        <div style={subcopyStyle}>Pending signed artifact</div>
                      )}
                      <div style={subcopyStyle}>
                        Expires{" "}
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
                        {placard.publishedAt ? "published" : "draft"}
                      </span>
                      <div style={subcopyStyle}>
                        Published {formatDateTime(placard.publishedAt ?? "")}
                      </div>
                    </td>
                    <td>
                      {!placard.publishedAt ? (
                        <button
                          className="admin-btn admin-btn--primary"
                          onClick={() =>
                            void handlePublishPlacard(placard.placardVersionId)
                          }
                          disabled={
                            publishingPlacardId === placard.placardVersionId
                          }
                        >
                          {publishingPlacardId === placard.placardVersionId
                            ? "Publishing..."
                            : "Publish"}
                        </button>
                      ) : (
                        <span style={subcopyStyle}>Immutable history</span>
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
