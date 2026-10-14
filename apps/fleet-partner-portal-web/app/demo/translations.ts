import type { Locale } from "../../lib/translations";
import type {
  DocumentDemoAction,
  DemoSubmissionStatus,
  ExampleId,
  ScannerStatus,
  StorageStatus,
} from "../../lib/fleet-document-demo";

interface DocumentDemoCopy {
  nav: string;
  title: string;
  banner: string;
  notice: string;
  loading: string;
  storageError: string;
  exportError: string;
  reset: string;
  download: string;
  example: string;
  select: string;
  placeholder: string;
  examples: Record<ExampleId, string>;
  metadata: string;
  name: string;
  type: string;
  size: string;
  storage: string;
  scanner: string;
  externalHint: string;
  skippedHint: string;
  status: string;
  attempts: string;
  actions: string;
  states: Record<StorageStatus | ScannerStatus, string>;
  action: Record<DocumentDemoAction, string>;
  local: string;
  confirmed: string;
  unconfirmed: string;
  localHint: string;
  submission: Record<DemoSubmissionStatus, string>;
  live: string;
  liveHint: string;
  history: string;
  noEvents: string;
}

const en: DocumentDemoCopy = {
  nav: "Document demo · SIMULATION",
  title: "Fleet document demonstration",
  banner: "SIMULATION ONLY · Example document metadata",
  notice:
    "All steps and outcomes below are SIMULATION. No file is uploaded or scanned, no provider receipt is issued, and no real partner submission or document is changed. Progress stays in this browser only.",
  loading: "Loading local simulation…",
  storageError:
    "Browser storage is unavailable. You can continue here, but progress will be lost when you leave this page.",
  exportError: "Unable to download the simulation record. Please retry.",
  reset: "Reset document simulation",
  download: "Download SIMULATION evidence (JSON)",
  example: "1. Example document · SIMULATION",
  select: "Select example metadata",
  placeholder: "Choose a harmless example",
  examples: {
    vehicle_registration: "Example vehicle registration · SIMULATION",
    other: "Example supporting document · SIMULATION",
  },
  metadata: "Selected example metadata · SIMULATION",
  name: "Example filename",
  type: "Document type / content type",
  size: "Illustrative size (bytes)",
  storage: "2. External storage · SIMULATION",
  scanner: "3. External scanner · SIMULATION",
  externalHint:
    "Choose an outcome after starting an attempt. Failure can be retried or explicitly skipped; no external request is made.",
  skippedHint:
    "Skipped means no storage or scan was performed. Local continuation is illustrative and never marks a skipped scan as clean.",
  status: "SIMULATION status",
  attempts: "Simulated attempts",
  actions: "Simulation controls",
  states: {
    idle: "SIMULATION · Not started",
    pending: "SIMULATION · Pending",
    failed: "SIMULATION · Service unavailable",
    skipped: "SIMULATION · Skipped",
    simulated_stored: "SIMULATION · Storage success (no file stored)",
    simulated_pass: "SIMULATION · Scan pass (no scan performed)",
  },
  action: {
    "select.vehicle_registration": "Select example vehicle registration",
    "select.other": "Select example supporting document",
    "storage.start": "Start simulated storage",
    "storage.fail": "Simulate storage failure",
    "storage.retry": "Retry simulated storage",
    "storage.succeed": "Simulate storage success",
    "storage.skip": "Skip external storage (SIMULATION)",
    "scanner.start": "Start simulated scan",
    "scanner.fail": "Simulate scanner failure",
    "scanner.retry": "Retry simulated scan",
    "scanner.succeed": "Simulate scan pass",
    "scanner.skip": "Skip external scanning (SIMULATION)",
    "document.confirm": "Confirm example document (SIMULATION)",
    "submission.submit": "Submit example for review (SIMULATION)",
    "submission.withdraw": "Withdraw example submission (SIMULATION)",
    "submission.resubmit": "Resubmit example for review (SIMULATION)",
  },
  local: "4. Local supply submission · SIMULATION",
  confirmed: "SIMULATION · Example document confirmed locally",
  unconfirmed: "SIMULATION · Example document not confirmed",
  localHint:
    "Resolve or explicitly skip both external steps, then confirm the example. Submit, withdraw and resubmit the local sample. This does not approve a driver or vehicle for service.",
  submission: {
    draft: "SIMULATION · Draft",
    submitted: "SIMULATION · Submitted for review",
    withdrawn: "SIMULATION · Withdrawn",
  },
  live: "Open real supply submissions",
  liveHint:
    "The real workflow requires actual upload and scan success. No example state is transferred to the real forms.",
  history: "SIMULATION event history",
  noEvents: "Choose example metadata to begin.",
};

const zh: DocumentDemoCopy = {
  nav: "文件示範 · SIMULATION",
  title: "車隊文件流程示範",
  banner: "SIMULATION ONLY · 範例文件資料",
  notice:
    "以下每個步驟與結果都是 SIMULATION 示範。不會上傳或掃描檔案、不會產生服務商收據，也不會變更真實車隊申請或文件。進度僅保留於此瀏覽器。",
  loading: "載入本機示範中…",
  storageError: "瀏覽器無法儲存進度，仍可操作，但離開頁面後將失去進度。",
  exportError: "無法下載示範紀錄，請重試。",
  reset: "重設文件示範",
  download: "下載 SIMULATION 證據（JSON）",
  example: "1. 範例文件 · SIMULATION",
  select: "選擇範例文件資料",
  placeholder: "請選擇無敏感資訊的範例",
  examples: {
    vehicle_registration: "範例行照 · SIMULATION",
    other: "範例補充文件 · SIMULATION",
  },
  metadata: "已選範例資料 · SIMULATION",
  name: "範例檔名",
  type: "文件類型／內容類型",
  size: "示意大小（bytes）",
  storage: "2. 外部儲存 · SIMULATION",
  scanner: "3. 外部掃描 · SIMULATION",
  externalHint:
    "開始嘗試後選擇示範結果。失敗可重試或明示跳過；不會發出外部請求。",
  skippedHint:
    "跳過表示沒有執行儲存或掃描。後續僅為本機示範，跳過的掃描不會標記為通過。",
  status: "SIMULATION 狀態",
  attempts: "模擬嘗試次數",
  actions: "示範操作",
  states: {
    idle: "SIMULATION · 尚未開始",
    pending: "SIMULATION · 等待中",
    failed: "SIMULATION · 外部服務無法使用",
    skipped: "SIMULATION · 已跳過",
    simulated_stored: "SIMULATION · 儲存成功（未儲存檔案）",
    simulated_pass: "SIMULATION · 掃描通過（未執行掃描）",
  },
  action: {
    "select.vehicle_registration": "選擇範例行照",
    "select.other": "選擇範例補充文件",
    "storage.start": "開始模擬儲存",
    "storage.fail": "模擬儲存失敗",
    "storage.retry": "重試模擬儲存",
    "storage.succeed": "模擬儲存成功",
    "storage.skip": "跳過外部儲存（SIMULATION）",
    "scanner.start": "開始模擬掃描",
    "scanner.fail": "模擬掃描失敗",
    "scanner.retry": "重試模擬掃描",
    "scanner.succeed": "模擬掃描通過",
    "scanner.skip": "跳過外部掃描（SIMULATION）",
    "document.confirm": "確認範例文件（SIMULATION）",
    "submission.submit": "送審範例申請（SIMULATION）",
    "submission.withdraw": "撤回範例申請（SIMULATION）",
    "submission.resubmit": "重新送審範例申請（SIMULATION）",
  },
  local: "4. 本機供給申請 · SIMULATION",
  confirmed: "SIMULATION · 範例文件已在本機確認",
  unconfirmed: "SIMULATION · 範例文件尚未確認",
  localHint:
    "完成或明示跳過兩個外部步驟，再確認範例。接著可送審、撤回與重新送審本機範例，不會核准真實司機或車輛上線。",
  submission: {
    draft: "SIMULATION · 草稿",
    submitted: "SIMULATION · 已送審",
    withdrawn: "SIMULATION · 已撤回",
  },
  live: "開啟正式供給申請",
  liveHint: "正式流程仍須真正上傳與掃描成功。範例資料不會帶入正式表單。",
  history: "SIMULATION 操作紀錄",
  noEvents: "選擇範例文件資料後開始操作。",
};

export function documentDemoCopy(locale: Locale): DocumentDemoCopy {
  return locale === "en" ? en : zh;
}
