import type { Locale } from "@/lib/translations";

const copy = {
  en: {
    cardTitle: "Remittance proof",
    cardSubtitle:
      "upload -> pending_scan -> clean / rejected · fake ids, wrong batches and unscanned proofs never unlock payment",
    chooseFile: "Choose file",
    noFileChosen: "No file chosen",
    stateNotUploaded: "Not uploaded",
    stateRequestingIntent: "Requesting upload authority",
    stateUploading: "Uploading",
    stateConfirming: "Confirming with server",
    statePendingScan: "Pending scan",
    stateClean: "Confirmed · scan passed",
    stateRejected: "Rejected",
    stateError: "Upload failed",
    retry: "Retry",
    scanLabel: "scan",
    ownershipLabel: "batch",
    hashLabel: "hash",
    uploadedAtLabel: "uploaded",
    storageUnavailable:
      "Remittance proof storage is not provisioned in this environment. This is a real, honest failure — not a fake success.",
    gateTitle: "Mark-paid preconditions",
    gateSubtitle:
      "mark-paid requires an approved batch and a proof that is confirmed, clean-scanned, and owned by this batch, otherwise it stays disabled with a reason",
    gateBatchApproved: "Batch is approved",
    gateBatchApprovedSub: (state: string) => `current state · ${state}`,
    gateProofReady: "Remittance proof is confirmed, scan passed, ownership matches",
    gateProofReadySub: (fileName: string, scanState: string) =>
      `${fileName} · scan=${scanState}`,
    gateProofMissingSub: "no confirmed proof uploaded for this batch yet",
    markPaid: "Mark paid",
    markingPaid: "Marking paid…",
    markPaidReasonBatchNotApproved: "batch is not yet approved",
    markPaidReasonProofNotConfirmed:
      "remittance proof is not yet confirmed with a clean scan",
    viewProof: "View",
    readbackAuthorized: "Authorized readback",
    readbackExpired: "Readback authorization expired — reauthorize",
    readbackBody: (expiresAt: string) =>
      `This signed link is valid until ${expiresAt}; every read is written to the audit log.`,
    reauthorize: "Reauthorize",
    paidReceiptLabel: "Payment receipt",
  },
  zh: {
    cardTitle: "匯款證明",
    cardSubtitle:
      "upload → pending_scan → confirmed / rejected · 虛構ID、跨批次、未掃描皆無法解鎖付款",
    chooseFile: "選擇檔案",
    noFileChosen: "尚未選擇檔案",
    stateNotUploaded: "尚未上傳",
    stateRequestingIntent: "請求上傳授權中",
    stateUploading: "上傳中",
    stateConfirming: "伺服器確認中",
    statePendingScan: "掃描中",
    stateClean: "已確認 · 掃描通過",
    stateRejected: "已拒絕",
    stateError: "上傳失敗",
    retry: "重試",
    scanLabel: "scan",
    ownershipLabel: "batch",
    hashLabel: "hash",
    uploadedAtLabel: "上傳時間",
    storageUnavailable:
      "此環境尚未配置匯款證明儲存服務，如實回報為失敗，不冒充成功。",
    gateTitle: "標記已付款 · 前置條件",
    gateSubtitle:
      "mark-paid 需批次已核准且證明已 confirmed／掃描通過／歸屬核對一致，否則保持停用並顯示原因",
    gateBatchApproved: "批次已核准",
    gateBatchApprovedSub: (state: string) => `目前狀態 · ${state}`,
    gateProofReady: "匯款證明已 confirmed，掃描通過且歸屬核對一致",
    gateProofReadySub: (fileName: string, scanState: string) =>
      `${fileName} · scan=${scanState}`,
    gateProofMissingSub: "此批次尚無已確認的匯款證明",
    markPaid: "標記已付款",
    markingPaid: "標記中…",
    markPaidReasonBatchNotApproved: "批次尚未核准",
    markPaidReasonProofNotConfirmed: "匯款證明尚未通過掃描確認",
    viewProof: "檢視",
    readbackAuthorized: "已授權讀取",
    readbackExpired: "讀取授權已過期 · 需重新授權",
    readbackBody: (expiresAt: string) =>
      `此簽章連結於 ${expiresAt} 前有效；每次讀取皆寫入稽核。`,
    reauthorize: "重新授權",
    paidReceiptLabel: "付款收據",
  },
} as const;

export type RemittanceProofCopyKey = keyof (typeof copy)["en"];

export function proofT(locale: Locale, key: RemittanceProofCopyKey) {
  return copy[locale][key];
}
