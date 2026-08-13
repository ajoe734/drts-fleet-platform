"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
  TextareaHTMLAttributes,
} from "react";
import { useMemo, useState } from "react";
import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplySubmissionStatus,
  VehicleSupplyDraft,
} from "@drts/contracts";
import {
  ActionButton,
  CanvasBanner,
  CanvasCard,
  CanvasEmptyState,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { useTranslation } from "@/lib/i18n";
import type {
  SupplyDashboardView,
  SupplyDocumentsView,
  SupplySubmissionDetail,
} from "@/lib/fleet-portal-supply";
import {
  formatSupplySubject,
  isEditableStatus,
} from "@/lib/fleet-portal-supply";

type ApiEnvelope<T> = {
  data: T;
  meta: { requestId: string; timestamp: string };
};

type DriverDraftInput = Omit<DriverSupplyDraft, "submissionId">;
type VehicleDraftInput = Omit<VehicleSupplyDraft, "submissionId">;

const DRIVER_DOC_TYPES = [
  "professional_driver_license",
  "taxi_driver_registration",
  "other",
] as const;
const VEHICLE_DOC_TYPES = [
  "vehicle_registration",
  "insurance_policy",
  "fleet_participation_contract",
  "other",
] as const;

const PRODUCT_OPTIONS = [
  { code: "taxi_realtime", key: "service.realtime" },
  { code: "business_dispatch", key: "service.business" },
  { code: "airport_transfer", key: "service.airport" },
  { code: "insurance_replacement", key: "service.insurance" },
  { code: "travel_partner", key: "service.travel" },
] as const;

const DOCUMENT_LABEL_KEYS: Record<string, string> = {
  professional_driver_license: "supply.document.professional_driver_license",
  taxi_driver_registration: "supply.document.taxi_driver_registration",
  vehicle_registration: "supply.document.vehicle_registration",
  insurance_policy: "supply.document.insurance_policy",
  fleet_participation_contract: "supply.document.fleet_participation_contract",
  driver_management_contract: "supply.document.driver_management_contract",
  vehicle_management_contract: "supply.document.vehicle_management_contract",
  other: "supply.document.other",
};

const REASON_LABEL_KEYS: Record<SupplyReadinessReasonCode, string> = {
  DRIVER_LICENSE_MISSING: "supply.reason.driver_license_missing",
  DRIVER_LICENSE_EXPIRED: "supply.reason.driver_license_expired",
  DRIVER_REGISTRATION_MISSING: "supply.reason.driver_registration_missing",
  DRIVER_REGISTRATION_EXPIRED: "supply.reason.driver_registration_expired",
  VEHICLE_DOCUMENT_MISSING: "supply.reason.vehicle_document_missing",
  INSURANCE_MISSING: "supply.reason.insurance_missing",
  INSURANCE_EXPIRED: "supply.reason.insurance_expired",
  CONTRACT_MISSING: "supply.reason.contract_missing",
  CONTRACT_INACTIVE: "supply.reason.contract_inactive",
  DRIVER_AFFILIATION_MISSING: "supply.reason.driver_affiliation_missing",
  VEHICLE_AFFILIATION_MISSING: "supply.reason.vehicle_affiliation_missing",
  SERVICE_PRODUCT_NOT_SUPPORTED: "supply.reason.service_product_not_supported",
  TRAINING_REQUIRED: "supply.reason.training_required",
  FLEET_PARTNER_INACTIVE: "supply.reason.fleet_partner_inactive",
  MANUALLY_SUSPENDED: "supply.reason.manually_suspended",
};

function sectionGrid() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  } as const;
}

function formatStatus(status: SupplySubmissionStatus) {
  return status.replace(/_/g, " ");
}

function statusTone(status: SupplySubmissionStatus) {
  switch (status) {
    case "approved":
      return "success";
    case "submitted":
    case "in_review":
      return "info";
    case "needs_revision":
      return "warn";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

function documentTone(status: SupplyDocumentRecord["reviewStatus"]) {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "info";
    case "expired":
      return "warn";
    default:
      return "danger";
  }
}

function cardLinkStyle(theme: ReturnType<typeof buildFleetTheme>) {
  return {
    color: theme.accent,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 12,
  };
}

function toCamelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function camelizeDeep<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        toCamelCase(key),
        camelizeDeep(item),
      ]),
    ) as T;
  }
  return value as T;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/control-plane-proxy/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = camelizeDeep<ApiEnvelope<T> | { error: { message: string } }>(
    await response.json(),
  );
  if (!response.ok || !("data" in payload)) {
    throw new Error(
      "error" in payload ? payload.error.message : `HTTP ${response.status}`,
    );
  }
  return payload.data;
}

function FieldInput(
  props: InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> & {
    multiline?: boolean;
  },
) {
  const theme = buildFleetTheme();
  const baseStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "9px 10px",
    background: theme.surface,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
  };
  if (props.multiline) {
    return (
      <textarea
        {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        style={{ ...baseStyle, minHeight: 92 }}
      />
    );
  }
  return (
    <input
      {...(props as InputHTMLAttributes<HTMLInputElement>)}
      style={baseStyle}
    />
  );
}

function FieldSelect(
  props: SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[];
  },
) {
  const theme = buildFleetTheme();
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: "9px 10px",
        background: theme.surface,
        color: theme.text,
        fontSize: 12.5,
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ProductChecklist({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {PRODUCT_OPTIONS.map((option) => {
        const checked = selected.includes(option.code);
        return (
          <label
            key={option.code}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${checked ? theme.accentBorder : theme.border}`,
              background: checked ? theme.accentBg : theme.surface,
              color: checked ? theme.accent : theme.text,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((item) => item !== option.code)
                    : [...selected, option.code],
                )
              }
            />
            {t(option.key)}
          </label>
        );
      })}
    </div>
  );
}

export function SupplyDashboard({ data }: { data: SupplyDashboardView }) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const groups = [
    ["draft", t("supply.dashboard.group.draft")],
    ["review", t("supply.dashboard.group.review")],
    ["revision", t("supply.dashboard.group.revision")],
    ["approved", t("supply.dashboard.group.approved")],
    ["expiring", t("supply.dashboard.group.expiring")],
    ["not_ready", t("supply.dashboard.group.not_ready")],
  ] as const;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("supply.dashboard.title")}
        subtitle={t("supply.dashboard.subtitle")}
        actions={
          <>
            <Link href="/documents" style={cardLinkStyle(theme)}>
              {t("supply.dashboard.documents")}
            </Link>
            <Link href="/supply/drivers/new" style={cardLinkStyle(theme)}>
              {t("supply.dashboard.addDriver")}
            </Link>
            <Link href="/supply/vehicles/new" style={cardLinkStyle(theme)}>
              {t("supply.dashboard.addVehicle")}
            </Link>
          </>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {data.source === "fallback" ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            body={t("supply.dashboard.fallback")}
          />
        ) : null}
        <div style={sectionGrid()}>
          {groups.map(([key, label]) => {
            const items = data.groups[key];
            return (
              <CanvasCard
                key={key}
                theme={theme}
                title={
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {label}
                    <CanvasPill theme={theme} tone="neutral">
                      {items.length}
                    </CanvasPill>
                  </span>
                }
              >
                {items.length === 0 ? (
                  <CanvasEmptyState
                    theme={theme}
                    title={t("supply.empty.none")}
                    body={t("supply.dashboard.empty")}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: `1px solid ${theme.border}`,
                          borderRadius: 10,
                          padding: 12,
                          background: theme.surfaceLo,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "space-between",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{item.title}</div>
                          {item.status ? (
                            <CanvasPill
                              theme={theme}
                              tone={statusTone(item.status)}
                              dot
                            >
                              {formatStatus(item.status)}
                            </CanvasPill>
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: theme.textMuted,
                            marginTop: 4,
                          }}
                        >
                          {item.subtitle}
                        </div>
                        {item.reasons?.length ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              marginTop: 8,
                            }}
                          >
                            {item.reasons.map((reason) => (
                              <CanvasPill
                                key={reason}
                                theme={theme}
                                tone="warn"
                              >
                                {t(REASON_LABEL_KEYS[reason])}
                              </CanvasPill>
                            ))}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 10 }}>
                          <Link href={item.href} style={cardLinkStyle(theme)}>
                            {t("supply.action.open")}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CanvasCard>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function SupplySubmissionList({
  rows,
  source,
}: {
  rows: SupplySubmissionDetail[];
  source: "live" | "fallback";
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("supply.submissions.title")}
        subtitle={t("supply.submissions.subtitle")}
        actions={
          <Link href="/supply" style={cardLinkStyle(theme)}>
            {t("supply.action.backDashboard")}
          </Link>
        }
      />
      <div style={{ padding: 24 }}>
        {source === "fallback" ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            body={t("supply.submissions.fallback")}
          />
        ) : null}
        <CanvasCard theme={theme} title={t("supply.submissions.all")}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: theme.textMuted }}>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.subject")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.type")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>{t("table.status")}</th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.revision")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.reviewerNote")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((detail) => {
                  const subject = formatSupplySubject(detail);
                  return (
                    <tr
                      key={detail.submission.submissionId}
                      style={{ borderTop: `1px solid ${theme.border}` }}
                    >
                      <td style={{ padding: "12px 0" }}>
                        <div style={{ fontWeight: 600 }}>{subject.title}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {subject.subtitle}
                        </div>
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        {detail.submission.submissionType}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        <CanvasPill
                          theme={theme}
                          tone={statusTone(detail.submission.status)}
                          dot
                        >
                          {formatStatus(detail.submission.status)}
                        </CanvasPill>
                      </td>
                      <td
                        style={{
                          padding: "12px 0",
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {t("supply.revision", {
                          value: detail.submission.revisionNo,
                        })}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        {detail.submission.reviewComment || "—"}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        <Link
                          href={`/supply/submissions/${detail.submission.submissionId}`}
                          style={cardLinkStyle(theme)}
                        >
                          {t("supply.action.detail")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CanvasCard>
      </div>
    </>
  );
}

export function SupplyDocumentsBoard({ data }: { data: SupplyDocumentsView }) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("documents.title")}
        subtitle={t("supply.documents.subtitle")}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="info"
          title={t("supply.documents.uploadFlowTitle")}
          body={t("supply.documents.uploadFlowBody")}
        />
        {data.source === "fallback" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            body={t("supply.documents.fallback")}
          />
        ) : null}
        <CanvasCard theme={theme} title={t("supply.documents.list")}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: theme.textMuted }}>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.documentType")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.fileName")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.subject")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.effectiveWindow")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("supply.table.reviewStatus")}
                  </th>
                  <th style={{ padding: "0 0 10px" }}>
                    {t("nav.supplySubmissions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.documentId}
                    style={{ borderTop: `1px solid ${theme.border}` }}
                  >
                    <td style={{ padding: "12px 0" }}>
                      {t(
                        DOCUMENT_LABEL_KEYS[row.documentType] ??
                          row.documentType,
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px 0",
                        fontFamily: theme.monoFamily,
                      }}
                    >
                      {row.originalFileName}
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <div style={{ fontWeight: 600 }}>{row.subject.title}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>
                        {row.subject.subtitle}
                      </div>
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      {row.effectiveFrom || "—"} → {row.effectiveUntil || "—"}
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <CanvasPill
                        theme={theme}
                        tone={documentTone(row.reviewStatus)}
                        dot
                      >
                        {row.reviewStatus}
                      </CanvasPill>
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <Link
                        href={`/supply/submissions/${row.submissionId}`}
                        style={cardLinkStyle(theme)}
                      >
                        {t("supply.action.openSubmission")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CanvasCard>
      </div>
    </>
  );
}

export function NewDriverSubmissionForm() {
  const router = useRouter();
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DriverDraftInput>({
    name: "",
    mobile: "",
    professionalDriverLicenseNo: "",
    professionalDriverLicenseExpiry: "",
    taxiDriverRegistrationNo: "",
    taxiDriverRegistrationArea: "",
    taxiDriverRegistrationExpiry: "",
    supportedServiceProductCodes: ["taxi_realtime"],
    preferredVehicleSubmissionId: null,
  });

  async function onCreate() {
    setSaving(true);
    setError(null);
    try {
      const created = await apiRequest<SupplySubmissionDetail>(
        "fleet-partner/supply-submissions/drivers",
        { method: "POST", body: JSON.stringify(form) },
      );
      router.push(`/supply/submissions/${created.submission.submissionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("supply.driverNew.title")}
        subtitle={t("supply.driverNew.subtitle")}
      />
      <div style={{ padding: 24 }}>
        <DraftFormFrame
          title={t("supply.driverNew.cardTitle")}
          error={error}
          saving={saving}
          onSave={onCreate}
          saveLabel={t("supply.action.createDraft")}
        >
          <DriverDraftFields form={form} setForm={setForm} />
        </DraftFormFrame>
      </div>
    </>
  );
}

export function NewVehicleSubmissionForm() {
  const router = useRouter();
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleDraftInput>({
    plateNo: "",
    licenseType: "taxi",
    brand: "",
    model: "",
    modelYear: 2024,
    seatCount: 5,
    luggageCapacity: 2,
    businessArea: "台北市",
    supportedServiceProductCodes: ["taxi_realtime"],
    airportTransferEligible: false,
    fixedFareAllowed: false,
    currentDriverSubmissionId: null,
    doorCount: 4,
    color: "",
  });

  async function onCreate() {
    setSaving(true);
    setError(null);
    try {
      const created = await apiRequest<SupplySubmissionDetail>(
        "fleet-partner/supply-submissions/vehicles",
        { method: "POST", body: JSON.stringify(form) },
      );
      router.push(`/supply/submissions/${created.submission.submissionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("supply.vehicleNew.title")}
        subtitle={t("supply.vehicleNew.subtitle")}
      />
      <div style={{ padding: 24 }}>
        <DraftFormFrame
          title={t("supply.vehicleNew.cardTitle")}
          error={error}
          saving={saving}
          onSave={onCreate}
          saveLabel={t("supply.action.createDraft")}
        >
          <VehicleDraftFields form={form} setForm={setForm} />
        </DraftFormFrame>
      </div>
    </>
  );
}

function DraftFormFrame({
  title,
  error,
  saving,
  onSave,
  saveLabel,
  children,
}: {
  title: string;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  saveLabel: string;
  children: ReactNode;
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) 320px",
        gap: 16,
      }}
    >
      <CanvasCard theme={theme} title={title}>
        {children}
      </CanvasCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CanvasCard theme={theme} title={t("supply.draft.tipTitle")}>
          <div
            style={{ fontSize: 12, lineHeight: 1.5, color: theme.textMuted }}
          >
            {t("supply.draft.tipBody")}
          </div>
        </CanvasCard>
        {error ? (
          <CanvasBanner theme={theme} tone="danger" icon="warn" body={error} />
        ) : null}
        <ActionButton
          theme={theme}
          label={saveLabel}
          helper={t("supply.draft.saveHelper")}
          variant="primary"
          busy={saving}
          onClick={onSave}
        />
      </div>
    </div>
  );
}

function DriverDraftFields({
  form,
  setForm,
}: {
  form: DriverDraftInput;
  setForm: Dispatch<SetStateAction<DriverDraftInput>>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div style={sectionGrid()}>
        <CanvasField label={t("supply.driverField.name")} required>
          <FieldInput
            value={form.name}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                name: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.driverField.mobile")} required>
          <FieldInput
            value={form.mobile}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                mobile: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.driverField.licenseNo")} required>
          <FieldInput
            value={form.professionalDriverLicenseNo}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                professionalDriverLicenseNo: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.driverField.licenseExpiry")} required>
          <FieldInput
            type="date"
            value={form.professionalDriverLicenseExpiry}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                professionalDriverLicenseExpiry: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.driverField.registrationNo")} required>
          <FieldInput
            value={form.taxiDriverRegistrationNo}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                taxiDriverRegistrationNo: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.driverField.registrationArea")} required>
          <FieldInput
            value={form.taxiDriverRegistrationArea}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                taxiDriverRegistrationArea: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField
          label={t("supply.driverField.registrationExpiry")}
          required
        >
          <FieldInput
            type="date"
            value={form.taxiDriverRegistrationExpiry}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                taxiDriverRegistrationExpiry: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField
          label={t("supply.driverField.preferredVehicleSubmissionId")}
        >
          <FieldInput
            value={form.preferredVehicleSubmissionId ?? ""}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                preferredVehicleSubmissionId: e.currentTarget.value || null,
              }))
            }
          />
        </CanvasField>
      </div>
      <CanvasField label={t("supply.field.supportedProducts")} required>
        <ProductChecklist
          selected={form.supportedServiceProductCodes}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              supportedServiceProductCodes: value,
            }))
          }
        />
      </CanvasField>
    </>
  );
}

function VehicleDraftFields({
  form,
  setForm,
}: {
  form: VehicleDraftInput;
  setForm: Dispatch<SetStateAction<VehicleDraftInput>>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div style={sectionGrid()}>
        <CanvasField label={t("supply.vehicleField.plateNo")} required>
          <FieldInput
            value={form.plateNo}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                plateNo: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.licenseType")} required>
          <FieldSelect
            value={form.licenseType}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                licenseType: e.currentTarget.value,
              }))
            }
            options={[
              {
                value: "taxi",
                label: t("supply.vehicleField.licenseTypeTaxi"),
              },
              {
                value: "rental",
                label: t("supply.vehicleField.licenseTypeRental"),
              },
            ]}
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.brand")}>
          <FieldInput
            value={form.brand ?? ""}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                brand: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.model")}>
          <FieldInput
            value={form.model ?? ""}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                model: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.modelYear")}>
          <FieldInput
            type="number"
            value={String(form.modelYear ?? "")}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                modelYear: e.currentTarget.value
                  ? Number(e.currentTarget.value)
                  : null,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.seatCount")} required>
          <FieldInput
            type="number"
            value={String(form.seatCount)}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                seatCount: Number(e.currentTarget.value),
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.luggageCapacity")} required>
          <FieldInput
            type="number"
            value={String(form.luggageCapacity)}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                luggageCapacity: Number(e.currentTarget.value),
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.businessArea")} required>
          <FieldInput
            value={form.businessArea}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                businessArea: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.currentDriverSubmissionId")}>
          <FieldInput
            value={form.currentDriverSubmissionId ?? ""}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                currentDriverSubmissionId: e.currentTarget.value || null,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.doorCount")}>
          <FieldInput
            type="number"
            value={String(form.doorCount ?? "")}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                doorCount: e.currentTarget.value
                  ? Number(e.currentTarget.value)
                  : null,
              }))
            }
          />
        </CanvasField>
        <CanvasField label={t("supply.vehicleField.color")}>
          <FieldInput
            value={form.color ?? ""}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                color: e.currentTarget.value,
              }))
            }
          />
        </CanvasField>
      </div>
      <CanvasField label={t("supply.field.supportedProducts")} required>
        <ProductChecklist
          selected={form.supportedServiceProductCodes}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              supportedServiceProductCodes: value,
            }))
          }
        />
      </CanvasField>
      <div style={{ display: "flex", gap: 24 }}>
        <label>
          <input
            type="checkbox"
            checked={form.airportTransferEligible}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                airportTransferEligible: e.currentTarget.checked,
              }))
            }
          />{" "}
          {t("supply.vehicleField.airportTransferEligible")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.fixedFareAllowed}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                fixedFareAllowed: e.currentTarget.checked,
              }))
            }
          />{" "}
          {t("supply.vehicleField.fixedFareAllowed")}
        </label>
      </div>
    </>
  );
}

export function SupplySubmissionDetailView({
  initialDetail,
  source,
}: {
  initialDetail: SupplySubmissionDetail;
  source: "live" | "fallback";
}) {
  const router = useRouter();
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverDraftInput | null>(
    initialDetail.driverDraft
      ? {
          ...initialDetail.driverDraft,
          preferredVehicleSubmissionId:
            initialDetail.driverDraft.preferredVehicleSubmissionId ?? null,
        }
      : null,
  );
  const [vehicleForm, setVehicleForm] = useState<VehicleDraftInput | null>(
    initialDetail.vehicleDraft
      ? {
          ...initialDetail.vehicleDraft,
          currentDriverSubmissionId:
            initialDetail.vehicleDraft.currentDriverSubmissionId ?? null,
        }
      : null,
  );
  const [docType, setDocType] = useState<string>(
    initialDetail.driverDraft ? DRIVER_DOC_TYPES[0] : VEHICLE_DOC_TYPES[0],
  );
  const [docFrom, setDocFrom] = useState("");
  const [docUntil, setDocUntil] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  const editable = isEditableStatus(detail.submission.status);
  const documentOptions = detail.driverDraft
    ? DRIVER_DOC_TYPES
    : VEHICLE_DOC_TYPES;
  const subject = useMemo(() => formatSupplySubject(detail), [detail]);
  const setDriverDraftSafe: Dispatch<SetStateAction<DriverDraftInput>> = (
    next,
  ) => {
    setDriverForm((current) => {
      if (!current) {
        return current;
      }
      return typeof next === "function"
        ? (next as (value: DriverDraftInput) => DriverDraftInput)(current)
        : next;
    });
  };
  const setVehicleDraftSafe: Dispatch<SetStateAction<VehicleDraftInput>> = (
    next,
  ) => {
    setVehicleForm((current) => {
      if (!current) {
        return current;
      }
      return typeof next === "function"
        ? (next as (value: VehicleDraftInput) => VehicleDraftInput)(current)
        : next;
    });
  };

  async function refreshDetail() {
    const next = await apiRequest<SupplySubmissionDetail>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}`,
    );
    setDetail(next);
    setDriverForm(next.driverDraft ? { ...next.driverDraft } : null);
    setVehicleForm(next.vehicleDraft ? { ...next.vehicleDraft } : null);
    router.refresh();
  }

  async function runAction(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (driverForm) {
      await apiRequest<SupplySubmissionDetail>(
        `fleet-partner/supply-submissions/${detail.submission.submissionId}/driver`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...driverForm,
            expectedRevisionNo: detail.submission.revisionNo,
          }),
        },
      );
    } else if (vehicleForm) {
      await apiRequest<SupplySubmissionDetail>(
        `fleet-partner/supply-submissions/${detail.submission.submissionId}/vehicle`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...vehicleForm,
            expectedRevisionNo: detail.submission.revisionNo,
          }),
        },
      );
    }
    await refreshDetail();
  }

  async function submitSubmission() {
    await apiRequest<SupplySubmissionDetail>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevisionNo: detail.submission.revisionNo,
        }),
      },
    );
    await refreshDetail();
  }

  async function withdrawSubmission() {
    await apiRequest<SupplySubmissionDetail>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}/withdraw`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevisionNo: detail.submission.revisionNo,
        }),
      },
    );
    await refreshDetail();
  }

  async function uploadDocument() {
    if (!docFile) {
      throw new Error(t("supply.error.selectFile"));
    }
    const uploadIntent = await apiRequest<{
      submissionId: string;
      objectKey: string;
      uploadUrl: string;
      method: string;
      headers: Record<string, string>;
    }>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}/documents/upload-url`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevisionNo: detail.submission.revisionNo,
          documentType: docType,
          originalFileName: docFile.name,
          contentType: docFile.type || "application/octet-stream",
        }),
      },
    );
    const checksumSha256 = await hashFile(docFile);
    await apiRequest<SupplyDocumentRecord>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}/documents/confirm`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevisionNo: detail.submission.revisionNo,
          documentType: docType,
          objectKey: uploadIntent.objectKey,
          originalFileName: docFile.name,
          contentType: docFile.type || "application/octet-stream",
          fileSize: docFile.size || 1,
          checksumSha256,
          effectiveFrom: docFrom || null,
          effectiveUntil: docUntil || null,
        }),
      },
    );
    setDocFile(null);
    setDocFrom("");
    setDocUntil("");
    await refreshDetail();
  }

  async function deleteDocument(documentId: string) {
    await apiRequest<{ deleted: true }>(
      `fleet-partner/supply-submissions/${detail.submission.submissionId}/documents/${documentId}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevisionNo: detail.submission.revisionNo,
        }),
      },
    );
    await refreshDetail();
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={`${subject.title} · ${t("supply.detail.titleSuffix")}`}
        subtitle={`${detail.submission.submissionType} · ${detail.submission.submissionId}`}
        actions={
          <>
            <CanvasPill
              theme={theme}
              tone={statusTone(detail.submission.status)}
              dot
            >
              {formatStatus(detail.submission.status)}
            </CanvasPill>
            <Link href="/supply/submissions" style={cardLinkStyle(theme)}>
              {t("supply.action.backSubmissions")}
            </Link>
          </>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {source === "fallback" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            body={t("supply.detail.fallback")}
          />
        ) : null}
        {error ? (
          <CanvasBanner theme={theme} tone="danger" icon="warn" body={error} />
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) 340px",
            gap: 16,
          }}
        >
          <CanvasCard theme={theme} title={t("supply.detail.draftFields")}>
            {driverForm ? (
              <DriverDraftFields
                form={driverForm}
                setForm={setDriverDraftSafe}
              />
            ) : vehicleForm ? (
              <VehicleDraftFields
                form={vehicleForm}
                setForm={setVehicleDraftSafe}
              />
            ) : (
              <CanvasEmptyState
                theme={theme}
                title={t("supply.detail.noDraftTitle")}
                body={t("supply.detail.noDraftBody")}
              />
            )}
          </CanvasCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title={t("supply.detail.stateTitle")}>
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  rowGap: 8,
                  fontSize: 12.5,
                  margin: 0,
                }}
              >
                <dt style={{ color: theme.textMuted }}>
                  {t("supply.table.revision")}
                </dt>
                <dd style={{ margin: 0, fontFamily: theme.monoFamily }}>
                  {detail.submission.revisionNo}
                </dd>
                <dt style={{ color: theme.textMuted }}>
                  {t("supply.detail.submittedAt")}
                </dt>
                <dd style={{ margin: 0 }}>
                  {detail.submission.submittedAt || "—"}
                </dd>
                <dt style={{ color: theme.textMuted }}>
                  {t("supply.table.reviewerNote")}
                </dt>
                <dd style={{ margin: 0 }}>
                  {detail.submission.reviewComment || "—"}
                </dd>
                <dt style={{ color: theme.textMuted }}>
                  {t("supply.detail.canonicalIds")}
                </dt>
                <dd style={{ margin: 0 }}>
                  {[
                    detail.submission.canonicalDriverId,
                    detail.submission.canonicalVehicleId,
                    detail.submission.canonicalContractId,
                    detail.submission.canonicalPolicyId,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("supply.detail.preApproval")}
                </dd>
              </dl>
            </CanvasCard>
            <ActionButton
              theme={theme}
              label={t("supply.action.saveDraft")}
              helper={t("supply.detail.saveHelper")}
              variant="secondary"
              busy={busy === "save"}
              disabled={!editable}
              onClick={() => runAction("save", saveDraft)}
            />
            <ActionButton
              theme={theme}
              label={
                detail.submission.status === "needs_revision" ||
                detail.submission.status === "withdrawn"
                  ? t("supply.action.resubmit")
                  : t("supply.action.submit")
              }
              helper={t("supply.detail.submitHelper")}
              variant="primary"
              busy={busy === "submit"}
              disabled={!editable}
              onClick={() => runAction("submit", submitSubmission)}
              data-drt-operation={
                detail.submission.status === "needs_revision" ||
                detail.submission.status === "withdrawn"
                  ? "fleet-resubmit"
                  : "fleet-submit"
              }
            />
            <ActionButton
              theme={theme}
              label={t("supply.action.withdraw")}
              helper={t("supply.detail.withdrawHelper")}
              variant="secondary"
              busy={busy === "withdraw"}
              disabled={detail.submission.status !== "submitted"}
              onClick={() => runAction("withdraw", withdrawSubmission)}
              data-drt-operation="fleet-withdraw"
            />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) 340px",
            gap: 16,
          }}
        >
          <CanvasCard theme={theme} title={t("supply.detail.attachments")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {detail.documents.map((document) => (
                <div
                  key={document.documentId}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: 12,
                    background: theme.surfaceLo,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {t(
                          DOCUMENT_LABEL_KEYS[document.documentType] ??
                            document.documentType,
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {document.originalFileName}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>
                        {document.effectiveFrom || "—"} →{" "}
                        {document.effectiveUntil || "—"}
                      </div>
                    </div>
                    <CanvasPill
                      theme={theme}
                      tone={documentTone(document.reviewStatus)}
                      dot
                    >
                      {document.reviewStatus}
                    </CanvasPill>
                  </div>
                  {editable ? (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(`delete-${document.documentId}`, () =>
                            deleteDocument(document.documentId),
                          )
                        }
                        style={{
                          border: "none",
                          background: "transparent",
                          color: theme.danger,
                          padding: 0,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {t("supply.action.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {detail.documents.length === 0 ? (
                <CanvasEmptyState
                  theme={theme}
                  title={t("supply.detail.noDocumentsTitle")}
                  body={t("supply.detail.noDocumentsBody")}
                />
              ) : null}
            </div>
          </CanvasCard>
          <CanvasCard theme={theme} title={t("supply.detail.uploadTitle")}>
            <CanvasField label={t("supply.table.documentType")} required>
              <FieldSelect
                value={docType}
                onChange={(e) => setDocType(e.currentTarget.value)}
                options={documentOptions.map((value) => ({
                  value,
                  label: t(DOCUMENT_LABEL_KEYS[value] ?? value),
                }))}
              />
            </CanvasField>
            <CanvasField label={t("supply.table.fileName")} required>
              <input
                type="file"
                onChange={(e) => setDocFile(e.currentTarget.files?.[0] ?? null)}
              />
            </CanvasField>
            <CanvasField label={t("supply.detail.effectiveFrom")}>
              <FieldInput
                type="date"
                value={docFrom}
                onChange={(e) => setDocFrom(e.currentTarget.value)}
              />
            </CanvasField>
            <CanvasField label={t("supply.detail.effectiveUntil")}>
              <FieldInput
                type="date"
                value={docUntil}
                onChange={(e) => setDocUntil(e.currentTarget.value)}
              />
            </CanvasField>
            <ActionButton
              theme={theme}
              label={t("supply.action.uploadConfirm")}
              helper={t("supply.detail.uploadHelper")}
              variant="primary"
              busy={busy === "upload"}
              disabled={!editable}
              onClick={() => runAction("upload", uploadDocument)}
            />
          </CanvasCard>
        </div>
        <CanvasCard theme={theme} title={t("supply.detail.revisionHistory")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {detail.reviewEvents.map((event) => (
              <div
                key={event.eventId}
                style={{
                  borderLeft: `2px solid ${theme.border}`,
                  paddingLeft: 12,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <CanvasPill theme={theme} tone="neutral">
                    {event.eventType}
                  </CanvasPill>
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {event.createdAt}
                  </span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {event.reasonCode ? `${event.reasonCode} · ` : ""}
                  {event.comment || "—"}
                </div>
              </div>
            ))}
          </div>
        </CanvasCard>
      </div>
    </>
  );
}

async function hashFile(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
