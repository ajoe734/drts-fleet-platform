"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupplySubmissionRecord, SupplySubmissionStatus } from "@drts/contracts";
import { CanvasBanner, CanvasBtn, CanvasCard, CanvasEmptyState, CanvasPageHeader, CanvasPill, CanvasTable, buildCanvasTheme, type CanvasTableColumn, type CanvasTone } from "@drts/ui-web";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { classifySupplyReviewFailure, listSupplyReviewSubmissions, mutateSupplyReview } from "./supply-review-client";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const body = { padding: 24, display: "grid", gap: 16 } as const;
const mono = { fontFamily: theme.monoFamily, fontSize: 11.5 } as const;

const statusText: Record<SupplySubmissionStatus, string> = {
  draft: "草稿", submitted: "待受理", in_review: "審核中", needs_revision: "已退補正", approved: "已核可", rejected: "已駁回", withdrawn: "已撤回",
};
const statusTone: Record<SupplySubmissionStatus, CanvasTone> = {
  draft: "neutral", submitted: "info", in_review: "accent", needs_revision: "warn", approved: "success", rejected: "danger", withdrawn: "neutral",
};
const typeText: Record<SupplySubmissionRecord["submissionType"], string> = {
  driver_onboarding: "司機", vehicle_onboarding: "車輛", insurance_update: "保險", contract_update: "契約", driver_affiliation: "司機歸屬", vehicle_affiliation: "車輛歸屬",
};

export default function SupplyReviewQueuePage() {
  const client = usePlatformAdminClient();
  const [items, setItems] = useState<SupplySubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "mine" | "history">("pending");
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setFailure(null);
    try { setItems(await listSupplyReviewSubmissions(client)); }
    catch (error) { setFailure(classifySupplyReviewFailure(error)); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => items.filter((item) =>
    filter === "pending" ? ["submitted", "in_review"].includes(item.status) :
    filter === "mine" ? item.status === "in_review" : ["needs_revision", "approved", "rejected", "withdrawn"].includes(item.status),
  ), [filter, items]);

  const start = async (submission: SupplySubmissionRecord) => {
    setStarting(submission.submissionId); setFailure(null);
    try {
      const updated = await mutateSupplyReview(client, submission.submissionId, "start", {
        expectedRevisionNo: submission.revisionNo, reasonCode: "initial_screening", comment: "Platform review started.",
      });
      setItems((current) => current.map((item) => item.submissionId === updated.submissionId ? updated : item));
    } catch (error) { setFailure(classifySupplyReviewFailure(error)); }
    finally { setStarting(null); }
  };

  const columns: CanvasTableColumn<(SupplySubmissionRecord & Record<string, unknown>)>[] = [
    { h: "ID", r: (row) => <Link href={`/supply-review/${encodeURIComponent(row.submissionId)}`} style={{ ...mono, color: theme.accent, fontWeight: 700 }}>{row.submissionId}</Link> },
    { h: "類型", r: (row) => <CanvasPill tone="neutral">{typeText[row.submissionType]}</CanvasPill> },
    { h: "車行 · fleet", r: (row) => <span style={mono}>{row.fleetPartnerId || "—"}</span> },
    { h: "subject", r: (row) => <span style={mono}>{row.subjectDriverId ?? row.subjectVehicleId ?? "新建資料"}</span> },
    { h: "rev", r: (row) => <span style={mono}>{row.revisionNo}</span> },
    { h: "狀態", r: (row) => <CanvasPill tone={statusTone[row.status]} dot>{statusText[row.status]} <span style={mono}>{row.status}</span></CanvasPill> },
    { h: "送審", r: (row) => row.submittedAt ? formatDateTime(row.submittedAt) : "—" },
    { h: "鎖定", r: (row) => row.reviewStartedBy ? <span style={mono}>{row.reviewStartedBy}</span> : "—" },
    { h: "", r: (row) => row.status === "submitted" ? <CanvasBtn size="xs" variant="primary" disabled={Boolean(starting)} onClick={() => void start(row)}>{starting === row.submissionId ? "受理中…" : "受理審核"}</CanvasBtn> : <Link href={`/supply-review/${encodeURIComponent(row.submissionId)}`}><CanvasBtn size="xs">開啟</CanvasBtn></Link> },
  ];

  const stateMessage = failure === "forbidden" ? "此帳號沒有供給審核權限。伺服器已拒絕此範圍的存取。" :
    failure === "unauthenticated" ? "登入已失效，請重新登入後再試。" :
    failure === "revision_conflict" ? "該送件已更新，請重新載入後再操作。" : "無法載入供給審核資料，未顯示任何替代資料。";
  return <div style={body}>
    <CanvasPageHeader title="供給審核佇列 · Supply Review" subtitle="車行送件 → 審核 → 核可寫入 canonical registry" actions={<CanvasBtn onClick={() => void load()} disabled={loading}>重新載入</CanvasBtn>} />
    <CanvasCard title="審核佇列" subtitle="依後端目前狀態呈現；已由他人受理的送件會顯示鎖定審核人。" actions={<select aria-label="審核佇列篩選" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: "7px 10px", background: theme.bgRaised, color: theme.text }}><option value="pending">待審</option><option value="mine">我審核中</option><option value="history">歷史</option></select>}>
      {failure ? <CanvasBanner tone="danger" title="讀取失敗" body={stateMessage} actions={<CanvasBtn size="xs" onClick={() => void load()}>重試</CanvasBtn>} /> : null}
      {loading ? <p>正在載入供給送件…</p> : null}
      {!loading && !failure && visible.length === 0 ? <CanvasEmptyState title="沒有符合條件的送件" body="請切換篩選條件或重新載入。" /> : null}
      {!loading && !failure && visible.length > 0 ? <CanvasTable columns={columns} rows={visible as (SupplySubmissionRecord & Record<string, unknown>)[]} /> : null}
    </CanvasCard>
  </div>;
}
