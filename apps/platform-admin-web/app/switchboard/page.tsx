/**
 * Switchboard Page
 * Public information, placards, and platform-wide broadcasts.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  PublicInfoVersionRecord,
  PlacardVersionRecord,
} from "@drts/contracts";

export default function SwitchboardPage() {
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"public-info" | "placards">(
    "public-info",
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pi, pl] = await Promise.all([
        client.listPublicInfo(),
        client.listPlacards(),
      ]);
      setPublicInfo(pi || []);
      setPlacards(pl || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading)
    return <div className="admin-empty">Loading switchboard data...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Switchboard</h1>
        <p>
          Manage public information versions, placards, and platform-wide
          broadcasts.
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
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          Refresh
        </button>
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }}>
        {activeTab === "public-info" &&
          (publicInfo.length === 0 ? (
            <p className="admin-empty">No public info versions available.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Version ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {publicInfo.map((pi) => (
                  <tr key={pi.versionId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {pi.versionId}
                    </td>
                    <td>{pi.title || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${
                          pi.status === "published"
                            ? "admin-badge--success"
                            : pi.status === "retired"
                              ? "admin-badge--neutral"
                              : "admin-badge--warning"
                        }`}
                      >
                        {pi.status}
                      </span>
                    </td>
                    <td>{formatDateTime(pi.createdAt)}</td>
                    <td>
                      {pi.publishedAt ? formatDateTime(pi.publishedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "placards" &&
          (placards.length === 0 ? (
            <p className="admin-empty">No placard versions available.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Placard Version ID</th>
                  <th>Version Code</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {placards.map((pl) => (
                  <tr key={pl.placardVersionId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {pl.placardVersionId}
                    </td>
                    <td>{pl.versionCode}</td>
                    <td>{pl.templateName || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${
                          pl.publishedAt
                            ? "admin-badge--success"
                            : "admin-badge--neutral"
                        }`}
                      >
                        {pl.publishedAt ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td>{formatDateTime(pl.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
