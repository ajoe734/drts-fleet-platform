import type { CSSProperties, ReactNode } from "react";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";

export const partnerBookingScreens = [
  "landing",
  "eligibility",
  "book",
  "confirmed",
  "trips",
  "receipt",
  "help",
] as const;

export type PartnerBookingScreenId = (typeof partnerBookingScreens)[number];

export const partnerBookingStateScreens = [
  "eligible",
  "ineligible",
  "manual_review",
  "inactive",
  "eligibility_required",
] as const;

export type PartnerBookingStateScreenId =
  (typeof partnerBookingStateScreens)[number];

export type PartnerBookingLocale = "en" | "zh";

type ScreenMeta = {
  id: PartnerBookingScreenId;
  label: string;
  eyebrow: string;
  summary: string;
};

type StateScreenMeta = {
  id: PartnerBookingStateScreenId;
  routeSegment: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  tone: TripItem["tone"];
  guidance: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
  bullets: readonly string[];
};

type TripItem = {
  when: string;
  route: string;
  state: string;
  tone: "neutral" | "primary" | "accent" | "success";
  amount: string;
  benefit: string;
};

const screenMeta: ReadonlyArray<ScreenMeta> = [
  {
    id: "landing",
    label: "入口",
    eyebrow: "PB_Landing",
    summary: "品牌入口、權益餘額與服務選單。",
  },
  {
    id: "eligibility",
    label: "資格確認",
    eyebrow: "PB_Eligibility",
    summary: "首次使用的權益確認與授權同意。",
  },
  {
    id: "book",
    label: "建立行程",
    eyebrow: "PB_Book",
    summary: "上下車、時間、服務與權益費用試算。",
  },
  {
    id: "confirmed",
    label: "已派車",
    eyebrow: "PB_Confirmed",
    summary: "已指派駕駛、預估抵達、地圖占位與協助操作。",
  },
  {
    id: "trips",
    label: "我的行程",
    eyebrow: "PB_Trips",
    summary: "行程紀錄與年度剩餘權益。",
  },
  {
    id: "receipt",
    label: "行程明細",
    eyebrow: "PB_Receipt",
    summary: "已完成行程明細與權益結算資訊。",
  },
  {
    id: "help",
    label: "協助",
    eyebrow: "PB_Help",
    summary: "客服專線、常見問題與爭議申請入口。",
  },
] as const;

const screenMetaCopy: Record<
  PartnerBookingLocale,
  Record<PartnerBookingScreenId, Pick<ScreenMeta, "label" | "summary">>
> = {
  en: {
    landing: {
      label: "Landing",
      summary: "Partner-entry hero with entitlement balance and service menu.",
    },
    eligibility: {
      label: "Eligibility",
      summary: "One-time linking and consent for the partner benefit program.",
    },
    book: {
      label: "Create trip",
      summary:
        "Pickup, schedule, service detail, and benefit-aware fare breakdown.",
    },
    confirmed: {
      label: "Driver assigned",
      summary: "Assigned driver, ETA, map placeholder, and support actions.",
    },
    trips: {
      label: "My trips",
      summary: "Trip ledger with yearly remaining benefit balance.",
    },
    receipt: {
      label: "Receipt",
      summary: "Completed trip receipt with benefit settlement detail.",
    },
    help: {
      label: "Help",
      summary: "Hotline, FAQs, and dispute initiation entry point.",
    },
  },
  zh: {
    landing: {
      label: "入口",
      summary: "合作夥伴入口首頁，呈現禮遇餘額與服務選單。",
    },
    eligibility: {
      label: "資格確認",
      summary: "首次使用的卡片連結與 partner benefit 授權同意。",
    },
    book: {
      label: "建立行程",
      summary: "上車點、時程、服務細節與禮遇費用明細。",
    },
    confirmed: {
      label: "已派車",
      summary: "已指派駕駛、ETA、地圖佔位與客服操作。",
    },
    trips: {
      label: "我的行程",
      summary: "行程紀錄與年度剩餘禮遇趟次。",
    },
    receipt: {
      label: "行程明細",
      summary: "已完成行程的收據與禮遇抵扣明細。",
    },
    help: {
      label: "協助",
      summary: "專線、常見問題與爭議入口。",
    },
  },
};

function serviceItemsForLocale(locale: PartnerBookingLocale) {
  if (locale === "en") {
    return [
      ["Airport transfer", "Taoyuan / Songshan · business car", "AIRPORT"],
      ["Priority dispatch", "Metro areas · car in 8 minutes", "PRIORITY"],
      ["Business hours", "Weekdays 07:00-22:00 · upgrade included", "BUSINESS"],
    ] as const;
  }

  return [
    ["機場接送", "桃園 / 松山 · 商務車", "AIRPORT"],
    ["優先派車", "都會區 · 8 分鐘內到車", "PRIORITY"],
    ["商務時段", "平日 07:00-22:00 · 含車型升級", "BUSINESS"],
  ] as const;
}

const screenMetaById = Object.fromEntries(
  screenMeta.map((item) => [item.id, item]),
) as Record<PartnerBookingScreenId, ScreenMeta>;

function screenMetaForLocale(locale: PartnerBookingLocale) {
  return partnerBookingScreens.map((screen) =>
    getPartnerBookingScreenMeta(screen, locale),
  );
}

const stateScreenMeta: ReadonlyArray<StateScreenMeta> = [
  {
    id: "eligible",
    routeSegment: "eligible",
    label: "資格通過",
    eyebrow: "PBK Gate",
    title: "資格已通過",
    summary: "合作夥伴權益驗證已通過，可以繼續建立預約。",
    tone: "success",
    guidance:
      "此路由用來明確呈現驗證通過狀態，避免使用者在沒有上下文時被靜默導入建立預約。",
    primaryAction: {
      label: "繼續建立預約",
      href: "/book",
    },
    secondaryAction: {
      label: "查看資格確認",
      href: "/eligibility",
    },
    bullets: [
      "使用驗證紀錄在預約上標記合作夥伴來源。",
      "免費權益與折扣規則仍由後端權威判定。",
      "此路由可安全銜接合作夥伴 bootstrap 或 callback 流程。",
    ],
  },
  {
    id: "ineligible",
    routeSegment: "ineligible",
    label: "資格不符",
    eyebrow: "PBK Gate",
    title: "權益資格不符",
    summary: "發卡行或合作夥伴規則判定此使用者無法使用權益。",
    tone: "accent",
    guidance:
      "建立預約維持封鎖；使用者需修正合作夥伴參照，或改走非補助權益流程。",
    primaryAction: {
      label: "重新驗證資格",
      href: "/eligibility",
    },
    secondaryAction: {
      label: "聯絡客服",
      href: "/help",
    },
    bullets: [
      "資格不符時不可直接進入建立預約。",
      "在專屬 gate 顯示發卡行或合作夥伴拒絕原因。",
      "若政策允許，客服可引導使用者改走非權益流程。",
    ],
  },
  {
    id: "manual_review",
    routeSegment: "manual_review",
    label: "人工審查",
    eyebrow: "PBK Gate",
    title: "需要人工審查",
    summary: "資格 adapter 無法直接通過，已排入人工審查。",
    tone: "primary",
    guidance:
      "在營運或合作方完成審查前，合作預約會暫停；這是硬性阻擋，不是提醒。",
    primaryAction: {
      label: "開啟協助選項",
      href: "/help",
    },
    secondaryAction: {
      label: "返回入口",
      href: "/",
    },
    bullets: [
      "adapter timeout 與離線合作方確認都視為待審，不視為成功。",
      "審查佇列未完成前，不顯示建立預約操作。",
      "使用明確的佇列文案，讓使用者知道仍待後續處理。",
    ],
  },
  {
    id: "inactive",
    routeSegment: "inactive",
    label: "入口停用",
    eyebrow: "PBK Gate",
    title: "合作夥伴入口已停用",
    summary: "此合作夥伴入口尚未啟用，因此無法使用權益補助預約。",
    tone: "neutral",
    guidance:
      "此路由保留為明確停用狀態，不可顯示可建立預約的操作，也不可落到無品牌 fallback。",
    primaryAction: {
      label: "返回入口",
      href: "/",
    },
    secondaryAction: {
      label: "撥打合作夥伴專線",
      href: "/help",
    },
    bullets: [
      "入口停用表示需平台管理員處理後才可恢復服務。",
      "cutover 期間，rollback 或 coexistence 流程可深連到此狀態。",
      "白標外框會保留，方便客服確認原始合作夥伴。",
    ],
  },
  {
    id: "eligibility_required",
    routeSegment: "eligibility-required",
    label: "需要驗證",
    eyebrow: "PBK Gate",
    title: "需要資格驗證",
    summary: "此合作方案需要完成資格確認後，才會開放建立預約。",
    tone: "primary",
    guidance:
      "當使用者在缺少必要驗證上下文時進入建立預約，使用此專屬路由提示。",
    primaryAction: {
      label: "驗證資格",
      href: "/eligibility",
    },
    secondaryAction: {
      label: "返回入口",
      href: "/",
    },
    bullets: [
      "保持明確 gate，不自動開始建立預約。",
      "只有資格通過才可開啟建立預約路由。",
      "這會讓合作夥伴入口權威與既有 tenant-console 行為保持一致。",
    ],
  },
] as const;

const stateScreenMetaCopy: Record<
  PartnerBookingLocale,
  Record<
    PartnerBookingStateScreenId,
    Pick<
      StateScreenMeta,
      "label" | "title" | "summary" | "guidance" | "bullets"
    > & {
      primaryLabel: string;
      secondaryLabel: string;
    }
  >
> = {
  en: {
    eligible: {
      label: "Eligibility approved",
      title: "Eligibility approved",
      summary:
        "The partner benefit check passed and booking create may proceed.",
      guidance:
        "This route is explicit so a verified rider lands on a dedicated gate instead of being redirected silently into booking creation.",
      primaryLabel: "Continue to booking",
      secondaryLabel: "Review eligibility step",
      bullets: [
        "Use the verification record to stamp partner provenance on the booking.",
        "Free-benefit or discounted-lane rules stay backend-owned.",
        "This route is safe to deep-link from a partner bootstrap or callback flow.",
      ],
    },
    ineligible: {
      label: "Benefit denied",
      title: "Benefit eligibility denied",
      summary:
        "The issuer or partner rule rejected this rider for benefit use.",
      guidance:
        "Booking creation remains blocked. The user must fix the partner reference or continue outside the sponsored benefit lane.",
      primaryLabel: "Retry eligibility",
      secondaryLabel: "Contact support",
      bullets: [
        "Do not fall through into booking create with an ineligible result.",
        "Show issuer or partner denial context on the dedicated gate.",
        "Support can redirect the rider to a non-benefit flow if policy allows.",
      ],
    },
    manual_review: {
      label: "Manual review",
      title: "Manual review required",
      summary:
        "The eligibility adapter could not grant a clean pass and queued manual review.",
      guidance:
        "Partner booking is paused until ops or sponsor review resolves the verification outcome. This is a hard stop, not a soft warning.",
      primaryLabel: "Open support options",
      secondaryLabel: "Back to entry",
      bullets: [
        "Treat adapter timeout and offline sponsor confirmation as review work, not success.",
        "Do not present booking create actions while the review queue is unresolved.",
        "Use explicit queue language so the rider knows follow-up is pending.",
      ],
    },
    inactive: {
      label: "Entry inactive",
      title: "Partner entry inactive",
      summary:
        "This partner entry is not active, so benefit-sponsored booking is unavailable.",
      guidance:
        "The route stays visible as an explicit inactive state. It must never render live booking actions or an unbranded fallback.",
      primaryLabel: "Return to landing",
      secondaryLabel: "Call partner hotline",
      bullets: [
        "Inactive entry means platform admin action is required before service resumes.",
        "Rollback and coexistence flows may deep-link here during cutover windows.",
        "The white-label frame remains intact so support can verify the intended partner.",
      ],
    },
    eligibility_required: {
      label: "Verification required",
      title: "Eligibility verification required",
      summary:
        "This partner program requires eligibility confirmation before booking create is unlocked.",
      guidance:
        "Use this dedicated route when a rider reaches booking create without the required verification context.",
      primaryLabel: "Verify eligibility",
      secondaryLabel: "Return to landing",
      bullets: [
        "Keep the gate explicit instead of auto-starting a booking attempt.",
        "Only an eligible decision unlocks the booking create route.",
        "This keeps partner entry authority aligned with legacy tenant-console behavior.",
      ],
    },
  },
  zh: {
    eligible: {
      label: "資格通過",
      title: "資格已通過",
      summary: "合作夥伴禮遇驗證通過，可以繼續建立叫車。",
      guidance:
        "這個 route 會明確停在資格通過閘門，讓已驗證乘客進入專屬狀態，而不是被靜默導向建立行程。",
      primaryLabel: "繼續建立行程",
      secondaryLabel: "回到資格確認",
      bullets: [
        "使用驗證紀錄把 partner provenance 寫入訂單。",
        "免費禮遇或折扣規則仍以後端為權威。",
        "此 route 可安全作為 partner bootstrap 或 callback 的 deep link。",
      ],
    },
    ineligible: {
      label: "資格不符",
      title: "禮遇資格不符",
      summary: "發卡方或合作夥伴規則拒絕此乘客使用禮遇。",
      guidance:
        "建立叫車必須維持阻擋。使用者需要修正 partner reference，或改走非贊助禮遇的叫車流程。",
      primaryLabel: "重新驗證資格",
      secondaryLabel: "聯絡客服",
      bullets: [
        "不可讓不符合資格的結果直接進入建立叫車。",
        "在專屬 gate 顯示 issuer 或 partner 的拒絕脈絡。",
        "若政策允許，客服可協助轉往非禮遇流程。",
      ],
    },
    manual_review: {
      label: "人工審查",
      title: "需要人工審查",
      summary: "資格 adapter 無法乾淨通過，已排入人工審查。",
      guidance:
        "在 ops 或 sponsor 完成審查前，合作夥伴叫車要暫停。這是硬阻擋，不是一般提醒。",
      primaryLabel: "查看客服選項",
      secondaryLabel: "回到入口",
      bullets: [
        "adapter timeout 或離線 sponsor confirmation 都要視為審查工作，不可視為成功。",
        "審查佇列未解決前，不顯示建立叫車操作。",
        "用明確的佇列文案讓乘客知道後續仍在等待。",
      ],
    },
    inactive: {
      label: "入口停用",
      title: "合作夥伴入口停用",
      summary: "此合作夥伴入口尚未啟用，無法使用禮遇叫車。",
      guidance:
        "此 route 保留明確的停用狀態，不可顯示即時叫車操作，也不可退回無品牌 fallback。",
      primaryLabel: "返回入口",
      secondaryLabel: "撥打 partner 專線",
      bullets: [
        "入口停用代表需要 platform admin 操作後才能恢復服務。",
        "rollback 與共存流程可在 cutover 期間 deep-link 到這裡。",
        "白標框架需維持，讓客服可以確認預期合作夥伴。",
      ],
    },
    eligibility_required: {
      label: "需要驗證",
      title: "需要先完成資格驗證",
      summary: "此 partner program 要先確認資格，才能解鎖建立叫車。",
      guidance:
        "當乘客缺少必要驗證脈絡卻抵達建立叫車時，使用這個專屬 route 明確攔截。",
      primaryLabel: "驗證資格",
      secondaryLabel: "返回入口",
      bullets: [
        "保持 gate 明確，不要自動開始建立叫車。",
        "只有 eligible decision 才能解鎖建立叫車 route。",
        "這能讓 partner entry 權威與 legacy tenant-console 行為一致。",
      ],
    },
  },
};

const stateScreenMetaById = Object.fromEntries(
  stateScreenMeta.map((item) => [item.id, item]),
) as Record<PartnerBookingStateScreenId, StateScreenMeta>;

const phoneScreenStyle: CSSProperties = {
  width: "100%",
  maxWidth: "390px",
  minHeight: "844px",
  overflow: "hidden",
  borderRadius: "30px",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "#f4f6fb",
  boxShadow: "0 28px 60px rgba(15, 23, 42, 0.16)",
};

const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const sectionCardStyle: CSSProperties = {
  borderRadius: "20px",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255, 255, 255, 0.94)",
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)",
};

function buildScreenHref(
  basePath: string,
  screen: PartnerBookingScreenId,
): string {
  return screen === "landing" ? basePath : `${basePath}/${screen}`;
}

function screenToneStyle(
  brand: PartnerBrandTemplate,
  tone: TripItem["tone"],
): CSSProperties {
  if (tone === "success") {
    return {
      color: "#166534",
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
    };
  }

  if (tone === "accent") {
    return {
      color: brand.primaryDark,
      background: "#faf3df",
      border: "1px solid #e5d58a",
    };
  }

  if (tone === "primary") {
    return {
      color: brand.primary,
      background: brand.surface.bg,
      border: `1px solid ${brand.surface.border}`,
    };
  }

  return {
    color: "#56657f",
    background: "#f1f3f8",
    border: "1px solid #dde3ec",
  };
}

function metaForBrand(
  brand: PartnerBrandTemplate,
  locale: PartnerBookingLocale = "zh",
) {
  const remainingBenefits = 9;
  const totalBenefits = 12;
  const usedBenefits = totalBenefits - remainingBenefits;
  const en = locale === "en";
  const trips: TripItem[] = [
    {
      when: en ? "Today 14:30" : "今天 14:30",
      route: en ? "Taipei Xinyi -> Taoyuan T2" : "台北信義 -> 桃園 T2",
      state: en ? "Assigned" : "已派車",
      tone: "success",
      amount: en ? "Included" : "免費",
      benefit: `${brand.programName} #4`,
    },
    {
      when: en ? "Yesterday 09:12" : "昨天 09:12",
      route: en
        ? "Taipei Main Station -> Neihu Tech Park"
        : "台北車站 -> 內湖科技園區",
      state: en ? "Completed" : "已完成",
      tone: "neutral",
      amount: "NT$ 0",
      benefit: `${brand.programName} #3`,
    },
    {
      when: "5/2 18:45",
      route: en ? "Taipei 101 -> Songshan Airport" : "台北 101 -> 松山機場",
      state: en ? "Completed" : "已完成",
      tone: "neutral",
      amount: "NT$ 0",
      benefit: `${brand.programName} #2`,
    },
    {
      when: "4/28 07:30",
      route: en ? "Yangmingshan -> Taoyuan T1" : "陽明山 -> 桃園 T1",
      state: en ? "Completed" : "已完成",
      tone: "accent",
      amount: "NT$ 240",
      benefit: en ? "20% off after quota" : "額度後 8 折",
    },
  ];

  return {
    remainingBenefits,
    totalBenefits,
    usedBenefits,
    personName: en ? "Jason Chen" : "陳俊宏",
    riderName: en ? "Ming C." : "陳〇明",
    pickup: en
      ? "No. 100, Songren Rd., Xinyi District, Taipei"
      : "台北市信義區松仁路 100 號",
    pickupDetail: en
      ? "YAMATO Business Group · HQ lobby"
      : "大和商務集團 · HQ 大廳",
    dropoff: en ? "Taoyuan Airport Terminal 2" : "桃園機場 第二航廈",
    dropoffDetail: en ? "Departure Hall Gate 7" : "出境大廳 7 號門",
    departureTime: "2026-05-08 17:30",
    benefitId: `${brand.code}-2026-0004`,
    receiptId: "rcp_8821a912",
    bookingId: "bk_5512",
    trips,
  };
}

function copyForLocale(locale: PartnerBookingLocale) {
  if (locale === "en") {
    return {
      landingTitle: "Concierge transfer",
      landingSubtitle: (programName: string, total: number) =>
        `${programName} cardholder exclusive · ${total} included rides per year`,
      remainingTrips: "Annual rides remaining",
      servicesTitle: "Available services",
      benefitTermsTitle: "Benefit terms",
      benefitTermsBody:
        "After included rides are used, each ride still receives a 20% discount. Charges are consolidated into the card statement with no on-site payment.",
      bookNow: "Book now",
      viewTrips: "View trip history",
      linkCardTitle: "Link card",
      firstUseSubtitle: "First use · one-time confirmation",
      benefitsTitle: "Your benefits",
      cardIdentity: "Cardholder identity",
      lastFour: "Last four digits",
      annualIncludedTrips: "Annual included rides",
      discount: "Discount after quota",
      discountValue: "20% off after quota",
      serviceArea: "Service area",
      serviceAreaValue: "Taipei · Taoyuan · Hsinchu",
      consentTitle: "Authorization consent",
      consentItems: (bankName: string) => [
        "Use this card identity to create a DRTS account",
        "Share trip details required for dispatch with DRTS",
        `Agree to ${bankName} x DRTS Concierge Transfer Terms v3`,
      ],
      consentNote:
        "Full card number and security code are never sent. Only fields required for partner eligibility are retained.",
      confirmLink: "Confirm link and continue",
      later: "Later",
      bookTitle: "Create trip",
      airportSubtitle: "Airport transfer · Taoyuan T2",
      pickup: "PICKUP",
      drop: "DROP",
      departureTimeTitle: "Departure time",
      timeOptions: ["Now", "+30 min", "+1 hour"],
      estimatedDeparture: (time: string) => `Estimated departure: ${time}`,
      serviceDetailsTitle: "Service details",
      passengers: "Passengers",
      passengerCount: "1 passenger",
      luggage: "Luggage",
      luggageCount: "2 pieces",
      specialRequests: "Special requests",
      vehicleClass: "Vehicle class",
      vehicleValue: "Business car (upgrade)",
      benefitFareTitle: "Benefit and fare",
      baseFare: "Base fare",
      programBenefit: (programName: string) => `${programName} benefit`,
      amountDue: "You pay",
      free: "Included",
      annualBenefitRemaining: "Annual benefit rides remaining",
      confirmBooking: "Confirm reservation",
      confirmedTitle: "Driver assigned",
      confirmedSubtitle: "Driver arriving in 8 minutes",
      driverInitial: "C",
      driverStats: "1,243 trips · 4.86 ★",
      eta: "ETA",
      distance: "Distance",
      tripInfo: "Trip information",
      bookingNo: "Booking No.",
      benefit: "Benefit",
      rideNumber: "ride #4",
      cancelTrip: "Cancel trip",
      support: "Support",
      tripsTitle: "My trips",
      tripsSubtitle: (used: number) => `This year · ${used} rides used`,
      yearLabel: "2026",
      remainingSuffix: "remaining",
      receiptTitle: "Receipt",
      receiptSubtitle: (bookingId: string) => `${bookingId} · completed`,
      departure: "Departed",
      arrived: "Arrived",
      rideTime: "Ride time",
      rideDuration: "1 hr 12 min",
      distanceValue: "38.4 km",
      fareBase: "Fare (base)",
      airportSurcharge: "Airport surcharge",
      highwayToll: "Highway toll",
      subtotal: "Subtotal",
      paid: "Paid",
      paymentTitle: "Payment",
      paymentMethod: "Payment method",
      statementPeriod: "Statement period",
      statementPeriodValue: "2026-06 statement",
      benefitSerial: "Benefit serial",
      receiptNo: "Receipt No.",
      downloadReceipt: "Download receipt PDF",
      contactSupport: "Contact support",
      helpTitle: "Help",
      helpSubtitle: (programName: string) =>
        `${programName} cardholder hotline`,
      hotline24h: "24-hour hotline",
      faqTitle: "FAQ",
      faq: [
        [
          "How are benefit rides counted?",
          "They reset to 12 rides every New Year. Unused rides do not roll over.",
        ],
        [
          "Can I book for someone else?",
          "Yes. Enter the passenger's mobile number on the order.",
        ],
        [
          "Cancellation policy",
          "Free cancellation is available until 5 minutes before departure. Late cancellation consumes one benefit ride.",
        ],
        [
          "Can I book after quota is used?",
          "Yes. A 20% discount applies and charges are consolidated into the card statement.",
        ],
      ],
      disputeTitle: "Disputes or complaints",
      disputeBody:
        "Disputes can be raised within 30 days after trip completion. The partner concierge center and DRTS support will both be notified.",
      openDispute: "Open dispute",
      pageTitle: "CTBC reference funnel · 7 screens",
      pageDescription:
        "White-label booking flow demo for partner entry. The content below uses PBK-UI-002 brand tokens and mock data while mirroring the CTBC Partner Booking artboards.",
      programSummary: "Program summary",
      entryHost: "Entry host",
      tenantCode: "Tenant code",
      program: "Program",
      cardSuffix: "Card suffix",
      activeScreen: "Active screen",
      screenSummary: "Screen summary",
      screenCoverage: "Screen coverage",
      routeLabel: "Route",
      authoritySafeHandling: "Authority-safe handling",
      benefitFooter: (remaining: number, total: number, phone: string) =>
        `Remaining benefit ${remaining}/${total} · Hotline ${phone}`,
    };
  }

  return {
    landingTitle: "禮賓接送 Concierge",
    landingSubtitle: (programName: string, total: number) =>
      `${programName} 卡友專屬 · 全年免費 ${total} 趟`,
    remainingTrips: "本年度剩餘趟次",
    servicesTitle: "可使用的服務",
    benefitTermsTitle: "禮遇條款",
    benefitTermsBody:
      "當免費額度用完後，每趟仍享 8 折優惠。費用將與本卡帳單合併，不需現場付款。",
    bookNow: "立即叫車",
    viewTrips: "查看歷史趟次",
    linkCardTitle: "連結卡片",
    firstUseSubtitle: "第一次使用 · 一次性確認",
    benefitsTitle: "您的權益",
    cardIdentity: "持卡身份",
    lastFour: "卡號末四碼",
    annualIncludedTrips: "本年度免費趟次",
    discount: "優惠折扣",
    discountValue: "額度後 8 折",
    serviceArea: "服務範圍",
    serviceAreaValue: "台北 · 桃園 · 新竹",
    consentTitle: "授權同意",
    consentItems: (bankName: string) => [
      "使用本卡身份識別建立 DRTS 帳號",
      "與 DRTS 共享行程必要資訊",
      `同意《${bankName} x DRTS 禮賓接送服務條款 v3》`,
    ],
    consentNote:
      "不會傳送完整卡號或安全碼，只保留 partner eligibility 所需欄位。",
    confirmLink: "確認連結並繼續",
    later: "稍後",
    bookTitle: "建立行程",
    airportSubtitle: "機場接送 · 桃園 T2",
    pickup: "PICKUP",
    drop: "DROP",
    departureTimeTitle: "出發時間",
    timeOptions: ["即時", "+30 分", "+1 小時"],
    estimatedDeparture: (time: string) => `預計出發：${time}`,
    serviceDetailsTitle: "服務細節",
    passengers: "人數",
    passengerCount: "1 位",
    luggage: "行李",
    luggageCount: "2 件",
    specialRequests: "特殊需求",
    vehicleClass: "車型",
    vehicleValue: "商務車 (升級)",
    benefitFareTitle: "禮遇與費用",
    baseFare: "基本費用",
    programBenefit: (programName: string) => `${programName} 禮遇`,
    amountDue: "您將支付",
    free: "免費",
    annualBenefitRemaining: "本年度剩餘禮遇趟次",
    confirmBooking: "確認預約",
    confirmedTitle: "已派車",
    confirmedSubtitle: "駕駛將於 8 分鐘後抵達",
    driverInitial: "陳",
    driverStats: "1,243 趟 · 4.86 ★",
    eta: "預計抵達",
    distance: "距離",
    tripInfo: "行程資訊",
    bookingNo: "預約編號",
    benefit: "禮遇",
    rideNumber: "趟次 #4",
    cancelTrip: "取消行程",
    support: "客服協助",
    tripsTitle: "我的行程",
    tripsSubtitle: (used: number) => `本年度 · 已使用 ${used} 趟`,
    yearLabel: "2026 年度",
    remainingSuffix: "剩餘",
    receiptTitle: "行程明細",
    receiptSubtitle: (bookingId: string) => `${bookingId} · 已完成`,
    departure: "出發",
    arrived: "抵達",
    rideTime: "行車",
    rideDuration: "1 小時 12 分",
    distanceValue: "38.4 km",
    fareBase: "車資 (基本)",
    airportSurcharge: "機場附加",
    highwayToll: "高速公路費",
    subtotal: "小計",
    paid: "您支付",
    paymentTitle: "款項",
    paymentMethod: "付款方式",
    statementPeriod: "入帳期別",
    statementPeriodValue: "2026-06 帳單",
    benefitSerial: "禮遇序號",
    receiptNo: "收據編號",
    downloadReceipt: "下載收據 PDF",
    contactSupport: "聯絡客服",
    helpTitle: "協助",
    helpSubtitle: (programName: string) => `${programName} 卡友專線`,
    hotline24h: "24 小時專線",
    faqTitle: "常見問題",
    faq: [
      ["禮遇趟次如何計算？", "每年元旦重置 12 趟，未使用不累計。"],
      ["可以代為叫車嗎？", "可，但乘客手機需填入訂單。"],
      ["取消政策", "出發 5 分鐘前可免費取消，逾時將扣除一次禮遇。"],
      ["額度後仍可叫車嗎？", "可，享 8 折優惠並合併至本卡帳單。"],
    ],
    disputeTitle: "爭議或客訴",
    disputeBody:
      "行程結束後 30 天內可提出爭議，將同時通知 partner 禮賓中心與 DRTS 平台客服。",
    openDispute: "提出爭議",
    pageTitle: "CTBC 參考叫車流程 · 7 個畫面",
    pageDescription:
      "合作夥伴入口的白標叫車流程示範。以下內容使用 PBK-UI-002 品牌 token 與 mock data，並對齊 CTBC `Partner Booking.html` 設計稿。",
    programSummary: "方案摘要",
    entryHost: "入口網域",
    tenantCode: "租戶代碼",
    program: "方案",
    cardSuffix: "卡號末四碼",
    activeScreen: "目前畫面",
    screenSummary: "畫面摘要",
    screenCoverage: "畫面覆蓋",
    routeLabel: "Route",
    authoritySafeHandling: "權威狀態處理",
    benefitFooter: (remaining: number, total: number, phone: string) =>
      `剩餘禮遇 ${remaining}/${total} · Hotline ${phone}`,
  };
}

// Program kind drives the landing framing (design-canvas pb-screens PB_Landing +
// followup A1/A2): credit-card = 趟次, insurance = 理賠額度, travel = 團體席次,
// hotel = concierge. Derived from the brand so the shared funnel stops showing
// the credit-card copy for every partner.
type FunnelProgramKind = "card" | "insurance" | "travel" | "hotel";

function funnelProgramKind(code: string): FunnelProgramKind {
  if (code === "FUBON") return "insurance";
  if (code === "LION") return "travel";
  if (code === "GRAND") return "hotel";
  return "card";
}

function programLandingCopy(
  kind: FunnelProgramKind,
  locale: PartnerBookingLocale,
) {
  const en = locale === "en";
  const byKind = {
    card: {
      title: en ? "Concierge transfer" : "禮賓接送 Concierge",
      subtitle: (p: string, n: number) =>
        en
          ? `${p} cardholder exclusive · ${n} included rides per year`
          : `${p} 卡友專屬 · 全年免費 ${n} 趟`,
      remaining: en ? "Annual rides remaining" : "本年度剩餘趟次",
    },
    insurance: {
      title: en ? "Claim replacement mobility" : "理賠代步用車",
      subtitle: (p: string) =>
        en
          ? `${p} · replacement vehicle during the claim period`
          : `${p} · 車禍理賠期間代步服務`,
      remaining: en ? "Replacement allowance remaining" : "理賠代步額度剩餘",
    },
    travel: {
      title: en ? "Group transfer booking" : "團體接送預約",
      subtitle: (p: string) =>
        en
          ? `${p} · tour airport / hotel transfer`
          : `${p} · 旅行團機場 / 飯店接送`,
      remaining: en ? "Group seats remaining" : "本團剩餘席次",
    },
    hotel: {
      title: en ? "Concierge transfer" : "禮賓接送",
      subtitle: (p: string) =>
        en ? `${p} · hotel guest transfer` : `${p} · 飯店貴賓接送禮遇`,
      remaining: en ? "Remaining this period" : "本期剩餘禮遇",
    },
  } as const;
  return byKind[kind];
}

function PhoneHeader({
  brand,
  title,
  subtitle,
  trailing,
}: {
  brand: PartnerBrandTemplate;
  title: string;
  subtitle: string;
  trailing?: string;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 72%)`,
        color: "#ffffff",
        padding: "20px 24px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "-48px",
          top: "-36px",
          width: "220px",
          height: "220px",
          borderRadius: "999px",
          background: `radial-gradient(circle, ${brand.accent}55 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          letterSpacing: "0.16em",
          opacity: 0.84,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            background: brand.accent,
            color: brand.primaryDark,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "12px",
          }}
        >
          {brand.cardArt.badgeText}
        </span>
        {brand.bankName} x DRTS
      </div>
      <div style={{ marginTop: "16px", fontSize: "24px", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ marginTop: "6px", fontSize: "13px", opacity: 0.82 }}>
        {subtitle}
      </div>
      {trailing ? (
        <div
          style={{
            position: "absolute",
            right: "24px",
            top: "24px",
            padding: "4px 10px",
            borderRadius: "999px",
            border: "1px solid rgba(255, 255, 255, 0.24)",
            background: "rgba(255, 255, 255, 0.12)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

function PhoneCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        overflow: "hidden",
        ...style,
      }}
    >
      {title ? (
        <header
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid #f1f3f8",
            fontSize: "13px",
            fontWeight: 700,
            color: "#0e1424",
          }}
        >
          {title}
        </header>
      ) : null}
      <div style={{ padding: "16px" }}>{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px dashed #f1f3f8",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#56657f" }}>{label}</span>
      <span
        style={{
          color: "#0e1424",
          fontFamily: mono
            ? '"JetBrains Mono", ui-monospace, monospace'
            : "inherit",
          fontWeight: mono ? 600 : 500,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  brand,
  label,
  primary,
}: {
  brand: PartnerBrandTemplate;
  label: string;
  primary?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "46px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "12px",
        border: primary ? `1px solid ${brand.primary}` : "1px solid #d2d8e2",
        background: primary ? brand.primary : "#ffffff",
        color: primary ? "#ffffff" : "#0e1424",
        fontSize: "14px",
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function Chip({
  brand,
  tone,
  label,
}: {
  brand: PartnerBrandTemplate;
  tone: TripItem["tone"];
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        ...screenToneStyle(brand, tone),
      }}
    >
      {label}
    </span>
  );
}

export function isPartnerBookingScreenId(
  value: string,
): value is PartnerBookingScreenId {
  return partnerBookingScreens.includes(value as PartnerBookingScreenId);
}

export function getPartnerBookingScreenMeta(
  screen: PartnerBookingScreenId,
  locale: PartnerBookingLocale = "zh",
): ScreenMeta {
  const base = screenMetaById[screen];
  return {
    ...base,
    ...screenMetaCopy[locale][screen],
  };
}

export function getPartnerBookingArtboardAnchor(
  screen: PartnerBookingScreenId,
): string {
  return screen;
}

export function getPartnerBookingStateScreenMeta(
  screen: PartnerBookingStateScreenId,
  locale: PartnerBookingLocale = "zh",
): StateScreenMeta {
  const base = stateScreenMetaById[screen];
  const copy = stateScreenMetaCopy[locale][screen];
  return {
    ...base,
    label: copy.label,
    title: copy.title,
    summary: copy.summary,
    guidance: copy.guidance,
    bullets: copy.bullets,
    primaryAction: {
      ...base.primaryAction,
      label: copy.primaryLabel,
    },
    secondaryAction: {
      ...base.secondaryAction,
      label: copy.secondaryLabel,
    },
  };
}

export function getPartnerBookingStateHref(
  basePath: string,
  screen: PartnerBookingStateScreenId,
): string {
  return `${basePath}/${getPartnerBookingStateScreenMeta(screen).routeSegment}`;
}

function appendQueryString(href: string, persistentQuery?: string) {
  if (!persistentQuery) {
    return href;
  }
  return `${href}${href.includes("?") ? "&" : "?"}${persistentQuery}`;
}

export function PartnerBookingPhoneScreen({
  brand,
  screen,
  locale = "zh",
}: {
  brand: PartnerBrandTemplate;
  screen: PartnerBookingScreenId;
  locale?: PartnerBookingLocale;
}) {
  const demo = metaForBrand(brand, locale);
  const copy = copyForLocale(locale);
  const landing = programLandingCopy(funnelProgramKind(brand.code), locale);
  const serviceItems = serviceItemsForLocale(locale);
  const benefitWidth = `${
    (demo.remainingBenefits / demo.totalBenefits) * 100
  }%`;

  let content: ReactNode;

  if (screen === "landing") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={landing.title}
          subtitle={landing.subtitle(brand.programName, demo.totalBenefits)}
          trailing="EXCLUSIVE"
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "50px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: "5px",
                    bottom: "5px",
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: brand.accent,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  •••• •••• •••• {brand.cardArt.lastFour}
                </div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  {demo.riderName} · {brand.programName}
                </div>
              </div>
              <Chip brand={brand} tone="success" label="eligible" />
            </div>
            <div
              style={{
                marginTop: "12px",
                borderRadius: "12px",
                background: "#f1f3f8",
                padding: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: "11px", color: "#56657f" }}>
                  {landing.remaining}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  <b style={{ fontSize: "18px" }}>{demo.remainingBenefits}</b> /{" "}
                  {demo.totalBenefits}
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  marginTop: "8px",
                  borderRadius: "999px",
                  background: "#dde3ec",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: benefitWidth,
                    height: "100%",
                    background: brand.accent,
                  }}
                />
              </div>
            </div>
          </PhoneCard>

          <PhoneCard title={copy.servicesTitle}>
            {serviceItems.map(([title, detail, tag], index) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom:
                    index < 2 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: `${brand.primary}12`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "4px",
                      background: brand.primary,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#56657f" }}>
                    {detail}
                  </div>
                </div>
                <Chip brand={brand} tone="primary" label={tag} />
              </div>
            ))}
          </PhoneCard>

          <PhoneCard
            style={{
              background: "linear-gradient(135deg, #faf3df 0%, #fffdf5 100%)",
              borderColor: "#e5d58a",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
              <div
                style={{
                  width: "4px",
                  alignSelf: "stretch",
                  borderRadius: "999px",
                  background: brand.accent,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    color: brand.primaryDark,
                  }}
                >
                  {copy.benefitTermsTitle}
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "11px",
                    lineHeight: 1.65,
                    color: "#56657f",
                  }}
                >
                  {copy.benefitTermsBody}
                </div>
              </div>
            </div>
          </PhoneCard>

          <ActionButton brand={brand} label={copy.bookNow} primary />
          <ActionButton brand={brand} label={copy.viewTrips} />
        </div>
      </>
    );
  } else if (screen === "eligibility") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.linkCardTitle}
          subtitle={copy.firstUseSubtitle}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard title={copy.benefitsTitle}>
            <DetailRow label={copy.cardIdentity} value={brand.programName} />
            <DetailRow
              label={copy.lastFour}
              value={brand.cardArt.lastFour}
              mono
            />
            <DetailRow
              label={copy.annualIncludedTrips}
              value={`${demo.totalBenefits} ${locale === "en" ? "rides" : "趟"}`}
              mono
            />
            <DetailRow label={copy.discount} value={copy.discountValue} />
            <DetailRow label={copy.serviceArea} value={copy.serviceAreaValue} />
          </PhoneCard>
          <PhoneCard title={copy.consentTitle}>
            {copy.consentItems(brand.bankName).map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom:
                    index < 2 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    marginTop: "2px",
                    borderRadius: "5px",
                    background: brand.primary,
                    border: `2px solid ${brand.primary}`,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700 }}>
                    {item}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#56657f",
                      marginTop: "2px",
                    }}
                  >
                    {copy.consentNote}
                  </div>
                </div>
              </div>
            ))}
          </PhoneCard>
          <div style={{ display: "grid", gap: "8px" }}>
            <ActionButton brand={brand} label={copy.confirmLink} primary />
            <ActionButton brand={brand} label={copy.later} />
          </div>
        </div>
      </>
    );
  } else if (screen === "book") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.bookTitle}
          subtitle={copy.airportSubtitle}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div
              style={{
                paddingBottom: "14px",
                borderBottom: "1px solid #f1f3f8",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "999px",
                    background: brand.primary,
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#56657f",
                  }}
                >
                  {copy.pickup}
                </span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                {demo.pickup}
              </div>
              <div
                style={{ marginTop: "2px", fontSize: "11px", color: "#56657f" }}
              >
                {demo.pickupDetail}
              </div>
            </div>
            <div style={{ paddingTop: "14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "2px",
                    background: brand.accent,
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#56657f",
                  }}
                >
                  {copy.drop}
                </span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                {demo.dropoff}
              </div>
              <div
                style={{ marginTop: "2px", fontSize: "11px", color: "#56657f" }}
              >
                {demo.dropoffDetail}
              </div>
            </div>
          </PhoneCard>
          <PhoneCard title={copy.departureTimeTitle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {copy.timeOptions.map((option, index) => (
                <div
                  key={option}
                  style={{
                    borderRadius: "10px",
                    padding: "10px 8px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: index === 1 ? brand.primary : "#0e1424",
                    border:
                      index === 1
                        ? `2px solid ${brand.primary}`
                        : "1px solid #d2d8e2",
                    background: index === 1 ? `${brand.primary}12` : "#ffffff",
                  }}
                >
                  {option}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: "10px",
                borderRadius: "10px",
                background: "#f1f3f8",
                padding: "10px",
                fontSize: "12px",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              {copy.estimatedDeparture(demo.departureTime)}
            </div>
          </PhoneCard>
          <PhoneCard title={copy.serviceDetailsTitle}>
            <DetailRow label={copy.passengers} value={copy.passengerCount} />
            <DetailRow label={copy.luggage} value={copy.luggageCount} />
            <DetailRow label={copy.specialRequests} value="-" />
            <DetailRow label={copy.vehicleClass} value={copy.vehicleValue} />
          </PhoneCard>
          <PhoneCard
            title={copy.benefitFareTitle}
            style={{
              background: "linear-gradient(180deg, #faf3df 0%, #fffdf5 100%)",
              borderColor: "#e5d58a",
            }}
          >
            <DetailRow label={copy.baseFare} value="NT$ 1,580" mono />
            <DetailRow
              label={copy.programBenefit(brand.programName)}
              value="-NT$ 1,580"
              mono
            />
            <DetailRow label={copy.amountDue} value={copy.free} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "10px",
                borderRadius: "10px",
                background: "#ffffff",
                padding: "10px",
              }}
            >
              <Chip
                brand={brand}
                tone="accent"
                label={`${demo.remainingBenefits} / ${demo.totalBenefits} ${locale === "en" ? "rides" : "趟"}`}
              />
              <span style={{ fontSize: "11px", color: "#56657f" }}>
                {copy.annualBenefitRemaining}
              </span>
            </div>
          </PhoneCard>
          <ActionButton brand={brand} label={copy.confirmBooking} primary />
        </div>
      </>
    );
  } else if (screen === "confirmed") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.confirmedTitle}
          subtitle={copy.confirmedSubtitle}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "999px",
                  background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})`,
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: 800,
                }}
              >
                {copy.driverInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 800 }}>
                  {demo.personName}
                </div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  {copy.driverStats}
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "11px",
                    color: brand.primary,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  Toyota Prius a · ARJ-3120
                </div>
              </div>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  background: brand.primary,
                }}
              />
            </div>
          </PhoneCard>
          <PhoneCard style={{ padding: 0 }}>
            <div
              style={{
                height: "180px",
                background: "linear-gradient(180deg, #dde5f0 0%, #c7d7f0 100%)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 360 180"
                style={{ position: "absolute", inset: 0 }}
              >
                <path
                  d="M0,120 Q80,100 160,110 T360,90"
                  stroke="#a5b4fc"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="4 4"
                />
                <path
                  d="M40,140 L100,100 L180,90 L260,70 L320,40"
                  stroke={brand.primary}
                  strokeWidth="3"
                  fill="none"
                />
                <circle cx="40" cy="140" r="6" fill={brand.primary} />
                <circle
                  cx="320"
                  cy="40"
                  r="6"
                  fill={brand.accent}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <circle
                  cx="180"
                  cy="90"
                  r="9"
                  fill={brand.primary}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div
              style={{
                padding: "16px",
                display: "flex",
                alignItems: "baseline",
                gap: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  {copy.eta}
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  8{" "}
                  <span style={{ fontSize: "12px", color: "#56657f" }}>
                    min
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  {copy.distance}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  2.4 km
                </div>
              </div>
              <Chip brand={brand} tone="success" label={copy.confirmedTitle} />
            </div>
          </PhoneCard>
          <PhoneCard title={copy.tripInfo}>
            <DetailRow label={copy.bookingNo} value={demo.bookingId} mono />
            <DetailRow
              label={copy.benefit}
              value={`${brand.programName} · ${copy.rideNumber}`}
            />
            <DetailRow label={copy.vehicleClass} value={copy.vehicleValue} />
            <DetailRow label={copy.amountDue} value={copy.free} />
          </PhoneCard>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <ActionButton brand={brand} label={copy.cancelTrip} />
            <ActionButton brand={brand} label={copy.support} />
          </div>
        </div>
      </>
    );
  } else if (screen === "trips") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.tripsTitle}
          subtitle={copy.tripsSubtitle(demo.usedBenefits)}
        />
        <div style={{ padding: "16px" }}>
          <PhoneCard>
            <div
              style={{
                margin: "-16px -16px 16px",
                padding: "14px 16px",
                background: "linear-gradient(180deg, #faf3df, #fffdf5)",
                borderBottom: "1px solid #e5d58a",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "#56657f",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {copy.yearLabel}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  <b style={{ fontSize: "22px" }}>{demo.remainingBenefits}</b> /{" "}
                  {demo.totalBenefits} {copy.remainingSuffix}
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  marginTop: "8px",
                  borderRadius: "999px",
                  background: "#ffffff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: benefitWidth,
                    height: "100%",
                    background: brand.accent,
                  }}
                />
              </div>
            </div>
            {demo.trips.map((trip, index) => (
              <div
                key={`${trip.when}-${trip.route}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 0",
                  borderBottom:
                    index < demo.trips.length - 1
                      ? "1px solid #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    {trip.route}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "11px",
                      color: "#56657f",
                    }}
                  >
                    {trip.when} · {trip.benefit}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Chip brand={brand} tone={trip.tone} label={trip.state} />
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    {trip.amount}
                  </div>
                </div>
              </div>
            ))}
          </PhoneCard>
        </div>
      </>
    );
  } else if (screen === "receipt") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.receiptTitle}
          subtitle={copy.receiptSubtitle(demo.bookingId)}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div
              style={{
                paddingBottom: "12px",
                borderBottom: "1px dashed #e5e7eb",
              }}
            >
              <DetailRow label={copy.departure} value="14:30:11" mono />
              <DetailRow label={copy.arrived} value="15:42:27" mono />
              <DetailRow label={copy.rideTime} value={copy.rideDuration} />
              <DetailRow
                label={copy.distance}
                value={copy.distanceValue}
                mono
              />
            </div>
            <div style={{ paddingTop: "12px" }}>
              <DetailRow label={copy.fareBase} value="NT$ 1,420" mono />
              <DetailRow label={copy.airportSurcharge} value="NT$ 100" mono />
              <DetailRow label={copy.highwayToll} value="NT$ 60" mono />
              <DetailRow label={copy.subtotal} value="NT$ 1,580" mono />
              <div style={{ marginTop: "8px" }}>
                <DetailRow
                  label={copy.programBenefit(brand.programName)}
                  value="-NT$ 1,580"
                  mono
                />
                <DetailRow label={copy.paid} value="NT$ 0" mono />
              </div>
            </div>
          </PhoneCard>
          <PhoneCard
            title={copy.paymentTitle}
            style={{
              background: "linear-gradient(180deg, #faf3df, #fffdf5)",
              borderColor: "#e5d58a",
            }}
          >
            <DetailRow
              label={copy.paymentMethod}
              value={`${brand.programName} ••${brand.cardArt.lastFour}`}
              mono
            />
            <DetailRow
              label={copy.statementPeriod}
              value={copy.statementPeriodValue}
            />
            <DetailRow label={copy.benefitSerial} value={demo.benefitId} mono />
            <DetailRow label={copy.receiptNo} value={demo.receiptId} mono />
          </PhoneCard>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <ActionButton brand={brand} label={copy.downloadReceipt} />
            <ActionButton brand={brand} label={copy.contactSupport} />
          </div>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title={copy.helpTitle}
          subtitle={copy.helpSubtitle(brand.programName)}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard
            style={{
              background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
              color: "#ffffff",
              borderColor: "transparent",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                opacity: 0.72,
                letterSpacing: "0.1em",
              }}
            >
              {copy.hotline24h}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "28px",
                fontWeight: 800,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              {brand.hotline.phone}
            </div>
            <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.82 }}>
              {brand.hotline.note}
            </div>
          </PhoneCard>
          <PhoneCard title={copy.faqTitle}>
            {copy.faq.map(([question, answer], index) => (
              <div
                key={question}
                style={{
                  padding: "10px 0",
                  borderBottom:
                    index < 3 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  {question}
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "#56657f",
                  }}
                >
                  {answer}
                </div>
              </div>
            ))}
          </PhoneCard>
          <PhoneCard title={copy.disputeTitle}>
            <div
              style={{
                marginBottom: "10px",
                fontSize: "12px",
                lineHeight: 1.6,
                color: "#56657f",
              }}
            >
              {copy.disputeBody}
            </div>
            <ActionButton brand={brand} label={copy.openDispute} />
          </PhoneCard>
        </div>
      </>
    );
  }

  return (
    <div style={phoneScreenStyle}>
      <div
        style={{
          height: "26px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
        }}
      >
        <div
          style={{
            width: "110px",
            height: "6px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.28)",
          }}
        />
      </div>
      {content}
    </div>
  );
}

export function PartnerBookingReferenceFunnel({
  brand,
  activeScreen,
  basePath,
  locale = "zh",
}: {
  brand: PartnerBrandTemplate;
  activeScreen: PartnerBookingScreenId;
  basePath: string;
  locale?: PartnerBookingLocale;
}) {
  const demo = metaForBrand(brand, locale);
  const copy = copyForLocale(locale);
  const activeMeta = getPartnerBookingScreenMeta(activeScreen, locale);
  const localizedScreenMeta = screenMetaForLocale(locale);

  return (
    <div style={pageStackStyle}>
      <section
        style={{
          ...sectionCardStyle,
          padding: "24px",
          background: `linear-gradient(135deg, ${brand.surface.bg} 0%, #ffffff 58%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "640px" }}>
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: brand.primary,
                fontWeight: 800,
              }}
            >
              {brand.displayName}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.15,
                color: "#0e1424",
              }}
            >
              {copy.pageTitle}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.7,
                color: "#56657f",
              }}
            >
              {copy.pageDescription}
            </p>
          </div>

          <div
            style={{
              minWidth: "240px",
              borderRadius: "18px",
              border: `1px solid ${brand.surface.border}`,
              background: "rgba(255,255,255,0.82)",
              padding: "16px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#56657f",
                fontWeight: 700,
              }}
            >
              {copy.programSummary}
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 800, color: "#0e1424" }}
            >
              {brand.programName}
            </div>
            <div style={{ fontSize: "13px", color: "#56657f" }}>
              {copy.benefitFooter(
                demo.remainingBenefits,
                demo.totalBenefits,
                brand.hotline.phone,
              )}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          ...sectionCardStyle,
          padding: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {partnerBookingScreens.map((screen) => {
          const meta = getPartnerBookingScreenMeta(screen, locale);
          const isActive = screen === activeScreen;
          return (
            <a
              key={screen}
              href={buildScreenHref(basePath, screen)}
              style={{
                textDecoration: "none",
                display: "grid",
                gap: "4px",
                minWidth: "126px",
                padding: "12px 14px",
                borderRadius: "14px",
                border: isActive
                  ? `1px solid ${brand.primary}`
                  : "1px solid rgba(15, 23, 42, 0.10)",
                background: isActive ? `${brand.primary}10` : "#ffffff",
                color: "#0e1424",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: isActive ? brand.primary : "#64748b",
                }}
              >
                {meta.eyebrow}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>
                {meta.label}
              </span>
            </a>
          );
        })}
      </section>

      <section
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(390px, 420px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {copy.activeScreen}
              </div>
              <div
                style={{ fontSize: "28px", fontWeight: 800, color: "#0e1424" }}
              >
                {activeMeta.label}
              </div>
              <div
                style={{ fontSize: "14px", lineHeight: 1.7, color: "#56657f" }}
              >
                {activeMeta.summary}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              {[
                [copy.entryHost, brand.host],
                [copy.tenantCode, brand.tenantCode],
                [copy.program, brand.cardArt.programLabel],
                [copy.cardSuffix, brand.cardArt.lastFour],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    borderRadius: "16px",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    background: "#f8fafc",
                    padding: "14px 16px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#64748b",
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0e1424",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {copy.screenCoverage}
              </div>
              {localizedScreenMeta.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px minmax(0, 1fr)",
                    gap: "12px",
                    alignItems: "start",
                    paddingTop: index === 0 ? 0 : "6px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      background:
                        item.id === activeScreen
                          ? brand.primary
                          : "rgba(15, 23, 42, 0.08)",
                      color: item.id === activeScreen ? "#ffffff" : "#334155",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#0e1424",
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "#56657f",
                      }}
                    >
                      {item.summary}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div style={{ justifySelf: "center" }}>
          <PartnerBookingPhoneScreen
            brand={brand}
            screen={activeScreen}
            locale={locale}
          />
        </div>
      </section>
    </div>
  );
}

export function PartnerBookingStateGate({
  brand,
  state,
  basePath,
  persistentQuery,
  locale = "zh",
}: {
  brand: PartnerBrandTemplate;
  state: PartnerBookingStateScreenId;
  basePath: string;
  persistentQuery?: string;
  locale?: PartnerBookingLocale;
}) {
  const copy = copyForLocale(locale);
  const meta = getPartnerBookingStateScreenMeta(state, locale);

  return (
    <div style={pageStackStyle}>
      <section
        style={{
          ...sectionCardStyle,
          padding: "24px",
          background: `linear-gradient(135deg, ${brand.surface.bg} 0%, #ffffff 58%)`,
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: brand.primary,
              fontWeight: 800,
            }}
          >
            {brand.displayName}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              lineHeight: 1.15,
              color: "#0e1424",
            }}
          >
            {meta.title}
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: "760px",
              fontSize: "14px",
              lineHeight: 1.7,
              color: "#56657f",
            }}
          >
            {meta.guidance}
          </p>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(390px, 420px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {meta.eyebrow}
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  lineHeight: 1.25,
                  color: "#0e1424",
                }}
              >
                {meta.label}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  lineHeight: 1.7,
                  color: "#56657f",
                }}
              >
                {meta.summary}
              </p>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <PhoneCard>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <Chip
                    brand={brand}
                    tone={meta.tone}
                    label={meta.routeSegment}
                  />
                  <div style={{ fontSize: "13px", color: "#56657f" }}>
                    {copy.routeLabel}:{" "}
                    <code>{getPartnerBookingStateHref(basePath, state)}</code>
                  </div>
                </div>
              </PhoneCard>

              <PhoneCard title={copy.authoritySafeHandling}>
                {meta.bullets.map((bullet, index) => (
                  <div
                    key={bullet}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "10px 0",
                      borderBottom:
                        index < meta.bullets.length - 1
                          ? "1px dashed #f1f3f8"
                          : "1px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        marginTop: "6px",
                        borderRadius: "999px",
                        background: brand.primary,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.65,
                        color: "#0e1424",
                      }}
                    >
                      {bullet}
                    </div>
                  </div>
                ))}
              </PhoneCard>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <a
                  href={appendQueryString(
                    `${basePath}${meta.primaryAction.href}`,
                    persistentQuery,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <ActionButton
                    brand={brand}
                    label={meta.primaryAction.label}
                    primary
                  />
                </a>
                <a
                  href={appendQueryString(
                    `${basePath}${meta.secondaryAction.href}`,
                    persistentQuery,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <ActionButton
                    brand={brand}
                    label={meta.secondaryAction.label}
                  />
                </a>
              </div>
            </div>
          </section>
        </div>

        <div style={{ position: "sticky", top: "16px" }}>
          <PartnerBookingPhoneScreen
            brand={brand}
            screen={state === "eligible" ? "eligibility" : "landing"}
            locale={locale}
          />
        </div>
      </section>
    </div>
  );
}
