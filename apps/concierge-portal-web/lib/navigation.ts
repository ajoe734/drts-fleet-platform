export type ConciergeNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "control" | "guardrail";
};

export const conciergeNavItems: ConciergeNavItem[] = [
  {
    href: "/",
    label: "櫃台首頁",
    note: "查看櫃台狀態、權限範圍與下一步操作。",
    status: "baseline",
  },
  {
    href: "/login",
    label: "本機登入",
    note: "建立受限的櫃台工作階段，供代訂流程使用。",
    status: "baseline",
  },
  {
    href: "/start",
    label: "選擇固定站點",
    note: "開始代訂前，先選擇此工作階段所屬的站點與櫃台。",
    status: "baseline",
  },
  {
    href: "/bookings/new",
    label: "建立代訂",
    note: "開啟櫃台通話、送出代訂需求並回報預估抵達時間。",
    status: "control",
  },
  {
    href: "/lookup",
    label: "訂單查詢",
    note: "查看近期訂單、派遣軌跡與錄音狀態。",
    status: "control",
  },
  {
    href: "/callbacks",
    label: "回覆任務",
    note: "為櫃台建立的通話排程或完成後續回覆。",
    status: "control",
  },
  {
    href: "/degraded",
    label: "服務降級",
    note: "櫃台暫停建立訂單時，提供明確的唯讀備援。",
    status: "guardrail",
  },
  {
    href: "/recording-unavailable",
    label: "錄音回補限制",
    note: "說明錄音回補為何仍需轉交營運端處理。",
    status: "guardrail",
  },
];

export function findConciergeNavItem(pathname: string) {
  return conciergeNavItems.find((item) => item.href === pathname) ?? null;
}
