/**
 * SR-PROOF-001 UI copy, scoped to this directory on purpose.
 *
 * `apps/platform-admin-web/lib/translations.ts` is the app's central
 * dictionary, but it is not in this task's `write_scopes` -- widening it
 * requires a supervisor-approved scope expansion this task does not have.
 * `t()`'s own fallback (see the central `translations.ts`'s `t()`) returns
 * the raw key string for anything missing from that dictionary, which would
 * show dotted keys in the rendered UI. This local `translations.ts` (the
 * repo convention for route-scoped bilingual copy, e.g.
 * `apps/platform-admin-web/app/users/translations.ts`) avoids that without
 * touching the shared file, covering only the new remittance-proof strings
 * this task's detail page adds.
 */
import type { Locale } from "@/lib/translations";

const DICTIONARY: Record<Locale, Record<string, string>> = {
  zh: {
    "proof.cardTitle": "匯款證明 · Remittance proof",
    "proof.cardSubtitle":
      "upload → pending_scan → confirmed / rejected · 拒絕空值／偽造／跨批次歸屬",
    "proof.notUploadedTitle": "尚未上傳匯款證明",
    "proof.notUploadedBody":
      "司機（driver realm）尚未透過匯款證明上傳流程送出此批次的證明檔案。",
    "proof.loadError": "無法載入匯款證明資訊",
    "proof.scanState.pending_scan": "掃描中",
    "proof.scanState.clean": "已確認",
    "proof.scanState.rejected": "已拒絕",
    "proof.metaScan": "掃描狀態",
    "proof.metaBatch": "批次",
    "proof.metaHash": "內容雜湊",
    "proof.metaUploadedBy": "上傳者",
    "proof.metaUploadedAt": "上傳時間",
    "proof.rejectionReason": "拒絕原因",
    "proof.viewButton": "下載原檔",
    "proof.viewing": "授權並下載中…",
    "proof.retryScan": "重試掃描",
    "proof.scanning": "掃描中…",
    "proof.reauthorizeButton": "重新授權",
    "proof.readbackAuthorizedTitle": "已授權讀取 · authorized readback",
    "proof.readbackAuthorizedBody":
      "原檔已開始下載。授權於 {expiresAt} 到期；授權請求會記錄操作者與時間，逾期需重新授權。",
    "proof.readbackExpiredTitle": "讀取授權已過期 · 需重新授權",
    "proof.readbackExpiredBody":
      "授權於 {expiresAt} 到期；需重新授權才能取得新的短效簽章連結。",
    "proof.readbackError": "無法掃描或下載匯款證明",
    "gate.title": "標記已付款 · 前置條件",
    "gate.subtitle":
      "mark-paid 需批次核准且證明 confirmed／掃描通過／歸屬核對一致，否則保持停用並顯示原因",
    "gate.batchApproved": "批次已核准",
    "gate.batchApprovedSub": "目前狀態：{status}",
    "gate.batchNotApprovedSub": "尚待核准",
    "gate.proofClean": "匯款證明已確認，掃描通過且歸屬核對一致",
    "gate.proofNotReadySub": "尚未有可用的已確認證明（scanState=clean）",
    "gate.proofReadySub": "{filename} · scan={scanState}",
    "payWithProof.button": "標記已付款",
    "payWithProof.saving": "處理中…",
    "payWithProof.error": "標記已付款失敗",
    "payWithProof.success":
      "已以匯款證明 {proofId} 標記付款，收據 {receiptId}。",
  },
  en: {
    "proof.cardTitle": "Remittance proof",
    "proof.cardSubtitle":
      "upload → pending_scan → confirmed / rejected · rejects blank/forged/cross-batch ownership",
    "proof.notUploadedTitle": "No remittance proof uploaded yet",
    "proof.notUploadedBody":
      "The driver has not yet submitted a proof file for this batch through the upload flow.",
    "proof.loadError": "Could not load remittance proof",
    "proof.scanState.pending_scan": "Scanning",
    "proof.scanState.clean": "Confirmed",
    "proof.scanState.rejected": "Rejected",
    "proof.metaScan": "Scan state",
    "proof.metaBatch": "Batch",
    "proof.metaHash": "Content hash",
    "proof.metaUploadedBy": "Uploaded by",
    "proof.metaUploadedAt": "Uploaded at",
    "proof.rejectionReason": "Rejection reason",
    "proof.viewButton": "Download original",
    "proof.viewing": "Authorizing and downloading…",
    "proof.retryScan": "Retry scan",
    "proof.scanning": "Scanning…",
    "proof.reauthorizeButton": "Re-authorize",
    "proof.readbackAuthorizedTitle": "Authorized readback",
    "proof.readbackAuthorizedBody":
      "The original file download has started. Authorization expires at {expiresAt}; re-authorize after expiry. Authorization requests record actor and timestamp.",
    "proof.readbackExpiredTitle": "Readback authorization expired",
    "proof.readbackExpiredBody":
      "The authorization expired at {expiresAt}; re-authorize to get a fresh short-lived signed link.",
    "proof.readbackError": "Could not scan or download the remittance proof",
    "gate.title": "Mark-paid preconditions",
    "gate.subtitle":
      "mark-paid requires an approved batch and a confirmed / scanned-clean / ownership-matched proof, or it stays disabled with a reason.",
    "gate.batchApproved": "Batch approved",
    "gate.batchApprovedSub": "Current status: {status}",
    "gate.batchNotApprovedSub": "Still awaiting approval",
    "gate.proofClean":
      "Remittance proof confirmed, scan passed, ownership matches",
    "gate.proofNotReadySub":
      "No confirmed (scanState=clean) proof is available yet",
    "gate.proofReadySub": "{filename} · scan={scanState}",
    "payWithProof.button": "Mark paid",
    "payWithProof.saving": "Saving…",
    "payWithProof.error": "Mark-paid failed",
    "payWithProof.success":
      "Marked paid with remittance proof {proofId}, receipt {receiptId}.",
  },
};

export function proofT(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  let value = DICTIONARY[locale]?.[key] ?? DICTIONARY.en[key] ?? key;
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (_, token) =>
      String(params[token as string] ?? `{${token}}`),
    );
  }
  return value;
}
