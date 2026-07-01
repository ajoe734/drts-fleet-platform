"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ServiceAreaGeometryEditor } from "@/components/service-area-geometry-editor";
import { usePlatformAdminClient } from "@/lib/admin-client";
import {
  buildAffectedEvaluationSamples,
  getGeometryVersionRef,
  getServiceAreaGovernanceRecordCode,
  getServiceAreaGovernanceRecordId,
  summarizeServiceAreaEvaluationResults,
  validateServiceAreaGeometry,
  type AffectedEvaluationSample,
  type EvaluationPreviewSummary,
} from "@/lib/service-area-governance";
import type {
  ServiceAreaAdminMutationResponse,
  ServiceAreaBoundaryRecord,
  ServiceAreaEvaluationResult,
  ServiceAreaGeometry,
  ServiceAreaGeoJsonFeature,
  ServiceAreaGeoJsonResponse,
  ServiceAreaRecordStatus,
  ServiceProductType,
  StopPolicyEffect,
  StopPolicyRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  color: theme.text,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const helpStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
};

const monoBlockStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 160,
  resize: "vertical",
  fontFamily: theme.monoFamily,
  lineHeight: 1.45,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

type Selection =
  | { kind: "service_area"; id: string }
  | { kind: "stop_policy"; id: string };

type BoundaryRow = Record<string, unknown> & {
  id: string;
  areaCode: string;
  displayName: string;
  status: ServiceAreaRecordStatus;
  products: string;
  effective: string;
  versionRef: string;
  _selected?: boolean;
};

type StopPolicyRow = Record<string, unknown> & {
  id: string;
  policyCode: string;
  displayName: string;
  status: ServiceAreaRecordStatus;
  direction: string;
  effect: StopPolicyEffect;
  serviceAreas: string;
  effective: string;
  versionRef: string;
  _selected?: boolean;
};

type ImportedFeatureKind = "service_area" | "stop_policy";

type PreviewSampleResult = {
  sample: AffectedEvaluationSample;
  result: ServiceAreaEvaluationResult;
};

type AffectedPreviewProof = {
  selectionKey: string;
  checkedAt: string;
  samples: PreviewSampleResult[];
  summary: EvaluationPreviewSummary;
};

function statusTone(
  status: ServiceAreaRecordStatus,
): "success" | "neutral" | "warn" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "review":
      return "warn";
    case "retired":
      return "danger";
    default:
      return "neutral";
  }
}

function effectTone(effect: StopPolicyEffect) {
  switch (effect) {
    case "deny":
      return "danger";
    case "manual_review":
      return "warn";
    default:
      return "success";
  }
}

function effectiveWindow(record: {
  effectiveFrom: string;
  effectiveUntil: string | null;
}) {
  return `${record.effectiveFrom.slice(0, 10)} -> ${
    record.effectiveUntil?.slice(0, 10) ?? "open"
  }`;
}

function versionRef(prefix: string, code: string, version: number) {
  return `${prefix}:${code}@v${version}`;
}

function productLabel(products: ServiceProductType[]) {
  return products.join(" / ");
}

function shorten(value: string, max = 34) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isFeatureCollection(
  value: unknown,
): value is ServiceAreaGeoJsonResponse {
  const candidate = value as Partial<ServiceAreaGeoJsonResponse> | null;
  return (
    Boolean(candidate) &&
    candidate?.type === "FeatureCollection" &&
    Array.isArray(candidate.features)
  );
}

function findImportFeature(
  text: string,
  kind: ImportedFeatureKind,
): ServiceAreaGeoJsonFeature {
  const parsed = JSON.parse(text) as unknown;
  if (!isFeatureCollection(parsed)) {
    throw new Error("Import must be a ServiceArea FeatureCollection.");
  }
  const feature = parsed.features.find(
    (candidate) => candidate.properties.recordKind === kind,
  );
  if (!feature) {
    throw new Error(`No ${kind} feature found in import payload.`);
  }
  return feature;
}

export default function ServiceAreaGovernancePage() {
  const client = usePlatformAdminClient();
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaBoundaryRecord[]>(
    [],
  );
  const [stopPolicies, setStopPolicies] = useState<StopPolicyRecord[]>([]);
  const [geoJson, setGeoJson] = useState<ServiceAreaGeoJsonResponse | null>(
    null,
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [reason, setReason] = useState("");
  const [importText, setImportText] = useState("");
  const [draftGeometry, setDraftGeometry] =
    useState<ServiceAreaGeometry | null>(null);
  const [affectedPreview, setAffectedPreview] =
    useState<AffectedPreviewProof | null>(null);
  const [lastMutationReceipt, setLastMutationReceipt] =
    useState<ServiceAreaAdminMutationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [definitionsResult, geoJsonResult] = await Promise.all([
        client.getServiceAreaDefinitions(),
        client.getServiceAreaGeoJson(),
      ]);
      setServiceAreas(definitionsResult.serviceAreas ?? []);
      setStopPolicies(definitionsResult.stopPolicies ?? []);
      setGeoJson(geoJsonResult);
      setImportText(JSON.stringify(geoJsonResult, null, 2));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRecord = useMemo(() => {
    if (!selection) {
      return null;
    }
    return selection.kind === "service_area"
      ? (serviceAreas.find((record) => record.serviceAreaId === selection.id) ??
          null)
      : (stopPolicies.find((record) => record.stopPolicyId === selection.id) ??
          null);
  }, [selection, serviceAreas, stopPolicies]);

  useEffect(() => {
    setDraftGeometry(
      selectedRecord ? cloneGeometry(selectedRecord.geometry) : null,
    );
    setAffectedPreview(null);
  }, [selection?.id, selection?.kind, selectedRecord?.version]);

  useEffect(() => {
    setLastMutationReceipt(null);
  }, [selection?.id, selection?.kind]);

  const selectedRecordKey = selectedRecord
    ? `${selection?.kind ?? "record"}:${getServiceAreaGovernanceRecordId(
        selectedRecord,
      )}:${selectedRecord.version}`
    : "";

  const draftGeometryErrors = useMemo(
    () => validateServiceAreaGeometry(draftGeometry),
    [draftGeometry],
  );

  const hasUnsavedGeometryDraft =
    Boolean(selectedRecord && draftGeometry) &&
    JSON.stringify(selectedRecord?.geometry) !== JSON.stringify(draftGeometry);

  const hasFreshAffectedPreview =
    Boolean(affectedPreview) &&
    affectedPreview?.selectionKey === selectedRecordKey &&
    affectedPreview.summary.total > 0;

  const boundaryRows = useMemo<BoundaryRow[]>(
    () =>
      serviceAreas.map((record) => ({
        id: record.serviceAreaId,
        areaCode: record.areaCode,
        displayName: record.displayName,
        status: record.status,
        products: productLabel(record.serviceProductTypes),
        effective: effectiveWindow(record),
        versionRef: versionRef("svc_area", record.areaCode, record.version),
        _selected:
          selection?.kind === "service_area" &&
          selection.id === record.serviceAreaId,
      })),
    [serviceAreas, selection],
  );

  const stopPolicyRows = useMemo<StopPolicyRow[]>(
    () =>
      stopPolicies.map((record) => ({
        id: record.stopPolicyId,
        policyCode: record.policyCode,
        displayName: record.displayName,
        status: record.status,
        direction: record.direction,
        effect: record.effect,
        serviceAreas: record.serviceAreaCodes.join(" / "),
        effective: effectiveWindow(record),
        versionRef: versionRef(
          "stop_policy",
          record.policyCode,
          record.version,
        ),
        _selected:
          selection?.kind === "stop_policy" &&
          selection.id === record.stopPolicyId,
      })),
    [stopPolicies, selection],
  );

  const validationSummary = useMemo(() => {
    const activeAreaCodes = new Set(
      serviceAreas
        .filter((record) => record.status === "active")
        .map((record) => record.areaCode),
    );
    const orphanPolicies = stopPolicies.filter((policy) =>
      policy.serviceAreaCodes.every((code) => !activeAreaCodes.has(code)),
    );
    const draftCount =
      serviceAreas.filter((record) => record.status === "draft").length +
      stopPolicies.filter((record) => record.status === "draft").length;
    const reviewCount =
      serviceAreas.filter((record) => record.status === "review").length +
      stopPolicies.filter((record) => record.status === "review").length;

    return {
      activeAreaCodes,
      orphanPolicies,
      draftCount,
      reviewCount,
      featureCount: geoJson?.features.length ?? 0,
    };
  }, [serviceAreas, stopPolicies, geoJson]);

  const boundaryColumns = useMemo<CanvasTableColumn<BoundaryRow>[]>(
    () => [
      {
        h: "Boundary",
        w: 210,
        r: (row) => (
          <button
            type="button"
            data-testid={`service-area-row-${row.areaCode}`}
            onClick={() => setSelection({ kind: "service_area", id: row.id })}
            style={{
              border: 0,
              padding: 0,
              background: "transparent",
              color: theme.accent,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {row.displayName}
          </button>
        ),
      },
      { h: "Area code", k: "areaCode", w: 150, mono: true },
      {
        h: "Lifecycle",
        w: 110,
        r: (row) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {row.status}
          </CanvasPill>
        ),
      },
      { h: "Effective", k: "effective", w: 180, mono: true },
      { h: "Version ref", k: "versionRef", w: 170, mono: true },
      { h: "Products", k: "products", w: 220 },
    ],
    [],
  );

  const stopPolicyColumns = useMemo<CanvasTableColumn<StopPolicyRow>[]>(
    () => [
      {
        h: "Policy",
        w: 220,
        r: (row) => (
          <button
            type="button"
            data-testid={`stop-policy-row-${row.policyCode}`}
            onClick={() => setSelection({ kind: "stop_policy", id: row.id })}
            style={{
              border: 0,
              padding: 0,
              background: "transparent",
              color: theme.accent,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {row.displayName}
          </button>
        ),
      },
      { h: "Policy code", k: "policyCode", w: 170, mono: true },
      {
        h: "Lifecycle",
        w: 110,
        r: (row) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {row.status}
          </CanvasPill>
        ),
      },
      { h: "Direction", k: "direction", w: 90 },
      {
        h: "Effect",
        w: 120,
        r: (row) => (
          <CanvasPill theme={theme} tone={effectTone(row.effect)} dot>
            {row.effect}
          </CanvasPill>
        ),
      },
      { h: "Effective", k: "effective", w: 180, mono: true },
      { h: "Version ref", k: "versionRef", w: 185, mono: true },
      { h: "Areas", k: "serviceAreas", w: 160, mono: true },
    ],
    [],
  );

  const runAction = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(label);
      setError(null);
      setNotice(null);
      try {
        const result = await action();
        if (isMutationResponse(result)) {
          setLastMutationReceipt(result);
        }
        setNotice(`${label} completed. Refreshed governance definitions.`);
        await load();
      } catch (actionError: unknown) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : String(actionError),
        );
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const requireSelectionAndReason = useCallback(() => {
    if (!selection || !selectedRecord) {
      throw new Error("Select a boundary or stop policy first.");
    }
    if (!reason.trim()) {
      throw new Error("Audit reason is required for lifecycle changes.");
    }
    return { selection, selectedRecord };
  }, [selection, selectedRecord, reason]);

  const submitReview = useCallback(async () => {
    const current = requireSelectionAndReason();
    if (current.selectedRecord.status !== "draft") {
      throw new Error("Only draft records can be submitted for review.");
    }
    if (hasUnsavedGeometryDraft) {
      throw new Error(
        "Save the GeometryEditor draft before submitting review.",
      );
    }
    if (current.selection.kind === "service_area") {
      return await client.submitServiceAreaBoundaryForReview(
        current.selection.id,
      );
    } else {
      return await client.submitStopPolicyForReview(current.selection.id);
    }
  }, [client, hasUnsavedGeometryDraft, requireSelectionAndReason]);

  const publish = useCallback(async () => {
    const current = requireSelectionAndReason();
    if (!["draft", "review"].includes(current.selectedRecord.status)) {
      throw new Error("Only draft or review records can be published.");
    }
    if (draftGeometryErrors.length) {
      throw new Error(
        "Resolve GeometryEditor validation errors before publish.",
      );
    }
    if (hasUnsavedGeometryDraft) {
      throw new Error("Save the GeometryEditor draft before publish.");
    }
    if (!hasFreshAffectedPreview) {
      throw new Error(
        "Run affected sample preview before publish so evaluator/version refs are visible.",
      );
    }
    const command = {
      effectiveFrom: effectiveFrom || null,
      effectiveUntil: effectiveUntil || null,
      reason,
    };
    if (current.selection.kind === "service_area") {
      return await client.publishServiceAreaBoundary(
        current.selection.id,
        command,
      );
    } else {
      return await client.publishStopPolicy(current.selection.id, command);
    }
  }, [
    client,
    draftGeometryErrors.length,
    effectiveFrom,
    effectiveUntil,
    hasFreshAffectedPreview,
    hasUnsavedGeometryDraft,
    reason,
    requireSelectionAndReason,
  ]);

  const retire = useCallback(async () => {
    const current = requireSelectionAndReason();
    if (current.selectedRecord.status !== "active") {
      throw new Error("Only active records can be retired.");
    }
    const command = { effectiveUntil: effectiveUntil || null, reason };
    if (current.selection.kind === "service_area") {
      return await client.retireServiceAreaBoundary(
        current.selection.id,
        command,
      );
    } else {
      return await client.retireStopPolicy(current.selection.id, command);
    }
  }, [client, effectiveUntil, reason, requireSelectionAndReason]);

  const saveGeometry = useCallback(async () => {
    const current = requireSelectionAndReason();
    if (!draftGeometry) {
      throw new Error("No GeometryEditor draft is loaded.");
    }
    if (draftGeometryErrors.length) {
      throw new Error("Resolve GeometryEditor validation errors before save.");
    }
    if (["active", "retired"].includes(current.selectedRecord.status)) {
      throw new Error(
        "Only draft or review records can save geometry changes.",
      );
    }
    const metadata = {
      ...(current.selectedRecord.metadata ?? {}),
      geometryEditor: "platform-admin-web",
      geometryEditorReason: reason,
      previousGeometryVersionRef: getGeometryVersionRef(current.selectedRecord),
    };
    if (current.selection.kind === "service_area") {
      return await client.updateServiceAreaBoundary(current.selection.id, {
        geometry: draftGeometry,
        metadata,
      });
    }
    return await client.updateStopPolicy(current.selection.id, {
      geometry: draftGeometry,
      metadata,
    });
  }, [
    client,
    draftGeometry,
    draftGeometryErrors.length,
    reason,
    requireSelectionAndReason,
  ]);

  const runAffectedPreview = useCallback(async () => {
    if (!selectedRecord) {
      setError("Select a boundary or stop policy before preview.");
      return;
    }
    if (draftGeometryErrors.length) {
      setError("Resolve GeometryEditor validation errors before preview.");
      return;
    }
    if (hasUnsavedGeometryDraft) {
      setError("Save the GeometryEditor draft before preview.");
      return;
    }

    setBusy("Affected preview");
    setError(null);
    setNotice(null);
    try {
      const samples = buildAffectedEvaluationSamples(selectedRecord, {
        requestedAt: effectiveFrom || selectedRecord.effectiveFrom,
      });
      const results = await Promise.all(
        samples.map(async (sample) => ({
          sample,
          result: await client.evaluateServiceArea(sample.command),
        })),
      );
      const summary = summarizeServiceAreaEvaluationResults(
        results.map((entry) => entry.result),
      );
      setAffectedPreview({
        selectionKey: selectedRecordKey,
        checkedAt: new Date().toISOString(),
        samples: results,
        summary,
      });
      setNotice(
        "Affected sample preview completed. Publish gate is now armed.",
      );
    } catch (previewError: unknown) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : String(previewError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    client,
    draftGeometryErrors.length,
    effectiveFrom,
    hasUnsavedGeometryDraft,
    selectedRecord,
    selectedRecordKey,
  ]);

  const createDraftFromImport = useCallback(
    async (kind: ImportedFeatureKind) => {
      if (!reason.trim()) {
        throw new Error("Audit reason is required before importing a draft.");
      }
      const feature = findImportFeature(importText, kind);
      const suffix = Date.now().toString(36).toUpperCase();
      if (feature.properties.recordKind === "service_area") {
        await client.createServiceAreaBoundary({
          areaCode: `${feature.properties.areaCode}_DRAFT_${suffix}`,
          displayName: `${feature.properties.displayName} draft`,
          geometry: feature.properties.sourceGeometry,
          serviceProductTypes: feature.properties.serviceProductTypes,
          effectiveFrom: effectiveFrom || null,
          effectiveUntil: effectiveUntil || null,
          metadata: {
            importedFromGeometryVersionRef:
              feature.properties.geometryVersionRef,
            importReason: reason,
            source: "platform-admin-web",
          },
        });
      } else {
        await client.createStopPolicy({
          policyCode: `${feature.properties.policyCode}_DRAFT_${suffix}`,
          displayName: `${feature.properties.displayName} draft`,
          direction: feature.properties.direction,
          effect: feature.properties.effect,
          geometry: feature.properties.sourceGeometry,
          serviceAreaCodes: feature.properties.serviceAreaCodes,
          serviceProductTypes: feature.properties.serviceProductTypes,
          reasonCode: feature.properties.reasonCode,
          reasonMessage: feature.properties.reasonMessage,
          effectiveFrom: effectiveFrom || null,
          effectiveUntil: effectiveUntil || null,
          metadata: {
            importedFromGeometryVersionRef:
              feature.properties.geometryVersionRef,
            importReason: reason,
            source: "platform-admin-web",
          },
        });
      }
    },
    [client, effectiveFrom, effectiveUntil, importText, reason],
  );

  const downloadGeoJson = useCallback(() => {
    if (!geoJson) {
      setError("No GeoJSON export is loaded yet.");
      return;
    }
    const blob = new Blob([JSON.stringify(geoJson, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `service-area-governance-${geoJson.generatedAt.slice(
      0,
      10,
    )}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [geoJson]);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="Service Area Governance"
        subtitle="Platform Admin authority for taxi service areas, no-pickup policies, review gates, versions, and effective windows"
        tabs={[
          `Boundaries (${serviceAreas.length})`,
          `Stop policies (${stopPolicies.length})`,
          `GeoJSON (${validationSummary.featureCount})`,
          "Audit / versions",
        ]}
        actions={
          <>
            <CanvasBtn theme={theme} onClick={() => void load()}>
              Refresh
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              onClick={downloadGeoJson}
            >
              Export GeoJSON
            </CanvasBtn>
          </>
        }
      />
      <div
        style={pageBodyStyle}
        data-testid="service-area-governance-page"
        data-map-fe-adm-001-route="/service-areas"
      >
        <CanvasBanner
          theme={theme}
          tone="warn"
          title="Authority boundary"
          body="Taxi service-area and stop-policy governance is owned here. Phase2 sandbox operating areas/routes remain read-only in the sandbox program surfaces and must not be mixed with taxi service-area authority."
        />

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title="Service-area governance action failed"
            body={error}
          />
        ) : null}
        {notice ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            title="Saved"
            body={notice}
          />
        ) : null}

        <div style={kpiGridStyle} data-testid="service-area-governance-summary">
          <SummaryCard label="Boundaries" value={serviceAreas.length} />
          <SummaryCard label="Stop policies" value={stopPolicies.length} />
          <SummaryCard
            label="Draft / review"
            value={`${validationSummary.draftCount} / ${validationSummary.reviewCount}`}
          />
          <SummaryCard
            label="GeoJSON features"
            value={validationSummary.featureCount}
          />
        </div>

        <div style={gridStyle}>
          <section
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div data-testid="service-area-boundary-table">
              <CanvasCard
                theme={theme}
                title="Boundary lifecycle"
                subtitle="Draft, review, active, retired status with effective windows and geometry version refs."
                padding={0}
              >
                {loading ? (
                  <div style={{ padding: 16, color: theme.textMuted }}>
                    Loading service-area governance…
                  </div>
                ) : (
                  <CanvasTable
                    theme={theme}
                    columns={boundaryColumns}
                    rows={boundaryRows}
                  />
                )}
              </CanvasCard>
            </div>

            <div data-testid="service-area-stop-policy-table">
              <CanvasCard
                theme={theme}
                title="Stop-policy lifecycle"
                subtitle="Pickup/dropoff/both policy effects for deny, allow, and manual-review controls."
                padding={0}
              >
                {loading ? (
                  <div style={{ padding: 16, color: theme.textMuted }}>
                    Loading stop policies…
                  </div>
                ) : (
                  <CanvasTable
                    theme={theme}
                    columns={stopPolicyColumns}
                    rows={stopPolicyRows}
                  />
                )}
              </CanvasCard>
            </div>
          </section>

          <section
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <CanvasCard
              theme={theme}
              title="Lifecycle controls"
              subtitle="Reason-gated publish/retire controls use service-area admin endpoints."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
                data-testid="service-area-lifecycle-controls"
                data-selected-record={selection?.id ?? ""}
              >
                <div style={helpStyle}>
                  Selected:{" "}
                  <strong>
                    {selectedRecord
                      ? shorten(
                          "areaCode" in selectedRecord
                            ? selectedRecord.areaCode
                            : selectedRecord.policyCode,
                        )
                      : "none"}
                  </strong>
                  {selectedRecord ? ` · ${selectedRecord.status}` : ""}
                </div>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Effective from override</span>
                  <input
                    style={inputStyle}
                    value={effectiveFrom}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                    placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
                    data-testid="service-area-effective-from"
                  />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>
                    Effective until / retire cutoff
                  </span>
                  <input
                    style={inputStyle}
                    value={effectiveUntil}
                    onChange={(event) => setEffectiveUntil(event.target.value)}
                    placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
                    data-testid="service-area-effective-until"
                  />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Audit reason required</span>
                  <textarea
                    style={{ ...inputStyle, minHeight: 72 }}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Policy board approval, curb authority notice, or operational safety reason."
                    data-testid="service-area-audit-reason"
                  />
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <CanvasBtn
                    theme={theme}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void runAction("Submit review", () => submitReview())
                    }
                  >
                    Submit review
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={Boolean(busy)}
                    onClick={() => void runAction("Publish", () => publish())}
                  >
                    Publish
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    danger
                    disabled={Boolean(busy)}
                    onClick={() => void runAction("Retire", () => retire())}
                  >
                    Retire
                  </CanvasBtn>
                </div>
                <div style={helpStyle} data-testid="service-area-action-state">
                  {busy
                    ? `Running ${busy}…`
                    : "Ready. Backend validation enforces lifecycle status and overlapping effective windows."}
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="GeometryEditor"
              subtitle="Edit governed polygon/circle geometry before review or publish. Active/retired records stay read-only; create a new draft for changes."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
                data-testid="service-area-geometry-editor-panel"
                data-selected-record-code={
                  selectedRecord
                    ? getServiceAreaGovernanceRecordCode(selectedRecord)
                    : ""
                }
                data-unsaved-geometry-draft={
                  hasUnsavedGeometryDraft ? "true" : "false"
                }
              >
                {selectedRecord && draftGeometry ? (
                  <>
                    <ServiceAreaGeometryEditor
                      theme={theme}
                      value={draftGeometry}
                      onChange={(nextGeometry) => {
                        setDraftGeometry(nextGeometry);
                        setAffectedPreview(null);
                      }}
                      disabled={["active", "retired"].includes(
                        selectedRecord.status,
                      )}
                      recordLabel={getServiceAreaGovernanceRecordCode(
                        selectedRecord,
                      )}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <CanvasBtn
                        theme={theme}
                        disabled={
                          Boolean(busy) ||
                          !hasUnsavedGeometryDraft ||
                          ["active", "retired"].includes(selectedRecord.status)
                        }
                        onClick={() =>
                          void runAction("Save geometry", () => saveGeometry())
                        }
                      >
                        Save GeometryEditor draft
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        variant="ghost"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setDraftGeometry(
                            cloneGeometry(selectedRecord.geometry),
                          );
                          setAffectedPreview(null);
                        }}
                      >
                        Reset to saved geometry
                      </CanvasBtn>
                    </div>
                  </>
                ) : (
                  <div style={helpStyle}>
                    Select a boundary or stop policy to load governed geometry.
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Affected sample preview"
              subtitle="Evaluator proof required before publish: sample pickup/dropoff points must show decision, policy reason, and geometry version refs."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
                data-testid="service-area-affected-preview"
                data-preview-state={
                  affectedPreview
                    ? affectedPreview.selectionKey === selectedRecordKey
                      ? "fresh"
                      : "stale"
                    : "missing"
                }
                data-preview-total={affectedPreview?.summary.total ?? 0}
                data-preview-blocked={affectedPreview?.summary.blocked ?? 0}
                data-preview-manual-review={
                  affectedPreview?.summary.manualReview ?? 0
                }
                data-preview-serviceable={
                  affectedPreview?.summary.serviceable ?? 0
                }
                data-preview-version-refs={
                  affectedPreview?.summary.versionRefs.join(",") ?? ""
                }
                data-preview-reason-codes={
                  affectedPreview?.summary.reasonCodes.join(",") ?? ""
                }
              >
                <div style={helpStyle}>
                  Publish is blocked until this preview is fresh for the
                  selected record/version. The preview calls the backend
                  service-area evaluator instead of trusting UI geometry alone.
                </div>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={Boolean(busy) || !selectedRecord}
                  onClick={() => void runAffectedPreview()}
                >
                  Run affected sample preview
                </CanvasBtn>
                {affectedPreview ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 8,
                      }}
                    >
                      <SummaryCard
                        label="Samples"
                        value={affectedPreview.summary.total}
                      />
                      <SummaryCard
                        label="Blocked"
                        value={affectedPreview.summary.blocked}
                      />
                      <SummaryCard
                        label="Manual review"
                        value={affectedPreview.summary.manualReview}
                      />
                      <SummaryCard
                        label="Serviceable"
                        value={affectedPreview.summary.serviceable}
                      />
                    </div>
                    <div
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {affectedPreview.samples.map(({ sample, result }) => (
                        <div
                          key={sample.sampleId}
                          style={{
                            borderBottom: `1px solid ${theme.border}`,
                            display: "grid",
                            gridTemplateColumns:
                              "minmax(150px, 1fr) minmax(120px, 0.8fr) minmax(180px, 1fr)",
                            gap: 8,
                            padding: 10,
                          }}
                          data-testid={`service-area-affected-sample-${sample.sampleId}`}
                          data-evaluator-decision={result.decision}
                          data-geometry-version-refs={result.geometryVersionRefs.join(
                            ",",
                          )}
                          data-reason-codes={result.reasonCodes.join(",")}
                        >
                          <div>
                            <strong>{sample.label}</strong>
                            <div style={helpStyle}>
                              {sample.targetVersionRef}
                            </div>
                          </div>
                          <CanvasPill
                            theme={theme}
                            tone={decisionTone(result.decision)}
                            dot
                          >
                            {result.decision}
                          </CanvasPill>
                          <div
                            style={{
                              ...helpStyle,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            refs:{" "}
                            {result.geometryVersionRefs.join(" / ") || "none"}
                            <br />
                            reasons: {result.reasonCodes.join(" / ") || "none"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={helpStyle}>
                    No evaluator preview yet. Select a record and run preview.
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="GeoJSON import / export"
              subtitle="Import creates a draft from an exported feature. Backend publish remains explicit."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
                data-testid="service-area-geojson-panel"
                data-geojson-feature-count={validationSummary.featureCount}
              >
                <textarea
                  style={monoBlockStyle}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  spellCheck={false}
                  data-testid="service-area-geojson-import"
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CanvasBtn
                    theme={theme}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void runAction("Import boundary draft", () =>
                        createDraftFromImport("service_area"),
                      )
                    }
                  >
                    Import boundary draft
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void runAction("Import stop-policy draft", () =>
                        createDraftFromImport("stop_policy"),
                      )
                    }
                  >
                    Import stop-policy draft
                  </CanvasBtn>
                </div>
                <div style={helpStyle}>
                  Validation: {validationSummary.featureCount} export features,
                  {validationSummary.orphanPolicies.length} policy area-code
                  warnings. Draft import does not auto-publish.
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Audit / version summary"
              subtitle="Gate B locator for lifecycle evidence and remaining live-E2E work."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                data-testid="service-area-audit-version-summary"
                data-service-area-version-refs={boundaryRows
                  .map((row) => row.versionRef)
                  .join(",")}
                data-stop-policy-version-refs={stopPolicyRows
                  .map((row) => row.versionRef)
                  .join(",")}
              >
                <VersionLine
                  label="Latest export"
                  value={geoJson?.generatedAt ?? "not loaded"}
                />
                <VersionLine
                  label="Active area codes"
                  value={
                    [...validationSummary.activeAreaCodes].join(" / ") || "none"
                  }
                />
                <VersionLine
                  label="Mutation audit"
                  value={
                    lastMutationReceipt?.auditId ??
                    "No mutation receipt captured in this session."
                  }
                />
                <VersionLine
                  label="Evaluator proof"
                  value={
                    affectedPreview
                      ? `${affectedPreview.summary.total} samples · refs ${affectedPreview.summary.versionRefs.join(
                          " / ",
                        )}`
                      : "Run affected sample preview before publish."
                  }
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Mutation receipt"
              subtitle="Backend audit receipt for publish, retire, review submit, geometry save, or draft import."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                data-testid="service-area-mutation-receipt"
                data-audit-id={lastMutationReceipt?.auditId ?? ""}
                data-mutation-generated-at={
                  lastMutationReceipt?.generatedAt ?? ""
                }
                data-mutation-record-id={
                  lastMutationReceipt
                    ? getMutationRecordId(lastMutationReceipt)
                    : ""
                }
                data-mutation-version-ref={
                  lastMutationReceipt
                    ? getMutationVersionRef(lastMutationReceipt)
                    : ""
                }
              >
                {lastMutationReceipt ? (
                  <>
                    <VersionLine
                      label="Audit ID"
                      value={lastMutationReceipt.auditId ?? "not returned"}
                    />
                    <VersionLine
                      label="Generated"
                      value={lastMutationReceipt.generatedAt}
                    />
                    <VersionLine
                      label="Record"
                      value={getMutationRecordLabel(lastMutationReceipt)}
                    />
                    <VersionLine
                      label="Version ref"
                      value={getMutationVersionRef(lastMutationReceipt)}
                    />
                  </>
                ) : (
                  <div style={helpStyle}>
                    No mutation receipt yet. Lifecycle actions display audit IDs
                    and version refs here after the backend responds.
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Sandbox operating-area boundary"
              subtitle="Read-only separation from taxi service-area authority."
            >
              <div
                style={helpStyle}
                data-testid="service-area-sandbox-boundary-warning"
                data-sandbox-operating-areas-owned-by="/sandbox"
              >
                Phase2 sandbox operating areas/routes govern AV experiment
                authorization only. Do not use those records to publish taxi
                service-area or no-pickup policy.
              </div>
            </CanvasCard>
          </section>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <CanvasCard theme={theme} padding={12}>
      <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          color: theme.text,
          fontFamily: theme.monoFamily,
          fontSize: 24,
          fontWeight: 800,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </CanvasCard>
  );
}

function VersionLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 1fr)",
        gap: 10,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: theme.textMuted, fontWeight: 700 }}>{label}</span>
      <span style={{ color: theme.text, fontFamily: theme.monoFamily }}>
        {value}
      </span>
    </div>
  );
}

function cloneGeometry(geometry: ServiceAreaGeometry): ServiceAreaGeometry {
  return geometry.type === "circle"
    ? {
        type: "circle",
        center: { ...geometry.center },
        radiusMeters: geometry.radiusMeters,
      }
    : {
        type: "polygon",
        coordinates: geometry.coordinates.map((point) => ({ ...point })),
      };
}

function isMutationResponse(
  value: unknown,
): value is ServiceAreaAdminMutationResponse {
  const candidate = value as Partial<ServiceAreaAdminMutationResponse> | null;
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.generatedAt === "string" &&
    ("serviceArea" in candidate || "stopPolicy" in candidate),
  );
}

function decisionTone(
  decision: ServiceAreaEvaluationResult["decision"],
): "success" | "warn" | "danger" {
  switch (decision) {
    case "serviceable":
      return "success";
    case "manual_review":
      return "warn";
    case "not_serviceable":
      return "danger";
  }
}

function getMutationRecord(
  receipt: ServiceAreaAdminMutationResponse,
): ServiceAreaBoundaryRecord | StopPolicyRecord | null {
  return receipt.serviceArea ?? receipt.stopPolicy ?? null;
}

function getMutationRecordId(receipt: ServiceAreaAdminMutationResponse) {
  const record = getMutationRecord(receipt);
  return record ? getServiceAreaGovernanceRecordId(record) : "";
}

function getMutationVersionRef(receipt: ServiceAreaAdminMutationResponse) {
  const record = getMutationRecord(receipt);
  return record ? getGeometryVersionRef(record) : "not returned";
}

function getMutationRecordLabel(receipt: ServiceAreaAdminMutationResponse) {
  const record = getMutationRecord(receipt);
  if (!record) {
    return "No record returned";
  }
  return `${getServiceAreaGovernanceRecordCode(record)} · ${record.status} · v${
    record.version
  }`;
}
