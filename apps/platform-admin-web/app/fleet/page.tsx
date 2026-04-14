/**
 * Fleet & Devices Management Page
 * Vehicle registry, driver registry, and contract management.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  VehicleRegistryRecord,
  DriverRegistryRecord,
  VehicleContractRecord,
} from "@drts/contracts";

export default function FleetPage() {
  const client = usePlatformAdminClient();
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [contracts, setContracts] = useState<VehicleContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "vehicles" | "drivers" | "contracts"
  >("vehicles");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d, c] = await Promise.all([
        client.listVehicles(),
        client.listDrivers(),
        client.listContracts(),
      ]);
      setVehicles(v || []);
      setDrivers(d || []);
      setContracts(c || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <div className="admin-empty">Loading fleet data...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Fleet &amp; Devices</h1>
        <p>Vehicle registry, driver registry, and contract management.</p>
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
            className={`admin-toggle-btn ${activeTab === "vehicles" ? "active" : ""}`}
            onClick={() => setActiveTab("vehicles")}
          >
            Vehicles ({vehicles.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "drivers" ? "active" : ""}`}
            onClick={() => setActiveTab("drivers")}
          >
            Drivers ({drivers.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "contracts" ? "active" : ""}`}
            onClick={() => setActiveTab("contracts")}
          >
            Contracts ({contracts.length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          Refresh
        </button>
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }}>
        {activeTab === "vehicles" &&
          (vehicles.length === 0 ? (
            <p className="admin-empty">No vehicles registered.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vehicle ID</th>
                  <th>License Plate</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.vehicleId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {v.vehicleId}
                    </td>
                    <td>{v.plateNo || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${
                          v.dispatchableFlag
                            ? "admin-badge--success"
                            : "admin-badge--neutral"
                        }`}
                      >
                        {v.dispatchableFlag
                          ? "Dispatchable"
                          : "Not Dispatchable"}
                      </span>
                    </td>
                    <td>{v.operatingArea || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "drivers" &&
          (drivers.length === 0 ? (
            <p className="admin-empty">No drivers registered.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Driver ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driverId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {d.driverId}
                    </td>
                    <td>{d.name || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${
                          d.workState === "available"
                            ? "admin-badge--success"
                            : "admin-badge--neutral"
                        }`}
                      >
                        {d.workState || "unknown"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          d.licensesValid
                            ? "admin-badge--success"
                            : "admin-badge--warning"
                        }`}
                      >
                        {d.licensesValid
                          ? "Licenses Valid"
                          : "Licenses Expired"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "contracts" &&
          (contracts.length === 0 ? (
            <p className="admin-empty">No contracts found.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contract ID</th>
                  <th>Vehicle ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Valid From</th>
                  <th>Valid To</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.contractId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {c.contractId}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {c.vehicleId}
                    </td>
                    <td>{c.contractType || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${
                          c.status === "active"
                            ? "admin-badge--success"
                            : "admin-badge--neutral"
                        }`}
                      >
                        {c.status || "unknown"}
                      </span>
                    </td>
                    <td>{formatDateTime(c.startAt || "")}</td>
                    <td>{c.endAt ? formatDateTime(c.endAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
