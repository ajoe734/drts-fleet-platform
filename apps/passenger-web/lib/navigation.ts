export type PassengerNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "flow" | "guardrail";
};

export const passengerNavItems: PassengerNavItem[] = [
  {
    href: "/",
    label: "預約狀態首頁",
    note: "查看目前行程、預估抵達時間與下一步操作。",
    status: "baseline",
  },
  {
    href: "/book",
    label: "叫車預約",
    note: "送出乘車需求，並清楚處理資格、車輛供給與降級備援。",
    status: "flow",
  },
  {
    href: "/trip",
    label: "進行中行程",
    note: "查看目前行程狀態，以及取消、完成、唯讀與重新驗證情境。",
    status: "flow",
  },
  {
    href: "/trips",
    label: "行程紀錄",
    note: "瀏覽過往行程，收據呈現交由收據中心處理。",
    status: "baseline",
  },
  {
    href: "/receipts",
    label: "收據中心",
    note: "清楚標示平台開立、外部來源與不支援的收據歸屬。",
    status: "baseline",
  },
  {
    href: "/auth",
    label: "身分驗證",
    note: "登入、行程查詢與客服協助的安全入口。",
    status: "baseline",
  },
  {
    href: "/unauthenticated",
    label: "尚未驗證",
    note: "乘客尚未完成驗證時，顯示可用的安全處理方式。",
    status: "guardrail",
  },
  {
    href: "/unsupported",
    label: "不支援情境",
    note: "處理第三方收據歸屬、服務區域外與渠道限制。",
    status: "guardrail",
  },
];

export type FlowRoute = {
  href: string;
  label: string;
  kind: "positive" | "negative";
  outcome: string;
  body: string;
};

export const bookingFlowRoutes: FlowRoute[] = [
  {
    href: "/book",
    label: "叫車預約",
    kind: "positive",
    outcome: "需求已送出",
    body: "乘客提供上車地點、下車地點與可選預約時段。抵達時間以預估方式呈現，需求會進入媒合佇列。",
  },
  {
    href: "/book/denied",
    label: "預約遭拒",
    kind: "negative",
    outcome: "政策未通過",
    body: "系統因安全、風險或平台政策而拒絕此需求。乘客會看到不責備個人的說明與客服協助入口。",
  },
  {
    href: "/book/ineligible",
    label: "資格不符",
    kind: "negative",
    outcome: "資格檢查未通過",
    body: "乘客資料、付款方式或方案資格與需求不符。頁面會說明未通過的關卡，但不洩漏個資。",
  },
  {
    href: "/book/no-supply",
    label: "暫無可用車輛",
    kind: "negative",
    outcome: "尚未媒合司機",
    body: "指定時間與區域內沒有符合條件的司機或車輛。乘客可以重新嘗試、改預約稍後時段或改走其他協助渠道。",
  },
  {
    href: "/book/degraded",
    label: "預約服務降級",
    kind: "negative",
    outcome: "唯讀備援",
    body: "預約服務目前處於降級模式：可查看狀態，但不可送出變更。乘客會被導向客服或稍後重試。",
  },
];

export const tripFlowRoutes: FlowRoute[] = [
  {
    href: "/trip",
    label: "進行中行程狀態",
    kind: "positive",
    outcome: "行程進行中",
    body: "已媒合司機，並顯示預估抵達時間、車輛與行程識別資訊。只有在仍可取消時才會顯示取消操作。",
  },
  {
    href: "/trip/cancel",
    label: "取消進行中行程",
    kind: "positive",
    outcome: "準備取消",
    body: "乘客仍具取消權限時可進入此流程。頁面會清楚列出取消時限與可能費用。",
  },
  {
    href: "/trip/completed",
    label: "行程完成",
    kind: "positive",
    outcome: "已完成",
    body: "行程已正常結束。頁面提供收據入口、行程紀錄與回到歷史清單的路徑。",
  },
  {
    href: "/trip/read-only",
    label: "唯讀行程檢視",
    kind: "positive",
    outcome: "僅可查看",
    body: "此行程由合作夥伴、租戶或客服櫃台建立。乘客可查看狀態，但變更權限保留在來源渠道。",
  },
  {
    href: "/trip/cancelled",
    label: "行程已取消",
    kind: "negative",
    outcome: "已取消",
    body: "行程可能由乘客、司機或平台取消。頁面會說明取消方與乘客下一步。",
  },
  {
    href: "/trip/reauth-required",
    label: "需要重新驗證",
    kind: "negative",
    outcome: "工作階段已失效",
    body: "乘客工作階段已失效，或無法重新建立行程脈絡。完成重新驗證前，行程資料會保持隱藏。",
  },
];

export function findPassengerNavItem(pathname: string) {
  if (pathname === "/") return passengerNavItems[0] ?? null;
  const candidates = passengerNavItems.filter(
    (item) =>
      item.href !== "/" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) =>
    item.href.length > best.href.length ? item : best,
  );
}
