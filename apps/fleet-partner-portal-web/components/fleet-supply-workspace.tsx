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
  SupplySubmissionType,
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
import type {
  SupplyDashboardView,
  SupplyDocumentsView,
  SupplySubmissionDetail,
} from "@/lib/fleet-portal-supply.server";
import {
  formatSupplySubject,
  isEditableStatus,
  readinessTone,
} from "@/lib/fleet-portal-supply.server";

type ApiEnvelope<T> = { data: T; meta: { requestId: string; timestamp: string } };

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
  { code: "taxi_realtime", label: "即時叫車" },
  { code: "business_dispatch", label: "商務" },
  { code: "airport_transfer", label: "機場接送" },
  { code: "insurance_replacement", label: "保險代步" },
  { code: "travel_partner", label: "旅行社" },
] as const;

const DOCUMENT_LABELS: Record<string, string> = {
  professional_driver_license: "職業駕駛執照",
  taxi_driver_registration: "計程車登記證",
  vehicle_registration: "行照",
  insurance_policy: "保險保單",
  fleet_participation_contract: "車隊參與契約",
  driver_management_contract: "司機管理契約",
  vehicle_management_contract: "車輛管理契約",
  other: "其他",
};

const REASON_LABELS: Record<SupplyReadinessReasonCode, string> = {
  DRIVER_LICENSE_MISSING: "缺職業駕照",
  DRIVER_LICENSE_EXPIRED: "職業駕照過期",
  DRIVER_REGISTRATION_MISSING: "缺計程車登記證",
  DRIVER_REGISTRATION_EXPIRED: "登記證過期",
  VEHICLE_DOCUMENT_MISSING: "缺車輛文件",
  INSURANCE_MISSING: "缺保險",
  INSURANCE_EXPIRED: "保險過期",
  CONTRACT_MISSING: "缺契約",
  CONTRACT_INACTIVE: "契約未生效",
  DRIVER_AFFILIATION_MISSING: "司機未掛靠",
  VEHICLE_AFFILIATION_MISSING: "車輛未掛靠",
  SERVICE_PRODUCT_NOT_SUPPORTED: "服務產品不支援",
  TRAINING_REQUIRED: "需完成訓練",
  FLEET_PARTNER_INACTIVE: "車行未啟用",
  MANUALLY_SUSPENDED: "人工停權",
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

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    return <textarea {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)} style={{ ...baseStyle, minHeight: 92 }} />;
  }
  return <input {...(props as InputHTMLAttributes<HTMLInputElement>)} style={baseStyle} />;
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
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export function SupplyDashboard({ data }: { data: SupplyDashboardView }) {
  const theme = buildFleetTheme();
  const groups = [
    ["draft", "草稿"],
    ["review", "待審"],
    ["revision", "附件補正"],
    ["approved", "已核可"],
    ["expiring", "即將到期"],
    ["not_ready", "不可派原因"],
  ] as const;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="供給送件總覽"
        subtitle="自主建檔 → 送審 → 核可寫入 canonical registry"
        actions={
          <>
            <Link href="/documents" style={cardLinkStyle(theme)}>
              文件總覽
            </Link>
            <Link href="/supply/drivers/new" style={cardLinkStyle(theme)}>
              新增司機
            </Link>
            <Link href="/supply/vehicles/new" style={cardLinkStyle(theme)}>
              新增車輛
            </Link>
          </>
        }
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {data.source === "fallback" ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            body="目前顯示設計 fallback 資料；fleet-partner supply API 可用時會切換成 live data。"
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
                    title="目前沒有項目"
                    body="此群組目前沒有待處理送件。"
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                          <div style={{ fontWeight: 600 }}>{item.title}</div>
                          {item.status ? (
                            <CanvasPill theme={theme} tone={statusTone(item.status)} dot>
                              {formatStatus(item.status)}
                            </CanvasPill>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>
                          {item.subtitle}
                        </div>
                        {item.reasons?.length ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {item.reasons.map((reason) => (
                              <CanvasPill key={reason} theme={theme} tone="warn">
                                {REASON_LABELS[reason]}
                              </CanvasPill>
                            ))}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 10 }}>
                          <Link href={item.href} style={cardLinkStyle(theme)}>
                            開啟
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
  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="送件清單"
        subtitle="status / submissionType / revisionNo / reviewer note"
        actions={
          <Link href="/supply" style={cardLinkStyle(theme)}>
            回供給總覽
          </Link>
        }
      />
      <div style={{ padding: 24 }}>
        {source === "fallback" ? (
          <CanvasBanner theme={theme} tone="info" icon="info" body="目前顯示 fallback 送件資料。" />
        ) : null}
        <CanvasCard theme={theme} title="所有 submissions">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: theme.textMuted }}>
                  <th style={{ padding: "0 0 10px" }}>Subject</th>
                  <th style={{ padding: "0 0 10px" }}>Type</th>
                  <th style={{ padding: "0 0 10px" }}>Status</th>
                  <th style={{ padding: "0 0 10px" }}>Revision</th>
                  <th style={{ padding: "0 0 10px" }}>Reviewer note</th>
                  <th style={{ padding: "0 0 10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((detail) => {
                  const subject = formatSupplySubject(detail);
                  return (
                    <tr key={detail.submission.submissionId} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <td style={{ padding: "12px 0" }}>
                        <div style={{ fontWeight: 600 }}>{subject.title}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {subject.subtitle}
                        </div>
                      </td>
                      <td style={{ padding: "12px 0" }}>{detail.submission.submissionType}</td>
                      <td style={{ padding: "12px 0" }}>
                        <CanvasPill theme={theme} tone={statusTone(detail.submission.status)} dot>
                          {formatStatus(detail.submission.status)}
                        </CanvasPill>
                      </td>
                      <td style={{ padding: "12px 0", fontFamily: theme.monoFamily }}>
                        rev {detail.submission.revisionNo}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        {detail.submission.reviewComment || "—"}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        <Link
                          href={`/supply/submissions/${detail.submission.submissionId}`}
                          style={cardLinkStyle(theme)}
                        >
                          詳情
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
  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="文件"
        subtitle="pre-signed upload · 到期追蹤 · submission 入口"
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="info"
          title="pre-signed 上傳流程"
          body="前端先取得 upload URL，再以 objectKey + checksum 確認文件；實際補件入口在各 submission detail。"
        />
        {data.source === "fallback" ? (
          <CanvasBanner theme={theme} tone="warn" icon="warn" body="目前顯示 fallback 文件資料。" />
        ) : null}
        <CanvasCard theme={theme} title="文件清單">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: theme.textMuted }}>
                  <th style={{ padding: "0 0 10px" }}>文件類型</th>
                  <th style={{ padding: "0 0 10px" }}>檔名</th>
                  <th style={{ padding: "0 0 10px" }}>主體</th>
                  <th style={{ padding: "0 0 10px" }}>效期</th>
                  <th style={{ padding: "0 0 10px" }}>審核狀態</th>
                  <th style={{ padding: "0 0 10px" }}>送件</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.documentId} style={{ borderTop: `1px solid ${theme.border}` }}>
                    <td style={{ padding: "12px 0" }}>{DOCUMENT_LABELS[row.documentType]}</td>
                    <td style={{ padding: "12px 0", fontFamily: theme.monoFamily }}>
                      {row.originalFileName}
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <div style={{ fontWeight: 600 }}>{row.subject.title}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{row.subject.subtitle}</div>
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      {row.effectiveFrom || "—"} → {row.effectiveUntil || "—"}
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <CanvasPill theme={theme} tone={documentTone(row.reviewStatus)} dot>
                        {row.reviewStatus}
                      </CanvasPill>
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <Link href={`/supply/submissions/${row.submissionId}`} style={cardLinkStyle(theme)}>
                        開啟送件
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
      <CanvasPageHeader theme={theme} title="新增司機" subtitle="Driver draft · create → upload docs → submit" />
      <div style={{ padding: 24 }}>
        <DraftFormFrame
          title="DriverSupplyDraft"
          error={error}
          saving={saving}
          onSave={onCreate}
          saveLabel="建立草稿"
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
      <CanvasPageHeader theme={theme} title="新增車輛" subtitle="Vehicle draft · create → upload docs → submit" />
      <div style={{ padding: 24 }}>
        <DraftFormFrame
          title="VehicleSupplyDraft"
          error={error}
          saving={saving}
          onSave={onCreate}
          saveLabel="建立草稿"
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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 320px", gap: 16 }}>
      <CanvasCard theme={theme} title={title}>
        {children}
      </CanvasCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CanvasCard theme={theme} title="送件提示">
          <div style={{ fontSize: 12, lineHeight: 1.5, color: theme.textMuted }}>
            建立草稿後，請到 detail 頁補上文件，再以 revision-aware submit 送審。
          </div>
        </CanvasCard>
        {error ? (
          <CanvasBanner theme={theme} tone="danger" icon="warn" body={error} />
        ) : null}
        <ActionButton
          theme={theme}
          label={saveLabel}
          helper="建立後會帶你到 submission detail。"
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
  return (
    <>
      <div style={sectionGrid()}>
        <CanvasField label="姓名" required>
          <FieldInput value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="手機" required>
          <FieldInput value={form.mobile} onChange={(e) => setForm((current) => ({ ...current, mobile: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="職業駕照號" required>
          <FieldInput value={form.professionalDriverLicenseNo} onChange={(e) => setForm((current) => ({ ...current, professionalDriverLicenseNo: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="駕照到期" required>
          <FieldInput type="date" value={form.professionalDriverLicenseExpiry} onChange={(e) => setForm((current) => ({ ...current, professionalDriverLicenseExpiry: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="計程車登記證號" required>
          <FieldInput value={form.taxiDriverRegistrationNo} onChange={(e) => setForm((current) => ({ ...current, taxiDriverRegistrationNo: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="登記區域" required>
          <FieldInput value={form.taxiDriverRegistrationArea} onChange={(e) => setForm((current) => ({ ...current, taxiDriverRegistrationArea: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="登記證到期" required>
          <FieldInput type="date" value={form.taxiDriverRegistrationExpiry} onChange={(e) => setForm((current) => ({ ...current, taxiDriverRegistrationExpiry: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="偏好車輛 submissionId">
          <FieldInput value={form.preferredVehicleSubmissionId ?? ""} onChange={(e) => setForm((current) => ({ ...current, preferredVehicleSubmissionId: e.currentTarget.value || null }))} />
        </CanvasField>
      </div>
      <CanvasField label="支援服務產品" required>
        <ProductChecklist
          selected={form.supportedServiceProductCodes}
          onChange={(value) => setForm((current) => ({ ...current, supportedServiceProductCodes: value }))}
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
  return (
    <>
      <div style={sectionGrid()}>
        <CanvasField label="車牌" required>
          <FieldInput value={form.plateNo} onChange={(e) => setForm((current) => ({ ...current, plateNo: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="牌照類型" required>
          <FieldSelect
            value={form.licenseType}
            onChange={(e) => setForm((current) => ({ ...current, licenseType: e.currentTarget.value }))}
            options={[
              { value: "taxi", label: "計程車牌照" },
              { value: "rental", label: "租賃車牌照" },
            ]}
          />
        </CanvasField>
        <CanvasField label="廠牌">
          <FieldInput value={form.brand ?? ""} onChange={(e) => setForm((current) => ({ ...current, brand: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="車型">
          <FieldInput value={form.model ?? ""} onChange={(e) => setForm((current) => ({ ...current, model: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="年份">
          <FieldInput type="number" value={String(form.modelYear ?? "")} onChange={(e) => setForm((current) => ({ ...current, modelYear: e.currentTarget.value ? Number(e.currentTarget.value) : null }))} />
        </CanvasField>
        <CanvasField label="座位數" required>
          <FieldInput type="number" value={String(form.seatCount)} onChange={(e) => setForm((current) => ({ ...current, seatCount: Number(e.currentTarget.value) }))} />
        </CanvasField>
        <CanvasField label="行李容量" required>
          <FieldInput type="number" value={String(form.luggageCapacity)} onChange={(e) => setForm((current) => ({ ...current, luggageCapacity: Number(e.currentTarget.value) }))} />
        </CanvasField>
        <CanvasField label="營業區" required>
          <FieldInput value={form.businessArea} onChange={(e) => setForm((current) => ({ ...current, businessArea: e.currentTarget.value }))} />
        </CanvasField>
        <CanvasField label="目前司機 submissionId">
          <FieldInput value={form.currentDriverSubmissionId ?? ""} onChange={(e) => setForm((current) => ({ ...current, currentDriverSubmissionId: e.currentTarget.value || null }))} />
        </CanvasField>
        <CanvasField label="車門數">
          <FieldInput type="number" value={String(form.doorCount ?? "")} onChange={(e) => setForm((current) => ({ ...current, doorCount: e.currentTarget.value ? Number(e.currentTarget.value) : null }))} />
        </CanvasField>
        <CanvasField label="顏色">
          <FieldInput value={form.color ?? ""} onChange={(e) => setForm((current) => ({ ...current, color: e.currentTarget.value }))} />
        </CanvasField>
      </div>
      <CanvasField label="支援服務產品" required>
        <ProductChecklist
          selected={form.supportedServiceProductCodes}
          onChange={(value) => setForm((current) => ({ ...current, supportedServiceProductCodes: value }))}
        />
      </CanvasField>
      <div style={{ display: "flex", gap: 24 }}>
        <label>
          <input type="checkbox" checked={form.airportTransferEligible} onChange={(e) => setForm((current) => ({ ...current, airportTransferEligible: e.currentTarget.checked }))} /> 機場接送資格
        </label>
        <label>
          <input type="checkbox" checked={form.fixedFareAllowed} onChange={(e) => setForm((current) => ({ ...current, fixedFareAllowed: e.currentTarget.checked }))} /> 固定價可行
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
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverDraftInput | null>(
    initialDetail.driverDraft
      ? { ...initialDetail.driverDraft, preferredVehicleSubmissionId: initialDetail.driverDraft.preferredVehicleSubmissionId ?? null }
      : null,
  );
  const [vehicleForm, setVehicleForm] = useState<VehicleDraftInput | null>(
    initialDetail.vehicleDraft
      ? { ...initialDetail.vehicleDraft, currentDriverSubmissionId: initialDetail.vehicleDraft.currentDriverSubmissionId ?? null }
      : null,
  );
  const [docType, setDocType] = useState<string>(
    initialDetail.driverDraft ? DRIVER_DOC_TYPES[0] : VEHICLE_DOC_TYPES[0],
  );
  const [docFrom, setDocFrom] = useState("");
  const [docUntil, setDocUntil] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  const editable = isEditableStatus(detail.submission.status);
  const documentOptions = detail.driverDraft ? DRIVER_DOC_TYPES : VEHICLE_DOC_TYPES;
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
      throw new Error("請先選擇檔案。");
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
        title={`${subject.title} · Submission detail`}
        subtitle={`${detail.submission.submissionType} · ${detail.submission.submissionId}`}
        actions={
          <>
            <CanvasPill theme={theme} tone={statusTone(detail.submission.status)} dot>
              {formatStatus(detail.submission.status)}
            </CanvasPill>
            <Link href="/supply/submissions" style={cardLinkStyle(theme)}>
              回送件清單
            </Link>
          </>
        }
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {source === "fallback" ? (
          <CanvasBanner theme={theme} tone="warn" icon="warn" body="目前顯示 fallback submission detail。" />
        ) : null}
        {error ? <CanvasBanner theme={theme} tone="danger" icon="warn" body={error} /> : null}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 340px", gap: 16 }}>
          <CanvasCard theme={theme} title="Draft fields">
            {driverForm ? (
              <DriverDraftFields form={driverForm} setForm={setDriverDraftSafe} />
            ) : vehicleForm ? (
              <VehicleDraftFields form={vehicleForm} setForm={setVehicleDraftSafe} />
            ) : (
              <CanvasEmptyState theme={theme} title="No draft body" body="This submission has no draft payload." />
            )}
          </CanvasCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title="Submission state">
              <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 8, fontSize: 12.5, margin: 0 }}>
                <dt style={{ color: theme.textMuted }}>Revision</dt>
                <dd style={{ margin: 0, fontFamily: theme.monoFamily }}>{detail.submission.revisionNo}</dd>
                <dt style={{ color: theme.textMuted }}>Submitted</dt>
                <dd style={{ margin: 0 }}>{detail.submission.submittedAt || "—"}</dd>
                <dt style={{ color: theme.textMuted }}>Review note</dt>
                <dd style={{ margin: 0 }}>{detail.submission.reviewComment || "—"}</dd>
                <dt style={{ color: theme.textMuted }}>Canonical IDs</dt>
                <dd style={{ margin: 0 }}>
                  {[detail.submission.canonicalDriverId, detail.submission.canonicalVehicleId, detail.submission.canonicalContractId, detail.submission.canonicalPolicyId]
                    .filter(Boolean)
                    .join(" · ") || "Pre-approval: not yet canonical"}
                </dd>
              </dl>
            </CanvasCard>
            <ActionButton
              theme={theme}
              label="儲存草稿"
              helper="僅限 draft / needs_revision。每次更新都會走 expectedRevisionNo。"
              variant="secondary"
              busy={busy === "save"}
              disabled={!editable}
              onClick={() => runAction("save", saveDraft)}
            />
            <ActionButton
              theme={theme}
              label={detail.submission.status === "needs_revision" ? "重新送審" : "送審"}
              helper="draft 或補正完成後送審。"
              variant="primary"
              busy={busy === "submit"}
              disabled={!editable}
              onClick={() => runAction("submit", submitSubmission)}
            />
            <ActionButton
              theme={theme}
              label="撤回送件"
              helper="只有 submitted 可撤回，會轉成 withdrawn。"
              variant="secondary"
              busy={busy === "withdraw"}
              disabled={detail.submission.status !== "submitted"}
              onClick={() => runAction("withdraw", withdrawSubmission)}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 340px", gap: 16 }}>
          <CanvasCard theme={theme} title="文件附件">
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{DOCUMENT_LABELS[document.documentType]}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontFamily: theme.monoFamily }}>
                        {document.originalFileName}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>
                        {document.effectiveFrom || "—"} → {document.effectiveUntil || "—"}
                      </div>
                    </div>
                    <CanvasPill theme={theme} tone={documentTone(document.reviewStatus)} dot>
                      {document.reviewStatus}
                    </CanvasPill>
                  </div>
                  {editable ? (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => runAction(`delete-${document.documentId}`, () => deleteDocument(document.documentId))}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: theme.danger,
                          padding: 0,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {detail.documents.length === 0 ? (
                <CanvasEmptyState theme={theme} title="尚無文件" body="送審前需補齊對應文件。" />
              ) : null}
            </div>
          </CanvasCard>
          <CanvasCard theme={theme} title="上傳文件">
            <CanvasField label="文件類型" required>
              <FieldSelect
                value={docType}
                onChange={(e) => setDocType(e.currentTarget.value)}
                options={documentOptions.map((value) => ({
                  value,
                  label: DOCUMENT_LABELS[value] ?? value,
                }))}
              />
            </CanvasField>
            <CanvasField label="檔案" required>
              <input type="file" onChange={(e) => setDocFile(e.currentTarget.files?.[0] ?? null)} />
            </CanvasField>
            <CanvasField label="生效起">
              <FieldInput type="date" value={docFrom} onChange={(e) => setDocFrom(e.currentTarget.value)} />
            </CanvasField>
            <CanvasField label="到期">
              <FieldInput type="date" value={docUntil} onChange={(e) => setDocUntil(e.currentTarget.value)} />
            </CanvasField>
            <ActionButton
              theme={theme}
              label="建立 upload intent 並確認"
              helper="前端會算 checksum 後呼叫 confirm。"
              variant="primary"
              busy={busy === "upload"}
              disabled={!editable}
              onClick={() => runAction("upload", uploadDocument)}
            />
          </CanvasCard>
        </div>
        <CanvasCard theme={theme} title="Revision history">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {detail.reviewEvents.map((event) => (
              <div key={event.eventId} style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <CanvasPill theme={theme} tone="neutral">{event.eventType}</CanvasPill>
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>{event.createdAt}</span>
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
