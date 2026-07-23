"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
  MultiTaxiOperatingAuthorizationStatus,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasDLItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

type AuthorizationRow = MultiTaxiOperatingAuthorizationRecord &
  Record<string, unknown>;

type VehicleRow = MultiTaxiAuthorizedVehicleRecord & Record<string, unknown>;

interface ErrorState {
  title: string;
  message: string;
  type: "permission" | "conflict" | "validation" | "request";
}

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  maxWidth: 1400,
  margin: "0 auto",
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(380px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const formStyle: CSSProperties = { display: "grid", gap: 12 };

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "9px 10px",
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 13,
};

const actionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.65)",
  backdropFilter: "blur(4px)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
  padding: 16,
};

const modalContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 500,
  background: theme.bgRaised,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 24,
  display: "grid",
  gap: 16,
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
};

function statusTone(status: MultiTaxiOperatingAuthorizationStatus) {
  if (status === "approved") return "success" as const;
  if (status === "suspended" || status === "expired") return "warn" as const;
  if (status === "revoked") return "danger" as const;
  return "neutral" as const;
}

function vehicleStatusTone(status: VehicleRow["status"]) {
  if (status === "active") return "success" as const;
  if (status === "suspended") return "warn" as const;
  return "neutral" as const;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatIsoForInput(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

export default function MultiTaxiAuthorizationsPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();

  const [rows, setRows] = useState<AuthorizationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [draftMode, setDraftMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState({
    operatorId: "",
    authorityCode: "",
    businessPlanVersion: "v1.0",
    serviceAreaCodes: "TPE, NPT",
    activeFareVersionId: "fare_std_2026",
    effectiveFrom: new Date().toISOString().slice(0, 16),
    effectiveUntil: "",
  });

  const [vehicle, setVehicle] = useState({
    vehicleId: "",
    effectiveFrom: new Date().toISOString().slice(0, 16),
    effectiveUntil: "",
  });

  const [confirmModal, setConfirmModal] = useState<{
    action: "activate" | "suspend";
    record: AuthorizationRow;
  } | null>(null);

  const selected = rows.find((row) => row.authorizationId === selectedId);

  const isReadOnly =
    selected?.status === "expired" || selected?.status === "revoked";
  const canEditDraft = selected?.status === "draft";
  const canActivate =
    selected?.status === "draft" || selected?.status === "suspended";
  const canSuspend = selected?.status === "approved";
  const canAddVehicle =
    Boolean(selected) &&
    !isReadOnly &&
    (selected?.status === "draft" ||
      selected?.status === "approved" ||
      selected?.status === "suspended");

  const loadVehicles = useCallback(
    async (authId: string) => {
      try {
        const payload = await client.get<{
          items?: MultiTaxiAuthorizedVehicleRecord[];
        }>(
          `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(authId)}/vehicles`,
        );
        setVehicles((payload.items ?? []) as VehicleRow[]);
      } catch {
        setVehicles([]);
      }
    },
    [client],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await client.get<{
        items?: MultiTaxiOperatingAuthorizationRecord[];
      }>("/api/platform-admin/multi-taxi/authorizations");
      const nextRows = (payload.items ?? []) as AuthorizationRow[];
      setRows(nextRows);

      const targetId = nextRows.some((row) => row.authorizationId === selectedId)
        ? selectedId
        : (nextRows[0]?.authorizationId ?? null);

      setSelectedId(targetId);
      if (targetId) {
        void loadVehicles(targetId);
      } else {
        setVehicles([]);
      }
    } catch (nextError: unknown) {
      handleApiError(nextError);
    }
  }, [client, selectedId, loadVehicles]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectRow = (authId: string) => {
    setSelectedId(authId);
    setError(null);
    setDraftMode("create");
    void loadVehicles(authId);
  };

  const handleNewDraft = () => {
    setSelectedId(null);
    setVehicles([]);
    setError(null);
    setDraftMode("create");
    setDraft({
      operatorId: "",
      authorityCode: "",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: "TPE, NPT",
      activeFareVersionId: "fare_std_2026",
      effectiveFrom: new Date().toISOString().slice(0, 16),
      effectiveUntil: "",
    });
  };

  const handleStartEditDraft = () => {
    if (!selected || selected.status !== "draft") return;
    setDraftMode("edit");
    setDraft({
      operatorId: selected.operatorId || "",
      authorityCode: selected.authorityCode || "",
      businessPlanVersion: selected.businessPlanVersion || "",
      serviceAreaCodes: (selected.serviceAreaCodes || []).join(", "),
      activeFareVersionId: selected.activeFareVersionId || "",
      effectiveFrom: formatIsoForInput(selected.effectiveFrom),
      effectiveUntil: formatIsoForInput(selected.effectiveUntil),
    });
  };

  function handleApiError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("403") || message.includes("IDENTITY_REQUIRED")) {
      setError({
        title: t("multiTaxiAuth.error.permissionDeniedTitle"),
        message: t("multiTaxiAuth.error.permissionDeniedBody"),
        type: "permission",
      });
    } else if (
      message.includes("409") ||
      message.includes("NOT_EDITABLE") ||
      message.includes("CANNOT_ACTIVATE") ||
      message.includes("NOT_ACTIVE")
    ) {
      setError({
        title: t("multiTaxiAuth.error.conflictTitle"),
        message,
        type: "conflict",
      });
    } else if (message.includes("400") || message.includes("validation")) {
      setError({
        title: t("multiTaxiAuth.error.validationTitle"),
        message,
        type: "validation",
      });
    } else {
      setError({
        title: t("multiTaxiAuth.error.requestFailed"),
        message,
        type: "request",
      });
    }
  }

  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (nextError) {
      handleApiError(nextError);
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = rows.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  const columns: CanvasTableColumn<AuthorizationRow>[] = [
    {
      h: t("multiTaxiAuth.column.authority"),
      w: 240,
      r: (row) => (
        <button
          type="button"
          onClick={() => handleSelectRow(row.authorizationId)}
          style={{
            border: 0,
            background: "transparent",
            color:
              selectedId === row.authorizationId ? theme.accent : theme.text,
            cursor: "pointer",
            textAlign: "left",
            fontWeight: 700,
          }}
        >
          {row.authorityCode}
        </button>
      ),
    },
    {
      h: t("multiTaxiAuth.column.operator"),
      w: 160,
      r: (row) => row.operatorId,
    },
    {
      h: t("multiTaxiAuth.column.status"),
      w: 120,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {t(`multiTaxiAuth.status.${row.status}`)}
        </CanvasPill>
      ),
    },
    {
      h: t("multiTaxiAuth.column.serviceAreas"),
      w: 160,
      r: (row) => (row.serviceAreaCodes || []).join(", "),
    },
    {
      h: t("multiTaxiAuth.column.fareVersion"),
      w: 160,
      r: (row) => row.activeFareVersionId,
    },
  ];

  const vehicleColumns: CanvasTableColumn<VehicleRow>[] = [
    {
      h: t("multiTaxiAuth.field.vehicleId"),
      w: 180,
      r: (v) => v.vehicleId,
    },
    {
      h: t("multiTaxiAuth.column.status"),
      w: 120,
      r: (v) => (
        <CanvasPill theme={theme} tone={vehicleStatusTone(v.status)} dot>
          {t(`multiTaxiAuth.vehicles.status.${v.status}`)}
        </CanvasPill>
      ),
    },
    {
      h: t("multiTaxiAuth.field.effectiveFrom"),
      w: 160,
      r: (v) => formatDate(v.effectiveFrom),
    },
    {
      h: t("multiTaxiAuth.field.effectiveUntil"),
      w: 160,
      r: (v) => formatDate(v.effectiveUntil),
    },
  ];

  const detailItems: CanvasDLItem[] = selected
    ? [
        { k: t("multiTaxiAuth.field.authorityCode"), v: selected.authorityCode },
        { k: t("multiTaxiAuth.field.operatorId"), v: selected.operatorId },
        {
          k: t("multiTaxiAuth.field.businessPlanVersion"),
          v: selected.businessPlanVersion,
        },
        {
          k: t("multiTaxiAuth.column.status"),
          v: t(`multiTaxiAuth.status.${selected.status}`),
        },
        {
          k: t("multiTaxiAuth.field.serviceAreaCodes"),
          v: (selected.serviceAreaCodes || []).join(", "),
        },
        {
          k: t("multiTaxiAuth.field.activeFareVersionId"),
          v: selected.activeFareVersionId,
        },
        {
          k: t("multiTaxiAuth.field.effectiveFrom"),
          v: formatDate(selected.effectiveFrom),
        },
        {
          k: t("multiTaxiAuth.field.effectiveUntil"),
          v: formatDate(selected.effectiveUntil),
        },
        {
          k: t("multiTaxiAuth.field.createdAt"),
          v: formatDate(selected.createdAt),
        },
        {
          k: t("multiTaxiAuth.field.updatedAt"),
          v: formatDate(selected.updatedAt),
        },
      ]
    : [];

  return (
    <main style={pageStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("multiTaxiAuth.title")}
        subtitle={t("multiTaxiAuth.subtitle")}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn theme={theme} onClick={handleNewDraft} disabled={busy}>
              + {t("multiTaxiAuth.create.title")}
            </CanvasBtn>
            <CanvasBtn theme={theme} onClick={() => void load()} disabled={busy}>
              {t("multiTaxiAuth.action.refresh")}
            </CanvasBtn>
          </div>
        }
      />

      {/* Screen 6: Conflict & Permission Error States */}
      {error ? (
        <CanvasBanner
          theme={theme}
          tone={
            error.type === "permission" || error.type === "request"
              ? "danger"
              : "warn"
          }
          title={error.title}
          body={error.message}
        />
      ) : null}

      <div style={splitStyle}>
        {/* Screen 1: Authorization Registry */}
        <div style={{ display: "grid", gap: 16 }}>
          <CanvasCard
            theme={theme}
            title={t("multiTaxiAuth.registry.title")}
            subtitle={t("multiTaxiAuth.registry.count", {
              count: filteredRows.length,
            })}
            actions={
              <button
                type="button"
                onClick={handleNewDraft}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.bgRaised,
                  color: theme.text,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + {t("multiTaxiAuth.action.createDraft")}
              </button>
            }
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {[
                "all",
                "draft",
                "approved",
                "suspended",
                "expired",
                "revoked",
              ].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    border: `1px solid ${
                      statusFilter === st ? theme.accent : theme.border
                    }`,
                    background:
                      statusFilter === st ? theme.accent : "transparent",
                    color: statusFilter === st ? "#fff" : theme.text,
                    borderRadius: 16,
                    padding: "4px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: statusFilter === st ? 600 : 400,
                  }}
                >
                  {st === "all"
                    ? "全部 (All)"
                    : t(`multiTaxiAuth.status.${st}`)}
                </button>
              ))}
            </div>
            <CanvasTable theme={theme} columns={columns} rows={filteredRows} />
          </CanvasCard>
        </div>

        {/* Right Panel: Detail View, Authorized Vehicles, or Draft Editor */}
        <div style={{ display: "grid", gap: 16 }}>
          {draftMode === "edit" && selected && canEditDraft ? (
            /* Screen 3 (Mode B): Edit Draft Editor */
            <CanvasCard
              theme={theme}
              title={t("multiTaxiAuth.edit.title")}
              subtitle={selected.authorizationId}
              actions={
                <CanvasBtn
                  theme={theme}
                  onClick={() => setDraftMode("create")}
                >
                  {t("multiTaxiAuth.confirm.cancel")}
                </CanvasBtn>
              }
            >
              <div style={formStyle}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.operatorId")}
                  </span>
                  <input
                    style={{ ...inputStyle, opacity: 0.7 }}
                    value={draft.operatorId}
                    disabled
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.authorityCode")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.authorityCode}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, authorityCode: e.target.value }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.businessPlanVersion")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.businessPlanVersion}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        businessPlanVersion: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.serviceAreaCodes")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.serviceAreaCodes}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        serviceAreaCodes: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.activeFareVersionId")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.activeFareVersionId}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        activeFareVersionId: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.effectiveFrom")}
                  </span>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={draft.effectiveFrom}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        effectiveFrom: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.effectiveUntil")}
                  </span>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={draft.effectiveUntil}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        effectiveUntil: e.target.value,
                      }))
                    }
                  />
                </label>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void execute(() =>
                        client.put(
                          `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}`,
                          {
                            body: {
                              authorityCode: draft.authorityCode,
                              businessPlanVersion: draft.businessPlanVersion,
                              serviceAreaCodes: draft.serviceAreaCodes
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                              activeFareVersionId: draft.activeFareVersionId,
                              effectiveFrom: new Date(
                                draft.effectiveFrom,
                              ).toISOString(),
                              effectiveUntil: draft.effectiveUntil
                                ? new Date(draft.effectiveUntil).toISOString()
                                : null,
                            },
                          },
                        ),
                      )
                    }
                  >
                    {t("multiTaxiAuth.action.saveDraft")}
                  </CanvasBtn>

                  <CanvasBtn
                    theme={theme}
                    disabled={busy}
                    onClick={() => setDraftMode("create")}
                  >
                    {t("multiTaxiAuth.confirm.cancel")}
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          ) : selected ? (
            <>
              {/* Screen 2: Authorization Detail */}
              <CanvasCard
                theme={theme}
                title={t("multiTaxiAuth.detail.title")}
                subtitle={selected.authorizationId}
              >
                <div style={formStyle}>
                  {isReadOnly ? (
                    <CanvasBanner
                      theme={theme}
                      tone="warn"
                      title={t("multiTaxiAuth.detail.readOnly")}
                      body=""
                    />
                  ) : null}

                  <CanvasDL theme={theme} items={detailItems} />

                  {/* Lifecycle Actions (§3 & §6 Capability Gated) */}
                  {!isReadOnly ? (
                    <div style={actionStyle}>
                      {canActivate ? (
                        <CanvasBtn
                          theme={theme}
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            setConfirmModal({
                              action: "activate",
                              record: selected,
                            })
                          }
                        >
                          {t("multiTaxiAuth.action.activate")}
                        </CanvasBtn>
                      ) : null}

                      {canSuspend ? (
                        <CanvasBtn
                          theme={theme}
                          disabled={busy}
                          onClick={() =>
                            setConfirmModal({
                              action: "suspend",
                              record: selected,
                            })
                          }
                        >
                          {t("multiTaxiAuth.action.suspend")}
                        </CanvasBtn>
                      ) : null}

                      {canEditDraft ? (
                        <CanvasBtn
                          theme={theme}
                          disabled={busy}
                          onClick={handleStartEditDraft}
                        >
                          {t("multiTaxiAuth.action.editDraft")}
                        </CanvasBtn>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </CanvasCard>

              {/* Screen 5: Authorized Vehicles */}
              <CanvasCard
                theme={theme}
                title={t("multiTaxiAuth.vehicles.title")}
                subtitle={t("multiTaxiAuth.vehicles.subtitle")}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {vehicles.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={vehicleColumns}
                      rows={vehicles}
                    />
                  ) : (
                    <span style={{ color: theme.textMuted, fontSize: 13 }}>
                      {t("multiTaxiAuth.vehicles.empty")}
                    </span>
                  )}

                  {/* Add Vehicle Sub-Form (Strictly gated for editable records only) */}
                  {canAddVehicle ? (
                    <div
                      style={{
                        borderTop: `1px dashed ${theme.border}`,
                        paddingTop: 12,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          color: theme.text,
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {t("multiTaxiAuth.action.addVehicle")}
                      </span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ color: theme.textMuted, fontSize: 11 }}>
                            {t("multiTaxiAuth.field.vehicleId")}
                          </span>
                          <input
                            style={inputStyle}
                            value={vehicle.vehicleId}
                            placeholder="e.g. VEH-101"
                            onChange={(e) =>
                              setVehicle((curr) => ({
                                ...curr,
                                vehicleId: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ color: theme.textMuted, fontSize: 11 }}>
                            {t("multiTaxiAuth.field.effectiveFrom")}
                          </span>
                          <input
                            style={inputStyle}
                            type="datetime-local"
                            value={vehicle.effectiveFrom}
                            onChange={(e) =>
                              setVehicle((curr) => ({
                                ...curr,
                                effectiveFrom: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ color: theme.textMuted, fontSize: 11 }}>
                            {t("multiTaxiAuth.field.effectiveUntil")}
                          </span>
                          <input
                            style={inputStyle}
                            type="datetime-local"
                            value={vehicle.effectiveUntil}
                            onChange={(e) =>
                              setVehicle((curr) => ({
                                ...curr,
                                effectiveUntil: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <CanvasBtn
                        theme={theme}
                        disabled={
                          busy || !vehicle.vehicleId || !vehicle.effectiveFrom
                        }
                        onClick={() =>
                          void execute(() =>
                            client.post(
                              `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}/vehicles`,
                              {
                                body: {
                                  vehicleId: vehicle.vehicleId.trim(),
                                  effectiveFrom: new Date(
                                    vehicle.effectiveFrom,
                                  ).toISOString(),
                                  effectiveUntil: vehicle.effectiveUntil
                                    ? new Date(
                                        vehicle.effectiveUntil,
                                      ).toISOString()
                                    : null,
                                },
                              },
                            ),
                          )
                        }
                      >
                        {t("multiTaxiAuth.action.addVehicle")}
                      </CanvasBtn>
                    </div>
                  ) : (
                    <span style={{ color: theme.textMuted, fontSize: 12, fontStyle: "italic" }}>
                      🔒 {t("multiTaxiAuth.detail.readOnly")}
                    </span>
                  )}
                </div>
              </CanvasCard>
            </>
          ) : (
            /* Screen 3 (Mode A): Create Draft Authorization */
            <CanvasCard
              theme={theme}
              title={t("multiTaxiAuth.create.title")}
              subtitle={t("multiTaxiAuth.create.subtitle")}
            >
              <div style={formStyle}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.operatorId")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.operatorId}
                    placeholder="e.g. op-fleet-taipei"
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, operatorId: e.target.value }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.authorityCode")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.authorityCode}
                    placeholder="e.g. AUTH-TAIPEI-2026"
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, authorityCode: e.target.value }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.businessPlanVersion")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.businessPlanVersion}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        businessPlanVersion: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.serviceAreaCodes")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.serviceAreaCodes}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        serviceAreaCodes: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.activeFareVersionId")}
                  </span>
                  <input
                    style={inputStyle}
                    value={draft.activeFareVersionId}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        activeFareVersionId: e.target.value,
                      }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.effectiveFrom")}
                  </span>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={draft.effectiveFrom}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, effectiveFrom: e.target.value }))
                    }
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t("multiTaxiAuth.field.effectiveUntil")}
                  </span>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={draft.effectiveUntil}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        effectiveUntil: e.target.value,
                      }))
                    }
                  />
                </label>

                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={
                    busy ||
                    !draft.operatorId ||
                    !draft.authorityCode ||
                    !draft.effectiveFrom
                  }
                  onClick={() =>
                    void execute(() =>
                      client.post(
                        "/api/platform-admin/multi-taxi/authorizations",
                        {
                          body: {
                            operatorId: draft.operatorId.trim(),
                            authorityCode: draft.authorityCode.trim(),
                            businessPlanVersion: draft.businessPlanVersion.trim(),
                            serviceAreaCodes: draft.serviceAreaCodes
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean),
                            activeFareVersionId: draft.activeFareVersionId.trim(),
                            effectiveFrom: new Date(
                              draft.effectiveFrom,
                            ).toISOString(),
                            effectiveUntil: draft.effectiveUntil
                              ? new Date(draft.effectiveUntil).toISOString()
                              : null,
                          },
                        },
                      ),
                    )
                  }
                >
                  {t("multiTaxiAuth.action.createDraft")}
                </CanvasBtn>
              </div>
            </CanvasCard>
          )}
        </div>
      </div>

      {/* Screen 4: Lifecycle Confirm Dialog */}
      {confirmModal ? (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <span style={{ color: theme.text, fontWeight: 700, fontSize: 18 }}>
              {t("multiTaxiAuth.confirm.title")}
            </span>
            <p style={{ color: theme.text, fontSize: 14, margin: 0 }}>
              {confirmModal.action === "activate"
                ? t("multiTaxiAuth.confirm.activateBody", {
                    code: confirmModal.record.authorityCode,
                  })
                : t("multiTaxiAuth.confirm.suspendBody", {
                    code: confirmModal.record.authorityCode,
                  })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <CanvasBtn
                theme={theme}
                disabled={busy}
                onClick={() => setConfirmModal(null)}
              >
                {t("multiTaxiAuth.confirm.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={busy}
                onClick={() => {
                  const recordId = confirmModal.record.authorizationId;
                  const actionPath = confirmModal.action;
                  setConfirmModal(null);
                  void execute(() =>
                    client.post(
                      `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(recordId)}/${actionPath}`,
                    ),
                  );
                }}
              >
                {t("multiTaxiAuth.confirm.confirm")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
