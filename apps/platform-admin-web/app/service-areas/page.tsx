"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type {
  ServiceAreaBoundaryRecord,
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
        await action();
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
    if (current.selection.kind === "service_area") {
      await client.submitServiceAreaBoundaryForReview(current.selection.id);
    } else {
      await client.submitStopPolicyForReview(current.selection.id);
    }
  }, [client, requireSelectionAndReason]);

  const publish = useCallback(async () => {
    const current = requireSelectionAndReason();
    if (!["draft", "review"].includes(current.selectedRecord.status)) {
      throw new Error("Only draft or review records can be published.");
    }
    const command = {
      effectiveFrom: effectiveFrom || null,
      effectiveUntil: effectiveUntil || null,
      reason,
    };
    if (current.selection.kind === "service_area") {
      await client.publishServiceAreaBoundary(current.selection.id, command);
    } else {
      await client.publishStopPolicy(current.selection.id, command);
    }
  }, [
    client,
    effectiveFrom,
    effectiveUntil,
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
      await client.retireServiceAreaBoundary(current.selection.id, command);
    } else {
      await client.retireStopPolicy(current.selection.id, command);
    }
  }, [client, effectiveUntil, reason, requireSelectionAndReason]);

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
                  value="Backend returns auditId on lifecycle mutations; UI shows completion and refreshes definitions."
                />
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
