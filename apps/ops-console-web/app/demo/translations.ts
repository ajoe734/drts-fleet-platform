import type { DemoAction, DemoDomain } from "./demo-state";

const en = {
  title: "External service simulation",
  subtitle: "Try the workflows while external services are unavailable.",
  banner: "SIMULATION ONLY · Fictional people, orders and messages",
  notice:
    "These controls only change this browser's demo. They do not place calls, send notifications or email, contact an issuer, or dispatch a real order. Progress is saved on this browser until you reset it.",
  loading: "Loading the saved simulation…",
  reset: "Reset all scenarios",
  export: "Download simulation record (JSON)",
  storageError:
    "Browser storage is unavailable. You can continue, but changes will be lost when this page closes.",
  exportError:
    "The simulation record could not be downloaded. Please try again.",
  status: "Scenario status",
  attempts: "Transmission attempts",
  actions: "Simulation controls",
  inbox: "Simulated inbox",
  inboxEmpty:
    "No simulated messages have arrived yet. Queue a message, then choose delivery success.",
  inboxHint:
    "These messages exist only in this demonstration; no recipient was contacted.",
  events: "Scenario event history",
  eventsEmpty: "Use any scenario control to record the first event.",
  live: "Leave simulation: open the live workspace",
  liveHint:
    "The live workspace uses your existing sign-in and service availability.",
  person: "Demo passenger: Morgan Example · fictional account DEMO-PAX-01",
  voiceDetail:
    "Demo call DEMO-CALL-01 · fictional caller Morgan Example. Follow incoming call → connected → ended. No microphone or telephone line is used.",
  pushDetail:
    "To: demo-device-01 · Morgan Example. Message: Your demo driver Riley Sample has arrived. Queue a delivery, then simulate success or failure.",
  emailDetail:
    "To: morgan@example.invalid. Subject: DEMO invoice DEMO-INV-01. Amount: TWD 420. Failed attempts can be retried; only successful delivery appears in the simulated inbox.",
  issuerDetail:
    "DEMO-REF-01 · fictional issuer Example Benefits. Start a lookup to enter pending review, then choose the simulated response. No issuer lookup is performed.",
  erpDetail:
    "DEMO-BATCH-01 · fictional invoice DEMO-INV-01, TWD 420. Prepare accounting data, send it to the simulated ERP, then choose failure or acknowledgment. No real invoice is read or synchronized.",
  erpPending: "Waiting for simulated ERP acknowledgment",
  erpReceipt:
    "SIMULATION ACK · DEMO-ACK-01 · DEMO-BATCH-01 · TWD 420 recorded in the fictional ERP.",
  forwarderDetail:
    "DEMO-ORDER-01 · Example Dispatch. Fictional route: Demo Station → Demo Park. Driver: Riley Sample · DEMO-001. Receive an offer, then accept or reject; accepted orders can be completed.",
  pushMessage:
    "DEMO · Your demo driver Riley Sample has arrived at Demo Station. Vehicle DEMO-001.",
  emailMessage:
    "DEMO invoice DEMO-INV-01 · TWD 420 · Morgan Example · Demo Station → Demo Park. This is a simulated invoice message, not a payment or tax document.",
  domains: {
    voice: "Voice / PSTN",
    push: "Push notification",
    email: "Invoice email",
    erp: "ERP accounting sync",
    issuer: "Issuer eligibility response",
    forwarder: "Third-party forwarded order",
  } satisfies Record<DemoDomain, string>,
  states: {
    idle: "Not started",
    ringing: "Incoming call",
    connected: "Call connected",
    ended: "Call ended",
    draft: "Not sent",
    queued: "Awaiting simulated delivery",
    failed: "Simulated delivery failed",
    delivered: "Delivered to simulated inbox",
    pending: "Pending review",
    eligible: "Eligible",
    expired: "Reference expired",
    ineligible: "Reference not found",
    offered: "Offer received",
    accepted: "Order accepted",
    rejected: "Order rejected",
    completed: "Order completed",
    prepared: "Demo accounting data prepared",
    acknowledged: "Simulated ERP acknowledgment received",
  } as Record<string, string>,
  action: {
    "voice.start": "Simulate incoming call",
    "voice.answer": "Answer demo call",
    "voice.end": "End demo call",
    "push.send": "Queue demo push",
    "push.fail": "Simulate push failure",
    "push.deliver": "Simulate push success",
    "push.retry": "Retry demo push",
    "email.send": "Queue demo email",
    "email.fail": "Simulate email failure",
    "email.deliver": "Simulate email success",
    "email.retry": "Retry demo email",
    "erp.prepare": "Prepare demo accounting data",
    "erp.send": "Send demo ERP batch",
    "erp.fail": "Simulate ERP failure",
    "erp.retry": "Retry demo ERP sync",
    "erp.acknowledge": "Simulate ERP acknowledgment",
    "issuer.request": "Start demo lookup",
    "issuer.eligible": "Return eligible",
    "issuer.expired": "Return expired",
    "issuer.ineligible": "Return not found",
    "forwarder.offer": "Receive demo order",
    "forwarder.accept": "Accept demo order",
    "forwarder.reject": "Reject demo order",
    "forwarder.complete": "Complete demo order",
  } satisfies Record<DemoAction, string>,
};

const zh: typeof en = {
  title: "外部服務模擬示範",
  subtitle: "外部服務尚未就緒時，先操作確認完整流程。",
  banner: "純模擬示範 · 人物、訂單、訊息均為虛構",
  notice:
    "這些操作只更新此瀏覽器的示範資料，不撥打電話、不發送通知或郵件、不查詢發行方，也不派送真實訂單。進度會保留在此瀏覽器，直到重設。",
  loading: "正在載入已儲存的示範…",
  reset: "重設全部示範",
  export: "下載模擬紀錄（JSON）",
  storageError: "瀏覽器無法儲存資料，仍可繼續操作，但關閉頁面後將失去進度。",
  exportError: "無法下載模擬紀錄，請再試一次。",
  status: "示範狀態",
  attempts: "傳送次數",
  actions: "模擬操作",
  inbox: "模擬收件匣",
  inboxEmpty: "尚未收到模擬訊息。先將訊息排入佇列，再選擇模擬成功。",
  inboxHint: "訊息只存在於此示範，未聯絡任何收件人。",
  events: "示範事件歷程",
  eventsEmpty: "操作任一情境，即可留下第一筆事件。",
  live: "離開示範：前往實際工作台",
  liveHint: "實際工作台沿用既有登入身分與服務可用狀態。",
  person: "示範乘客：小禾示範 · 虛構帳號 DEMO-PAX-01",
  voiceDetail:
    "示範通話 DEMO-CALL-01 · 虛構來電者小禾示範。依序操作來電、接通、結束；不使用麥克風或電話線路。",
  pushDetail:
    "收件裝置：demo-device-01 · 小禾示範。訊息：示範司機小林示範已抵達。先排入佇列，再選擇成功或失敗。",
  emailDetail:
    "收件地址：morgan@example.invalid。主旨：示範帳單 DEMO-INV-01。金額：新臺幣 420 元。失敗可重試，只有成功後才會顯示於模擬收件匣。",
  issuerDetail:
    "DEMO-REF-01 · 虛構發行方「示範福利」。開始查詢後進入待審核，再選擇模擬回覆；不實際查詢發行方。",
  erpDetail:
    "DEMO-BATCH-01 · 虛構帳單 DEMO-INV-01，新臺幣 420 元。準備帳務資料、送出至模擬 ERP，再選擇失敗或確認回覆；不讀取或同步真實帳單。",
  erpPending: "等待模擬 ERP 確認回覆",
  erpReceipt:
    "模擬確認回覆 · DEMO-ACK-01 · DEMO-BATCH-01 · 新臺幣 420 元已記入虛構 ERP。",
  forwarderDetail:
    "DEMO-ORDER-01 · 示範派遣平台。虛構路線：示範車站 → 示範公園。司機：小林示範 · DEMO-001。收到訂單後可接受或拒絕，接單後可完成。",
  pushMessage: "示範通知 · 司機小林示範已抵達示範車站，車號 DEMO-001。",
  emailMessage:
    "示範帳單 DEMO-INV-01 · 新臺幣 420 元 · 小禾示範 · 示範車站 → 示範公園。此為模擬帳單訊息，不是付款或稅務憑證。",
  domains: {
    voice: "語音／PSTN",
    push: "推播通知",
    email: "帳單郵件",
    erp: "ERP 帳務同步",
    issuer: "發行方資格回覆",
    forwarder: "第三方轉單",
  },
  states: {
    idle: "尚未開始",
    ringing: "來電中",
    connected: "已接通",
    ended: "通話已結束",
    draft: "尚未傳送",
    queued: "等待模擬投遞",
    failed: "模擬投遞失敗",
    delivered: "已送達模擬收件匣",
    pending: "待審核",
    eligible: "資格符合",
    expired: "參照已過期",
    ineligible: "查無參照",
    offered: "已收到轉單",
    accepted: "已接單",
    rejected: "已拒單",
    completed: "訂單已完成",
    prepared: "示範帳務資料已準備",
    acknowledged: "已收到模擬 ERP 確認回覆",
  },
  action: {
    "voice.start": "模擬來電",
    "voice.answer": "接聽示範通話",
    "voice.end": "結束示範通話",
    "push.send": "排入示範推播",
    "push.fail": "模擬推播失敗",
    "push.deliver": "模擬推播成功",
    "push.retry": "重試示範推播",
    "email.send": "排入示範郵件",
    "email.fail": "模擬郵件失敗",
    "email.deliver": "模擬郵件成功",
    "email.retry": "重試示範郵件",
    "erp.prepare": "準備示範帳務資料",
    "erp.send": "送出示範 ERP 批次",
    "erp.fail": "模擬 ERP 失敗",
    "erp.retry": "重試示範 ERP 同步",
    "erp.acknowledge": "模擬 ERP 確認回覆",
    "issuer.request": "開始示範查詢",
    "issuer.eligible": "回覆資格符合",
    "issuer.expired": "回覆參照過期",
    "issuer.ineligible": "回覆查無參照",
    "forwarder.offer": "接收示範轉單",
    "forwarder.accept": "接受示範轉單",
    "forwarder.reject": "拒絕示範轉單",
    "forwarder.complete": "完成示範轉單",
  },
};

export function demoCopy(locale: string): typeof en {
  return locale === "zh" ? zh : en;
}
