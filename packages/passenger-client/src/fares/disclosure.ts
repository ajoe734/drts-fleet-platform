/** G201011 E-19 copy, with the latest explicit all-allowed-times free-cancellation decision. */
export const PASSENGER_FEE_ROWS = [
  ["車資", "依主管機關核定運價計費（含延滯計時）"],
  ["預約費", "不另收取"],
  ["取消費", "不收取（指派前取消不收費）"],
  ["等待費", "不另收取（車資依核定運價含延滯計時計收）"],
  [
    "遺失物返還補償金",
    "不收取；如要求專程送還，所生車資由乘客負擔並於送還前確認",
  ],
  ["車內汙損清潔費", "由可歸責之乘客負擔實際清潔費用，實支實付、憑單據計收"],
  ["國道通行費", "經乘客同意行駛後實收"],
  ["優惠活動", "目前無；如有，依規定備查後於本頁公告"],
] as const;
export const PASSENGER_CONFIRMATION_ROWS = [
  "車資依核定運價計費（含延滯計時）",
  "預約費、取消費（指派前）、等待費：不另收",
  "國道通行費經您同意行駛後實收",
  "車內汙損清潔費實支實付",
] as const;
// Retain exact original disclosure above, visibly supplement the superseding
// user decision. Do not imply assigned cancellations cost money or allow on-trip cancellation.
export const PASSENGER_FREE_CANCELLATION_NOTICE =
  "任何允許取消的時間均不收取消費，包括指派司機後；行程開始後仍依既有取消限制。";
export const PASSENGER_SUPPORT_PHONE = "02-2944-0985";
