/**
 * Fleet & Devices Management Page
 * Vehicle registry, driver registry, and contract management.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  fieldLabelStyle,
  inputStyle,
  textMutedStyle,
} from "@/components/platform-ui";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  ReportJobDetailRecord,
  ReportJobType,
  CreateDriverMasterCommand,
  DriverDeviceBindingSummary,
  DriverRegistryRecord,
  InitiateVehicleOffboardingCommand,
  SubmitExclusivityReviewCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

function badgeClassForLifecycle(status: string) {
  if (status === "active") return "platform-ui-badge--success";
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "retired" ||
    status === "suspended"
  ) {
    return "platform-ui-badge--warning";
  }
  return "platform-ui-badge--neutral";
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

function createInitialExclusivityForm(): SubmitExclusivityReviewCommand {
  return {
    declarationFileId: "",
    exclusiveProviderName: "",
    effectiveStart: "",
    effectiveEnd: "",
  };
}

function createInitialOffboardingForm(): InitiateVehicleOffboardingCommand {
  return {
    reason: "",
    requestedBy: "",
    debrandingRequired: true,
    debrandingDueAt: "",
    debrandingTicketId: "",
    notes: "",
  };
}

const FLEET_REPORT_JOB_TYPES = [
  "vehicle_roster",
  "driver_roster",
  "contract_roster",
] as const satisfies ReportJobType[];

type FleetReportJobType = (typeof FLEET_REPORT_JOB_TYPES)[number];

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export default function FleetPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [contracts, setContracts] = useState<VehicleContractRecord[]>([]);
  const [reportJobs, setReportJobs] = useState<
    Partial<Record<FleetReportJobType, ReportJobDetailRecord>>
  >({});
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
  const [vehicleActionId, setVehicleActionId] = useState<string | null>(null);
  const [reportActionId, setReportActionId] =
    useState<FleetReportJobType | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [exclusivityForm, setExclusivityForm] =
    useState<SubmitExclusivityReviewCommand>(createInitialExclusivityForm());
  const [offboardingForm, setOffboardingForm] =
    useState<InitiateVehicleOffboardingCommand>(createInitialOffboardingForm());

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
      setSelectedVehicleId((current) => {
        if (
          current &&
          (v || []).some((vehicle) => vehicle.vehicleId === current)
        ) {
          return current;
        }
        return v?.[0]?.vehicleId ?? null;
      });
      const jobs = await client.listReportJobs();
      const latestFleetJobs = await FLEET_REPORT_JOB_TYPES.reduce<
        Promise<Partial<Record<FleetReportJobType, ReportJobDetailRecord>>>
      >(async (accumulatorPromise, jobType) => {
        const accumulator = await accumulatorPromise;
        const latestJob = jobs.find((job) => job.jobType === jobType);
        if (!latestJob) {
          return accumulator;
        }
        const detail = await client.getReportJob(latestJob.jobId);
        accumulator[jobType] = detail;
        return accumulator;
      }, Promise.resolve({}));
      setReportJobs(latestFleetJobs);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId) ??
    vehicles[0] ??
    null;
  const pendingOffboardingVehicles = vehicles.filter((vehicle) => {
    const offboardingStatus = vehicle.supplyLifecycle.offboarding.status;
    return offboardingStatus !== "none" && offboardingStatus !== "completed";
  });
  const complianceWarnings = [
    ...vehicles
      .filter(
        (vehicle) =>
          !vehicle.dispatchableFlag ||
          vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
      )
      .map((vehicle) => ({
        id: vehicle.vehicleId,
        message:
          locale === "en"
            ? `${vehicle.vehicleId} is not dispatchable until compliance holds are cleared.`
            : `${vehicle.vehicleId} 仍不可派遣，需先清除合規 hold。`,
      })),
    ...drivers
      .filter(
        (driver) =>
          !driver.dispatchEligible ||
          driver.eligibilityBlockedReasons.length > 0,
      )
      .map((driver) => ({
        id: driver.driverId,
        message:
          locale === "en"
            ? `${driver.driverId} is blocked from dispatch eligibility review.`
            : `${driver.driverId} 目前被阻擋，需完成派遣資格審查。`,
      })),
  ].slice(0, 5);
  const fleetWorkflowCopy =
    locale === "en"
      ? {
          summaryTitle: "Compliance workflow",
          summaryNote:
            "Drivers, vehicles, contracts, exclusivity, and offboarding stay visible in one governance lane so operators can clear dispatch blockers before publication or payout windows.",
          blockedVehicles: "Blocked vehicles",
          blockedDrivers: "Blocked drivers",
          pendingExclusivity: "Pending exclusivity",
          pendingOffboarding: "Pending offboarding",
          exportVehicles: "Export vehicles",
          exportDrivers: "Export drivers",
          exportContracts: "Export contracts",
          exportHint:
            "Exports create governed report jobs and only download server-signed artifacts.",
          exportIdle: "No governed artifact generated yet.",
          exportPending: "Preparing governed export…",
          exportReady: "Latest artifact ready",
          exportOpen: "Open signed download",
          warningTitle: "Immediate warnings",
        }
      : {
          summaryTitle: "合規流程總覽",
          summaryNote:
            "把司機、車輛、合約、獨家供應與下線流程放在同一條治理視角，方便先清掉 dispatch blocker，再進入發布或結算窗口。",
          blockedVehicles: "受阻車輛",
          blockedDrivers: "受阻司機",
          pendingExclusivity: "待審獨家供應",
          pendingOffboarding: "待完成下線",
          exportVehicles: "匯出車輛",
          exportDrivers: "匯出司機",
          exportContracts: "匯出合約",
          exportHint:
            "匯出會建立受治理的 report job，只透過伺服器簽發的 artifact URL 下載。",
          exportIdle: "尚未建立受治理 artifact。",
          exportPending: "正在準備受治理匯出…",
          exportReady: "最新 artifact 已就緒",
          exportOpen: "開啟簽名下載",
          warningTitle: "即時警示",
        };

  const requestFleetReport = useCallback(
    async (jobType: FleetReportJobType) => {
      setReportActionId(jobType);
      setError(null);
      try {
        const accepted = await client.createReportJob({
          jobType,
          format: "xlsx",
        });
        let detail: ReportJobDetailRecord | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          detail = await client.getReportJob(accepted.jobId);
          if (detail.artifact?.downloadMetadata.downloadUrl) {
            break;
          }
          await sleep(150);
        }
        if (!detail) {
          throw new Error("Unable to load report job detail.");
        }
        setReportJobs((current) => ({
          ...current,
          [jobType]: detail,
        }));
        if (detail.artifact?.downloadMetadata.downloadUrl) {
          window.open(
            detail.artifact.downloadMetadata.downloadUrl,
            "_blank",
            "noopener,noreferrer",
          );
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setReportActionId(null);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }
    setExclusivityForm({
      declarationFileId:
        selectedVehicle.supplyLifecycle.exclusivity.declarationFileId ?? "",
      exclusiveProviderName:
        selectedVehicle.supplyLifecycle.exclusivity.providerName ?? "",
      effectiveStart:
        selectedVehicle.supplyLifecycle.exclusivity.effectiveStart ?? "",
      effectiveEnd:
        selectedVehicle.supplyLifecycle.exclusivity.effectiveEnd ?? "",
    });
    setOffboardingForm({
      reason: selectedVehicle.supplyLifecycle.offboarding.reason ?? "",
      requestedBy:
        selectedVehicle.supplyLifecycle.offboarding.requestedBy ?? "",
      effectiveAt:
        selectedVehicle.supplyLifecycle.offboarding.effectiveAt ?? "",
      debrandingRequired:
        selectedVehicle.supplyLifecycle.offboarding.debrandingRequired,
      debrandingDueAt:
        selectedVehicle.supplyLifecycle.offboarding.debrandingDueAt ?? "",
      debrandingTicketId:
        selectedVehicle.supplyLifecycle.offboarding.debrandingTicketId ?? "",
      notes: selectedVehicle.supplyLifecycle.offboarding.notes ?? "",
    });
  }, [selectedVehicle]);

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

  const setVehicleDispatchable = useCallback(
    async (vehicleId: string, dispatchableFlag: boolean) => {
      setVehicleActionId(`${vehicleId}:dispatch:${dispatchableFlag}`);
      setError(null);
      try {
        await client.updateVehicleCompliance(vehicleId, { dispatchableFlag });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, loadData],
  );

  const submitVehicleExclusivity = useCallback(
    async (vehicleId: string) => {
      setVehicleActionId(`${vehicleId}:exclusivity:submit`);
      setError(null);
      try {
        await client.submitExclusivityReview(vehicleId, {
          declarationFileId: exclusivityForm.declarationFileId?.trim() || null,
          exclusiveProviderName:
            exclusivityForm.exclusiveProviderName?.trim() || null,
          effectiveStart: exclusivityForm.effectiveStart?.trim() || null,
          effectiveEnd: exclusivityForm.effectiveEnd?.trim() || null,
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, exclusivityForm, loadData],
  );

  const approveVehicleExclusivity = useCallback(
    async (vehicleId: string) => {
      setVehicleActionId(`${vehicleId}:exclusivity:approve`);
      setError(null);
      try {
        await client.approveExclusivity(vehicleId, {
          reviewerId: "platform-admin-web",
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, loadData],
  );

  const rejectVehicleExclusivity = useCallback(
    async (vehicleId: string) => {
      setVehicleActionId(`${vehicleId}:exclusivity:reject`);
      setError(null);
      try {
        await client.rejectExclusivity(vehicleId, {
          reviewerId: "platform-admin-web",
          reason: "Rejected from fleet admin review console.",
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, loadData],
  );

  const startVehicleOffboarding = useCallback(
    async (vehicleId: string) => {
      setVehicleActionId(`${vehicleId}:offboarding:start`);
      setError(null);
      try {
        await client.initiateVehicleOffboarding(vehicleId, {
          reason: offboardingForm.reason.trim(),
          requestedBy: offboardingForm.requestedBy?.trim() || null,
          effectiveAt: offboardingForm.effectiveAt?.trim() || null,
          debrandingRequired: offboardingForm.debrandingRequired ?? true,
          debrandingDueAt: offboardingForm.debrandingDueAt?.trim() || null,
          debrandingTicketId:
            offboardingForm.debrandingTicketId?.trim() || null,
          notes: offboardingForm.notes?.trim() || null,
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, loadData, offboardingForm],
  );

  const completeVehicleDebranding = useCallback(
    async (vehicleId: string) => {
      setVehicleActionId(`${vehicleId}:offboarding:complete`);
      setError(null);
      try {
        await client.completeVehicleDebranding(vehicleId, {
          debrandingTicketId:
            offboardingForm.debrandingTicketId?.trim() || null,
          notes: offboardingForm.notes?.trim() || null,
        });
        await loadData();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setVehicleActionId(null);
      }
    },
    [client, loadData, offboardingForm],
  );

  if (loading)
    return <div className="platform-ui-empty">{t("fleet.loading")}</div>;

  return (
    <div>
      <div className="platform-ui-page-header">
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
          className="platform-ui-card"
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
        <div
          className="platform-ui-card"
          style={{ marginBottom: 0, background: "rgba(15,118,110,0.04)" }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
            {fleetWorkflowCopy.summaryTitle}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
            {fleetWorkflowCopy.summaryNote}
          </p>
        </div>
        {[
          {
            label: fleetWorkflowCopy.blockedVehicles,
            value: vehicles.filter(
              (vehicle) =>
                !vehicle.dispatchableFlag ||
                vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
            ).length,
          },
          {
            label: fleetWorkflowCopy.blockedDrivers,
            value: drivers.filter(
              (driver) =>
                !driver.dispatchEligible ||
                driver.eligibilityBlockedReasons.length > 0,
            ).length,
          },
          {
            label: fleetWorkflowCopy.pendingExclusivity,
            value: vehicles.filter(
              (vehicle) =>
                vehicle.supplyLifecycle.exclusivity.reviewStatus === "pending",
            ).length,
          },
          {
            label: fleetWorkflowCopy.pendingOffboarding,
            value: pendingOffboardingVehicles.length,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="platform-ui-card"
            style={{ marginBottom: 0 }}
          >
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
              {card.label}
            </p>
            <strong style={{ display: "block", fontSize: 24 }}>
              {card.value}
            </strong>
          </div>
        ))}
      </div>

      {complianceWarnings.length > 0 && (
        <div
          className="platform-ui-card"
          style={{
            borderColor: "rgba(245,158,11,0.28)",
            background: "rgba(245,158,11,0.06)",
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
            {fleetWorkflowCopy.warningTitle}
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {complianceWarnings.map((warning) => (
              <div key={warning.id} style={{ fontSize: 13, color: "#92400e" }}>
                {warning.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="platform-ui-toolbar">
        <div className="platform-ui-toggle-group">
          <button
            className={`platform-ui-toggle-btn ${activeTab === "vehicles" ? "active" : ""}`}
            onClick={() => setActiveTab("vehicles")}
          >
            {t("fleet.tab.vehicles")} ({vehicles.length})
          </button>
          <button
            className={`platform-ui-toggle-btn ${activeTab === "drivers" ? "active" : ""}`}
            onClick={() => setActiveTab("drivers")}
          >
            {t("fleet.tab.drivers")} ({drivers.length})
          </button>
          <button
            className={`platform-ui-toggle-btn ${activeTab === "contracts" ? "active" : ""}`}
            onClick={() => setActiveTab("contracts")}
          >
            {t("fleet.tab.contracts")} ({contracts.length})
          </button>
        </div>
        {(
          [
            ["vehicle_roster", fleetWorkflowCopy.exportVehicles],
            ["driver_roster", fleetWorkflowCopy.exportDrivers],
            ["contract_roster", fleetWorkflowCopy.exportContracts],
          ] as const
        ).map(([jobType, label]) => (
          <button
            key={jobType}
            className="platform-ui-btn platform-ui-btn--secondary"
            type="button"
            disabled={reportActionId === jobType}
            onClick={() => void requestFleetReport(jobType)}
          >
            {reportActionId === jobType
              ? fleetWorkflowCopy.exportPending
              : label}
          </button>
        ))}
        <button
          className="platform-ui-btn platform-ui-btn--secondary"
          onClick={loadData}
        >
          {t("common.refresh")}
        </button>
      </div>

      <div
        className="platform-ui-card"
        style={{
          marginTop: -4,
          marginBottom: 16,
          background: "rgba(59,130,246,0.04)",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#374151" }}>
          {fleetWorkflowCopy.exportHint}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {(
            [
              ["vehicle_roster", fleetWorkflowCopy.exportVehicles],
              ["driver_roster", fleetWorkflowCopy.exportDrivers],
              ["contract_roster", fleetWorkflowCopy.exportContracts],
            ] as const
          ).map(([jobType, label]) => {
            const reportJob = reportJobs[jobType];
            return (
              <div
                key={`${jobType}:artifact`}
                style={{
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.72)",
                }}
              >
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{label}</p>
                <p
                  style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}
                >
                  {reportJob?.artifact
                    ? `${fleetWorkflowCopy.exportReady} · ${formatDateTime(reportJob.artifact.expiresAt)}`
                    : reportActionId === jobType
                      ? fleetWorkflowCopy.exportPending
                      : fleetWorkflowCopy.exportIdle}
                </p>
                {reportJob?.artifact && (
                  <a
                    className="platform-ui-btn platform-ui-btn--secondary"
                    href={reportJob.artifact.downloadMetadata.downloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {fleetWorkflowCopy.exportOpen}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {activeTab === "drivers" && (
        <div className="platform-ui-card" style={{ marginBottom: 16 }}>
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
              <div style={fieldLabelStyle}>{t("fleet.col.name")}</div>
              <input
                style={inputStyle}
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
              <div style={fieldLabelStyle}>{t("fleet.form.phone")}</div>
              <input
                style={inputStyle}
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
              <div style={fieldLabelStyle}>{t("fleet.form.email")}</div>
              <input
                style={inputStyle}
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
              className="platform-ui-btn"
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

      <div className="platform-ui-card" style={{ overflowX: "auto" }}>
        {activeTab === "vehicles" &&
          (vehicles.length === 0 ? (
            <p className="platform-ui-empty">{t("fleet.noVehicles")}</p>
          ) : (
            <>
              <table className="platform-ui-table">
                <thead>
                  <tr>
                    <th>{t("fleet.col.vehicleId")}</th>
                    <th>{t("fleet.col.plate")}</th>
                    <th>{t("fleet.col.dispatchable")}</th>
                    <th>{t("fleet.col.area")}</th>
                    <th>{t("fleet.col.contract")}</th>
                    <th>{t("fleet.col.insurance")}</th>
                    <th>{t("fleet.col.exclusivity")}</th>
                    <th>{t("fleet.col.offboarding")}</th>
                    <th>{t("fleet.col.blockedBy")}</th>
                    <th>{t("fleet.col.lastChange")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr
                      key={v.vehicleId}
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      style={{
                        cursor: "pointer",
                        background:
                          selectedVehicle?.vehicleId === v.vehicleId
                            ? "rgba(15, 23, 42, 0.04)"
                            : undefined,
                      }}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {v.vehicleId}
                      </td>
                      <td>{v.plateNo || "—"}</td>
                      <td>
                        <span
                          className={`platform-ui-badge ${
                            v.dispatchableFlag
                              ? "platform-ui-badge--success"
                              : "platform-ui-badge--neutral"
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
                          className={`platform-ui-badge ${badgeClassForLifecycle(v.supplyLifecycle.contract.lifecycleStatus)}`}
                        >
                          {formatPlatformCodeLabel(
                            locale,
                            v.supplyLifecycle.contract.lifecycleStatus,
                          )}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`platform-ui-badge ${badgeClassForLifecycle(v.supplyLifecycle.insurance.lifecycleStatus)}`}
                        >
                          {formatPlatformCodeLabel(
                            locale,
                            v.supplyLifecycle.insurance.lifecycleStatus,
                          )}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`platform-ui-badge ${badgeClassForLifecycle(v.supplyLifecycle.exclusivity.lifecycleStatus)}`}
                        >
                          {formatPlatformCodeLabel(
                            locale,
                            v.supplyLifecycle.exclusivity.lifecycleStatus,
                          )}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`platform-ui-badge ${badgeClassForLifecycle(v.supplyLifecycle.offboarding.status)}`}
                        >
                          {formatPlatformCodeLabel(
                            locale,
                            v.supplyLifecycle.offboarding.status,
                          )}
                        </span>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        {v.supplyLifecycle.dispatch.blockedReasons.length >
                        0 ? (
                          v.supplyLifecycle.dispatch.blockedReasons.map(
                            (reason) => (
                              <div key={reason}>
                                {formatPlatformCodeLabel(locale, reason)}
                              </div>
                            ),
                          )
                        ) : (
                          <span className="platform-ui-badge platform-ui-badge--success">
                            {t("fleet.noneBlocked")}
                          </span>
                        )}
                      </td>
                      <td style={{ minWidth: 220 }}>
                        {v.supplyLifecycle.lastTrace ? (
                          <div>
                            <div>{v.supplyLifecycle.lastTrace.message}</div>
                            <div style={textMutedStyle}>
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

              {selectedVehicle && (
                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  }}
                >
                  <div className="platform-ui-card">
                    <h3 style={{ marginTop: 0 }}>
                      {t("fleet.detail.dispatch")}
                    </h3>
                    <p style={{ marginTop: 0 }}>
                      <strong>{selectedVehicle.vehicleId}</strong> ·{" "}
                      {selectedVehicle.plateNo || "—"}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {selectedVehicle.supplyLifecycle.dispatch.blockedReasons.map(
                        (reason) => (
                          <span
                            key={reason}
                            className="platform-ui-badge platform-ui-badge--warning"
                          >
                            {formatPlatformCodeLabel(locale, reason)}
                          </span>
                        ),
                      )}
                      {selectedVehicle.supplyLifecycle.dispatch.blockedReasons
                        .length === 0 && (
                        <span className="platform-ui-badge platform-ui-badge--success">
                          {t("fleet.noneBlocked")}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                            `${selectedVehicle.vehicleId}:dispatch:true` ||
                          selectedVehicle.dispatchableFlag
                        }
                        onClick={() =>
                          setVehicleDispatchable(
                            selectedVehicle.vehicleId,
                            true,
                          )
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:dispatch:true`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.markDispatchable")}
                      </button>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                            `${selectedVehicle.vehicleId}:dispatch:false` ||
                          !selectedVehicle.dispatchableFlag
                        }
                        onClick={() =>
                          setVehicleDispatchable(
                            selectedVehicle.vehicleId,
                            false,
                          )
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:dispatch:false`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.placeDispatchHold")}
                      </button>
                    </div>
                  </div>

                  <div className="platform-ui-card">
                    <h3 style={{ marginTop: 0 }}>
                      {t("fleet.detail.insurance")}
                    </h3>
                    <p style={{ margin: "0 0 6px" }}>
                      {t("fleet.detail.policyId")}:{" "}
                      {selectedVehicle.supplyLifecycle.insurance.policyId ??
                        "—"}
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      {t("fleet.detail.window")}:{" "}
                      {selectedVehicle.supplyLifecycle.insurance.startAt
                        ? `${formatDateTime(selectedVehicle.supplyLifecycle.insurance.startAt)} - ${formatDateTime(selectedVehicle.supplyLifecycle.insurance.endAt || "")}`
                        : "—"}
                    </p>
                    <span
                      className={`platform-ui-badge ${badgeClassForLifecycle(selectedVehicle.supplyLifecycle.insurance.lifecycleStatus)}`}
                    >
                      {formatPlatformCodeLabel(
                        locale,
                        selectedVehicle.supplyLifecycle.insurance
                          .lifecycleStatus,
                      )}
                    </span>
                  </div>

                  <div className="platform-ui-card">
                    <h3 style={{ marginTop: 0 }}>
                      {t("fleet.detail.exclusivity")}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "1fr 1fr",
                      }}
                    >
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.provider")}
                        </div>
                        <input
                          style={inputStyle}
                          value={exclusivityForm.exclusiveProviderName ?? ""}
                          onChange={(event) =>
                            setExclusivityForm((current) => ({
                              ...current,
                              exclusiveProviderName: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.declarationFile")}
                        </div>
                        <input
                          style={inputStyle}
                          value={exclusivityForm.declarationFileId ?? ""}
                          onChange={(event) =>
                            setExclusivityForm((current) => ({
                              ...current,
                              declarationFileId: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.effectiveStart")}
                        </div>
                        <input
                          style={inputStyle}
                          placeholder="2026-12-31T00:00:00.000Z"
                          value={exclusivityForm.effectiveStart ?? ""}
                          onChange={(event) =>
                            setExclusivityForm((current) => ({
                              ...current,
                              effectiveStart: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.effectiveEnd")}
                        </div>
                        <input
                          style={inputStyle}
                          placeholder="2026-12-31T23:59:59.000Z"
                          value={exclusivityForm.effectiveEnd ?? ""}
                          onChange={(event) =>
                            setExclusivityForm((current) => ({
                              ...current,
                              effectiveEnd: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div style={{ marginTop: 12, marginBottom: 12 }}>
                      <span
                        className={`platform-ui-badge ${badgeClassForLifecycle(selectedVehicle.supplyLifecycle.exclusivity.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          selectedVehicle.supplyLifecycle.exclusivity
                            .lifecycleStatus,
                        )}
                      </span>{" "}
                      <span style={textMutedStyle}>
                        {formatPlatformCodeLabel(
                          locale,
                          selectedVehicle.supplyLifecycle.exclusivity
                            .reviewStatus,
                        )}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                          `${selectedVehicle.vehicleId}:exclusivity:submit`
                        }
                        onClick={() =>
                          submitVehicleExclusivity(selectedVehicle.vehicleId)
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:exclusivity:submit`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.submitExclusivity")}
                      </button>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                          `${selectedVehicle.vehicleId}:exclusivity:approve`
                        }
                        onClick={() =>
                          approveVehicleExclusivity(selectedVehicle.vehicleId)
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:exclusivity:approve`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.approveExclusivity")}
                      </button>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                          `${selectedVehicle.vehicleId}:exclusivity:reject`
                        }
                        onClick={() =>
                          rejectVehicleExclusivity(selectedVehicle.vehicleId)
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:exclusivity:reject`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.rejectExclusivity")}
                      </button>
                    </div>
                  </div>

                  <div className="platform-ui-card">
                    <h3 style={{ marginTop: 0 }}>
                      {t("fleet.detail.offboarding")}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "1fr 1fr",
                      }}
                    >
                      <label style={{ gridColumn: "1 / -1" }}>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.offboardingReason")}
                        </div>
                        <input
                          style={inputStyle}
                          value={offboardingForm.reason}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              reason: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.requestedBy")}
                        </div>
                        <input
                          style={inputStyle}
                          value={offboardingForm.requestedBy ?? ""}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              requestedBy: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.debrandingTicket")}
                        </div>
                        <input
                          style={inputStyle}
                          value={offboardingForm.debrandingTicketId ?? ""}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              debrandingTicketId: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.effectiveStart")}
                        </div>
                        <input
                          style={inputStyle}
                          placeholder="2026-12-31T00:00:00.000Z"
                          value={offboardingForm.effectiveAt ?? ""}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              effectiveAt: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div style={fieldLabelStyle}>
                          {t("fleet.form.debrandingDueAt")}
                        </div>
                        <input
                          style={inputStyle}
                          placeholder="2026-12-31T23:59:59.000Z"
                          value={offboardingForm.debrandingDueAt ?? ""}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              debrandingDueAt: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          gridColumn: "1 / -1",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={offboardingForm.debrandingRequired ?? true}
                          onChange={(event) =>
                            setOffboardingForm((current) => ({
                              ...current,
                              debrandingRequired: event.target.checked,
                            }))
                          }
                        />
                        <span>{t("fleet.form.debrandingRequired")}</span>
                      </label>
                    </div>
                    <p
                      style={{
                        ...textMutedStyle,
                        marginTop: 12,
                        marginBottom: 12,
                      }}
                    >
                      {t("fleet.detail.debrandingStatus")}:{" "}
                      {formatPlatformCodeLabel(
                        locale,
                        selectedVehicle.supplyLifecycle.offboarding
                          .debrandingStatus,
                      )}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                          `${selectedVehicle.vehicleId}:offboarding:start`
                        }
                        onClick={() =>
                          startVehicleOffboarding(selectedVehicle.vehicleId)
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:offboarding:start`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.startOffboarding")}
                      </button>
                      <button
                        className="platform-ui-btn platform-ui-btn--secondary"
                        type="button"
                        disabled={
                          vehicleActionId ===
                            `${selectedVehicle.vehicleId}:offboarding:complete` ||
                          selectedVehicle.supplyLifecycle.offboarding
                            .debrandingStatus !== "pending"
                        }
                        onClick={() =>
                          completeVehicleDebranding(selectedVehicle.vehicleId)
                        }
                      >
                        {vehicleActionId ===
                        `${selectedVehicle.vehicleId}:offboarding:complete`
                          ? t("fleet.updatingVehicle")
                          : t("fleet.completeDebranding")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ))}

        {activeTab === "drivers" &&
          (drivers.length === 0 ? (
            <p className="platform-ui-empty">{t("fleet.noDrivers")}</p>
          ) : (
            <table className="platform-ui-table">
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
                      <div style={textMutedStyle}>
                        {d.dispatchEligible
                          ? t("fleet.driverDispatchEligible")
                          : t("fleet.driverNotEligible")}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`platform-ui-badge ${badgeClassForLifecycle(d.lifecycleStatus)}`}
                      >
                        {formatPlatformCodeLabel(locale, d.lifecycleStatus)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`platform-ui-badge ${
                          d.workState === "available"
                            ? "platform-ui-badge--success"
                            : "platform-ui-badge--neutral"
                        }`}
                      >
                        {formatPlatformCodeLabel(locale, d.workState)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`platform-ui-badge ${
                          d.licensesValid
                            ? "platform-ui-badge--success"
                            : "platform-ui-badge--warning"
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
                      <div style={textMutedStyle}>
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
                            <div style={textMutedStyle}>
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
                                className="platform-ui-btn platform-ui-btn--secondary"
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
                              <span style={textMutedStyle}>
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
                        <span className="platform-ui-badge platform-ui-badge--success">
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
                                className="platform-ui-btn platform-ui-btn--secondary"
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
            <p className="platform-ui-empty">{t("fleet.noContracts")}</p>
          ) : (
            <table className="platform-ui-table">
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
                        className={`platform-ui-badge ${
                          c.lifecycleStatus === "active"
                            ? "platform-ui-badge--success"
                            : "platform-ui-badge--warning"
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
