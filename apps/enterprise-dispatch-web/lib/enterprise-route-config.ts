export type EnterpriseGateKind =
  | "auth-required"
  | "suspended"
  | "approval-pending"
  | "approval-rejected"
  | "quota-blocked"
  | "no-supply"
  | "degraded";

export type EnterpriseEmbedStateKind =
  | "handoff-ok"
  | "reauth-required"
  | "unsupported-host"
  | "consent-required"
  | "fallback-to-web";

export const enterpriseGateConfig = {
  "auth-required": {
    title: "需要重新登入",
    subtitle: "目前沒有可用的企業登入 session，無法顯示員工預約資料。",
    tone: "info",
    details: [
      { k: "原因", v: "企業 SSO session 遺失或已逾時" },
      { k: "影響", v: "不能查看 booking、quota 與成本中心資料" },
      { k: "下一步", v: "回到企業入口重新登入後再繼續" },
    ],
    actions: [
      { label: "回到企業入口", href: "/" },
      { label: "查看支援", href: "/help" },
    ],
  },
  suspended: {
    title: "目前沒有使用權限",
    subtitle: "這個帳號或租戶設定暫時不能建立企業派車。",
    tone: "warn",
    details: [
      { k: "原因", v: "租戶權限或員工資格未開通" },
      { k: "影響", v: "不能建立新預約或查看敏感權責資料" },
      { k: "下一步", v: "聯絡企業管理員或客服確認權限" },
    ],
    actions: [
      { label: "聯絡企業客服", href: "/help" },
      { label: "返回首頁", href: "/" },
    ],
  },
  "approval-pending": {
    title: "申請已送出，等待審批",
    subtitle: "預約命令已被接受，但仍要等成本中心或主管核准。",
    tone: "warn",
    details: [
      { k: "狀態", v: "accepted + pending" },
      { k: "責任", v: "成本中心與審批結果以 backend 為準" },
      { k: "下一步", v: "可先查看預約詳情，無需重複送出" },
    ],
    actions: [
      { label: "查看我的預約", href: "/bookings" },
      { label: "前往說明", href: "/help" },
    ],
  },
  "approval-rejected": {
    title: "審批未通過",
    subtitle: "這筆企業派車未獲得必要的成本中心或主管同意。",
    tone: "danger",
    details: [
      { k: "原因", v: "審批結果拒絕或政策不允許" },
      { k: "影響", v: "本次預約不能繼續派車" },
      { k: "下一步", v: "調整行程內容或改用其他成本中心後重送" },
    ],
    actions: [
      { label: "重新建立預約", href: "/bookings/new" },
      { label: "查看支援", href: "/help" },
    ],
  },
  "quota-blocked": {
    title: "額度或政策限制",
    subtitle: "目前額度、政策規則或成本中心狀態不允許建立新單。",
    tone: "warn",
    details: [
      { k: "原因", v: "quota summary 或 policy preview 顯示 blocked" },
      { k: "影響", v: "不能提交 create command" },
      { k: "下一步", v: "更換成本中心、調整預約條件或請管理方處理" },
    ],
    actions: [
      { label: "回到建立預約", href: "/bookings/new" },
      { label: "查看政策說明", href: "/help" },
    ],
  },
  "no-supply": {
    title: "目前無法派車",
    subtitle: "系統已接受需求，但在這個時段或區域沒有可供應車隊。",
    tone: "danger",
    details: [
      { k: "狀態", v: "request accepted, no fulfillment available" },
      { k: "影響", v: "不保證可即時補派" },
      { k: "下一步", v: "保留紀錄並由客服協助後續安排" },
    ],
    actions: [
      { label: "查看目前預約", href: "/bookings" },
      { label: "聯絡客服", href: "/help" },
    ],
  },
  degraded: {
    title: "服務暫時降級",
    subtitle: "部分即時資料或預約命令目前可能延遲更新。",
    tone: "info",
    details: [
      { k: "影響", v: "ETA、quota 或審批資訊可能晚於平常同步" },
      { k: "建議", v: "避免重複送出相同 booking command" },
      { k: "下一步", v: "若狀態持續未更新，請聯絡客服協助" },
    ],
    actions: [
      { label: "查看我的預約", href: "/bookings" },
      { label: "查看說明", href: "/help" },
    ],
  },
} as const;

export const enterpriseEmbedStateConfig = {
  "handoff-ok": {
    title: "已接收企業 App 身分交付",
    subtitle: "host app 已帶入 tenant-scoped session，可直接進入自助預約流程。",
    tone: "success",
    details: [
      { k: "來源", v: "enterprise app webview" },
      { k: "session", v: "tenant-scoped hand-off accepted" },
      { k: "限制", v: "不顯示後台或調度導覽" },
    ],
    actions: [
      { label: "建立預約", href: "/bookings/new" },
      { label: "回到企業網站版", href: "/" },
    ],
  },
  "reauth-required": {
    title: "需要重新驗證",
    subtitle: "內嵌 token 已逾時，必須回到企業 App 重新建立 session。",
    tone: "warn",
    details: [
      { k: "原因", v: "host token expired or stale" },
      { k: "影響", v: "不能讀取 tenant booking data" },
      { k: "下一步", v: "回到 host app 重新登入後再開啟" },
    ],
    actions: [
      { label: "返回企業 App", href: "/embed" },
      { label: "改走企業網站版", href: "/" },
    ],
  },
  "unsupported-host": {
    title: "這個開啟來源不受支援",
    subtitle: "偵測到的 host app 或網域不在允許清單內。",
    tone: "danger",
    details: [
      { k: "原因", v: "wrong realm or unsupported host container" },
      { k: "影響", v: "為避免錯誤身份混用，系統不載入資料" },
      { k: "下一步", v: "請從企業正式 App 或企業網站入口開啟" },
    ],
    actions: [
      { label: "前往企業網站版", href: "/" },
      { label: "查看支援", href: "/help" },
    ],
  },
  "consent-required": {
    title: "需要確認企業授權範圍",
    subtitle: "這次內嵌啟動需要先確認成本中心或租戶資料使用範圍。",
    tone: "info",
    details: [
      { k: "scope", v: "passenger, cost center, booking history" },
      { k: "目的", v: "僅供企業派車前台使用" },
      { k: "下一步", v: "確認後繼續建立或查詢預約" },
    ],
    actions: [
      { label: "同意並繼續", href: "/bookings/new" },
      { label: "改走企業網站版", href: "/" },
    ],
  },
  "fallback-to-web": {
    title: "改走企業網站版完成操作",
    subtitle: "目前 embed session 不完整，建議切回網站版以完成預約或查詢。",
    tone: "warn",
    details: [
      { k: "原因", v: "identity hand-off incomplete" },
      { k: "優先", v: "保持企業身份與審批語意一致" },
      { k: "下一步", v: "切換到網站版後再繼續 booking flow" },
    ],
    actions: [
      { label: "前往企業網站版", href: "/" },
      { label: "返回 host app", href: "/embed" },
    ],
  },
} as const;

export type EnterpriseGateTone =
  (typeof enterpriseGateConfig)[EnterpriseGateKind]["tone"];

export function getEnterpriseGate(kind: EnterpriseGateKind) {
  return enterpriseGateConfig[kind];
}

export function getEnterpriseEmbedState(kind: EnterpriseEmbedStateKind) {
  return enterpriseEmbedStateConfig[kind];
}
