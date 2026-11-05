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

/** 智行叫車 App 費用政策：G201011 App 補件畫面設計規格 v1.0（115.9.24）§3.3
 * 定稿文字，與送審正文、旅客運送契約同步，不得改寫。E-19a 逐列顯示。 */
export const PASSENGER_APP_FEE_POLICY_ROWS = [
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
/** The same specification's E-19b 下單前確認 費用規則 summary, verbatim. */
export const PASSENGER_APP_CONFIRMATION_ROWS = [
  "車資依核定運價計費（含延滯計時）",
  "預約費、取消費（指派前）、等待費：不另收",
  "國道通行費經您同意行駛後實收",
  "車內汙損清潔費實支實付",
] as const;

/** Disclosure copy version is independent from the quote tariff version. */
export const PASSENGER_FEE_DISCLOSURE_VERSION = "referral-e19-20261019-v1";
export const PASSENGER_FEE_CONTENT_HASH =
  "24c898d6507ea3dc89107e86160a6743af0b0f4b6fa11628d0f8d55b42ce6431";
