"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import {
  formGridStyle,
  formInputStyle,
  formLabelStyle,
  formSectionTitleStyle,
  nestedCardStyle,
  smallMutedStyle,
} from "@/components/governance-form-styles";
import type {
  CreateServiceAreaBoundaryCommand,
  CreateStopPolicyCommand,
  EvaluateServiceAreaCommand,
  PublishServiceAreaBoundaryCommand,
  PublishStopPolicyCommand,
  RetireServiceAreaBoundaryCommand,
  RetireStopPolicyCommand,
  ServiceAreaAdminMutationResponse,
  ServiceAreaBoundaryRecord,
  ServiceAreaDefinitionsResponse,
  ServiceAreaGeoJsonFeature,
  ServiceAreaGeoJsonResponse,
  ServiceAreaGeometry,
  ServiceProductType,
  StopPolicyDirection,
  StopPolicyEffect,
  StopPolicyRecord,
  UpdateServiceAreaBoundaryCommand,
  UpdateStopPolicyCommand,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasEmptyState,
  CanvasPageHeader,
  CanvasPill,
  GeometryEditor,
  buildCanvasTheme,
  createEmptyGeometryDraft,
  type CanvasTone,
  type GeometryDraft,
  type GeometryEditorSnapshot,
} from "@drts/ui-web";

const SERVICE_PRODUCTS: ServiceProductType[] = [
  "taxi_realtime",
  "taxi_reservation",
  "enterprise_dispatch",
  "credit_card_airport_transfer",
  "insurance_replacement_vehicle",
  "travel_agency_transfer",
  "third_party_forwarded_order",
];

const STOP_DIRECTIONS: StopPolicyDirection[] = ["pickup", "dropoff", "both"];
const STOP_EFFECTS: StopPolicyEffect[] = ["allow", "deny", "manual_review"];
const RECORD_TYPES = ["serviceAreas", "stopPolicies"] as const;

type RecordType = (typeof RECORD_TYPES)[number];
type Scope = "overview" | "serviceArea" | "stopPolicy";

type GovernancePageProps = {
  scope: Scope;
  selectedId?: string;
};

type MutationMode = "create" | "edit";

type SharedFormState = {
  displayName: string;
  effectiveFrom: string;
  effectiveUntil: string;
  serviceProductTypes: ServiceProductType[];
};

type ServiceAreaFormState = SharedFormState & {
  areaCode: string;
};

type StopPolicyFormState = SharedFormState & {
  policyCode: string;
  direction: StopPolicyDirection;
  effect: StopPolicyEffect;
  serviceAreaCodesText: string;
  reasonCode: string;
  reasonMessage: string;
};

type EvaluateFormState = {
  serviceProductType: ServiceProductType;
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1.4fr 0.9fr",
  gap: 16,
  alignItems: "start",
};

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const listButtonStyle = (active: boolean): CSSProperties => ({
  ...nestedCardStyle,
  cursor: "pointer",
  border: `1px solid ${active ? theme.accentBorder : "#e2e8f0"}`,
  background: active ? theme.accentBg : "#ffffff",
  textAlign: "left",
});

const detailLinkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const checkboxGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const monoStyle: CSSProperties = {
  ...smallMutedStyle,
  fontFamily: theme.monoFamily,
};

const previewResultStyle = (tone: CanvasTone): CSSProperties => ({
  ...nestedCardStyle,
  borderColor:
    tone === "danger"
      ? theme.dangerBorder
      : tone === "warn"
        ? theme.warnBorder
        : theme.successBorder,
  background:
    tone === "danger"
      ? theme.dangerBg
      : tone === "warn"
        ? theme.warnBg
        : theme.successBg,
});

function geometryToDraft(geometry: ServiceAreaGeometry | null | undefined): GeometryDraft {
  if (!geometry) {
    return createEmptyGeometryDraft("polygon");
  }
  if (geometry.type === "circle") {
    return {
      kind: "circle",
      center: geometry.center,
      radiusMeters: geometry.radiusMeters,
    };
  }
  return {
    kind: "polygon",
    points: geometry.coordinates,
  };
}

function isoToInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

function inputValueToIso(value: string) {
  if (!value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function geometrySummary(geometry: ServiceAreaGeometry) {
  return geometry.type === "circle"
    ? `circle · ${Math.round(geometry.radiusMeters)} m`
    : `polygon · ${geometry.coordinates.length} pts`;
}

function statusTone(status: string): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "review":
      return "warn";
    case "retired":
      return "neutral";
    default:
      return "info";
  }
}

function selectedRoute(recordType: RecordType, recordId: string) {
  return recordType === "serviceAreas"
    ? `/service-area-governance/service-areas/${encodeURIComponent(recordId)}`
    : `/service-area-governance/stop-policies/${encodeURIComponent(recordId)}`;
}

function serviceAreaToFormState(record: ServiceAreaBoundaryRecord | null): ServiceAreaFormState {
  return {
    areaCode: record?.areaCode ?? "",
    displayName: record?.displayName ?? "",
    effectiveFrom: isoToInputValue(record?.effectiveFrom),
    effectiveUntil: isoToInputValue(record?.effectiveUntil),
    serviceProductTypes: record?.serviceProductTypes ?? ["taxi_realtime"],
  };
}

function stopPolicyToFormState(record: StopPolicyRecord | null): StopPolicyFormState {
  return {
    policyCode: record?.policyCode ?? "",
    displayName: record?.displayName ?? "",
    direction: record?.direction ?? "pickup",
    effect: record?.effect ?? "deny",
    serviceAreaCodesText: record?.serviceAreaCodes.join(", ") ?? "",
    reasonCode: record?.reasonCode ?? "manual_geofence_review",
    reasonMessage: record?.reasonMessage ?? "",
    effectiveFrom: isoToInputValue(record?.effectiveFrom),
    effectiveUntil: isoToInputValue(record?.effectiveUntil),
    serviceProductTypes: record?.serviceProductTypes ?? ["taxi_realtime"],
  };
}

function detailHeading(scope: Scope) {
  if (scope === "serviceArea") {
    return "Service-area boundary detail";
  }
  if (scope === "stopPolicy") {
    return "Stop-policy detail";
  }
  return "Governance overview";
}

export function ServiceAreaGovernancePage({
  scope,
  selectedId,
}: GovernancePageProps) {
  const client = usePlatformAdminClient();
  const [definitions, setDefinitions] =
    useState<ServiceAreaDefinitionsResponse | null>(null);
  const [geoJson, setGeoJson] = useState<ServiceAreaGeoJsonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(
    scope === "stopPolicy" ? "stopPolicies" : "serviceAreas",
  );
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    selectedId ?? null,
  );
  const [serviceAreaForm, setServiceAreaForm] = useState<ServiceAreaFormState>(
    serviceAreaToFormState(null),
  );
  const [stopPolicyForm, setStopPolicyForm] = useState<StopPolicyFormState>(
    stopPolicyToFormState(null),
  );
  const [editorSnapshot, setEditorSnapshot] =
    useState<GeometryEditorSnapshot | null>(null);
  const [mutationMode, setMutationMode] = useState<MutationMode>("edit");
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [lastMutation, setLastMutation] =
    useState<ServiceAreaAdminMutationResponse | null>(null);
  const [publishReason, setPublishReason] = useState("");
  const [retireReason, setRetireReason] = useState("");
  const [previewForm, setPreviewForm] = useState<EvaluateFormState>({
    serviceProductType: "taxi_realtime",
    pickupLat: "25.033964",
    pickupLng: "121.564468",
    dropoffLat: "25.047675",
    dropoffLng: "121.517055",
  });
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [definitionsResult, geoJsonResult] = await Promise.all([
        client.getServiceAreaDefinitions(),
        client.getServiceAreaGeoJson(),
      ]);
      setDefinitions(definitionsResult);
      setGeoJson(geoJsonResult);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [client]);

  const records = useMemo(() => {
    if (!definitions) {
      return [];
    }
    return recordType === "serviceAreas"
      ? definitions.serviceAreas
      : definitions.stopPolicies;
  }, [definitions, recordType]);

  const serviceAreas = definitions?.serviceAreas ?? [];
  const stopPolicies = definitions?.stopPolicies ?? [];

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) {
      return null;
    }
    return (
      serviceAreas.find((record) => record.serviceAreaId === selectedRecordId) ??
      stopPolicies.find((record) => record.stopPolicyId === selectedRecordId) ??
      null
    );
  }, [selectedRecordId, serviceAreas, stopPolicies]);

  useEffect(() => {
    setRecordType(scope === "stopPolicy" ? "stopPolicies" : "serviceAreas");
  }, [scope]);

  useEffect(() => {
    if (selectedId) {
      setSelectedRecordId(selectedId);
      return;
    }
    if (!selectedRecordId && records.length > 0) {
      const first = records[0] as ServiceAreaBoundaryRecord | StopPolicyRecord;
      setSelectedRecordId(
        "serviceAreaId" in first ? first.serviceAreaId : first.stopPolicyId,
      );
    }
  }, [selectedId, selectedRecordId, records]);

  useEffect(() => {
    if (recordType === "serviceAreas") {
      const record =
        selectedRecord && "serviceAreaId" in selectedRecord ? selectedRecord : null;
      setServiceAreaForm(serviceAreaToFormState(record));
      setMutationMode(record ? "edit" : "create");
    } else {
      const record =
        selectedRecord && "stopPolicyId" in selectedRecord ? selectedRecord : null;
      setStopPolicyForm(stopPolicyToFormState(record));
      setMutationMode(record ? "edit" : "create");
    }
    setMutationError(null);
  }, [recordType, selectedRecord]);

  const selectedFeature = useMemo(() => {
    if (!geoJson || !selectedRecord) {
      return null;
    }
    const recordId =
      "serviceAreaId" in selectedRecord
        ? selectedRecord.serviceAreaId
        : selectedRecord.stopPolicyId;
    return (
      geoJson.features.find((feature) => feature.id === recordId) ?? null
    ) as ServiceAreaGeoJsonFeature | null;
  }, [geoJson, selectedRecord]);

  const editorInitialDraft = useMemo(() => {
    if (mutationMode === "create") {
      return createEmptyGeometryDraft("polygon");
    }
    if (!selectedRecord) {
      return createEmptyGeometryDraft("polygon");
    }
    return geometryToDraft(selectedRecord.geometry);
  }, [mutationMode, selectedRecord]);

  const editorKey = `${recordType}:${mutationMode}:${selectedRecordId ?? "new"}`;

  function updateServiceProducts(
    current: ServiceProductType[],
    value: ServiceProductType,
  ) {
    return current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
  }

  async function runMutation(action: () => Promise<ServiceAreaAdminMutationResponse>) {
    setMutationPending(true);
    setMutationError(null);
    try {
      const result = await action();
      setLastMutation(result);
      await load();
    } catch (mutationLoadError: unknown) {
      setMutationError(
        mutationLoadError instanceof Error
          ? mutationLoadError.message
          : String(mutationLoadError),
      );
    } finally {
      setMutationPending(false);
    }
  }

  function currentGeometry() {
    const geometry = editorSnapshot?.backendPayloads.serviceAreaGeometry;
    if (!geometry) {
      throw new Error(
        "Geometry must stay on polygon/circle. Route corridors are not valid on taxi governance routes.",
      );
    }
    return geometry;
  }

  async function submitServiceArea() {
    const payload: CreateServiceAreaBoundaryCommand | UpdateServiceAreaBoundaryCommand =
      mutationMode === "create"
        ? {
            areaCode: serviceAreaForm.areaCode.trim(),
            displayName: serviceAreaForm.displayName.trim(),
            geometry: currentGeometry(),
            serviceProductTypes: serviceAreaForm.serviceProductTypes,
            effectiveFrom: inputValueToIso(serviceAreaForm.effectiveFrom),
            effectiveUntil: inputValueToIso(serviceAreaForm.effectiveUntil),
            metadata: { sourceSurface: "platform_admin_service_area_governance" },
          }
        : {
            displayName: serviceAreaForm.displayName.trim(),
            geometry: currentGeometry(),
            serviceProductTypes: serviceAreaForm.serviceProductTypes,
            effectiveFrom: inputValueToIso(serviceAreaForm.effectiveFrom),
            effectiveUntil: inputValueToIso(serviceAreaForm.effectiveUntil),
            metadata: { sourceSurface: "platform_admin_service_area_governance" },
          };

    await runMutation(() =>
      mutationMode === "create"
        ? client.createServiceAreaBoundary(payload as CreateServiceAreaBoundaryCommand)
        : client.updateServiceAreaBoundary(
            (selectedRecord as ServiceAreaBoundaryRecord).serviceAreaId,
            payload as UpdateServiceAreaBoundaryCommand,
          ),
    );
  }

  async function submitStopPolicy() {
    const payload: CreateStopPolicyCommand | UpdateStopPolicyCommand =
      mutationMode === "create"
        ? {
            policyCode: stopPolicyForm.policyCode.trim(),
            displayName: stopPolicyForm.displayName.trim(),
            direction: stopPolicyForm.direction,
            effect: stopPolicyForm.effect,
            geometry: currentGeometry(),
            serviceAreaCodes: stopPolicyForm.serviceAreaCodesText
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            serviceProductTypes: stopPolicyForm.serviceProductTypes,
            reasonCode: stopPolicyForm.reasonCode.trim(),
            reasonMessage: stopPolicyForm.reasonMessage.trim(),
            effectiveFrom: inputValueToIso(stopPolicyForm.effectiveFrom),
            effectiveUntil: inputValueToIso(stopPolicyForm.effectiveUntil),
            metadata: { sourceSurface: "platform_admin_service_area_governance" },
          }
        : {
            displayName: stopPolicyForm.displayName.trim(),
            direction: stopPolicyForm.direction,
            effect: stopPolicyForm.effect,
            geometry: currentGeometry(),
            serviceAreaCodes: stopPolicyForm.serviceAreaCodesText
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            serviceProductTypes: stopPolicyForm.serviceProductTypes,
            reasonCode: stopPolicyForm.reasonCode.trim(),
            reasonMessage: stopPolicyForm.reasonMessage.trim(),
            effectiveFrom: inputValueToIso(stopPolicyForm.effectiveFrom),
            effectiveUntil: inputValueToIso(stopPolicyForm.effectiveUntil),
            metadata: { sourceSurface: "platform_admin_service_area_governance" },
          };

    await runMutation(() =>
      mutationMode === "create"
        ? client.createStopPolicy(payload as CreateStopPolicyCommand)
        : client.updateStopPolicy(
            (selectedRecord as StopPolicyRecord).stopPolicyId,
            payload as UpdateStopPolicyCommand,
          ),
    );
  }

  async function submitForReview() {
    if (!selectedRecord) {
      return;
    }
    await runMutation(() =>
      "serviceAreaId" in selectedRecord
        ? client.submitServiceAreaBoundaryForReview(selectedRecord.serviceAreaId)
        : client.submitStopPolicyForReview(selectedRecord.stopPolicyId),
    );
  }

  async function publishRecord() {
    if (!selectedRecord) {
      return;
    }
    const payload =
      recordType === "serviceAreas"
        ? ({
            effectiveFrom: inputValueToIso(serviceAreaForm.effectiveFrom),
            effectiveUntil: inputValueToIso(serviceAreaForm.effectiveUntil),
            reason: publishReason.trim() || null,
          } satisfies PublishServiceAreaBoundaryCommand)
        : ({
            effectiveFrom: inputValueToIso(stopPolicyForm.effectiveFrom),
            effectiveUntil: inputValueToIso(stopPolicyForm.effectiveUntil),
            reason: publishReason.trim() || null,
          } satisfies PublishStopPolicyCommand);
    await runMutation(() =>
      "serviceAreaId" in selectedRecord
        ? client.publishServiceAreaBoundary(selectedRecord.serviceAreaId, payload)
        : client.publishStopPolicy(selectedRecord.stopPolicyId, payload),
    );
  }

  async function retireRecord() {
    if (!selectedRecord) {
      return;
    }
    const payload =
      recordType === "serviceAreas"
        ? ({
            effectiveUntil: inputValueToIso(serviceAreaForm.effectiveUntil),
            reason: retireReason.trim() || null,
          } satisfies RetireServiceAreaBoundaryCommand)
        : ({
            effectiveUntil: inputValueToIso(stopPolicyForm.effectiveUntil),
            reason: retireReason.trim() || null,
          } satisfies RetireStopPolicyCommand);
    await runMutation(() =>
      "serviceAreaId" in selectedRecord
        ? client.retireServiceAreaBoundary(selectedRecord.serviceAreaId, payload)
        : client.retireStopPolicy(selectedRecord.stopPolicyId, payload),
    );
  }

  async function runPreview() {
    setPreviewPending(true);
    setPreviewError(null);
    try {
      const command: EvaluateServiceAreaCommand = {
        serviceProductType: previewForm.serviceProductType,
        pickup: {
          lat: Number(previewForm.pickupLat),
          lng: Number(previewForm.pickupLng),
        },
        dropoff:
          previewForm.dropoffLat.trim() && previewForm.dropoffLng.trim()
            ? {
                lat: Number(previewForm.dropoffLat),
                lng: Number(previewForm.dropoffLng),
              }
            : null,
      };
      setPreviewResult(await client.evaluateServiceArea(command));
    } catch (previewLoadError: unknown) {
      setPreviewError(
        previewLoadError instanceof Error
          ? previewLoadError.message
          : String(previewLoadError),
      );
    } finally {
      setPreviewPending(false);
    }
  }

  const selectedStatus = selectedRecord?.status ?? "draft";
  const canSubmitMutation =
    !!editorSnapshot?.canSubmit &&
    !!editorSnapshot.backendPayloads.serviceAreaGeometry &&
    !mutationPending;

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title="Service-area governance"
        subtitle={`${detailHeading(scope)} for taxi boundaries, stop policies, publish lifecycle, preview evaluation, and audit receipts.`}
        tabs={[
          `boundaries ${serviceAreas.length}`,
          `stop policies ${stopPolicies.length}`,
          `generated ${definitions?.generatedAt ?? "loading"}`,
        ]}
      />

      <CanvasBanner
        theme={theme}
        tone="info"
        title="Canonical governance route family"
        body={
          <>
            This route family is the canonical Platform Admin publication for
            `/service-area-governance`. It uses the shared `GeometryEditor`
            with polygon/circle-only governance constraints and the accepted
            `/api/service-area/admin/*` contract family.
          </>
        }
      />

      {error ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          title="Governance data load failed"
          body={`Failed to load governance data: ${error}`}
        />
      ) : null}

      {mutationError ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          title="Mutation failed"
          body={mutationError}
        />
      ) : null}

      <div style={summaryGridStyle}>
        <CanvasCard
          theme={theme}
          title="Governed records"
          subtitle="Switch record type, pick an active detail route, or start a fresh draft."
        >
          <div style={sectionStackStyle}>
            <div style={actionRowStyle}>
              {RECORD_TYPES.map((type) => (
                <CanvasBtn
                  key={type}
                  theme={theme}
                  variant={recordType === type ? "primary" : "secondary"}
                  onClick={() => {
                    setRecordType(type);
                    setSelectedRecordId(null);
                    setMutationMode("create");
                  }}
                >
                  {type === "serviceAreas" ? "Service areas" : "Stop policies"}
                </CanvasBtn>
              ))}
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => {
                  setSelectedRecordId(null);
                  setMutationMode("create");
                }}
              >
                New draft
              </CanvasBtn>
            </div>
            <div style={cardStackStyle}>
              {records.length === 0 && !loading ? (
                <CanvasEmptyState
                  theme={theme}
                  tone="warn"
                  title="No governed records yet"
                  body="Start a draft boundary or stop policy from this route."
                />
              ) : null}
              {records.map((record) => {
                const id =
                  "serviceAreaId" in record ? record.serviceAreaId : record.stopPolicyId;
                const geometry = record.geometry;
                return (
                  <button
                    key={id}
                    type="button"
                    style={listButtonStyle(selectedRecordId === id)}
                    onClick={() => {
                      setSelectedRecordId(id);
                      setMutationMode("edit");
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{record.displayName}</strong>
                        <div style={monoStyle}>
                          {"serviceAreaId" in record ? record.areaCode : record.policyCode}
                        </div>
                      </div>
                      <CanvasPill
                        theme={theme}
                        tone={statusTone(record.status)}
                        dot
                      >
                        {record.status}
                      </CanvasPill>
                    </div>
                    <div style={smallMutedStyle}>
                      {geometrySummary(geometry)} · v{record.version} ·{" "}
                      {record.updatedAt}
                    </div>
                    <div>
                      <Link href={selectedRoute(recordType, id)} style={detailLinkStyle}>
                        Open canonical detail route
                      </Link>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Geometry workspace"
          subtitle="Shared editor restricted to taxi governance polygon/circle geometry."
        >
          <GeometryEditor
            key={editorKey}
            theme={theme}
            initialDraft={editorInitialDraft}
            baselineDraft={
              mutationMode === "edit" && selectedRecord
                ? geometryToDraft(selectedRecord.geometry)
                : null
            }
            allowedKinds={["polygon", "circle"]}
            onChange={setEditorSnapshot}
          />
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Overlay and audit"
          subtitle="Published overlays, generated timestamps, and last mutation receipt."
        >
          <div style={sectionStackStyle}>
            <div style={nestedCardStyle}>
              <h3 style={formSectionTitleStyle}>Overlay snapshot</h3>
              <div style={smallMutedStyle}>
                Generated at {geoJson?.generatedAt ?? "loading"} with{" "}
                {geoJson?.features.length ?? 0} GeoJSON features.
              </div>
              {selectedFeature ? (
                <pre style={monoStyle}>{JSON.stringify(selectedFeature, null, 2)}</pre>
              ) : (
                <div style={smallMutedStyle}>
                  Pick a record to inspect the GeoJSON feature properties.
                </div>
              )}
            </div>

            <div style={nestedCardStyle}>
              <h3 style={formSectionTitleStyle}>Audit receipt</h3>
              {lastMutation ? (
                <div style={sectionStackStyle}>
                  <div style={monoStyle}>auditId: {lastMutation.auditId ?? "none"}</div>
                  <div style={smallMutedStyle}>
                    generatedAt: {lastMutation.generatedAt}
                  </div>
                  <pre style={monoStyle}>{JSON.stringify(lastMutation, null, 2)}</pre>
                </div>
              ) : (
                <div style={smallMutedStyle}>
                  Publish, retire, or update a record to surface the mutation receipt.
                </div>
              )}
            </div>
          </div>
        </CanvasCard>
      </div>

      <div style={summaryGridStyle}>
        <CanvasCard
          theme={theme}
          title={
            recordType === "serviceAreas"
              ? mutationMode === "create"
                ? "Create boundary draft"
                : "Edit boundary draft"
              : mutationMode === "create"
                ? "Create stop-policy draft"
                : "Edit stop-policy draft"
          }
          subtitle="Draft/review records can be edited in place. Active or retired records should be replaced or retired through governed actions."
        >
          {recordType === "serviceAreas" ? (
            <div style={sectionStackStyle}>
              <div style={formGridStyle}>
                <label>
                  <div style={formLabelStyle}>Area code</div>
                  <input
                    value={serviceAreaForm.areaCode}
                    onChange={(event) =>
                      setServiceAreaForm((current) => ({
                        ...current,
                        areaCode: event.target.value,
                      }))
                    }
                    disabled={mutationMode === "edit"}
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Display name</div>
                  <input
                    value={serviceAreaForm.displayName}
                    onChange={(event) =>
                      setServiceAreaForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Effective from</div>
                  <input
                    type="datetime-local"
                    value={serviceAreaForm.effectiveFrom}
                    onChange={(event) =>
                      setServiceAreaForm((current) => ({
                        ...current,
                        effectiveFrom: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Effective until</div>
                  <input
                    type="datetime-local"
                    value={serviceAreaForm.effectiveUntil}
                    onChange={(event) =>
                      setServiceAreaForm((current) => ({
                        ...current,
                        effectiveUntil: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
              </div>
              <div>
                <div style={formLabelStyle}>Service products</div>
                <div style={checkboxGridStyle}>
                  {SERVICE_PRODUCTS.map((product) => (
                    <label key={product} style={smallMutedStyle}>
                      <input
                        type="checkbox"
                        checked={serviceAreaForm.serviceProductTypes.includes(product)}
                        onChange={() =>
                          setServiceAreaForm((current) => ({
                            ...current,
                            serviceProductTypes: updateServiceProducts(
                              current.serviceProductTypes,
                              product,
                            ),
                          }))
                        }
                      />{" "}
                      {product}
                    </label>
                  ))}
                </div>
              </div>
              <div style={actionRowStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={!canSubmitMutation}
                  onClick={() => void submitServiceArea()}
                >
                  {mutationMode === "create" ? "Create draft" : "Save draft"}
                </CanvasBtn>
                {selectedRecord ? (
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    disabled={mutationPending}
                    onClick={() => void submitForReview()}
                  >
                    Submit for review
                  </CanvasBtn>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={sectionStackStyle}>
              <div style={formGridStyle}>
                <label>
                  <div style={formLabelStyle}>Policy code</div>
                  <input
                    value={stopPolicyForm.policyCode}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        policyCode: event.target.value,
                      }))
                    }
                    disabled={mutationMode === "edit"}
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Display name</div>
                  <input
                    value={stopPolicyForm.displayName}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Direction</div>
                  <select
                    value={stopPolicyForm.direction}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        direction: event.target.value as StopPolicyDirection,
                      }))
                    }
                    style={formInputStyle}
                  >
                    {STOP_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>
                        {direction}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={formLabelStyle}>Effect</div>
                  <select
                    value={stopPolicyForm.effect}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        effect: event.target.value as StopPolicyEffect,
                      }))
                    }
                    style={formInputStyle}
                  >
                    {STOP_EFFECTS.map((effect) => (
                      <option key={effect} value={effect}>
                        {effect}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={formLabelStyle}>Reason code</div>
                  <input
                    value={stopPolicyForm.reasonCode}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        reasonCode: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Reason message</div>
                  <input
                    value={stopPolicyForm.reasonMessage}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        reasonMessage: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Service-area codes</div>
                  <input
                    value={stopPolicyForm.serviceAreaCodesText}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        serviceAreaCodesText: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Effective from</div>
                  <input
                    type="datetime-local"
                    value={stopPolicyForm.effectiveFrom}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        effectiveFrom: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
                <label>
                  <div style={formLabelStyle}>Effective until</div>
                  <input
                    type="datetime-local"
                    value={stopPolicyForm.effectiveUntil}
                    onChange={(event) =>
                      setStopPolicyForm((current) => ({
                        ...current,
                        effectiveUntil: event.target.value,
                      }))
                    }
                    style={formInputStyle}
                  />
                </label>
              </div>
              <div>
                <div style={formLabelStyle}>Service products</div>
                <div style={checkboxGridStyle}>
                  {SERVICE_PRODUCTS.map((product) => (
                    <label key={product} style={smallMutedStyle}>
                      <input
                        type="checkbox"
                        checked={stopPolicyForm.serviceProductTypes.includes(product)}
                        onChange={() =>
                          setStopPolicyForm((current) => ({
                            ...current,
                            serviceProductTypes: updateServiceProducts(
                              current.serviceProductTypes,
                              product,
                            ),
                          }))
                        }
                      />{" "}
                      {product}
                    </label>
                  ))}
                </div>
              </div>
              <div style={actionRowStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={!canSubmitMutation}
                  onClick={() => void submitStopPolicy()}
                >
                  {mutationMode === "create" ? "Create draft" : "Save draft"}
                </CanvasBtn>
                {selectedRecord ? (
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    disabled={mutationPending}
                    onClick={() => void submitForReview()}
                  >
                    Submit for review
                  </CanvasBtn>
                ) : null}
              </div>
            </div>
          )}
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Publish / retire"
          subtitle="High-risk actions require an explicit reason and surface the returned audit receipt."
        >
          <div style={sectionStackStyle}>
            <div style={nestedCardStyle}>
              <h3 style={formSectionTitleStyle}>Current lifecycle</h3>
              <div style={actionRowStyle}>
                <CanvasPill theme={theme} tone={statusTone(selectedStatus)} dot>
                  {selectedStatus}
                </CanvasPill>
                <span style={smallMutedStyle}>
                  Active and retired records should avoid silent inline mutation.
                </span>
              </div>
            </div>
            <label>
              <div style={formLabelStyle}>Publish reason</div>
              <input
                value={publishReason}
                onChange={(event) => setPublishReason(event.target.value)}
                style={formInputStyle}
              />
            </label>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={!selectedRecord || mutationPending}
                onClick={() => void publishRecord()}
              >
                Publish
              </CanvasBtn>
            </div>
            <label>
              <div style={formLabelStyle}>Retire reason</div>
              <input
                value={retireReason}
                onChange={(event) => setRetireReason(event.target.value)}
                style={formInputStyle}
              />
            </label>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                danger
                disabled={!selectedRecord || mutationPending}
                onClick={() => void retireRecord()}
              >
                Retire
              </CanvasBtn>
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Affected sample preview"
          subtitle="Backend `POST /api/service-area/evaluate` remains authoritative. This page only surfaces the result."
        >
          <div style={sectionStackStyle}>
            <div style={formGridStyle}>
              <label>
                <div style={formLabelStyle}>Service product</div>
                <select
                  value={previewForm.serviceProductType}
                  onChange={(event) =>
                    setPreviewForm((current) => ({
                      ...current,
                      serviceProductType: event.target.value as ServiceProductType,
                    }))
                  }
                  style={formInputStyle}
                >
                  {SERVICE_PRODUCTS.map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div style={formLabelStyle}>Pickup lat</div>
                <input
                  value={previewForm.pickupLat}
                  onChange={(event) =>
                    setPreviewForm((current) => ({
                      ...current,
                      pickupLat: event.target.value,
                    }))
                  }
                  style={formInputStyle}
                />
              </label>
              <label>
                <div style={formLabelStyle}>Pickup lng</div>
                <input
                  value={previewForm.pickupLng}
                  onChange={(event) =>
                    setPreviewForm((current) => ({
                      ...current,
                      pickupLng: event.target.value,
                    }))
                  }
                  style={formInputStyle}
                />
              </label>
              <label>
                <div style={formLabelStyle}>Dropoff lat</div>
                <input
                  value={previewForm.dropoffLat}
                  onChange={(event) =>
                    setPreviewForm((current) => ({
                      ...current,
                      dropoffLat: event.target.value,
                    }))
                  }
                  style={formInputStyle}
                />
              </label>
              <label>
                <div style={formLabelStyle}>Dropoff lng</div>
                <input
                  value={previewForm.dropoffLng}
                  onChange={(event) =>
                    setPreviewForm((current) => ({
                      ...current,
                      dropoffLng: event.target.value,
                    }))
                  }
                  style={formInputStyle}
                />
              </label>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={previewPending}
                onClick={() => void runPreview()}
              >
                Run preview
              </CanvasBtn>
            </div>
            {previewError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title="Preview failed"
                body={previewError}
              />
            ) : null}
            {previewResult ? (
              <div
                style={previewResultStyle(
                  JSON.stringify(previewResult).includes("manual_review")
                    ? "warn"
                    : JSON.stringify(previewResult).includes("not_serviceable")
                      ? "danger"
                      : "success",
                )}
              >
                <pre style={monoStyle}>{JSON.stringify(previewResult, null, 2)}</pre>
              </div>
            ) : (
              <div style={smallMutedStyle}>
                Run a sample to verify serviceable, blocked, and manual-review outcomes before publish.
              </div>
            )}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
