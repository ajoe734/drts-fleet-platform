"use client";

import type { AgencyTripExportScope } from "@drts/contracts";
import { useState } from "react";

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
  const response = await fetch(`/api/agency/${path}`, {
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
}: {
  initialScope?:
    | { [K in keyof AgencyTripExportScope]?: string | undefined }
    | undefined;
} = {}) {
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
        ? "此帳號沒有匯出權限（agency_exporter），或資料不屬於本機關。"
        : body?.error?.message ||
            body?.error?.code ||
            `操作失敗（HTTP ${status}）`,
    );

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <label>
        月份{" "}
        <input
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="YYYY-MM"
        />
      </label>
      <label>
        預約日起{" "}
        <input
          type="date"
          value={reservedFrom}
          onChange={(e) => setReservedFrom(e.target.value)}
        />
      </label>
      <label>
        預約日迄{" "}
        <input
          type="date"
          value={reservedTo}
          onChange={(e) => setReservedTo(e.target.value)}
        />
      </label>
      <label>
        車號（精確）{" "}
        <input
          value={plateNo}
          onChange={(e) => setPlateNo(e.target.value)}
          placeholder="例如 BKR-2208"
        />
      </label>
      <label>
        訂單編號（精確）{" "}
        <input
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          placeholder="完整訂單編號"
        />
      </label>
      <label>
        訂單 ID（精確）{" "}
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="完整 orderId"
        />
      </label>
      <label>
        趟次 ID（精確）{" "}
        <input
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          placeholder="完整 tripId"
        />
      </label>
      <label>
        紀錄 ID（精確）{" "}
        <input
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
          placeholder="mtr-..."
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          setMessage(null);
          const result = await call<{ record_count: number }>(
            "trip-records/export-jobs/preview",
            { method: "POST", body: { scope } },
          );
          if (!result.ok) return fail(result.status, result.body);
          setRecordCount(result.body?.data?.record_count ?? null);
        }}
      >
        預覽筆數
      </button>
      {recordCount !== null ? <p>符合保存期間的筆數：{recordCount}</p> : null}
      <label>
        匯出目的（必填）
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
          setMessage(null);
          const result = await call<{ job_id: string; status: string }>(
            "trip-records/export-jobs",
            {
              method: "POST",
              body: { scope, purpose, idempotencyKey: newIdempotencyKey() },
            },
          );
          if (!result.ok) return fail(result.status, result.body);
          setJobId(result.body?.data?.job_id ?? null);
          setJobStatus(result.body?.data?.status ?? null);
          setDownloadUrl(null);
        }}
      >
        建立匯出
      </button>
      {jobId ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p>
            匯出編號 <code>{jobId}</code> · 狀態：{jobStatus ?? "未提供"}
          </p>
          <button
            type="button"
            onClick={async () => {
              const result = await call<{ status: string }>(
                `trip-records/export-jobs/${encodeURIComponent(jobId)}`,
              );
              if (!result.ok) return fail(result.status, result.body);
              setJobStatus(result.body?.data?.status ?? null);
            }}
          >
            重新查詢狀態
          </button>
          <button
            type="button"
            disabled={jobStatus !== "completed"}
            onClick={async () => {
              const result = await call<{
                download: { download_url?: string };
              }>(
                `trip-records/export-jobs/${encodeURIComponent(jobId)}/download`,
              );
              if (!result.ok) return fail(result.status, result.body);
              setDownloadUrl(result.body?.data?.download?.download_url ?? null);
            }}
          >
            取得下載連結
          </button>
          {downloadUrl ? (
            <a href={downloadUrl} rel="noreferrer">
              下載（連結有效期限內）
            </a>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
