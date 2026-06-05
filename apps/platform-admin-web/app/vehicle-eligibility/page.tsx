"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

type RawRecord = Record<string, unknown>;

type EligibilityRule = {
  id: string;
  serviceProductId: string;
  serviceProductCode: string;
  serviceProductName: string;
  supportedLicenseTypes: VehicleLicenseType[];
  minSeatCount: number;
  minLuggageCapacity: number;
  airportPermit: boolean;
  businessDispatchEligible: boolean;
  taxiMeterRequired: boolean;
  fixedFareAllowed: boolean;
  platformForwardingAllowed: boolean;
  active: boolean;
  note: string;
};

type MatrixSnapshot = {
  raw: RawRecord | null;
  rules: EligibilityRule[];
  sourceShape: "rules" | "items" | "matrix" | "serviceProducts" | "array";
  updatedAt: string | null;
  updatedBy: string | null;
  revision: string | null;
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

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

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
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
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

function normalizeLicenseTypes(value: unknown): VehicleLicenseType[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  const result: VehicleLicenseType[] = [];
  for (const candidate of candidates) {
    const normalized = String(candidate).trim() as VehicleLicenseType;
    if (LICENSE_TYPES.includes(normalized) && !result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

function normalizeRule(entry: unknown, index: number): EligibilityRule {
  const record = asRecord(entry) ?? {};
  const nested =
    asRecord(record.eligibility) ??
    asRecord(record.rule) ??
    asRecord(record.capability) ??
    asRecord(record.matrix);
  const source = nested ?? record;
  const id =
    asString(record.ruleId) ||
    asString(record.capabilityId) ||
    asString(record.serviceProductId) ||
    asString(record.productId) ||
    asString(record.id) ||
    `rule-${index}`;
  const serviceProductId =
    asString(record.serviceProductId) ||
    asString(record.productId) ||
    asString(record.serviceProductType) ||
    asString(record.code) ||
    id;
  const serviceProductCode =
    asString(record.serviceProductCode) ||
    asString(record.code) ||
    asString(record.serviceProductType) ||
    serviceProductId;

  return {
    id,
    serviceProductId,
    serviceProductCode,
    serviceProductName:
      asString(record.serviceProductName) ||
      asString(record.displayName) ||
      asString(record.name) ||
      serviceProductCode,
    supportedLicenseTypes: normalizeLicenseTypes(
      source.supportedLicenseTypes ??
        source.allowedLicenseTypes ??
        source.licenseTypes ??
        source.vehicleLicenseTypes ??
        source.licenseType,
    ),
    minSeatCount: asNumber(
      source.minSeatCount ?? source.seatCount ?? source.minimumSeatCount,
    ),
    minLuggageCapacity: asNumber(
      source.minLuggageCapacity ??
        source.luggageCapacity ??
        source.minimumLuggageCapacity,
    ),
    airportPermit: asBoolean(
      source.airportPermitRequired ?? source.airportPermit,
    ),
    businessDispatchEligible: asBoolean(source.businessDispatchEligible),
    taxiMeterRequired: asBoolean(source.taxiMeterRequired),
    fixedFareAllowed: asBoolean(source.fixedFareAllowed),
    platformForwardingAllowed: asBoolean(source.platformForwardingAllowed),
    active: source.active === undefined ? true : asBoolean(source.active),
    note: asString(source.note ?? source.notes ?? source.operatorNote),
  };
}

function normalizeMatrixResponse(payload: unknown): MatrixSnapshot {
  if (Array.isArray(payload)) {
    return {
      raw: null,
      rules: payload.map((entry, index) => normalizeRule(entry, index)),
      sourceShape: "array",
      updatedAt: null,
      updatedBy: null,
      revision: null,
      requestId: null,
      normalizedWarning: true,
    };
  }

  const record = asRecord(payload) ?? {};
  const sourceBuckets: Array<[MatrixSnapshot["sourceShape"], unknown]> = [
    ["rules", record.rules],
    ["items", record.items],
    ["matrix", record.matrix],
    ["serviceProducts", record.serviceProducts],
  ];
  const bucket = sourceBuckets.find(([, value]) => Array.isArray(value));
  const entries = Array.isArray(bucket?.[1]) ? bucket[1] : [];

  return {
    raw: record,
    rules: entries.map((entry, index) => normalizeRule(entry, index)),
    sourceShape: bucket?.[0] ?? "rules",
    updatedAt:
      asNullableString(record.updatedAt) ??
      asNullableString(record.lastUpdatedAt) ??
      asNullableString(record.generatedAt),
    updatedBy:
      asNullableString(record.updatedBy) ??
      asNullableString(record.lastUpdatedBy),
    revision:
      asNullableString(record.revision) ?? asNullableString(record.version),
    requestId: asNullableString(record.requestId),
    normalizedWarning: bucket?.[0] !== "rules",
  };
}

function toApiRule(rule: EligibilityRule): RawRecord {
  return {
    ruleId: rule.id,
    serviceProductId: rule.serviceProductId,
    serviceProductCode: rule.serviceProductCode,
    serviceProductName: rule.serviceProductName,
    supportedLicenseTypes: [...rule.supportedLicenseTypes],
    minSeatCount: rule.minSeatCount,
    minLuggageCapacity: rule.minLuggageCapacity,
    airportPermit: rule.airportPermit,
    businessDispatchEligible: rule.businessDispatchEligible,
    taxiMeterRequired: rule.taxiMeterRequired,
    fixedFareAllowed: rule.fixedFareAllowed,
    platformForwardingAllowed: rule.platformForwardingAllowed,
    active: rule.active,
    note: rule.note,
  };
}

function mergeServiceProducts(
  serviceProducts: unknown,
  rules: EligibilityRule[],
): RawRecord[] {
  const items = Array.isArray(serviceProducts) ? serviceProducts : [];
  return items.map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const match =
      rules.find(
        (rule) =>
          rule.serviceProductId ===
            (asString(record.serviceProductId) ||
              asString(record.productId) ||
              asString(record.id)) ||
          rule.serviceProductCode === asString(record.code),
      ) ?? rules[index];
    if (!match) {
      return record;
    }
    return {
      ...record,
      eligibility: {
        ...(asRecord(record.eligibility) ?? {}),
        ...toApiRule(match),
      },
    };
  });
}

function buildSavePayload(
  snapshot: MatrixSnapshot | null,
  rules: EligibilityRule[],
) {
  if (!snapshot?.raw) {
    return { rules: rules.map(toApiRule) };
  }
  if (snapshot.sourceShape === "serviceProducts") {
    return {
      ...snapshot.raw,
      serviceProducts: mergeServiceProducts(
        snapshot.raw.serviceProducts,
        rules,
      ),
    };
  }
  const key =
    snapshot.sourceShape === "items"
      ? "items"
      : snapshot.sourceShape === "matrix"
        ? "matrix"
        : "rules";
  return {
    ...snapshot.raw,
    [key]: rules.map(toApiRule),
  };
}

function booleanTone(value: boolean): CanvasTone {
  return value ? "success" : "neutral";
}

export default function VehicleEligibilityPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MatrixSnapshot | null>(null);
  const [rules, setRules] = useState<EligibilityRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

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
        const normalized = normalizeMatrixResponse(response);
        setSnapshot(normalized);
        setRules(normalized.rules);
        setSelectedRuleId(normalized.rules[0]?.id ?? "");
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

  const selectedRule =
    rules.find((rule) => rule.id === selectedRuleId) ?? rules[0] ?? null;
  const tableRows = rules.map((rule) => ({
    ...rule,
    _selected: rule.id === selectedRule?.id,
  }));

  const columns: CanvasTableColumn<(typeof tableRows)[number]>[] = [
    {
      h: t("vehicleEligibility.product"),
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedRuleId(row.id)}
          style={{
            appearance: "none",
            border: "none",
            background: "transparent",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <div style={stackedCellStyle}>
            <span style={primaryCellTextStyle}>{row.serviceProductName}</span>
            <span style={secondaryCellTextStyle}>{row.serviceProductCode}</span>
          </div>
        </button>
      ),
    },
    {
      h: t("vehicleEligibility.licenseTypes"),
      r: (row) => (
        <div style={chipRowStyle}>
          {row.supportedLicenseTypes.length > 0 ? (
            row.supportedLicenseTypes.map((license) => (
              <CanvasPill key={license} theme={theme} tone="info">
                {t(`vehicleEligibility.license.${license}`)}
              </CanvasPill>
            ))
          ) : (
            <CanvasPill theme={theme} tone="neutral">
              {t("vehicleEligibility.none")}
            </CanvasPill>
          )}
        </div>
      ),
    },
    {
      h: t("vehicleEligibility.minSeatCount"),
      align: "right",
      r: (row) => row.minSeatCount || t("vehicleEligibility.unspecified"),
    },
    {
      h: t("vehicleEligibility.minLuggageCapacity"),
      align: "right",
      r: (row) => row.minLuggageCapacity || t("vehicleEligibility.unspecified"),
    },
    {
      h: t("vehicleEligibility.airportPermit"),
      r: (row) => (
        <CanvasPill theme={theme} tone={booleanTone(row.airportPermit)} dot>
          {row.airportPermit
            ? t("vehicleEligibility.yes")
            : t("vehicleEligibility.no")}
        </CanvasPill>
      ),
    },
    {
      h: t("common.status"),
      r: (row) => (
        <CanvasPill theme={theme} tone={booleanTone(row.active)} dot>
          {row.active
            ? t("vehicleEligibility.enabled")
            : t("vehicleEligibility.disabled")}
        </CanvasPill>
      ),
    },
  ];

  function updateSelectedRule(
    updater: (rule: EligibilityRule) => EligibilityRule,
  ) {
    if (!selectedRule) {
      return;
    }
    setRules((current) =>
      current.map((rule) =>
        rule.id === selectedRule.id ? updater(rule) : rule,
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
      const normalized = normalizeMatrixResponse(response);
      setSnapshot(normalized);
      setRules(normalized.rules);
      setSelectedRuleId(normalized.rules[0]?.id ?? "");
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
        { body: buildSavePayload(snapshot, rules) },
      );
      const normalized = normalizeMatrixResponse(response);
      setSnapshot(normalized);
      setRules(normalized.rules);
      setSelectedRuleId((current) =>
        normalized.rules.some((rule) => rule.id === current)
          ? current
          : (normalized.rules[0]?.id ?? ""),
      );
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
              disabled={loading || saving || rules.length === 0}
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
        ) : rules.length === 0 ? (
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
                <p style={kpiLabelStyle}>{t("vehicleEligibility.kpi.rules")}</p>
                <p style={kpiValueStyle}>{rules.length}</p>
                <p style={kpiSubStyle}>{t("vehicleEligibility.tableTitle")}</p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.active")}
                </p>
                <p style={kpiValueStyle}>
                  {rules.filter((rule) => rule.active).length}
                </p>
                <p style={kpiSubStyle}>{t("common.status")}</p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.airport")}
                </p>
                <p style={kpiValueStyle}>
                  {rules.filter((rule) => rule.airportPermit).length}
                </p>
                <p style={kpiSubStyle}>
                  {t("vehicleEligibility.airportPermit")}
                </p>
              </CanvasCard>
              <CanvasCard theme={theme}>
                <p style={kpiLabelStyle}>
                  {t("vehicleEligibility.kpi.updated")}
                </p>
                <p style={{ ...kpiValueStyle, fontSize: 18 }}>
                  {snapshot?.updatedAt
                    ? formatDateTime(snapshot.updatedAt)
                    : t("vehicleEligibility.kpi.updatedUnknown")}
                </p>
                <p style={kpiSubStyle}>
                  {snapshot?.updatedBy ?? t("vehicleEligibility.unspecified")}
                </p>
              </CanvasCard>
            </div>

            <div style={contentGridStyle}>
              <CanvasCard
                theme={theme}
                title={t("vehicleEligibility.tableTitle")}
                subtitle={t("vehicleEligibility.tableSubtitle", {
                  count: rules.length,
                })}
              >
                <CanvasTable theme={theme} columns={columns} rows={tableRows} />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("vehicleEligibility.detailTitle")}
                subtitle={t("vehicleEligibility.detailSubtitle")}
              >
                {selectedRule ? (
                  <>
                    <div style={formGridStyle}>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.productCode")}
                      >
                        <input
                          value={selectedRule.serviceProductCode}
                          readOnly
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.productName")}
                      >
                        <input
                          value={selectedRule.serviceProductName}
                          readOnly
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.minSeatCount")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={selectedRule.minSeatCount}
                          onChange={(event) =>
                            updateSelectedRule((rule) => ({
                              ...rule,
                              minSeatCount: Math.max(
                                0,
                                Number(event.target.value || 0),
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={theme}
                        label={t("vehicleEligibility.minLuggageCapacity")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={selectedRule.minLuggageCapacity}
                          onChange={(event) =>
                            updateSelectedRule((rule) => ({
                              ...rule,
                              minLuggageCapacity: Math.max(
                                0,
                                Number(event.target.value || 0),
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </CanvasField>
                      <div style={fullWidthStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("vehicleEligibility.licenseTypes")}
                        >
                          <div style={chipRowStyle}>
                            {LICENSE_TYPES.map((license) => {
                              const active =
                                selectedRule.supportedLicenseTypes.includes(
                                  license,
                                );
                              return (
                                <button
                                  key={license}
                                  type="button"
                                  style={toggleChipStyle(active)}
                                  onClick={() =>
                                    updateSelectedRule((rule) => ({
                                      ...rule,
                                      supportedLicenseTypes: active
                                        ? rule.supportedLicenseTypes.filter(
                                            (entry) => entry !== license,
                                          )
                                        : [
                                            ...rule.supportedLicenseTypes,
                                            license,
                                          ],
                                    }))
                                  }
                                >
                                  {t(`vehicleEligibility.license.${license}`)}
                                </button>
                              );
                            })}
                          </div>
                        </CanvasField>
                      </div>
                      <div style={fullWidthStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("vehicleEligibility.note")}
                        >
                          <textarea
                            value={selectedRule.note}
                            onChange={(event) =>
                              updateSelectedRule((rule) => ({
                                ...rule,
                                note: event.target.value,
                              }))
                            }
                            rows={4}
                            placeholder={t(
                              "vehicleEligibility.notePlaceholder",
                            )}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </CanvasField>
                      </div>
                    </div>

                    <div style={checkboxRowStyle}>
                      {[
                        "airportPermit",
                        "businessDispatchEligible",
                        "taxiMeterRequired",
                        "fixedFareAllowed",
                        "platformForwardingAllowed",
                        "active",
                      ].map((field) => (
                        <label key={field} style={checkboxItemStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(
                              selectedRule[field as keyof EligibilityRule],
                            )}
                            onChange={(event) =>
                              updateSelectedRule((rule) => ({
                                ...rule,
                                [field]: event.target.checked,
                              }))
                            }
                          />
                          <span>{t(`vehicleEligibility.${field}`)}</span>
                        </label>
                      ))}
                    </div>

                    <div style={chipRowStyle}>
                      <CanvasPill theme={theme} tone="neutral">
                        {t("vehicleEligibility.sourceShape")}:{" "}
                        {snapshot?.sourceShape ?? "rules"}
                      </CanvasPill>
                      {snapshot?.revision ? (
                        <CanvasPill theme={theme} tone="neutral">
                          {t("vehicleEligibility.revision")}:{" "}
                          {snapshot.revision}
                        </CanvasPill>
                      ) : null}
                      {snapshot?.requestId ? (
                        <CanvasPill theme={theme} tone="neutral">
                          {t("vehicleEligibility.requestId")}:{" "}
                          {snapshot.requestId}
                        </CanvasPill>
                      ) : null}
                      {snapshot?.updatedBy ? (
                        <CanvasPill theme={theme} tone="neutral">
                          {t("vehicleEligibility.updatedBy")}:{" "}
                          {snapshot.updatedBy}
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
