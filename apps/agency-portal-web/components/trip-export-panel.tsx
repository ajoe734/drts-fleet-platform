"use client";

import type { AgencyTripExportScope } from "@drts/contracts";
import { useEffect, useRef, useState } from "react";

import { displayStatusCode } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

/** Raw BFF passthrough: the API wire format is snake_case. */
type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };

function readCookie(name: string): string | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function call<T>(
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<{ ok: boolean; status: number; body: ApiEnvelope<T> | null }> {
  let response: Response;
  try {
    response = await fetch(`/api/agency/${path}`, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      headers: init
        ? {
            "Content-Type": "application/json",
            "x-csrf-token": readCookie("drts_agency_csrf") ?? "",
          }
        : {},
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return { ok: false, status: 0, body: null };
  }
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  return { ok: response.ok, status: response.status, body };
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * R11 controlled export: preview the retained record count, create a job
 * with a stated purpose, then poll and request a signed download. Only
 * agency_exporter sessions are authorized; every step is access-logged.
 */
export function TripExportPanel({
  initialScope,
  locale: explicitLocale,
}: {
  initialScope?:
    | { [K in keyof AgencyTripExportScope]?: string | undefined }
    | undefined;
  locale?: Locale;
} = {}) {
  const { locale, t } = useTranslation(explicitLocale);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    setInteractive(true);
  }, []);
  const [month, setMonth] = useState(initialScope?.month ?? "");
  const [reservedFrom, setReservedFrom] = useState(
    initialScope?.reservedFrom ?? "",
  );
  const [reservedTo, setReservedTo] = useState(initialScope?.reservedTo ?? "");
  const [plateNo, setPlateNo] = useState(initialScope?.plateNo ?? "");
  const [orderNo, setOrderNo] = useState(initialScope?.orderNo ?? "");
  const [orderId, setOrderId] = useState(initialScope?.orderId ?? "");
  const [tripId, setTripId] = useState(initialScope?.tripId ?? "");
  const [recordId, setRecordId] = useState(initialScope?.recordId ?? "");
  const [purpose, setPurpose] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const scopeVersionRef = useRef(0);
  const previewReqVersionRef = useRef(0);
  const jobVersionRef = useRef(0);
  const statusReqVersionRef = useRef(0);
  const downloadReqVersionRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  // The page lists no jobs, so a create that fails must give the last shown
  // job and its link back.
  const lastJobRef = useRef<{
    jobId: string;
    jobStatus: string | null;
    downloadUrl: string | null;
  } | null>(null);
  useEffect(() => {
    if (jobId) lastJobRef.current = { jobId, jobStatus, downloadUrl };
  }, [jobId, jobStatus, downloadUrl]);

  const resetScopeDerivedState = () => {
    scopeVersionRef.current += 1;
    previewReqVersionRef.current += 1;
    jobVersionRef.current += 1;
    statusReqVersionRef.current += 1;
    downloadReqVersionRef.current += 1;
    activeJobIdRef.current = null;
    lastJobRef.current = null;
    setMessage(null);
    setRecordCount(null);
    setJobId(null);
    setJobStatus(null);
    setDownloadUrl(null);
  };

  const updateScopeField = (
    currentValue: string,
    setter: (value: string) => void,
    nextValue: string,
  ) => {
    setter(nextValue);
    if (nextValue.trim() !== currentValue.trim()) {
      resetScopeDerivedState();
    }
  };

  const scope: AgencyTripExportScope = {
    ...(month.trim() ? { month: month.trim() } : {}),
    ...(reservedFrom.trim() ? { reservedFrom: reservedFrom.trim() } : {}),
    ...(reservedTo.trim() ? { reservedTo: reservedTo.trim() } : {}),
    ...(plateNo.trim() ? { plateNo: plateNo.trim() } : {}),
    ...(orderNo.trim() ? { orderNo: orderNo.trim() } : {}),
    ...(orderId.trim() ? { orderId: orderId.trim() } : {}),
    ...(tripId.trim() ? { tripId: tripId.trim() } : {}),
    ...(recordId.trim() ? { recordId: recordId.trim() } : {}),
  };
  const fail = (status: number, body: ApiEnvelope<unknown> | null) =>
    setMessage(
      status === 403
        ? t("tripExports.error.forbidden403")
        : body?.error?.message ||
            body?.error?.code ||
            t("tripExports.error.operationFailed", { status }),
    );

  return (
    <fieldset
      disabled={!interactive}
      aria-busy={!interactive}
      style={{
        display: "grid",
        gap: 12,
        maxWidth: 640,
        minWidth: 0,
        border: 0,
        padding: 0,
        margin: 0,
      }}
    >
      <label>
        {t("tripExports.month")}{" "}
        <input
          value={month}
          onChange={(e) => updateScopeField(month, setMonth, e.target.value)}
          placeholder="YYYY-MM"
        />
      </label>
      <label>
        {t("tripExports.reservedFrom")}{" "}
        <input
          type="date"
          value={reservedFrom}
          onChange={(e) =>
            updateScopeField(reservedFrom, setReservedFrom, e.target.value)
          }
        />
      </label>
      <label>
        {t("tripExports.reservedTo")}{" "}
        <input
          type="date"
          value={reservedTo}
          onChange={(e) =>
            updateScopeField(reservedTo, setReservedTo, e.target.value)
          }
        />
      </label>
      <label>
        {t("tripRecords.filter.plateNo")}{" "}
        <input
          value={plateNo}
          onChange={(e) =>
            updateScopeField(plateNo, setPlateNo, e.target.value)
          }
          placeholder={t("tripRecords.filter.plateNoPlaceholder")}
        />
      </label>
      <label>
        {t("tripRecords.filter.orderNo")}{" "}
        <input
          value={orderNo}
          onChange={(e) =>
            updateScopeField(orderNo, setOrderNo, e.target.value)
          }
          placeholder={t("tripRecords.filter.orderNoPlaceholder")}
        />
      </label>
      <label>
        {t("tripRecords.filter.orderId")}{" "}
        <input
          value={orderId}
          onChange={(e) =>
            updateScopeField(orderId, setOrderId, e.target.value)
          }
          placeholder={t("tripRecords.filter.orderIdPlaceholder")}
        />
      </label>
      <label>
        {t("tripRecords.filter.tripId")}{" "}
        <input
          value={tripId}
          onChange={(e) => updateScopeField(tripId, setTripId, e.target.value)}
          placeholder={t("tripRecords.filter.tripIdPlaceholder")}
        />
      </label>
      <label>
        {t("tripRecords.filter.recordId")}{" "}
        <input
          value={recordId}
          onChange={(e) =>
            updateScopeField(recordId, setRecordId, e.target.value)
          }
          placeholder="mtr-..."
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          const requestScopeVersion = scopeVersionRef.current;
          const requestJobVersion = jobVersionRef.current;
          const requestPreviewVersion = ++previewReqVersionRef.current;
          setMessage(null);
          setRecordCount(null);
          const result = await call<{ record_count: number }>(
            "trip-records/export-jobs/preview",
            { method: "POST", body: { scope } },
          );
          if (
            requestScopeVersion !== scopeVersionRef.current ||
            requestPreviewVersion !== previewReqVersionRef.current
          ) {
            return;
          }
          if (!result.ok) {
            // A preview error must not read as an error of a newer job.
            if (requestJobVersion === jobVersionRef.current)
              fail(result.status, result.body);
            return;
          }
          setRecordCount(result.body?.data?.record_count ?? null);
        }}
      >
        {t("tripExports.previewBtn")}
      </button>
      {recordCount !== null ? (
        <p>{t("tripExports.previewCount", { count: recordCount })}</p>
      ) : null}
      <label>
        {t("tripExports.purposeLabel")}
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          style={{ width: "100%" }}
        />
      </label>
      <button
        type="button"
        disabled={!purpose.trim()}
        onClick={async () => {
          const requestScopeVersion = scopeVersionRef.current;
          const requestJobVersion = ++jobVersionRef.current;
          statusReqVersionRef.current += 1;
          downloadReqVersionRef.current += 1;
          activeJobIdRef.current = null;
          setMessage(null);
          setJobId(null);
          setJobStatus(null);
          setDownloadUrl(null);
          const result = await call<{ job_id: string; status: string }>(
            "trip-records/export-jobs",
            {
              method: "POST",
              body: { scope, purpose, idempotencyKey: newIdempotencyKey() },
            },
          );
          if (
            requestScopeVersion !== scopeVersionRef.current ||
            requestJobVersion !== jobVersionRef.current
          ) {
            return;
          }
          if (!result.ok) {
            const last = lastJobRef.current;
            activeJobIdRef.current = last?.jobId ?? null;
            setJobId(last?.jobId ?? null);
            setJobStatus(last?.jobStatus ?? null);
            setDownloadUrl(last?.downloadUrl ?? null);
            return fail(result.status, result.body);
          }
          const nextJobId = result.body?.data?.job_id ?? null;
          const nextJobStatus = result.body?.data?.status ?? null;
          activeJobIdRef.current = nextJobId;
          setJobId(nextJobId);
          setJobStatus(nextJobStatus);
          setDownloadUrl(null);
        }}
      >
        {t("tripExports.createBtn")}
      </button>
      {jobId ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p>
            {t("tripExports.jobIdPrefix")} <code>{jobId}</code> ·{" "}
            {t("tripExports.jobStatusLabel", {
              status: displayStatusCode(jobStatus, locale),
            })}
          </p>
          <button
            type="button"
            onClick={async () => {
              const targetJobId = jobId;
              const requestScopeVersion = scopeVersionRef.current;
              const requestJobVersion = jobVersionRef.current;
              const requestStatusVersion = ++statusReqVersionRef.current;
              setMessage(null);
              const result = await call<{ status: string }>(
                `trip-records/export-jobs/${encodeURIComponent(targetJobId)}`,
              );
              if (
                requestScopeVersion !== scopeVersionRef.current ||
                requestJobVersion !== jobVersionRef.current ||
                requestStatusVersion !== statusReqVersionRef.current ||
                activeJobIdRef.current !== targetJobId
              ) {
                return;
              }
              if (!result.ok) return fail(result.status, result.body);
              const nextStatus = result.body?.data?.status ?? null;
              setJobStatus(nextStatus);
              if (nextStatus !== "completed") {
                downloadReqVersionRef.current += 1;
                setDownloadUrl(null);
              }
            }}
          >
            {t("tripExports.refreshStatusBtn")}
          </button>
          <button
            type="button"
            disabled={jobStatus !== "completed"}
            onClick={async () => {
              const targetJobId = jobId;
              const requestScopeVersion = scopeVersionRef.current;
              const requestJobVersion = jobVersionRef.current;
              statusReqVersionRef.current += 1;
              const requestDownloadVersion = ++downloadReqVersionRef.current;
              setMessage(null);
              const result = await call<{
                download: { download_url?: string };
              }>(
                `trip-records/export-jobs/${encodeURIComponent(targetJobId)}/download`,
              );
              if (
                requestScopeVersion !== scopeVersionRef.current ||
                requestJobVersion !== jobVersionRef.current ||
                requestDownloadVersion !== downloadReqVersionRef.current ||
                activeJobIdRef.current !== targetJobId
              ) {
                return;
              }
              if (!result.ok) {
                setDownloadUrl(null);
                return fail(result.status, result.body);
              }
              setDownloadUrl(result.body?.data?.download?.download_url ?? null);
            }}
          >
            {t("tripExports.getDownloadBtn")}
          </button>
          {downloadUrl ? (
            <a href={downloadUrl} rel="noreferrer">
              {t("tripExports.downloadLink")}
            </a>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
