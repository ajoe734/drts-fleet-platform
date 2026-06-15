"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type VehicleLicenseType =
  | "taxi"
  | "multi_purpose_taxi"
  | "rental_car"
  | "business_vehicle"
  | "airport_transfer_vehicle";

type ServiceProductType =
  | "taxi_realtime"
  | "taxi_reservation"
  | "enterprise_dispatch"
  | "credit_card_airport_transfer"
  | "insurance_replacement_vehicle"
  | "travel_agency_transfer"
  | "third_party_forwarded_order";

// F3 design canvas cell states. `allowed` / `notAllowed` are the base axis;
// the remaining four are qualifiers layered on a supported cell, all sourced
// from the DH-ADM-ELIG-MODEL contract fields (no fabricated data).
type CellState =
  | "allowed"
  | "notAllowed"
  | "conditionallyAllowed"
  | "requiredDocuments"
  | "trainingRequired"
  | "permitRequired";

type RawRecord = Record<string, unknown>;

type MatrixRecord = {
  capabilityId: string;
  licenseType: VehicleLicenseType;
  supportedProducts: ServiceProductType[];
  seatCount: number;
  luggageCapacity: number;
  airportPermit: boolean;
  businessDispatchEligible: boolean;
  taxiMeterRequired: boolean;
  fixedFareAllowed: boolean;
  conditionallyAllowed: boolean;
  requiredDocuments: string[];
  trainingRequired: boolean;
  permitRequired: boolean;
  platformForwardingAllowed: boolean;
  active: boolean;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type MatrixSnapshot = {
  records: MatrixRecord[];
  requestId: string | null;
  normalizedWarning: boolean;
};

const LICENSE_TYPES: VehicleLicenseType[] = [
  "taxi",
  "multi_purpose_taxi",
  "rental_car",
  "business_vehicle",
  "airport_transfer_vehicle",
];

const SERVICE_PRODUCT_TYPES: ServiceProductType[] = [
  "taxi_realtime",
  "taxi_reservation",
  "enterprise_dispatch",
  "credit_card_airport_transfer",
  "insurance_replacement_vehicle",
  "travel_agency_transfer",
  "third_party_forwarded_order",
];

const LICENSE_TYPE_SET = new Set<string>(LICENSE_TYPES);
const SERVICE_PRODUCT_TYPE_SET = new Set<string>(SERVICE_PRODUCT_TYPES);

// Legend / cell ordering. `allowed` and `notAllowed` are mutually exclusive
// bases; qualifiers only ever stack on top of `allowed`.
const STATE_ORDER: CellState[] = [
  "allowed",
  "conditionallyAllowed",
  "requiredDocuments",
  "trainingRequired",
  "permitRequired",
  "notAllowed",
];

const STATE_TONE: Record<CellState, CanvasTone> = {
  allowed: "success",
  notAllowed: "neutral",
  conditionallyAllowed: "warn",
  requiredDocuments: "info",
  trainingRequired: "accent",
  permitRequired: "danger",
};

const EDITABLE_FLAGS = [
  "conditionallyAllowed",
  "trainingRequired",
  "permitRequired",
  "airportPermit",
  "businessDispatchEligible",
  "taxiMeterRequired",
  "fixedFareAllowed",
  "platformForwardingAllowed",
  "active",
] as const;

const theme = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const kpiLabelStyle = {
  margin: 0,
  color: theme.textDim,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const kpiValueStyle = {
  margin: 0,
  color: theme.text,
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.03em",
} satisfies CSSProperties;

const kpiSubStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const contentGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.85fr)",
  alignItems: "start",
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
} satisfies CSSProperties;

const primaryCellTextStyle = {
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const secondaryCellTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
} satisfies CSSProperties;

const cellStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
} satisfies CSSProperties;

const legendRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const chipRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const toggleChipStyle = (active: boolean): CSSProperties => ({
  appearance: "none",
  borderRadius: 999,
  border: `1px solid ${active ? theme.accentBorder : theme.border}`,
  background: active ? theme.accentBg : theme.surface,
  color: active ? theme.accent : theme.textMuted,
  padding: "6px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
});

const formGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
} satisfies CSSProperties;

const fullWidthStyle = {
  gridColumn: "1 / -1",
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "9px 11px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const checkboxRowStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: 12,
} satisfies CSSProperties;

const checkboxItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  fontSize: 12.5,
  color: theme.text,
} satisfies CSSProperties;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes", "enabled", "active"].includes(
      value.trim().toLowerCase(),
    );
  }
  return false;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function normalizeServiceProducts(value: unknown): ServiceProductType[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  const result: ServiceProductType[] = [];
  for (const candidate of candidates) {
    const normalized = String(candidate).trim();
    if (
      SERVICE_PRODUCT_TYPE_SET.has(normalized) &&
      !result.includes(normalized as ServiceProductType)
    ) {
      result.push(normalized as ServiceProductType);
    }
  }
  return result;
}

function normalizeRecord(entry: unknown, index: number): MatrixRecord {
  const record = asRecord(entry) ?? {};
  const licenseType = asString(record.licenseType) as VehicleLicenseType;
  return {
    capabilityId:
      asString(record.capabilityId) ||
      asString(record.id) ||
      `capability-${index}`,
    licenseType,
    supportedProducts: normalizeServiceProducts(record.supportedProducts),
    seatCount: asNumber(record.seatCount),
    luggageCapacity: asNumber(record.luggageCapacity),
    airportPermit: asBoolean(record.airportPermit),
    businessDispatchEligible: asBoolean(record.businessDispatchEligible),
    taxiMeterRequired: asBoolean(record.taxiMeterRequired),
    fixedFareAllowed: asBoolean(record.fixedFareAllowed),
    conditionallyAllowed: asBoolean(record.conditionallyAllowed),
    requiredDocuments: normalizeStringList(record.requiredDocuments),
    trainingRequired: asBoolean(record.trainingRequired),
    permitRequired: asBoolean(record.permitRequired),
    platformForwardingAllowed: asBoolean(record.platformForwardingAllowed),
    active: record.active === undefined ? true : asBoolean(record.active),
    effectiveFrom: asNullableString(record.effectiveFrom),
    effectiveUntil: asNullableString(record.effectiveUntil),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
  };
}

function normalizeMatrixResponse(payload: unknown): MatrixSnapshot {
  if (Array.isArray(payload)) {
    return {
      records: payload.map((entry, index) => normalizeRecord(entry, index)),
      requestId: null,
      normalizedWarning: true,
    };
  }

  const record = asRecord(payload) ?? {};
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.matrix)
      ? record.matrix
      : Array.isArray(record.rules)
        ? record.rules
        : [];

  return {
    records: items.map((entry, index) => normalizeRecord(entry, index)),
    requestId:
      asNullableString(record.requestId) ??
      asNullableString(asRecord(record.meta)?.requestId),
    normalizedWarning: !Array.isArray(record.items),
  };
}

function toApiItem(record: MatrixRecord): RawRecord {
  return {
    capabilityId: record.capabilityId,
    licenseType: record.licenseType,
    supportedProducts: [...record.supportedProducts],
    seatCount: record.seatCount,
    luggageCapacity: record.luggageCapacity,
    airportPermit: record.airportPermit,
    businessDispatchEligible: record.businessDispatchEligible,
    taxiMeterRequired: record.taxiMeterRequired,
    fixedFareAllowed: record.fixedFareAllowed,
    conditionallyAllowed: record.conditionallyAllowed,
    requiredDocuments: [...record.requiredDocuments],
    trainingRequired: record.trainingRequired,
    permitRequired: record.permitRequired,
    platformForwardingAllowed: record.platformForwardingAllowed,
    active: record.active,
    effectiveFrom: record.effectiveFrom,
    effectiveUntil: record.effectiveUntil,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Derive the F3 cell states for one (license-type record × service-product)
// pair, reading only the contract fields on the record.
function cellStatesFor(
  product: ServiceProductType,
  record: MatrixRecord | undefined,
): CellState[] {
  if (!record || !record.supportedProducts.includes(product)) {
    return ["notAllowed"];
  }
  const states: CellState[] = [
    record.conditionallyAllowed ? "conditionallyAllowed" : "allowed",
  ];
  if (record.requiredDocuments.length > 0) {
    states.push("requiredDocuments");
  }
  if (record.trainingRequired) {
    states.push("trainingRequired");
  }
  if (record.permitRequired) {
    states.push("permitRequired");
  }
  return states;
}

export default function VehicleEligibilityPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MatrixSnapshot | null>(null);
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<
    VehicleLicenseType | ""
  >("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  function applySnapshot(normalized: MatrixSnapshot) {
    setSnapshot(normalized);
    setRecords(normalized.records);
    setSelectedLicense((current) =>
      normalized.records.some((record) => record.licenseType === current)
        ? current
        : (normalized.records[0]?.licenseType ?? ""),
    );
  }

  useEffect(() => {
    let active = true;

    async function loadMatrix() {
      setLoading(true);
      setError(null);
      try {
        const response = await client.get<unknown>(
          "/api/admin/vehicle-eligibility-matrix",
        );
        if (!active) {
          return;
        }
        applySnapshot(normalizeMatrixResponse(response));
      } catch (nextError) {
        if (active) {
          setError(
            nextError instanceof Error ? nextError.message : String(nextError),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadMatrix();

    return () => {
      active = false;
    };
  }, [client]);

  const recordByLicense = useMemo(() => {
    const map = new Map<VehicleLicenseType, MatrixRecord>();
    for (const record of records) {
      if (LICENSE_TYPE_SET.has(record.licenseType)) {
        map.set(record.licenseType, record);
      }
    }
    return map;
  }, [records]);

  const selectedRecord =
    records.find((record) => record.licenseType === selectedLicense) ?? null;

  const activeLicenseTypes = LICENSE_TYPES.filter((license) =>
    recordByLicense.has(license),
  );

  const conditionalCount = records.filter(
    (record) => record.conditionallyAllowed,
  ).length;
  const gatedCount = records.filter(
    (record) =>
      record.trainingRequired ||
      record.permitRequired ||
      record.requiredDocuments.length > 0,
  ).length;

  const matrixRows = SERVICE_PRODUCT_TYPES.map((product) => ({ product }));

  const columns: CanvasTableColumn<(typeof matrixRows)[number]>[] = [
    {
      h: t("vehicleEligibility.col.serviceProduct"),
      w: 220,
      r: (row) => (
        <div style={stackedCellStyle}>
          <span style={primaryCellTextStyle}>
            {t(`serviceProducts.type.${row.product}`)}
          </span>
          <span style={secondaryCellTextStyle}>{row.product}</span>
        </div>
      ),
    },
    ...activeLicenseTypes.map<CanvasTableColumn<(typeof matrixRows)[number]>>(
      (license) => ({
        h: t(`vehicleEligibility.license.${license}`),
        r: (row) => {
          const record = recordByLicense.get(license);
          const states = cellStatesFor(row.product, record);
          return (
            <div style={cellStackStyle}>
              {states.map((state) => (
                <CanvasPill
                  key={state}
                  theme={theme}
                  tone={STATE_TONE[state]}
                  dot
                >
                  {state === "requiredDocuments" && record
                    ? t("vehicleEligibility.state.requiredDocumentsCount", {
                        count: record.requiredDocuments.length,
                      })
                    : t(`vehicleEligibility.state.${state}`)}
                </CanvasPill>
              ))}
            </div>
          );
        },
      }),
    ),
  ];

  function updateSelectedRecord(
    updater: (record: MatrixRecord) => MatrixRecord,
  ) {
    if (!selectedRecord) {
      return;
    }
    setRecords((current) =>
      current.map((record) =>
        record.licenseType === selectedRecord.licenseType
          ? updater(record)
          : record,
      ),
    );
  }

  async function refreshMatrix() {
    setFlash(null);
    setLoading(true);
    setError(null);
    try {
      const response = await client.get<unknown>(
        "/api/admin/vehicle-eligibility-matrix",
      );
      applySnapshot(normalizeMatrixResponse(response));
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveMatrix() {
    setSaving(true);
    setFlash(null);
    try {
      const response = await client.put<unknown>(
        "/api/admin/vehicle-eligibility-matrix",
        { body: { items: records.map(toApiItem) } },
      );
      applySnapshot(normalizeMatrixResponse(response));
      setFlash({
        tone: "success",
        message: t("vehicleEligibility.saveSuccess"),
      });
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : String(nextError);
      setFlash({
        tone: "danger",
        message: `${t("vehicleEligibility.saveError")} ${message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <CanvasPageHeader
        theme={theme}
        sticky={false}
        title={t("vehicleEligibility.title")}
        subtitle={t("vehicleEligibility.subtitle")}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="ghost"
              icon="refresh"
              onClick={() => void refreshMatrix()}
              disabled={loading || saving}
            >
              {t("vehicleEligibility.refresh")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="save"
              onClick={() => void saveMatrix()}
              disabled={loading || saving || records.length === 0}
            >
              {saving ? t("common.saving") : t("vehicleEligibility.save")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("vehicleEligibility.loadErrorTitle")}
            body={error}
          />
        ) : null}

        {flash ? (
          <CanvasBanner
            theme={theme}
            tone={flash.tone}
            icon={flash.tone === "danger" ? "warn" : "check"}
            title={flash.message}
          />
        ) : null}

        {snapshot?.normalizedWarning ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title={t("vehicleEligibility.schemaWarningTitle")}
            body={t("vehicleEligibility.schemaWarningBody")}
          />
        ) : null}

        {loading ? (
          <CanvasCard theme={theme}>
            <div style={kpiSubStyle}>{t("vehicleEligibility.loading")}</div>
          </CanvasCard>
        ) : records.length === 0 ? (
          <CanvasCard theme={theme}>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="info"
              title={t("vehicleEligibility.emptyTitle")}
              body={t("vehicleEligibility.emptyBody")}
            />
          </CanvasCard>
        ) : (
          <>
            <div style={kpiGridStyle}>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.licenses")}
                </p>
                <p style={kpiValueStyle}>{records.length}</p>
                <p style={kpiSubStyle}>{t("vehicleEligibility.tableTitle")}</p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.active")}
                </p>
                <p style={kpiValueStyle}>
                  {records.filter((record) => record.active).length}
                </p>
                <p style={kpiSubStyle}>{t("common.status")}</p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.conditional")}
                </p>
                <p style={kpiValueStyle}>{conditionalCount}</p>
                <p style={kpiSubStyle}>
                  {t("vehicleEligibility.state.conditionallyAllowed")}
                </p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>{t("vehicleEligibility.kpi.gated")}</p>
                <p style={kpiValueStyle}>{gatedCount}</p>
                <p style={kpiSubStyle}>
                  {t("vehicleEligibility.kpi.gatedSub")}
                </p>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={t("vehicleEligibility.legendTitle")}
            >
              <div style={legendRowStyle}>
                {STATE_ORDER.map((state) => (
                  <CanvasPill
                    key={state}
                    theme={theme}
                    tone={STATE_TONE[state]}
                    dot
                  >
                    {t(`vehicleEligibility.state.${state}`)}
                  </CanvasPill>
                ))}
              </div>
            </CanvasCard>

            <div style={contentGridStyle}>
              <CanvasCard
                theme={theme}
                title={t("vehicleEligibility.tableTitle")}
                subtitle={t("vehicleEligibility.tableSubtitle", {
                  count: records.length,
                })}
              >
                <CanvasTable
                  theme={theme}
                  columns={columns}
                  rows={matrixRows}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("vehicleEligibility.detailTitle")}
                subtitle={t("vehicleEligibility.detailSubtitle")}
              >
                <div style={{ ...chipRowStyle, marginBottom: 12 }}>
                  {activeLicenseTypes.map((license) => (
                    <button
                      key={license}
                      type="button"
                      style={toggleChipStyle(license === selectedLicense)}
                      onClick={() => setSelectedLicense(license)}
                    >
                      {t(`vehicleEligibility.license.${license}`)}
                    </button>
                  ))}
                </div>

                {selectedRecord ? (
                  <>
                    <div style={formGridStyle}>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.capabilityId")}
                      >
                        <input
                          value={selectedRecord.capabilityId}
                          readOnly
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.licenseType")}
                      >
                        <input
                          value={t(
                            `vehicleEligibility.license.${selectedRecord.licenseType}`,
                          )}
                          readOnly
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.seatCount")}
                      >
                        <input
                          type="number"
                          min={1}
                          value={selectedRecord.seatCount}
                          onChange={(event) =>
                            updateSelectedRecord((record) => ({
                              ...record,
                              seatCount: Math.max(
                                1,
                                Math.round(Number(event.target.value || 1)),
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.luggageCapacity")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={selectedRecord.luggageCapacity}
                          onChange={(event) =>
                            updateSelectedRecord((record) => ({
                              ...record,
                              luggageCapacity: Math.max(
                                0,
                                Math.round(Number(event.target.value || 0)),
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </CanvasField>
                      <div style={fullWidthStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("vehicleEligibility.supportedProducts")}
                        >
                          <div style={chipRowStyle}>
                            {SERVICE_PRODUCT_TYPES.map((product) => {
                              const active =
                                selectedRecord.supportedProducts.includes(
                                  product,
                                );
                              return (
                                <button
                                  key={product}
                                  type="button"
                                  style={toggleChipStyle(active)}
                                  onClick={() =>
                                    updateSelectedRecord((record) => ({
                                      ...record,
                                      supportedProducts: active
                                        ? record.supportedProducts.filter(
                                            (entry) => entry !== product,
                                          )
                                        : [
                                            ...record.supportedProducts,
                                            product,
                                          ],
                                    }))
                                  }
                                >
                                  {t(`serviceProducts.type.${product}`)}
                                </button>
                              );
                            })}
                          </div>
                        </CanvasField>
                      </div>
                      <div style={fullWidthStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("vehicleEligibility.requiredDocuments")}
                        >
                          <textarea
                            value={selectedRecord.requiredDocuments.join("\n")}
                            onChange={(event) =>
                              updateSelectedRecord((record) => ({
                                ...record,
                                requiredDocuments: normalizeStringList(
                                  event.target.value,
                                ),
                              }))
                            }
                            rows={3}
                            placeholder={t(
                              "vehicleEligibility.requiredDocumentsPlaceholder",
                            )}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </CanvasField>
                      </div>
                    </div>

                    <div style={checkboxRowStyle}>
                      {EDITABLE_FLAGS.map((field) => (
                        <label key={field} style={checkboxItemStyle}>
                          <input
                            type="checkbox"
                            checked={selectedRecord[field]}
                            onChange={(event) =>
                              updateSelectedRecord((record) => ({
                                ...record,
                                [field]: event.target.checked,
                              }))
                            }
                          />
                          <span>{t(`vehicleEligibility.${field}`)}</span>
                        </label>
                      ))}
                    </div>

                    <div style={{ ...chipRowStyle, marginTop: 12 }}>
                      {selectedRecord.updatedAt ? (
                        <CanvasPill theme={theme} tone="neutral">
                          {t("vehicleEligibility.updatedAt")}:{" "}
                          {formatDateTime(selectedRecord.updatedAt)}
                        </CanvasPill>
                      ) : null}
                      {snapshot?.requestId ? (
                        <CanvasPill theme={theme} tone="neutral">
                          {t("vehicleEligibility.requestId")}:{" "}
                          {snapshot.requestId}
                        </CanvasPill>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    icon="info"
                    title={t("vehicleEligibility.noSelection")}
                    body={t("vehicleEligibility.selectRule")}
                  />
                )}
              </CanvasCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
