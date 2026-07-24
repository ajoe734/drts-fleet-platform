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
import {
  classifyAuthorizationError,
  getAuthorizationActionState,
  getEffectiveWindowState,
  isCurrentVehicleMembership,
  selectAuthorizationRows,
  selectAuthorizedVehicles,
  validateAuthorizationDraft,
  validateAuthorizedVehicle,
  type AuthorizationDraftField,
  type AuthorizationDraftInput,
  type AuthorizationErrorKind,
  type AuthorizationSort,
  type AuthorizedVehicleField,
  type AuthorizedVehicleInput,
  type ValidationIssue,
  type VehicleListScope,
} from "./authorization-ui";

type AuthorizationRow = MultiTaxiOperatingAuthorizationRecord &
  Record<string, unknown>;

type VehicleRow = MultiTaxiAuthorizedVehicleRecord & Record<string, unknown>;

interface ErrorState {
  title: string;
  message: string;
  code: string;
  type: AuthorizationErrorKind;
  retryable: boolean;
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
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.9fr)",
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

const filterStyle: CSSProperties = {
  ...inputStyle,
  minWidth: 180,
  width: "auto",
  flex: "1 1 180px",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background:
    theme.mode === "dark" ? "rgba(10, 14, 22, 0.75)" : "rgba(15, 23, 42, 0.65)",
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
  boxShadow: theme.shadow,
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
    return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
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

function ValidationText({ message }: { message: string | null }) {
  return message ? (
    <span role="alert" style={{ color: theme.danger, fontSize: 11 }}>
      {message}
    </span>
  ) : null;
}

export default function MultiTaxiAuthorizationsPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();

  const [rows, setRows] = useState<AuthorizationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    MultiTaxiOperatingAuthorizationStatus | "all"
  >("all");
  const [registrySearch, setRegistrySearch] = useState("");
  const [registrySort, setRegistrySort] =
    useState<AuthorizationSort>("canonical");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleScope, setVehicleScope] = useState<VehicleListScope>("all");

  const [draftMode, setDraftMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<AuthorizationDraftInput>({
    operatorId: "",
    authorityCode: "",
    businessPlanVersion: "v1.0",
    serviceAreaCodes: "TPE, NPT",
    activeFareVersionId: "fare_std_2026",
    effectiveFrom: new Date().toISOString().slice(0, 16),
    effectiveUntil: "",
  });
  const [draftIssues, setDraftIssues] = useState<
    ValidationIssue<AuthorizationDraftField>[]
  >([]);
  const [draftDirty, setDraftDirty] = useState(false);

  const [vehicle, setVehicle] = useState<AuthorizedVehicleInput>({
    vehicleId: "",
    effectiveFrom: new Date().toISOString().slice(0, 16),
    effectiveUntil: "",
  });
  const [vehicleIssues, setVehicleIssues] = useState<
    ValidationIssue<AuthorizedVehicleField>[]
  >([]);

  const [confirmModal, setConfirmModal] = useState<{
    action: "activate" | "suspend";
    record: AuthorizationRow;
    vehicleCount: number;
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState("");

  const selected = rows.find((row) => row.authorizationId === selectedId);
  const actionState = selected
    ? getAuthorizationActionState(selected.status)
    : null;
  const isReadOnly = Boolean(selected && !actionState?.addVehicle);
  const canEditDraft = Boolean(actionState?.editDraft);
  const canActivate = Boolean(actionState?.activate);
  const canSuspend = Boolean(actionState?.suspend);
  const canAddVehicle = Boolean(actionState?.addVehicle);

  const loadVehicles = useCallback(
    async (authId: string) => {
      const payload = await client.get<{
        items?: MultiTaxiAuthorizedVehicleRecord[];
      }>(
        `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(authId)}/vehicles`,
      );
      const nextVehicles = (payload.items ?? []) as VehicleRow[];
      setVehicles(nextVehicles);
      return nextVehicles;
    },
    [client],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await client.get<{
        items?: MultiTaxiOperatingAuthorizationRecord[];
      }>("/api/platform-admin/multi-taxi/authorizations");
      const nextRows = (payload.items ?? []) as AuthorizationRow[];
      setRows(nextRows);

      const targetId = nextRows.some(
        (row) => row.authorizationId === selectedId,
      )
        ? selectedId
        : (nextRows[0]?.authorizationId ?? null);

      setSelectedId(targetId);
      if (targetId) {
        await loadVehicles(targetId);
      } else {
        setVehicles([]);
      }
    } catch (nextError: unknown) {
      handleApiError(nextError);
    } finally {
      setLoading(false);
    }
  }, [client, selectedId, loadVehicles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draftDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draftDirty]);

  function confirmDiscardDraft() {
    return (
      !draftDirty ||
      window.confirm(t("multiTaxiAuth.draft.discardConfirmation"))
    );
  }

  const handleSelectRow = (authId: string) => {
    if (!confirmDiscardDraft()) return;
    setSelectedId(authId);
    setError(null);
    setDraftMode("create");
    setDraftDirty(false);
    setDraftIssues([]);
    void loadVehicles(authId).catch(handleApiError);
  };

  const handleNewDraft = () => {
    if (!confirmDiscardDraft()) return;
    setSelectedId(null);
    setVehicles([]);
    setError(null);
    setDraftMode("create");
    setDraftDirty(false);
    setDraftIssues([]);
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
    setDraftDirty(false);
    setDraftIssues([]);
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

  function updateDraft(field: AuthorizationDraftField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDraftDirty(true);
    setDraftIssues((current) =>
      current.filter((issue) => issue.field !== field),
    );
  }

  function updateVehicle(field: AuthorizedVehicleField, value: string) {
    setVehicle((current) => ({ ...current, [field]: value }));
    setVehicleIssues((current) =>
      current.filter((issue) => issue.field !== field),
    );
  }

  function validationMessage(code: ValidationIssue<string>["code"]) {
    return t(`multiTaxiAuth.validation.${code}`);
  }

  function draftFieldError(field: AuthorizationDraftField) {
    const issue = draftIssues.find((candidate) => candidate.field === field);
    return issue ? validationMessage(issue.code) : null;
  }

  function vehicleFieldError(field: AuthorizedVehicleField) {
    const issue = vehicleIssues.find((candidate) => candidate.field === field);
    return issue ? validationMessage(issue.code) : null;
  }

  function handleApiError(err: unknown) {
    const classified = classifyAuthorizationError(err);
    const titleKey: Record<AuthorizationErrorKind, string> = {
      session: "multiTaxiAuth.error.sessionTitle",
      permission: "multiTaxiAuth.error.permissionDeniedTitle",
      stale: "multiTaxiAuth.error.staleTitle",
      conflict: "multiTaxiAuth.error.conflictTitle",
      validation: "multiTaxiAuth.error.validationTitle",
      unavailable: "multiTaxiAuth.error.unavailableTitle",
      request: "multiTaxiAuth.error.requestFailed",
    };
    const bodyKey: Partial<Record<AuthorizationErrorKind, string>> = {
      session: "multiTaxiAuth.error.sessionBody",
      permission: "multiTaxiAuth.error.permissionDeniedBody",
      stale: "multiTaxiAuth.error.staleBody",
      unavailable: "multiTaxiAuth.error.unavailableBody",
    };
    setError({
      title: t(titleKey[classified.kind]),
      message: bodyKey[classified.kind]
        ? t(bodyKey[classified.kind]!)
        : classified.message,
      code: classified.code,
      type: classified.kind,
      retryable: classified.retryable,
    });
  }

  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (nextError) {
      handleApiError(nextError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    const issues = validateAuthorizationDraft(draft);
    setDraftIssues(issues);
    if (issues.length > 0) {
      setError({
        title: t("multiTaxiAuth.error.validationTitle"),
        message: t("multiTaxiAuth.validation.summary", {
          count: issues.length,
        }),
        code: "CLIENT_VALIDATION_FAILED",
        type: "validation",
        retryable: false,
      });
      return;
    }

    const body = {
      operatorId: draft.operatorId.trim(),
      authorityCode: draft.authorityCode.trim(),
      businessPlanVersion: draft.businessPlanVersion.trim(),
      serviceAreaCodes: draft.serviceAreaCodes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      activeFareVersionId: draft.activeFareVersionId.trim(),
      effectiveFrom: new Date(draft.effectiveFrom).toISOString(),
      effectiveUntil: draft.effectiveUntil
        ? new Date(draft.effectiveUntil).toISOString()
        : null,
    };
    const success =
      draftMode === "edit" && selected
        ? await execute(() =>
            client.put(
              `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}`,
              {
                body: {
                  authorityCode: body.authorityCode,
                  businessPlanVersion: body.businessPlanVersion,
                  serviceAreaCodes: body.serviceAreaCodes,
                  activeFareVersionId: body.activeFareVersionId,
                  effectiveFrom: body.effectiveFrom,
                  effectiveUntil: body.effectiveUntil,
                },
              },
            ),
          )
        : await execute(() =>
            client.post("/api/platform-admin/multi-taxi/authorizations", {
              body,
            }),
          );
    if (success) {
      setDraftDirty(false);
      setDraftIssues([]);
      setDraftMode("create");
    }
  }

  async function submitVehicle() {
    if (!selected) return;
    const issues = validateAuthorizedVehicle(vehicle);
    setVehicleIssues(issues);
    if (issues.length > 0) {
      setError({
        title: t("multiTaxiAuth.error.validationTitle"),
        message: t("multiTaxiAuth.validation.summary", {
          count: issues.length,
        }),
        code: "CLIENT_VALIDATION_FAILED",
        type: "validation",
        retryable: false,
      });
      return;
    }
    const success = await execute(() =>
      client.post(
        `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}/vehicles`,
        {
          body: {
            vehicleId: vehicle.vehicleId.trim(),
            effectiveFrom: new Date(vehicle.effectiveFrom).toISOString(),
            effectiveUntil: vehicle.effectiveUntil
              ? new Date(vehicle.effectiveUntil).toISOString()
              : null,
          },
        },
      ),
    );
    if (success) {
      setVehicle((current) => ({ ...current, vehicleId: "" }));
      setVehicleIssues([]);
    }
  }

  async function openLifecycleConfirmation(action: "activate" | "suspend") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const authorizationId = encodeURIComponent(selected.authorizationId);
      const [record, vehiclePayload] = await Promise.all([
        client.get<MultiTaxiOperatingAuthorizationRecord>(
          `/api/platform-admin/multi-taxi/authorizations/${authorizationId}`,
        ),
        client.get<{ items?: MultiTaxiAuthorizedVehicleRecord[] }>(
          `/api/platform-admin/multi-taxi/authorizations/${authorizationId}/vehicles`,
        ),
      ]);
      const currentActions = getAuthorizationActionState(record.status);
      if (
        (action === "activate" && !currentActions.activate) ||
        (action === "suspend" && !currentActions.suspend)
      ) {
        handleApiError({
          statusCode: 409,
          code: "AUTHORIZATION_VERSION_CONFLICT",
          apiMessage: t("multiTaxiAuth.error.staleBody"),
          retryable: true,
        });
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.authorizationId === record.authorizationId
            ? ({ ...row, ...record } as AuthorizationRow)
            : row,
        ),
      );
      setVehicles((vehiclePayload.items ?? []) as VehicleRow[]);
      setConfirmReason("");
      setConfirmModal({
        action,
        record: record as AuthorizationRow,
        vehicleCount: vehiclePayload.items?.length ?? 0,
      });
    } catch (nextError) {
      handleApiError(nextError);
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = selectAuthorizationRows(rows, {
    search: registrySearch,
    status: statusFilter,
    sort: registrySort,
  }) as AuthorizationRow[];
  const filteredVehicles = selectAuthorizedVehicles(
    vehicles,
    vehicleSearch,
    vehicleScope,
  ) as VehicleRow[];

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
    {
      h: t("multiTaxiAuth.column.effectiveWindow"),
      w: 220,
      r: (row) => {
        const windowState = getEffectiveWindowState(row);
        return (
          <span style={{ display: "grid", gap: 2 }}>
            <span>
              {formatDate(row.effectiveFrom)} → {formatDate(row.effectiveUntil)}
            </span>
            {row.status === "approved" && windowState === "expiring" ? (
              <span
                style={{ color: theme.warn, fontSize: 11, fontWeight: 700 }}
              >
                {t("multiTaxiAuth.registry.expiryWarning")}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      h: t("multiTaxiAuth.field.updatedAt"),
      w: 160,
      r: (row) => formatDate(row.updatedAt),
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
      h: t("multiTaxiAuth.vehicles.membership"),
      w: 110,
      r: (v) =>
        isCurrentVehicleMembership(v)
          ? t("multiTaxiAuth.vehicles.current")
          : t("multiTaxiAuth.vehicles.history"),
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

  const currentVehicleCount = vehicles.filter((item) =>
    isCurrentVehicleMembership(item),
  ).length;
  const vehicleHistoryCount = vehicles.length - currentVehicleCount;

  const detailItems: CanvasDLItem[] = selected
    ? [
        {
          k: t("multiTaxiAuth.field.authorityCode"),
          v: selected.authorityCode,
        },
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
        {
          k: t("multiTaxiAuth.vehicles.current"),
          v: String(currentVehicleCount),
        },
        {
          k: t("multiTaxiAuth.vehicles.history"),
          v: String(vehicleHistoryCount),
        },
      ]
    : [];

  return (
    <main className="mtx-auth-page" style={pageStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("multiTaxiAuth.title")}
        subtitle={t("multiTaxiAuth.subtitle")}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn
              theme={theme}
              onClick={handleNewDraft}
              disabled={busy || loading}
            >
              + {t("multiTaxiAuth.create.title")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              onClick={() => void load()}
              disabled={busy || loading}
            >
              {t("multiTaxiAuth.action.refresh")}
            </CanvasBtn>
          </div>
        }
      />

      {/* Screen 6: Conflict & Permission Error States */}
      {error ? (
        <div
          data-screen-id="MTX-AUTH-UI-06"
          style={{ display: "grid", gap: 8 }}
        >
          <CanvasBanner
            theme={theme}
            tone={
              error.type === "permission" ||
              error.type === "session" ||
              error.type === "unavailable" ||
              error.type === "request"
                ? "danger"
                : "warn"
            }
            title={error.title}
            body={`${error.code} · ${error.message}`}
          />
          {error.retryable ? (
            <div>
              <CanvasBtn
                theme={theme}
                onClick={() => void load()}
                disabled={busy || loading}
              >
                {t("multiTaxiAuth.action.reloadServerState")}
              </CanvasBtn>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <CanvasBanner
          theme={theme}
          tone="info"
          title={t("multiTaxiAuth.loading.title")}
          body={t("multiTaxiAuth.loading.body")}
        />
      ) : null}

      <div className="mtx-auth-split" style={splitStyle}>
        {/* Screen 1: Authorization Registry */}
        <div
          data-screen-id="MTX-AUTH-UI-01"
          style={{ display: "grid", gap: 16 }}
        >
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
                gap: 8,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "grid", gap: 4, flex: "1 1 240px" }}>
                <span style={{ color: theme.textMuted, fontSize: 11 }}>
                  {t("multiTaxiAuth.registry.search")}
                </span>
                <input
                  style={filterStyle}
                  type="search"
                  value={registrySearch}
                  placeholder={t("multiTaxiAuth.registry.searchPlaceholder")}
                  onChange={(event) => setRegistrySearch(event.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4, flex: "0 1 220px" }}>
                <span style={{ color: theme.textMuted, fontSize: 11 }}>
                  {t("multiTaxiAuth.registry.sort")}
                </span>
                <select
                  style={filterStyle}
                  value={registrySort}
                  onChange={(event) =>
                    setRegistrySort(event.target.value as AuthorizationSort)
                  }
                >
                  <option value="canonical">
                    {t("multiTaxiAuth.registry.sortCanonical")}
                  </option>
                  <option value="updated_desc">
                    {t("multiTaxiAuth.registry.sortUpdated")}
                  </option>
                  <option value="effective_asc">
                    {t("multiTaxiAuth.registry.sortEffective")}
                  </option>
                </select>
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {(
                [
                  "all",
                  "draft",
                  "approved",
                  "suspended",
                  "expired",
                  "revoked",
                ] as const
              ).map((st) => (
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
                    color: statusFilter === st ? theme.invert : theme.text,
                    borderRadius: 16,
                    padding: "4px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: statusFilter === st ? 600 : 400,
                  }}
                >
                  {t(`multiTaxiAuth.status.${st}`)}
                </button>
              ))}
            </div>
            {!loading && filteredRows.length === 0 ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                title={t("multiTaxiAuth.registry.emptyTitle")}
                body={t("multiTaxiAuth.registry.emptyBody")}
              />
            ) : (
              <CanvasTable
                theme={theme}
                columns={columns}
                rows={filteredRows}
              />
            )}
          </CanvasCard>
        </div>

        {/* Right Panel: Detail View, Authorized Vehicles, or Draft Editor */}
        <div style={{ display: "grid", gap: 16 }}>
          {draftMode === "edit" && selected && canEditDraft ? (
            /* Screen 3 (Mode B): Edit Draft Editor */
            <div data-screen-id="MTX-AUTH-UI-03">
              <CanvasCard
                theme={theme}
                title={t("multiTaxiAuth.edit.title")}
                subtitle={selected.authorizationId}
                actions={
                  <CanvasBtn
                    theme={theme}
                    onClick={() => {
                      if (confirmDiscardDraft()) {
                        setDraftMode("create");
                        setDraftDirty(false);
                        setDraftIssues([]);
                      }
                    }}
                  >
                    {t("multiTaxiAuth.confirm.cancel")}
                  </CanvasBtn>
                }
              >
                <div style={formStyle}>
                  {draftIssues.length > 0 ? (
                    <CanvasBanner
                      theme={theme}
                      tone="warn"
                      title={t("multiTaxiAuth.error.validationTitle")}
                      body={t("multiTaxiAuth.validation.summary", {
                        count: draftIssues.length,
                      })}
                    />
                  ) : null}
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
                      aria-invalid={Boolean(draftFieldError("authorityCode"))}
                      onChange={(e) =>
                        updateDraft("authorityCode", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("authorityCode")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.businessPlanVersion")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.businessPlanVersion}
                      aria-invalid={Boolean(
                        draftFieldError("businessPlanVersion"),
                      )}
                      onChange={(e) =>
                        updateDraft("businessPlanVersion", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("businessPlanVersion")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.serviceAreaCodes")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.serviceAreaCodes}
                      aria-invalid={Boolean(
                        draftFieldError("serviceAreaCodes"),
                      )}
                      onChange={(e) =>
                        updateDraft("serviceAreaCodes", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("serviceAreaCodes")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.activeFareVersionId")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.activeFareVersionId}
                      aria-invalid={Boolean(
                        draftFieldError("activeFareVersionId"),
                      )}
                      onChange={(e) =>
                        updateDraft("activeFareVersionId", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("activeFareVersionId")}
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
                      aria-invalid={Boolean(draftFieldError("effectiveFrom"))}
                      onChange={(e) =>
                        updateDraft("effectiveFrom", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("effectiveFrom")}
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
                      aria-invalid={Boolean(draftFieldError("effectiveUntil"))}
                      onChange={(e) =>
                        updateDraft("effectiveUntil", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("effectiveUntil")}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      disabled={busy}
                      onClick={() => void submitDraft()}
                    >
                      {t("multiTaxiAuth.action.saveDraft")}
                    </CanvasBtn>

                    <CanvasBtn
                      theme={theme}
                      disabled={busy}
                      onClick={() => {
                        if (confirmDiscardDraft()) {
                          setDraftMode("create");
                          setDraftDirty(false);
                          setDraftIssues([]);
                        }
                      }}
                    >
                      {t("multiTaxiAuth.confirm.cancel")}
                    </CanvasBtn>
                  </div>
                </div>
              </CanvasCard>
            </div>
          ) : selected ? (
            <>
              {/* Screen 2: Authorization Detail */}
              <div data-screen-id="MTX-AUTH-UI-02">
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
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      title={t("multiTaxiAuth.detail.lifecycleAuthority")}
                      body={t("multiTaxiAuth.detail.lifecycleAuthorityBody")}
                    />

                    {/* Lifecycle Actions (§3 & §6 Capability Gated) */}
                    <div style={actionStyle}>
                      {canActivate ? (
                        <CanvasBtn
                          theme={theme}
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            void openLifecycleConfirmation("activate")
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
                            void openLifecycleConfirmation("suspend")
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
                      <CanvasBtn theme={theme} disabled>
                        {t("multiTaxiAuth.action.revokePending")}
                      </CanvasBtn>
                      <CanvasBtn theme={theme} disabled>
                        {t("multiTaxiAuth.action.restorePending")}
                      </CanvasBtn>
                      <CanvasBtn theme={theme} disabled>
                        {t("multiTaxiAuth.action.deletePending")}
                      </CanvasBtn>
                    </div>
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      title={t("multiTaxiAuth.commandPending.title")}
                      body={t("multiTaxiAuth.commandPending.body")}
                    />
                  </div>
                </CanvasCard>
              </div>

              {/* Screen 5: Authorized Vehicles */}
              <div data-screen-id="MTX-AUTH-UI-05">
                <CanvasCard
                  theme={theme}
                  title={t("multiTaxiAuth.vehicles.title")}
                  subtitle={t("multiTaxiAuth.vehicles.subtitle")}
                >
                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "end",
                      }}
                    >
                      <label
                        style={{ display: "grid", gap: 4, flex: "1 1 220px" }}
                      >
                        <span style={{ color: theme.textMuted, fontSize: 11 }}>
                          {t("multiTaxiAuth.vehicles.search")}
                        </span>
                        <input
                          style={filterStyle}
                          type="search"
                          value={vehicleSearch}
                          onChange={(event) =>
                            setVehicleSearch(event.target.value)
                          }
                        />
                      </label>
                      <label
                        style={{ display: "grid", gap: 4, flex: "0 1 180px" }}
                      >
                        <span style={{ color: theme.textMuted, fontSize: 11 }}>
                          {t("multiTaxiAuth.vehicles.scope")}
                        </span>
                        <select
                          style={filterStyle}
                          value={vehicleScope}
                          onChange={(event) =>
                            setVehicleScope(
                              event.target.value as VehicleListScope,
                            )
                          }
                        >
                          <option value="all">
                            {t("multiTaxiAuth.vehicles.all")}
                          </option>
                          <option value="current">
                            {t("multiTaxiAuth.vehicles.current")}
                          </option>
                          <option value="history">
                            {t("multiTaxiAuth.vehicles.history")}
                          </option>
                        </select>
                      </label>
                    </div>
                    <div style={actionStyle}>
                      <CanvasPill theme={theme} tone="success">
                        {t("multiTaxiAuth.vehicles.current")}:{" "}
                        {currentVehicleCount}
                      </CanvasPill>
                      <CanvasPill theme={theme} tone="neutral">
                        {t("multiTaxiAuth.vehicles.history")}:{" "}
                        {vehicleHistoryCount}
                      </CanvasPill>
                    </div>
                    {filteredVehicles.length > 0 ? (
                      <CanvasTable
                        theme={theme}
                        columns={vehicleColumns}
                        rows={filteredVehicles}
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
                        {vehicleIssues.length > 0 ? (
                          <CanvasBanner
                            theme={theme}
                            tone="warn"
                            title={t("multiTaxiAuth.error.validationTitle")}
                            body={t("multiTaxiAuth.validation.summary", {
                              count: vehicleIssues.length,
                            })}
                          />
                        ) : null}
                        <div
                          className="mtx-auth-vehicle-form"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 8,
                          }}
                        >
                          <label style={{ display: "grid", gap: 4 }}>
                            <span
                              style={{ color: theme.textMuted, fontSize: 11 }}
                            >
                              {t("multiTaxiAuth.field.vehicleId")}
                            </span>
                            <input
                              style={inputStyle}
                              value={vehicle.vehicleId}
                              aria-invalid={Boolean(
                                vehicleFieldError("vehicleId"),
                              )}
                              placeholder={t(
                                "multiTaxiAuth.placeholder.vehicleId",
                              )}
                              onChange={(e) =>
                                updateVehicle("vehicleId", e.target.value)
                              }
                            />
                            <ValidationText
                              message={vehicleFieldError("vehicleId")}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span
                              style={{ color: theme.textMuted, fontSize: 11 }}
                            >
                              {t("multiTaxiAuth.field.effectiveFrom")}
                            </span>
                            <input
                              style={inputStyle}
                              type="datetime-local"
                              value={vehicle.effectiveFrom}
                              aria-invalid={Boolean(
                                vehicleFieldError("effectiveFrom"),
                              )}
                              onChange={(e) =>
                                updateVehicle("effectiveFrom", e.target.value)
                              }
                            />
                            <ValidationText
                              message={vehicleFieldError("effectiveFrom")}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span
                              style={{ color: theme.textMuted, fontSize: 11 }}
                            >
                              {t("multiTaxiAuth.field.effectiveUntil")}
                            </span>
                            <input
                              style={inputStyle}
                              type="datetime-local"
                              value={vehicle.effectiveUntil}
                              aria-invalid={Boolean(
                                vehicleFieldError("effectiveUntil"),
                              )}
                              onChange={(e) =>
                                updateVehicle("effectiveUntil", e.target.value)
                              }
                            />
                            <ValidationText
                              message={vehicleFieldError("effectiveUntil")}
                            />
                          </label>
                        </div>
                        <CanvasBtn
                          theme={theme}
                          disabled={busy}
                          onClick={() => void submitVehicle()}
                        >
                          {t("multiTaxiAuth.action.addVehicle")}
                        </CanvasBtn>
                      </div>
                    ) : (
                      <span
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          fontStyle: "italic",
                        }}
                      >
                        🔒 {t("multiTaxiAuth.detail.readOnly")}
                      </span>
                    )}
                    <div style={actionStyle}>
                      <CanvasBtn theme={theme} disabled>
                        {t("multiTaxiAuth.action.vehicleSuspendPending")}
                      </CanvasBtn>
                      <CanvasBtn theme={theme} disabled>
                        {t("multiTaxiAuth.action.vehicleRemovePending")}
                      </CanvasBtn>
                    </div>
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      title={t("multiTaxiAuth.commandPending.title")}
                      body={t("multiTaxiAuth.commandPending.vehicleBody")}
                    />
                  </div>
                </CanvasCard>
              </div>
            </>
          ) : (
            /* Screen 3 (Mode A): Create Draft Authorization */
            <div data-screen-id="MTX-AUTH-UI-03">
              <CanvasCard
                theme={theme}
                title={t("multiTaxiAuth.create.title")}
                subtitle={t("multiTaxiAuth.create.subtitle")}
              >
                <div style={formStyle}>
                  {draftIssues.length > 0 ? (
                    <CanvasBanner
                      theme={theme}
                      tone="warn"
                      title={t("multiTaxiAuth.error.validationTitle")}
                      body={t("multiTaxiAuth.validation.summary", {
                        count: draftIssues.length,
                      })}
                    />
                  ) : null}
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.operatorId")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.operatorId}
                      aria-invalid={Boolean(draftFieldError("operatorId"))}
                      placeholder={t("multiTaxiAuth.placeholder.operatorId")}
                      onChange={(e) =>
                        updateDraft("operatorId", e.target.value)
                      }
                    />
                    <ValidationText message={draftFieldError("operatorId")} />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.authorityCode")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.authorityCode}
                      aria-invalid={Boolean(draftFieldError("authorityCode"))}
                      placeholder={t("multiTaxiAuth.placeholder.authorityCode")}
                      onChange={(e) =>
                        updateDraft("authorityCode", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("authorityCode")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.businessPlanVersion")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.businessPlanVersion}
                      aria-invalid={Boolean(
                        draftFieldError("businessPlanVersion"),
                      )}
                      onChange={(e) =>
                        updateDraft("businessPlanVersion", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("businessPlanVersion")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.serviceAreaCodes")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.serviceAreaCodes}
                      aria-invalid={Boolean(
                        draftFieldError("serviceAreaCodes"),
                      )}
                      onChange={(e) =>
                        updateDraft("serviceAreaCodes", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("serviceAreaCodes")}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t("multiTaxiAuth.field.activeFareVersionId")}
                    </span>
                    <input
                      style={inputStyle}
                      value={draft.activeFareVersionId}
                      aria-invalid={Boolean(
                        draftFieldError("activeFareVersionId"),
                      )}
                      onChange={(e) =>
                        updateDraft("activeFareVersionId", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("activeFareVersionId")}
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
                      aria-invalid={Boolean(draftFieldError("effectiveFrom"))}
                      onChange={(e) =>
                        updateDraft("effectiveFrom", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("effectiveFrom")}
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
                      aria-invalid={Boolean(draftFieldError("effectiveUntil"))}
                      onChange={(e) =>
                        updateDraft("effectiveUntil", e.target.value)
                      }
                    />
                    <ValidationText
                      message={draftFieldError("effectiveUntil")}
                    />
                  </label>

                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={busy}
                    onClick={() => void submitDraft()}
                  >
                    {t("multiTaxiAuth.action.createDraft")}
                  </CanvasBtn>
                </div>
              </CanvasCard>
            </div>
          )}
        </div>
      </div>

      {/* Screen 4: Lifecycle Confirm Dialog */}
      {confirmModal ? (
        <div
          data-screen-id="MTX-AUTH-UI-04"
          style={modalOverlayStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mtx-auth-confirm-title"
          aria-describedby="mtx-auth-confirm-description"
        >
          <div style={modalContentStyle}>
            <span
              id="mtx-auth-confirm-title"
              style={{ color: theme.text, fontWeight: 700, fontSize: 18 }}
            >
              {t("multiTaxiAuth.confirm.title")}
            </span>
            <p
              id="mtx-auth-confirm-description"
              style={{ color: theme.text, fontSize: 14, margin: 0 }}
            >
              {confirmModal.action === "activate"
                ? t("multiTaxiAuth.confirm.activateBody", {
                    code: confirmModal.record.authorityCode,
                  })
                : t("multiTaxiAuth.confirm.suspendBody", {
                    code: confirmModal.record.authorityCode,
                  })}
            </p>
            <CanvasDL
              theme={theme}
              items={[
                {
                  k: t("multiTaxiAuth.field.authorityCode"),
                  v: confirmModal.record.authorityCode,
                },
                {
                  k: t("multiTaxiAuth.field.operatorId"),
                  v: confirmModal.record.operatorId,
                },
                {
                  k: t("multiTaxiAuth.field.businessPlanVersion"),
                  v: confirmModal.record.businessPlanVersion,
                },
                {
                  k: t("multiTaxiAuth.field.serviceAreaCodes"),
                  v: confirmModal.record.serviceAreaCodes.join(", "),
                },
                {
                  k: t("multiTaxiAuth.field.activeFareVersionId"),
                  v: confirmModal.record.activeFareVersionId,
                },
                {
                  k: t("multiTaxiAuth.confirm.serverVehicleCount"),
                  v: String(confirmModal.vehicleCount),
                },
                {
                  k: t("multiTaxiAuth.column.effectiveWindow"),
                  v: `${formatDate(confirmModal.record.effectiveFrom)} → ${formatDate(confirmModal.record.effectiveUntil)}`,
                },
              ]}
            />
            <CanvasBanner
              theme={theme}
              tone="info"
              title={t("multiTaxiAuth.confirm.serverPreviewTitle")}
              body={t("multiTaxiAuth.confirm.serverPreviewBody")}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>
                {t("multiTaxiAuth.confirm.reason")}
              </span>
              <textarea
                style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
                value={confirmReason}
                onChange={(event) => setConfirmReason(event.target.value)}
                required
              />
            </label>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <CanvasBtn
                theme={theme}
                disabled={busy}
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmReason("");
                }}
              >
                {t("multiTaxiAuth.confirm.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={busy || !confirmReason.trim()}
                onClick={() => {
                  const recordId = confirmModal.record.authorizationId;
                  const actionPath = confirmModal.action;
                  void (async () => {
                    const success = await execute(() =>
                      client.post(
                        `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(recordId)}/${actionPath}`,
                        {
                          headers: {
                            "X-Action-Reason": confirmReason.trim(),
                          },
                        },
                      ),
                    );
                    if (success) {
                      setConfirmModal(null);
                      setConfirmReason("");
                    }
                  })();
                }}
              >
                {t("multiTaxiAuth.confirm.confirm")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        @media (max-width: 1100px) {
          .mtx-auth-split {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }

        @media (max-width: 720px) {
          .mtx-auth-page {
            padding: 14px !important;
          }

          .mtx-auth-vehicle-form {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}
