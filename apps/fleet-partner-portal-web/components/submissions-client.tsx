"use client";

// Fleet-partner self-service onboarding submissions UI.
//
// Writes go through the control-plane proxy (`/control-plane-proxy/...` ->
// `/api/...`), which injects the partner-realm identity + `x-fleet-partner-id`,
// so the browser only ever talks to same-origin routes. Backed by the
// partner-realm endpoints under `/api/fleet-partner/supply-submissions`.

import { CanvasCard, type CanvasTheme } from "@drts/ui-web";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { t, type Locale } from "@/lib/translations";

interface SupplySubmission {
  submissionId: string;
  submissionType: string;
  status: string;
  revisionNo: number;
  reviewReasonCode: string | null;
  reviewComment: string | null;
}

const SUBMISSION_TYPES = [
  "driver_onboarding",
  "vehicle_onboarding",
  "insurance_update",
  "contract_update",
  "driver_affiliation",
  "vehicle_affiliation",
] as const;

const EDITABLE_STATUSES = new Set(["draft", "needs_revision"]);
const PROXY_BASE = "/control-plane-proxy/fleet-partner/supply-submissions";

interface DriverDraftForm {
  name: string;
  mobile: string;
  professionalDriverLicenseNo: string;
  professionalDriverLicenseExpiry: string;
  taxiDriverRegistrationNo: string;
  taxiDriverRegistrationArea: string;
  taxiDriverRegistrationExpiry: string;
}

const EMPTY_DRIVER_DRAFT: DriverDraftForm = {
  name: "",
  mobile: "",
  professionalDriverLicenseNo: "",
  professionalDriverLicenseExpiry: "",
  taxiDriverRegistrationNo: "",
  taxiDriverRegistrationArea: "",
  taxiDriverRegistrationExpiry: "",
};

function extractError(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { code?: string; message?: string } })
      .error;
    if (error) {
      return error.message ?? error.code ?? null;
    }
  }
  return null;
}

async function apiCall<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: extractError(payload) ?? `HTTP ${response.status}`,
      };
    }
    const data = (payload as { data?: T } | null)?.data as T;
    return { ok: true, data };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

export function SubmissionsClient({
  locale,
  theme,
}: {
  locale: Locale;
  theme: CanvasTheme;
}) {
  const [submissions, setSubmissions] = useState<SupplySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newType, setNewType] =
    useState<(typeof SUBMISSION_TYPES)[number]>("driver_onboarding");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [driverDraft, setDriverDraft] =
    useState<DriverDraftForm>(EMPTY_DRIVER_DRAFT);

  const accent = theme.accent ?? "#1f7a5c";
  const border = theme.border ?? "#d8e0dc";

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await apiCall<{ items?: SupplySubmission[] }>(PROXY_BASE);
    if (result.ok) {
      setSubmissions(result.data?.items ?? []);
      setError(null);
    } else {
      setError(`${t("submissions.error", locale)}: ${result.error}`);
    }
    setLoading(false);
  }, [locale]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => submissions.find((item) => item.submissionId === selectedId) ?? null,
    [submissions, selectedId],
  );

  const createDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await apiCall<SupplySubmission>(PROXY_BASE, {
      method: "POST",
      body: JSON.stringify({ submissionType: newType }),
    });
    if (result.ok) {
      setSelectedId(result.data.submissionId);
      setDriverDraft(EMPTY_DRIVER_DRAFT);
      setMessage(t("submissions.created", locale));
      await refresh();
    } else {
      setError(`${t("submissions.error", locale)}: ${result.error}`);
    }
    setBusy(false);
  }, [newType, locale, refresh]);

  const saveDriverDraft = useCallback(async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiCall<unknown>(
      `${PROXY_BASE}/${selected.submissionId}/driver-draft`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...driverDraft,
          supportedServiceProductCodes: [],
          preferredVehicleSubmissionId: null,
        }),
      },
    );
    if (result.ok) {
      setMessage(t("submissions.draftSaved", locale));
    } else {
      setError(`${t("submissions.error", locale)}: ${result.error}`);
    }
    setBusy(false);
  }, [selected, driverDraft, locale]);

  const submitForReview = useCallback(
    async (submission: SupplySubmission) => {
      setBusy(true);
      setError(null);
      const result = await apiCall<unknown>(
        `${PROXY_BASE}/${submission.submissionId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ expectedRevisionNo: submission.revisionNo }),
        },
      );
      if (result.ok) {
        setMessage(t("submissions.submitted", locale));
        await refresh();
      } else {
        setError(`${t("submissions.error", locale)}: ${result.error}`);
      }
      setBusy(false);
    },
    [locale, refresh],
  );

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${border}`,
    borderRadius: 6,
    fontSize: 13,
    boxSizing: "border-box",
  };
  const primaryButton: CSSProperties = {
    background: accent,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
  const ghostButton: CSSProperties = {
    background: "transparent",
    color: accent,
    border: `1px solid ${accent}`,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    cursor: busy ? "not-allowed" : "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {(message || error) && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            background: error ? "#fdecea" : "#e9f6ef",
            color: error ? "#a11" : "#15643f",
          }}
        >
          {error ?? message}
        </div>
      )}

      <CanvasCard theme={theme} padding={16}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          {t("submissions.new", locale)}
        </div>
        <div
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <label style={{ fontSize: 13 }}>{t("submissions.type", locale)}</label>
          <select
            value={newType}
            onChange={(event) =>
              setNewType(
                event.target.value as (typeof SUBMISSION_TYPES)[number],
              )
            }
            style={{ ...inputStyle, width: "auto", minWidth: 220 }}
          >
            {SUBMISSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={primaryButton}
            disabled={busy}
            onClick={() => void createDraft()}
          >
            {t("submissions.create", locale)}
          </button>
          <button
            type="button"
            style={ghostButton}
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t("submissions.refresh", locale)}
          </button>
        </div>
      </CanvasCard>

      {selected && EDITABLE_STATUSES.has(selected.status) && (
        <CanvasCard theme={theme} padding={16}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {t("submissions.driverDraft", locale)} ·{" "}
            {selected.submissionId.slice(0, 8)}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {(
              [
                ["name", "submissions.driverName"],
                ["mobile", "submissions.driverMobile"],
                ["professionalDriverLicenseNo", "submissions.licenseNo"],
                ["professionalDriverLicenseExpiry", "submissions.licenseExpiry"],
                ["taxiDriverRegistrationNo", "submissions.regNo"],
                ["taxiDriverRegistrationArea", "submissions.regArea"],
                ["taxiDriverRegistrationExpiry", "submissions.regExpiry"],
              ] as const
            ).map(([field, labelKey]) => (
              <label key={field} style={{ fontSize: 12, display: "grid", gap: 4 }}>
                {t(labelKey, locale)}
                <input
                  value={driverDraft[field]}
                  onChange={(event) =>
                    setDriverDraft((prev) => ({
                      ...prev,
                      [field]: event.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={primaryButton}
              disabled={busy}
              onClick={() => void saveDriverDraft()}
            >
              {t("submissions.saveDraft", locale)}
            </button>
          </div>
        </CanvasCard>
      )}

      <CanvasCard theme={theme} padding={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#667" }}>
              <th style={{ padding: 12 }}>ID</th>
              <th style={{ padding: 12 }}>{t("submissions.type", locale)}</th>
              <th style={{ padding: 12 }}>{t("submissions.status", locale)}</th>
              <th style={{ padding: 12 }}>{t("submissions.revision", locale)}</th>
              <th style={{ padding: 12 }}>
                {t("submissions.reviewReason", locale)}
              </th>
              <th style={{ padding: 12 }} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "#889" }}>
                  {t("submissions.loading", locale)}
                </td>
              </tr>
            )}
            {!loading && submissions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "#889" }}>
                  {t("submissions.empty", locale)}
                </td>
              </tr>
            )}
            {submissions.map((submission) => (
              <tr
                key={submission.submissionId}
                style={{
                  borderTop: `1px solid ${border}`,
                  background:
                    submission.submissionId === selectedId
                      ? "#f3faf6"
                      : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedId(submission.submissionId)}
              >
                <td style={{ padding: 12, fontFamily: "monospace" }}>
                  {submission.submissionId.slice(0, 8)}
                </td>
                <td style={{ padding: 12 }}>{submission.submissionType}</td>
                <td style={{ padding: 12 }}>{submission.status}</td>
                <td style={{ padding: 12 }}>{submission.revisionNo}</td>
                <td style={{ padding: 12, color: "#778" }}>
                  {submission.reviewComment ?? submission.reviewReasonCode ?? "—"}
                </td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  {EDITABLE_STATUSES.has(submission.status) && (
                    <button
                      type="button"
                      style={ghostButton}
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void submitForReview(submission);
                      }}
                    >
                      {t("submissions.submitForReview", locale)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CanvasCard>
    </div>
  );
}
