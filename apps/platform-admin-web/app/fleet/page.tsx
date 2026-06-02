/**
 * /fleet — 車隊與合規治理 (Platform Admin canvas body parity: PA_Fleet)
 *
 * Canvas authority:
 *   docs/05-ui/drts-design-canvas/platform-screens-2.jsx  → PA_Fleet
 *   docs/05-ui/platform-admin-body-parity-audit-20260602.md §7.8
 *
 * Six canvas tabs: Vehicles · Drivers · Contracts · Device Binding ·
 * Exclusivity Reviews (Q-ADM08) · Offboarding state machine (Q-ADM09).
 * Renders inside the fixed Platform Admin shell (PR #485); this file owns the
 * <main> body only. Live data comes from the platform-admin API client; state
 * changing CTAs are descriptor-driven (enabled / disabledReasonCode / risk /
 * requiresReason) with an audit receipt after each mutation.
 */

"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildCanvasTheme,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreateDriverMasterCommand,
  DriverRegistryRecord,
  InitiateVehicleOffboardingCommand,
  ReportJobDetailRecord,
  ReportJobType,
  SubmitExclusivityReviewCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

const TH = buildCanvasTheme({ surface: "platform" });

const FLEET_TABS = [
  { id: "vehicles", label: "Vehicles" },
  { id: "drivers", label: "Drivers" },
  { id: "contracts", label: "Contracts" },
  { id: "device", label: "Device Binding" },
  { id: "exclusivity", label: "Exclusivity Reviews" },
  { id: "offboard", label: "Offboarding" },
] as const;

type FleetTab = (typeof FLEET_TABS)[number]["id"];

const FLEET_REPORT_JOB_TYPES = [
  "vehicle_roster",
  "driver_roster",
  "contract_roster",
] as const satisfies ReportJobType[];

type FleetReportJobType = (typeof FLEET_REPORT_JOB_TYPES)[number];

// ── descriptor-driven action affordance ──────────────────────────────────────

type RiskLevel = "low" | "medium" | "high";

interface ActionDescriptor {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  riskLevel?: RiskLevel;
  requiresReason?: boolean;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(11, 18, 32, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const dialogStyle: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: TH.surface,
  border: `1px solid ${TH.border}`,
  borderRadius: 12,
  boxShadow: TH.shadow,
  padding: 18,
  display: "grid",
  gap: 12,
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
};

const modalLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: TH.text,
  marginBottom: 5,
  display: "block",
};

const modalInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: TH.bgRaised,
  border: `1px solid ${TH.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: TH.text,
  fontFamily: TH.fontFamily,
};

function riskCopy(risk: RiskLevel | undefined, locale: Locale) {
  if (risk === "high") {
    return locale === "en"
      ? "High-risk action · a reason is recorded to the audit trail."
      : "高風險操作 · 原因會寫入稽核軌跡。";
  }
  return locale === "en"
    ? "This action is recorded to the audit trail."
    : "此操作會寫入稽核軌跡。";
}

function ConfirmDialog({
  descriptor,
  title,
  locale,
  busy,
  onCancel,
  onConfirm,
}: {
  descriptor: ActionDescriptor;
  title: ReactNode;
  locale: Locale;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const reasonRequired = Boolean(descriptor.requiresReason);
  const canConfirm = !busy && (!reasonRequired || reason.trim().length > 0);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={dialogStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TH.text }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: TH.textMuted, lineHeight: 1.5 }}>
          {riskCopy(descriptor.riskLevel, locale)}
        </div>
        {reasonRequired ? (
          <div>
            <label style={modalLabelStyle}>
              {locale === "en" ? "Reason (required)" : "原因（必填）"}
            </label>
            <textarea
              style={{ ...modalInputStyle, minHeight: 72, resize: "vertical" }}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <CanvasBtn theme={TH} variant="ghost" onClick={onCancel}>
            {locale === "en" ? "Cancel" : "取消"}
          </CanvasBtn>
          <CanvasBtn
            theme={TH}
            variant="primary"
            danger={descriptor.riskLevel === "high"}
            disabled={!canConfirm}
            onClick={() => onConfirm(reasonRequired ? reason.trim() : null)}
          >
            {busy
              ? locale === "en"
                ? "Working…"
                : "處理中…"
              : locale === "en"
                ? "Confirm"
                : "確認"}
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  descriptor,
  label,
  confirmTitle,
  locale,
  busy = false,
  icon,
  variant = "secondary",
  size = "xs",
  onRun,
}: {
  descriptor: ActionDescriptor;
  label: ReactNode;
  confirmTitle: ReactNode;
  locale: Locale;
  busy?: boolean;
  icon?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  onRun: (reason: string | null) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const needsConfirm =
    descriptor.riskLevel === "high" ||
    descriptor.riskLevel === "medium" ||
    Boolean(descriptor.requiresReason);
  const disabled = !descriptor.enabled || busy;

  const handleClick = () => {
    if (disabled) {
      return;
    }
    if (needsConfirm) {
      setOpen(true);
    } else {
      void onRun(null);
    }
  };

  return (
    <>
      <CanvasBtn
        theme={TH}
        size={size}
        variant={variant}
        danger={descriptor.riskLevel === "high" && variant !== "primary"}
        icon={icon}
        disabled={disabled}
        onClick={handleClick}
        style={!descriptor.enabled ? { cursor: "not-allowed" } : {}}
      >
        {busy ? "…" : label}
      </CanvasBtn>
      {!descriptor.enabled && descriptor.disabledReasonCode ? (
        <span
          style={{
            fontSize: 10,
            color: TH.textDim,
            marginLeft: 4,
            fontFamily: TH.monoFamily,
          }}
        >
          {descriptor.disabledReasonCode}
        </span>
      ) : null}
      {open ? (
        <ConfirmDialog
          descriptor={descriptor}
          title={confirmTitle}
          locale={locale}
          busy={busy}
          onCancel={() => setOpen(false)}
          onConfirm={async (reason) => {
            await onRun(reason);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// ── form factories ───────────────────────────────────────────────────────────

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
    effectiveAt: "",
    debrandingRequired: true,
    debrandingDueAt: "",
    debrandingTicketId: "",
    notes: "",
  };
}

// ── tone helpers ─────────────────────────────────────────────────────────────

function lifecycleTone(status: string): CanvasTone {
  if (status === "active" || status === "valid") {
    return "success";
  }
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "retired" ||
    status === "suspended"
  ) {
    return "warn";
  }
  return "neutral";
}

function reviewTone(state: string): CanvasTone {
  if (state === "approved") {
    return "success";
  }
  if (state === "rejected") {
    return "danger";
  }
  if (state === "pending") {
    return "info";
  }
  return "warn";
}

function offboardTone(status: string): CanvasTone {
  if (status === "completed") {
    return "success";
  }
  if (status === "debranding_pending" || status === "none") {
    return "warn";
  }
  return "info";
}

function EmptyState({ message }: { message: ReactNode }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        color: TH.textMuted,
        fontSize: 12.5,
      }}
    >
      {message}
    </div>
  );
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function FleetPage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <FleetPageBody />
    </Suspense>
  );
}

function FleetPageBody() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [contracts, setContracts] = useState<VehicleContractRecord[]>([]);
  const [reportJobs, setReportJobs] = useState<
    Partial<Record<FleetReportJobType, ReportJobDetailRecord>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The active tab is sourced from the URL so canvas deep links such as
  // /fleet?tab=vehicles are preserved and shareable.
  const tabParam = searchParams.get("tab");
  const activeTab: FleetTab = FLEET_TABS.some(
    (tabDef) => tabDef.id === tabParam,
  )
    ? (tabParam as FleetTab)
    : "vehicles";
  const selectTab = useCallback(
    (next: FleetTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [complianceOnly, setComplianceOnly] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ title: string; at: string } | null>(
    null,
  );

  const [createDriverOpen, setCreateDriverOpen] = useState(false);
  const [driverForm, setDriverForm] = useState<CreateDriverMasterCommand>(
    createInitialDriverForm(),
  );

  const [offboardOpen, setOffboardOpen] = useState(false);
  const [offboardVehicleId, setOffboardVehicleId] = useState("");
  const [offboardForm, setOffboardForm] =
    useState<InitiateVehicleOffboardingCommand>(createInitialOffboardingForm());

  const [exclusivityOpen, setExclusivityOpen] = useState(false);
  const [exclusivityVehicleId, setExclusivityVehicleId] = useState("");
  const [exclusivityForm, setExclusivityForm] =
    useState<SubmitExclusivityReviewCommand>(createInitialExclusivityForm());

  // reportJobs is surfaced through download-on-export; keep the latest known
  // artifact handles for re-open without re-running the governed job.
  void reportJobs;

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runGuarded = useCallback(
    async (
      key: string,
      receiptLabel: string,
      fn: () => Promise<unknown>,
    ): Promise<void> => {
      setBusyAction(key);
      setError(null);
      try {
        await fn();
        setReceipt({ title: receiptLabel, at: new Date().toISOString() });
        await loadData();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(null);
      }
    },
    [loadData],
  );

  const requestFleetReport = useCallback(
    async (jobType: FleetReportJobType) => {
      const key = `report:${jobType}`;
      setBusyAction(key);
      setError(null);
      try {
        const accepted = await client.createReportJob({
          jobType,
          format: "xlsx",
        });
        let detail: ReportJobDetailRecord | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          detail = await client.getReportJob(accepted.jobId);
          if (detail?.artifact?.downloadMetadata.downloadUrl) {
            break;
          }
          await sleep(150);
        }
        if (!detail) {
          throw new Error("Unable to load report job detail.");
        }
        setReportJobs((current) => ({ ...current, [jobType]: detail }));
        if (detail.artifact?.downloadMetadata.downloadUrl) {
          window.open(
            detail.artifact.downloadMetadata.downloadUrl,
            "_blank",
            "noopener,noreferrer",
          );
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(null);
      }
    },
    [client],
  );

  // ── derived counts ──────────────────────────────────────────────────────────

  const pendingExclusivity = useMemo(
    () =>
      vehicles.filter(
        (v) => v.supplyLifecycle.exclusivity.reviewStatus === "pending",
      ).length,
    [vehicles],
  );
  const pendingOffboarding = useMemo(
    () =>
      vehicles.filter((v) => {
        const status = v.supplyLifecycle.offboarding.status;
        return status !== "none" && status !== "completed";
      }).length,
    [vehicles],
  );
  const expiringLicenses = useMemo(
    () => drivers.filter((d) => !d.licensesValid).length,
    [drivers],
  );

  const tabCounts: Record<FleetTab, number> = {
    vehicles: vehicles.length,
    drivers: drivers.length,
    contracts: contracts.length,
    device: drivers.reduce((sum, d) => sum + d.deviceBindings.length, 0),
    exclusivity: vehicles.filter(
      (v) =>
        v.supplyLifecycle.exclusivity.reviewStatus !== "draft" ||
        v.supplyLifecycle.exclusivity.declarationStatus === "submitted",
    ).length,
    offboard: pendingOffboarding,
  };

  const tabBadge: Partial<
    Record<FleetTab, { count: number; tone: CanvasTone }>
  > = {
    exclusivity: { count: pendingExclusivity, tone: "warn" },
    offboard: { count: pendingOffboarding, tone: "accent" },
  };

  // ── mutations (descriptor-driven) ────────────────────────────────────────────

  const toggleVehicleDispatch = useCallback(
    (vehicle: VehicleRegistryRecord, next: boolean) =>
      runGuarded(
        `vehicle:${vehicle.vehicleId}:dispatch`,
        locale === "en"
          ? `Vehicle ${vehicle.vehicleId} dispatch updated`
          : `已更新車輛 ${vehicle.vehicleId} 派遣狀態`,
        () =>
          client.updateVehicleCompliance(vehicle.vehicleId, {
            dispatchableFlag: next,
          }),
      ),
    [client, locale, runGuarded],
  );

  const runDriverLifecycle = useCallback(
    (
      driver: DriverRegistryRecord,
      next: DriverRegistryRecord["lifecycleStatus"],
      reason: string | null,
    ) =>
      runGuarded(
        `driver:${driver.driverId}:${next}`,
        locale === "en"
          ? `Driver ${driver.driverId} → ${next}`
          : `司機 ${driver.driverId} → ${next}`,
        () =>
          client.updateDriverMasterLifecycle(driver.driverId, {
            lifecycleStatus: next,
            reason: reason ?? null,
          }),
      ),
    [client, locale, runGuarded],
  );

  const revokeBinding = useCallback(
    (bindingId: string, deviceId: string) =>
      runGuarded(
        `binding:${bindingId}`,
        locale === "en"
          ? `Device binding ${bindingId} revoked`
          : `已撤銷裝置綁定 ${bindingId}`,
        () => client.revokeDriverDeviceBinding({ bindingId, deviceId }),
      ),
    [client, locale, runGuarded],
  );

  const approveReview = useCallback(
    (vehicle: VehicleRegistryRecord) =>
      runGuarded(
        `exclusivity:${vehicle.vehicleId}:approve`,
        locale === "en"
          ? `Exclusivity approved for ${vehicle.vehicleId}`
          : `已核准 ${vehicle.vehicleId} 獨家審查`,
        () =>
          client.approveExclusivity(vehicle.vehicleId, {
            reviewerId: "platform-admin-web",
          }),
      ),
    [client, locale, runGuarded],
  );

  const rejectReview = useCallback(
    (vehicle: VehicleRegistryRecord, reason: string | null) =>
      runGuarded(
        `exclusivity:${vehicle.vehicleId}:reject`,
        locale === "en"
          ? `Exclusivity rejected for ${vehicle.vehicleId}`
          : `已退回 ${vehicle.vehicleId} 獨家審查`,
        () =>
          client.rejectExclusivity(vehicle.vehicleId, {
            reviewerId: "platform-admin-web",
            reason:
              reason ?? "Rejected from fleet admin exclusivity review console.",
          }),
      ),
    [client, locale, runGuarded],
  );

  const completeDebranding = useCallback(
    (vehicle: VehicleRegistryRecord) =>
      runGuarded(
        `offboard:${vehicle.vehicleId}:debrand`,
        locale === "en"
          ? `Debranding completed for ${vehicle.vehicleId}`
          : `已完成 ${vehicle.vehicleId} 除標`,
        () =>
          client.completeVehicleDebranding(vehicle.vehicleId, {
            debrandingTicketId:
              vehicle.supplyLifecycle.offboarding.debrandingTicketId ?? null,
            notes: vehicle.supplyLifecycle.offboarding.notes ?? null,
          }),
      ),
    [client, locale, runGuarded],
  );

  const submitCreateDriver = useCallback(
    () =>
      runGuarded(
        "driver:create",
        locale === "en" ? "Driver master created" : "已建立司機主檔",
        async () => {
          await client.createDriverMaster({
            ...driverForm,
            name: driverForm.name.trim(),
            phone: driverForm.phone?.trim() || null,
            email: driverForm.email?.trim() || null,
          });
          setDriverForm(createInitialDriverForm());
          setCreateDriverOpen(false);
        },
      ),
    [client, driverForm, locale, runGuarded],
  );

  const submitOffboarding = useCallback(
    () =>
      runGuarded(
        "offboard:initiate",
        locale === "en"
          ? `Offboarding initiated for ${offboardVehicleId}`
          : `已啟動 ${offboardVehicleId} 下線流程`,
        async () => {
          await client.initiateVehicleOffboarding(offboardVehicleId, {
            reason: offboardForm.reason.trim(),
            requestedBy: offboardForm.requestedBy?.trim() || null,
            effectiveAt: offboardForm.effectiveAt?.trim() || null,
            debrandingRequired: offboardForm.debrandingRequired ?? true,
            debrandingDueAt: offboardForm.debrandingDueAt?.trim() || null,
            debrandingTicketId: offboardForm.debrandingTicketId?.trim() || null,
            notes: offboardForm.notes?.trim() || null,
          });
          setOffboardForm(createInitialOffboardingForm());
          setOffboardVehicleId("");
          setOffboardOpen(false);
        },
      ),
    [client, locale, offboardForm, offboardVehicleId, runGuarded],
  );

  const submitExclusivity = useCallback(
    () =>
      runGuarded(
        "exclusivity:submit",
        locale === "en"
          ? `Exclusivity review submitted for ${exclusivityVehicleId}`
          : `已提交 ${exclusivityVehicleId} 獨家審查`,
        async () => {
          await client.submitExclusivityReview(exclusivityVehicleId, {
            declarationFileId:
              exclusivityForm.declarationFileId?.trim() || null,
            exclusiveProviderName:
              exclusivityForm.exclusiveProviderName?.trim() || null,
            effectiveStart: exclusivityForm.effectiveStart?.trim() || null,
            effectiveEnd: exclusivityForm.effectiveEnd?.trim() || null,
          });
          setExclusivityForm(createInitialExclusivityForm());
          setExclusivityVehicleId("");
          setExclusivityOpen(false);
        },
      ),
    [client, exclusivityForm, exclusivityVehicleId, locale, runGuarded],
  );

  // ── header ───────────────────────────────────────────────────────────────────

  const tabNodes = FLEET_TABS.map((tabDef) => {
    const count = tabCounts[tabDef.id];
    const badge = tabBadge[tabDef.id];
    return (
      <button
        key={tabDef.id}
        type="button"
        onClick={() => selectTab(tabDef.id)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <span>{tabDef.label}</span>
        <span style={{ color: TH.textDim, fontFamily: TH.monoFamily }}>
          {count}
        </span>
        {badge && badge.count > 0 ? (
          <CanvasPill theme={TH} tone={badge.tone} dot>
            {badge.count}
          </CanvasPill>
        ) : null}
      </button>
    );
  });
  const activeNode =
    tabNodes[FLEET_TABS.findIndex((tabDef) => tabDef.id === activeTab)];

  const headerActions = (
    <>
      <CanvasBtn
        theme={TH}
        icon="filter"
        variant={complianceOnly ? "primary" : "secondary"}
        onClick={() => setComplianceOnly((value) => !value)}
      >
        {complianceOnly
          ? locale === "en"
            ? "Blockers only"
            : "僅顯示阻塞"
          : locale === "en"
            ? "Filter"
            : "篩選"}
      </CanvasBtn>
      {activeTab === "drivers" ? (
        <ActionButton
          descriptor={{ action: "create", enabled: true, riskLevel: "medium" }}
          locale={locale}
          variant="primary"
          size="sm"
          icon="plus"
          confirmTitle={
            locale === "en" ? "Create a new driver master" : "新增司機主檔"
          }
          label={locale === "en" ? "New driver" : "新增司機"}
          onRun={() => setCreateDriverOpen(true)}
        />
      ) : null}
      {activeTab === "offboard" ? (
        <ActionButton
          descriptor={{
            action: "initiate",
            enabled: vehicles.length > 0,
            disabledReasonCode: "no_vehicles",
            riskLevel: "high",
            requiresReason: true,
          }}
          locale={locale}
          variant="primary"
          size="sm"
          icon="plus"
          confirmTitle={
            locale === "en"
              ? "Start vehicle offboarding"
              : "啟動車輛 offboarding"
          }
          label={locale === "en" ? "Start offboarding" : "啟動 offboarding"}
          onRun={(reason) => {
            // The header high-risk confirm captures the offboarding reason;
            // prefill it into the modal so the operator does not re-type it.
            setOffboardForm((current) => ({
              ...current,
              reason: reason ?? current.reason,
            }));
            setOffboardOpen(true);
          }}
        />
      ) : null}
    </>
  );

  // ── body ─────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100%", background: TH.bg }}>
      <CanvasPageHeader
        theme={TH}
        title="車隊與合規治理"
        subtitle="vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding state machine"
        tabs={tabNodes}
        activeTab={activeNode}
        actions={headerActions}
      />

      <div style={{ padding: 24, display: "grid", gap: 14 }}>
        {receipt ? (
          <CanvasBanner
            theme={TH}
            tone="success"
            icon="ok"
            title={locale === "en" ? "Audit receipt" : "稽核回執"}
            body={`${receipt.title} · ${formatDateTime(receipt.at)}`}
            actions={
              <CanvasBtn
                theme={TH}
                variant="ghost"
                size="xs"
                onClick={() => setReceipt(null)}
              >
                {locale === "en" ? "Dismiss" : "關閉"}
              </CanvasBtn>
            }
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={TH}
            tone="danger"
            icon="warn"
            title={getPlatformLabel(locale, "error")}
            body={error}
            actions={
              <CanvasBtn
                theme={TH}
                variant="secondary"
                size="xs"
                onClick={() => void loadData()}
              >
                {locale === "en" ? "Retry" : "重試"}
              </CanvasBtn>
            }
          />
        ) : null}

        {loading ? (
          <CanvasCard theme={TH}>
            <EmptyState
              message={locale === "en" ? "Loading fleet…" : "載入車隊資料…"}
            />
          </CanvasCard>
        ) : (
          <>
            {activeTab === "vehicles" ? (
              <VehiclesTab
                vehicles={vehicles}
                complianceOnly={complianceOnly}
                locale={locale}
                busyAction={busyAction}
                onExport={() => void requestFleetReport("vehicle_roster")}
                exportBusy={busyAction === "report:vehicle_roster"}
                onToggleDispatch={toggleVehicleDispatch}
              />
            ) : null}

            {activeTab === "drivers" ? (
              <DriversTab
                drivers={drivers}
                complianceOnly={complianceOnly}
                expiringLicenses={expiringLicenses}
                locale={locale}
                busyAction={busyAction}
                onExport={() => void requestFleetReport("driver_roster")}
                exportBusy={busyAction === "report:driver_roster"}
                onLifecycle={runDriverLifecycle}
              />
            ) : null}

            {activeTab === "contracts" ? (
              <ContractsTab
                contracts={contracts}
                locale={locale}
                onExport={() => void requestFleetReport("contract_roster")}
                exportBusy={busyAction === "report:contract_roster"}
              />
            ) : null}

            {activeTab === "device" ? (
              <DeviceTab
                drivers={drivers}
                locale={locale}
                busyAction={busyAction}
                onRevoke={revokeBinding}
              />
            ) : null}

            {activeTab === "exclusivity" ? (
              <ExclusivityTab
                vehicles={vehicles}
                locale={locale}
                busyAction={busyAction}
                onApprove={approveReview}
                onReject={rejectReview}
                onOpenSubmit={() => {
                  setExclusivityVehicleId(vehicles[0]?.vehicleId ?? "");
                  setExclusivityOpen(true);
                }}
              />
            ) : null}

            {activeTab === "offboard" ? (
              <OffboardTab
                vehicles={vehicles}
                locale={locale}
                busyAction={busyAction}
                onCompleteDebranding={completeDebranding}
              />
            ) : null}
          </>
        )}
      </div>

      {createDriverOpen ? (
        <CreateDriverModal
          form={driverForm}
          setForm={setDriverForm}
          locale={locale}
          busy={busyAction === "driver:create"}
          onCancel={() => setCreateDriverOpen(false)}
          onSubmit={() => void submitCreateDriver()}
        />
      ) : null}

      {offboardOpen ? (
        <OffboardModal
          vehicles={vehicles}
          vehicleId={offboardVehicleId}
          setVehicleId={setOffboardVehicleId}
          form={offboardForm}
          setForm={setOffboardForm}
          locale={locale}
          busy={busyAction === "offboard:initiate"}
          onCancel={() => setOffboardOpen(false)}
          onSubmit={() => void submitOffboarding()}
        />
      ) : null}

      {exclusivityOpen ? (
        <ExclusivityModal
          vehicles={vehicles}
          vehicleId={exclusivityVehicleId}
          setVehicleId={setExclusivityVehicleId}
          form={exclusivityForm}
          setForm={setExclusivityForm}
          locale={locale}
          busy={busyAction === "exclusivity:submit"}
          onCancel={() => setExclusivityOpen(false)}
          onSubmit={() => void submitExclusivity()}
        />
      ) : null}
    </div>
  );
}

// ── tab: vehicles ─────────────────────────────────────────────────────────────

function VehiclesTab({
  vehicles,
  complianceOnly,
  locale,
  busyAction,
  onExport,
  exportBusy,
  onToggleDispatch,
}: {
  vehicles: VehicleRegistryRecord[];
  complianceOnly: boolean;
  locale: Locale;
  busyAction: string | null;
  onExport: () => void;
  exportBusy: boolean;
  onToggleDispatch: (vehicle: VehicleRegistryRecord, next: boolean) => void;
}) {
  const filtered = complianceOnly
    ? vehicles.filter(
        (v) =>
          !v.dispatchableFlag ||
          v.supplyLifecycle.dispatch.blockedReasons.length > 0,
      )
    : vehicles;
  const rows = filtered.map((v) => ({ v }));

  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    { h: "PLATE", w: 120, mono: true, r: ({ v }) => v.plateNo || "—" },
    { h: "AREA", w: 140, r: ({ v }) => v.operatingArea || "—" },
    {
      h: "DISPATCHABLE",
      w: 130,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={v.dispatchableFlag ? "success" : "danger"}
          dot
        >
          {v.dispatchableFlag ? "yes" : "no"}
        </CanvasPill>
      ),
    },
    {
      h: "CONTRACT",
      w: 120,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={lifecycleTone(v.supplyLifecycle.contract.lifecycleStatus)}
        >
          {formatPlatformCodeLabel(
            locale,
            v.supplyLifecycle.contract.lifecycleStatus,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "INSURANCE",
      w: 120,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={lifecycleTone(v.supplyLifecycle.insurance.lifecycleStatus)}
        >
          {formatPlatformCodeLabel(
            locale,
            v.supplyLifecycle.insurance.lifecycleStatus,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "EXCLUSIVITY",
      w: 130,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={reviewTone(v.supplyLifecycle.exclusivity.reviewStatus)}
          dot
        >
          {v.supplyLifecycle.exclusivity.reviewStatus}
        </CanvasPill>
      ),
    },
    {
      h: "BLOCKED BY",
      w: 200,
      r: ({ v }) =>
        v.supplyLifecycle.dispatch.blockedReasons.length > 0 ? (
          <div style={{ display: "grid", gap: 2 }}>
            {v.supplyLifecycle.dispatch.blockedReasons.map((reason) => (
              <span key={reason} style={{ fontSize: 11, color: TH.warn }}>
                {formatPlatformCodeLabel(locale, reason)}
              </span>
            ))}
          </div>
        ) : (
          <CanvasPill theme={TH} tone="success">
            {locale === "en" ? "none" : "無"}
          </CanvasPill>
        ),
    },
    {
      h: "ACTIONS",
      w: 200,
      r: ({ v }) => {
        const busy = busyAction === `vehicle:${v.vehicleId}:dispatch`;
        return (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <ActionButton
              descriptor={{
                action: v.dispatchableFlag ? "place_hold" : "mark_dispatchable",
                enabled:
                  v.dispatchableFlag ||
                  v.supplyLifecycle.dispatch.blockedReasons.length === 0,
                disabledReasonCode: "dispatch_blocked",
                riskLevel: "medium",
              }}
              locale={locale}
              busy={busy}
              confirmTitle={
                v.dispatchableFlag
                  ? locale === "en"
                    ? `Place dispatch hold on ${v.vehicleId}`
                    : `對 ${v.vehicleId} 暫停派遣`
                  : locale === "en"
                    ? `Mark ${v.vehicleId} dispatchable`
                    : `將 ${v.vehicleId} 設為可派遣`
              }
              label={
                v.dispatchableFlag
                  ? locale === "en"
                    ? "Hold"
                    : "暫停派遣"
                  : locale === "en"
                    ? "Dispatchable"
                    : "設為可派遣"
              }
              onRun={() => onToggleDispatch(v, !v.dispatchableFlag)}
            />
            <CanvasBtn theme={TH} size="xs" icon="ext">
              {locale === "en" ? "Ops" : "ops 操作面"}
            </CanvasBtn>
          </div>
        );
      },
    },
  ];

  return (
    <CanvasCard
      theme={TH}
      padding={0}
      title={locale === "en" ? "Vehicle registry" : "車輛登錄"}
      subtitle={
        locale === "en"
          ? "dispatchable gate is enforced server-side once exclusivity passes"
          : "exclusivity 通過後才會由後端解除 dispatchable 阻擋"
      }
      actions={
        <CanvasBtn
          theme={TH}
          size="xs"
          icon="reports"
          disabled={exportBusy}
          onClick={onExport}
        >
          {exportBusy
            ? locale === "en"
              ? "Exporting…"
              : "匯出中…"
            : locale === "en"
              ? "Export"
              : "匯出車輛"}
        </CanvasBtn>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          message={
            complianceOnly
              ? locale === "en"
                ? "No blocked vehicles."
                : "沒有受阻車輛。"
              : locale === "en"
                ? "No vehicles registered yet."
                : "尚未登錄車輛。"
          }
        />
      ) : (
        <CanvasTable theme={TH} columns={columns} rows={rows} />
      )}
    </CanvasCard>
  );
}

// ── tab: drivers ──────────────────────────────────────────────────────────────

function DriversTab({
  drivers,
  complianceOnly,
  expiringLicenses,
  locale,
  busyAction,
  onExport,
  exportBusy,
  onLifecycle,
}: {
  drivers: DriverRegistryRecord[];
  complianceOnly: boolean;
  expiringLicenses: number;
  locale: Locale;
  busyAction: string | null;
  onExport: () => void;
  exportBusy: boolean;
  onLifecycle: (
    driver: DriverRegistryRecord,
    next: DriverRegistryRecord["lifecycleStatus"],
    reason: string | null,
  ) => void;
}) {
  const filtered = complianceOnly
    ? drivers.filter(
        (d) => !d.dispatchEligible || d.eligibilityBlockedReasons.length > 0,
      )
    : drivers;
  const rows = filtered.map((d) => ({ d }));

  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    {
      h: "DRIVER",
      w: 200,
      r: ({ d }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{d.name || "—"}</div>
          <div
            style={{
              fontSize: 11,
              color: TH.textDim,
              fontFamily: TH.monoFamily,
            }}
          >
            {d.driverId}
          </div>
        </div>
      ),
    },
    {
      h: "WORK STATE",
      w: 130,
      r: ({ d }) => (
        <CanvasPill
          theme={TH}
          tone={d.workState === "available" ? "success" : "neutral"}
        >
          {formatPlatformCodeLabel(locale, d.workState)}
        </CanvasPill>
      ),
    },
    {
      h: "LICENSE",
      w: 110,
      r: ({ d }) =>
        d.licensesValid ? (
          <CanvasPill theme={TH} tone="success">
            valid
          </CanvasPill>
        ) : (
          <CanvasPill theme={TH} tone="warn" dot>
            {locale === "en" ? "expired" : "已過期"}
          </CanvasPill>
        ),
    },
    {
      h: "LIFECYCLE",
      w: 120,
      r: ({ d }) => (
        <CanvasPill theme={TH} tone={lifecycleTone(d.lifecycleStatus)} dot>
          {formatPlatformCodeLabel(locale, d.lifecycleStatus)}
        </CanvasPill>
      ),
    },
    {
      h: "ELIGIBILITY",
      w: 200,
      r: ({ d }) =>
        d.eligibilityBlockedReasons.length > 0 ? (
          <div style={{ display: "grid", gap: 2 }}>
            {d.eligibilityBlockedReasons.map((reason) => (
              <span key={reason} style={{ fontSize: 11, color: TH.warn }}>
                {formatPlatformCodeLabel(locale, reason)}
              </span>
            ))}
          </div>
        ) : (
          <CanvasPill theme={TH} tone="success">
            {locale === "en" ? "eligible" : "可派遣"}
          </CanvasPill>
        ),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: ({ d }) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["active", "suspended", "retired"] as const).map((next) => {
            const busy = busyAction === `driver:${d.driverId}:${next}`;
            const high = next === "suspended";
            return (
              <ActionButton
                key={next}
                descriptor={{
                  action: next,
                  enabled: d.lifecycleStatus !== next,
                  disabledReasonCode: "already_in_state",
                  riskLevel: high ? "high" : "medium",
                  requiresReason: high,
                }}
                locale={locale}
                busy={busy}
                confirmTitle={
                  locale === "en"
                    ? `Set ${d.driverId} → ${next}`
                    : `將 ${d.driverId} 設為 ${next}`
                }
                label={
                  next === "active"
                    ? locale === "en"
                      ? "Activate"
                      : "啟用"
                    : next === "suspended"
                      ? locale === "en"
                        ? "Suspend"
                        : "暫停"
                      : locale === "en"
                        ? "Retire"
                        : "退役"
                }
                onRun={(reason) => onLifecycle(d, next, reason)}
              />
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <>
      <CanvasBanner
        theme={TH}
        tone={expiringLicenses > 0 ? "warn" : "success"}
        icon={expiringLicenses > 0 ? "warn" : "ok"}
        title={
          expiringLicenses > 0
            ? locale === "en"
              ? `${expiringLicenses} driver(s) need license attention`
              : `${expiringLicenses} 位司機 license 需處理`
            : locale === "en"
              ? "All driver licenses valid"
              : "所有司機 license 有效"
        }
        body={
          locale === "en"
            ? "dispatch.compliance.license gate blocks non-compliant dispatch on the ops side."
            : "dispatch.compliance.license 守門會在 ops 端擋下不合規派遣。"
        }
        actions={
          <CanvasBtn
            theme={TH}
            variant="secondary"
            size="xs"
            icon="reports"
            disabled={exportBusy}
            onClick={onExport}
          >
            {exportBusy
              ? locale === "en"
                ? "Exporting…"
                : "匯出中…"
              : locale === "en"
                ? "Export roster"
                : "匯出名單"}
          </CanvasBtn>
        }
      />
      <CanvasCard theme={TH} padding={0}>
        {rows.length === 0 ? (
          <EmptyState
            message={
              complianceOnly
                ? locale === "en"
                  ? "No blocked drivers."
                  : "沒有受阻司機。"
                : locale === "en"
                  ? "No drivers registered yet."
                  : "尚未建立司機。"
            }
          />
        ) : (
          <CanvasTable theme={TH} columns={columns} rows={rows} />
        )}
      </CanvasCard>
    </>
  );
}

// ── tab: contracts ────────────────────────────────────────────────────────────

function ContractsTab({
  contracts,
  locale,
  onExport,
  exportBusy,
}: {
  contracts: VehicleContractRecord[];
  locale: Locale;
  onExport: () => void;
  exportBusy: boolean;
}) {
  const rows = contracts.map((c) => ({ c }));
  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    { h: "CONTRACT", w: 120, mono: true, r: ({ c }) => c.contractId },
    { h: "VEHICLE", w: 120, mono: true, r: ({ c }) => c.vehicleId },
    { h: "COUNTERPARTY", w: 200, r: ({ c }) => c.partnerId || "—" },
    {
      h: "KIND",
      w: 140,
      mono: true,
      r: ({ c }) =>
        c.contractType ? formatPlatformCodeLabel(locale, c.contractType) : "—",
    },
    {
      h: "TERM",
      w: 220,
      mono: true,
      r: ({ c }) =>
        `${formatDateTime(c.startAt || "")} – ${
          c.endAt ? formatDateTime(c.endAt) : "—"
        }`,
    },
    {
      h: "STATUS",
      w: 120,
      r: ({ c }) => (
        <CanvasPill theme={TH} tone={lifecycleTone(c.lifecycleStatus)} dot>
          {formatPlatformCodeLabel(locale, c.lifecycleStatus)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard
      theme={TH}
      padding={0}
      title={locale === "en" ? "Vehicle contracts" : "車輛合約"}
      actions={
        <CanvasBtn
          theme={TH}
          size="xs"
          icon="reports"
          disabled={exportBusy}
          onClick={onExport}
        >
          {exportBusy
            ? locale === "en"
              ? "Exporting…"
              : "匯出中…"
            : locale === "en"
              ? "Export"
              : "匯出合約"}
        </CanvasBtn>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          message={locale === "en" ? "No contracts on file." : "尚無合約紀錄。"}
        />
      ) : (
        <CanvasTable theme={TH} columns={columns} rows={rows} />
      )}
    </CanvasCard>
  );
}

// ── tab: device binding ───────────────────────────────────────────────────────

function DeviceTab({
  drivers,
  locale,
  busyAction,
  onRevoke,
}: {
  drivers: DriverRegistryRecord[];
  locale: Locale;
  busyAction: string | null;
  onRevoke: (bindingId: string, deviceId: string) => void;
}) {
  const rows = drivers.flatMap((d) =>
    d.deviceBindings.map((binding) => ({ d, binding })),
  );

  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    {
      h: "DRIVER",
      w: 200,
      r: ({ d }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{d.name || "—"}</div>
          <div
            style={{
              fontSize: 11,
              color: TH.textDim,
              fontFamily: TH.monoFamily,
            }}
          >
            {d.driverId}
          </div>
        </div>
      ),
    },
    {
      h: "DEVICE ID",
      w: 200,
      mono: true,
      r: ({ binding }) => binding.deviceId,
    },
    { h: "LABEL", w: 140, r: ({ binding }) => binding.deviceLabel || "—" },
    {
      h: "STATUS",
      w: 110,
      r: ({ binding }) => (
        <CanvasPill
          theme={TH}
          tone={binding.status === "active" ? "success" : "neutral"}
          dot
        >
          {binding.status}
        </CanvasPill>
      ),
    },
    {
      h: "BOUND AT",
      w: 140,
      mono: true,
      r: ({ binding }) => formatDateTime(binding.issuedAt || ""),
    },
    {
      h: "LAST SEEN",
      w: 140,
      mono: true,
      r: ({ binding }) => formatDateTime(binding.refreshedAt || ""),
    },
    {
      h: "ACTIONS",
      w: 140,
      r: ({ binding }) => (
        <ActionButton
          descriptor={{
            action: "revoke",
            enabled: binding.status !== "revoked",
            disabledReasonCode: "already_revoked",
            riskLevel: "high",
            requiresReason: true,
          }}
          locale={locale}
          busy={busyAction === `binding:${binding.bindingId}`}
          confirmTitle={
            locale === "en"
              ? `Revoke binding ${binding.bindingId}`
              : `撤銷綁定 ${binding.bindingId}`
          }
          label={locale === "en" ? "Revoke" : "撤銷綁定"}
          onRun={() => onRevoke(binding.bindingId, binding.deviceId)}
        />
      ),
    },
  ];

  return (
    <CanvasCard
      theme={TH}
      padding={0}
      title={locale === "en" ? "Device bindings" : "裝置綁定"}
      subtitle={
        locale === "en"
          ? "one active device per driver · revoke is high-risk"
          : "每位司機一個有效裝置 · 撤銷為高風險操作"
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          message={locale === "en" ? "No device bindings." : "尚無裝置綁定。"}
        />
      ) : (
        <CanvasTable theme={TH} columns={columns} rows={rows} />
      )}
    </CanvasCard>
  );
}

// ── tab: exclusivity reviews (Q-ADM08) ────────────────────────────────────────

function ExclusivityTab({
  vehicles,
  locale,
  busyAction,
  onApprove,
  onReject,
  onOpenSubmit,
}: {
  vehicles: VehicleRegistryRecord[];
  locale: Locale;
  busyAction: string | null;
  onApprove: (vehicle: VehicleRegistryRecord) => void;
  onReject: (vehicle: VehicleRegistryRecord, reason: string | null) => void;
  onOpenSubmit: () => void;
}) {
  const reviews = vehicles.filter(
    (v) =>
      v.supplyLifecycle.exclusivity.reviewStatus !== "draft" ||
      v.supplyLifecycle.exclusivity.declarationStatus === "submitted",
  );
  const rows = reviews.map((v) => ({ v }));

  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    {
      h: "REVIEW",
      w: 130,
      mono: true,
      r: ({ v }) => (
        <span style={{ color: TH.accent, fontWeight: 600 }}>{v.vehicleId}</span>
      ),
    },
    {
      h: "SCOPE",
      w: 180,
      mono: true,
      r: ({ v }) => `vehicle:${v.plateNo || v.vehicleId}`,
    },
    {
      h: "PROVIDER",
      w: 160,
      r: ({ v }) => v.supplyLifecycle.exclusivity.providerName || "—",
    },
    {
      h: "UPDATED",
      w: 140,
      mono: true,
      r: ({ v }) =>
        formatDateTime(
          v.supplyLifecycle.exclusivity.updatedAt || v.updatedAt || "",
        ),
    },
    {
      h: "STATE",
      w: 130,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={reviewTone(v.supplyLifecycle.exclusivity.reviewStatus)}
          dot
        >
          {v.supplyLifecycle.exclusivity.reviewStatus}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 200,
      r: ({ v }) => {
        const pending =
          v.supplyLifecycle.exclusivity.reviewStatus === "pending";
        return (
          <div style={{ display: "flex", gap: 4 }}>
            <ActionButton
              descriptor={{
                action: "approve",
                enabled: pending,
                disabledReasonCode: "not_pending",
                riskLevel: "high",
                requiresReason: true,
              }}
              locale={locale}
              busy={busyAction === `exclusivity:${v.vehicleId}:approve`}
              confirmTitle={
                locale === "en"
                  ? `Approve exclusivity for ${v.vehicleId}`
                  : `核准 ${v.vehicleId} 獨家審查`
              }
              label={locale === "en" ? "Approve" : "核准"}
              onRun={() => onApprove(v)}
            />
            <ActionButton
              descriptor={{
                action: "reject",
                enabled: pending,
                disabledReasonCode: "not_pending",
                riskLevel: "high",
                requiresReason: true,
              }}
              locale={locale}
              busy={busyAction === `exclusivity:${v.vehicleId}:reject`}
              confirmTitle={
                locale === "en"
                  ? `Reject exclusivity for ${v.vehicleId}`
                  : `退回 ${v.vehicleId} 獨家審查`
              }
              label={locale === "en" ? "Reject" : "退回"}
              onRun={(reason) => onReject(v, reason)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <CanvasBanner
        theme={TH}
        tone="info"
        icon="ok"
        title="Exclusivity 治理 · Q-ADM08"
        body={
          locale === "en"
            ? "A vehicle/driver cannot become dispatchable before exclusivity passes. This is a hard rule and cannot be overridden from the front end."
            : "vehicle / driver 的 dispatchable 不可能在 exclusivity 通過前變為 true。這是 hard rule，不可被前端覆蓋。"
        }
        actions={
          <CanvasBtn
            theme={TH}
            variant="secondary"
            size="xs"
            icon="plus"
            disabled={vehicles.length === 0}
            onClick={onOpenSubmit}
          >
            {locale === "en" ? "Submit review" : "提交審查"}
          </CanvasBtn>
        }
      />
      <CanvasCard theme={TH} padding={0}>
        {rows.length === 0 ? (
          <EmptyState
            message={
              locale === "en"
                ? "No exclusivity reviews submitted."
                : "尚無獨家審查紀錄。"
            }
          />
        ) : (
          <CanvasTable theme={TH} columns={columns} rows={rows} />
        )}
      </CanvasCard>
    </>
  );
}

// ── tab: offboarding state machine (Q-ADM09) ──────────────────────────────────

const OFFBOARD_STATES = [
  "initiated",
  "dispatch_disabled",
  "debranding_pending",
  "debranding_verified",
  "completed",
] as const;

function OffboardTab({
  vehicles,
  locale,
  busyAction,
  onCompleteDebranding,
}: {
  vehicles: VehicleRegistryRecord[];
  locale: Locale;
  busyAction: string | null;
  onCompleteDebranding: (vehicle: VehicleRegistryRecord) => void;
}) {
  const active = vehicles.filter(
    (v) => v.supplyLifecycle.offboarding.status !== "none",
  );
  const rows = active.map((v) => ({ v }));

  const columns: CanvasTableColumn<(typeof rows)[number]>[] = [
    {
      h: "VEHICLE",
      w: 120,
      mono: true,
      r: ({ v }) => v.plateNo || v.vehicleId,
    },
    {
      h: "CURRENT STATE",
      w: 180,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={offboardTone(v.supplyLifecycle.offboarding.status)}
          dot
        >
          {formatPlatformCodeLabel(
            locale,
            v.supplyLifecycle.offboarding.status,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "INITIATED",
      w: 140,
      mono: true,
      r: ({ v }) =>
        formatDateTime(v.supplyLifecycle.offboarding.requestedAt || ""),
    },
    {
      h: "DEBRANDING",
      w: 150,
      r: ({ v }) => (
        <CanvasPill
          theme={TH}
          tone={lifecycleTone(v.supplyLifecycle.offboarding.debrandingStatus)}
        >
          {formatPlatformCodeLabel(
            locale,
            v.supplyLifecycle.offboarding.debrandingStatus,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "ACTOR",
      w: 160,
      r: ({ v }) => v.supplyLifecycle.offboarding.requestedBy || "—",
    },
    {
      h: "ACTIONS",
      w: 170,
      r: ({ v }) => (
        <ActionButton
          descriptor={{
            action: "complete_debranding",
            enabled:
              v.supplyLifecycle.offboarding.debrandingStatus === "pending",
            disabledReasonCode: "wrong_state",
            riskLevel: "medium",
          }}
          locale={locale}
          busy={busyAction === `offboard:${v.vehicleId}:debrand`}
          confirmTitle={
            locale === "en"
              ? `Complete debranding for ${v.vehicleId}`
              : `完成 ${v.vehicleId} 除標`
          }
          label={locale === "en" ? "Complete debranding" : "完成除標"}
          onRun={() => onCompleteDebranding(v)}
        />
      ),
    },
  ];

  return (
    <>
      <CanvasCard
        theme={TH}
        title="Offboarding state machine · Q-ADM09"
        subtitle={
          locale === "en"
            ? "each transition records timestamp · actor · evidence · audit"
            : "每一步轉換需 timestamp · actor · evidence · audit"
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 0",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {OFFBOARD_STATES.map((state, index) => (
            <React.Fragment key={state}>
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background:
                    index <= 1
                      ? TH.successBg
                      : index === 2
                        ? TH.warnBg
                        : TH.surfaceLo,
                  color: index <= 2 ? TH.text : TH.textDim,
                  border: `1px solid ${
                    index <= 1
                      ? TH.successBorder
                      : index === 2
                        ? TH.warnBorder
                        : TH.border
                  }`,
                  fontSize: 11.5,
                  fontFamily: TH.monoFamily,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {index + 1}. {state}
              </div>
              {index < OFFBOARD_STATES.length - 1 ? (
                <div
                  style={{
                    flex: 1,
                    minWidth: 16,
                    height: 2,
                    background: index < 2 ? TH.success : TH.border,
                  }}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </CanvasCard>
      <CanvasCard
        theme={TH}
        padding={0}
        title={
          locale === "en" ? "Active offboarding flows" : "活躍 offboarding 流程"
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            message={
              locale === "en"
                ? "No active offboarding flows."
                : "目前沒有進行中的下線流程。"
            }
          />
        ) : (
          <CanvasTable theme={TH} columns={columns} rows={rows} />
        )}
      </CanvasCard>
    </>
  );
}

// ── modals ────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  locale,
  busy,
  submitLabel,
  submitDisabled,
  danger,
  onCancel,
  onSubmit,
  children,
}: {
  title: ReactNode;
  locale: Locale;
  busy: boolean;
  submitLabel: ReactNode;
  submitDisabled?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={dialogStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TH.text }}>
          {title}
        </div>
        <div style={{ display: "grid", gap: 10 }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <CanvasBtn theme={TH} variant="ghost" onClick={onCancel}>
            {locale === "en" ? "Cancel" : "取消"}
          </CanvasBtn>
          <CanvasBtn
            theme={TH}
            variant="primary"
            danger={danger ?? false}
            disabled={busy || Boolean(submitDisabled)}
            onClick={onSubmit}
          >
            {busy ? (locale === "en" ? "Working…" : "處理中…") : submitLabel}
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={modalLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

function CreateDriverModal({
  form,
  setForm,
  locale,
  busy,
  onCancel,
  onSubmit,
}: {
  form: CreateDriverMasterCommand;
  setForm: React.Dispatch<React.SetStateAction<CreateDriverMasterCommand>>;
  locale: Locale;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell
      title={locale === "en" ? "New driver master" : "新增司機主檔"}
      locale={locale}
      busy={busy}
      submitDisabled={form.name.trim().length === 0}
      submitLabel={locale === "en" ? "Create" : "建立"}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <ModalField label={locale === "en" ? "Name (required)" : "姓名（必填）"}>
        <input
          style={modalInputStyle}
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Phone" : "電話"}>
        <input
          style={modalInputStyle}
          value={form.phone ?? ""}
          onChange={(event) =>
            setForm((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Email" : "Email"}>
        <input
          style={modalInputStyle}
          value={form.email ?? ""}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
        />
      </ModalField>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 12.5,
          color: TH.text,
        }}
      >
        <input
          type="checkbox"
          checked={form.licensesValid ?? false}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              licensesValid: event.target.checked,
            }))
          }
        />
        {locale === "en" ? "Licenses valid" : "證照有效"}
      </label>
    </ModalShell>
  );
}

function OffboardModal({
  vehicles,
  vehicleId,
  setVehicleId,
  form,
  setForm,
  locale,
  busy,
  onCancel,
  onSubmit,
}: {
  vehicles: VehicleRegistryRecord[];
  vehicleId: string;
  setVehicleId: (value: string) => void;
  form: InitiateVehicleOffboardingCommand;
  setForm: React.Dispatch<
    React.SetStateAction<InitiateVehicleOffboardingCommand>
  >;
  locale: Locale;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell
      title={locale === "en" ? "Start offboarding" : "啟動 offboarding"}
      locale={locale}
      busy={busy}
      danger
      submitDisabled={!vehicleId || form.reason.trim().length === 0}
      submitLabel={locale === "en" ? "Initiate" : "啟動"}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <ModalField
        label={locale === "en" ? "Vehicle (required)" : "車輛（必填）"}
      >
        <select
          style={modalInputStyle}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="">
            {locale === "en" ? "Select vehicle…" : "選擇車輛…"}
          </option>
          {vehicles.map((v) => (
            <option key={v.vehicleId} value={v.vehicleId}>
              {v.plateNo || v.vehicleId}
            </option>
          ))}
        </select>
      </ModalField>
      <ModalField
        label={locale === "en" ? "Reason (required)" : "原因（必填）"}
      >
        <input
          style={modalInputStyle}
          value={form.reason}
          onChange={(event) =>
            setForm((current) => ({ ...current, reason: event.target.value }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Requested by" : "申請人"}>
        <input
          style={modalInputStyle}
          value={form.requestedBy ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              requestedBy: event.target.value,
            }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Debranding ticket" : "除標工單"}>
        <input
          style={modalInputStyle}
          value={form.debrandingTicketId ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              debrandingTicketId: event.target.value,
            }))
          }
        />
      </ModalField>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 12.5,
          color: TH.text,
        }}
      >
        <input
          type="checkbox"
          checked={form.debrandingRequired ?? true}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              debrandingRequired: event.target.checked,
            }))
          }
        />
        {locale === "en" ? "Debranding required" : "需要除標"}
      </label>
    </ModalShell>
  );
}

function ExclusivityModal({
  vehicles,
  vehicleId,
  setVehicleId,
  form,
  setForm,
  locale,
  busy,
  onCancel,
  onSubmit,
}: {
  vehicles: VehicleRegistryRecord[];
  vehicleId: string;
  setVehicleId: (value: string) => void;
  form: SubmitExclusivityReviewCommand;
  setForm: React.Dispatch<React.SetStateAction<SubmitExclusivityReviewCommand>>;
  locale: Locale;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell
      title={locale === "en" ? "Submit exclusivity review" : "提交獨家審查"}
      locale={locale}
      busy={busy}
      submitDisabled={!vehicleId}
      submitLabel={locale === "en" ? "Submit" : "提交"}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <ModalField
        label={locale === "en" ? "Vehicle (required)" : "車輛（必填）"}
      >
        <select
          style={modalInputStyle}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="">
            {locale === "en" ? "Select vehicle…" : "選擇車輛…"}
          </option>
          {vehicles.map((v) => (
            <option key={v.vehicleId} value={v.vehicleId}>
              {v.plateNo || v.vehicleId}
            </option>
          ))}
        </select>
      </ModalField>
      <ModalField label={locale === "en" ? "Provider" : "獨家供應商"}>
        <input
          style={modalInputStyle}
          value={form.exclusiveProviderName ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              exclusiveProviderName: event.target.value,
            }))
          }
        />
      </ModalField>
      <ModalField
        label={locale === "en" ? "Declaration file id" : "聲明檔案 ID"}
      >
        <input
          style={modalInputStyle}
          value={form.declarationFileId ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              declarationFileId: event.target.value,
            }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Effective start" : "生效起"}>
        <input
          style={modalInputStyle}
          placeholder="2026-12-31T00:00:00.000Z"
          value={form.effectiveStart ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              effectiveStart: event.target.value,
            }))
          }
        />
      </ModalField>
      <ModalField label={locale === "en" ? "Effective end" : "生效迄"}>
        <input
          style={modalInputStyle}
          placeholder="2026-12-31T23:59:59.000Z"
          value={form.effectiveEnd ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              effectiveEnd: event.target.value,
            }))
          }
        />
      </ModalField>
    </ModalShell>
  );
}
