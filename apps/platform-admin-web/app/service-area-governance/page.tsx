"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  decisionLabelKey,
  decisionTone,
  directionLabelKey,
  effectLabelKey,
  effectTone,
  formatEffective,
  geometrySummary,
  statusLabelKey,
  statusToneOf,
} from "@/lib/service-area-governance";
import {
  SERVICE_PRODUCT_TYPES,
  STOP_POLICY_DIRECTIONS,
  STOP_POLICY_EFFECTS,
  type ServiceAreaAdminMutationResponse,
  type ServiceAreaBoundaryRecord,
  type ServiceAreaDefinitionsResponse,
  type ServiceAreaEvaluationResult,
  type ServiceProductType,
  type StopPolicyDirection,
  type StopPolicyEffect,
  type StopPolicyRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  GeometryEditor,
  buildCanvasTheme,
  type CanvasTableColumn,
  type GeometryEditorSnapshot,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
type Mode = "boundary" | "stop-policy";

const bodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};
const fieldRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginBottom: 10,
};
const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: theme.textDim,
};
const inputStyle: CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  fontSize: 13,
};

export default function ServiceAreaGovernancePage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();

  const [defs, setDefs] = useState<ServiceAreaDefinitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("boundary");
  const [snapshot, setSnapshot] = useState<GeometryEditorSnapshot | null>(null);
  const [lastAudit, setLastAudit] =
    useState<ServiceAreaAdminMutationResponse | null>(null);

  // Draft form
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [product, setProduct] = useState<ServiceProductType>(
    SERVICE_PRODUCT_TYPES[0],
  );
  const [direction, setDirection] = useState<StopPolicyDirection>("pickup");
  const [effect, setEffect] = useState<StopPolicyEffect>("deny");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonMessage, setReasonMessage] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [publishReason, setPublishReason] = useState("");

  // Preview
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [preview, setPreview] = useState<ServiceAreaEvaluationResult | null>(
    null,
  );
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDefs(await client.getServiceAreaDefinitions());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const geometry = snapshot?.backendPayloads.serviceAreaGeometry ?? null;
  const canCreate =
    !busy &&
    code.trim().length > 0 &&
    displayName.trim().length > 0 &&
    geometry != null &&
    (snapshot?.validation.valid ?? false) &&
    (mode === "boundary" ||
      (reasonCode.trim().length > 0 && reasonMessage.trim().length > 0));

  async function runMutation(
    fn: () => Promise<ServiceAreaAdminMutationResponse>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setLastAudit(res);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function createDraft() {
    if (!geometry) return;
    if (mode === "boundary") {
      void runMutation(() =>
        client.createServiceAreaBoundary({
          areaCode: code.trim(),
          displayName: displayName.trim(),
          geometry,
          serviceProductTypes: [product],
          effectiveFrom: effectiveFrom || null,
        }),
      );
    } else {
      void runMutation(() =>
        client.createStopPolicy({
          policyCode: code.trim(),
          displayName: displayName.trim(),
          direction,
          effect,
          geometry,
          serviceAreaCodes: [],
          serviceProductTypes: [product],
          reasonCode: reasonCode.trim(),
          reasonMessage: reasonMessage.trim(),
          effectiveFrom: effectiveFrom || null,
        }),
      );
    }
  }

  function submitReview(id: string) {
    void runMutation(() =>
      mode === "boundary"
        ? client.submitServiceAreaBoundaryForReview(id)
        : client.submitStopPolicyForReview(id),
    );
  }
  function publish(id: string) {
    const reason = publishReason.trim() || null;
    void runMutation(() =>
      mode === "boundary"
        ? client.publishServiceAreaBoundary(id, {
            effectiveFrom: effectiveFrom || null,
            reason,
          })
        : client.publishStopPolicy(id, {
            effectiveFrom: effectiveFrom || null,
            reason,
          }),
    );
  }
  function retire(id: string) {
    const reason = publishReason.trim() || null;
    void runMutation(() =>
      mode === "boundary"
        ? client.retireServiceAreaBoundary(id, { reason })
        : client.retireStopPolicy(id, { reason }),
    );
  }

  async function runPreview() {
    setPreviewErr(null);
    setPreview(null);
    const plat = Number(pickupLat);
    const plng = Number(pickupLng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) {
      setPreviewErr(t("serviceAreaGov.preview.invalid"));
      return;
    }
    const dlat = Number(dropoffLat);
    const dlng = Number(dropoffLng);
    const hasDrop = Number.isFinite(dlat) && Number.isFinite(dlng);
    try {
      setPreview(
        await client.evaluateServiceArea({
          serviceProductType: product,
          pickup: { lat: plat, lng: plng },
          dropoff: hasDrop ? { lat: dlat, lng: dlng } : null,
        }),
      );
    } catch (e: unknown) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    }
  }

  const boundaryColumns: CanvasTableColumn<ServiceAreaBoundaryRecord>[] =
    useMemo(
      () => [
        { h: t("serviceAreaGov.col.name"), r: (r) => r.displayName },
        { h: t("serviceAreaGov.col.code"), r: (r) => r.areaCode, mono: true },
        {
          key: "status",
          h: t("serviceAreaGov.col.status"),
          r: (r) => (
            <CanvasPill theme={theme} tone={statusToneOf(r.status)} dot>
              {t(statusLabelKey(r.status))}
            </CanvasPill>
          ),
        },
        {
          h: t("serviceAreaGov.col.version"),
          r: (r) => `v${r.version}`,
          mono: true,
        },
        {
          key: "effective",
          h: t("serviceAreaGov.col.effective"),
          r: (r) =>
            formatEffective(
              r.effectiveFrom,
              r.effectiveUntil,
              t("serviceAreaGov.openEnded"),
            ),
          mono: true,
        },
        {
          h: t("serviceAreaGov.col.geometry"),
          r: (r) => geometrySummary(r.geometry),
          mono: true,
        },
        {
          key: "actions",
          h: t("serviceAreaGov.col.actions"),
          r: (r) => renderRowActions(r.serviceAreaId, r.status),
        },
      ],
      [t, busy, publishReason],
    );

  const stopColumns: CanvasTableColumn<StopPolicyRecord>[] = useMemo(
    () => [
      { h: t("serviceAreaGov.col.name"), r: (r) => r.displayName },
      { h: t("serviceAreaGov.col.code"), r: (r) => r.policyCode, mono: true },
      {
        h: t("serviceAreaGov.col.direction"),
        r: (r) => t(directionLabelKey(r.direction)),
      },
      {
        key: "effect",
        h: t("serviceAreaGov.col.effect"),
        r: (r) => (
          <CanvasPill theme={theme} tone={effectTone(r.effect)}>
            {t(effectLabelKey(r.effect))}
          </CanvasPill>
        ),
      },
      {
        key: "status",
        h: t("serviceAreaGov.col.status"),
        r: (r) => (
          <CanvasPill theme={theme} tone={statusToneOf(r.status)} dot>
            {t(statusLabelKey(r.status))}
          </CanvasPill>
        ),
      },
      {
        h: t("serviceAreaGov.col.version"),
        r: (r) => `v${r.version}`,
        mono: true,
      },
      {
        key: "actions",
        h: t("serviceAreaGov.col.actions"),
        r: (r) => renderRowActions(r.stopPolicyId, r.status),
      },
    ],
    [t, busy, publishReason],
  );

  function renderRowActions(
    id: string,
    status: ServiceAreaBoundaryRecord["status"],
  ) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {status === "draft" && (
          <CanvasBtn
            theme={theme}
            disabled={busy}
            onClick={() => submitReview(id)}
          >
            {t("serviceAreaGov.action.submitReview")}
          </CanvasBtn>
        )}
        {(status === "draft" || status === "review") && (
          <CanvasBtn
            theme={theme}
            variant="primary"
            disabled={busy}
            onClick={() => publish(id)}
          >
            {t("serviceAreaGov.action.publish")}
          </CanvasBtn>
        )}
        {status === "active" && (
          <CanvasBtn theme={theme} disabled={busy} onClick={() => retire(id)}>
            {t("serviceAreaGov.action.retire")}
          </CanvasBtn>
        )}
      </div>
    );
  }

  const headerActions = (
    <>
      <CanvasPill theme={theme} tone="accent" dot>
        {t("serviceAreaGov.taxiMark")}
      </CanvasPill>
      <CanvasBtn
        theme={theme}
        disabled={loading || busy}
        onClick={() => void reload()}
      >
        {t("common.refresh")}
      </CanvasBtn>
    </>
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("serviceAreaGov.title")}
        subtitle={t("serviceAreaGov.subtitle")}
        actions={headerActions}
      />
      <div style={bodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="info"
          body={t("serviceAreaGov.sandboxSeparation")}
        />
        {error && <CanvasBanner theme={theme} tone="danger" body={error} />}

        {/* 5.2 record-type switcher */}
        <div style={{ display: "flex", gap: 8 }}>
          <CanvasBtn
            theme={theme}
            variant={mode === "boundary" ? "primary" : "secondary"}
            onClick={() => setMode("boundary")}
          >
            {t("serviceAreaGov.mode.boundary")}
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            variant={mode === "stop-policy" ? "primary" : "secondary"}
            onClick={() => setMode("stop-policy")}
          >
            {t("serviceAreaGov.mode.stopPolicy")}
          </CanvasBtn>
        </div>

        <div style={gridStyle}>
          {/* 5.3 geometry workspace */}
          <CanvasCard
            theme={theme}
            title={t("serviceAreaGov.geometry.title")}
            subtitle={t("serviceAreaGov.geometry.sub")}
          >
            <GeometryEditor theme={theme} onChange={setSnapshot} />
          </CanvasCard>

          {/* 5.5 review / publish panel */}
          <CanvasCard theme={theme} title={t("serviceAreaGov.draft.title")}>
            <div style={fieldRow}>
              <label style={labelStyle}>{t("serviceAreaGov.field.code")}</label>
              <input
                style={inputStyle}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>{t("serviceAreaGov.field.name")}</label>
              <input
                style={inputStyle}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.field.product")}
              </label>
              <select
                style={inputStyle}
                value={product}
                onChange={(e) =>
                  setProduct(e.target.value as ServiceProductType)
                }
              >
                {SERVICE_PRODUCT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {mode === "stop-policy" && (
              <>
                <div style={fieldRow}>
                  <label style={labelStyle}>
                    {t("serviceAreaGov.field.direction")}
                  </label>
                  <select
                    style={inputStyle}
                    value={direction}
                    onChange={(e) =>
                      setDirection(e.target.value as StopPolicyDirection)
                    }
                  >
                    {STOP_POLICY_DIRECTIONS.map((d) => (
                      <option key={d} value={d}>
                        {t(directionLabelKey(d))}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldRow}>
                  <label style={labelStyle}>
                    {t("serviceAreaGov.field.effect")}
                  </label>
                  <select
                    style={inputStyle}
                    value={effect}
                    onChange={(e) =>
                      setEffect(e.target.value as StopPolicyEffect)
                    }
                  >
                    {STOP_POLICY_EFFECTS.map((ef) => (
                      <option key={ef} value={ef}>
                        {t(effectLabelKey(ef))}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldRow}>
                  <label style={labelStyle}>
                    {t("serviceAreaGov.field.reasonCode")}
                  </label>
                  <input
                    style={inputStyle}
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                  />
                </div>
                <div style={fieldRow}>
                  <label style={labelStyle}>
                    {t("serviceAreaGov.field.reasonMessage")}
                  </label>
                  <input
                    style={inputStyle}
                    value={reasonMessage}
                    onChange={(e) => setReasonMessage(e.target.value)}
                  />
                </div>
              </>
            )}
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.field.effectiveFrom")}
              </label>
              <input
                style={inputStyle}
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.field.publishReason")}
              </label>
              <input
                style={inputStyle}
                value={publishReason}
                onChange={(e) => setPublishReason(e.target.value)}
                placeholder={t("serviceAreaGov.field.publishReasonHint")}
              />
            </div>
            <CanvasBtn
              theme={theme}
              variant="primary"
              disabled={!canCreate}
              onClick={createDraft}
            >
              {t("serviceAreaGov.action.createDraft")}
            </CanvasBtn>
          </CanvasCard>
        </div>

        {/* 5.6 affected sample preview */}
        <CanvasCard
          theme={theme}
          title={t("serviceAreaGov.preview.title")}
          subtitle={t("serviceAreaGov.preview.sub")}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.preview.pickupLat")}
              </label>
              <input
                style={inputStyle}
                value={pickupLat}
                onChange={(e) => setPickupLat(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.preview.pickupLng")}
              </label>
              <input
                style={inputStyle}
                value={pickupLng}
                onChange={(e) => setPickupLng(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.preview.dropoffLat")}
              </label>
              <input
                style={inputStyle}
                value={dropoffLat}
                onChange={(e) => setDropoffLat(e.target.value)}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>
                {t("serviceAreaGov.preview.dropoffLng")}
              </label>
              <input
                style={inputStyle}
                value={dropoffLng}
                onChange={(e) => setDropoffLng(e.target.value)}
              />
            </div>
            <CanvasBtn theme={theme} onClick={() => void runPreview()}>
              {t("serviceAreaGov.preview.run")}
            </CanvasBtn>
          </div>
          {previewErr && (
            <CanvasBanner theme={theme} tone="warn" body={previewErr} />
          )}
          {preview && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CanvasPill
                theme={theme}
                tone={decisionTone(preview.decision)}
                dot
              >
                {t(decisionLabelKey(preview.decision))}
              </CanvasPill>
              <span
                style={{
                  fontSize: 12,
                  color: theme.textDim,
                  fontFamily: theme.monoFamily,
                }}
              >
                {preview.reasonCodes.join(", ") || "—"}
              </span>
              <span style={{ fontSize: 11, color: theme.textMuted }}>
                {t("serviceAreaGov.preview.authorityNote")}
              </span>
            </div>
          )}
        </CanvasCard>

        {/* 5.4 record list / version stack */}
        <CanvasCard
          theme={theme}
          title={
            mode === "boundary"
              ? t("serviceAreaGov.list.boundaries")
              : t("serviceAreaGov.list.stopPolicies")
          }
        >
          {mode === "boundary" ? (
            <CanvasTable
              theme={theme}
              columns={boundaryColumns}
              rows={defs?.serviceAreas ?? []}
            />
          ) : (
            <CanvasTable
              theme={theme}
              columns={stopColumns}
              rows={defs?.stopPolicies ?? []}
            />
          )}
        </CanvasCard>

        {/* 5.7 audit visibility */}
        {lastAudit && (
          <CanvasCard theme={theme} title={t("serviceAreaGov.audit.title")}>
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                fontSize: 12,
                color: theme.textDim,
              }}
            >
              <span style={{ fontFamily: theme.monoFamily }}>
                audit: {lastAudit.auditId ?? "—"}
              </span>
              <span style={{ fontFamily: theme.monoFamily }}>
                at: {lastAudit.generatedAt.slice(0, 19).replace("T", " ")}
              </span>
              <span style={{ fontFamily: theme.monoFamily }}>
                {lastAudit.serviceArea
                  ? `serviceArea v${lastAudit.serviceArea.version} · ${lastAudit.serviceArea.status}`
                  : lastAudit.stopPolicy
                    ? `stopPolicy v${lastAudit.stopPolicy.version} · ${lastAudit.stopPolicy.status}`
                    : "—"}
              </span>
            </div>
          </CanvasCard>
        )}
      </div>
    </>
  );
}
