import type { Locale } from "../../lib/translations";

const zh = {
  operationFailed: "操作失敗，請核對權限／當前狀態後重試。",
  pendingCommand: "上一個命令結果尚待讀回，請先重試原命令。",
  invalidOrderId: "請貼上乘客剛建立的 UUID。",
  title: "同單審查演練・Ops",
  intro:
    "沿既有 Ops 身分與 BFF 權限操作真正後端；車司資格／供給與定位為虛構演練資料，通知不送真人。",
  disabled: "此 API 未啟用共享演練。",
  supplyTitle: "演練供給與司機裝置",
  prepared: "已準備兩組合成車司；未建立訂單、派遣或付款。",
  prepare: "準備虛構演練車司",
  driverLabel: "演練司機",
  invite: "發出既有司機裝置註冊碼",
  registrationNotice: "單次註冊碼（交給本場司機視窗，不納入證據）",
  registrationLabel: "演練裝置註冊碼",
  copyCode: "複製註冊碼",
  hideCode: "隱藏註冊碼",
  supplyNotice:
    "無車情境只切換這兩位演練司機的既有供給狀態；有進行中任務時請先完成或取消。",
  supplyPaused: "演練供給已離線；新派遣走真正無車流程。",
  supplyRestored: "演練供給已恢復；請依原流程重新派遣。",
  pauseSupply: "暫停演練供給",
  restoreSupply: "恢復演練供給",
  orderTitle: "乘客新建的同一張訂單",
  orderId: "訂單 UUID",
  readOrder: "讀回同單",
  orderStatus: "；狀態：",
  dispatchDetails: "既有派遣詳情／候選指派",
  dispatchBoard: "既有調度看板",
  createDispatch: "建立同單派遣",
  dispatchId: "派遣：",
  redispatchNote: "演練供給恢復，沿真派遣",
  redispatch: "依原流程重新派遣",
  assign: "指派 ",
  reassignNote: "演練改派，請乘客重新核對車牌",
  reassign: "改派 ",
  working: "處理中…",
} as const;

const en: Record<keyof typeof zh, string> = {
  operationFailed:
    "Operation failed. Check your permissions and the current state, then retry.",
  pendingCommand:
    "The previous command is awaiting confirmation. Retry that command first.",
  invalidOrderId: "Paste the UUID of the order just created by the passenger.",
  title: "Shared-order review rehearsal · Ops",
  intro:
    "Use the existing Ops identity and BFF permissions with the real backend. Driver qualifications, supply and locations are simulated; notifications are not delivered to real people.",
  disabled: "Shared rehearsal is not enabled on this API.",
  supplyTitle: "Rehearsal supply and driver devices",
  prepared:
    "Prepared two synthetic driver/vehicle groups. No orders, dispatches or payments were created.",
  prepare: "Prepare synthetic rehearsal drivers and vehicles",
  driverLabel: "Rehearsal driver",
  invite: "Issue an existing driver device registration code",
  registrationNotice:
    "Single-use registration code (share with this rehearsal's driver window; exclude from evidence)",
  registrationLabel: "Rehearsal device registration code",
  copyCode: "Copy registration code",
  hideCode: "Hide registration code",
  supplyNotice:
    "The no-supply scenario changes only these two rehearsal drivers' existing supply states. Finish or cancel active tasks first.",
  supplyPaused:
    "Rehearsal supply is offline. New dispatches use the real no-supply flow.",
  supplyRestored:
    "Rehearsal supply is restored. Redispatch through the original flow.",
  pauseSupply: "Pause rehearsal supply",
  restoreSupply: "Restore rehearsal supply",
  orderTitle: "The same order just created by the passenger",
  orderId: "Order UUID",
  readOrder: "Read back the same order",
  orderStatus: "; status: ",
  dispatchDetails: "Existing dispatch details and candidate assignment",
  dispatchBoard: "Existing dispatch board",
  createDispatch: "Create dispatch for this order",
  dispatchId: "Dispatch: ",
  redispatchNote: "Rehearsal supply restored; use real dispatch",
  redispatch: "Redispatch through the original flow",
  assign: "Assign ",
  reassignNote:
    "Rehearsal reassignment; ask the passenger to check the plate again",
  reassign: "Reassign ",
  working: "Working…",
};

export function reviewCopy(locale: Locale): Record<keyof typeof zh, string> {
  return locale === "en" ? en : zh;
}
