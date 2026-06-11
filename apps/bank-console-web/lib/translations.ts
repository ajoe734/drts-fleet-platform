const dict = {
  "app.title": "DRTS Bank Console",
  "app.description":
    "Issuer back-office shell for the credit-card airport transfer program.",
  "shell.search": "搜尋卡友、方案、對帳期間…",
  "shell.breadcrumb.home": "總覽",
  "nav.workspace": "工作面",
  "nav.governance": "權限與稽核",
  "nav.home": "首頁",
  "nav.bookings": "訂單",
  "nav.contracts": "合約與 SLA",
  "nav.statements": "對帳單",
  "nav.programs": "方案與配額",
  "nav.users": "使用者",
  "nav.audit": "稽核",
} as const satisfies Record<string, string>;

export function t(key: keyof typeof dict): string;
export function t(key: string): string;
export function t(key: string) {
  return dict[key as keyof typeof dict] ?? key;
}
