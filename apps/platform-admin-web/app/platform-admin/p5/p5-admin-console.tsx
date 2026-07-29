"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import type {
  DriverPublicRegistrationCredential,
  MultiTaxiTripOperationalAdminView,
  MultiTaxiTripOperationalExportRow,
  VehiclePassengerDisclosureProfile,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type P5View = "disclosure" | "queue" | "fares" | "records";

type CorrectionQueueRow = Record<string, unknown> & {
  id: string;
  fleet: string;
  subject: string;
  subjectType: "vehicle" | "driver";
  missing: string;
  status: "pending" | "reviewing" | "returned" | "approved";
  submittedAt: string;
  updatedAt: string;
  vehiclePlate: string;
  driverName: string;
  queueNote: string;
};

type FareVersionRow = Record<string, unknown> & {
  id: string;
  name: string;
  status: "draft" | "filed" | "active" | "retired";
  effectiveFrom: string;
  filingRef: string;
  preview: {
    startingFare: string;
    distanceFare: string;
    waitingFare: string;
    nightSurcharge: string;
    note: string;
  };
};

type TripOperationalRow = MultiTaxiTripOperationalAdminView &
  Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  alignItems: "start",
};

const previewCardStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 14,
  background: theme.surfaceLo,
  display: "grid",
  gap: 8,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  minHeight: 36,
};

const queueDetailListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: theme.textMuted,
  display: "grid",
  gap: 6,
  fontSize: 12,
};

const queueSeed: CorrectionQueueRow[] = [
  {
    id: "cq-001",
    fleet: "大都會車隊",
    subject: "BKR-2208 · 車輛",
    subjectType: "vehicle",
    missing: "車門數 · 車身顏色",
    status: "pending",
    submittedAt: "2026-07-14",
    updatedAt: "2026-07-18",
    vehiclePlate: "BKR-2208",
    driverName: "吳明翰",
    queueNote: "缺漏欄位需補齊後才能寫入乘客揭露檔案。",
  },
  {
    id: "cq-002",
    fleet: "大都會車隊",
    subject: "吳明翰 · 駕駛",
    subjectType: "driver",
    missing: "執登效期證明",
    status: "reviewing",
    submittedAt: "2026-07-15",
    updatedAt: "2026-07-19",
    vehiclePlate: "BKR-2208",
    driverName: "吳明翰",
    queueNote: "人工審核與效期需共同通過，不得沿用既有駕照旗標。",
  },
  {
    id: "cq-003",
    fleet: "海線車隊",
    subject: "TXG-1180 · 車輛",
    subjectType: "vehicle",
    missing: "出廠年份",
    status: "returned",
    submittedAt: "2026-07-10",
    updatedAt: "2026-07-16",
    vehiclePlate: "TXG-1180",
    driverName: "林佩蓉",
    queueNote: "已退件補正，待車隊重新送審後才可恢復審核。",
  },
  {
    id: "cq-004",
    fleet: "蘭陽小客車",
    subject: "游志豪 · 駕駛",
    subjectType: "driver",
    missing: "—",
    status: "approved",
    submittedAt: "2026-07-08",
    updatedAt: "2026-07-12",
    vehiclePlate: "YLN-5201",
    driverName: "游志豪",
    queueNote: "資料已核准，可進入派車資格評估。",
  },
];

const fareSeed: FareVersionRow[] = [
  {
    id: "F-2026-04",
    name: "2026 Q4 調整版",
    status: "filed",
    effectiveFrom: "2026-10-01",
    filingRef: "北市交運字第1130077號",
    preview: {
      startingFare: "NT$ 90",
      distanceFare: "NT$ 5 / 200m",
      waitingFare: "NT$ 5 / 80s",
      nightSurcharge: "+20% · 23:00–06:00",
      note: "已備查版本可先公開預覽；生效前訂單仍沿用已生效版本。",
    },
  },
  {
    id: "F-2026-03",
    name: "現行計費表",
    status: "active",
    effectiveFrom: "2026-07-01",
    filingRef: "北市交運字第1130042號",
    preview: {
      startingFare: "NT$ 85",
      distanceFare: "NT$ 5 / 200m",
      waitingFare: "NT$ 5 / 80s",
      nightSurcharge: "+20% · 23:00–06:00",
      note: "現行已生效版本供乘客公開查閱，正式訂單一律使用此版本計費。",
    },
  },
  {
    id: "F-2026-05",
    name: "夜間費率研議",
    status: "draft",
    effectiveFrom: "—",
    filingRef: "—",
    preview: {
      startingFare: "NT$ 85",
      distanceFare: "NT$ 5 / 200m",
      waitingFare: "NT$ 5 / 80s",
      nightSurcharge: "+25% · 23:00–06:00",
      note: "草稿版本僅供內部檢視，尚未送備查，不可套用到任何訂單。",
    },
  },
  {
    id: "F-2025-11",
    name: "2025 舊版",
    status: "retired",
    effectiveFrom: "2025-11-01",
    filingRef: "北市交運字第1120198號",
    preview: {
      startingFare: "NT$ 80",
      distanceFare: "NT$ 5 / 250m",
      waitingFare: "NT$ 5 / 100s",
      nightSurcharge: "+15% · 23:00–06:00",
      note: "停用版本僅保留對照，不可再次啟用到現行公開頁。",
    },
  },
];

const fallbackVehicle: VehiclePassengerDisclosureProfile = {
  vehicleId: "vehicle-001",
  make: "Toyota",
  model: "Corolla Altis",
  modelYear: 2024,
  doorCount: 4,
  color: "珍珠白",
  status: "complete",
  missingFieldCodes: [],
  verifiedByActorId: "platform-reviewer-001",
  verifiedAt: "2026-07-18T09:20:00.000Z",
  sourceSubmissionId: "submission-vehicle-001",
  version: 4,
  updatedAt: "2026-07-18T09:20:00.000Z",
};

const fallbackDriver: DriverPublicRegistrationCredential = {
  driverId: "drv-demo-001",
  registrationNo: "RE***01",
  registrationArea: "臺北市",
  effectiveFrom: "2025-01-01",
  effectiveUntil: "2027-12-31",
  status: "verified_active",
  maskedDisplay: "RE***01",
  verifiedByActorId: "platform-reviewer-001",
  verifiedAt: "2026-07-18T09:20:00.000Z",
  sourceSubmissionId: "submission-driver-001",
  version: 3,
  updatedAt: "2026-07-18T09:20:00.000Z",
};

function getMaskedRegistrationDisplay(
  credential: DriverPublicRegistrationCredential,
) {
  const masked = credential.maskedDisplay.trim();
  return masked.length > 0 ? masked : "—";
}

function statusTone(
  status: CorrectionQueueRow["status"] | FareVersionRow["status"],
): CanvasTone {
  switch (status) {
    case "approved":
    case "active":
      return "success";
    case "pending":
    case "draft":
      return "warn";
    case "reviewing":
    case "filed":
      return "info";
    case "returned":
      return "danger";
    case "retired":
    default:
      return "neutral";
  }
}

function queueDetailTone(
  status: CorrectionQueueRow["status"],
): Exclude<CanvasTone, "neutral"> {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "warn";
    case "reviewing":
      return "info";
    case "returned":
      return "danger";
  }
}

function requiresAnyScope(scopeSet: Set<string>, scopes: string[]) {
  return scopes.some((scope) => scopeSet.has(scope));
}

function formatCurrencyMinor(amountMinor: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatMonthLabel(month: string, locale: string) {
  const [year, value] = month.split("-");
  return locale === "zh" ? `${year}-${value}` : `${year}-${value}`;
}

function buildRecordsCsv(rows: MultiTaxiTripOperationalExportRow[]) {
  const header = [
    "order_no_masked",
    "plate_no_masked",
    "reserved_at",
    "pickup_at",
    "dropoff_at",
    "payable_fare_minor",
    "actual_fare_minor",
    "toll_minor",
    "currency",
    "fare_policy_version",
    "charging_mode",
    "generated_at",
    "retain_until",
  ];
  const body = rows.map((row) =>
    [
      row.orderNoMasked,
      row.plateNoMasked,
      row.reservedAt,
      row.pickupAt ?? "",
      row.dropoffAt ?? "",
      String(row.payableFareMinor),
      String(row.actualFareMinor),
      String(row.tollMinor),
      row.currency,
      row.farePolicyVersion,
      row.chargingMode,
      row.generatedAt,
      row.retainUntil,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

export function P5AdminConsole({ view }: { view: P5View }) {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const canReadRegistry = requiresAnyScope(scopeSet, [
    "reg.read",
    "reg.review",
  ]);
  const canReviewRegistry = requiresAnyScope(scopeSet, ["reg.review"]);
  const canReadTripRecords = requiresAnyScope(scopeSet, [
    "multi_taxi_records:read",
  ]);
  const canExportTripRecords = requiresAnyScope(scopeSet, [
    "multi_taxi_records:export",
  ]);
  const [vehicle, setVehicle] =
    useState<VehiclePassengerDisclosureProfile>(fallbackVehicle);
  const [driver, setDriver] =
    useState<DriverPublicRegistrationCredential>(fallbackDriver);
  const [loading, setLoading] = useState(view === "disclosure");
  const [queueRows, setQueueRows] = useState(queueSeed);
  const [selectedQueueId, setSelectedQueueId] = useState(queueSeed[0]?.id ?? "");
  const [selectedFareId, setSelectedFareId] = useState(
    fareSeed.find((row) => row.status === "active")?.id ?? fareSeed[0]?.id ?? "",
  );
  const [recordsRows, setRecordsRows] = useState<TripOperationalRow[]>([]);
  const [recordsMonthOptions, setRecordsMonthOptions] = useState<string[]>([]);
  const [recordsMonth, setRecordsMonth] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(view === "records");
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [recordsExporting, setRecordsExporting] = useState(false);
  const maskedRegistrationDisplay = getMaskedRegistrationDisplay(driver);
  const selectedQueueRow =
    queueRows.find((row) => row.id === selectedQueueId) ?? queueRows[0] ?? null;
  const selectedFare =
    fareSeed.find((row) => row.id === selectedFareId) ??
    fareSeed.find((row) => row.status === "active") ??
    fareSeed[0]!;
  const disclosureVehiclePlate = queueSeed[0]?.vehiclePlate ?? "—";
  const disclosureDriverName = queueSeed[0]?.driverName ?? "—";
  const canAccessView = view === "records" ? canReadTripRecords : canReadRegistry;

  useEffect(() => {
    if (view !== "disclosure" || !canReadRegistry) {
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      try {
        const [vehicleProfile, driverCredential] = await Promise.all([
          client.get<VehiclePassengerDisclosureProfile>(
            "/api/regulatory-registry/vehicles/vehicle-001/disclosure-profile",
          ),
          client.get<DriverPublicRegistrationCredential>(
            "/api/regulatory-registry/drivers/drv-demo-001/registration-credential",
          ),
        ]);
        if (!active) {
          return;
        }
        setVehicle(vehicleProfile);
        setDriver({
          ...driverCredential,
          registrationNo: null,
          maskedDisplay: getMaskedRegistrationDisplay(driverCredential),
        });
      } catch {
        if (!active) {
          return;
        }
        setVehicle(fallbackVehicle);
        setDriver(fallbackDriver);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [canReadRegistry, client, view]);

  useEffect(() => {
    if (view !== "records" || !canReadTripRecords) {
      setRecordsLoading(false);
      setRecordsError(null);
      return;
    }

    let active = true;
    async function load() {
      setRecordsLoading(true);
      setRecordsError(null);
      try {
        const params = new URLSearchParams();
        if (recordsMonth) {
          params.set("month", recordsMonth);
        }
        const payload = await client.get<{
          items?: MultiTaxiTripOperationalAdminView[];
        }>(
          `/api/platform-admin/multi-taxi-trip-records${params.size > 0 ? `?${params.toString()}` : ""}`,
        );
        if (!active) {
          return;
        }
        const nextRows = (payload.items ?? []) as TripOperationalRow[];
        setRecordsRows(nextRows);
        if (!recordsMonth) {
          setRecordsMonthOptions(
            Array.from(
              new Set(nextRows.map((row) => row.reservedAt.slice(0, 7))),
            ).sort((left, right) => right.localeCompare(left)),
          );
        }
        if (!recordsMonth && nextRows[0]?.reservedAt) {
          setRecordsMonth(nextRows[0].reservedAt.slice(0, 7));
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setRecordsRows([]);
        setRecordsError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (active) {
          setRecordsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [canReadTripRecords, client, recordsMonth, view]);

  function actOnQueue(id: string, action: "return" | "approve") {
    setQueueRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              status: action === "approve" ? "approved" : "returned",
              updatedAt: "2026-07-21",
            }
          : row,
      ),
    );
    setSelectedQueueId(id);
  }

  async function exportRecords() {
    setRecordsExporting(true);
    setRecordsError(null);
    try {
      const params = new URLSearchParams();
      if (recordsMonth) {
        params.set("month", recordsMonth);
      }
      const exported = await client.get<{
        filename: string;
        rows: MultiTaxiTripOperationalExportRow[];
      }>(
        `/api/platform-admin/multi-taxi-trip-records/export${params.size > 0 ? `?${params.toString()}` : ""}`,
      );
      const blob = new Blob([buildRecordsCsv(exported.rows)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecordsExporting(false);
    }
  }

  if (!canAccessView) {
    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t(`p5.${view}.title`)}
          subtitle={t(`p5.${view}.subtitle`)}
        />
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title={t("p5.scope.locked.title")}
          body={
            view === "records"
              ? t("p5.records.scope.locked.body")
              : t("p5.scope.locked.body")
          }
        />
      </div>
    );
  }

  if (view === "disclosure") {
    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.disclosure.title")}
          subtitle={t("p5.disclosure.subtitle")}
          actions={
            <div style={actionRowStyle}>
              <CanvasBtn theme={theme} disabled={!canReviewRegistry}>
                {t("p5.action.return")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="check"
                disabled={!canReviewRegistry}
              >
                {t("p5.action.approve")}
              </CanvasBtn>
            </div>
          }
        />
        {!canReviewRegistry ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            body={t("p5.scope.reviewOnly")}
          />
        ) : null}
        <div style={splitStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title={t("p5.disclosure.vehicleCard")}
              subtitle={t("p5.disclosure.vehicleSubtitle")}
            >
              {loading ? (
                <div>{t("p5.loading")}</div>
              ) : (
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    { k: t("p5.field.make"), v: vehicle.make },
                    { k: t("p5.field.model"), v: vehicle.model },
                    {
                      k: t("p5.field.modelYear"),
                      v: String(vehicle.modelYear),
                      mono: true,
                    },
                    {
                      k: t("p5.field.doorCount"),
                      v: String(vehicle.doorCount),
                      mono: true,
                    },
                    { k: t("p5.field.color"), v: vehicle.color ?? "—" },
                    {
                      k: t("p5.field.disclosureStatus"),
                      v: (
                        <CanvasPill theme={theme} tone="success" dot>
                          {vehicle.status}
                        </CanvasPill>
                      ),
                    },
                  ]}
                />
              )}
            </CanvasCard>
            <CanvasCard
              theme={theme}
              title={t("p5.disclosure.driverCard")}
              subtitle={t("p5.disclosure.driverSubtitle")}
            >
              {loading ? (
                <div>{t("p5.loading")}</div>
              ) : (
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("p5.field.registrationMasked"),
                      v: maskedRegistrationDisplay,
                      mono: true,
                    },
                    {
                      k: t("p5.field.registrationArea"),
                      v: driver.registrationArea ?? "—",
                    },
                    {
                      k: t("p5.field.registrationUntil"),
                      v: driver.effectiveUntil ?? "—",
                      mono: true,
                    },
                    {
                      k: t("p5.field.registrationStatus"),
                      v: (
                        <CanvasPill
                          theme={theme}
                          tone={
                            driver.status === "verified_active"
                              ? "success"
                              : "warn"
                          }
                          dot
                        >
                          {driver.status}
                        </CanvasPill>
                      ),
                    },
                    {
                      k: t("p5.field.reviewer"),
                      v: driver.verifiedByActorId ?? "—",
                    },
                    {
                      k: t("p5.field.fullRegistrationStored"),
                      v: t("p5.disclosure.backendOnly"),
                    },
                  ]}
                />
              )}
            </CanvasCard>
          </div>
          <CanvasCard
            theme={theme}
            title={t("p5.disclosure.previewCard")}
            subtitle={t("p5.disclosure.previewSubtitle")}
          >
            <div style={previewCardStyle}>
              <div style={{ fontWeight: 700, color: theme.text }}>
                {vehicle.make} {vehicle.model}
              </div>
              <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
                {t("p5.disclosure.previewVehicleMeta", {
                  year: vehicle.modelYear,
                  doors: vehicle.doorCount,
                  color: vehicle.color ?? "—",
                })}
              </div>
              <div
                style={{
                  ...monoStyle,
                  fontSize: 22,
                  fontWeight: 700,
                  color: theme.text,
                }}
              >
                {disclosureVehiclePlate}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{disclosureDriverName}</strong>
                <CanvasPill theme={theme} tone="success">
                  {t("p5.disclosure.validBadge")}
                </CanvasPill>
              </div>
              <div
                style={{ ...monoStyle, color: theme.textMuted, fontSize: 11 }}
              >
                {maskedRegistrationDisplay} ·{" "}
                {t("p5.disclosure.validUntil", {
                  date: driver.effectiveUntil ?? "—",
                })}
              </div>
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="lock"
                body={t("p5.disclosure.maskedNote")}
              />
            </div>
          </CanvasCard>
        </div>
      </div>
    );
  }

  if (view === "queue") {
    const columns: CanvasTableColumn<CorrectionQueueRow>[] = [
      { h: t("p5.queue.col.fleet"), k: "fleet", w: 140 },
      { h: t("p5.queue.col.subject"), k: "subject", w: 180 },
      { h: t("p5.queue.col.missing"), k: "missing", w: 180 },
      {
        h: t("p5.queue.col.status"),
        w: 110,
        r: (row) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {t(`p5.status.${row.status}`)}
          </CanvasPill>
        ),
      },
      { h: t("p5.queue.col.submitted"), k: "submittedAt", w: 110, mono: true },
      { h: t("p5.queue.col.updated"), k: "updatedAt", w: 110, mono: true },
      {
        h: "",
        w: 220,
        r: (row) => (
          <div style={actionRowStyle}>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="ghost"
              icon="eye"
              onClick={() => setSelectedQueueId(row.id)}
            >
              {t("p5.action.view")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              size="xs"
              disabled={!canReviewRegistry}
              onClick={() => actOnQueue(row.id, "return")}
            >
              {t("p5.action.return")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="primary"
              icon="check"
              disabled={!canReviewRegistry}
              onClick={() => actOnQueue(row.id, "approve")}
            >
              {t("p5.action.approve")}
            </CanvasBtn>
          </div>
        ),
      },
    ];

    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.queue.title")}
          subtitle={t("p5.queue.subtitle")}
          actions={
            <CanvasPill theme={theme} tone="warn">
              {queueRows.filter((row) => row.status !== "approved").length}{" "}
              {t("p5.queue.pending")}
            </CanvasPill>
          }
        />
        {!canReviewRegistry ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            body={t("p5.scope.reviewOnly")}
          />
        ) : null}
        <div style={splitStyle}>
          <CanvasCard theme={theme} padding={0}>
            <CanvasTable theme={theme} columns={columns} rows={queueRows} />
          </CanvasCard>
          <CanvasCard
            theme={theme}
            title={t("p5.queue.detailCard")}
            subtitle={
              selectedQueueRow
                ? `${selectedQueueRow.subject} · ${selectedQueueRow.fleet}`
                : t("p5.loading")
            }
          >
            {selectedQueueRow ? (
              <>
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("p5.queue.detail.subjectType"),
                      v: t(`p5.queue.subjectType.${selectedQueueRow.subjectType}`),
                    },
                    {
                      k: t("p5.queue.detail.plate"),
                      v: selectedQueueRow.vehiclePlate,
                      mono: true,
                    },
                    {
                      k: t("p5.queue.detail.driver"),
                      v: selectedQueueRow.driverName,
                    },
                    {
                      k: t("p5.queue.detail.status"),
                      v: (
                        <CanvasPill
                          theme={theme}
                          tone={statusTone(selectedQueueRow.status)}
                          dot
                        >
                          {t(`p5.status.${selectedQueueRow.status}`)}
                        </CanvasPill>
                      ),
                    },
                  ]}
                />
                <div style={{ marginTop: 12 }}>
                  <strong style={{ display: "block", marginBottom: 8 }}>
                    {t("p5.queue.detail.missingTitle")}
                  </strong>
                  {selectedQueueRow.missing === "—" ? (
                    <div style={{ color: theme.textMuted, fontSize: 12 }}>—</div>
                  ) : (
                    <ul style={queueDetailListStyle}>
                      {selectedQueueRow.missing
                        .split(" · ")
                        .map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  <CanvasBanner
                    theme={theme}
                    tone={queueDetailTone(selectedQueueRow.status)}
                    icon="info"
                    body={selectedQueueRow.queueNote}
                  />
                </div>
                <div style={{ ...actionRowStyle, marginTop: 12 }}>
                  <CanvasBtn
                    theme={theme}
                    disabled={!canReviewRegistry}
                    onClick={() => actOnQueue(selectedQueueRow.id, "return")}
                  >
                    {t("p5.action.return")}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    icon="check"
                    disabled={!canReviewRegistry}
                    onClick={() => actOnQueue(selectedQueueRow.id, "approve")}
                  >
                    {t("p5.action.approve")}
                  </CanvasBtn>
                </div>
              </>
            ) : null}
          </CanvasCard>
        </div>
      </div>
    );
  }

  if (view === "records") {
    if (!canReadTripRecords) {
      return (
        <div style={pageBodyStyle}>
          <CanvasPageHeader
            theme={theme}
            title={t("p5.records.title")}
            subtitle={t("p5.records.subtitle")}
          />
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="lock"
            title={t("p5.scope.locked.title")}
            body={t("p5.records.scope.locked.body")}
          />
        </div>
      );
    }

    const monthOptions = recordsMonthOptions;
    const coverageCount = recordsRows.filter((row) => {
      const generatedAt = Date.parse(row.generatedAt);
      const retainUntil = Date.parse(row.retainUntil);
      if (!Number.isFinite(generatedAt) || !Number.isFinite(retainUntil)) {
        return false;
      }
      return retainUntil - generatedAt >= 730 * 24 * 60 * 60 * 1000;
    }).length;
    const coveragePercent =
      recordsRows.length === 0
        ? 100
        : Math.round((coverageCount / recordsRows.length) * 100);
    const recordColumns: CanvasTableColumn<TripOperationalRow>[] = [
      {
        h: t("p5.records.col.order"),
        w: 150,
        r: (row) => (
          <span style={{ color: theme.accent, fontWeight: 600, ...monoStyle }}>
            {row.orderNo}
          </span>
        ),
      },
      { h: t("p5.records.col.plate"), k: "plateNo", w: 96, mono: true },
      {
        h: t("p5.records.col.reserved"),
        k: "reservedAt",
        w: 160,
        mono: true,
      },
      { h: t("p5.records.col.pickup"), k: "pickupAt", w: 160, mono: true },
      { h: t("p5.records.col.dropoff"), k: "dropoffAt", w: 160, mono: true },
      {
        h: t("p5.records.col.fare"),
        w: 108,
        align: "right",
        r: (row) => formatCurrencyMinor(row.actualFareMinor, locale),
      },
      {
        h: t("p5.records.col.retainUntil"),
        k: "retainUntil",
        w: 160,
        mono: true,
      },
      {
        h: "",
        w: 96,
        r: () => (
          <CanvasBtn theme={theme} size="xs" variant="ghost" icon="eye">
            {t("p5.records.detail")}
          </CanvasBtn>
        ),
      },
    ];

    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.records.title")}
          subtitle={t("p5.records.subtitle")}
          actions={
            <div style={actionRowStyle}>
              <select
                aria-label={t("p5.records.filter.month")}
                value={recordsMonth}
                onChange={(event) => setRecordsMonth(event.target.value)}
                style={inputStyle}
              >
                {monthOptions.length === 0 ? (
                  <option value="">{t("p5.records.filter.empty")}</option>
                ) : null}
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {t("p5.records.filter.monthLabel", {
                      month: formatMonthLabel(month, locale),
                    })}
                  </option>
                ))}
              </select>
              <CanvasPill theme={theme} tone="success" dot>
                {t("p5.records.coverage", { percent: coveragePercent })}
              </CanvasPill>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="export"
                onClick={() => void exportRecords()}
                disabled={!canExportTripRecords || recordsExporting}
              >
                {recordsExporting
                  ? t("p5.records.exporting")
                  : t("p5.records.export")}
              </CanvasBtn>
            </div>
          }
        />
        {!canExportTripRecords ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            body={t("p5.records.scope.exportOnly")}
          />
        ) : null}
        {recordsError ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warning"
            title={t("p5.records.error.title")}
            body={recordsError}
          />
        ) : null}
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={recordColumns}
            rows={recordsLoading ? [] : recordsRows}
          />
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${theme.border}` }}>
            <span style={{ fontSize: 11, color: theme.textMuted }}>
              {t("p5.records.footer")}
            </span>
          </div>
        </CanvasCard>
      </div>
    );
  }

  const fareColumns: CanvasTableColumn<FareVersionRow>[] = [
    { h: t("p5.fares.col.id"), k: "id", w: 120, mono: true },
    { h: t("p5.fares.col.name"), k: "name", w: 160 },
    {
      h: t("p5.fares.col.status"),
      w: 110,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {t(`p5.status.${row.status}`)}
        </CanvasPill>
      ),
    },
    {
      h: t("p5.fares.col.effectiveFrom"),
      k: "effectiveFrom",
      w: 120,
      mono: true,
    },
    { h: t("p5.fares.col.filingRef"), k: "filingRef", w: 220, mono: true },
    {
      h: "",
      w: 120,
      r: (row) => (
        <CanvasBtn
          theme={theme}
          size="xs"
          variant={row.status === "filed" ? "primary" : "ghost"}
          onClick={() => setSelectedFareId(row.id)}
        >
          {row.status === "filed"
            ? t("p5.fares.schedule")
            : t("p5.fares.preview")}
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("p5.fares.title")}
        subtitle={t("p5.fares.subtitle")}
        actions={
          <CanvasBtn theme={theme} variant="primary" icon="plus">
            {t("p5.fares.create")}
          </CanvasBtn>
        }
      />
      <div style={splitStyle}>
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={fareColumns} rows={fareSeed} />
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title={t("p5.fares.previewCard")}
          subtitle={`${selectedFare.id} · ${t(`p5.status.${selectedFare.status}`)}`}
        >
          <CanvasDL
            theme={theme}
            cols={1}
            items={[
              {
                k: t("p5.fares.startingFare"),
                v: selectedFare.preview.startingFare,
                mono: true,
              },
              {
                k: t("p5.fares.distanceFare"),
                v: selectedFare.preview.distanceFare,
                mono: true,
              },
              {
                k: t("p5.fares.waitingFare"),
                v: selectedFare.preview.waitingFare,
                mono: true,
              },
              {
                k: t("p5.fares.nightSurcharge"),
                v: selectedFare.preview.nightSurcharge,
                mono: true,
              },
            ]}
          />
          <div style={{ marginTop: 10 }}>
            <CanvasBanner
              theme={theme}
              tone="info"
              icon="info"
              body={selectedFare.preview.note}
            />
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
