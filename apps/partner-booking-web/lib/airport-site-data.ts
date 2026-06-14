// airport-site-data.ts — data model for the per-bank credit-card airport-transfer
// website, ported faithfully from the design canvas
// `docs/05-ui/drts-design-canvas/bank-sites/at-config.js` + `at-app.js`.
// Numbers / 權益 are design placeholders, not real published programs.
// Operated by 智慧運輸科技 (Smart Transport Technology); banks are program owners.

export type AirportBankId = "ctbc" | "cathay" | "taishin" | "dbs";

export const AIRPORT_BANK_ORDER: AirportBankId[] = [
  "ctbc",
  "cathay",
  "taishin",
  "dbs",
];

export interface AirportBankColors {
  primary: string;
  primaryDark: string;
  accent: string;
  accentSoft: string;
  tint: string;
}

export interface AirportBank {
  id: AirportBankId;
  host: string;
  nameZh: string;
  nameEn: string;
  mark: string;
  co: AirportBankColors;
  serif: boolean;
  card: string;
  tier: string;
  tierEn: string;
  quota: { used: number; total: number };
  hero: string;
  heroSub: string;
  support: string;
  holder: { name: string; last4: string; nameEn: string };
  airports: [string, string];
  regions: string[];
  perks: string[];
}

export const AIRPORT_BANKS: Record<AirportBankId, AirportBank> = {
  ctbc: {
    id: "ctbc",
    host: "ride.ctbc.com.tw",
    nameZh: "中國信託",
    nameEn: "CTBC Bank",
    mark: "中信",
    co: {
      primary: "#12428B",
      primaryDark: "#0A2A5E",
      accent: "#C29A4E",
      accentSoft: "#FBF4E4",
      tint: "#EEF2FA",
    },
    serif: true,
    card: "World Elite 世界卡",
    tier: "WORLD ELITE",
    tierEn: "WORLD ELITE PRIVILEGE",
    quota: { used: 3, total: 12 },
    hero: "世界卡禮賓，從家門到登機門。",
    heroSub:
      "專屬 World Elite 卡友的機場接送禮遇。專業司機、航班動態追蹤、費用合併入帳，無須現場付款。",
    support: "0800-024-365",
    holder: { name: "陳〇明", last4: "8842", nameEn: "CHEN, M." },
    airports: ["桃園 TPE", "松山 TSA"],
    regions: [
      "台北 · 新北 · 基隆",
      "桃園 · 新竹",
      "台中 · 彰化",
      "台南 · 高雄",
    ],
    perks: [
      "全年 12 趟免費接送",
      "商務車型免費升等 2 趟",
      "航班延誤免費等候 60 分",
    ],
  },
  cathay: {
    id: "cathay",
    host: "ride.cathaybk.com.tw",
    nameZh: "國泰世華",
    nameEn: "Cathay United Bank",
    mark: "國泰",
    co: {
      primary: "#0B7A4B",
      primaryDark: "#075235",
      accent: "#B89048",
      accentSoft: "#F2F6EC",
      tint: "#EAF4EE",
    },
    serif: true,
    card: "CUBE 世界卡",
    tier: "WORLD CARD",
    tierEn: "CUBE WORLD CARD",
    quota: { used: 2, total: 8 },
    hero: "樹我視界，接送每一段安心旅程。",
    heroSub:
      "CUBE 世界卡專屬接送禮遇，從你出發那一刻就開始照顧。準時、安全、全程可追蹤。",
    support: "0800-818-001",
    holder: { name: "林〇芸", last4: "6071", nameEn: "LIN, Y." },
    airports: ["桃園 TPE", "松山 TSA"],
    regions: [
      "台北 · 新北 · 基隆",
      "桃園 · 新竹",
      "台中 · 彰化",
      "台南 · 高雄",
    ],
    perks: ["全年 8 趟免費接送", "都會區優先派車", "航班延誤免費等候 60 分"],
  },
  taishin: {
    id: "taishin",
    host: "ride.taishinbank.com.tw",
    nameZh: "台新銀行",
    nameEn: "Taishin Bank",
    mark: "台新",
    co: {
      primary: "#B0335F",
      primaryDark: "#7C2241",
      accent: "#C7A06A",
      accentSoft: "#FBEFF3",
      tint: "#F7EDF1",
    },
    serif: true,
    card: "太陽無限卡",
    tier: "INFINITE",
    tierEn: "INFINITE PRIVILEGE",
    quota: { used: 1, total: 6 },
    hero: "以太陽之名，照亮你的每段旅程。",
    heroSub: "太陽無限卡尊榮接送，專屬司機與商務車型，讓出發與返家都從容優雅。",
    support: "0800-023-123",
    holder: { name: "王〇婷", last4: "3308", nameEn: "WANG, T." },
    airports: ["桃園 TPE", "松山 TSA"],
    regions: [
      "台北 · 新北 · 基隆",
      "桃園 · 新竹",
      "台中 · 彰化",
      "台南 · 高雄",
    ],
    perks: ["全年 6 趟免費接送", "商務車型免費升等 1 趟", "24 小時尊榮客服"],
  },
  dbs: {
    id: "dbs",
    host: "ride.dbs.com.tw",
    nameZh: "星展銀行",
    nameEn: "DBS Bank",
    mark: "DBS",
    co: {
      primary: "#D72631",
      primaryDark: "#9B1B22",
      accent: "#1F2630",
      accentSoft: "#FCEDED",
      tint: "#FBEDEE",
    },
    serif: false,
    card: "DBS Insignia 御璽卡",
    tier: "INSIGNIA",
    tierEn: "DBS INSIGNIA",
    quota: { used: 4, total: 10 },
    hero: "Live more, Bank less — 從容啟程。",
    heroSub:
      "DBS Insignia 專屬機場接送，全程禮遇，從登機到入境都有人為你打點。",
    support: "0800-808-889",
    holder: { name: "張〇豪", last4: "1205", nameEn: "CHANG, H." },
    airports: ["桃園 TPE", "松山 TSA"],
    regions: [
      "台北 · 新北 · 基隆",
      "桃園 · 新竹",
      "台中 · 彰化",
      "台南 · 高雄",
    ],
    perks: ["全年 10 趟免費接送", "商務車型免費升等 3 趟", "專屬禮賓秘書"],
  },
};

export interface AirportVehicle {
  id: "sedan" | "business" | "van";
  name: string;
  en: string;
  seats: string;
  luggage: string;
  models: string;
  note: string;
  fare: number;
  carName: string;
}

export const AIRPORT_VEHICLES: AirportVehicle[] = [
  {
    id: "sedan",
    name: "一般轎車",
    en: "Sedan",
    seats: "1–3 人",
    luggage: "2 件",
    models: "Toyota Camry / Altis 同級",
    note: "日常出行 · 標準權益",
    fare: 1580,
    carName: "Toyota Camry · ARJ-3120",
  },
  {
    id: "business",
    name: "商務車",
    en: "Business MPV",
    seats: "1–4 人",
    luggage: "3 件",
    models: "Toyota Alphard / Benz V-Class",
    note: "尊榮舒適 · 可升等",
    fare: 2280,
    carName: "Toyota Alphard · ARJ-7720",
  },
  {
    id: "van",
    name: "七人座休旅",
    en: "7-Seater",
    seats: "4–6 人",
    luggage: "6 件",
    models: "Hyundai Custin / Toyota Sienna",
    note: "家庭 · 多人 · 大行李",
    fare: 2680,
    carName: "Hyundai Custin · ARJ-5530",
  },
];

export interface AirportFeature {
  t: string;
  d: string;
  p: string;
}

export const AIRPORT_FEATURES: AirportFeature[] = [
  {
    t: "準時保證",
    d: "系統預先調度、精準預估到車時間，提前派車不誤機。",
    p: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  },
  {
    t: "專業認證司機",
    d: "背景查核、定期訓練，平均評分 4.8 星以上。",
    p: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  },
  {
    t: "航班動態追蹤",
    d: "自動同步航班資訊，延誤或提早抵達皆順延接送。",
    p: "M3 11l19-9-9 19-2-8z",
  },
  {
    t: "合併入帳免現付",
    d: "權益內趟次免費，超額費用合併於信用卡帳單。",
    p: "M3 7h18v10H3zM3 11h18",
  },
  {
    t: "即時行程追蹤",
    d: "出發當日查看司機位置與預計抵達時間。",
    p: "M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  },
  {
    t: "24 小時客服",
    d: "全程專人協助，行程異動與問題即時處理。",
    p: "M4 5h4l2 5-2.5 1.5a11 11 0 005 5L14 14l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 011-1z",
  },
];

export interface AirportStep {
  n: string;
  t: string;
  d: string;
}

export const AIRPORT_STEPS: AirportStep[] = [
  {
    n: "01",
    t: "驗證卡別資格",
    d: "以網銀身分或卡號末四碼確認您的接送權益與剩餘趟次。",
  },
  {
    n: "02",
    t: "填寫行程資訊",
    d: "選擇去程或回程、航廈與航班、上車地點、用車時間與車型。",
  },
  {
    n: "03",
    t: "確認權益與費用",
    d: "系統自動帶入權益扣抵，確認「您將支付」金額後送出。",
  },
  {
    n: "04",
    t: "完成預約 · 派車",
    d: "即時為您配對專業司機，以簡訊與推播通知。",
  },
  { n: "05", t: "行程追蹤", d: "出發當日即時查看司機位置與預計抵達時間。" },
];

export interface AirportFaq {
  q: string;
  a: string;
}

export const AIRPORT_FAQ: AirportFaq[] = [
  {
    q: "機場接送如何計算免費趟次？",
    a: "依您持有的卡別權益，每年提供固定免費趟次。每完成一趟接送（去程或回程各算一趟）即扣抵一次，剩餘趟次可在「我的預約」隨時查詢。",
  },
  {
    q: "需要提前多久預約？",
    a: "建議於用車時間前 24 小時完成預約，以確保派車。離峰時段最快可於 3 小時前預約；尖峰或連假期間建議提早安排。",
  },
  {
    q: "航班延誤或提早，司機會等候嗎？",
    a: "系統會自動追蹤您填寫的航班動態。入境接送的等候時間自實際落地起算，多數卡別享 60 分鐘免費等候，逾時則依里程計費或扣抵權益。",
  },
  {
    q: "費用怎麼支付？",
    a: "權益內的趟次完全免費，無須現場付款。超出權益的費用或加價項目（如指定商務車型）將合併入您的信用卡帳單，於下期帳單顯示。",
  },
  {
    q: "可以指定上車地點與舉牌嗎？",
    a: "可以。市區任一地址皆可指定上車；入境接送可勾選「舉牌服務」，司機將於入境大廳持您指定的名牌等候。",
  },
  {
    q: "如何取消或改期？",
    a: "於用車前 3 小時以上取消或改期不收費，且不扣抵權益。3 小時內取消將視為使用一趟權益。可於「我的預約」自助操作。",
  },
];

export function getAirportBank(slug: string | undefined): AirportBank | null {
  if (!slug) return null;
  const key = slug.toLowerCase() as AirportBankId;
  return AIRPORT_BANKS[key] ?? null;
}
