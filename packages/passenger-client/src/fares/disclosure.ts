/** E-19 disclosure copy supplied by the user on 2026-10-19. */
export const PASSENGER_FEE_ROWS = [
  ["車資", "依核定運價含延滯計時"],
  ["預約費", "不另收"],
  ["取消費", "不收"],
  ["等待費", "不另收"],
  ["遺失物補償金", "不收"],
  ["汙損清潔費", "實支實付"],
  ["國道通行費", "經同意後實收"],
  ["優惠活動", "目前無"],
] as const;
export const PASSENGER_CONFIRMATION_ROWS = [
  "車資依核定運價計費（含延滯計時）",
  "預約費、取消費、等待費：不另收",
  "國道通行費經您同意行駛後實收",
  "車內汙損清潔費實支實付",
] as const;
// Free-cancellation copy does not change permission to cancel an on-trip order.
export const PASSENGER_FREE_CANCELLATION_NOTICE =
  "任何允許取消的時間均不收取消費，包括指派司機後；行程開始後仍依既有取消限制。";
export const PASSENGER_SUPPORT_PHONE = "02-2944-0985";
