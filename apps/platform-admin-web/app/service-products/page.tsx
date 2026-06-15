"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  type CanvasTheme,
} from "@drts/ui-web";

type ServiceProductType =
  | "taxi_realtime"
  | "taxi_reservation"
  | "enterprise_dispatch"
  | "credit_card_airport_transfer"
  | "insurance_replacement_vehicle"
  | "travel_agency_transfer"
  | "third_party_forwarded_order";

type ServiceProductTiming = "realtime" | "reservation" | "external_defined";

type BillingMode =
  | "meter"
  | "fixed_fare"
  | "tenant_invoice"
  | "partner_settlement";

type VehicleLicenseType =
  | "taxi"
  | "multi_purpose_taxi"
  | "rental_car"
  | "business_vehicle"
  | "airport_transfer_vehicle";

type ServiceProductRecord = {
  serviceProductId: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description: string;
  timing: ServiceProductTiming;
  active: boolean;
  // F2 contract fields from DH-ADM-ELIG-MODEL.
  allowedLicenseTypes: VehicleLicenseType[];
  meterRequired: boolean;
  fixedFareAllowed: boolean;
  defaultBillingMode: BillingMode;
  defaultProofRequirements: string[];
  createdAt: string | null;
  updatedAt: string | null;
} & Record<string, unknown>;

type ServiceProductsEnvelope =
  | ServiceProductRecord[]
  | {
      items?: unknown[];
      serviceProducts?: unknown[];
    };

type ServiceProductDraft = {
  serviceProductId: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description: string;
  timing: ServiceProductTiming;
  active: boolean;
  allowedLicenseTypes: VehicleLicenseType[];
  meterRequired: boolean;
  fixedFareAllowed: boolean;
  defaultBillingMode: BillingMode;
  proofRequirementsText: string;
};

const SERVICE_PRODUCT_TYPES: ServiceProductType[] = [
  "taxi_realtime",
  "taxi_reservation",
  "enterprise_dispatch",
  "credit_card_airport_transfer",
  "insurance_replacement_vehicle",
  "travel_agency_transfer",
  "third_party_forwarded_order",
];

const SERVICE_PRODUCT_TIMINGS: ServiceProductTiming[] = [
  "realtime",
  "reservation",
  "external_defined",
];

const BILLING_MODES: BillingMode[] = [
  "meter",
  "fixed_fare",
  "tenant_invoice",
  "partner_settlement",
];

const VEHICLE_LICENSE_TYPES: VehicleLicenseType[] = [
  "taxi",
  "multi_purpose_taxi",
  "rental_car",
  "business_vehicle",
  "airport_transfer_vehicle",
];

const VEHICLE_LICENSE_TYPE_SET = new Set<string>(VEHICLE_LICENSE_TYPES);

function normalizeLicenseTypes(value: unknown): VehicleLicenseType[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  const result: VehicleLicenseType[] = [];
  for (const candidate of candidates) {
    const normalized = String(candidate).trim();
    if (
      VEHICLE_LICENSE_TYPE_SET.has(normalized) &&
      !result.includes(normalized as VehicleLicenseType)
    ) {
      result.push(normalized as VehicleLicenseType);
    }
  }
  return result;
}

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

const workspaceGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(340px, 0.95fr)",
  alignItems: "start",
} satisfies CSSProperties;

const panelStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const fieldHintStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "32px 16px",
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const infoGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
} satisfies CSSProperties;

const infoCardStyle = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: 12,
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const infoLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: theme.textDim,
} satisfies CSSProperties;

const infoValueStyle = {
  fontSize: 12.5,
  color: theme.text,
  lineHeight: 1.45,
} satisfies CSSProperties;

const tokenWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const codeTextStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
} satisfies CSSProperties;

const primaryCellButtonStyle = (selected: boolean): CSSProperties => ({
  appearance: "none",
  width: "100%",
  padding: 0,
  margin: 0,
  border: 0,
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  display: "grid",
  gap: 4,
  color: selected ? theme.accent : theme.text,
});

const primaryCellTitleStyle = {
  fontSize: 12.5,
  fontWeight: 600,
} satisfies CSSProperties;

const headerActionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 12,
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

function inputStyle(th: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: `1px solid ${th.border}`,
    background: th.bgRaised,
    color: th.text,
    fontFamily: th.fontFamily,
    fontSize: 12.5,
    padding: "9px 10px",
    outline: "none",
  };
}

function textareaStyle(th: CanvasTheme): CSSProperties {
  return {
    ...inputStyle(th),
    minHeight: 96,
    lineHeight: 1.5,
    resize: "vertical",
  };
}

function normalizeProofRequirements(value: unknown): string[] {
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

function normalizeServiceProductRecord(value: unknown): ServiceProductRecord {
  const record = (value ?? {}) as Record<string, unknown>;
  const serviceProductId = String(
    record.serviceProductId ?? record.id ?? record.serviceProductType ?? "",
  );
  const serviceProductType = String(
    record.serviceProductType ?? "taxi_realtime",
  ) as ServiceProductType;
  const timing = String(record.timing ?? "realtime") as ServiceProductTiming;
  const defaultBillingMode = String(
    record.defaultBillingMode ?? "meter",
  ) as BillingMode;

  return {
    ...record,
    serviceProductId,
    serviceProductType,
    displayName: String(record.displayName ?? serviceProductId),
    description: String(record.description ?? ""),
    timing,
    active: Boolean(record.active),
    allowedLicenseTypes: normalizeLicenseTypes(record.allowedLicenseTypes),
    meterRequired: Boolean(record.meterRequired),
    fixedFareAllowed: Boolean(record.fixedFareAllowed),
    defaultBillingMode,
    defaultProofRequirements: normalizeProofRequirements(
      record.defaultProofRequirements,
    ),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

function normalizeServiceProductsPayload(
  payload: ServiceProductsEnvelope,
): ServiceProductRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeServiceProductRecord);
  }

  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.serviceProducts)
      ? payload.serviceProducts
      : [];

  return items.map(normalizeServiceProductRecord);
}

function draftFromRecord(record: ServiceProductRecord): ServiceProductDraft {
  return {
    serviceProductId: record.serviceProductId,
    serviceProductType: record.serviceProductType,
    displayName: record.displayName,
    description: record.description,
    timing: record.timing,
    active: record.active,
    allowedLicenseTypes: [...record.allowedLicenseTypes],
    meterRequired: record.meterRequired,
    fixedFareAllowed: record.fixedFareAllowed,
    defaultBillingMode: record.defaultBillingMode,
    proofRequirementsText: record.defaultProofRequirements.join("\n"),
  };
}

function createEmptyDraft(): ServiceProductDraft {
  return {
    serviceProductId: "",
    serviceProductType: "taxi_realtime",
    displayName: "",
    description: "",
    timing: "realtime",
    active: true,
    allowedLicenseTypes: [],
    meterRequired: false,
    fixedFareAllowed: false,
    defaultBillingMode: "meter",
    proofRequirementsText: "",
  };
}

function toCommand(draft: ServiceProductDraft) {
  return {
    serviceProductId: draft.serviceProductId.trim(),
    serviceProductType: draft.serviceProductType,
    displayName: draft.displayName.trim(),
    description: draft.description.trim() || undefined,
    timing: draft.timing,
    active: draft.active,
    allowedLicenseTypes: [...draft.allowedLicenseTypes],
    meterRequired: draft.meterRequired,
    fixedFareAllowed: draft.fixedFareAllowed,
    defaultBillingMode: draft.defaultBillingMode,
    defaultProofRequirements: normalizeProofRequirements(
      draft.proofRequirementsText,
    ),
  };
}

function ServiceProductForm({
  draft,
  setDraft,
  disabledId,
  t,
}: {
  draft: ServiceProductDraft;
  setDraft: Dispatch<SetStateAction<ServiceProductDraft>>;
  disabledId: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div style={formGridStyle}>
      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.serviceProductId")}
      >
        <input
          value={draft.serviceProductId}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              serviceProductId: event.target.value,
            }))
          }
          placeholder={t("serviceProducts.placeholder.serviceProductId")}
          style={inputStyle(theme)}
          disabled={disabledId}
        />
      </CanvasField>

      <CanvasField theme={theme} label={t("serviceProducts.form.displayName")}>
        <input
          value={draft.displayName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              displayName: event.target.value,
            }))
          }
          placeholder={t("serviceProducts.placeholder.displayName")}
          style={inputStyle(theme)}
        />
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.serviceProductType")}
      >
        <select
          value={draft.serviceProductType}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              serviceProductType: event.target.value as ServiceProductType,
            }))
          }
          style={inputStyle(theme)}
        >
          {SERVICE_PRODUCT_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(`serviceProducts.type.${option}`)}
            </option>
          ))}
        </select>
      </CanvasField>

      <CanvasField theme={theme} label={t("serviceProducts.form.timing")}>
        <select
          value={draft.timing}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              timing: event.target.value as ServiceProductTiming,
            }))
          }
          style={inputStyle(theme)}
        >
          {SERVICE_PRODUCT_TIMINGS.map((option) => (
            <option key={option} value={option}>
              {t(`serviceProducts.timing.${option}`)}
            </option>
          ))}
        </select>
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.defaultBillingMode")}
      >
        <select
          value={draft.defaultBillingMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              defaultBillingMode: event.target.value as BillingMode,
            }))
          }
          style={inputStyle(theme)}
        >
          {BILLING_MODES.map((option) => (
            <option key={option} value={option}>
              {t(`serviceProducts.billing.${option}`)}
            </option>
          ))}
        </select>
      </CanvasField>

      <CanvasField theme={theme} label={t("serviceProducts.form.active")}>
        <select
          value={draft.active ? "active" : "inactive"}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              active: event.target.value === "active",
            }))
          }
          style={inputStyle(theme)}
        >
          <option value="active">{t("common.active")}</option>
          <option value="inactive">{t("common.inactive")}</option>
        </select>
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.allowedLicenseTypes")}
      >
        <div style={chipRowStyle}>
          {VEHICLE_LICENSE_TYPES.map((license) => {
            const active = draft.allowedLicenseTypes.includes(license);
            return (
              <button
                key={license}
                type="button"
                style={toggleChipStyle(active)}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    allowedLicenseTypes: active
                      ? current.allowedLicenseTypes.filter(
                          (entry) => entry !== license,
                        )
                      : [...current.allowedLicenseTypes, license],
                  }))
                }
              >
                {t(`serviceProducts.license.${license}`)}
              </button>
            );
          })}
        </div>
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.meterRequired")}
      >
        <select
          value={draft.meterRequired ? "yes" : "no"}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              meterRequired: event.target.value === "yes",
            }))
          }
          style={inputStyle(theme)}
        >
          <option value="yes">{t("common.yes")}</option>
          <option value="no">{t("common.no")}</option>
        </select>
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.fixedFareAllowed")}
      >
        <select
          value={draft.fixedFareAllowed ? "yes" : "no"}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              fixedFareAllowed: event.target.value === "yes",
            }))
          }
          style={inputStyle(theme)}
        >
          <option value="yes">{t("common.yes")}</option>
          <option value="no">{t("common.no")}</option>
        </select>
      </CanvasField>

      <CanvasField theme={theme} label={t("serviceProducts.form.description")}>
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder={t("serviceProducts.placeholder.description")}
          style={textareaStyle(theme)}
        />
      </CanvasField>

      <CanvasField
        theme={theme}
        label={t("serviceProducts.form.defaultProofRequirements")}
      >
        <textarea
          value={draft.proofRequirementsText}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              proofRequirementsText: event.target.value,
            }))
          }
          placeholder={t("serviceProducts.placeholder.proofRequirements")}
          style={textareaStyle(theme)}
        />
      </CanvasField>
      <div style={fieldHintStyle}>
        {t("serviceProducts.form.defaultProofRequirementsHint")}
      </div>
    </div>
  );
}

export default function ServiceProductsPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const [products, setProducts] = useState<ServiceProductRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] =
    useState<ServiceProductDraft>(createEmptyDraft);
  const [editDraft, setEditDraft] =
    useState<ServiceProductDraft>(createEmptyDraft);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.serviceProductId === selectedId) ??
      null,
    [products, selectedId],
  );

  const loadProducts = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const payload = await client.get<ServiceProductsEnvelope>(
          "/api/admin/service-products",
        );
        setProducts(normalizeServiceProductsPayload(payload));
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (products.length === 0) {
      setSelectedId(null);
      setEditDraft(createEmptyDraft());
      return;
    }

    const hasSelected = products.some(
      (product) => product.serviceProductId === selectedId,
    );

    if (!hasSelected) {
      setSelectedId(products[0]?.serviceProductId ?? null);
    }
  }, [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      setEditDraft(draftFromRecord(selectedProduct));
    }
  }, [selectedProduct]);

  const columns: CanvasTableColumn<ServiceProductRecord>[] = [
    {
      h: t("serviceProducts.col.product"),
      w: 250,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedId(row.serviceProductId)}
          style={primaryCellButtonStyle(row.serviceProductId === selectedId)}
        >
          <span style={primaryCellTitleStyle}>{row.displayName}</span>
          <span style={codeTextStyle}>{row.serviceProductId}</span>
        </button>
      ),
    },
    {
      h: t("serviceProducts.col.type"),
      w: 190,
      r: (row) => t(`serviceProducts.type.${row.serviceProductType}`),
    },
    {
      h: t("serviceProducts.col.timing"),
      w: 130,
      r: (row) => t(`serviceProducts.timing.${row.timing}`),
    },
    {
      h: t("serviceProducts.col.billing"),
      w: 150,
      r: (row) => t(`serviceProducts.billing.${row.defaultBillingMode}`),
    },
    {
      h: t("serviceProducts.col.allowedLicenseTypes"),
      w: 220,
      r: (row) =>
        row.allowedLicenseTypes.length > 0 ? (
          <div style={chipRowStyle}>
            {row.allowedLicenseTypes.map((license) => (
              <CanvasPill key={license} theme={theme} tone="info">
                {t(`serviceProducts.license.${license}`)}
              </CanvasPill>
            ))}
          </div>
        ) : (
          t("serviceProducts.none")
        ),
    },
    {
      h: t("serviceProducts.col.meterRequired"),
      w: 130,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.meterRequired ? "success" : "neutral"}
          dot
        >
          {row.meterRequired ? t("common.yes") : t("common.no")}
        </CanvasPill>
      ),
    },
    {
      h: t("serviceProducts.col.proofs"),
      w: 160,
      r: (row) =>
        row.defaultProofRequirements.length > 0
          ? `${row.defaultProofRequirements.length} ${t("serviceProducts.proofRequirementCount")}`
          : t("serviceProducts.none"),
    },
    {
      h: t("common.status"),
      w: 120,
      r: (row) => (
        <CanvasPill theme={theme} tone={row.active ? "success" : "neutral"} dot>
          {row.active ? t("common.active") : t("common.inactive")}
        </CanvasPill>
      ),
    },
  ];

  async function handleCreate() {
    const command = toCommand(createDraft);
    if (!command.serviceProductId || !command.displayName) {
      setError(t("serviceProducts.validation.required"));
      return;
    }

    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await client.post<ServiceProductRecord>("/api/admin/service-products", {
        body: command,
      });
      setCreateDraft(createEmptyDraft());
      setNotice(t("serviceProducts.notice.created"));
      await loadProducts("refresh");
      setSelectedId(command.serviceProductId);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate() {
    if (!selectedProduct) {
      return;
    }

    const command = toCommand(editDraft);
    if (!command.serviceProductId || !command.displayName) {
      setError(t("serviceProducts.validation.required"));
      return;
    }

    setUpdating(true);
    setError(null);
    setNotice(null);
    try {
      await client.put<ServiceProductRecord>(
        `/api/admin/service-products/${encodeURIComponent(
          selectedProduct.serviceProductId,
        )}`,
        {
          body: command,
        },
      );
      setNotice(t("serviceProducts.notice.updated"));
      await loadProducts("refresh");
      setSelectedId(command.serviceProductId);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("serviceProducts.title")}
        subtitle={t("serviceProducts.subtitle", {
          count: products.length,
        })}
        actions={
          <CanvasBtn
            theme={theme}
            variant="secondary"
            onClick={() => void loadProducts("refresh")}
            disabled={refreshing}
          >
            {refreshing ? t("common.loading") : t("common.refresh")}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={t("serviceProducts.banner.errorTitle")}
            body={error}
          />
        ) : null}

        {notice ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            title={t("serviceProducts.banner.successTitle")}
            body={notice}
          />
        ) : null}

        <div style={workspaceGridStyle}>
          <CanvasCard
            theme={theme}
            title={t("serviceProducts.registryTitle")}
            subtitle={t("serviceProducts.registrySubtitle")}
          >
            {loading ? (
              <div style={emptyStateStyle}>{t("serviceProducts.loading")}</div>
            ) : products.length === 0 ? (
              <div style={emptyStateStyle}>{t("serviceProducts.empty")}</div>
            ) : (
              <CanvasTable columns={columns} rows={products} theme={theme} />
            )}
          </CanvasCard>

          <div style={panelStackStyle}>
            <CanvasCard
              theme={theme}
              title={t("serviceProducts.createTitle")}
              subtitle={t("serviceProducts.createSubtitle")}
            >
              <ServiceProductForm
                draft={createDraft}
                setDraft={setCreateDraft}
                disabledId={false}
                t={t}
              />
              <div style={fieldHintStyle}>{t("serviceProducts.auditHint")}</div>
              <div style={headerActionRowStyle}>
                <CanvasBtn
                  theme={theme}
                  onClick={() => void handleCreate()}
                  disabled={creating}
                >
                  {creating
                    ? t("common.creating")
                    : t("serviceProducts.createAction")}
                </CanvasBtn>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("serviceProducts.editTitle")}
              subtitle={
                selectedProduct
                  ? t("serviceProducts.editSubtitleSelected", {
                      id: selectedProduct.serviceProductId,
                    })
                  : t("serviceProducts.editSubtitleEmpty")
              }
            >
              {selectedProduct ? (
                <>
                  <div style={infoGridStyle}>
                    <div style={infoCardStyle}>
                      <div style={infoLabelStyle}>
                        {t("serviceProducts.meta.type")}
                      </div>
                      <div style={infoValueStyle}>
                        {t(
                          `serviceProducts.type.${selectedProduct.serviceProductType}`,
                        )}
                      </div>
                    </div>
                    <div style={infoCardStyle}>
                      <div style={infoLabelStyle}>
                        {t("serviceProducts.meta.timing")}
                      </div>
                      <div style={infoValueStyle}>
                        {t(`serviceProducts.timing.${selectedProduct.timing}`)}
                      </div>
                    </div>
                    <div style={infoCardStyle}>
                      <div style={infoLabelStyle}>
                        {t("serviceProducts.meta.updatedAt")}
                      </div>
                      <div style={infoValueStyle}>
                        {selectedProduct.updatedAt
                          ? formatDateTime(selectedProduct.updatedAt)
                          : t("serviceProducts.notAvailable")}
                      </div>
                    </div>
                  </div>

                  <div style={tokenWrapStyle}>
                    {selectedProduct.defaultProofRequirements.length > 0 ? (
                      selectedProduct.defaultProofRequirements.map((proof) => (
                        <CanvasPill key={proof} theme={theme} tone="accent">
                          {proof}
                        </CanvasPill>
                      ))
                    ) : (
                      <span style={secondaryTextStyle}>
                        {t("serviceProducts.noProofRequirements")}
                      </span>
                    )}
                  </div>

                  <ServiceProductForm
                    draft={editDraft}
                    setDraft={setEditDraft}
                    disabledId
                    t={t}
                  />
                  <div style={headerActionRowStyle}>
                    <CanvasBtn
                      theme={theme}
                      onClick={() => void handleUpdate()}
                      disabled={updating}
                    >
                      {updating
                        ? t("common.updating")
                        : t("serviceProducts.updateAction")}
                    </CanvasBtn>
                  </div>
                </>
              ) : (
                <div style={emptyStateStyle}>
                  {t("serviceProducts.selectProduct")}
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
