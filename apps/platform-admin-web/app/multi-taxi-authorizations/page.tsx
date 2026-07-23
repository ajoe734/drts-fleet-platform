"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { MultiTaxiOperatingAuthorizationRecord } from "@drts/contracts";
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

type AuthorizationRow = MultiTaxiOperatingAuthorizationRecord &
  Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const pageStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  maxWidth: 1280,
  margin: "0 auto",
};
const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};
const formStyle: CSSProperties = { display: "grid", gap: 10 };
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "9px 10px",
  background: theme.bgRaised,
  color: theme.text,
};
const actionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

function statusTone(status: AuthorizationRow["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "suspended" || status === "expired") return "warn" as const;
  if (status === "revoked") return "danger" as const;
  return "neutral" as const;
}

export default function MultiTaxiAuthorizationsPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuthorizationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    operatorId: "",
    authorityCode: "",
    businessPlanVersion: "",
    serviceAreaCodes: "TPE",
    activeFareVersionId: "",
    effectiveFrom: "",
    effectiveUntil: "",
  });
  const [vehicle, setVehicle] = useState({
    vehicleId: "",
    effectiveFrom: "",
    effectiveUntil: "",
  });
  const selected = rows.find((row) => row.authorizationId === selectedId);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await client.get<{
        items?: MultiTaxiOperatingAuthorizationRecord[];
      }>("/api/platform-admin/multi-taxi/authorizations");
      const nextRows = (payload.items ?? []) as AuthorizationRow[];
      setRows(nextRows);
      setSelectedId((current) =>
        nextRows.some((row) => row.authorizationId === current)
          ? current
          : (nextRows[0]?.authorizationId ?? null),
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: CanvasTableColumn<AuthorizationRow>[] = [
    {
      h: t("multiTaxiAuth.column.authority"),
      w: 240,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedId(row.authorizationId)}
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
      w: 180,
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
      w: 180,
      r: (row) => row.serviceAreaCodes.join(", "),
    },
    {
      h: t("multiTaxiAuth.column.fareVersion"),
      w: 180,
      r: (row) => row.activeFareVersionId,
    },
  ];

  return (
    <main style={pageStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("multiTaxiAuth.title")}
        subtitle={t("multiTaxiAuth.subtitle")}
        actions={
          <CanvasBtn theme={theme} onClick={() => void load()} disabled={busy}>
            {t("multiTaxiAuth.action.refresh")}
          </CanvasBtn>
        }
      />
      {error ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          title={t("multiTaxiAuth.error.requestFailed")}
          body={error}
        />
      ) : null}
      <div style={splitStyle}>
        <CanvasCard
          theme={theme}
          title={t("multiTaxiAuth.registry.title")}
          subtitle={t("multiTaxiAuth.registry.count", { count: rows.length })}
        >
          <CanvasTable theme={theme} columns={columns} rows={rows} />
        </CanvasCard>
        <div style={{ display: "grid", gap: 16 }}>
          <CanvasCard
            theme={theme}
            title={t("multiTaxiAuth.create.title")}
            subtitle={t("multiTaxiAuth.create.subtitle")}
          >
            <div style={formStyle}>
              {Object.entries(draft).map(([key, value]) => (
                <label key={key} style={{ display: "grid", gap: 5 }}>
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    {t(`multiTaxiAuth.field.${key}`)}
                  </span>
                  <input
                    style={inputStyle}
                    value={value}
                    type={
                      key.startsWith("effective") ? "datetime-local" : "text"
                    }
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void execute(() =>
                    client.post(
                      "/api/platform-admin/multi-taxi/authorizations",
                      {
                        body: {
                          ...draft,
                          serviceAreaCodes: draft.serviceAreaCodes
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
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
          {selected ? (
            <CanvasCard
              theme={theme}
              title={selected.authorityCode}
              subtitle={selected.authorizationId}
            >
              <div style={formStyle}>
                <div style={actionStyle}>
                  {["draft", "suspended"].includes(selected.status) ? (
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void execute(() =>
                          client.post(
                            `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}/activate`,
                          ),
                        )
                      }
                    >
                      {t("multiTaxiAuth.action.activate")}
                    </CanvasBtn>
                  ) : null}
                  {selected.status === "approved" ? (
                    <CanvasBtn
                      theme={theme}
                      disabled={busy}
                      onClick={() =>
                        void execute(() =>
                          client.post(
                            `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}/suspend`,
                          ),
                        )
                      }
                    >
                      {t("multiTaxiAuth.action.suspend")}
                    </CanvasBtn>
                  ) : null}
                </div>
                {Object.entries(vehicle).map(([key, value]) => (
                  <label key={key} style={{ display: "grid", gap: 5 }}>
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      {t(`multiTaxiAuth.field.${key}`)}
                    </span>
                    <input
                      style={inputStyle}
                      value={value}
                      type={
                        key.startsWith("effective") ? "datetime-local" : "text"
                      }
                      onChange={(event) =>
                        setVehicle((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <CanvasBtn
                  theme={theme}
                  disabled={busy}
                  onClick={() =>
                    void execute(() =>
                      client.post(
                        `/api/platform-admin/multi-taxi/authorizations/${encodeURIComponent(selected.authorizationId)}/vehicles`,
                        {
                          body: {
                            vehicleId: vehicle.vehicleId,
                            effectiveFrom: new Date(
                              vehicle.effectiveFrom,
                            ).toISOString(),
                            effectiveUntil: vehicle.effectiveUntil
                              ? new Date(vehicle.effectiveUntil).toISOString()
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
            </CanvasCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}
