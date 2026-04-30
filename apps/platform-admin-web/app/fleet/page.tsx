/**
 * Fleet & Devices Management Page
 * Vehicle registry, driver registry, and contract management.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreateDriverMasterCommand,
  DriverDeviceBindingSummary,
  DriverRegistryRecord,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

function badgeClassForLifecycle(status: string) {
  if (status === "active") return "admin-badge--success";
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "retired" ||
    status === "suspended"
  ) {
    return "admin-badge--warning";
  }
  return "admin-badge--neutral";
}

function createInitialDriverForm(): CreateDriverMasterCommand {
  return {
    name: "",
    phone: "",
    email: "",
    licensesValid: false,
    supportedServiceBuckets: ["standard_taxi"],
  };
}

export default function FleetPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [contracts, setContracts] = useState<VehicleContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "vehicles" | "drivers" | "contracts"
  >("vehicles");
  const [driverForm, setDriverForm] = useState<CreateDriverMasterCommand>(
    createInitialDriverForm(),
  );
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [bindingActionId, setBindingActionId] = useState<string | null>(null);

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

  const submitDriver = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreatingDriver(true);
      setError(null);
      try {
        await client.createDriverMaster({
          ...driverForm,
          name: driverForm.name.trim(),
          phone: driverForm.phone?.trim() || null,
          email: driverForm.email?.trim() || null,
        });
        setDriverForm(createInitialDriverForm());
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setCreatingDriver(false);
      }
    },
    [client, driverForm, loadData],
  );

  const runDriverLifecycleAction = useCallback(
    async (
      driverId: string,
      lifecycleStatus: DriverRegistryRecord["lifecycleStatus"],
    ) => {
      setDriverActionId(`${driverId}:${lifecycleStatus}`);
      setError(null);
      try {
        await client.updateDriverMasterLifecycle(driverId, {
          lifecycleStatus,
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setDriverActionId(null);
      }
    },
    [client, loadData],
  );

  const revokeDriverDeviceBinding = useCallback(
    async (driverId: string, binding: DriverDeviceBindingSummary) => {
      setBindingActionId(binding.bindingId);
      setError(null);
      try {
        await client.revokeDriverDeviceBinding({
          bindingId: binding.bindingId,
          deviceId: binding.deviceId,
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setBindingActionId(null);
      }
    },
    [client, loadData],
  );

  if (loading) return <div className="admin-empty">{t("fleet.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("fleet.title")}</h1>
        <p>
          {t("fleet.subtitle", {
            vehicles: vehicles.length,
            drivers: drivers.length,
            contracts: contracts.length,
          })}
        </p>
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
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "vehicles" ? "active" : ""}`}
            onClick={() => setActiveTab("vehicles")}
          >
            {t("fleet.tab.vehicles")} ({vehicles.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "drivers" ? "active" : ""}`}
            onClick={() => setActiveTab("drivers")}
          >
            {t("fleet.tab.drivers")} ({drivers.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "contracts" ? "active" : ""}`}
            onClick={() => setActiveTab("contracts")}
          >
            {t("fleet.tab.contracts")} ({contracts.length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          {t("common.refresh")}
        </button>
      </div>

      {activeTab === "drivers" && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <form
            onSubmit={submitDriver}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            <label>
              <div className="admin-field-label">{t("fleet.col.name")}</div>
              <input
                className="admin-input"
                value={driverForm.name}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              <div className="admin-field-label">{t("fleet.form.phone")}</div>
              <input
                className="admin-input"
                value={driverForm.phone ?? ""}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <div className="admin-field-label">{t("fleet.form.email")}</div>
              <input
                className="admin-input"
                value={driverForm.email ?? ""}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                minHeight: 40,
              }}
            >
              <input
                type="checkbox"
                checked={driverForm.licensesValid ?? false}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    licensesValid: event.target.checked,
                  }))
                }
              />
              <span>{t("fleet.form.licensesValid")}</span>
            </label>
            <button
              className="admin-btn"
              type="submit"
              disabled={creatingDriver}
            >
              {creatingDriver
                ? t("fleet.creatingDriver")
                : t("fleet.createDriver")}
            </button>
          </form>
        </div>
      )}

      <div className="admin-card" style={{ overflowX: "auto" }}>
        {activeTab === "vehicles" &&
          (vehicles.length === 0 ? (
            <p className="admin-empty">{t("fleet.noVehicles")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("fleet.col.vehicleId")}</th>
                  <th>{t("fleet.col.plate")}</th>
                  <th>{t("fleet.col.dispatchable")}</th>
                  <th>{t("fleet.col.area")}</th>
                  <th>{t("fleet.col.contract")}</th>
                  <th>{t("fleet.col.insurance")}</th>
                  <th>{t("fleet.col.exclusivity")}</th>
                  <th>{t("fleet.col.blockedBy")}</th>
                  <th>{t("fleet.col.lastChange")}</th>
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
                          ? t("fleet.dispatchable")
                          : t("fleet.notDispatchable")}
                      </span>
                    </td>
                    <td>{v.operatingArea || "—"}</td>
                    <td>
                      <span
                        className={`admin-badge ${badgeClassForLifecycle(v.supplyLifecycle.contract.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          v.supplyLifecycle.contract.lifecycleStatus,
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${badgeClassForLifecycle(v.supplyLifecycle.insurance.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          v.supplyLifecycle.insurance.lifecycleStatus,
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${badgeClassForLifecycle(v.supplyLifecycle.exclusivity.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          v.supplyLifecycle.exclusivity.lifecycleStatus,
                        )}
                      </span>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {v.supplyLifecycle.dispatch.blockedReasons.length > 0 ? (
                        v.supplyLifecycle.dispatch.blockedReasons.map(
                          (reason) => (
                            <div key={reason}>
                              {formatPlatformCodeLabel(locale, reason)}
                            </div>
                          ),
                        )
                      ) : (
                        <span className="admin-badge admin-badge--success">
                          {t("fleet.noneBlocked")}
                        </span>
                      )}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {v.supplyLifecycle.lastTrace ? (
                        <div>
                          <div>{v.supplyLifecycle.lastTrace.message}</div>
                          <div
                            style={{
                              color: "var(--admin-text-muted)",
                              fontSize: 12,
                            }}
                          >
                            {formatDateTime(
                              v.supplyLifecycle.lastTrace.occurredAt,
                            )}
                          </div>
                        </div>
                      ) : (
                        t("fleet.lastChangeNone")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "drivers" &&
          (drivers.length === 0 ? (
            <p className="admin-empty">{t("fleet.noDrivers")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("fleet.col.driverId")}</th>
                  <th>{t("fleet.col.name")}</th>
                  <th>{t("fleet.col.lifecycle")}</th>
                  <th>{t("fleet.col.workState")}</th>
                  <th>{t("fleet.col.license")}</th>
                  <th>{t("fleet.col.profile")}</th>
                  <th>{t("fleet.col.deviceBindings")}</th>
                  <th>{t("fleet.col.blockedBy")}</th>
                  <th>{t("fleet.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driverId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {d.driverId}
                    </td>
                    <td>
                      <div>{d.name || "—"}</div>
                      <div
                        style={{
                          color: "var(--admin-text-muted)",
                          fontSize: 12,
                        }}
                      >
                        {d.dispatchEligible
                          ? t("fleet.driverDispatchEligible")
                          : t("fleet.driverNotEligible")}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${badgeClassForLifecycle(d.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(locale, d.lifecycleStatus)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          d.workState === "available"
                            ? "admin-badge--success"
                            : "admin-badge--neutral"
                        }`}
                      >
                        {formatPlatformCodeLabel(locale, d.workState)}
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
                          ? t("fleet.licensesValid")
                          : t("fleet.licensesExpired")}
                      </span>
                    </td>
                    <td>
                      <div>
                        {d.profileUpdatedAt
                          ? t("fleet.profileReady")
                          : t("fleet.profileMissing")}
                      </div>
                      <div
                        style={{
                          color: "var(--admin-text-muted)",
                          fontSize: 12,
                        }}
                      >
                        {formatDateTime(d.profileUpdatedAt || "")}
                      </div>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {d.deviceBindings.length > 0 ? (
                        d.deviceBindings.map((binding) => (
                          <div
                            key={binding.bindingId}
                            style={{ marginBottom: 8 }}
                          >
                            <div
                              style={{ fontFamily: "monospace", fontSize: 12 }}
                            >
                              {binding.deviceId}
                            </div>
                            <div
                              style={{
                                color: "var(--admin-text-muted)",
                                fontSize: 12,
                              }}
                            >
                              {binding.deviceLabel || binding.status}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                marginTop: 6,
                              }}
                            >
                              <button
                                className="admin-btn admin-btn--secondary"
                                disabled={
                                  binding.status === "revoked" ||
                                  bindingActionId === binding.bindingId
                                }
                                onClick={() =>
                                  revokeDriverDeviceBinding(d.driverId, binding)
                                }
                                type="button"
                              >
                                {bindingActionId === binding.bindingId
                                  ? t("fleet.revokingDevice")
                                  : t("fleet.revokeDevice")}
                              </button>
                              <span
                                style={{
                                  color: "var(--admin-text-muted)",
                                  fontSize: 12,
                                }}
                              >
                                {binding.status === "revoked"
                                  ? t("fleet.deviceRevoked")
                                  : t("fleet.deviceRebindHint")}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span>{t("fleet.noDeviceBindings")}</span>
                      )}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {d.eligibilityBlockedReasons.length > 0 ? (
                        d.eligibilityBlockedReasons.map((reason) => (
                          <div key={reason}>
                            {formatPlatformCodeLabel(locale, reason)}
                          </div>
                        ))
                      ) : (
                        <span className="admin-badge admin-badge--success">
                          {t("fleet.noneBlocked")}
                        </span>
                      )}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {(["active", "suspended", "retired"] as const).map(
                          (nextStatus) => {
                            const labelKey =
                              nextStatus === "active"
                                ? "fleet.activateDriver"
                                : nextStatus === "suspended"
                                  ? "fleet.suspendDriver"
                                  : "fleet.retireDriver";
                            const busy =
                              driverActionId === `${d.driverId}:${nextStatus}`;
                            return (
                              <button
                                key={nextStatus}
                                className="admin-btn admin-btn--secondary"
                                disabled={
                                  busy || d.lifecycleStatus === nextStatus
                                }
                                onClick={() =>
                                  runDriverLifecycleAction(
                                    d.driverId,
                                    nextStatus,
                                  )
                                }
                              >
                                {busy ? t("fleet.updatingDriver") : t(labelKey)}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "contracts" &&
          (contracts.length === 0 ? (
            <p className="admin-empty">{t("fleet.noContracts")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("fleet.col.contractId")}</th>
                  <th>{t("fleet.col.vehicleId")}</th>
                  <th>{t("fleet.col.type")}</th>
                  <th>{t("fleet.col.status")}</th>
                  <th>{t("pricing.col.effectiveFrom")}</th>
                  <th>{t("pricing.col.effectiveTo")}</th>
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
                    <td>
                      {c.contractType
                        ? formatPlatformCodeLabel(locale, c.contractType)
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          c.lifecycleStatus === "active"
                            ? "admin-badge--success"
                            : "admin-badge--warning"
                        }`}
                      >
                        {formatPlatformCodeLabel(locale, c.lifecycleStatus)}
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
