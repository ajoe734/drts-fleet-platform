"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  formatDateTime,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID } from "@/lib/platform-admin-client-factory";
import type {
  CreateServiceAreaBoundaryCommand,
  CreateStopPolicyCommand,
  EvaluateServiceAreaCommand,
  ServiceAreaBoundaryRecord,
  ServiceAreaEvaluationResult,
  ServiceAreaGeometry,
  ServiceAreaRecordStatus,
  ServiceProductType,
  StopPolicyDirection,
  StopPolicyEffect,
  StopPolicyRecord,
  UpdateServiceAreaBoundaryCommand,
  UpdateStopPolicyCommand,
} from "@drts/contracts";
import {
  SERVICE_PRODUCT_TYPES,
  STOP_POLICY_DIRECTIONS,
  STOP_POLICY_EFFECTS,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  GeometryEditor,
  GeometryPreviewSurface,
  buildCanvasTheme,
  createEmptyGeometryDraft,
  type CanvasPillTone,
  type GeometryDraft,
  type GeometryEditorSnapshot,
  type GeometryPreviewItem,
} from "@drts/ui-web";

type RecordType = "service_area" | "stop_policy";

type GovernanceDraft = {
  code: string;
  displayName: string;
  serviceProductTypes: ServiceProductType[];
  effectiveFrom: string;
  effectiveUntil: string;
  direction: StopPolicyDirection;
  effect: StopPolicyEffect;
  serviceAreaCodes: string[];
  reasonCode: string;
  reasonMessage: string;
};

type MutationReceipt = {
  auditId: string | null;
  action: string;
  actorId: string;
  recordLabel: string;
  version: number;
  status: ServiceAreaRecordStatus;
  direction?: StopPolicyDirection | undefined;
  effect?: StopPolicyEffect | undefined;
  effectiveFrom: string;
  effectiveUntil: string | null;
  reason: string;
  generatedAt: string;
};

type EvaluationDraft = {
  serviceProductType: ServiceProductType;
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const tabRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const twoColumnStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(360px, 1fr)",
  alignItems: "start",
} satisfies CSSProperties;

const splitCardStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
  alignItems: "start",
} satisfies CSSProperties;

const stackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const checklistStyle = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  gap: 6,
  color: theme.text,
  fontSize: 12,
  fontWeight: 600,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  lineHeight: 1.45,
  padding: "8px 10px",
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical",
} satisfies CSSProperties;

const hintStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const codeStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
} satisfies CSSProperties;

const emptyStateStyle = {
  border: `1px dashed ${theme.border}`,
  borderRadius: 10,
  padding: "28px 18px",
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
} satisfies CSSProperties;

const thStyle = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: `1px solid ${theme.border}`,
  color: theme.textDim,
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const tdStyle = {
  padding: "10px 10px",
  borderBottom: `1px solid ${theme.border}`,
  verticalAlign: "top",
} satisfies CSSProperties;

const tabButtonStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? theme.accentBorder : theme.border}`,
  background: active ? theme.accentBg : theme.surface,
  color: active ? theme.accent : theme.textMuted,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

const recordButtonStyle = (selected: boolean): CSSProperties => ({
  width: "100%",
  textAlign: "left",
  border: `1px solid ${selected ? theme.accentBorder : theme.border}`,
  background: selected ? theme.accentBg : theme.surface,
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 8,
  cursor: "pointer",
});

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function geometryToDraft(geometry: ServiceAreaGeometry | null | undefined): GeometryDraft {
  if (!geometry) {
    return createEmptyGeometryDraft("polygon");
  }
  return geometry.type === "polygon"
    ? { kind: "polygon", points: geometry.coordinates }
    : {
        kind: "circle",
        center: geometry.center,
        radiusMeters: geometry.radiusMeters,
      };
}

function statusTone(status: ServiceAreaRecordStatus): CanvasPillTone {
  switch (status) {
    case "active":
      return "success";
    case "review":
      return "warn";
    case "retired":
      return "neutral";
    case "draft":
    default:
      return "accent";
  }
}

function decisionTone(
  decision: ServiceAreaEvaluationResult["decision"],
): CanvasPillTone {
  switch (decision) {
    case "serviceable":
      return "success";
    case "manual_review":
      return "warn";
    case "not_serviceable":
    default:
      return "danger";
  }
}

function buildEmptyDraft(): GovernanceDraft {
  return {
    code: "",
    displayName: "",
    serviceProductTypes: ["taxi_realtime"],
    effectiveFrom: "",
    effectiveUntil: "",
    direction: "pickup",
    effect: "deny",
    serviceAreaCodes: [],
    reasonCode: "",
    reasonMessage: "",
  };
}

function isEditableStatus(status: ServiceAreaRecordStatus) {
  return status === "draft" || status === "review";
}

function getRecordId(
  _recordType: RecordType,
  record: ServiceAreaBoundaryRecord | StopPolicyRecord,
) {
  return "serviceAreaId" in record ? record.serviceAreaId : record.stopPolicyId;
}

function getRecordCode(
  _recordType: RecordType,
  record: ServiceAreaBoundaryRecord | StopPolicyRecord,
) {
  return "areaCode" in record ? record.areaCode : record.policyCode;
}

function getRecordLabels(recordType: RecordType) {
  return recordType === "service_area"
    ? {
        singular: "service-area boundary",
        plural: "service-area boundaries",
        code: "Area code",
        noun: "boundary",
      }
    : {
        singular: "stop policy",
        plural: "stop policies",
        code: "Policy code",
        noun: "policy",
      };
}

function recordToDraft(
  recordType: RecordType,
  record: ServiceAreaBoundaryRecord | StopPolicyRecord | null,
) {
  if (!record) {
    return buildEmptyDraft();
  }
  if (recordType === "service_area") {
    const boundary = record as ServiceAreaBoundaryRecord;
    return {
      ...buildEmptyDraft(),
      code: boundary.areaCode,
      displayName: boundary.displayName,
      serviceProductTypes: [...boundary.serviceProductTypes],
      effectiveFrom: boundary.effectiveFrom.slice(0, 16),
      effectiveUntil: boundary.effectiveUntil?.slice(0, 16) ?? "",
    };
  }

  const policy = record as StopPolicyRecord;
  return {
    ...buildEmptyDraft(),
    code: policy.policyCode,
    displayName: policy.displayName,
    serviceProductTypes: [...policy.serviceProductTypes],
    effectiveFrom: policy.effectiveFrom.slice(0, 16),
    effectiveUntil: policy.effectiveUntil?.slice(0, 16) ?? "",
    direction: policy.direction,
    effect: policy.effect,
    serviceAreaCodes: [...policy.serviceAreaCodes],
    reasonCode: policy.reasonCode,
    reasonMessage: policy.reasonMessage,
  };
}

function buildBoundaryCreate(
  draft: GovernanceDraft,
  geometry: ServiceAreaGeometry,
): CreateServiceAreaBoundaryCommand {
  return {
    areaCode: draft.code.trim(),
    displayName: draft.displayName.trim(),
    geometry,
    serviceProductTypes: draft.serviceProductTypes,
    effectiveFrom: toIsoOrNull(draft.effectiveFrom),
    effectiveUntil: toIsoOrNull(draft.effectiveUntil),
  };
}

function buildBoundaryUpdate(
  draft: GovernanceDraft,
  geometry: ServiceAreaGeometry,
): UpdateServiceAreaBoundaryCommand {
  return {
    displayName: draft.displayName.trim(),
    geometry,
    serviceProductTypes: draft.serviceProductTypes,
    effectiveFrom: toIsoOrNull(draft.effectiveFrom),
    effectiveUntil: toIsoOrNull(draft.effectiveUntil),
  };
}

function buildPolicyCreate(
  draft: GovernanceDraft,
  geometry: ServiceAreaGeometry,
): CreateStopPolicyCommand {
  return {
    policyCode: draft.code.trim(),
    displayName: draft.displayName.trim(),
    direction: draft.direction,
    effect: draft.effect,
    geometry,
    serviceAreaCodes: draft.serviceAreaCodes,
    serviceProductTypes: draft.serviceProductTypes,
    reasonCode: draft.reasonCode.trim(),
    reasonMessage: draft.reasonMessage.trim(),
    effectiveFrom: toIsoOrNull(draft.effectiveFrom),
    effectiveUntil: toIsoOrNull(draft.effectiveUntil),
  };
}

function buildPolicyUpdate(
  draft: GovernanceDraft,
  geometry: ServiceAreaGeometry,
): UpdateStopPolicyCommand {
  return {
    displayName: draft.displayName.trim(),
    direction: draft.direction,
    effect: draft.effect,
    geometry,
    serviceAreaCodes: draft.serviceAreaCodes,
    serviceProductTypes: draft.serviceProductTypes,
    reasonCode: draft.reasonCode.trim(),
    reasonMessage: draft.reasonMessage.trim(),
    effectiveFrom: toIsoOrNull(draft.effectiveFrom),
    effectiveUntil: toIsoOrNull(draft.effectiveUntil),
  };
}

function buildReceipt(
  response: { auditId: string | null; generatedAt: string },
  nextRecord: ServiceAreaBoundaryRecord | StopPolicyRecord,
  action: string,
  reason: string,
): MutationReceipt {
  return {
    auditId: response.auditId,
    action,
    actorId: PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID,
    recordLabel: nextRecord.displayName,
    version: nextRecord.version,
    status: nextRecord.status,
    direction: "direction" in nextRecord ? nextRecord.direction : undefined,
    effect: "effect" in nextRecord ? nextRecord.effect : undefined,
    effectiveFrom: nextRecord.effectiveFrom,
    effectiveUntil: nextRecord.effectiveUntil,
    reason,
    generatedAt: response.generatedAt,
  };
}

export function ServiceAreaGovernancePage() {
  const client = usePlatformAdminClient();
  const [recordType, setRecordType] = useState<RecordType>("service_area");
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaBoundaryRecord[]>([]);
  const [stopPolicies, setStopPolicies] = useState<StopPolicyRecord[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [overlayGeneratedAt, setOverlayGeneratedAt] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GovernanceDraft>(() =>
    buildEmptyDraft(),
  );
  const [geometryDraft, setGeometryDraft] = useState<GeometryDraft>(
    createEmptyGeometryDraft("polygon"),
  );
  const [geometrySnapshot, setGeometrySnapshot] =
    useState<GeometryEditorSnapshot | null>(null);
  const [publishReason, setPublishReason] = useState("");
  const [publishEffectiveFrom, setPublishEffectiveFrom] = useState("");
  const [publishEffectiveUntil, setPublishEffectiveUntil] = useState("");
  const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const [evaluationDraft, setEvaluationDraft] = useState<EvaluationDraft>({
    serviceProductType: "taxi_realtime",
    pickupLat: "25.0478",
    pickupLng: "121.5170",
    dropoffLat: "25.0338",
    dropoffLng: "121.5654",
  });
  const [evaluation, setEvaluation] = useState<ServiceAreaEvaluationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const records = useMemo(
    () => (recordType === "service_area" ? serviceAreas : stopPolicies),
    [recordType, serviceAreas, stopPolicies],
  );

  const selectedRecord = useMemo(() => {
    return (
      records.find((record) => getRecordId(recordType, record) === selectedId) ?? null
    );
  }, [recordType, records, selectedId]);

  const labels = getRecordLabels(recordType);
  const geometryPayload = geometrySnapshot?.backendPayloads.serviceAreaGeometry ?? null;
  const geometryModeBlocked = geometrySnapshot?.draft.kind === "routeCorridor";
  const editable = selectedRecord ? isEditableStatus(selectedRecord.status) : true;

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const [definitions, geojson] = await Promise.all([
          client.getServiceAreaDefinitions(),
          client.getServiceAreaGeoJson(),
        ]);
        setServiceAreas(definitions.serviceAreas);
        setStopPolicies(definitions.stopPolicies);
        setGeneratedAt(definitions.generatedAt);
        setOverlayGeneratedAt(geojson.generatedAt);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedId && records.length > 0) {
      setSelectedId(getRecordId(recordType, records[0]!));
    }
    if (
      selectedId &&
      !records.some((record) => getRecordId(recordType, record) === selectedId)
    ) {
      setSelectedId(records.length > 0 ? getRecordId(recordType, records[0]!) : null);
    }
    if (records.length === 0) {
      setSelectedId(null);
    }
  }, [recordType, records, selectedId]);

  useEffect(() => {
    setDraft(recordToDraft(recordType, selectedRecord));
    setGeometryDraft(geometryToDraft(selectedRecord?.geometry));
    setPublishReason("");
    setPublishEffectiveFrom(selectedRecord?.effectiveFrom.slice(0, 16) ?? "");
    setPublishEffectiveUntil(selectedRecord?.effectiveUntil?.slice(0, 16) ?? "");
    setMutationError(null);
  }, [recordType, selectedRecord]);

  const previewItems = useMemo<GeometryPreviewItem[]>(() => {
    const items: GeometryPreviewItem[] = [];
    for (const area of serviceAreas.filter((record) => record.status === "active")) {
      items.push({
        id: `area-${area.serviceAreaId}`,
        draft: geometryToDraft(area.geometry),
        tone: "muted",
      });
    }
    for (const policy of stopPolicies.filter((record) => record.status === "active")) {
      items.push({
        id: `policy-${policy.stopPolicyId}`,
        draft: geometryToDraft(policy.geometry),
        tone: recordType === "stop_policy" ? "accent" : "muted",
      });
    }
    items.push({
      id: "draft-target",
      draft: geometryDraft,
      tone: "accent",
    });
    return items;
  }, [geometryDraft, recordType, serviceAreas, stopPolicies]);

  function startCreate(nextType: RecordType = recordType) {
    setRecordType(nextType);
    setSelectedId(null);
    setDraft(buildEmptyDraft());
    setGeometryDraft(createEmptyGeometryDraft("polygon"));
    setReceipt(null);
    setMutationError(null);
  }

  async function saveDraft() {
    if (!geometrySnapshot?.canSubmit || !geometryPayload) {
      setMutationError("Valid polygon or circle geometry is required before saving.");
      return;
    }
    if (geometryModeBlocked) {
      setMutationError(
        "Route corridor authoring is sandbox-only and cannot be saved on this taxi governance route.",
      );
      return;
    }

    setMutationError(null);
    setMutating(true);
    try {
      const selectedBoundary =
        recordType === "service_area" && selectedRecord
          ? (selectedRecord as ServiceAreaBoundaryRecord)
          : null;
      const selectedPolicy =
        recordType === "stop_policy" && selectedRecord
          ? (selectedRecord as StopPolicyRecord)
          : null;

      const response =
        recordType === "service_area"
          ? selectedBoundary
            ? await client.updateServiceAreaBoundary(
                selectedBoundary.serviceAreaId,
                buildBoundaryUpdate(draft, geometryPayload),
              )
            : await client.createServiceAreaBoundary(
                buildBoundaryCreate(draft, geometryPayload),
              )
          : selectedPolicy
            ? await client.updateStopPolicy(
                selectedPolicy.stopPolicyId,
                buildPolicyUpdate(draft, geometryPayload),
              )
            : await client.createStopPolicy(buildPolicyCreate(draft, geometryPayload));

      const nextRecord = response.serviceArea ?? response.stopPolicy ?? null;
      if (nextRecord) {
        setSelectedId(getRecordId(recordType, nextRecord));
        setReceipt(
          buildReceipt(
            response,
            nextRecord,
            selectedRecord ? "update draft" : "create draft",
            publishReason,
          ),
        );
      }
      await loadPage("refresh");
    } catch (saveError) {
      setMutationError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setMutating(false);
    }
  }

  async function runTransition(action: "submit-review" | "publish" | "retire") {
    if (!selectedRecord) {
      setMutationError(`Create a ${labels.singular} before running ${action}.`);
      return;
    }
    if ((action === "publish" || action === "retire") && !publishReason.trim()) {
      setMutationError("Publish and retire require a reason for the audit trail.");
      return;
    }

    setMutationError(null);
    setMutating(true);
    try {
      const selectedBoundary =
        recordType === "service_area"
          ? (selectedRecord as ServiceAreaBoundaryRecord)
          : null;
      const selectedPolicy =
        recordType === "stop_policy"
          ? (selectedRecord as StopPolicyRecord)
          : null;

      const response =
        recordType === "service_area"
          ? action === "submit-review"
            ? await client.submitServiceAreaBoundaryForReview(
                selectedBoundary!.serviceAreaId,
              )
            : action === "publish"
              ? await client.publishServiceAreaBoundary(selectedBoundary!.serviceAreaId, {
                  effectiveFrom: toIsoOrNull(publishEffectiveFrom),
                  effectiveUntil: toIsoOrNull(publishEffectiveUntil),
                  reason: publishReason.trim(),
                })
              : await client.retireServiceAreaBoundary(selectedBoundary!.serviceAreaId, {
                  effectiveUntil: toIsoOrNull(publishEffectiveUntil),
                  reason: publishReason.trim(),
                })
          : action === "submit-review"
            ? await client.submitStopPolicyForReview(selectedPolicy!.stopPolicyId)
            : action === "publish"
              ? await client.publishStopPolicy(selectedPolicy!.stopPolicyId, {
                    effectiveFrom: toIsoOrNull(publishEffectiveFrom),
                    effectiveUntil: toIsoOrNull(publishEffectiveUntil),
                    reason: publishReason.trim(),
                  })
              : await client.retireStopPolicy(selectedPolicy!.stopPolicyId, {
                    effectiveUntil: toIsoOrNull(publishEffectiveUntil),
                    reason: publishReason.trim(),
                  });

      const nextRecord = response.serviceArea ?? response.stopPolicy ?? null;
      if (nextRecord) {
        setReceipt(buildReceipt(response, nextRecord, action, publishReason.trim()));
      }
      await loadPage("refresh");
    } catch (transitionError) {
      setMutationError(
        transitionError instanceof Error
          ? transitionError.message
          : String(transitionError),
      );
    } finally {
      setMutating(false);
    }
  }

  async function runPreview() {
    setEvaluating(true);
    setEvaluationError(null);
    try {
      const command: EvaluateServiceAreaCommand = {
        serviceProductType: evaluationDraft.serviceProductType,
        pickup: {
          lat: Number(evaluationDraft.pickupLat),
          lng: Number(evaluationDraft.pickupLng),
        },
        dropoff:
          evaluationDraft.dropoffLat.trim() && evaluationDraft.dropoffLng.trim()
            ? {
                lat: Number(evaluationDraft.dropoffLat),
                lng: Number(evaluationDraft.dropoffLng),
              }
            : null,
      };
      const result = await client.evaluateServiceArea(command);
      setEvaluation(result);
    } catch (previewError) {
      setEvaluationError(
        previewError instanceof Error ? previewError.message : String(previewError),
      );
    } finally {
      setEvaluating(false);
    }
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <CanvasPageHeader
          title="Service-Area Governance"
          subtitle="Loading service-area boundaries, stop policies, and overlay state."
        />
        <CanvasCard>
          <div style={emptyStateStyle}>Loading governance data...</div>
        </CanvasCard>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        title="Service-Area Governance"
        subtitle="Taxi service-area boundaries, stop policies, draft/review/publish/retire lifecycle, backend-authoritative sample preview, and audit receipt visibility."
      />

      <CanvasBanner
        tone="accent"
        title="Authority split"
        body="This route governs taxi service-area boundaries and stop policies only. Sandbox operating areas and route corridors remain a separate Phase 2 surface."
      />

      {error ? (
        <CanvasBanner
          tone="danger"
          title="Governance data failed to load"
          body={error}
        />
      ) : null}

      <div style={tabRowStyle}>
        <button
          type="button"
          style={tabButtonStyle(recordType === "service_area")}
          onClick={() => startCreate("service_area")}
        >
          Service-area boundaries
        </button>
        <button
          type="button"
          style={tabButtonStyle(recordType === "stop_policy")}
          onClick={() => startCreate("stop_policy")}
        >
          Stop policies
        </button>
        <span style={hintStyle}>
          Definitions {formatDateTime(generatedAt)} · overlay {formatDateTime(overlayGeneratedAt)}
          {refreshing ? " · refreshing" : ""}
        </span>
      </div>

      <div style={twoColumnStyle}>
        <CanvasCard>
          <div style={splitCardStyle}>
            <div style={stackStyle}>
              <div style={tabRowStyle}>
                <CanvasBtn variant="primary" onClick={() => startCreate(recordType)}>
                  New {labels.noun} draft
                </CanvasBtn>
                <CanvasBtn onClick={() => void loadPage("refresh")}>Refresh</CanvasBtn>
              </div>

              <GeometryPreviewSurface
                theme={theme}
                items={previewItems}
                caption="Published overlays plus the current draft target"
              />

              {geometryModeBlocked ? (
                <CanvasBanner
                  tone="warn"
                  title="Sandbox-only geometry mode"
                  body="Route corridor authoring is intentionally blocked here. Switch back to polygon or circle for taxi governance."
                />
              ) : null}

              <GeometryEditor
                theme={theme}
                initialDraft={geometryDraft}
                baselineDraft={geometryToDraft(selectedRecord?.geometry)}
                onChange={setGeometrySnapshot}
                labels={{
                  routeCorridor: "Route corridor (sandbox only)",
                  addHintRoute: "This geometry mode is sandbox-only and cannot be saved on this route.",
                }}
              />
            </div>

            <div style={stackStyle}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Draft editor</h3>
              <div style={fieldGridStyle}>
                <label style={labelStyle}>
                  {labels.code}
                  <input
                    value={draft.code}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, code: event.target.value }))
                    }
                    disabled={Boolean(selectedRecord)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Display name
                  <input
                    value={draft.displayName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Effective from
                  <input
                    type="datetime-local"
                    value={draft.effectiveFrom}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        effectiveFrom: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Effective until
                  <input
                    type="datetime-local"
                    value={draft.effectiveUntil}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        effectiveUntil: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={labelStyle}>
                Service products
                <div style={checklistStyle}>
                  {SERVICE_PRODUCT_TYPES.map((serviceProductType) => {
                    const checked = draft.serviceProductTypes.includes(serviceProductType);
                    return (
                      <label
                        key={serviceProductType}
                        style={{ ...hintStyle, display: "flex", gap: 8 }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              serviceProductTypes: event.target.checked
                                ? [...current.serviceProductTypes, serviceProductType]
                                : current.serviceProductTypes.filter(
                                    (item) => item !== serviceProductType,
                                  ),
                            }))
                          }
                        />
                        <span style={codeStyle}>{serviceProductType}</span>
                      </label>
                    );
                  })}
                </div>
              </label>

              {recordType === "stop_policy" ? (
                <>
                  <div style={fieldGridStyle}>
                    <label style={labelStyle}>
                      Direction
                      <select
                        value={draft.direction}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            direction: event.target.value as StopPolicyDirection,
                          }))
                        }
                        style={inputStyle}
                      >
                        {STOP_POLICY_DIRECTIONS.map((direction) => (
                          <option key={direction} value={direction}>
                            {direction}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Effect
                      <select
                        value={draft.effect}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            effect: event.target.value as StopPolicyEffect,
                          }))
                        }
                        style={inputStyle}
                      >
                        {STOP_POLICY_EFFECTS.map((effect) => (
                          <option key={effect} value={effect}>
                            {effect}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Reason code
                      <input
                        value={draft.reasonCode}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            reasonCode: event.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <label style={labelStyle}>
                    Reason message
                    <textarea
                      value={draft.reasonMessage}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          reasonMessage: event.target.value,
                        }))
                      }
                      style={textareaStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    Bound to service-area codes
                    <div style={checklistStyle}>
                      {serviceAreas.map((area) => {
                        const checked = draft.serviceAreaCodes.includes(area.areaCode);
                        return (
                          <label
                            key={area.serviceAreaId}
                            style={{ ...hintStyle, display: "flex", gap: 8 }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  serviceAreaCodes: event.target.checked
                                    ? [...current.serviceAreaCodes, area.areaCode]
                                    : current.serviceAreaCodes.filter(
                                        (code) => code !== area.areaCode,
                                      ),
                                }))
                              }
                            />
                            <span>
                              <span style={codeStyle}>{area.areaCode}</span>{" "}
                              {area.displayName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </label>
                </>
              ) : null}

              <div style={tabRowStyle}>
                <CanvasBtn
                  variant="primary"
                  onClick={() => void saveDraft()}
                  disabled={mutating || !editable}
                >
                  {selectedRecord ? "Save draft changes" : `Create ${labels.noun} draft`}
                </CanvasBtn>
                {!editable && selectedRecord ? (
                  <span style={hintStyle}>
                    Active and retired records are read-only. Create a new draft to replace them.
                  </span>
                ) : null}
              </div>

              {mutationError ? (
                <CanvasBanner tone="danger" title="Mutation blocked" body={mutationError} />
              ) : null}
            </div>
          </div>
        </CanvasCard>

        <div style={stackStyle}>
          <CanvasCard>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>Version stack</h3>
            <div style={stackStyle}>
              {records.length === 0 ? (
                <div style={emptyStateStyle}>No {labels.plural} configured yet.</div>
              ) : (
                records.map((record) => {
                  const selected =
                    selectedId !== null && getRecordId(recordType, record) === selectedId;
                  return (
                    <button
                      key={getRecordId(recordType, record)}
                      type="button"
                      style={recordButtonStyle(selected)}
                      onClick={() => setSelectedId(getRecordId(recordType, record))}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "start",
                        }}
                      >
                        <strong>{record.displayName}</strong>
                        <CanvasPill tone={statusTone(record.status)}>{record.status}</CanvasPill>
                      </div>
                      <div style={codeStyle}>
                        {getRecordCode(recordType, record)} · v{record.version}
                      </div>
                      {"direction" in record ? (
                        <div style={hintStyle}>
                          {record.direction} · {record.effect}
                        </div>
                      ) : null}
                      <div style={hintStyle}>
                        {formatDateTime(record.effectiveFrom)} →{" "}
                        {record.effectiveUntil
                          ? formatDateTime(record.effectiveUntil)
                          : "open"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CanvasCard>

          <CanvasCard>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>
              Review / publish / retire
            </h3>
            <div style={stackStyle}>
              <label style={labelStyle}>
                Publish effective from
                <input
                  type="datetime-local"
                  value={publishEffectiveFrom}
                  onChange={(event) => setPublishEffectiveFrom(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Publish / retire effective until
                <input
                  type="datetime-local"
                  value={publishEffectiveUntil}
                  onChange={(event) => setPublishEffectiveUntil(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Required reason for publish / retire
                <textarea
                  value={publishReason}
                  onChange={(event) => setPublishReason(event.target.value)}
                  style={textareaStyle}
                />
              </label>
              <div style={hintStyle}>
                Publish is allowed from <span style={codeStyle}>draft</span> or{" "}
                <span style={codeStyle}>review</span>. Retire stamps the effective
                end date and makes the evaluator use the new active set.
              </div>
              <div style={tabRowStyle}>
                <CanvasBtn
                  onClick={() => void runTransition("submit-review")}
                  disabled={mutating || !selectedRecord || !editable}
                >
                  Submit review
                </CanvasBtn>
                <CanvasBtn
                  variant="primary"
                  onClick={() => void runTransition("publish")}
                  disabled={mutating || !selectedRecord}
                >
                  Publish
                </CanvasBtn>
                <CanvasBtn
                  danger
                  onClick={() => void runTransition("retire")}
                  disabled={mutating || !selectedRecord || selectedRecord.status !== "active"}
                >
                  Retire
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>Audit visibility</h3>
            {receipt ? (
              <div style={stackStyle}>
                <div style={fieldGridStyle}>
                  <div>
                    <div style={hintStyle}>Actor</div>
                    <div style={codeStyle}>{receipt.actorId}</div>
                  </div>
                  <div>
                    <div style={hintStyle}>Audit ID</div>
                    <div style={codeStyle}>{receipt.auditId ?? "pending"}</div>
                  </div>
                  <div>
                    <div style={hintStyle}>Version</div>
                    <div style={codeStyle}>v{receipt.version}</div>
                  </div>
                  <div>
                    <div style={hintStyle}>Status</div>
                    <CanvasPill tone={statusTone(receipt.status)}>{receipt.status}</CanvasPill>
                  </div>
                  {receipt.direction ? (
                    <div>
                      <div style={hintStyle}>Direction</div>
                      <div style={codeStyle}>{receipt.direction}</div>
                    </div>
                  ) : null}
                  {receipt.effect ? (
                    <div>
                      <div style={hintStyle}>Effect</div>
                      <div style={codeStyle}>{receipt.effect}</div>
                    </div>
                  ) : null}
                  <div>
                    <div style={hintStyle}>Effective date</div>
                    <div style={codeStyle}>
                      {formatDateTime(receipt.effectiveFrom)} →{" "}
                      {receipt.effectiveUntil
                        ? formatDateTime(receipt.effectiveUntil)
                        : "open"}
                    </div>
                  </div>
                </div>
                <div style={hintStyle}>
                  {receipt.action} · {receipt.recordLabel} · reason:{" "}
                  {receipt.reason || "n/a"} · generated {formatDateTime(receipt.generatedAt)}
                </div>
              </div>
            ) : (
              <div style={emptyStateStyle}>
                Execute a create/update/review/publish/retire action to surface the
                latest audit receipt here.
              </div>
            )}
          </CanvasCard>
        </div>
      </div>

      <CanvasCard>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>
          Affected sample preview
        </h3>
        <div style={fieldGridStyle}>
          <label style={labelStyle}>
            Service product
            <select
              value={evaluationDraft.serviceProductType}
              onChange={(event) =>
                setEvaluationDraft((current) => ({
                  ...current,
                  serviceProductType: event.target.value as ServiceProductType,
                }))
              }
              style={inputStyle}
            >
              {SERVICE_PRODUCT_TYPES.map((serviceProductType) => (
                <option key={serviceProductType} value={serviceProductType}>
                  {serviceProductType}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Pickup lat
            <input
              value={evaluationDraft.pickupLat}
              onChange={(event) =>
                setEvaluationDraft((current) => ({
                  ...current,
                  pickupLat: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Pickup lng
            <input
              value={evaluationDraft.pickupLng}
              onChange={(event) =>
                setEvaluationDraft((current) => ({
                  ...current,
                  pickupLng: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Dropoff lat
            <input
              value={evaluationDraft.dropoffLat}
              onChange={(event) =>
                setEvaluationDraft((current) => ({
                  ...current,
                  dropoffLat: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Dropoff lng
            <input
              value={evaluationDraft.dropoffLng}
              onChange={(event) =>
                setEvaluationDraft((current) => ({
                  ...current,
                  dropoffLng: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ ...tabRowStyle, marginTop: 12 }}>
          <CanvasBtn variant="primary" onClick={() => void runPreview()} disabled={evaluating}>
            {evaluating ? "Evaluating..." : "Run backend preview"}
          </CanvasBtn>
          <span style={hintStyle}>
            Backend evaluation is authoritative. This route only surfaces the result for operator-entered samples.
          </span>
        </div>
        {evaluationError ? (
          <CanvasBanner tone="danger" title="Preview failed" body={evaluationError} />
        ) : null}
        {evaluation ? (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div style={tabRowStyle}>
              <CanvasPill tone={decisionTone(evaluation.decision)}>
                {evaluation.decision}
              </CanvasPill>
              <span style={hintStyle}>
                Evaluated {formatDateTime(evaluation.evaluatedAt)} · geometry refs{" "}
                <span style={codeStyle}>
                  {evaluation.geometryVersionRefs.join(", ") || "none"}
                </span>
              </span>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Stop</th>
                  <th style={thStyle}>Decision</th>
                  <th style={thStyle}>Policy codes</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Service areas</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.stops.map((stop) => (
                  <tr key={`${stop.kind}-${stop.location.lat}-${stop.location.lng}`}>
                    <td style={tdStyle}>
                      <div>{stop.kind}</div>
                      <div style={codeStyle}>
                        {stop.location.lat}, {stop.location.lng}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <CanvasPill tone={decisionTone(stop.decision)}>
                        {stop.decision}
                      </CanvasPill>
                    </td>
                    <td style={tdStyle}>
                      <span style={codeStyle}>{stop.policyCodes.join(", ") || "none"}</span>
                    </td>
                    <td style={tdStyle}>{stop.reasonMessages.join("; ") || "—"}</td>
                    <td style={tdStyle}>
                      <span style={codeStyle}>
                        {stop.serviceAreaCodes.join(", ") || "none"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CanvasCard>
    </div>
  );
}
